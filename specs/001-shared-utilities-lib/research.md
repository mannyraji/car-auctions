# Phase 0: Research Findings — Shared Utilities Library

**Feature**: `001-shared-utilities-lib`  
**Date**: 2026-04-07  
**Purpose**: Resolve all NEEDS CLARIFICATION items identified in the Technical Context before Phase 1 design begins.

---

## 1. NHTSA vPIC API — Response Format & Field Mapping

### Decision
Use the `DecodeVinValues/{vin}?format=json` endpoint. Parse the returned flat-object array for the key fields needed to populate `VINDecodeResult`.

### Rationale
The NHTSA vPIC (Vehicle Product Information Catalog) is the only free, authoritative VIN decoding service in the US with no authentication requirement. The `DecodeVinValues` endpoint returns a flat JSON structure — a single-element array containing one object with ~100+ string fields — which is straightforward to parse without additional schema libraries.

### API Details

**Endpoint**: `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`

**Response Shape**:
```json
{
  "Count": 1,
  "Message": "Results returned successfully",
  "SearchCriteria": "VIN(s): 1HGBH41JXMN109186",
  "Results": [
    {
      "Make": "HONDA",
      "Model": "Civic",
      "ModelYear": "1991",
      "Series": "",
      "Trim": "LX",
      "BodyClass": "Sedan/Saloon",
      "DriveType": "FWD/Front-Wheel Drive",
      "EngineConfiguration": "Inline",
      "EngineCylinders": "4",
      "DisplacementL": "1.5",
      "FuelTypePrimary": "Gasoline",
      "TransmissionStyle": "Manual",
      "VIN": "1HGBH41JXMN109186",
      "ErrorCode": "0",
      "ErrorText": "0 - VIN decoded clean. Check Digit (9th position) is correct",
      "... ~100 more fields": "..."
    }
  ]
}
```

**Field Mapping** (`VINDecodeResult`):

| NHTSA Field | `VINDecodeResult` Field | Notes |
|------------|------------------------|-------|
| `ModelYear` | `year` | Parse to `number`; 0 if unparseable |
| `Make` | `make` | Uppercase from NHTSA; normalize to title case |
| `Model` | `model` | |
| `Trim` | `trim` | Optional; empty string → `undefined` |
| `FuelTypePrimary` | `fuel_type` | |
| `BodyClass` | `body_class` | |
| `DriveType` | `drive_type` | |
| `TransmissionStyle` | `transmission` | |
| `EngineCylinders` | `engine_cylinders` | Parse to `number` |
| `DisplacementL` | `displacement_l` | Parse to `number` |
| `EngineConfiguration` | `engine_config` | e.g. "Inline", "V-Shape" |
| `ErrorCode` | — | `"0"` = clean decode; non-zero → include in error message |

**Error Handling**:
- HTTP errors → throw `ScraperError` with code `SCRAPER_ERROR`
- `ErrorCode !== "0"` → partial decode; return available fields with a warning note in `decode_notes`
- Empty `Results` array → `ScraperError` with message "VIN not found in NHTSA database"

### Alternatives Considered

| Alternative | Rejected Because |
|------------|-----------------|
| `DecodeVin` (non-flat) endpoint | Returns hierarchical nested structure; harder to parse; `DecodeVinValues` is simpler |
| Third-party VIN APIs (VINAudit, NHTSA Premium) | Paid or rate-limited; violates free/no-auth assumption |
| Local VIN decode library (e.g. `vin-decode` npm) | Outdated databases; doesn't include trim/engine detail from NHTSA |

---

## 2. Token Bucket Rate Limiter — Implementation Approach

### Decision
Implement a minimal manual token bucket in `priority-queue.ts` using `tokensAvailable`, `lastRefillTime`, and `setInterval`-based refill. No external dependency.

### Rationale
The token bucket algorithm with configurable rate (default: 1 token per 3 seconds, max burst: 1) is straightforward to implement without a library. Adding an npm dep for a 20-line algorithm violates NFR-002's "zero additional runtime dependencies" constraint.

### Algorithm

```typescript
class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private lastRefillTime: number = Date.now();

  constructor(maxTokens: number, refillIntervalMs: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      // Advance lastRefillTime by whole intervals to maintain cadence;
      // fractional elapsed time carries forward correctly on the next refill.
      this.lastRefillTime = this.lastRefillTime + (tokensToAdd * this.refillIntervalMs);
    }
  }
}
```

### Priority Queue Dispatch Loop

```
while queue not empty:
  if bucket.tryConsume():
    request = dequeueHighestPriority()  // FIFO within priority tier
    execute(request)
  else:
    wait(refillIntervalMs)

// Starvation prevention:
// Every 60s, promote oldest low/background task to normal tier
```

### Starvation Prevention Implementation

Maintain a `lastServedAt: Map<PriorityLevel, number>` tracking the last time each tier was served. In the dispatch loop, before normal priority selection:

