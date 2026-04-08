# Tasks: Shared Utilities Library

**Input**: Design documents from `/specs/001-shared-utilities-lib/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/public-api.md ✅, quickstart.md ✅

**Tests**: Included — the spec explicitly requires Vitest tests (≥80% branch coverage on tools/parser files) and defines test layers (normalizer, vin-decoder, priority-queue, errors, tracing).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the `packages/shared` workspace package with TypeScript, dependencies, and project structure

- [X] T001 Create `packages/shared/package.json` with name `@car-auctions/shared`, ES2022 target, and all runtime dependencies (`@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `ws`) plus dev dependencies (`vitest`, `typescript`, `@types/better-sqlite3`, `@types/ws`)
- [X] T002 Create `packages/shared/tsconfig.json` with `strict: true`, `ES2022` target, `Node16` module resolution, `declaration: true`, `declarationMap: true`, composite project settings
- [X] T003 [P] Create directory scaffolding per plan.md: `src/types/`, `src/normalizer/`, `src/vin-decoder/`, `src/mcp-helpers/`, `src/browser-pool/`, `src/priority-queue/`, `src/tracing/`, `tests/fixtures/`, `data/` and add `data/` to `.gitignore`
- [X] T004 [P] Configure Vitest in `packages/shared/vitest.config.ts` with TypeScript support and coverage thresholds (80% branch coverage)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, error classes, and ToolResponse envelope that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Implement all shared TypeScript interfaces in `packages/shared/src/types/index.ts`: `AuctionListing`, `CopartRawListing`, `IaaiRawListing`, `DealAnalysis`, `DealSummary`, `RiskFlag`, `VINDecodeResult`, `ProfitEstimate`, `RepairEstimate`, `RepairLineItem`, `CarrierQuote`, `ValueAdjustment`, `BrowserConfig`, `ToolResponse<T>`, `ToolError`, `ErrorCode`, `StaleableResponse<T>` (constitution II.1 compliance — `{ data: T; stale: true; cachedAt: string }`), `ServiceRecord`, `RecallRecord`, `NmvtisTitleRecord`, `InsuranceLossRecord`, `JunkSalvageRecord`, `OdometerRecord`, `McpServerOptions`, `BrowserPoolOptions`, `PriorityLevel`, `PriorityRequest`, `SpanAttributes`, `VinCache` interface — per data-model.md and contracts/public-api.md
- [X] T006 Implement error classes in `packages/shared/src/errors.ts`: base `AppError` (abstract, with `code`, `retryable`, `retryAfterMs`, `toToolError()` method), `ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`, `AnalysisError` — per error class contract in contracts/public-api.md
- [X] T007 [P] Write error class tests in `packages/shared/tests/errors.test.ts`: verify each class sets correct `code`, `retryable` default, `toToolError()` serialization to `ToolError` shape, and `instanceof` checks
- [X] T008 Create barrel export `packages/shared/src/index.ts` re-exporting all types, error classes, and placeholder exports for normalizer, vin-decoder, mcp-helpers, browser-pool, priority-queue, and tracing modules — per contracts/public-api.md barrel definition

**Checkpoint**: Foundation ready — shared types and error classes available for all user stories

---

## Phase 3: User Story 1 — Unified Auction Data Schema (Priority: P1) 🎯 MVP

**Goal**: Raw Copart and IAAI JSON normalizes to identical `AuctionListing` shapes with 100% required-field coverage

**Independent Test**: Pass raw Copart/IAAI fixture JSON through normalizers, verify output matches `AuctionListing` schema with correct field mappings, type coercions, and title code normalization

### Tests for User Story 1

