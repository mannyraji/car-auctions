# Implementation Plan: Shared Utilities Library

**Branch**: `001-shared-utilities-lib` | **Date**: 2026-04-07 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-shared-utilities-lib/spec.md`

## Summary

Build `@car-auctions/shared` — the foundational npm workspace package for the car-auctions monorepo. It provides: a source-agnostic `AuctionListing` type contract and normalizers for Copart/IAAI raw API responses; a NHTSA vPIC VIN decoder with pluggable 90-day SQLite cache; an MCP server bootstrap helper supporting stdio/SSE/WebSocket transports; a shared Playwright browser pool with stealth and proxy support; a five-level priority queue with token-bucket rate limiting and starvation prevention; and an opt-in OpenTelemetry tracing module. All seven downstream MCP server packages import exclusively from this library's public barrel (`src/index.ts`).

---

## Technical Context

**Language/Version**: TypeScript 5+ / Node.js 20+  
**Primary Dependencies**: `@modelcontextprotocol/sdk` (MCP bootstrap), `playwright` + `playwright-extra` + `puppeteer-extra-plugin-stealth` (browser pool), `better-sqlite3` (VIN cache SQLite, WAL mode), `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http` + `@opentelemetry/auto-instrumentations-node` (tracing), `ws` (WebSocket transport)  
**Storage**: `better-sqlite3` SQLite at `data/vin-cache.sqlite` (WAL mode, gitignored); in-memory LRU for tests  
**Testing**: Vitest  
**Target Platform**: Node.js 20+, Linux (Docker containers)  
**Project Type**: npm workspace library (`packages/shared/`)  
**Performance Goals**: VIN decode ≤ 2s cold, ≤ 10ms cached; `critical` queue dispatch ≤ 100ms; OTel overhead < 5% per tool call  
**Constraints**: `strict: true`, `target: ES2022`, `module: Node16`; tree-shakeable named exports only; zero side-effects at module scope; no runtime deps beyond the approved set in NFR-002  
**Scale/Scope**: Consumed by 7 MCP server packages + 1 alerts service; per-process singletons for browser pool and priority queue

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Gate | Requirement | Status | Notes |
|------|------------|--------|-------|
| **Gate 1 – Safety** | No CAPTCHA-solving code; NMVTIS guard enforced | ✅ PASS | `shared` has no CAPTCHA logic or NMVTIS calls; callers enforce Guard |
| **Gate 2 – Validation** | VIN validated at tool boundary: 17 alphanum, reject I/O/Q | ✅ PASS | FR-008 requires `validateVin` to reject I/O/Q before any network call |
| **Gate 3 – Cache** | SQLite WAL mode; TTLs per constitution table; stale fallback with `cachedAt` | ✅ PASS | VIN cache: 90-day TTL ✅; WAL mode required; `StaleableResponse<T>` defined |
| **Gate 4 – Tests** | Normalizer tests + priority queue tests required per constitution table; ≥ 80% branch coverage on `src/` | ✅ PASS | `tests/normalizer.test.ts` and `tests/priority-queue.test.ts` mandatory; all error types covered |
| **Gate 5 – Rate Limits** | Global 1 req/3s; token bucket; exponential backoff exposed to callers | ✅ PASS | `PriorityQueue` enforces token bucket; backoff state lives in per-scraper `rate-limiter.ts` |
| **Gate 6 – Types** | No local type redefinitions; all errors from 5 typed classes; error→condition mapping | ✅ PASS | This library *is* the source of shared types; error class hierarchy defined here |
| **Gate 7 – Build** | `tsc --noEmit` + ESLint + Prettier zero errors | ✅ PASS | `strict: true` enforced; build-time checks in CI |
| **Gate 8 – Observability** | OTEL spans on all tool invocations; OTLP export; no console-only in prod | ✅ PASS | `withSpan()` wrapper enforces required attributes; no-op when endpoint unset |

**Post-Phase 1 re-check**: All gates remain PASS after data model and contract design. No violations found.

---

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-utilities-lib/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   ├── types.ts         ← Shared TypeScript interfaces contract
│   └── public-api.ts    ← Exported function signatures contract
└── tasks.md             ← Phase 2 output (generated separately by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/shared/
├── package.json                  # name: "@car-auctions/shared", type: "module"
├── tsconfig.json                 # extends ../../tsconfig.base.json
├── src/
│   ├── index.ts                  # Barrel — re-exports public API only (NFR-001)
│   ├── types/
│   │   └── index.ts              # All shared interfaces & ErrorCode union
│   ├── errors.ts                 # ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError
│   ├── normalizer/
│   │   ├── index.ts              # normalizeCopart(), normalizeIaai() — public exports
│   │   ├── copart.ts             # Copart field mapping logic (internal)
│   │   ├── iaai.ts               # IAAI field mapping + string→boolean coercions (internal)
│   │   └── codes.ts              # IAAI titleCode map, damage code map (internal — not exported)
│   ├── vin-decoder/
│   │   ├── index.ts              # decodeVin(), validateVin(), VinCache interface — public exports
│   │   ├── nhtsa-client.ts       # NHTSA vPIC fetch client (internal)
│   │   └── sqlite-cache.ts       # better-sqlite3 VinCache implementation (internal)
│   ├── mcp-helpers.ts            # createMcpServer(), McpServerOptions — public export
│   ├── browser-pool.ts           # BrowserPool class, BrowserPoolOptions — public export
│   ├── priority-queue.ts         # PriorityQueue class, PriorityLevel, PriorityRequest — public export
│   └── tracing.ts                # initTracing(), withSpan(), SpanAttributes — public export
├── tests/
│   ├── normalizer.test.ts        # Fixture-driven normalizer tests (Copart + IAAI)
│   ├── vin-decoder.test.ts       # VIN validation + decode + cache tests
│   ├── priority-queue.test.ts    # Preemption, starvation prevention, token bucket
│   ├── error-types.test.ts       # Each error class → correct MCP error response
│   └── fixtures/
│       ├── copart-listing.json   # Representative Copart raw API response
│       └── iaai-listing.json     # Representative IAAI raw API response
└── data/                         # Runtime data — gitignored (vin-cache.sqlite)
```

