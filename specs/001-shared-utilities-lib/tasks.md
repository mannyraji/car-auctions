# Tasks: 001-shared-utilities-lib — `@car-auctions/shared`

**Input**: Design documents from `specs/001-shared-utilities-lib/`
**Branch**: `001-shared-utilities-lib`
**Generated**: 2026-04-06

**Available docs**: plan.md ✓ · spec.md ✓ · data-model.md ✓ · contracts/public-api.ts ✓ · research.md ✓ · quickstart.md ✓

**Tests**: Included — required by constitution Gate 4 (`≥ 80%` branch coverage on non-wrapper files). Normalizer and priority-queue tests are explicitly mandated.

**Organization**: Tasks are grouped by user story. Each story phase is independently completable and testable. Stories US1–US6 can proceed in priority order or in parallel (after Foundational phase).

---

## Format: `[ID] [P?] [Story?] Description — file path`

- **[P]**: Can run in parallel (operates on a different file or independent concern)
- **[Story]**: Which user story this task belongs to (US1 … US6)
- Exact file paths are included in every description

---

## Phase 1: Setup — Monorepo & Package Scaffold

**Purpose**: Create the files required for `npm ci` to succeed and for the `packages/shared` workspace to be recognised. No source code — pure project initialisation.

- [ ] T001 Create root `package.json` — `"private": true`, `"workspaces": ["packages/*"]`, devDependencies: `typescript@5.8.x`, `eslint`, `prettier`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint-config-prettier`, `eslint-plugin-prettier` — `/package.json`
- [ ] T002 Create `tsconfig.base.json` — `target: ES2022`, `module: Node16`, `moduleResolution: Node16`, `strict: true`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `esModuleInterop: true` — `/tsconfig.base.json`
- [ ] T003 [P] Create `eslint.config.mjs` — ESLint flat config with `@typescript-eslint` recommended rules and `eslint-plugin-prettier` integration, covering `packages/*/src/**/*.ts` — `/eslint.config.mjs`
- [ ] T004 [P] Create `.prettierrc` — `singleQuote: true`, `semi: true`, `trailingComma: "all"`, `printWidth: 100`, `tabWidth: 2` — `/.prettierrc`
- [ ] T005 [P] Update `.gitignore` — add `node_modules/`, `packages/*/dist/`, `packages/*/data/`, `*.js.map`, `*.d.ts.map` — `/.gitignore`
- [ ] T006 Create `packages/shared/package.json` — `name: "@car-auctions/shared"`, `"type": "module"`, `exports` map (`.` → `./dist/index.js` / `./src/index.ts`), scripts: `build: tsc -p tsconfig.json`, `lint: eslint src`, `test: vitest run` — `packages/shared/package.json`
- [ ] T007 Create `packages/shared/tsconfig.json` — extends `../../tsconfig.base.json`, `rootDir: src`, `outDir: dist`, include `src/**/*` — `packages/shared/tsconfig.json`
- [ ] T008 [P] Create `packages/shared/vitest.config.ts` — pool: `forks`, test match `tests/**/*.test.ts`, coverage provider `v8`, coverage thresholds `branches: 80` — `packages/shared/vitest.config.ts`

**Checkpoint**: Run `npm ci` at repo root — workspace resolves; `packages/shared` appears in `node_modules/@car-auctions/shared`

---

## Phase 2: Foundational — Shared Types & Error Classes

**Purpose**: Implement the zero-dependency type system and error hierarchy. ALL user story phases depend on this phase; no implementation work begins until these types are in place.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T009 Implement all shared TypeScript interfaces and type aliases in `packages/shared/src/types/index.ts`: `AuctionListing`, `CopartRawListing`, `IaaiRawListing`, `DealAnalysis`, `DealSummary`, `RiskFlag`, `VINDecodeResult`, `ProfitEstimate`, `RepairEstimate`, `RepairLineItem`, `CarrierQuote`, `ValueAdjustment`, `BrowserConfig`, `ToolResponse<T>`, `ToolError`, `StaleableResponse<T>`, `ErrorCode`, `ServiceRecord`, `RecallRecord`, `NmvtisTitleRecord`, `InsuranceLossRecord`, `JunkSalvageRecord`, `OdometerRecord`, `McpServerOptions`, `PriorityLevel`, `PriorityRequest<T>`, `PriorityQueueOptions`, `SpanAttributes`, `BrowserPoolOptions` — all field shapes and state transitions exactly as defined in `data-model.md` — `packages/shared/src/types/index.ts`
- [ ] T010 [P] Implement five typed error classes extending `Error` — `ScraperError` (`SCRAPER_ERROR`, retryable: true), `CaptchaError` (`CAPTCHA_DETECTED`, retryable: false), `RateLimitError` (`RATE_LIMITED`, retryable: true), `CacheError` (`CACHE_ERROR`, retryable: false), `AnalysisError` (`ANALYSIS_ERROR`, retryable: false) — each with `code: ErrorCode`, `retryable: boolean`, optional `retryAfterMs?: number`, optional `cause?: unknown` for chaining, no public stack-trace exposure (constitution Pillar VI Rule 2) — `packages/shared/src/errors.ts`
- [ ] T011 [P] Write error class unit tests — verify `instanceof`, `code`, `retryable`, `retryAfterMs`, and `cause` chaining for all five classes — `packages/shared/tests/errors.test.ts`

**Checkpoint**: `tsc --noEmit` passes on `packages/shared`; `npm run test --workspace packages/shared` reports three passing test files

---

## Phase 3: User Story 1 — Unified Auction Data Schema (Priority: P1) 🎯 MVP

**Goal**: Deliver `normalizeCopart` and `normalizeIaai` so any downstream consumer receives a single, source-agnostic `AuctionListing` regardless of which auction source the data came from.

**Independent Test**: Pass `copart-raw.json` fixture through `normalizeCopart` and `iaai-raw.json` through `normalizeIaai`; assert both outputs conform to the `AuctionListing` interface, `has_keys` is a boolean on the IAAI path, `titleCode: "SV"` → `title_type: "Salvage"`, and unknown IAAI title codes produce `"Unknown"` without throwing.

### Tests for User Story 1

- [ ] T012 [P] [US1] Create Copart raw listing fixture with all fields from `CopartRawListing` including `hk: true`, `tmtp: "SV"`, `htrf: false` — `packages/shared/tests/fixtures/copart-raw.json`
- [ ] T013 [P] [US1] Create IAAI raw listing fixture with all fields from `IaaiRawListing` including `hasKeys: "YES"`, `titleCode: "SV"`, a known `titleCode: "CL"` variant, and an unknown code `"XX"` — `packages/shared/tests/fixtures/iaai-raw.json`

### Implementation for User Story 1

- [ ] T014 [US1] Implement `IAAI_TITLE_CODE_MAP` internal lookup (`"CL"→"Clean"`, `"SV"→"Salvage"`, `"RB"→"Rebuilt"`, `"SL"→"Salvage Lien"`, unknown→`"Unknown"` with `console.warn`) and `normalizeCopart(raw: CopartRawListing): AuctionListing` with all field mappings (`lotNumberStr→lot_number`, `mkn→make`, `lnn→model`, `yn→year`, `dd→damage_primary`, `hk→has_keys`, `cd→current_bid_usd`, `sed→sale_date`, etc.) — `packages/shared/src/normalizer.ts`
- [ ] T015 [US1] Implement `normalizeIaai(raw: IaaiRawListing): AuctionListing` with `hasKeys: "YES"/"NO"/null → boolean`, `titleCode → IAAI_TITLE_CODE_MAP`, `Mileage → odometer_km`, all other field mappings, null-safe defaults for all optional fields — `packages/shared/src/normalizer.ts`
- [ ] T016 [US1] Write normalizer tests covering: Copart field mapping (all required fields present, `source: "copart"`), IAAI boolean coercion (`"YES"→true`, `"NO"→false`, `null→false`), all four known IAAI title codes, unknown title code degrades to `"Unknown"` without throwing, null/missing fields produce `null` not `undefined`, identical output structure for same vehicle from both sources — `packages/shared/tests/normalizer.test.ts`

**Checkpoint**: `npm run test --workspace packages/shared` — normalizer tests green; manually import `normalizeCopart` and verify against quickstart § 5 example

---

## Phase 4: User Story 2 — VIN Decoding Across All Packages (Priority: P1)

**Goal**: Deliver a single, cacheable VIN decoder backed by the free NHTSA vPIC API, with a pluggable `VinCache` interface, `SqliteVinCache` for production, and `MemoryVinCache` for tests.

**Independent Test**: Call `decodeVin` with `1HGCM82633A004352` using `MemoryVinCache`; assert result includes year, make, model, engine type, body class. Call again; assert `cached: true` and no network call. Call with VIN containing `"O"` (letter O); assert rejected before any HTTP call.

### Tests for User Story 2

- [ ] T017 [P] [US2] Write VIN decoder tests covering: `validateVin` rejects VINs shorter than 17 chars, VINs containing I/O/Q, non-alphanumeric chars; accepts a valid 17-char VIN; `decodeVin` returns `success: true` with all required fields for a known VIN; second call with `MemoryVinCache` returns `cached: true` without HTTP; unreachable API returns `success: false` with `code: "SCRAPER_ERROR"` without crashing — `packages/shared/tests/vin-decoder.test.ts`

### Implementation for User Story 2

- [ ] T018 [P] [US2] Implement `validateVin(vin: string): boolean` — exactly 17 characters, all alphanumeric, rejects I (0x49), O (0x4F), Q (0x51) per FR-008 — `packages/shared/src/vin-decoder.ts`
- [ ] T019 [US2] Implement `VinCache` interface (`get(vin): Promise<VINDecodeResult | null>`, `set(vin, result, ttlMs): Promise<void>`), `MemoryVinCache` (in-process `Map<string, {result, expiresAt}>`), and `SqliteVinCache` (WAL mode via `better-sqlite3`, table `vin_cache(vin TEXT PRIMARY KEY, result JSON, expires_at INTEGER)`, `PRAGMA journal_mode=WAL`, stored at configurable `dbPath` defaulting to `data/vin-cache.sqlite`, 90-day TTL = 90 × 86400 × 1000 ms) — `packages/shared/src/vin-decoder.ts`
- [ ] T020 [US2] Implement `decodeVin(vin: string, cache?: VinCache): Promise<ToolResponse<VINDecodeResult>>` — validate via `validateVin` first (return `VALIDATION_ERROR` immediately on failure), check cache, call `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{vin}?format=json`, parse `Results[0]` fields into `VINDecodeResult` (ModelYear, Make, Model, Trim, EngineCylinders+DisplacementL→engine_type, BodyClass, DriveType, FuelTypePrimary, TransmissionStyle→transmission), write to cache on success, return `ToolResponse<VINDecodeResult>` with `cached: false` / `true` — `packages/shared/src/vin-decoder.ts`

**Checkpoint**: `npm run test --workspace packages/shared` — VIN decoder tests green; `decodeVin("1HGCM82633A004352", new MemoryVinCache())` resolves with `make: "Honda"` per quickstart § 5 example

---

## Phase 5: User Story 3 — MCP Server Bootstrap (Priority: P2)

**Goal**: Deliver `createMcpServer` so any new MCP server package can start with stdio, SSE, or WebSocket transport by passing a single options object or environment variable — no per-package transport boilerplate.

**Independent Test**: Call `createMcpServer({ name: "test-mcp", version: "1.0.0", transport: "stdio" })`; verify it resolves without error. Repeat with `transport: "sse"` on a free port and with `transport: "websocket"` on another free port; verify transports accept connections.

### Implementation for User Story 3

- [ ] T021 [P] [US3] Implement `McpServerOptions` interface (already defined in types; wire here), `StdioServerTransport` adapter wrapping `@modelcontextprotocol/sdk`'s native `StdioServerTransport`, and `SSEServerTransport` adapter wrapping the SDK's native `SSEServerTransport` — `packages/shared/src/mcp-helpers.ts`
- [ ] T022 [US3] Implement `WebSocketServerTransport` class (~80 LOC) — implements MCP SDK `Transport` interface, uses `ws.WebSocketServer`, emits `message` events on receipt, calls `send(msg)` for outgoing, `close()` tears down the server cleanly; configurable `wsPort` from options or `WS_PORT` env or default `3001` — `packages/shared/src/mcp-helpers.ts`
- [ ] T023 [US3] Implement `createMcpServer(options: McpServerOptions): Promise<void>` — reads `transport` from `options.transport ?? process.env.TRANSPORT ?? "stdio"`, constructs the matching transport (`stdio` / `sse` on `options.port ?? PORT env ?? 3000` / `websocket`), calls `new Server(...)` from `@modelcontextprotocol/sdk` and `server.connect(transport)` — `packages/shared/src/mcp-helpers.ts`

**Checkpoint**: `tsc --noEmit` passes; instantiate `createMcpServer({ name: "smoke", version: "0.0.1", transport: "stdio" })` — resolves without error in a Node 20 script

---

## Phase 6: User Story 4 — Shared Browser Pool (Priority: P2)

**Goal**: Deliver `BrowserPool` so scraper packages share a single Playwright browser instance with stealth and proxy support, max-concurrency enforcement, and reference-counted idempotent shutdown.

**Independent Test**: Instantiate `BrowserPool({ maxContexts: 2 })`; call `acquire()` twice — both return contexts. Call `acquire()` a third time — it queues until a `release()` is called. Verify a single underlying browser PID is shared. Call `shutdown()` twice — resolves cleanly both times without error.

### Implementation for User Story 4

- [ ] T024 [P] [US4] Implement `BrowserPool` class skeleton — constructor accepts `BrowserPoolOptions` (stealth, headless, maxContexts: default 3, timeoutMs: default 30 000, proxyUrl: from `PROXY_URL` env); `acquire(): Promise<BrowserContext>` lazily launches the browser on first call and tracks open context count; `release(ctx: BrowserContext): void` decrements count and resolves the next pending `acquire()` waiter — `packages/shared/src/browser-pool.ts`
- [ ] T025 [US4] Add stealth plugin integration — conditionally apply `puppeteer-extra-plugin-stealth` via `playwright-extra` when `options.stealth === true`; add proxy configuration via `browser.newContext({ proxy: { server: options.proxyUrl } })` when `proxyUrl` is set — `packages/shared/src/browser-pool.ts`
- [ ] T026 [US4] Implement max concurrency enforcement (queue waiters when `openContexts >= maxContexts`) and idempotent reference-counted `shutdown(): Promise<void>` — tracks `shutdownCalled` flag; calls `browser.close()` only once even if `shutdown()` is called concurrently; resolves immediately on repeated calls — `packages/shared/src/browser-pool.ts`

**Checkpoint**: Unit test (mock Playwright launch): two `acquire()` calls share the same browser instance; `shutdown()` called twice resolves both times without rejection

---

## Phase 7: User Story 5 — Priority-Aware Request Queue (Priority: P2)

**Goal**: Deliver `PriorityQueue` with five priority levels, token-bucket rate limiting, starvation prevention, and critical bypass so time-sensitive watchlist refreshes are never blocked by background work.

**Independent Test**: Enqueue one `critical`, one `normal`, and one `background` request at the same time; assert `critical` dequeues and executes immediately. Flood with `high` requests for 70 seconds of simulated time; assert a `low` request enqueued at t=0 executes within the 60-second starvation window. Confirm a `background` request waits up to 30 seconds before forced execution.

### Tests for User Story 5

- [ ] T027 [P] [US5] Write priority queue tests covering: enqueue ordering (`critical` before `high` before `normal` before `low` before `background`), critical bypass (skips ordered queue, respects rate limit), starvation guarantee (low/background execute within 60s under sustained high load), token bucket rate enforcement (enqueue burst of 10 requests; verify throughput ≈ 1/3 s), `background` max-wait 30s — `packages/shared/tests/priority-queue.test.ts`

### Implementation for User Story 5

- [ ] T028 [P] [US5] Implement `TokenBucket` internal class (NOT exported) — fields: `tokens`, `maxTokens`, `refillRate` (tokens/ms), `lastRefill`; method `consume(): boolean` refills bucket based on elapsed time then returns `true` if a token is available; configurable via `PriorityQueueOptions.requestsPerInterval` + `intervalMs` (default 1 / 3000 ms) — `packages/shared/src/priority-queue.ts`
- [ ] T029 [US5] Implement `PriorityQueue` class — internal sorted dequeue with five-level bucket array (`critical[0]`, `high[1]`, `normal[2]`, `low[3]`, `background[4]`); `enqueue<T>(task: () => Promise<T>, priority: PriorityLevel): Promise<T>` inserts a `PriorityRequest` and returns a promise that resolves when the task completes; scheduler loop drains highest-priority non-empty bucket FIFO, calls `TokenBucket.consume()` before dispatch, uses `setImmediate`/`setTimeout` to yield — `packages/shared/src/priority-queue.ts`
- [ ] T030 [US5] Implement starvation prevention — track `lastExecutedAt: number` per priority level; when a `low` or `background` task has waited ≥ 60 seconds promote it ahead of the current head of queue (guaranteed-execution slot) regardless of higher-priority backlog — `packages/shared/src/priority-queue.ts`
- [ ] T031 [US5] Implement `critical` bypass — `critical` tasks skip the ordered queue and proceed to rate-limit check immediately (bypassing all other pending work); they still acquire a token from `TokenBucket` so they respect the configured throughput cap (FR-016) — `packages/shared/src/priority-queue.ts`

**Checkpoint**: `npm run test --workspace packages/shared` — priority queue tests green; ordering, preemption, starvation, and rate-limit tests all pass

---

## Phase 8: User Story 6 — OpenTelemetry Tracing (Priority: P3)

**Goal**: Deliver `initTracing` and `withSpan` so operators can enable OTLP distributed tracing across the full `analyze_vehicle` pipeline by setting one environment variable, with zero overhead when the variable is absent.

**Independent Test**: Call `initTracing("test-service")` with `OTEL_EXPORTER_OTLP_ENDPOINT` unset; assert no spans are exported and latency overhead is zero. Set the env var and use a mock `InMemorySpanExporter`; call `withSpan("copart.search", { "tool.name": "copart_search" }, async () => 42)`; assert one span is emitted with the correct name, attributes, and `SpanStatusCode.OK`. Simulate a thrown error inside `withSpan`; assert `SpanStatusCode.ERROR` is set but stack trace is NOT included in span attributes.

### Tests for User Story 6

- [ ] T032 [P] [US6] Write tracing tests covering: no-op mode when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset (zero spans emitted), OTLP mode with `InMemorySpanExporter` (span emitted with correct name and `tool.name` attribute), `withSpan` sets `SpanStatusCode.OK` on success and `SpanStatusCode.ERROR` on thrown error without leaking stack trace, span naming follows `{package}.{operation}` convention — `packages/shared/tests/tracing.test.ts`

### Implementation for User Story 6

- [ ] T033 [P] [US6] Implement `initTracing(serviceName: string): void` — if `process.env.OTEL_EXPORTER_OTLP_ENDPOINT` is set, configure `NodeSDK` with `OTLPTraceExporter` and `serviceName`; if unset, register a no-op `TracerProvider` (zero overhead path); call `sdk.start()` — `packages/shared/src/tracing.ts`
- [ ] T034 [US6] Implement `withSpan<T>(name: string, attrs: SpanAttributes, fn: () => Promise<T>): Promise<T>` — start a span via the active `TracerProvider`, set `attrs` as span attributes, `await fn()`, call `span.setStatus(SpanStatusCode.OK)` on success or `span.setStatus(SpanStatusCode.ERROR, err.message)` on error (no stack trace on span — constitution Pillar VI Rule 2), always `span.end()` in `finally` — `packages/shared/src/tracing.ts`

**Checkpoint**: `npm run test --workspace packages/shared` — tracing tests green; no-op mode confirmed with `OTEL_EXPORTER_OTLP_ENDPOINT` unset

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Wire the public barrel, add JSDoc documentation, and verify the full build/lint/test pipeline passes end-to-end.

- [ ] T035 Implement public barrel with all named exports matching `contracts/public-api.ts` exactly — type exports from `./types/index.js`, error classes from `./errors.js`, `normalizeCopart`/`normalizeIaai` from `./normalizer.js`, `decodeVin`/`validateVin`/`SqliteVinCache`/`MemoryVinCache`/`VinCache`/`SqliteVinCacheOptions` from `./vin-decoder.js`, `createMcpServer`/`McpServerOptions` from `./mcp-helpers.js`, `BrowserPool`/`BrowserPoolOptions` from `./browser-pool.js`, `PriorityQueue`/`PriorityLevel`/`PriorityRequest`/`PriorityQueueOptions` from `./priority-queue.js`, `initTracing`/`withSpan`/`SpanAttributes` from `./tracing.js`; all relative imports use `.js` extension (module: Node16 — Decision 1); `TokenBucket`, `IAAI_TITLE_CODE_MAP`, and `NHTSA_VARIABLE_IDS` are NOT exported — `packages/shared/src/index.ts`
- [ ] T036 [P] Add JSDoc `@param`, `@returns`, and `@example` tags to all public API functions: `normalizeCopart`, `normalizeIaai`, `validateVin`, `decodeVin`, `createMcpServer`, `BrowserPool.acquire`, `BrowserPool.release`, `BrowserPool.shutdown`, `PriorityQueue.enqueue`, `initTracing`, `withSpan` (NFR-005) — `packages/shared/src/*.ts`
- [ ] T037 Run `npm run build --workspace packages/shared` — verify `tsc -p tsconfig.json` produces zero errors and emits `packages/shared/dist/index.js` with `.d.ts` declaration files — `packages/shared/dist/`
- [ ] T038 [P] Run `npm run lint --workspace packages/shared` — verify ESLint flat config (`eslint.config.mjs`) and Prettier report zero errors — `packages/shared/src/**/*.ts`
- [ ] T039 Run `npm run test --workspace packages/shared` — verify all test files pass and Vitest coverage report shows ≥ 80% branch coverage on `normalizer.ts`, `vin-decoder.ts`, `errors.ts`, `priority-queue.ts`, `tracing.ts` — `packages/shared/tests/`
- [ ] T040 [P] Validate quickstart.md scenarios end-to-end: run `npm ci` at repo root, `npm run build --workspace packages/shared`, then execute the Copart normalizer snippet and VIN decode snippet from quickstart § 5 in a Node 20 REPL to confirm all exports resolve correctly — repo root

**Checkpoint**: All 40 tasks complete; `npm run --workspaces --if-present build`, `lint`, and `test` all pass; the package is ready for consumption by downstream MCP server packages

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)         → no dependencies — start immediately
Phase 2 (Foundational)  → requires Phase 1 — BLOCKS all user story phases
Phase 3 (US1)           → requires Phase 2
Phase 4 (US2)           → requires Phase 2
Phase 5 (US3)           → requires Phase 2
Phase 6 (US4)           → requires Phase 2
Phase 7 (US5)           → requires Phase 2
Phase 8 (US6)           → requires Phase 2
Phase 9 (Polish)        → requires Phases 3–8 (all user stories)
```