- [X] T009 [P] [US1] Create Copart raw fixture JSON in `packages/shared/tests/fixtures/copart-raw-listing.json` with realistic data covering all `CopartRawListing` fields including `lotNumberStr`, `mkn`, `mdn`, `lcy`, `dd`, `sdd`, `tims`, `dynamicLotDetails.currentBid`, `fv`, `ld`, `tmtp`, `orr`, `clr`, `egn`, `tsmn`, `htsmn`
- [X] T010 [P] [US1] Create IAAI raw fixture JSON in `packages/shared/tests/fixtures/iaai-raw-listing.json` with realistic data covering all `IaaiRawListing` fields including `hasKeys: "YES"`, `titleCode: "SV"`, `odometer` as string, `imageUrls` object
- [X] T011 [P] [US1] Create minimal/edge-case fixtures in `packages/shared/tests/fixtures/copart-raw-minimal.json` and `packages/shared/tests/fixtures/iaai-raw-minimal.json` with missing optional fields, unknown title codes, empty arrays
- [X] T012 [US1] Write normalizer tests in `packages/shared/tests/normalizer.test.ts`: Copart fixture → `AuctionListing` (all required fields populated, `source: 'copart'`), IAAI fixture → `AuctionListing` (boolean coercion, title code map for SV/CL/RB/FL/NR/JK/MV, unknown code → "Unknown"), structural identity between normalized Copart and IAAI outputs, graceful handling of missing/unknown fields with defaults

### Implementation for User Story 1

- [X] T013 [P] [US1] Implement Copart normalizer in `packages/shared/src/normalizer/copart.ts`: `normalizeCopart(raw: CopartRawListing): AuctionListing` — pure function, never throws, maps all fields per data-model.md CopartRawListing mapping table, defaults `image_urls` to `[]`, sets `fetched_at` to current ISO timestamp
- [X] T014 [P] [US1] Implement IAAI normalizer in `packages/shared/src/normalizer/iaai.ts`: `normalizeIaai(raw: IaaiRawListing): AuctionListing` — pure function, `hasKeys` string→boolean coercion, `titleCode` map (SV→Salvage, CL→Clean, RB→Rebuilt, FL→Flood, NR→Non-Repairable, JK→Junk, MV→Manufacturer Buyback, unknown→"Unknown" with `console.warn`), `odometer` string→number, defaults for missing fields
- [X] T015 [US1] Create normalizer barrel in `packages/shared/src/normalizer/index.ts` re-exporting `normalizeCopart` and `normalizeIaai`
- [X] T016 [US1] Update barrel export in `packages/shared/src/index.ts` to wire up normalizer exports

**Checkpoint**: Normalizer complete — `normalizeCopart` and `normalizeIaai` both produce valid `AuctionListing` shapes, all tests pass

---

## Phase 4: User Story 2 — VIN Decoding Across All Packages (Priority: P1)

**Goal**: Single VIN decoder with validation, NHTSA vPIC API client, SQLite + LRU caching (90-day TTL), and 5-minute negative cache

**Independent Test**: Decode known VIN → verify structured `VINDecodeResult`; invalid VIN → rejected without API call; cached VIN → returned without API call; failed decode → negatively cached for 5 min

### Tests for User Story 2

- [X] T017 [P] [US2] Create NHTSA vPIC fixture JSON in `packages/shared/tests/fixtures/nhtsa-decode-response.json` with a realistic `DecodeVinValues` response (Honda Accord 2003 example from research.md)
- [X] T018 [US2] Write VIN decoder tests in `packages/shared/tests/vin-decoder.test.ts`: `validateVin` (valid 17-char → `{ valid: true }`, too short → error, contains I/O/Q → error, non-alphanumeric → error); `decodeVin` with mocked fetch (valid VIN → `VINDecodeResult` with correct field mapping, invalid VIN → throws before API call); cache hit test (InMemoryVinCache seeded → no fetch call); negative cache test (failed decode → cached for 5 min → second call returns cached error)

### Implementation for User Story 2

