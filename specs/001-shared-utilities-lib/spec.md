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

- What happens when the NHTSA vPIC API is unreachable? The VIN decoder must return a clear error without crashing, negatively cache the failure for 5 minutes to prevent repeated calls, and callers should handle gracefully (e.g., proceeding with partial data).
- What happens when the browser pool reaches maximum capacity? Requests must queue rather than spawn unlimited browser instances, with a configurable concurrency limit.
- What happens when a priority queue receives a burst of `critical` requests? They bypass both queue ordering and the rate limit. Burst protection (e.g., anti-bot throttling) is the caller's responsibility, not the queue's.
- What happens when the auction normalizer encounters an unknown IAAI `titleCode`? It must map to a sensible default (e.g., `"Unknown"`) and log a warning rather than throwing.
- What happens when two scrapers running in the same process both try to shut down the browser pool? Shutdown must be idempotent and reference-counted.
- What happens when the OTEL endpoint is set but unreachable? Tracing must fail silently and not block or crash the application.
- What happens when a non-critical request waits longer than its target? The queue MUST still process it in priority order. It SHOULD emit a `queue.wait_exceeded` metric/warning. The request MUST NOT be dropped, timed out, or returned as an error. This is a monitoring signal, not a failure condition.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The library MUST define a shared `AuctionListing` interface that represents a source-agnostic normalized auction listing with all fields documented in the technical spec (source, lot_number, VIN, year, make, model, damage info, bid data, sale info, location, and extended fields)
- **FR-002**: The library MUST define shared error types (`ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`, `AnalysisError`) and a structured `ToolResponse<T>` envelope with `success`, `data`, `error` (with `code`, `message`, `retryable`, optional `retryAfterMs`), `cached`, `stale`, `cachedAt` (optional, required when `stale: true`), and `timestamp` fields
- **FR-003**: The library MUST define shared interfaces for `DealAnalysis`, `RiskFlag`, `DealSummary`, `VINDecodeResult`, `ProfitEstimate`, `RepairEstimate`, `RepairLineItem`, `CarrierQuote`, `ValueAdjustment`, `BrowserConfig`, and all source-specific raw types (`CopartRawListing`, `IaaiRawListing`)
- **FR-004**: The library MUST define shared interfaces for Carfax sub-records (`ServiceRecord`, `RecallRecord`), NMVTIS sub-records (`NmvtisTitleRecord`, `InsuranceLossRecord`, `JunkSalvageRecord`, `OdometerRecord`), and the `ErrorCode` union type
- **FR-005**: The auction normalizer MUST convert raw Copart responses into the `AuctionListing` shape with correct field mapping (e.g., `lotNumberStr` → `lot_number`, `mkn` → `make`, `dd` → `damage_primary`). The `htsmn` field MUST be coerced to `has_keys: boolean` using case-insensitive truthy string matching: `"Yes"` → `true`, any other value (including `"No"`, `null`, `undefined`, empty string) → `false`
- **FR-006**: The auction normalizer MUST convert raw IAAI responses into the `AuctionListing` shape, including type coercions (`hasKeys: "YES"/"NO"` → `boolean`) and code-to-label mappings for the full known title code set: `SV` → `"Salvage"`, `CL` → `"Clean"`, `RB` → `"Rebuilt"`, `FL` → `"Flood"`, `NR` → `"Non-Repairable"`, `JK` → `"Junk"`, `MV` → `"Manufacturer Buyback"`, and any additional documented IAAI codes. Unknown codes MUST map to `"Unknown"` with a logged warning
- **FR-007**: The auction normalizer MUST handle unknown or missing fields gracefully by using sensible defaults and never throwing on unexpected input. Default values: `trim` → `null`, `damage_secondary` → `null`, `has_keys` → `false`, `odometer` → `null`, `odometer_status` → `null`, `color` → `null`, `engine` → `null`, `transmission` → `null`, `drive_type` → `null`, `fuel_type` → `null`, `cylinders` → `null`, `current_bid` → `null`, `buy_now_price` → `null`, `sale_date` → `null`, `sale_status` → `"UPCOMING"`, `final_bid` → `null`, `image_url` → `null`, `image_urls` → `[]`, `seller` → `null`, `grid_row` → `null`, `latitude` → `null`, `longitude` → `null`, `title_code` → `null`
- **FR-008**: The VIN decoder MUST validate VINs before making API calls: exactly 17 alphanumeric characters, rejecting I, O, and Q
- **FR-009**: The VIN decoder MUST return structured vehicle specifications including at minimum: year, make, model, trim, engine type, body class, drive type, fuel type, and transmission
- **FR-010**: The VIN decoder MUST support caching of results with a 90-day TTL via a pluggable `VinCache` interface (with `get(vin)` and `set(vin, result, ttl)` methods). A default `better-sqlite3` implementation MUST be provided (WAL mode, stored at `data/vin-cache.sqlite`, gitignored) and an in-memory LRU fallback MUST be available for testing. When no cache is injected, the decoder MUST still function correctly without caching. Failed decode attempts (API errors, timeouts) MUST be negatively cached for 5 minutes to prevent thundering herd against a failing NHTSA API
- **FR-011**: The MCP helpers MUST provide a bootstrap function that creates an MCP server supporting stdio, SSE, and WebSocket transports, selectable via environment variable (`TRANSPORT`) or function parameter
- **FR-012**: The browser pool MUST manage Playwright browser instance lifecycle (launch, reuse contexts, close), integrate the stealth plugin for fingerprint masking, and support proxy configuration via `PROXY_URL`
- **FR-013**: The priority queue MUST support five priority levels: `critical` (immediate bypass), `high`, `normal`, `low`, and `background`. Max wait targets are measured from when the request reaches the head of its priority bucket, not from enqueue time: `high` (target 2s head-of-queue), `normal` (target 5s), `low` (target 10s), `background` (target 30s). These targets are best-effort SLOs subject to the token bucket rate limit in FR-014; only `critical` provides a hard latency guarantee (see FR-016). When a non-critical request exceeds 2× its target wait time from enqueue, the queue SHOULD emit a `queue.wait_exceeded` warning metric but MUST NOT drop or error the request
- **FR-014**: The priority queue MUST enforce a global rate limit (configurable, default 1 request per 3 seconds) using a token bucket approach
- **FR-015**: The priority queue MUST guarantee that `low` and `background` tasks get at least 1 execution slot per 60 seconds even under sustained high-priority load (starvation prevention)
- **FR-016**: The priority queue MUST allow `critical` requests to bypass both queue ordering and the rate limit, guaranteeing processing within 100 milliseconds of enqueue. Burst protection for critical requests is the caller's responsibility
- **FR-017**: The tracing module MUST initialize OpenTelemetry with OTLP HTTP export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and be a complete no-op when unset
- **FR-018**: The tracing module MUST support custom span attributes: `tool.name`, `tool.source`, `tool.status`, `tool.duration_ms`, `cache.hit`, `queue.priority`, `queue.wait_ms`
- **FR-019**: The tracing module MUST use the span naming convention `{package}.{operation}` (e.g., `copart.search`, `cache.read`, `analyzer.pipeline`)

### Non-Functional Requirements

- **NFR-001**: All exported functions MUST be tree-shakeable (named exports only, no side effects at module scope)
- **NFR-002**: The shared package MUST have zero runtime dependencies beyond `@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, and `ws`
- **NFR-003**: The package MUST target Node.js 20+ and compile under `ES2022` target with TypeScript `strict: true`
- **NFR-004**: Browser pool MUST enforce a configurable maximum concurrency (default: 3 contexts) to bound memory usage
- **NFR-005**: All public API functions MUST include JSDoc documentation with `@example` tags

### Key Entities

- **AuctionListing**: The core normalized representation of a vehicle at auction. Includes identification (VIN, lot number), vehicle details (year, make, model, damage), auction state (bid, sale date, status), and location. Source-agnostic — both Copart and IAAI map to this shape.
- **ToolResponse**: The standard envelope for all MCP tool return values. Contains success/error state, optional cached/stale flags, and a timestamp. Ensures consistent error handling across all 7 MCP servers.
- **RiskFlag**: A warning or alert about a vehicle. Has a type (title wash, flood, odometer rollback, etc.), severity (info/warning/critical), and human-readable detail string.
- **DealAnalysis**: The complete output of analyzing a vehicle. Aggregates listing data, VIN decode, history reports, profit estimate, repair quote, deal score, risk flags, and optional vision analysis.
- **PriorityRequest**: A queued scrape request with an assigned priority level, enqueue timestamp, and the operation to execute. Ordered by priority then FIFO within each level.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Raw Copart and IAAI fixture data normalize to identical `AuctionListing` shapes with 100% field coverage — no `undefined` for required fields
- **SC-002**: VIN decoding for a valid VIN returns complete vehicle specs within 2 seconds on first call, and under 10 milliseconds on subsequent cached calls
- **SC-003**: All 7 MCP server packages can import and use shared types, helpers, and utilities without circular dependencies
- **SC-004**: The priority queue processes `critical` requests within 100 milliseconds of enqueue, regardless of queue depth
- **SC-005**: Under sustained high-priority load, `low` and `background` tasks still execute within their 60-second starvation guarantee
- **SC-006**: Enabling OpenTelemetry tracing adds less than 5% overhead to tool call latency. Unit tests validate a loose smoke-test bound (traced ≤ 2× untraced for no-op functions); the strict <5% threshold is validated during integration/load testing with `LIVE_TEST`
- **SC-007**: The browser pool reuses a single browser instance across multiple concurrent context requests, keeping peak memory usage proportional to context count, not browser count
- **SC-008**: All shared types compile with TypeScript strict mode enabled and produce zero type errors
- **SC-009**: The auction normalizer handles 100% of the full known IAAI title code set (`SV`, `CL`, `RB`, `FL`, `NR`, `JK`, `MV`) and degrades gracefully for unknown codes by mapping to `"Unknown"`

## Public API Surface

The following is the definitive export contract for `@car-auctions/shared`. All consumers import from this boundary; internal modules are not re-exported.

```typescript
// Types & interfaces (re-exported from types/index.ts)
export type {
  AuctionListing, CopartRawListing, IaaiRawListing,
  DealAnalysis, DealSummary, RiskFlag,
  VINDecodeResult, ProfitEstimate,
  RepairEstimate, RepairLineItem,
  CarrierQuote, ValueAdjustment,
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
export { decodeVin, validateVin, type VinCache, SqliteVinCache, InMemoryVinCache } from './vin-decoder'

// MCP server bootstrap
export { createMcpServer, type McpServerOptions } from './mcp-helpers'

// Browser pool
export { BrowserPool, type BrowserPoolOptions } from './browser-pool'

// Priority queue
export { PriorityQueue, type PriorityLevel, type PriorityRequest } from './priority-queue'

// OpenTelemetry tracing
export { initTracing, withSpan, type SpanAttributes } from './tracing'
```

Internal modules (e.g., parser helpers, IAAI code maps) MUST NOT be exported. Consumers that need access to internals should request a new public API.

## Clarifications

### Session 2026-04-06

- Q: How should critical requests interact with the rate limit, given FR-016 (respects rate limit) contradicts SC-004 (100ms guarantee)? → A: Critical requests bypass the rate limit entirely. The 100ms processing guarantee holds unconditionally. Burst protection for critical requests is the caller's responsibility.
- Q: Does the shared package ship a concrete SQLite VIN cache or only the VinCache interface? → A: Ship both — a VinCache interface, a concrete SqliteVinCache class (WAL mode, data/vin-cache.sqlite), and an InMemoryVinCache for testing. Consumers can inject their own or use the defaults.
- Q: Should the shared package export image-processing helpers (Sharp-based), or is sharp only used by individual scrapers? → A: Remove sharp from the shared package. Image processing is scraper-specific; each scraper owns its own sharp usage.
- Q: Should the normalizer's IAAI title code map be limited to SV/CL/RB or expanded to the full known set? → A: Expand to the full known set (SV, CL, RB, FL, NR, JK, MV, and others). Update SC-009 accordingly.
- Q: Should failed VIN decode attempts be cached to prevent repeated calls to a failing NHTSA API? → A: Yes. Cache failures for 5 minutes (negative cache) to prevent thundering herd against a down service.

## Assumptions

- The NHTSA vPIC API (`https://vpic.nhtsa.dot.gov/api/`) remains free and publicly accessible without authentication
- This library is consumed only by other packages within the same monorepo via npm workspace references (`@car-auctions/shared`)
- Browser pool consumers (scraper packages) run in Node.js 20+ environments with Playwright browsers pre-installed
- OpenTelemetry tracing targets an OTLP-compatible collector (e.g., Jaeger) and does not need to support vendor-specific exporters
- The priority queue operates as a per-process singleton; cross-process coordination is out of scope (each scraper process self-governs)
- The shared package ships a concrete `SqliteVinCache` (WAL mode, `data/vin-cache.sqlite`) and an `InMemoryVinCache` for testing. Consumers may inject their own `VinCache` implementation but are not required to provide one
- The library does not include its own test fixtures — fixture files for Copart/IAAI raw data live in the respective scraper package test directories
