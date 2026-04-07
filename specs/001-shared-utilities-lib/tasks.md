---

description: "Task list for @car-auctions/shared — Shared Utilities Library"
---

# Tasks: Shared Utilities Library (`@car-auctions/shared`)

**Input**: Design documents from `/specs/001-shared-utilities-lib/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/types.ts ✅, contracts/public-api.ts ✅, quickstart.md ✅
**Package root**: `packages/shared/`
**Tests**: Included — required by constitution Gate 4 (≥ 80% branch coverage; normalizer + priority queue tests mandatory)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no shared-state dependencies)
- **[Story]**: Which user story this task belongs to (US1–US6)
- Exact file paths are included in every task description

---

## Phase 1: Setup (Package Scaffolding)

**Purpose**: Create the `packages/shared/` directory skeleton, package manifests, and tooling configuration before any source code is written.

- [X] T001 Create package directory structure: `packages/shared/src/types/`, `packages/shared/src/normalizer/`, `packages/shared/src/vin-decoder/`, `packages/shared/tests/fixtures/`, `packages/shared/data/`
- [X] T002 Create `packages/shared/package.json` with name `@car-auctions/shared`, `"type": "module"`, all runtime dependencies (`@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `sharp`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/auto-instrumentations-node`, `ws`) and devDependencies (`vitest`, `typescript`, `@types/better-sqlite3`, `@types/ws`) per `specs/001-shared-utilities-lib/quickstart.md`
- [X] T003 [P] Create `packages/shared/tsconfig.json` extending `../../tsconfig.base.json` with `rootDir: "src"`, `outDir: "dist"`, `composite: true`, `declaration: true`, `declarationMap: true`, excluding `tests/` and `dist/`
- [X] T004 [P] Add gitignore entries for `packages/shared/data/` and `packages/shared/dist/` to root `.gitignore`
- [X] T005 Run `npm install` from repo root to resolve the new workspace package and install all dependencies in `packages/shared/node_modules/`

**Checkpoint**: `packages/shared/` directory exists with `package.json`, `tsconfig.json`, and all subdirectories; `npm install` exits zero

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared type contract and error hierarchy that every subsequent module depends on. No user-story work can begin until both files exist and type-check cleanly.

**⚠️ CRITICAL**: All Phase 3–8 tasks depend on these two files. They must be complete and passing `tsc --noEmit` before any user story implementation begins.

- [X] T006 Create `packages/shared/src/types/index.ts` implementing every interface from `specs/001-shared-utilities-lib/contracts/types.ts` verbatim: `AuctionListing`, `CopartRawListing`, `IaaiRawListing`, `DealAnalysis`, `VINDecodeResult`, `RiskFlag`, `DealSummary`, `ProfitEstimate`, `RepairEstimate`, `RepairLineItem`, `ValueAdjustment`, `CarrierQuote`, `ServiceRecord`, `RecallRecord`, `NmvtisTitleRecord`, `InsuranceLossRecord`, `JunkSalvageRecord`, `OdometerRecord`, `ErrorCode` union, `ToolResponse<T>`, `BrowserConfig`, `PriorityLevel`, `PriorityRequest<T>`, `SpanAttributes`, and placeholder interfaces `NMVTISResult`, `CarfaxSummary`, `TitleComparison`, `DamageImage`, `DamageClassification`, `PaintAnalysis`, `FrameInspection`
- [X] T007 [P] Create `packages/shared/src/errors.ts` implementing all five typed error classes: `ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`, `AnalysisError` — each extends `Error`, accepts a human-readable message and optional options object (`{ code?: ErrorCode; retryable?: boolean; retryAfterMs?: number }`), sets `this.name` to the class name, and is exported as a named export (no side-effects at module scope, per NFR-001)

**Checkpoint**: `cd packages/shared && npx tsc --noEmit` exits zero with zero errors on `src/types/index.ts` and `src/errors.ts`

---

## Phase 3: User Story 1 — Unified Auction Data Schema (Priority: P1) 🎯 MVP

**Goal**: Provide `normalizeCopart()` and `normalizeIaai()` functions that convert raw auction API responses into the shared `AuctionListing` shape, including IAAI type coercions and title-code-to-label mapping.

**Independent Test**: Pass the Copart and IAAI fixture JSON files through the normalizers and assert that output shapes are structurally identical, all required fields are populated (no `undefined`), `has_keys` is always a boolean, and all known IAAI `titleCode` values map to human-readable labels.

### Tests for User Story 1 ⚠️ Write FIRST — verify they FAIL before implementation

- [X] T008 [P] [US1] Create `packages/shared/tests/fixtures/copart-listing.json` with a representative raw Copart API response object including all mapped fields: `lotNumberStr`, `mkn`, `mmod`, `lcy`, `dd`, `sdd`, `orr`, `odometerBrand`, `la`, `dynamicBidAmount`, `bin`, `tims.full`, `ad`, `hk`, `ts`, `tt` — values must be realistic (e.g., a 2019 Honda Civic with front-end damage)
- [X] T009 [P] [US1] Create `packages/shared/tests/fixtures/iaai-listing.json` with a representative raw IAAI API response including: `stockNumber`, `year`, `makeName`, `modelName`, `primaryDamage`, `odometerReading`, `odometerUnit`, `branch`, `currentBid`, `saleDate`, `hasKeys: "YES"`, `titleCode: "SV"`, `images[0].url` — same vehicle as the Copart fixture for cross-source comparison
- [X] T010 [P] [US1] Create `packages/shared/tests/normalizer.test.ts` with test cases covering: (1) Copart fixture → `AuctionListing` with `source: 'copart'` and 100% required-field coverage, (2) IAAI fixture → `AuctionListing` with `source: 'iaai'`, `has_keys: true` (coerced from `"YES"`), `title_type: "Salvage"` (from `titleCode: "SV"`), (3) IAAI `hasKeys: "NO"` → `has_keys: false`, (4) unknown IAAI `titleCode` (e.g. `"ZZ"`) → `title_type: "Unknown"` without throwing, (5) both normalized listings have structurally identical shapes that can be compared without source-specific handling — import from `../../src/normalizer/index.js`
- [X] T011 [P] [US1] Create `packages/shared/tests/error-types.test.ts` with test cases covering all five error classes: each class sets `name` to its class name, accepts a message string, `RateLimitError` with `retryAfterMs` exposes the value, each error is an `instanceof Error`, and each error includes the correct `ErrorCode` — import from `../../src/errors.js`

### Implementation for User Story 1

- [X] T012 [US1] Create `packages/shared/src/normalizer/codes.ts` (internal — not re-exported) implementing `TITLE_CODE_MAP: Record<string, string>` with all known IAAI codes (`SV→Salvage`, `CL→Clean`, `RB→Rebuilt`, `FL→Flood`, `LM→Lemon Law`, `NT→Non-Transferable`, `EX→Export Only`, `PM→Parts Only`, `IN→Insurance Retained`) and `titleCodeToLabel(code: string): string` which returns the mapped label or `"Unknown"` and emits `console.warn` when the code is not found and `NODE_ENV !== 'production'`
- [X] T013 [P] [US1] Create `packages/shared/src/normalizer/copart.ts` (internal) implementing `normalizeCopartListing(raw: CopartRawListing): AuctionListing` with complete field mapping per `specs/001-shared-utilities-lib/data-model.md` Group 1 table: `lotNumberStr→lot_number`, `mkn→make`, `mmod→model`, `lcy→year`, `dd→damage_primary`, `sdd→damage_secondary`, `orr→odometer`, `odometerBrand→odometer_status`, `la→location`, `dynamicBidAmount→current_bid`, `bin→buy_it_now`, `tims.full[0]→thumbnail_url`, `ad→sale_date`, `hk→has_keys`, `ts→title_state`, `tt→title_type`; all missing optional fields default to `undefined`; required fields use sensible defaults (empty string / 0) and never throw on unexpected input
- [X] T014 [P] [US1] Create `packages/shared/src/normalizer/iaai.ts` (internal) implementing `normalizeIaaiListing(raw: IaaiRawListing): AuctionListing` with field mapping per data-model.md Group 1 IAAI table: `stockNumber→lot_number`, `makeName→make`, `modelName→model`, `odometerReading→odometer`, `branch→location`, `currentBid→current_bid`, `buyNowPrice→buy_it_now`, `images[0].url→thumbnail_url`; type coercions: `hasKeys: "YES"/"NO"` → `boolean` (any other value → `false`); `odometerUnit` → `odometer_status` enum; `titleCode` → `title_type` string via `titleCodeToLabel()`; `saleDate` → ISO 8601 string; `source` hardcoded to `'iaai'`
- [X] T015 [US1] Create `packages/shared/src/normalizer/index.ts` exporting `normalizeCopart(raw: CopartRawListing): AuctionListing` (delegates to `normalizeCopartListing`) and `normalizeIaai(raw: IaaiRawListing): AuctionListing` (delegates to `normalizeIaaiListing`) — these are the two public exports; `codes.ts`, `copart.ts`, and `iaai.ts` are NOT re-exported

**Checkpoint**: `npm test` in `packages/shared/` passes `normalizer.test.ts` and `error-types.test.ts`; User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 — VIN Decoding Across All Packages (Priority: P1)

**Goal**: Provide `validateVin()` and `decodeVin()` with pluggable `VinCache` interface, a production `SqliteVinCache` (WAL mode, 90-day TTL), and an in-memory `FifoVinCache` for testing.

**Independent Test**: Call `validateVin()` with valid and invalid VINs (wrong length, containing I/O/Q) and verify no network calls are made. Call `decodeVin()` with a mocked NHTSA response and verify field mapping. Call again with the same VIN via `FifoVinCache` and verify cache hit (mock not called a second time).

### Tests for User Story 2 ⚠️ Write FIRST — verify they FAIL before implementation

- [X] T016 [P] [US2] Create `packages/shared/tests/vin-decoder.test.ts` with test cases covering: (1) `validateVin('1HGBH41JXMN109186')` → `true`, (2) `validateVin('1HGBH41JXMN10918')` (16 chars) → `false`, (3) `validateVin('1HGBH41JXMN10918I')` (contains I) → `false`, (4) `validateVin('1HGBH41JXMN10918O')` (contains O) → `false`, (5) `validateVin('1HGBH41JXMN10918Q')` (contains Q) → `false`, (6) `decodeVin(vin)` with mocked fetch returning a representative NHTSA `DecodeVinValues` JSON response → returns `VINDecodeResult` with correct `year`, `make`, `model`, `body_class`, `drive_type`, `fuel_type`, `transmission`, (7) second call with `FifoVinCache` pre-populated → cache hit, fetch not called again, (8) `decodeVin(vin)` with no cache injected → still returns result (cache optional), (9) NHTSA response with `ErrorCode !== "0"` → `decode_notes` is non-empty in result

### Implementation for User Story 2

- [X] T017 [US2] Create `packages/shared/src/vin-decoder/nhtsa-client.ts` (internal) implementing `fetchVinFromNhtsa(vin: string): Promise<VINDecodeResult>` using `fetch` (Node 20 built-in) to call `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`; parse `Results[0]`; map fields per research.md Section 1 field mapping table; normalize `Make` to title case; parse `ModelYear`, `EngineCylinders`, `DisplacementL` to numbers; set `decode_notes` when `ErrorCode !== "0"`; throw `ScraperError` with code `'SCRAPER_ERROR'` on HTTP errors or empty results array
- [X] T018 [US2] Create `packages/shared/src/vin-decoder/sqlite-cache.ts` (internal) implementing: (a) `SqliteVinCache` class implementing `VinCache` interface — uses `better-sqlite3`, calls `db.pragma('journal_mode = WAL')` on open, creates `vin_cache` table with `vin TEXT PRIMARY KEY`, `result TEXT NOT NULL`, `cached_at INTEGER NOT NULL`, `expires_at INTEGER NOT NULL`, index on `expires_at`, `get(vin)` checks `expires_at > Date.now()`, `set(vin, result, ttlMs)` upserts, sweeps expired rows on open; database path defaults to `data/vin-cache.sqlite` relative to CWD; (b) `FifoVinCache` class implementing `VinCache` — uses `Map<string, { result, expiresAt }>` with insertion-order eviction at `maxSize = 200`, `get()` returns `null` for expired entries, `set()` evicts oldest-inserted key when at capacity
- [X] T019 [US2] Create `packages/shared/src/vin-decoder/index.ts` exporting: `validateVin(vin: string): boolean` (exactly 17 alphanumeric chars, no I/O/Q — pure function, no network), `decodeVin(vin: string, options?: { cache?: VinCache; ttlMs?: number }): Promise<VINDecodeResult>` (validates first, checks cache, fetches from NHTSA, stores in cache with 90-day default TTL), and `type VinCache` interface re-export — `nhtsa-client.ts`, `sqlite-cache.ts` are NOT re-exported

**Checkpoint**: `npm test` passes `vin-decoder.test.ts`; US1 and US2 are both independently testable

---

## Phase 5: User Story 3 — MCP Server Bootstrap (Priority: P2)

**Goal**: Provide `createMcpServer()` that bootstraps an MCP server with stdio, SSE, or WebSocket transport selected via `TRANSPORT` env var or function parameter, eliminating 7× boilerplate duplication.

**Independent Test**: Initialize with each transport mode (`stdio`, `sse`, `websocket`) and verify the server object is created, tools are registered, and the correct transport class is instantiated. (Full end-to-end transport testing requires consuming packages; unit test verifies branching logic.)

### Implementation for User Story 3

- [X] T020 [US3] Create `packages/shared/src/mcp-helpers.ts` implementing `McpServerOptions` interface (`name: string`, `version: string`, `capabilities: ServerCapabilities`, `registerTools: (server: Server) => void`, `transport?: 'stdio' | 'sse' | 'websocket'`, `port?: number`, `wsPort?: number`) and `createMcpServer(options: McpServerOptions): Promise<void>` — creates `new Server(...)`, calls `options.registerTools(server)`, then branches on `options.transport ?? process.env.TRANSPORT ?? 'stdio'`: `stdio` → `new StdioServerTransport()` + `server.connect()`, `sse` → `SSEServerTransport` on `process.env.PORT ?? options.port ?? 3000`, `websocket` → `WebSocketServerTransport` via `ws` `WebSocketServer` on `process.env.WS_PORT ?? options.wsPort ?? 3001`; export as named exports only (NFR-001); note that `express` is a peer dep in consuming packages (not added to `shared` per NFR-002)

**Checkpoint**: US3 module compiles with `tsc --noEmit`; consuming packages can import `{ createMcpServer }` from `@car-auctions/shared`

---

## Phase 6: User Story 4 — Shared Browser Pool (Priority: P2)

**Goal**: Provide `BrowserPool` class with Playwright browser lifecycle management, `playwright-extra` stealth plugin integration, proxy support via `PROXY_URL`, configurable `maxConcurrency`, and idempotent shutdown.

**Independent Test**: Instantiate `BrowserPool`, call `getContext()` twice and verify both contexts are issued from a single underlying browser instance (same `browser` object), call `shutdown()` twice and verify second call is a no-op (no error thrown), verify `getContext()` throws `ScraperError` when concurrency limit is reached.

### Implementation for User Story 4

- [X] T021 [US4] Create `packages/shared/src/browser-pool.ts` implementing `BrowserPoolOptions` interface (all `BrowserConfig` fields plus `maxConcurrency: number` defaulting to `3`) and `BrowserPool` class with: private `_browser: Browser | null`, `_contextCount: number`, `_shutdownPromise: Promise<void> | null`; `constructor(options: BrowserPoolOptions)` applies `chromium.use(stealth())` from `playwright-extra` + `puppeteer-extra-plugin-stealth` once before first launch; `getContext(config?: Partial<BrowserPoolOptions>): Promise<BrowserContext>` lazily launches browser using merged config (proxy from `config.proxyUrl ?? process.env.PROXY_URL`, headless defaults `true`), throws `ScraperError` with code `'SCRAPER_ERROR'` when `_contextCount >= maxConcurrency`, increments counter, returns new context from `_browser.newContext({ viewport })`; `releaseContext(ctx: BrowserContext): Promise<void>` closes context and decrements counter (floor at 0); `shutdown(): Promise<void>` caches shutdown promise in `_shutdownPromise` for idempotency, closes browser, nulls `_browser`; export as named exports only

**Checkpoint**: US4 module compiles; `BrowserPool` can be instantiated and `shutdown()` called twice without error in unit tests

---

## Phase 7: User Story 5 — Priority-Aware Request Queue (Priority: P2)

**Goal**: Provide `PriorityQueue` with five priority tiers, token-bucket rate limiting (1 req/3s default), `critical` bypass ordering, and starvation prevention guaranteeing `low`/`background` tasks execute within 60 seconds under sustained high-priority load.

**Independent Test**: Enqueue `critical`, `high`, `normal`, `low`, `background` requests; verify `critical` is dequeued first; simulate 60 seconds of `high` load and verify `low` request still executes within the starvation window; verify token bucket prevents more than 1 request per 3 seconds (except within a single `critical` burst).

### Tests for User Story 5 ⚠️ Write FIRST — verify they FAIL before implementation

- [X] T022 [P] [US5] Create `packages/shared/tests/priority-queue.test.ts` with test cases covering: (1) `critical` request executes before `high`/`normal` requests enqueued earlier, (2) token bucket limits dequeue rate to configured interval (use fake timers via `vi.useFakeTimers()`), (3) `low` request receives a guaranteed execution slot when `lastServedAt` for `'low'` tier exceeds `starvationThresholdMs` (60s), (4) FIFO ordering within same priority tier, (5) `enqueue('background', fn)` returns a Promise that resolves with `fn`'s return value, (6) queue with `rateLimitIntervalMs: 100` processes requests at the configured rate — import from `../../src/priority-queue.js`

### Implementation for User Story 5

- [X] T023 [US5] Create `packages/shared/src/priority-queue.ts` implementing: (a) internal `TokenBucket` class with `tryConsume(): boolean` and lazy `refill()` using `tokensAvailable`, `lastRefillTime`, `maxTokens`, `refillIntervalMs` per research.md Section 2 algorithm; (b) `PriorityQueue` class with `constructor(options?: { rateLimitIntervalMs?: number; starvationThresholdMs?: number })` (defaults: `3000ms`, `60000ms`), private `Map<PriorityLevel, PriorityRequest[]>` per tier, `lastServedAt: Map<PriorityLevel, number>`, and async dispatch loop; `enqueue<T>(priority: PriorityLevel, fn: () => Promise<T>): Promise<T>` — `critical` requests skip queue ordering but still consume a token (FR-016); non-critical requests are pushed to their tier queue and await dispatch; dispatch loop checks starvation thresholds for `low`/`background` tiers before normal priority selection per research.md Section 2 starvation prevention algorithm; export `PriorityQueue`, `PriorityLevel`, `PriorityRequest` as named exports only

**Checkpoint**: `npm test` passes `priority-queue.test.ts`; all 6 user stories are now independently testable

---

## Phase 8: User Story 6 — OpenTelemetry Tracing (Priority: P3)

**Goal**: Provide opt-in `initTracing()` (no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset) and `withSpan()` wrapper that emits spans with required `tool.*`, `cache.hit`, `queue.*` attributes when tracing is active.

**Independent Test**: Call `initTracing('test-service')` without setting `OTEL_EXPORTER_OTLP_ENDPOINT` and verify `withSpan()` is a pure pass-through (no spans emitted, no SDK started). Set the env var, call `initTracing()` with a mock OTLP exporter, execute `withSpan()`, and verify a span with correct name and attributes was recorded.

### Implementation for User Story 6

- [X] T024 [US6] Create `packages/shared/src/tracing.ts` implementing: module-level `let _tracingInitialized = false`; `initTracing(serviceName: string): void` — early-returns (no-op) when `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` is falsy or `_tracingInitialized` is already `true`; otherwise starts `NodeSDK` with `OTLPTraceExporter` pointed at the env var URL and `getNodeAutoInstrumentations()`, sets `_tracingInitialized = true`; `withSpan<T>(name: string, attrs: Partial<SpanAttributes>, fn: () => Promise<T>): Promise<T>` — when `!_tracingInitialized` returns `fn()` directly (zero overhead); when active, starts span via `trace.getTracer('car-auctions').startActiveSpan(name, ...)`, sets all provided attributes, records `tool.duration_ms` in finally block, sets `SpanStatusCode.ERROR` on rejection, calls `span.end()` in finally; OTLP export errors are swallowed (fire-and-forget); export `initTracing`, `withSpan`, `type SpanAttributes` as named exports only

**Checkpoint**: `packages/shared/src/tracing.ts` compiles; `withSpan()` without `OTEL_EXPORTER_OTLP_ENDPOINT` returns `fn()` result with no observable overhead

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Assemble the public barrel, add JSDoc documentation, validate the full build, and run quickstart acceptance scenarios.

- [X] T025 Create `packages/shared/src/index.ts` as the public barrel re-exporting the complete API surface per `specs/001-shared-utilities-lib/spec.md § Public API Surface`: `export type { AuctionListing, CopartRawListing, IaaiRawListing, DealAnalysis, DealSummary, RiskFlag, VINDecodeResult, ProfitEstimate, RepairEstimate, RepairLineItem, CarrierQuote, ValueAdjustment, BrowserConfig, ToolResponse, ErrorCode, ServiceRecord, RecallRecord, NmvtisTitleRecord, InsuranceLossRecord, JunkSalvageRecord, OdometerRecord }` from `./types/index.js`; `export { ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError }` from `./errors.js`; `export { normalizeCopart, normalizeIaai }` from `./normalizer/index.js`; `export { decodeVin, validateVin, type VinCache }` from `./vin-decoder/index.js`; `export { createMcpServer, type McpServerOptions }` from `./mcp-helpers.js`; `export { BrowserPool, type BrowserPoolOptions }` from `./browser-pool.js`; `export { PriorityQueue, type PriorityLevel, type PriorityRequest }` from `./priority-queue.js`; `export { initTracing, withSpan, type SpanAttributes }` from `./tracing.js`; no internal modules re-exported (NFR-001)
- [X] T026 [P] Add JSDoc `@param`, `@returns`, `@throws`, and `@example` tags to all public API functions in `packages/shared/src/` per NFR-005: `normalizeCopart`, `normalizeIaai`, `validateVin`, `decodeVin`, `createMcpServer`, `BrowserPool.getContext`, `BrowserPool.releaseContext`, `BrowserPool.shutdown`, `PriorityQueue.enqueue`, `initTracing`, `withSpan`
- [X] T027 [P] Run `cd packages/shared && npx tsc --noEmit` and resolve any remaining TypeScript strict-mode errors (strict: true, ES2022 target, Node16 module); confirm zero errors and zero `any` types in `src/`
- [X] T028 [P] Run `cd packages/shared && npm test` and confirm all test files pass (`normalizer.test.ts`, `vin-decoder.test.ts`, `priority-queue.test.ts`, `error-types.test.ts`) with ≥ 80% branch coverage per constitution Gate 4
- [X] T029 Run `npm run build` in `packages/shared/` to produce `dist/` output and verify `dist/index.js` and `dist/index.d.ts` exist; confirm tree-shaking works by checking that importing only `{ normalizeCopart }` does not pull in browser-pool or tracing modules
- [X] T030 Validate quickstart.md scenarios: (1) create a scratch script importing `{ normalizeCopart, normalizeIaai, validateVin }` from `@car-auctions/shared` via workspace reference and confirm it runs without errors; (2) verify `data/vin-cache.sqlite` is gitignored and not present in `git status`

**Checkpoint**: Full build passes, all tests green, ≥ 80% branch coverage, barrel exports complete, `packages/shared` is consumable by all 7 downstream MCP server packages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion → **BLOCKS all user stories**
- **US1 (Phase 3)**: Depends on Phase 2 (types + errors) — no other story dependencies
- **US2 (Phase 4)**: Depends on Phase 2 (types + errors) — no dependency on US1
- **US3 (Phase 5)**: Depends on Phase 2 (types + errors) — no dependency on US1/US2
- **US4 (Phase 6)**: Depends on Phase 2 (types + errors, particularly `ScraperError` and `BrowserConfig`) — no dependency on US1/US2/US3
- **US5 (Phase 7)**: Depends on Phase 2 (types + errors, particularly `PriorityLevel`/`PriorityRequest`) — no dependency on US1–US4
- **US6 (Phase 8)**: Depends on Phase 2 (types + errors, particularly `SpanAttributes`) — no dependency on US1–US5
- **Polish (Phase 9)**: Depends on all Phase 3–8 tasks being complete

### User Story Dependencies

| Story | Depends On | Independently Testable? |
|-------|-----------|------------------------|
| US1 – Normalizer | Phase 2 only | ✅ Yes — fixture-driven, no network |
| US2 – VIN Decoder | Phase 2 only | ✅ Yes — NHTSA mockable in tests |
| US3 – MCP Bootstrap | Phase 2 only | ✅ Yes — transport classes mockable |
| US4 – Browser Pool | Phase 2 only | ✅ Yes — launch mockable with `vi.mock` |
| US5 – Priority Queue | Phase 2 only | ✅ Yes — pure TypeScript, fake timers |
| US6 – OTel Tracing | Phase 2 only | ✅ Yes — mock OTLP exporter |

### Within Each User Story

1. Test fixtures/test files MUST exist and FAIL before implementation begins
2. Internal modules before public index (e.g., `codes.ts` before `normalizer/index.ts`)
3. Low-level helpers before higher-level wrappers (e.g., `nhtsa-client.ts` before `vin-decoder/index.ts`)
4. Implementation before polish (JSDoc, barrel)

---

## Parallel Opportunities

### Phase 3 (US1): Parallel on separate files

```bash
# These four tasks have no intra-story dependency — launch simultaneously:
Task T008: "Create tests/fixtures/copart-listing.json"
Task T009: "Create tests/fixtures/iaai-listing.json"
Task T010: "Create tests/normalizer.test.ts"
Task T011: "Create tests/error-types.test.ts"