- [X] T019 [P] [US2] Implement VIN validator in `packages/shared/src/vin-decoder/validator.ts`: `validateVin(vin: string): { valid: boolean; error?: string }` — 17 alphanumeric chars, reject I/O/Q, pure function
- [X] T020 [P] [US2] Implement in-memory VIN cache in `packages/shared/src/vin-decoder/memory-cache.ts`: `InMemoryVinCache` class implementing `VinCache` interface — LRU eviction, max 200 entries, TTL-aware get/set
- [X] T021 [P] [US2] Implement SQLite VIN cache in `packages/shared/src/vin-decoder/sqlite-cache.ts`: `SqliteVinCache` class implementing `VinCache` interface — `better-sqlite3`, WAL mode, `data/vin-cache.sqlite`, prepared statements, TTL-based expiry on get, auto-create table on instantiation
- [X] T022 [US2] Implement VIN decoder in `packages/shared/src/vin-decoder/decoder.ts`: `decodeVin(vin: string, options?: { cache?: VinCache }): Promise<VINDecodeResult>` — validates VIN first (throws on invalid), checks cache, calls NHTSA `DecodeVinValues` endpoint, maps response fields per research.md mapping table, caches on success (90-day TTL), negatively caches failures (5-min TTL), throws `ScraperError` on API failure
- [X] T023 [US2] Create VIN decoder barrel in `packages/shared/src/vin-decoder/index.ts` re-exporting `decodeVin`, `validateVin`, `VinCache` type, `SqliteVinCache`, `InMemoryVinCache`
- [X] T024 [US2] Update barrel export in `packages/shared/src/index.ts` to wire up VIN decoder exports

**Checkpoint**: VIN decoder complete — validation rejects bad VINs, decode returns structured specs, caching works with both SQLite and in-memory backends, all tests pass

---

## Phase 5: User Story 3 — MCP Server Bootstrap (Priority: P2)

**Goal**: Single `createMcpServer` helper that bootstraps stdio, SSE, or WebSocket transport, selectable via env var or parameter

**Independent Test**: Create MCP server with each transport mode, verify it initializes without error and accepts the transport configuration

### Tests for User Story 3

- [X] T025a [P] [US3] Write MCP server bootstrap tests in `packages/shared/tests/mcp-helpers.test.ts`: `createMcpServer` with `transport: 'stdio'` returns an `McpServer` instance; `transport: 'sse'` with mock HTTP server initializes on specified `port`; `transport: 'websocket'` with mock `ws` server initializes on specified `wsPort`; default transport falls back to `process.env.TRANSPORT` then `'stdio'`; invalid transport value throws; verify each transport mode accepts an MCP tool registration after creation

### Implementation for User Story 3

- [X] T025 [US3] Implement MCP server bootstrap in `packages/shared/src/mcp-helpers/index.ts`: `createMcpServer(options: McpServerOptions): Promise<McpServer>` — imports `McpServer` from SDK, `StdioServerTransport` for stdio, `SSEServerTransport` for SSE (with Express/http server on `options.port`), custom `ws`-based `WebSocketTransport` adapter for WebSocket (per research.md decision), default transport from `process.env.TRANSPORT || 'stdio'`, default ports from env vars
- [X] T026 [US3] Update barrel export in `packages/shared/src/index.ts` to wire up MCP helper exports

**Checkpoint**: MCP bootstrap complete — `createMcpServer` returns a configured `McpServer` ready for tool registration

---

## Phase 6: User Story 4 — Shared Browser Pool (Priority: P2)

**Goal**: Playwright browser pool with stealth, proxy support, configurable concurrency, reference-counted shutdown

**Independent Test**: Acquire multiple contexts from pool → verify single browser instance shared; release all contexts → shutdown cleanly; exceed max contexts → queue rather than spawn

### Tests for User Story 4

- [X] T027a [P] [US4] Write browser pool tests in `packages/shared/tests/browser-pool.test.ts`: `acquireContext()` returns a `BrowserContext`; multiple `acquireContext()` calls share a single browser instance; exceeding `maxContexts` queues the request until a context is released; `releaseContext()` makes the context available to queued waiters; `shutdown()` is idempotent (calling twice does not throw); stealth plugin is applied when `stealthEnabled: true` (default); proxy configuration is forwarded when `proxyUrl` is set; pool with all contexts released shuts down cleanly with no orphaned processes

