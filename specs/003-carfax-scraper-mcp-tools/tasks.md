# Tasks: Carfax Scraper MCP Tools

**Input**: Design documents from `/specs/003-carfax-scraper-mcp-tools/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/public-api.md ✅, quickstart.md ✅

**Tests**: Included — spec.md explicitly requires fixture-driven parser/tool Vitest suites (FR-011).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the new Carfax MCP package skeleton and workspace configuration.

- [ ] T001 Create package scaffold and baseline config files in `packages/carfax-scraper-mcp/package.json`, `packages/carfax-scraper-mcp/tsconfig.json`, `packages/carfax-scraper-mcp/vitest.config.ts`, and `packages/carfax-scraper-mcp/config/default.json`
- [ ] T002 [P] Create canonical package directories and placeholders: `packages/carfax-scraper-mcp/src/`, `packages/carfax-scraper-mcp/src/tools/`, `packages/carfax-scraper-mcp/src/scraper/`, `packages/carfax-scraper-mcp/src/cache/`, `packages/carfax-scraper-mcp/src/utils/`, `packages/carfax-scraper-mcp/src/types/`, `packages/carfax-scraper-mcp/tests/fixtures/`, `packages/carfax-scraper-mcp/data/`
- [ ] T003 [P] Add package runtime data ignore rules for `packages/carfax-scraper-mcp/data/` in `/home/runner/work/car-auctions/car-auctions/.gitignore`
- [ ] T004 Create package entry files for MCP startup in `packages/carfax-scraper-mcp/src/index.ts` and `packages/carfax-scraper-mcp/src/server.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement shared foundations required by all user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T005 Implement Carfax domain/tool boundary types in `packages/carfax-scraper-mcp/src/types/index.ts` for `CarfaxReport`, `CarfaxSummary`, support entities, and tool input/output shapes from `contracts/public-api.md` including `AnalysisError` compatibility
- [ ] T006 Implement VIN validation and typed tool response helpers in `packages/carfax-scraper-mcp/src/utils/validation.ts` and `packages/carfax-scraper-mcp/src/utils/tool-response.ts` with explicit `StaleableResponse<T>` envelope semantics (`data`, `stale`, `cachedAt`)
- [ ] T007 [P] Implement SQLite WAL cache repository with 30-day TTL, stale-read support, and prepared-statement-only queries in `packages/carfax-scraper-mcp/src/cache/sqlite.ts`
- [ ] T008 [P] Implement in-memory hot cache and package config helpers in `packages/carfax-scraper-mcp/src/cache/memory.ts` and `packages/carfax-scraper-mcp/src/utils/config.ts`
- [ ] T009 [P] Implement shared rate-limit/backoff utility, daily-cap guard, and proxy-rotation integration points for `process.env.PROXY_URL` failures in `packages/carfax-scraper-mcp/src/utils/rate-limiter.ts`
- [ ] T010 Implement scraper browser/session bootstrap with stealth defaults, proxy wiring, and managed-key encryption hooks for persisted session state in `packages/carfax-scraper-mcp/src/scraper/browser.ts`

**Checkpoint**: Foundation ready — user story phases can proceed.

---

## Phase 3: User Story 1 - Fetch full Carfax history by VIN (Priority: P1) 🎯 MVP

**Goal**: Deliver `carfax_get_report` returning a normalized full report with cache-first behavior.

**Independent Test**: Call `carfax_get_report` with a valid VIN and verify structured report fields plus correct cache metadata.

### Tests for User Story 1

- [ ] T011 [P] [US1] Add full-report parser fixtures in `packages/carfax-scraper-mcp/tests/fixtures/carfax-report-network.json` and `packages/carfax-scraper-mcp/tests/fixtures/carfax-report-expected.json`
- [ ] T012 [P] [US1] Add parser normalization tests for full report sections in `packages/carfax-scraper-mcp/tests/parser.test.ts`
- [ ] T013 [P] [US1] Add tool tests for `carfax_get_report` cache hit/miss/stale paths in `packages/carfax-scraper-mcp/tests/tools.test.ts`

### Implementation for User Story 1

- [ ] T014 [P] [US1] Implement Carfax network interception for report payload capture in `packages/carfax-scraper-mcp/src/scraper/interceptor.ts`
- [ ] T015 [US1] Implement Carfax authenticated navigation and report fetch flow in `packages/carfax-scraper-mcp/src/scraper/carfax-client.ts`
- [ ] T016 [US1] Implement report parser mapping intercepted payloads to `CarfaxReport` in `packages/carfax-scraper-mcp/src/scraper/parser.ts`
- [ ] T017 [US1] Implement `carfax_get_report` handler with cache-first read, scrape fallback, and typed responses in `packages/carfax-scraper-mcp/src/tools/report.ts`
- [ ] T018 [US1] Register `carfax_get_report` in MCP server routing in `packages/carfax-scraper-mcp/src/server.ts`

**Checkpoint**: User Story 1 is independently functional and testable.

---

## Phase 4: User Story 2 - Fetch quick risk summary by VIN (Priority: P2)

**Goal**: Deliver `carfax_get_summary` derived from normalized report data for fast triage.

**Independent Test**: Call `carfax_get_summary` with a valid VIN and verify required summary fields/types and stale metadata behavior.

### Tests for User Story 2

- [ ] T019 [P] [US2] Add summary derivation fixtures in `packages/carfax-scraper-mcp/tests/fixtures/carfax-summary-expected.json`
- [ ] T020 [P] [US2] Add tool tests for `carfax_get_summary` success and stale fallback paths in `packages/carfax-scraper-mcp/tests/tools.test.ts`

### Implementation for User Story 2

- [ ] T021 [US2] Implement summary derivation logic (`total_accidents`, `title_issues`, `owner_count`, `last_odometer`, `open_recalls`, `overall_risk_rating`) in `packages/carfax-scraper-mcp/src/tools/summary.ts`
- [ ] T022 [US2] Implement summary flow to reuse normalized report and report-cache retrieval path in `packages/carfax-scraper-mcp/src/tools/summary.ts`
- [ ] T023 [US2] Register `carfax_get_summary` in MCP server routing in `packages/carfax-scraper-mcp/src/server.ts`

**Checkpoint**: User Story 2 is independently functional and testable.

---

## Phase 5: User Story 3 - Safe and resilient scraper behavior (Priority: P3)

**Goal**: Enforce validation, anti-bot, typed-error, stale-fallback, observability, and encrypted session-state contracts.

**Independent Test**: Run parser/tool suites verifying boundary validation, error mapping, anti-bot behavior, stale fallback, and OTEL attributes.

### Tests for User Story 3

- [ ] T024 [P] [US3] Add invalid VIN boundary tests for both tools in `packages/carfax-scraper-mcp/tests/tools.test.ts`
- [ ] T025 [P] [US3] Add typed error mapping tests for `CaptchaError`, `RateLimitError`, `ScraperError`, `CacheError`, and `AnalysisError` in `packages/carfax-scraper-mcp/tests/tools.test.ts`
- [ ] T026 [P] [US3] Add scraper resilience and security tests for 403/429 backoff, CAPTCHA detection/no-solve policy, proxy-rotation failure handling, and encrypted session-state persistence in `packages/carfax-scraper-mcp/tests/scraper.test.ts`

### Implementation for User Story 3

- [ ] T027 [US3] Implement anti-bot delays, interaction simulation, CAPTCHA detection, and proxy-rotation behavior in `packages/carfax-scraper-mcp/src/scraper/browser.ts`
- [ ] T028 [US3] Implement 403/429 and daily-cap to `RateLimitError` mapping with retry metadata in `packages/carfax-scraper-mcp/src/scraper/carfax-client.ts` and `packages/carfax-scraper-mcp/src/utils/tool-response.ts`
- [ ] T029 [US3] Implement stale-cache fallback vs hard-failure branching in `packages/carfax-scraper-mcp/src/tools/report.ts` and `packages/carfax-scraper-mcp/src/tools/summary.ts`
- [ ] T030 [US3] Implement managed-key encryption/decryption for persisted Carfax session/auth artifacts in `packages/carfax-scraper-mcp/src/scraper/browser.ts`
- [ ] T031 [US3] Implement OTEL span attributes (`tool.name`, `tool.status`, `tool.duration_ms`) for both tools in `packages/carfax-scraper-mcp/src/server.ts`

