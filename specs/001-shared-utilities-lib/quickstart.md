# Quickstart — @car-auctions/shared

**Feature**: `001-shared-utilities-lib`  
**Package**: `packages/shared/`  
**npm name**: `@car-auctions/shared`

---

## Prerequisites

- Node.js 20+
- `npm` workspaces (root `package.json` already configures `"workspaces": ["packages/*", "alerts"]`)
- Playwright browsers pre-installed (`npx playwright install chromium`)

---

## Package Setup

### 1. Create the package directory

```bash
mkdir -p packages/shared/src/types packages/shared/src/normalizer \
  packages/shared/src/vin-decoder packages/shared/tests/fixtures packages/shared/data
```

### 2. `packages/shared/package.json`

```json
{
  "name": "@car-auctions/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc --project tsconfig.json",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "@opentelemetry/auto-instrumentations-node": "^0.56.0",
    "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "better-sqlite3": "^9.4.3",
    "playwright": "^1.44.0",
    "playwright-extra": "^4.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2",
    "sharp": "^0.33.3",
    "ws": "^8.17.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.10",
    "@types/ws": "^8.5.10",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

### 3. `packages/shared/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "composite": true,
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["tests", "dist", "node_modules"]
}
```

### 4. Root `.gitignore` additions

```
packages/shared/data/
packages/shared/dist/
```

### 5. Add workspace reference in consuming packages

In e.g. `packages/copart-scraper-mcp/package.json`:

```json
{
  "dependencies": {
    "@car-auctions/shared": "*"
  }
}
```

Then from the repo root:

```bash
npm install   # resolves workspace symlink
```

---

## Module Usage Examples

### Shared Types

```typescript
import type {
  AuctionListing,
  DealAnalysis,
  RiskFlag,
  ToolResponse,
  VINDecodeResult,
  PriorityLevel,
} from '@car-auctions/shared';

// Use in tool handler return types
function buildResponse<T>(data: T): ToolResponse<T> {
  return {
    success: true,
    data,
    cached: false,
    stale: false,
    timestamp: new Date().toISOString(),
  };
}
```

### Auction Normalizer

```typescript
import { normalizeCopart, normalizeIaai } from '@car-auctions/shared';

// In packages/copart-scraper-mcp/src/scraper/parser.ts
const listing: AuctionListing = normalizeCopart(rawApiResponse);

// In packages/iaai-scraper-mcp/src/scraper/parser.ts
const listing: AuctionListing = normalizeIaai(rawApiResponse);

// Both produce structurally identical AuctionListing shapes:
// listing.source, listing.lot_number, listing.has_keys (always boolean), etc.
```

### VIN Decoder

```typescript
import { decodeVin, validateVin } from '@car-auctions/shared';
// SqliteVinCache is an internal implementation — see packages/shared/src/vin-decoder/sqlite-cache.ts
// Access via the VinCache interface:
import type { VinCache } from '@car-auctions/shared';

// Quick validation (no network call)
if (!validateVin(vin)) {
  throw new ScraperError(`Invalid VIN: ${vin}`, { code: 'VALIDATION_ERROR' });
}

// Full decode with SQLite caching
// Note: SqliteVinCache is instantiated per package that needs it
const specs: VINDecodeResult = await decodeVin(vin, {
  cache: myVinCacheInstance,  // implements VinCache interface
  ttlMs: 90 * 24 * 60 * 60 * 1000,  // 90 days
});

// Without caching (e.g. in tests)
const specs = await decodeVin(vin);
```

### MCP Server Bootstrap

```typescript
// packages/copart-scraper-mcp/src/index.ts
import { createMcpServer, initTracing } from '@car-auctions/shared';
import { registerTools } from './server.js';

// Initialize tracing first (no-op when OTEL_EXPORTER_OTLP_ENDPOINT not set)
initTracing('copart-scraper-mcp');

await createMcpServer({
  name: 'copart-scraper',
  version: '1.0.0',
  capabilities: { tools: {} },
  registerTools,
  // Transport selected from TRANSPORT env var (stdio | sse | websocket)
  // Falls back to 'stdio' if not set
});
```

**Environment variables for transport selection**:

```bash
# stdio (default — for Claude Desktop)
TRANSPORT=stdio node dist/index.js

# SSE (for remote/claude.ai)
TRANSPORT=sse PORT=3000 node dist/index.js

# WebSocket (for real-time dashboards)
TRANSPORT=websocket WS_PORT=3001 node dist/index.js
```

### Browser Pool

```typescript
// packages/copart-scraper-mcp/src/scraper/browser.ts
import { BrowserPool } from '@car-auctions/shared';

// Per-process singleton (scrapers share one browser instance when co-located)
export const pool = new BrowserPool({
  maxConcurrency: 3,
  headless: true,
  navigationTimeoutMs: 30_000,  // Required by Constitution Pillar IV Rule 5
  actionDelayMinMs: 2_000,      // Required random delay (stealth)
  actionDelayMaxMs: 5_000,
  // proxyUrl defaults to process.env.PROXY_URL automatically
});

// Usage in tool handlers
const ctx = await pool.getContext();
try {
  const page = await ctx.newPage();
  await page.goto('https://www.copart.com/lot/12345678', { timeout: 30_000 });
  // ... scrape ...
} finally {
  await pool.releaseContext(ctx);
}

// Graceful shutdown (idempotent)
process.on('SIGTERM', () => pool.shutdown());
```

### Priority Queue

```typescript
// packages/copart-scraper-mcp/src/utils/rate-limiter.ts
import { PriorityQueue } from '@car-auctions/shared';
import type { PriorityLevel } from '@car-auctions/shared';

// Per-process singleton
export const queue = new PriorityQueue({
  rateLimitIntervalMs: 3_000,     // 1 req/3s (Constitution Pillar IV Rule 1)
  starvationThresholdMs: 60_000,  // Low/background guaranteed slot per 60s
});

// Wrap all scraper calls through the queue
export async function scrape<T>(
  priority: PriorityLevel,
  operation: () => Promise<T>
): Promise<T> {
  return queue.enqueue(priority, operation);
}

// Usage in tools/search.ts
const results = await scrape('normal', () => copartClient.search(params));

// Usage in watchlist refresh (high priority)
const listing = await scrape('high', () => copartClient.getListing(lotId));

// Critical bypass for active-bid lot (bypasses queue ordering but still rate-limited)
const urgent = await scrape('critical', () => copartClient.getListing(activeLotId));
```

### OpenTelemetry Tracing

```typescript
// packages/copart-scraper-mcp/src/tools/search.ts
import { withSpan } from '@car-auctions/shared';

export async function copartSearch(params: SearchParams) {
  return withSpan(
    'copart.search',                    // Span name: {package}.{operation}
    {
      'tool.name': 'copart_search',     // Required attribute (Constitution Pillar VI Rule 1)
      'tool.source': 'copart',
    },
    async () => {
      const cached = await cache.get(params);
      if (cached) {
        return withSpan('cache.read', { 'cache.hit': true }, async () => cached);
      }

      const result = await scrape('normal', () => scraper.search(params));
      await cache.set(params, result);
      return result;
    }
  );
}
```

### Error Classes

```typescript
import {
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  AnalysisError,
} from '@car-auctions/shared';

// Constitution Pillar V Rule 3 — error→condition mapping:

// HTTP 429 or 403
throw new RateLimitError('Copart returned 429', { retryAfterMs: 30_000 });

// CAPTCHA detected
throw new CaptchaError('Copart CAPTCHA challenge on search page');

// Playwright crash / navigation timeout / 5xx
throw new ScraperError('Navigation timeout on lot page', { code: 'TIMEOUT' });

// SQLite failure
throw new CacheError('Failed to write listing cache');

// Analysis pipeline failure
throw new AnalysisError('Deal scorer produced NaN for lot 12345');
```

---

## Running Tests

```bash
# Run all shared tests
cd packages/shared
npm test

# Run with coverage (must meet ≥80% branch threshold)
npm run test:coverage

# Watch mode during development
npm run test:watch
```

### Test Structure

```
tests/
├── normalizer.test.ts       # Copart + IAAI fixture data → AuctionListing
├── vin-decoder.test.ts      # validateVin(), decodeVin() with mocked NHTSA
├── priority-queue.test.ts   # Preemption, starvation, token bucket
├── error-types.test.ts      # Each error class → correct MCP error response
└── fixtures/
    ├── copart-listing.json  # Representative raw Copart API response
    └── iaai-listing.json    # Representative raw IAAI API response
```

**Test principles** (Constitution Pillar III):
- Fixture files MUST exist before parser/normalizer implementation begins
- Live network tests use `{ skip: !process.env.LIVE_TEST }` — never run in CI
- All 5 error types must have at least one test proving correct structured error response
- VIN validation must cover: valid VIN, invalid length, containing I/O/Q, edge cases

---

## Build & Type-Check

```bash
# From repo root — type-check all packages
npx tsc --build

# Or from packages/shared specifically
cd packages/shared && npm run typecheck

# Build for distribution
npm run build
```

---

## Environment Variables Used

| Variable | Used By | Description |
|----------|---------|-------------|
| `TRANSPORT` | `mcp-helpers.ts` | Transport mode: `stdio` \| `sse` \| `websocket` |
| `PORT` | `mcp-helpers.ts` | HTTP port for SSE transport (default: 3000) |
| `WS_PORT` | `mcp-helpers.ts` | WebSocket port (default: 3001) |
| `PROXY_URL` | `browser-pool.ts` | Proxy for all browser traffic |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `tracing.ts` | OTel collector URL; omit for no-op |
| `NODE_ENV` | `normalizer/codes.ts` | Suppresses unknown code warnings in production |

---

## Key Design Decisions (Summary)

| Decision | Rationale |
|----------|-----------|
| Single barrel export (`src/index.ts`) | NFR-001: tree-shakeable; consumers don't depend on internal structure |
| `VinCache` interface, not concrete class | Consumers inject their own cache (per-package SQLite) |
| `BrowserPool` is not a singleton | Exported class; consuming package decides lifecycle |
| `PriorityQueue` is not a singleton | Exported class; gateway can share one across in-process scrapers |
| `initTracing` is idempotent | Multiple callers (e.g. gateway + scraper) don't double-initialize SDK |
| Error constructors are simple | Callers use the 5 typed classes; no factory functions needed |