### User Story Dependencies

- **US1 (P1)**: Can start immediately after Phase 2 — depends on `AuctionListing`, `CopartRawListing`, `IaaiRawListing` types only
- **US2 (P1)**: Can start immediately after Phase 2 — depends on `VINDecodeResult`, `ToolResponse`, `ErrorCode` types only
- **US3 (P2)**: Can start immediately after Phase 2 — depends on `McpServerOptions` type only
- **US4 (P2)**: Can start immediately after Phase 2 — depends on `BrowserConfig`, `BrowserPoolOptions` types only
- **US5 (P2)**: Can start immediately after Phase 2 — depends on `PriorityLevel`, `PriorityRequest`, `PriorityQueueOptions` types only
- **US6 (P3)**: Can start immediately after Phase 2 — depends on `SpanAttributes` type only
- **All six user story phases are independent of each other and can run in parallel**

### Within Each User Story Phase

- Fixture tasks [P] before implementation tasks in the same story
- `validateVin` (T018) before `decodeVin` (T020) — same file, sequential
- `TokenBucket` (T028) before `PriorityQueue` (T029) — dependency within file
- `initTracing` (T033) before `withSpan` (T034) — dependency within file
- Polish (Phase 9): barrel (T035) first, then JSDoc (T036) in parallel with build/lint/test