**Structure Decision**: Single library package (`packages/shared/`) using a feature-module layout under `src/`. Each functional concern (types, errors, normalizer, vin-decoder, etc.) occupies its own subdirectory or file. The public barrel (`src/index.ts`) is the only consumer-facing entry point — internal modules are not re-exported (enforces NFR-001 and spec API surface). This mirrors the canonical package structure in `.github/copilot-instructions.md` while accommodating the library-vs-server distinction (no `tools/`, `scraper/`, `cache/` directories needed here).

---

## Complexity Tracking

> No constitution violations found. Section included for completeness.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

---

## Phase 0: Research Findings

> See [research.md](./research.md) for full decision log.

**Key decisions resolved in Phase 0:**

| NEEDS CLARIFICATION | Resolution |
|--------------------|-----------|
| NHTSA vPIC API response format | `DecodeVinValues` endpoint returns flat JSON array; field names documented in research.md |
| Token bucket implementation approach | Manual `tokensAvailable + lastRefillTime` state; no external dep needed |
| OTel no-op pattern | Conditional SDK start only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; no-op tracer otherwise |
| MCP SDK transport selection | `@modelcontextprotocol/sdk` `StdioServerTransport`, `SSEServerTransport`, `WebSocketServerTransport` selected via env/param |
| `playwright-extra` stealth integration | `chromium.use(stealth())` before `chromium.launch()`; single-browser multiple-context pattern |
| `better-sqlite3` WAL mode pragma | `db.pragma('journal_mode = WAL')` immediately after `new Database()` |

---

## Phase 1: Design Summary

> See [data-model.md](./data-model.md), [contracts/](./contracts/), and [quickstart.md](./quickstart.md).

### Entities

| Entity | Module | Description |
|--------|--------|-------------|
| `AuctionListing` | `types/` | Core normalized auction listing; source-agnostic |
| `ToolResponse<T>` | `types/` | Standard MCP tool return envelope |
| `DealAnalysis` | `types/` | Full deal analysis output |
| `RiskFlag` | `types/` | Per-flag warning with severity |
| `VINDecodeResult` | `types/` | Structured vehicle specs from NHTSA |
| `PriorityRequest<T>` | `priority-queue` | Queued work item with priority + timestamp |
| `BrowserConfig` | `types/` | Browser pool configuration |
| `ErrorCode` | `types/` | Union of all structured error codes |
| Error classes | `errors` | `ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`, `AnalysisError` |

### Contracts

- **`contracts/types.ts`** — all shared interface definitions verbatim  
- **`contracts/public-api.ts`** — all exported function/class signatures with JSDoc

### Quickstart

See [quickstart.md](./quickstart.md) for setup, package.json workspace reference, and usage examples for each module.

---

## Open Questions / Risks

| Risk | Mitigation |
|------|-----------|
| NHTSA vPIC API downtime | `decodeVin()` returns structured `ScraperError` on network failure; callers proceed with partial data |
| Browser pool memory spikes | `maxConcurrency` (default 3) hard cap + `BrowserPool.shutdown()` idempotent with ref-counting |
| `critical` request burst exceeding rate limit | Token bucket still enforced for `critical`; burst handled by queuing within `critical` tier |
| Unknown IAAI `titleCode` | Map returns `'Unknown'` + emits `console.warn` in non-production; no throw |
| Dual `BrowserPool.shutdown()` calls | Internal `_shutdownPromise` caches the shutdown; second call is a no-op |
| OTel endpoint set but unreachable | SDK `forceFlush` errors swallowed; tracing uses fire-and-forget span export |