### Implementation for User Story 4

- [X] T027 [US4] Implement browser pool in `packages/shared/src/browser-pool/index.ts`: `BrowserPool` class — lazy browser launch on first `acquireContext()`, `chromium.use(stealth)` once before launch (per research.md), proxy from `options.proxyUrl ?? process.env.PROXY_URL`, max concurrency via `options.maxContexts` (default 3) with queuing beyond limit, `releaseContext()` returns context to pool and serves queued waiters, `shutdown()` idempotent and reference-counted (closes browser only when all contexts released), export `BrowserPoolOptions` type
- [X] T028 [US4] Update barrel export in `packages/shared/src/index.ts` to wire up browser pool exports

**Checkpoint**: Browser pool complete — stealth applied, proxy configurable, concurrency bounded, shutdown idempotent

---

## Phase 7: User Story 5 — Priority-Aware Request Queue (Priority: P2)

**Goal**: 5-level priority queue with token bucket rate limiting, critical bypass, and starvation prevention for low/background tasks

**Independent Test**: Enqueue requests at all 5 levels → verify dequeue order; sustained high-priority load → low/background still execute within 60s; critical → processed within 100ms bypassing rate limit

### Tests for User Story 5

- [X] T029 [US5] Write priority queue tests in `packages/shared/tests/priority-queue.test.ts`: ordering (critical > high > normal > low > background), FIFO within same level, critical bypass (processed <100ms regardless of queue depth), rate limiting (1 req/3s token bucket enforced for non-critical), starvation prevention (low/background guaranteed ≥1 slot per 60s under sustained high load), `start()`/`stop()` lifecycle, `pending` count accuracy, head-of-queue wait target validation (high request at head served within 2s of reaching head, not from enqueue time)

### Implementation for User Story 5

- [X] T030 [US5] Implement priority queue in `packages/shared/src/priority-queue/index.ts`: `PriorityQueue` class — 5 priority levels per `PriorityLevel` type, token bucket rate limiter (default 1 req/3s configurable via `options.rateLimit.requestsPerSecond`), critical requests bypass queue and rate limit (immediate execution), starvation prevention timer (≥1 low/background slot per 60s), `enqueue(request: PriorityRequest)`, `start()`, `stop()`, readonly `pending` and `processing` properties, export `PriorityLevel` and `PriorityRequest` types
- [X] T031 [US5] Update barrel export in `packages/shared/src/index.ts` to wire up priority queue exports

**Checkpoint**: Priority queue complete — ordering correct, rate limiting enforced, starvation prevented, critical bypass works, all tests pass

---

## Phase 8: User Story 6 — OpenTelemetry Tracing (Priority: P3)

**Goal**: Opt-in OpenTelemetry tracing with OTLP HTTP export, no-op when unconfigured, custom span attributes per spec

**Independent Test**: Init with mock exporter → execute instrumented operation → verify spans emitted with correct names, attributes, and parent-child relationships; init without endpoint → verify zero overhead no-op

### Tests for User Story 6

- [X] T032 [US6] Write tracing tests in `packages/shared/tests/tracing.test.ts`: `initTracing` with `OTEL_EXPORTER_OTLP_ENDPOINT` set → spans emitted to mock/in-memory exporter; `initTracing` without env var → no-op (no spans emitted, zero overhead); `withSpan` emits span with correct `name`, custom `SpanAttributes` (`tool.name`, `tool.source`, `cache.hit`, `queue.priority`, `queue.wait_ms`), auto-measured `tool.duration_ms`; error in wrapped function → span status set to ERROR; idempotent `initTracing` calls; `OTEL_EXPORTER_OTLP_ENDPOINT` set to unreachable URL (e.g., `http://localhost:1`) → `initTracing` completes without throwing, `withSpan` executes wrapped function and returns result normally (silent failure, no crash); overhead smoke test: execute a no-op async function 100× with tracing active vs. no-op provider, assert mean traced latency is within 2× of untraced (loose bound safe for CI — SC-006’s strict <5% validated in integration/load tests)

