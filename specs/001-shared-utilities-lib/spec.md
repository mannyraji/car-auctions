# Feature Specification: Shared Utilities Library

**Feature Branch**: `001-shared-utilities-lib`  
**Created**: 2026-04-06  
**Status**: Draft  
**Input**: User description: "Shared utilities library providing common types, MCP server helpers, browser pool, VIN decoder, auction normalizer, priority queue, and OpenTelemetry tracing used across all packages"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unified Auction Data Schema (Priority: P1)

A developer building a scraper for Copart or IAAI needs a single, source-agnostic data model for auction listings. They import shared types and a normalizer so that all downstream consumers (deal analyzer, alerts, gateway) work with one consistent shape regardless of which auction source the data came from.

**Why this priority**: Every other package in the monorepo depends on a consistent data contract. Without shared types and normalization, each package would define its own incompatible listing shapes, making cross-package integration impossible.

**Independent Test**: Can be fully tested by passing raw Copart and IAAI fixture data through the normalizer and verifying the output matches the shared `AuctionListing` schema with correct field mappings, type coercions (e.g., IAAI's `"YES"`/`"NO"` → boolean), and damage code normalization.

**Acceptance Scenarios**:

1. **Given** a raw Copart API response, **When** passed through the auction normalizer, **Then** the output conforms to the `AuctionListing` interface with all required fields populated and source set to `copart`
2. **Given** a raw IAAI API response with `hasKeys: "YES"` and `titleCode: "SV"`, **When** normalized, **Then** `has_keys` is `true` (boolean) and `title_type` is `"Salvage"` (human-readable label)
3. **Given** raw listings from both Copart and IAAI for the same vehicle, **When** both are normalized, **Then** the output shapes are structurally identical and can be compared, sorted, or merged without source-specific handling

---

### User Story 2 - VIN Decoding Across All Packages (Priority: P1)

Any package that receives a VIN (scrapers, deal analyzer) needs to decode it into structured vehicle specifications. The shared VIN decoder provides a single, cacheable client for the free NHTSA vPIC API, avoiding duplicated implementation and redundant API calls.

**Why this priority**: VIN decoding is used by both auction scrapers, the deal analyzer pipeline, and the scan_deals batch flow. A single shared implementation prevents code duplication and ensures consistent 90-day caching.

**Independent Test**: Can be tested by calling the decoder with a known VIN and verifying the returned specs match expected year, make, model, trim, engine, and body style. Invalid VINs (wrong length, containing I/O/Q) must be rejected before any network call.

**Acceptance Scenarios**:

1. **Given** a valid 17-character VIN, **When** decoded, **Then** the result includes year, make, model, trim, engine type, body class, and transmission at minimum
2. **Given** a VIN that has been decoded within the last 90 days, **When** decoded again, **Then** the cached result is returned without making an external API call
3. **Given** an invalid VIN (fewer than 17 characters, or containing I, O, or Q), **When** decode is attempted, **Then** a validation error is returned immediately without contacting the API

---

### User Story 3 - MCP Server Bootstrap (Priority: P2)

A developer creating a new MCP server package needs a consistent way to initialize the server with support for stdio, SSE, and WebSocket transports, controlled via environment variable or CLI flag. The shared MCP helper eliminates boilerplate and ensures all servers behave consistently.

**Why this priority**: All 7 MCP servers need identical transport setup. Centralizing this avoids 7 copies of the same bootstrap logic and ensures transport behavior is uniform across the monorepo.

**Independent Test**: Can be tested by initializing an MCP server via the helper with each transport mode and verifying it starts, accepts connections, and responds to a health-check tool call.

**Acceptance Scenarios**:

1. **Given** a package calling the MCP helper with `TRANSPORT=stdio`, **When** the server starts, **Then** it listens on stdin/stdout and processes MCP tool calls
2. **Given** `TRANSPORT=sse` and a `PORT` value, **When** the server starts, **Then** it accepts SSE connections on the specified port
3. **Given** `TRANSPORT=websocket` and a `WS_PORT` value, **When** the server starts, **Then** it accepts WebSocket connections on the specified port

---

### User Story 4 - Shared Browser Pool (Priority: P2)

Multiple scraper packages need to manage Playwright browser instances. The shared browser pool provides lifecycle management (launch, reuse, close), stealth integration, and proxy configuration so that each scraper doesn't independently manage browser processes.

**Why this priority**: Browser instances are expensive resources. Pooling them reduces memory usage and startup time, especially when multiple scrapers run in-process via the gateway.

**Independent Test**: Can be tested by requesting multiple browser contexts from the pool, verifying they share a single browser instance, and confirming proper cleanup when contexts are released.

**Acceptance Scenarios**:

1. **Given** two scraper packages requesting browser contexts, **When** running in the same process, **Then** both receive contexts from a single shared browser instance
2. **Given** a browser pool with stealth enabled, **When** a context is created, **Then** the context has fingerprint masking applied (stealth plugin active)
3. **Given** a `PROXY_URL` environment variable, **When** a browser context is created, **Then** all network traffic routes through the configured proxy
4. **Given** all browser contexts have been released, **When** the pool is shut down, **Then** the underlying browser process closes cleanly without orphaned processes

---

### User Story 5 - Priority-Aware Request Queue (Priority: P2)

Scrape requests vary in urgency — a watched lot about to sell is critical, while a background cache warm-up can wait. The shared priority queue ensures urgent requests are served first while preventing starvation of lower-priority work.

**Why this priority**: Without prioritization, a batch of background requests could block time-sensitive watchlist refreshes. The queue is essential for the alert system and real-time bidding use cases.

**Independent Test**: Can be tested by enqueuing requests at different priority levels and verifying dequeue order, preemption behavior, and that low-priority requests still execute within their guaranteed time window.

**Acceptance Scenarios**:

1. **Given** a queue with pending `normal` and `low` requests, **When** a `critical` request is enqueued, **Then** the `critical` request is dequeued and executed immediately (bypassing the queue)
2. **Given** sustained `high`-priority load, **When** a `low`-priority request has been waiting, **Then** the `low` request is guaranteed execution within 60 seconds (starvation prevention)
3. **Given** the global rate limit of 1 request per 3 seconds, **When** requests are dequeued, **Then** they respect the token bucket rate regardless of priority level (except `critical` which bypasses)
4. **Given** a `background` priority request, **When** enqueued, **Then** it is willing to wait up to 30 seconds before being served

---

### User Story 6 - OpenTelemetry Tracing (Priority: P3)

An operator monitoring the system in production needs distributed tracing across the full `analyze_vehicle` pipeline to identify bottlenecks, monitor scraper health, and track cache hit rates. The shared tracing module provides opt-in OpenTelemetry instrumentation for all packages.

**Why this priority**: Observability is important for production operations but not required for core functionality. All packages function correctly without tracing; it enhances debugging and monitoring.

**Independent Test**: Can be tested by initializing tracing with a mock exporter, executing an instrumented operation, and verifying that spans with correct names, attributes, and parent-child relationships are emitted.

**Acceptance Scenarios**:

1. **Given** an `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is set, **When** a package initializes tracing, **Then** spans are emitted to the configured endpoint with the correct service name
2. **Given** no `OTEL_EXPORTER_OTLP_ENDPOINT` is set, **When** a package initializes tracing, **Then** tracing becomes a no-op with zero performance overhead
3. **Given** an instrumented tool call, **When** it executes, **Then** the emitted span includes `tool.name`, `tool.source`, `cache.hit`, `queue.priority`, and `queue.wait_ms` attributes
4. **Given** the `analyze_vehicle` pipeline executing, **When** traced, **Then** each pipeline stage (VIN decode, vision, repair estimate, scoring) appears as a child span under the parent `analyzer.pipeline` span

---

### Edge Cases

- What happens when the NHTSA vPIC API is unreachable? The VIN decoder must return a clear error without crashing, and callers should handle gracefully (e.g., proceeding with partial data).
- What happens when the browser pool reaches maximum capacity? Requests must queue rather than spawn unlimited browser instances, with a configurable concurrency limit.
- What happens when a priority queue receives a burst of `critical` requests? They must still respect the rate limit (1 req/3s) to avoid triggering anti-bot defenses, even though they bypass the queue ordering.
- What happens when the auction normalizer encounters an unknown IAAI `titleCode`? It must map to a sensible default (e.g., `"Unknown"`) and log a warning rather than throwing.
- What happens when two scrapers running in the same process both try to shut down the browser pool? Shutdown must be idempotent and reference-counted.
- What happens when the OTEL endpoint is set but unreachable? Tracing must fail silently and not block or crash the application.
- What happens when the VIN cache database is corrupted? The VIN decoder must detect corruption, log a warning, and proceed without caching (degrade gracefully).
- What happens when a browser context hangs or becomes unresponsive? The browser pool must detect the timeout and force-close the context without affecting other contexts.
- What happens when the priority queue overflows? The queue must enforce a configurable maximum depth (default: 1000) and reject new requests with a `RATE_LIMIT_QUEUE_FULL` error when exceeded.
- What happens when a `critical` priority request arrives while the token bucket is empty? It must still wait for the next token (respecting rate limits) but bypass queue ordering.
- What happens when the normalizer receives a null or undefined raw listing? It must throw a validation error rather than producing a partial result.

---

### Additional Acceptance Scenarios

**Browser Pool Edge Cases**:
1. **Given** a browser pool with maxContexts=3 and 3 active contexts, **When** a fourth context is requested, **Then** the request queues until a context is released (no new browser spawned)
2. **Given** a browser context that exceeds the idle timeout (30s default), **When** the pool performs cleanup, **Then** the idle context is closed and resources freed
3. **Given** a browser crash during an active operation, **When** detected by the pool, **Then** a new browser instance is spawned and pending requests are retried

**Priority Queue Edge Cases**:
1. **Given** a queue at maximum depth (1000 requests), **When** a new request arrives, **Then** the request is rejected with error code `RATE_LIMIT_QUEUE_FULL` and `retryable: true`
2. **Given** the token bucket is empty and a `critical` request arrives, **When** the next token is available (≤3s), **Then** the critical request executes first (ahead of queued `high`/`normal` requests)
3. **Given** 100 `high` priority requests enqueued, **When** a `low` priority request has waited 60 seconds, **Then** the `low` request executes next (starvation prevention triggers)

**VIN Decoder Edge Cases**:
1. **Given** a VIN that NHTSA returns incomplete data for (missing model year), **When** decoded, **Then** the result includes all available fields with missing fields as `null`, not throwing
2. **Given** the VIN cache SQLite file is locked by another process, **When** a cache write is attempted, **Then** the decoder proceeds without caching (logs warning, returns result)
3. **Given** a network timeout to NHTSA API (>5s), **When** decode is attempted, **Then** a `TIMEOUT` error is returned with `retryable: true`

**Tracing Edge Cases**:
1. **Given** `OTEL_EXPORTER_OTLP_ENDPOINT` points to an unreachable host, **When** spans are emitted, **Then** tracing fails silently with no impact on application performance
2. **Given** tracing is initialized multiple times in the same process, **When** the second call occurs, **Then** the existing tracer is returned (singleton behavior)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The library MUST define a shared `AuctionListing` interface that represents a source-agnostic normalized auction listing with all fields documented in the technical spec (source, lot_number, VIN, year, make, model, damage info, bid data, sale info, location, and extended fields)
- **FR-002**: The library MUST define shared error types (`ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`, `AnalysisError`) and a structured `ToolResponse<T>` envelope with `success`, `data`, `error` (with `code`, `message`, `retryable`, optional `retryAfterMs`), `cached`, `stale`, and `timestamp` fields
- **FR-003**: The library MUST define shared interfaces for `DealAnalysis`, `RiskFlag`, `DealSummary`, `VINDecodeResult`, `ProfitEstimate`, `RepairEstimate`, `RepairLineItem`, `CarrierQuote`, `ValueAdjustment`, `BrowserConfig`, and all source-specific raw types (`CopartRawListing`, `IaaiRawListing`)
- **FR-004**: The library MUST define shared interfaces for Carfax sub-records (`ServiceRecord`, `RecallRecord`), NMVTIS sub-records (`NmvtisTitleRecord`, `InsuranceLossRecord`, `JunkSalvageRecord`, `OdometerRecord`), and the `ErrorCode` union type
- **FR-005**: The auction normalizer MUST convert raw Copart responses into the `AuctionListing` shape with correct field mapping (e.g., `lotNumberStr` → `lot_number`, `mkn` → `make`, `dd` → `damage_primary`)
- **FR-006**: The auction normalizer MUST convert raw IAAI responses into the `AuctionListing` shape, including type coercions (`hasKeys: "YES"/"NO"` → `boolean`) and code-to-label mappings (`titleCode: "SV"` → `"Salvage"`, `"CL"` → `"Clean"`, `"RB"` → `"Rebuilt"`)
- **FR-007**: The auction normalizer MUST handle unknown or missing *optional* fields gracefully by using sensible defaults and never throwing on unexpected input. Required identifiers (`lot_number`, `vin`) throw a `VALIDATION_ERROR` if missing.
- **FR-008**: The VIN decoder MUST validate VINs before making API calls: exactly 17 alphanumeric characters, rejecting I, O, and Q
- **FR-009**: The VIN decoder MUST return structured vehicle specifications including at minimum: year, make, model, trim, engine type, body class, drive type, fuel type, and transmission
- **FR-010**: The VIN decoder MUST support caching of results with a 90-day TTL via a pluggable `VinCache` interface (with `get(vin)` and `set(vin, result, ttl)` methods). A default `better-sqlite3` implementation MUST be provided (WAL mode, stored at `data/vin-cache.sqlite`, gitignored) and an in-memory LRU fallback MUST be available for testing. When no cache is injected, the decoder MUST still function correctly without caching
- **FR-011**: The MCP helpers MUST provide a bootstrap function that creates an MCP server supporting stdio, SSE, and WebSocket transports, selectable via environment variable (`TRANSPORT`) or function parameter
- **FR-012**: The browser pool MUST manage Playwright browser instance lifecycle (launch, reuse contexts, close), integrate the stealth plugin for fingerprint masking, and support proxy configuration via `PROXY_URL`
- **FR-013**: The priority queue MUST support five priority levels: `critical` (immediate), `high` (max 2s wait), `normal` (max 5s wait), `low` (max 10s wait), and `background` (max 30s wait)
- **FR-014**: The priority queue MUST enforce a global rate limit (configurable, default 1 request per 3 seconds) using a token bucket approach
- **FR-015**: The priority queue MUST guarantee that `low` and `background` tasks get at least 1 execution slot per 60 seconds even under sustained high-priority load (starvation prevention)
- **FR-016**: The priority queue MUST allow `critical` requests to bypass queue ordering while still respecting the underlying rate limit
- **FR-017**: The tracing module MUST initialize OpenTelemetry with OTLP HTTP export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and be a complete no-op when unset
- **FR-018**: The tracing module MUST support custom span attributes: `tool.name`, `tool.source`, `cache.hit`, `queue.priority`, `queue.wait_ms`
- **FR-019**: The tracing module MUST use the span naming convention `{package}.{operation}` (e.g., `copart.search`, `cache.read`, `analyzer.pipeline`)

### Non-Functional Requirements

- **NFR-001**: All exported functions MUST be tree-shakeable (named exports only, no side effects at module scope)
- **NFR-002**: The shared package MUST have zero runtime dependencies beyond `@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `sharp`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, and `ws`
- **NFR-003**: The package MUST target Node.js 20+ and compile under `ES2022` target with TypeScript `strict: true`
- **NFR-004**: Browser pool MUST enforce a configurable maximum concurrency (default: 3 contexts) to bound memory usage
- **NFR-005**: All public API functions MUST include JSDoc documentation with `@example` tags

### Key Entities

- **AuctionListing**: The core normalized representation of a vehicle at auction. Includes identification (VIN, lot number), vehicle details (year, make, model, damage), auction state (bid, sale date, status), and location. Source-agnostic — both Copart and IAAI map to this shape.
- **ToolResponse**: The standard envelope for all MCP tool return values. Contains success/error state, optional cached/stale flags, and a timestamp. Ensures consistent error handling across all 7 MCP servers.
- **RiskFlag**: A warning or alert about a vehicle. Has a type (title wash, flood, odometer rollback, etc.), severity (info/warning/critical), and human-readable detail string.
- **DealAnalysis**: The complete output of analyzing a vehicle. Aggregates listing data, VIN decode, history reports, profit estimate, repair quote, deal score, risk flags, and optional vision analysis.
- **PriorityRequest**: A queued scrape request with an assigned priority level, enqueue timestamp, and the operation to execute. Ordered by priority then FIFO within each level.
- **DamageImage**: A vehicle damage photo with base64-encoded image data, MIME type, and optional label (e.g., "front", "rear", "undercarriage"). Used by AI vision analysis in `DealAnalysis.images`.
- **CarfaxSummary**: A condensed vehicle history summary extracted from Carfax. Includes accident count, owner count, title brand, service record count, and overall risk assessment. Used by `DealAnalysis.carfax_summary`.
- **WatchlistEntry**: A tracked auction lot with lot number, source, VIN, current bid, sale date, and alert preferences (bid threshold, notification channels). Stored in per-scraper SQLite watchlist tables.
- **WatchlistHistoryEntry**: A point-in-time snapshot of a watched lot's state (bid amount, sale status) captured during each poll cycle. Used for change detection and alert triggering.
- **RepairQuote**: The output of `repair_build_quote` — aggregates multiple `RepairLineItem` entries with total parts cost, total labor cost, and combined estimate. Referenced as `repair_quote` in `DealAnalysis`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Raw Copart and IAAI fixture data normalize to identical `AuctionListing` shapes with 100% field coverage — no `undefined` for required fields
- **SC-002**: VIN decoding for a valid VIN returns complete vehicle specs within 2 seconds on first call, and under 10 milliseconds on subsequent cached calls
- **SC-003**: All 7 MCP server packages can import and use shared types, helpers, and utilities without circular dependencies
- **SC-004**: The priority queue processes `critical` requests within 100 milliseconds of enqueue, regardless of queue depth
- **SC-005**: Under sustained high-priority load, `low` and `background` tasks still execute within their 60-second starvation guarantee
- **SC-006**: Enabling OpenTelemetry tracing adds less than 5% overhead to tool call latency
- **SC-007**: The browser pool reuses a single browser instance across multiple concurrent context requests, keeping peak memory usage proportional to context count, not browser count
- **SC-008**: All shared types compile with TypeScript strict mode enabled and produce zero type errors
- **SC-009**: The auction normalizer handles 100% of known IAAI title codes (`SV`, `CL`, `RB`, `JK`, `LL`, `FL`, `OD`, `RC`) and degrades gracefully for unknown codes

## Implementation Specifications

### Error Class Structure

All error classes extend the base `Error` class and implement a common interface:

```typescript
interface BaseErrorFields {
  code: ErrorCode;          // Machine-readable error code
  message: string;          // Human-readable description
  retryable: boolean;       // Whether the operation can be retried
  retryAfterMs?: number;    // Suggested wait time before retry (if retryable)
  context?: Record<string, unknown>;  // Additional context data
}
```

**Error Classes and Default Retryability**:

| Error Class | Default `retryable` | Typical `retryAfterMs` | Context Fields |
|-------------|---------------------|------------------------|----------------|
| `ScraperError` | `true` | 5000 | `url`, `source` (copart/iaai), `statusCode` |
| `CaptchaError` | `false` | — | `url`, `source`, `captchaType` |
| `RateLimitError` | `true` | Exponential backoff | `source`, `dailyRemaining`, `resetAt` |
| `CacheError` | `false` | — | `operation` (read/write), `key` |
| `AnalysisError` | Depends on cause | — | `stage`, `vehicleVin` |

**ErrorCode to Retryability Mapping**:

| ErrorCode | `retryable` | Notes |
|-----------|-------------|-------|
| `SCRAPER_ERROR` | `true` | Transient scraper failures |
| `CAPTCHA_DETECTED` | `false` | Requires human intervention |
| `RATE_LIMITED` | `true` | Wait for `retryAfterMs` |
| `RATE_LIMIT_DAILY_CAP` | `false` | Daily limit reached |
| `RATE_LIMIT_QUEUE_FULL` | `true` | Queue overflow, retry later |
| `CACHE_ERROR` | `false` | Cache corruption/failure |
| `ANALYSIS_ERROR` | `false` | Logic error in analysis |
| `VALIDATION_ERROR` | `false` | Invalid input data |
| `AUTH_ERROR` | `false` | Credential failure |
| `NOT_FOUND` | `false` | Resource doesn't exist |
| `TIMEOUT` | `true` | Network/operation timeout |
| `NMVTIS_COST_GUARD` | `false` | Cost protection triggered |
| `DOWNSTREAM_UNAVAILABLE` | `true` | Downstream service down |
| `VISION_ERROR` | `true` | Vision API failure |

---

### VinCache Interface Specification

```typescript
interface VinCacheEntry {
  vin: string;
  result: VINDecodeResult;
  cachedAt: number;       // Unix timestamp ms
  expiresAt: number;      // Unix timestamp ms
}

interface VinCache {
  /** Get cached decode result. Returns null if not found or expired. */
  get(vin: string): Promise<VINDecodeResult | null>;
  
  /** Store decode result with TTL. */
  set(vin: string, result: VINDecodeResult, ttlMs: number): Promise<void>;
  
  /** Remove cached entry. Returns true if entry existed. */
  delete(vin: string): Promise<boolean>;
  
  /** Clear all expired entries (optional garbage collection). */
  prune?(): Promise<number>;
}
```

**SQLite Cache Schema** (default `better-sqlite3` implementation):

```sql
CREATE TABLE IF NOT EXISTS vin_cache (
  vin TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vin_cache_expires ON vin_cache(expires_at);
```

**TTL Management**: Lazy deletion on read. When `get()` finds an expired entry, it deletes it and returns `null`. Optional `prune()` method for batch cleanup.

**Corruption Recovery**: If SQLite throws a `SQLITE_CORRUPT` error, the cache implementation logs a warning and returns `null` for reads, no-ops for writes. The decoder continues functioning without cache.

---

### MCP Server Bootstrap Specification

```typescript
type TransportType = 'stdio' | 'sse' | 'websocket';

interface McpServerOptions {
  /** Server name for identification */
  name: string;
  
  /** Server version */
  version: string;
  
  /** Transport type. Overridden by TRANSPORT env var if set. */
  transport?: TransportType;
  
  /** Port for SSE/WebSocket transports. Defaults to PORT env var or 3000. */
  port?: number;
  
  /** Endpoint path for SSE/WebSocket. Defaults to '/mcp'. */
  path?: string;
  
  /** Tool definitions to register */
  tools: ToolDefinition[];
  
  /** Resource definitions (optional) */
  resources?: ResourceDefinition[];
  
  /** Called on server shutdown */
  onShutdown?: () => Promise<void>;
}

interface McpServer {
  /** Start listening (for SSE/WebSocket) or attach to stdio */
  start(): Promise<void>;
  
  /** Graceful shutdown */
  stop(): Promise<void>;
  
  /** Current transport type */
  readonly transport: TransportType;
  
  /** Port (for SSE/WebSocket) */
  readonly port?: number;
}

function createMcpServer(options: McpServerOptions): McpServer;
```

**Transport Selection Priority**: Function parameter `transport` < Environment variable `TRANSPORT` (case-insensitive).

**SSE Transport**: Listens on `http://0.0.0.0:{port}{path}` with SSE event stream. Uses JSON-RPC 2.0 over SSE events.

**WebSocket Transport**: Listens on `ws://0.0.0.0:{port}{path}` with JSON-RPC 2.0 messages.

---

### Browser Pool Specification

```typescript
interface BrowserPoolOptions {
  /** Maximum concurrent browser contexts. Default: 3 */
  maxContexts?: number;
  
  /** Enable stealth plugin for fingerprint masking. Default: true */
  stealth?: boolean;
  
  /** Proxy URL (overridden by PROXY_URL env var). */
  proxy?: string;
  
  /** Browser launch timeout in ms. Default: 30000 */
  launchTimeout?: number;
  
  /** Idle context timeout before auto-close in ms. Default: 30000 */
  idleTimeout?: number;
  
  /** Playwright browser type. Default: 'chromium' */
  browserType?: 'chromium' | 'firefox' | 'webkit';
  
  /** Additional Playwright launch options */
  launchOptions?: PlaywrightLaunchOptions;
}

interface BrowserContext {
  /** Playwright BrowserContext instance */
  readonly context: PlaywrightBrowserContext;
  
  /** Release context back to pool (do not close manually) */
  release(): Promise<void>;
  
  /** Context creation timestamp */
  readonly createdAt: number;
}

class BrowserPool {
  constructor(options?: BrowserPoolOptions);
  
  /** Acquire a browser context. Queues if at capacity. */
  acquire(): Promise<BrowserContext>;
  
  /** Graceful shutdown. Closes all contexts and browser. */
  shutdown(): Promise<void>;
  
  /** Current active context count */
  readonly activeCount: number;
  
  /** Current queued request count */
  readonly queuedCount: number;
}
```

**Lifecycle**: Browser instance is lazily launched on first `acquire()`. Single browser instance shared across all contexts. Browser automatically restarts on crash.

**Stealth Integration**: When `stealth: true`, the `puppeteer-extra-plugin-stealth` plugin is applied to mask browser fingerprints.

**Reference Counting**: `shutdown()` is idempotent. Multiple calls from different consumers are safe; actual shutdown occurs when reference count reaches zero.

---

### Priority Queue Specification

```typescript
type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';

interface PriorityRequest<T = unknown> {
  /** Unique request ID */
  id: string;
  
  /** Priority level */
  priority: PriorityLevel;
  
  /** The async operation to execute */
  execute: () => Promise<T>;
  
  /** Enqueue timestamp (auto-set by queue) */
  enqueuedAt: number;
  
  /** Optional timeout in ms (default: 30000) */
  timeout?: number;
}

interface TokenBucketConfig {
  /** Tokens added per second. Default: 0.333 (1 req per 3s) */
  tokensPerSecond?: number;
  
  /** Maximum token accumulation. Default: 1 */
  maxTokens?: number;
  
  /** Initial token count. Default: maxTokens */
  initialTokens?: number;
}

interface PriorityQueueOptions {
  /** Token bucket rate limiting config */
  tokenBucket?: TokenBucketConfig;
  
  /** Maximum queue depth before rejecting. Default: 1000 */
  maxQueueDepth?: number;
  
  /** Starvation prevention window in ms. Default: 60000 */
  starvationWindowMs?: number;
}

class PriorityQueue {
  constructor(options?: PriorityQueueOptions);
  
  /** Enqueue a request. Returns promise resolving to result or rejecting with error. */
  enqueue<T>(request: Omit<PriorityRequest<T>, 'id' | 'enqueuedAt'>): Promise<T>;
  
  /** Current queue depth by priority */
  getDepth(): Record<PriorityLevel, number>;
  
  /** Graceful shutdown. Rejects pending requests. */
  shutdown(): Promise<void>;
}
```

**Priority Behavior**:

| Priority | Max Wait | Behavior |
|----------|----------|----------|
| `critical` | Immediate | Bypasses queue ordering, still respects rate limit |
| `high` | 2s | Preempts `normal`/`low`/`background` |
| `normal` | 5s | Default priority |
| `low` | 10s | Yields to higher priorities |
| `background` | 30s | Lowest priority, best-effort |

**Starvation Prevention**: A sliding window counter tracks `low`/`background` execution. If 60 seconds pass without either executing, the next dequeue promotes the oldest `low`/`background` request regardless of pending higher-priority requests.

**Token Bucket Algorithm**: Default configuration: 0.333 tokens/second (1 request per 3 seconds), max burst of 1 token. Tokens accumulate when queue is idle. `critical` requests still consume tokens but bypass ordering.

---

### Auction Normalizer Field Defaults

When a field is missing or invalid in the raw source data, the normalizer applies these defaults:

| Field | Default Value | Notes |
|-------|---------------|-------|
| `lot_number` | Required | Throws if missing |
| `vin` | Required | Throws if missing or invalid |
| `source` | Auto-set | `'copart'` or `'iaai'` based on normalizer |
| `year` | `null` | Numeric or null |
| `make` | `'Unknown'` | String |
| `model` | `'Unknown'` | String |
| `trim` | `null` | Optional |
| `title_type` | `'Unknown'` | See title code mapping |
| `damage_primary` | `'Unknown'` | String |
| `damage_secondary` | `null` | Optional |
| `has_keys` | `false` | Boolean (defaults to `false` when unknown) |
| `odometer` | `null` | Number or null |
| `odometer_status` | `'actual'` | `'actual'` \| `'exempt'` \| `'not_actual'` \| `'exceeds_limit'` |
| `current_bid` | `0` | Non-negative number |
| `buy_now_price` | `null` | Optional |
| `sale_date` | `null` | ISO 8601 string or null |
| `sale_status` | `'upcoming'` | `'upcoming'` \| `'live'` \| `'sold'` \| `'cancelled'` |
| `location` | `null` | Location object or null |

---

### IAAI Title Code Mapping

Complete mapping from IAAI `titleCode` values to human-readable labels:

| Code | Label | Notes |
|------|-------|-------|
| `CL` | `Clean` | No title brand |
| `SV` | `Salvage` | Salvage title brand |
| `RB` | `Rebuilt` | Rebuilt/reconstructed title |
| `JK` | `Junk` | Junk certificate |
| `LL` | `Lemon Law` | Lemon law buyback |
| `FL` | `Flood` | Flood damage brand |
| `OD` | `Odometer Problem` | Odometer discrepancy |
| `RC` | `Reconstructed` | Reconstructed title |
| `null` / `undefined` / `''` | `Unknown` | Missing or empty value |
| Other | `Unknown` | Log warning for unmapped codes |

---

### OpenTelemetry Tracing Specification

```typescript
interface TracingConfig {
  /** Service name for span attribution. Required. */
  serviceName: string;
  
  /** Service version. Optional. */
  serviceVersion?: string;
  
  /** OTLP endpoint. Overridden by OTEL_EXPORTER_OTLP_ENDPOINT env var. */
  endpoint?: string;
}

interface SpanAttributes {
  'tool.name'?: string;       // e.g., 'copart_search'
  'tool.source'?: string;     // 'copart' | 'iaai'
  'cache.hit'?: boolean;      // Whether result came from cache
  'queue.priority'?: string;  // Priority level
  'queue.wait_ms'?: number;   // Time spent waiting in queue
  [key: string]: string | number | boolean | undefined;
}

/** Initialize tracing. Call once at application startup. */
function initTracing(config: TracingConfig): void;

/** Execute an operation within a span. */
function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: SpanAttributes
): Promise<T>;
```

**No-Op Behavior**: If `OTEL_EXPORTER_OTLP_ENDPOINT` is not set and `config.endpoint` is not provided, `initTracing()` creates a no-op tracer. All `withSpan()` calls execute the function directly without span creation. Overhead: <1ms per call.

**Singleton**: `initTracing()` is idempotent. Subsequent calls return the existing tracer.

**Span Naming**: Use convention `{package}.{operation}`, e.g., `copart.search`, `cache.read`, `analyzer.pipeline`.

## Public API Surface

The following is the definitive export contract for `@car-auctions/shared`. All consumers import from this boundary; internal modules are not re-exported.

```typescript
// Types & interfaces (re-exported from types/index.ts)
export type {
  // Auction data
  AuctionListing, CopartRawListing, IaaiRawListing,
  
  // Deal analysis
  DealAnalysis, DealSummary, RiskFlag,
  VINDecodeResult, ProfitEstimate,
  RepairEstimate, RepairQuote, RepairLineItem,
  CarrierQuote, ValueAdjustment,
  
  // Vision analysis types
  DamageImage, DamageClassification, PaintAnalysis, FrameInspection,
  
  // Report types
  NMVTISResult, TitleComparison, CarfaxSummary,
  
  // Watchlist types
  WatchlistEntry, WatchlistHistoryEntry,
  
  // Infrastructure
  BrowserConfig,
  ToolResponse, ErrorCode,
  ServiceRecord, RecallRecord,
  NmvtisTitleRecord, InsuranceLossRecord, JunkSalvageRecord, OdometerRecord,
} from './types'

// Error classes
export { ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError } from './errors'

// Auction normalizer
export { normalizeCopart, normalizeIaai } from './normalizer'

// VIN decoder
export { decodeVin, validateVin, type VinCache, type VinCacheEntry } from './vin-decoder'

// MCP server bootstrap
export { createMcpServer, type McpServerOptions, type TransportType } from './mcp-helpers'

// Browser pool
export { BrowserPool, type BrowserPoolOptions, type BrowserContext } from './browser-pool'

// Priority queue
export { PriorityQueue, type PriorityLevel, type PriorityRequest, type TokenBucketConfig } from './priority-queue'

// OpenTelemetry tracing
export { initTracing, withSpan, type SpanAttributes, type TracingConfig } from './tracing'
```

Internal modules (e.g., parser helpers, IAAI code maps) MUST NOT be exported. Consumers that need access to internals should request a new public API.

## Assumptions

- The NHTSA vPIC API (`https://vpic.nhtsa.dot.gov/api/`) remains free and publicly accessible without authentication
- This library is consumed only by other packages within the same monorepo via npm workspace references (`@car-auctions/shared`)
- Browser pool consumers (scraper packages) run in Node.js 20+ environments with Playwright browsers pre-installed
- OpenTelemetry tracing targets an OTLP-compatible collector (e.g., Jaeger) and does not need to support vendor-specific exporters
- The priority queue operates as a per-process singleton; cross-process coordination is out of scope (each scraper process self-governs)
- VIN caching is handled by consumers via their own SQLite cache layers; the VIN decoder itself provides the interface but delegates persistence to the caller
- The library does not include its own test fixtures — fixture files for Copart/IAAI raw data live in the respective scraper package test directories