---

## Parallel Execution Examples

### Phase 1 (Setup) — tasks that can be parallelised

```
Parallel group A (after T001+T002):
  T003  eslint.config.mjs
  T004  .prettierrc
  T005  .gitignore
  T008  vitest.config.ts

Sequential:
  T001 → T002 → T006 → T007
```

### Phase 2 (Foundational)

```
Sequential:  T009  (must finish before T010/T011 can use error types from types/index.ts)
Parallel:    T010  errors.ts
             T011  errors.test.ts
```

### After Phase 2 — all six stories in parallel

```
Developer / Agent A:   US1 (T012–T016) — normalizer
Developer / Agent B:   US2 (T017–T020) — VIN decoder
Developer / Agent C:   US3 (T021–T023) — MCP helpers
Developer / Agent D:   US4 (T024–T026) — browser pool
Developer / Agent E:   US5 (T027–T031) — priority queue
Developer / Agent F:   US6 (T032–T034) — tracing
```

### Phase 9 (Polish) — after all stories

```
Sequential:  T035  src/index.ts public barrel
Parallel:    T036  JSDoc across src/*.ts
             T037  npm run build
             T038  npm run lint
After T037:  T039  npm run test (requires build output)
After T039:  T040  quickstart validation
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001–T008)
2. Complete Phase 2: Foundational — types and errors (T009–T011)
3. Complete Phase 3: US1 — normalizer (T012–T016)
4. Complete Phase 4: US2 — VIN decoder (T017–T020)
5. **STOP and VALIDATE**: Both P1 stories independently testable; downstream packages can consume shared types and normalizer
6. Add partial Phase 9: barrel (T035) + build (T037) to produce a publishable package

### Full Incremental Delivery

| Sprint | Phases       | Deliverable                                    |
|--------|--------------|------------------------------------------------|
| 1      | 1 + 2        | Monorepo scaffold + types/errors               |
| 2      | 3 + 4        | Normalizer + VIN decoder — MVP shippable       |
| 3      | 5 + 6        | MCP bootstrap + browser pool                   |
| 4      | 7 + 8        | Priority queue + tracing                       |
| 5      | 9            | Public barrel, docs, CI validation             |

### Single-Agent Sequential Strategy

Process phases in strict order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9. Within each phase, tackle [P]-marked tasks before non-parallel tasks to unblock as early as possible.

---

## Task Summary

| Phase | Story | Tasks | Parallel |
|-------|-------|-------|---------|
| 1 — Setup | — | T001–T008 (8) | T003, T004, T005, T008 |
| 2 — Foundational | — | T009–T011 (3) | T010, T011 |
| 3 — US1 Normalizer | US1 P1 | T012–T016 (5) | T012, T013 |
| 4 — US2 VIN Decoder | US2 P1 | T017–T020 (4) | T017, T018 |
| 5 — US3 MCP Bootstrap | US3 P2 | T021–T023 (3) | T021 |
| 6 — US4 Browser Pool | US4 P2 | T024–T026 (3) | T024 |
| 7 — US5 Priority Queue | US5 P2 | T027–T031 (5) | T027, T028 |
| 8 — US6 Tracing | US6 P3 | T032–T034 (3) | T032, T033 |
| 9 — Polish | — | T035–T040 (6) | T036, T037, T038, T040 |
| **Total** | | **40 tasks** | **17 parallelisable** |

**Suggested MVP scope**: Phases 1 + 2 + 3 + 4 + partial Phase 9 (T035, T037) — delivers `@car-auctions/shared` with types, errors, normalizer, and VIN decoder; all downstream packages can begin integration.