# Then, once codes.ts exists (T012), these can run simultaneously:
Task T013: "Create src/normalizer/copart.ts"
Task T014: "Create src/normalizer/iaai.ts"
```

### Phase 4 (US2): Tests then implementation pipeline

```bash
# Tests first (parallel with other story work):
Task T016: "Create tests/vin-decoder.test.ts"

# Then implementation in order:
Task T017: "Create src/vin-decoder/nhtsa-client.ts"   # → feeds T018
Task T018: "Create src/vin-decoder/sqlite-cache.ts"   # → feeds T019
Task T019: "Create src/vin-decoder/index.ts"
```

### Phases 5–8: All four can run in parallel (completely independent files)

```bash
# Once Phase 2 is complete, all four can run simultaneously:
Task T020: "Create src/mcp-helpers.ts"          (US3)
Task T021: "Create src/browser-pool.ts"         (US4)
Task T022+T023: "Create src/priority-queue.ts"  (US5)
Task T024: "Create src/tracing.ts"              (US6)
```

### Phase 9 (Polish): Parallel tasks

```bash
Task T026: "Add JSDoc @example tags"            (independent)
Task T027: "Run tsc --noEmit"                   (independent)
Task T028: "Run npm test with coverage"         (independent)
Task T029: "Run npm run build"                  (independent)
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

The two P1 stories together constitute the minimum viable library — all other packages can import normalized listings and decode VINs.

1. Complete **Phase 1**: Setup (T001–T005)
2. Complete **Phase 2**: Foundational (T006–T007) — **critical blocker**
3. Complete **Phase 3**: US1 Normalizer (T008–T015)
4. Complete **Phase 4**: US2 VIN Decoder (T016–T019)
5. Create a minimal **barrel** with just types, errors, normalizer, vin-decoder exports
6. **STOP and VALIDATE**: Confirm consuming packages can `import { normalizeCopart, decodeVin } from '@car-auctions/shared'`

### Incremental Delivery

1. Foundation → Normalizer + Types → **Consumable by Copart/IAAI scrapers** (MVP)
2. Add VIN Decoder → **Consumable by deal analyzer**
3. Add MCP Bootstrap → **Reduces boilerplate in all 7 MCP servers**
4. Add Browser Pool → **Shared resource for co-located scrapers**
5. Add Priority Queue → **Rate limiting + prioritization for all scrapers**
6. Add OTel Tracing → **Production observability**
7. Assemble barrel + Polish → **Publish to workspace**

### Parallel Team Strategy

With multiple developers and Phase 2 complete:

- **Developer A**: US1 (normalizer) — T008–T015
- **Developer B**: US2 (VIN decoder) — T016–T019
- **Developer C**: US3 + US4 + US5 + US6 — T020–T024 (all touch different files)
- **All**: Polish phase (T025–T030) together after all modules complete