### Implementation for User Story 6

- [X] T033 [US6] Implement tracing module in `packages/shared/src/tracing/index.ts`: `initTracing({ serviceName })` — when `OTEL_EXPORTER_OTLP_ENDPOINT` set: configure `NodeSDK` with OTLP HTTP exporter and service name resource; when unset: register no-op provider; idempotent. `withSpan<T>(name: string, attrs: SpanAttributes, fn: () => Promise<T>): Promise<T>` — creates span with `{package}.{operation}` naming, sets custom attributes, auto-records `tool.duration_ms`, sets ERROR status on exception (no stack trace), re-throws. Export `SpanAttributes` type
- [X] T034 [US6] Update barrel export in `packages/shared/src/index.ts` to wire up tracing exports

**Checkpoint**: Tracing complete — opt-in with OTLP export, no-op when unconfigured, custom attributes on spans, all tests pass

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, build verification, and documentation

- [x] T035 [P] Verify TypeScript compilation with `strict: true` — run `tsc --noEmit` from `packages/shared/` and fix any type errors
- [x] T035a [P] Verify no circular dependencies — run a static import analysis (e.g., `madge --circular packages/shared/src/`) and confirm zero cycles between internal modules
- [x] T036 [P] Verify all Vitest tests pass — run `npx vitest run` from `packages/shared/` and confirm ≥80% branch coverage on normalizer and vin-decoder
- [x] T037 [P] Add JSDoc documentation with `@example` tags to all public API functions in `packages/shared/src/index.ts` barrel and each module's exported functions per NFR-005
- [x] T038 Validate barrel export completeness in `packages/shared/src/index.ts` against contracts/public-api.md — ensure every type, class, function, and interface listed in the contract is re-exported
- [x] T039 Run quickstart.md validation — verify all code examples from `specs/001-shared-utilities-lib/quickstart.md` are compatible with the implemented API surface (import paths, function signatures, option shapes)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — **BLOCKS all user stories**
- **US1 Normalizer (Phase 3)**: Depends on Phase 2 (needs `AuctionListing`, `CopartRawListing`, `IaaiRawListing` types)
- **US2 VIN Decoder (Phase 4)**: Depends on Phase 2 (needs `VINDecodeResult`, `VinCache`, error classes)
- **US3 MCP Bootstrap (Phase 5)**: Depends on Phase 2 (needs `McpServerOptions` type)
- **US4 Browser Pool (Phase 6)**: Depends on Phase 2 (needs `BrowserConfig`, `BrowserPoolOptions` types)
- **US5 Priority Queue (Phase 7)**: Depends on Phase 2 (needs `PriorityLevel`, `PriorityRequest` types)
- **US6 Tracing (Phase 8)**: Depends on Phase 2 (needs `SpanAttributes` type)
- **Polish (Phase 9)**: Depends on all user story phases being complete

### User Story Dependencies

- **US1 (Normalizer)**: Independent — no dependencies on other user stories
- **US2 (VIN Decoder)**: Independent — no dependencies on other user stories
- **US3 (MCP Bootstrap)**: Independent — no dependencies on other user stories
- **US4 (Browser Pool)**: Independent — no dependencies on other user stories
- **US5 (Priority Queue)**: Independent — no dependencies on other user stories
- **US6 (Tracing)**: Independent — no dependencies on other user stories

All 6 user stories can proceed in parallel after Phase 2 completes.

### Within Each User Story

- Tests (fixtures + test files) MUST be written and FAIL before implementation
- Implementation files before barrel re-exports
- Barrel wired up before checkpoint validation

