# Quickstart: @car-auctions/shared

**Package**: `@car-auctions/shared`
**Requires**: Node.js 20+, TypeScript 5+

## Install

From the monorepo root (npm workspaces):

```bash
npm install
```

Or reference directly from another workspace package:

```json
{
  "dependencies": {
    "@car-auctions/shared": "workspace:*"
  }
}
```

## Usage Examples

### Import shared types

```typescript
import type { AuctionListing, DealAnalysis, RiskFlag, ToolResponse } from '@car-auctions/shared';
```

### Normalize auction data

```typescript
import { normalizeCopart, normalizeIaai } from '@car-auctions/shared';

const copartListing: AuctionListing = normalizeCopart(rawCopartResponse);
const iaaiListing: AuctionListing = normalizeIaai(rawIaaiResponse);

// Both produce identical AuctionListing shapes — can be compared, merged, sorted
```

### Validate and decode a VIN

```typescript
import { validateVin, decodeVin, SqliteVinCache } from '@car-auctions/shared';

const { valid, error } = validateVin('1HGCM82633A004352');
if (!valid) {
  console.error(error); // "VIN contains invalid character: O"
}

// With SQLite caching (90-day TTL) using the default path: data/vin-cache.sqlite
const cache = new SqliteVinCache();
const specs = await decodeVin('1HGCM82633A004352', { cache });
console.log(specs.year, specs.make, specs.model); // 2003 HONDA Accord
```

### Bootstrap an MCP server

```typescript
import { createMcpServer } from '@car-auctions/shared';

const server = await createMcpServer({
  name: 'copart-scraper-mcp',
  version: '1.0.0',
  // transport defaults to process.env.TRANSPORT || 'stdio'
});

// Register tools on the server
server.tool('copart_search', schema, handler);
```

### Use the browser pool

```typescript
import { BrowserPool } from '@car-auctions/shared';

const pool = new BrowserPool({ maxContexts: 3 });
const browserContext = await pool.acquire();

try {
  const page = await browserContext.context.newPage();
  await page.goto('https://www.copart.com', { timeout: 30_000 });
  // ... scrape
} finally {
  await browserContext.release();
}

// On shutdown
await pool.shutdown();
```

### Enqueue prioritized requests

```typescript
import { PriorityQueue } from '@car-auctions/shared';

const queue = new PriorityQueue();

// Critical request — bypasses queue ordering AND rate limit, processed in <100ms
await queue.enqueue({
  priority: 'critical',
  execute: async () => { /* urgent watchlist refresh */ },
});

// Background request — up to 30s wait
await queue.enqueue({
  priority: 'background',
  execute: async () => { /* cache warm-up */ },
});

// Graceful shutdown
await queue.shutdown();
```

### Initialize tracing

```typescript
import { initTracing, withSpan } from '@car-auctions/shared';

// Call once at startup (no-op if OTEL_EXPORTER_OTLP_ENDPOINT is unset)
initTracing({ serviceName: 'copart-scraper-mcp' });

// Wrap tool calls in spans
const result = await withSpan('copart.search', {
  'tool.name': 'copart_search',
  'tool.source': 'copart',
}, async () => {
  return await performSearch(params);
});
```

### Use error classes

```typescript
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';

// Throw typed errors from tool handlers
if (response.status === 429) {
  throw new RateLimitError('Rate limit exceeded', { retryAfterMs: 5000 });
}

if (isCaptchaPage(page)) {
  throw new CaptchaError('CAPTCHA detected on Copart');
}

// Serialize for MCP response
try {
  // ...
} catch (err) {
  if (
    typeof err === 'object' &&
    err !== null &&
    'toToolError' in err &&
    typeof (err as { toToolError: unknown }).toToolError === 'function'
  ) {
    return { success: false, error: (err as { toToolError: () => unknown }).toToolError(), cached: false, stale: false, timestamp: new Date().toISOString() };
  }
}
```

## Build & Test

```bash
# From monorepo root
npm run build --workspace=packages/shared
npm run test --workspace=packages/shared

# Or from packages/shared/
cd packages/shared
npx vitest run
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `TRANSPORT` | No | `stdio` | MCP transport mode (`stdio`, `sse`, `websocket`) |
| `PORT` | No | `3000` | HTTP port for SSE transport |
| `WS_PORT` | No | `3001` | WebSocket port |
| `PROXY_URL` | No | — | Proxy server for browser pool |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | — | OTLP collector endpoint (enables tracing) |