---

## Task Summary

| Phase | Stories | Tasks | Notes |
|-------|---------|-------|-------|
| Phase 1: Setup | — | T001–T005 | 5 tasks — scaffolding |
| Phase 2: Foundational | — | T006–T007 | 2 tasks — BLOCKS all stories |
| Phase 3: US1 Normalizer | P1 | T008–T015 | 8 tasks (4 test, 4 impl) |
| Phase 4: US2 VIN Decoder | P1 | T016–T019 | 4 tasks (1 test, 3 impl) |
| Phase 5: US3 MCP Bootstrap | P2 | T020 | 1 task |
| Phase 6: US4 Browser Pool | P2 | T021 | 1 task |
| Phase 7: US5 Priority Queue | P2 | T022–T023 | 2 tasks (1 test, 1 impl) |
| Phase 8: US6 OTel Tracing | P3 | T024 | 1 task |
| Phase 9: Polish | — | T025–T030 | 6 tasks |
| **Total** | **6 stories** | **T001–T030** | **30 tasks** |

**Parallel opportunities identified**: 14 tasks marked `[P]`  
**MVP scope**: Phases 1–4 (T001–T019) — types, errors, normalizer, VIN decoder  
**Suggested delivery**: MVP in ~2 days; full library in ~4 days with parallel execution

---

## Notes

- `[P]` tasks target different files with no shared write dependencies — safe to run concurrently
- `[Story]` labels map tasks to user stories for independent delivery tracking
- Tests (T008–T011, T016, T022) MUST be written before implementation and confirmed FAILING first
- All source files use `.js` extension in import paths (required for `"module": "Node16"` ESM)
- `data/vin-cache.sqlite` is gitignored — never commit runtime SQLite files
- Internal modules (`codes.ts`, `copart.ts`, `iaai.ts`, `nhtsa-client.ts`, `sqlite-cache.ts`) MUST NOT appear in `src/index.ts` exports
- `BrowserPool` and `PriorityQueue` are exported classes (not singletons) — consuming packages control lifecycle
- `initTracing()` is idempotent — safe to call multiple times in gateway co-location scenarios
- Commit after each logical checkpoint (after each story phase) to enable bisecting