### Parallel Opportunities

**Phase 1**: T003 and T004 can run in parallel
**Phase 2**: T007 can run in parallel with T005/T006 (test file created independently)
**Phase 3 (US1)**: T009, T010, T011 (fixtures) in parallel; T013, T014 (normalizers) in parallel
**Phase 4 (US2)**: T017 (fixture) in parallel with test writing; T019, T020, T021 (validator + caches) in parallel
**Phase 5–8**: Entire user stories US3–US6 can run in parallel with each other
**Phase 9**: T035, T036, T037 can run in parallel

---

## Parallel Example: User Story 1

```text
# Fixtures (all parallel — different files):
T009: Create Copart fixture       packages/shared/tests/fixtures/copart-raw-listing.json
T010: Create IAAI fixture         packages/shared/tests/fixtures/iaai-raw-listing.json
T011: Create edge-case fixtures   packages/shared/tests/fixtures/*-minimal.json

# Wait for fixtures, then:
T012: Write normalizer tests      packages/shared/tests/normalizer.test.ts

# Implementation (parallel — different files):
T013: Copart normalizer           packages/shared/src/normalizer/copart.ts
T014: IAAI normalizer             packages/shared/src/normalizer/iaai.ts

# Sequential wiring:
T015: Normalizer barrel           packages/shared/src/normalizer/index.ts
T016: Update root barrel          packages/shared/src/index.ts
```

## Parallel Example: User Story 2

```text
# Fixture:
T017: NHTSA fixture               packages/shared/tests/fixtures/nhtsa-decode-response.json

# Tests:
T018: VIN decoder tests           packages/shared/tests/vin-decoder.test.ts

# Implementation (parallel — different files):
T019: VIN validator               packages/shared/src/vin-decoder/validator.ts
T020: In-memory cache             packages/shared/src/vin-decoder/memory-cache.ts
T021: SQLite cache                packages/shared/src/vin-decoder/sqlite-cache.ts

# Sequential (depends on T019–T021):
T022: VIN decoder core            packages/shared/src/vin-decoder/decoder.ts
T023: VIN decoder barrel          packages/shared/src/vin-decoder/index.ts
T024: Update root barrel          packages/shared/src/index.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational types + errors (CRITICAL — blocks everything)
3. Complete Phase 3: US1 Normalizer (P1)
4. Complete Phase 4: US2 VIN Decoder (P1)
5. **STOP and VALIDATE**: Both P1 stories independently testable
6. Package is usable by downstream consumers for basic normalization and VIN decoding

### Incremental Delivery

1. Setup + Foundational → Types and errors available
2. Add US1 (Normalizer) → Auction data normalization works → first consumer can start
3. Add US2 (VIN Decoder) → VIN decoding works → scrapers can decode VINs
4. Add US3 (MCP Bootstrap) → Server startup standardized → server packages can bootstrap
5. Add US4 (Browser Pool) → Browser management standardized → scrapers can use pool
6. Add US5 (Priority Queue) → Request prioritization works → scrapers can queue requests
7. Add US6 (Tracing) → Observability available → production monitoring enabled
8. Polish → JSDoc, coverage, quickstart validation

### Parallel Team Strategy

With multiple developers after Phase 2:

- Developer A: US1 (Normalizer) + US2 (VIN Decoder) — both P1
- Developer B: US3 (MCP Bootstrap) + US4 (Browser Pool) — both P2
- Developer C: US5 (Priority Queue) + US6 (Tracing) — P2 + P3

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are written before implementation (TDD within each story phase)
- All SQLite databases use WAL mode and live in gitignored `data/` directories
- Normalizers are pure functions — never throw, always return valid `AuctionListing`
- VIN decoder throws on invalid input but never on missing optional fields in API response
- Browser pool stealth is applied once at browser level, not per-context (per research.md)
- Priority queue critical requests bypass both queue ordering AND rate limiting
- Tracing is a complete no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset
