# Public API Contract: @car-auctions/shared

**Package**: `@car-auctions/shared`
**Date**: 2026-04-06
**Consumers**: All 7 MCP server packages + alerts service

This document defines the public API surface of the shared library. Internal modules are **not** re-exported. Consumers needing access to internals must request a new public API.

---

## Barrel Export (`src/index.ts`)

```typescript
// ─── Types & Interfaces ───────────────────────────────────────
export type {
  // Core auction types
  AuctionListing,
  CopartRawListing,
  IaaiRawListing,

  // Deal analysis types
  DealAnalysis,
  DealSummary,
  RiskFlag,
  ProfitEstimate,
  RepairEstimate,
  RepairLineItem,
  CarrierQuote,
  ValueAdjustment,

  // VIN types
  VINDecodeResult,

  // Tool response envelope
  ToolResponse,
  ToolError,
  ErrorCode,

  // Browser config
  BrowserConfig,

  // Carfax sub-records
  ServiceRecord,
  RecallRecord,

  // NMVTIS sub-records
  NmvtisTitleRecord,
  InsuranceLossRecord,
  JunkSalvageRecord,
  OdometerRecord,
} from './types/index.js';

// ─── Error Classes ────────────────────────────────────────────
export {
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  AnalysisError,
} from './errors.js';

// ─── Auction Normalizer ───────────────────────────────────────
export { normalizeCopart, normalizeIaai } from './normalizer/index.js';

// ─── VIN Decoder ──────────────────────────────────────────────
export {
  decodeVin,
  validateVin,
  type VinCache,
  SqliteVinCache,
  InMemoryVinCache,
} from './vin-decoder/index.js';

// ─── MCP Server Bootstrap ────────────────────────────────────
export {
  createMcpServer,
  type McpServerOptions,
} from './mcp-helpers/index.js';

// ─── Browser Pool ─────────────────────────────────────────────
export {
  BrowserPool,
  type BrowserPoolOptions,
} from './browser-pool/index.js';

// ─── Priority Queue ──────────────────────────────────────────
export {
  PriorityQueue,
  type PriorityLevel,
  type PriorityRequest,
} from './priority-queue/index.js';

// ─── OpenTelemetry Tracing ───────────────────────────────────
export {
  initTracing,
  withSpan,
  type SpanAttributes,
} from './tracing/index.js';
```

---

## Function Contracts

### `normalizeCopart(raw: CopartRawListing): AuctionListing`

Converts a raw Copart API response into the normalized `AuctionListing` shape.

- **Input**: `CopartRawListing` — raw JSON from Copart's internal API
- **Output**: `AuctionListing` with `source: 'copart'`
- **Throws**: Never — unknown/missing fields use sensible defaults
- **Side effects**: None (pure function)

### `normalizeIaai(raw: IaaiRawListing): AuctionListing`

Converts a raw IAAI API response into the normalized `AuctionListing` shape with type coercions and code-to-label mappings.

- **Input**: `IaaiRawListing` — raw JSON from IAAI's internal API
- **Output**: `AuctionListing` with `source: 'iaai'`
- **Throws**: Never — unknown title codes map to `"Unknown"` with console warning
- **Coercions**: `hasKeys: "YES"/"NO"` → `boolean`; `titleCode` → human-readable label
- **Side effects**: Logs warning on unknown title codes

### `validateVin(vin: string): { valid: boolean; error?: string }`

Validates a VIN string without making any API calls.

- **Rules**: Exactly 17 alphanumeric characters; rejects I, O, Q
- **Returns**: `{ valid: true }` or `{ valid: false, error: "reason" }`
- **Side effects**: None (pure function)

### `decodeVin(vin: string, options?: { cache?: VinCache }): Promise<VINDecodeResult>`

Decodes a VIN via the NHTSA vPIC API with optional caching.

- **Validates** VIN first (throws on invalid)
- **Checks** cache before API call (90-day TTL)
- **Calls** `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`
- **Caches** result on success; negatively caches failures for 5 minutes
- **Throws**: `ScraperError` on API failure (after checking/setting negative cache)

### `createMcpServer(options: McpServerOptions): Promise<McpServer>`

Creates and connects an MCP server with the specified transport.

```typescript
interface McpServerOptions {
  name: string;                              // Server name
  version: string;                           // Server version
  transport?: 'stdio' | 'sse' | 'websocket'; // Default: process.env.TRANSPORT || 'stdio'
  port?: number;                             // For SSE transport (default: process.env.PORT || 3000)
  wsPort?: number;                           // For WebSocket transport (default: process.env.WS_PORT || 3001)
}
```

- **Returns**: Connected `McpServer` instance — consumers register tools on it
- **Throws**: On invalid transport or port binding failure

### `BrowserPool`

```typescript
class BrowserPool {
  constructor(options?: BrowserPoolOptions);
  acquireContext(): Promise<BrowserContext>;  // Get a browser context (queues if at max)
  releaseContext(context: BrowserContext): Promise<void>;  // Return context to pool
  shutdown(): Promise<void>;  // Idempotent, reference-counted shutdown
}

interface BrowserPoolOptions {
  headless?: boolean;          // Default: true
  maxContexts?: number;        // Default: 3
  stealthEnabled?: boolean;    // Default: true
  proxyUrl?: string | null;    // Default: process.env.PROXY_URL
}
```

- **Behavior**: Single browser instance shared across contexts; stealth applied at browser level
- **Concurrency**: Queues requests beyond `maxContexts`
- **Shutdown**: Idempotent; reference-counted; no orphaned processes

### `PriorityQueue`

```typescript
class PriorityQueue {
  constructor(options?: { rateLimit?: { requestsPerSecond?: number }; });
  enqueue(request: PriorityRequest): void;
  start(): void;
  stop(): void;
  readonly pending: number;
  readonly processing: boolean;
}
```

- **Rate limit**: Default 1 request per 3 seconds (token bucket)
- **Critical bypass**: `critical` requests skip queue and rate limit
- **Starvation prevention**: `low`/`background` guaranteed ≥1 slot per 60s

### `initTracing(options: { serviceName: string }): void`

Initializes OpenTelemetry with OTLP HTTP export.

- **When** `OTEL_EXPORTER_OTLP_ENDPOINT` is set: configures real tracer + OTLP exporter
- **When** unset: registers a no-op tracer provider (zero overhead)
- **Idempotent**: Safe to call multiple times

### `withSpan<T>(name: string, attrs: SpanAttributes, fn: () => Promise<T>): Promise<T>`

Wraps an async operation in an OpenTelemetry span.

```typescript
interface SpanAttributes {
  'tool.name'?: string;
  'tool.source'?: string;
  'tool.status'?: 'ok' | 'error';
  'tool.duration_ms'?: number;
  'cache.hit'?: boolean;
  'queue.priority'?: string;
  'queue.wait_ms'?: number;
  [key: string]: string | number | boolean | undefined;
}
```

- **Span naming**: `{package}.{operation}` convention (e.g., `copart.search`)
- **On error**: Sets `SpanStatusCode.ERROR` with message; does NOT attach stack traces
- **Measures**: Automatically records `tool.duration_ms`

---

## Error Class Contract

All error classes share this base shape:

```typescript
abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly retryable: boolean;
  readonly retryAfterMs?: number;

  toToolError(): ToolError;  // Serialize for MCP response
}
```

| Class | `code` | `retryable` |
|---|---|---|
| `ScraperError` | `'SCRAPER_ERROR'` or `'TIMEOUT'` | `true` (timeout) / `false` (crash) |
| `CaptchaError` | `'CAPTCHA_DETECTED'` | `false` |
| `RateLimitError` | `'RATE_LIMITED'` | `true` (with `retryAfterMs`) |
| `CacheError` | `'CACHE_ERROR'` | `false` |
| `AnalysisError` | `'ANALYSIS_ERROR'` | `false` |

---

## VinCache Interface Contract

```typescript
interface VinCache {
  get(vin: string): Promise<VINDecodeResult | null>;
  set(vin: string, result: VINDecodeResult, ttlMs: number): Promise<void>;
}
```

**Implementations shipped**:
- `SqliteVinCache` — `better-sqlite3`, WAL mode, `data/vin-cache.sqlite`
- `InMemoryVinCache` — LRU, max 200 entries, for testing

Consumers may inject custom implementations.