**Checkpoint**: User Story 3 is independently functional and testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening, validation, and documentation across all stories.

- [ ] T032 [P] Add package usage and operational documentation in `packages/carfax-scraper-mcp/README.md`
- [ ] T033 [P] Align quickstart verification steps with implemented commands in `specs/003-carfax-scraper-mcp-tools/quickstart.md`
- [ ] T034 Run package-level checks from `packages/carfax-scraper-mcp/` (`npm run typecheck`, `npm run build`, `npx vitest run`)
- [ ] T035 Run repo-wide validation from the repo root (`npm run typecheck`, `npm run build`, `npm run test`, `npm run lint`, `npm run format:check`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies
- **Phase 2 (Foundational)**: Depends on Phase 1 completion and blocks all user stories
- **Phase 3 (US1)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 2 and reuses US1 report model/flow
- **Phase 5 (US3)**: Depends on Phase 2 and hardens US1/US2 runtime behavior
- **Phase 6 (Polish)**: Depends on all user story phases

### User Story Dependencies

- **US1 (P1)**: First MVP slice; no dependency on US2/US3
- **US2 (P2)**: Depends on normalized report path introduced in US1
- **US3 (P3)**: Hardens shared runtime behavior across US1 and US2

### Within Each User Story

- Write tests before implementation tasks
- Parser/client implementation before tool handler wiring
- Tool handler wiring before story checkpoint validation

### Parallel Opportunities

- Setup: T002 and T003 can run in parallel
- Foundational: T007, T008, T009 can run in parallel
- US1: T011/T012/T013 and T014 can run in parallel; T015/T016 can overlap after interception shape is fixed
- US2: T019 and T020 can run in parallel
- US3: T024/T025/T026 can run in parallel
- Polish: T032 and T033 can run in parallel

---

## Parallel Example: User Story 1

```text
Task: "T011 [US1] Add full-report parser fixtures in packages/carfax-scraper-mcp/tests/fixtures/carfax-report-network.json and packages/carfax-scraper-mcp/tests/fixtures/carfax-report-expected.json"
Task: "T012 [US1] Add parser normalization tests in packages/carfax-scraper-mcp/tests/parser.test.ts"
Task: "T013 [US1] Add tool tests in packages/carfax-scraper-mcp/tests/tools.test.ts"
Task: "T014 [US1] Implement interception in packages/carfax-scraper-mcp/src/scraper/interceptor.ts"
```

## Parallel Example: User Story 2

```text
Task: "T019 [US2] Add summary fixtures in packages/carfax-scraper-mcp/tests/fixtures/carfax-summary-expected.json"
Task: "T020 [US2] Add summary tool tests in packages/carfax-scraper-mcp/tests/tools.test.ts"
```

## Parallel Example: User Story 3

```text
Task: "T024 [US3] Add invalid VIN tests in packages/carfax-scraper-mcp/tests/tools.test.ts"
Task: "T025 [US3] Add typed error mapping tests in packages/carfax-scraper-mcp/tests/tools.test.ts"
Task: "T026 [US3] Add scraper resilience tests in packages/carfax-scraper-mcp/tests/scraper.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 + Phase 2
2. Complete Phase 3 (US1)
3. Validate `carfax_get_report` independently

### Incremental Delivery

1. Ship US1 (`carfax_get_report`)
2. Add US2 (`carfax_get_summary`) without regressing US1
3. Add US3 resilience/security hardening
4. Complete Polish phase and run full validation