```typescript
const STARVATION_THRESHOLD_MS = 60_000;
for (const tier of ['low', 'background'] as PriorityLevel[]) {
  if (Date.now() - lastServedAt.get(tier)! > STARVATION_THRESHOLD_MS) {
    // Force-serve next item from this tier regardless of higher-priority items
    const starvedItem = queues.get(tier)?.shift();
    if (starvedItem) return executeWithToken(starvedItem);
  }
}
```

### `critical` Bypass

`critical` requests skip the priority queue entirely but still consume a token from the bucket (respecting rate limits per spec FR-016 and the edge-case note about anti-bot defenses).

---

## 3. OpenTelemetry No-Op Pattern

### Decision
Conditionally initialize `NodeSDK` only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Expose a `withSpan()` wrapper that is a pass-through no-op when tracing is disabled.

### Rationale
The `@opentelemetry/sdk-node` auto-instrumentation calls `sdk.start()` which registers Node.js diagnostic channels and has measurable startup overhead. When the endpoint env var is not set, we must not start the SDK at all (FR-017: "zero performance overhead" when unset).

### Implementation Pattern

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { trace, context } from '@opentelemetry/api';

let _tracingInitialized = false;

export function initTracing(serviceName: string): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return; // no-op
  if (_tracingInitialized) return; // idempotent

  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  _tracingInitialized = true;
}

export async function withSpan<T>(
  name: string,
  attrs: Partial<SpanAttributes>,
  fn: () => Promise<T>
): Promise<T> {
  if (!_tracingInitialized) return fn(); // pure pass-through

  const tracer = trace.getTracer('car-auctions');
  return tracer.startActiveSpan(name, async (span) => {
    span.setAttributes(attrs as Attributes);
    const start = Date.now();
    try {
      const result = await fn();
      span.setAttribute('tool.status', 'ok');
      span.setAttribute('tool.duration_ms', Date.now() - start);
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.setAttribute('tool.status', 'error');
      span.setAttribute('tool.duration_ms', Date.now() - start);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

### OTLP Endpoint Unreachable

The OTLP HTTP exporter uses fire-and-forget export semantics. If the endpoint is unreachable, export errors are swallowed by the SDK's internal error handler. The application sees no performance degradation beyond the initial failed connection attempt.

---

## 4. MCP SDK Transport Selection

### Decision
Use `@modelcontextprotocol/sdk` transport classes: `StdioServerTransport`, `SSEServerTransport`, `WebSocketServerTransport`. Select transport at server startup via `TRANSPORT` env var (or `options.transport` parameter for testability).

### Rationale
The MCP SDK provides all three transport implementations. Centralizing transport selection in `createMcpServer()` eliminates the 7-way boilerplate duplication across MCP server packages (User Story 3).

### Transport Bootstrap Pattern

```typescript
export async function createMcpServer(options: McpServerOptions): Promise<void> {
  const server = new Server(
    { name: options.name, version: options.version },
    { capabilities: options.capabilities }
  );

  // Register tools
  options.registerTools(server);

  const transport = options.transport ?? process.env.TRANSPORT ?? 'stdio';

  if (transport === 'stdio') {
    await server.connect(new StdioServerTransport());
  } else if (transport === 'sse') {
    const port = options.port ?? parseInt(process.env.PORT ?? '3000', 10);
    const app = express(); // lightweight — SSEServerTransport uses express
    app.use('/sse', (req, res) => {
      const t = new SSEServerTransport('/message', res);
      server.connect(t);
    });
    app.listen(port);
  } else if (transport === 'websocket') {
    const wsPort = options.wsPort ?? parseInt(process.env.WS_PORT ?? '3001', 10);
    const wss = new WebSocketServer({ port: wsPort });
    wss.on('connection', (ws) => {
      server.connect(new WebSocketServerTransport(ws));
    });
  }
}
```

**Note**: `express` is a dev/peer dep only for SSE transport — it is already available in each consuming package. The `shared` package itself does not add `express` as a dependency (consistent with NFR-002).

---

## 5. playwright-extra Stealth Integration

### Decision
Use `chromium.use(stealth())` pattern from `playwright-extra`. Instantiate a single `chromium` instance per pool; create multiple contexts from the same browser object.

### Rationale
`playwright-extra` wraps `playwright`'s `chromium` object and applies plugins (stealth, UA rotation) at the browser-level before `launch()`. Each browser context inherits stealth settings, enabling multiple isolated sessions from a single browser process (saving memory per FR-012 / User Story 4).

### Browser Pool Pattern

```typescript
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

class BrowserPool {
  private browser: Browser | null = null;
  private contextCount = 0;
  private shutdownPromise: Promise<void> | null = null;

  async getContext(config: BrowserConfig): Promise<BrowserContext> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: config.headless,
        proxy: config.proxyUrl ? { server: config.proxyUrl } : undefined,
      });
    }
    if (this.contextCount >= config.maxConcurrency) {
      throw new ScraperError('Browser pool at maximum concurrency');
    }
    this.contextCount++;
    const ctx = await this.browser.newContext({ viewport: config.viewport });
    return ctx;
  }

  async releaseContext(ctx: BrowserContext): Promise<void> {
    await ctx.close();
    this.contextCount = Math.max(0, this.contextCount - 1);
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) return this.shutdownPromise; // idempotent
    this.shutdownPromise = this.browser?.close() ?? Promise.resolve();
    await this.shutdownPromise;
    this.browser = null;
  }
}
```

### Proxy Configuration

Per constitution Pillar I Rule 4, proxy URL comes exclusively from `process.env.PROXY_URL`. The `BrowserPoolOptions.proxyUrl` field defaults to `process.env.PROXY_URL` if not explicitly set, but does not allow hardcoded values in source code.

---

## 6. `better-sqlite3` WAL Mode and VIN Cache

### Decision
Use `better-sqlite3` with WAL journal mode. Provide a `SqliteVinCache` class implementing the `VinCache` interface. Store at `data/vin-cache.sqlite` relative to the calling package's working directory.

### Rationale
WAL mode is required by constitution Gate 3. `better-sqlite3` is synchronous, which simplifies the cache implementation (no async wrappers needed for reads). The 90-day TTL matches the constitution's cache table exactly.

### Schema

```sql
CREATE TABLE IF NOT EXISTS vin_cache (
  vin          TEXT PRIMARY KEY,
  result       TEXT NOT NULL,  -- JSON-serialized VINDecodeResult
  cached_at    INTEGER NOT NULL,  -- Unix timestamp (ms)
  expires_at   INTEGER NOT NULL   -- Unix timestamp (ms) = cached_at + 90d
);
CREATE INDEX IF NOT EXISTS idx_vin_cache_expires ON vin_cache(expires_at);
```

### TTL Enforcement

On `get(vin)`: check `expires_at > Date.now()`. Expired entries return `null` (cache miss). A background cleanup sweeps expired rows on DB open.

### In-Memory FIFO-Eviction Cache (Testing)

A lightweight insertion-order cache for use in tests. Evicts the oldest-inserted entry when at capacity. Unlike a true LRU, it does not track access recency — this is intentional for test simplicity. (Production code uses the SQLite cache.)

```typescript
class FifoVinCache implements VinCache {
  private cache = new Map<string, { result: VINDecodeResult; expiresAt: number }>();
  private readonly maxSize = 200;

  get(vin: string): VINDecodeResult | null {
    const entry = this.cache.get(vin);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.result;
  }

  set(vin: string, result: VINDecodeResult, ttlMs: number): void {
    if (this.cache.size >= this.maxSize) {
      // Evict oldest-inserted entry (Map iteration is insertion-order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
    this.cache.set(vin, { result, expiresAt: Date.now() + ttlMs });
  }
}
```

---

## 7. IAAI Title Code Mapping

### Decision
Hard-code a `TITLE_CODE_MAP` in `normalizer/codes.ts` (internal, not exported) with all known codes. Unknown codes map to `"Unknown"` with a `console.warn` in non-production environments.

### Known Codes (from spec FR-006)

| IAAI Code | Human-Readable Label |
|-----------|---------------------|
| `SV` | Salvage |
| `CL` | Clean |
| `RB` | Rebuilt |
| `FL` | Flood |
| `LM` | Lemon Law |
| `NT` | Non-Transferable |
| `EX` | Export Only |
| `PM` | Parts Only |
| `IN` | Insurance Retained |

### Graceful Degradation

```typescript
export function titleCodeToLabel(code: string): string {
  const label = TITLE_CODE_MAP[code.toUpperCase()];
  if (!label) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[shared/normalizer] Unknown IAAI titleCode: "${code}" — defaulting to "Unknown"`);
    }
    return 'Unknown';
  }
  return label;
}
```

---

## Summary of Resolved Decisions

| # | Area | Decision | Impact |
|---|------|----------|--------|
| 1 | NHTSA API | `DecodeVinValues` endpoint; flat JSON; field map documented | `vin-decoder/nhtsa-client.ts` |
| 2 | Rate limiting | Manual token bucket; `tokensAvailable + lastRefillTime`; no dep | `priority-queue.ts` |
| 3 | OTel no-op | Guard on `OTEL_EXPORTER_OTLP_ENDPOINT`; conditional SDK start | `tracing.ts` |
| 4 | MCP transport | `StdioServerTransport` / `SSEServerTransport` / `WebSocketServerTransport` | `mcp-helpers.ts` |
| 5 | Stealth/browser | `chromium.use(stealth())` before launch; single browser + N contexts | `browser-pool.ts` |
| 6 | SQLite VIN cache | WAL mode; 90-day TTL; `expires_at` index; `LruVinCache` for tests | `vin-decoder/sqlite-cache.ts` |
| 7 | IAAI codes | Hard-coded `TITLE_CODE_MAP`; unknown → `"Unknown"` + warn | `normalizer/codes.ts` |
