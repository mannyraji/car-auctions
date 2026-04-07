# Implementation Plan: Shared Utilities Library

**Branch**: `001-shared-utilities-lib` | **Date**: 2026-04-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-shared-utilities-lib/spec.md`

## Summary

Build the foundational `@car-auctions/shared` npm workspace package providing shared types, error classes, auction normalizers (Copart + IAAI → `AuctionListing`), VIN decoder (NHTSA vPIC API with SQLite + LRU caching), MCP server bootstrap (stdio/SSE/WebSocket), Playwright browser pool with stealth, priority request queue (5 levels, token bucket rate limiter, starvation prevention), and OpenTelemetry tracing. This is the first package in the monorepo — all 7 MCP servers and the alerts service depend on it.

## Technical Context

**Language/Version**: TypeScript 5+ on Node.js 20+ (ES2022 target, Node16 module resolution, strict mode)
**Primary Dependencies**: `@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `ws`
**Storage**: SQLite via `better-sqlite3` (WAL mode) for VIN cache; in-memory LRU (max 200 entries) for hot data
**Testing**: Vitest (fixture-driven, ≥80% branch coverage on tools/parser files)
**Target Platform**: Node.js 20+ (Linux server production, macOS development)
**Project Type**: Library (npm workspace package consumed by 7 MCP servers + 1 alerts service)
**Performance Goals**: VIN decode <2s first call, <10ms cached; critical queue items processed <100ms; OTEL tracing <5% overhead
**Constraints**: Zero runtime deps beyond listed stack; tree-shakeable (named exports only, no module-scope side effects); TypeScript strict mode
**Scale/Scope**: 1 shared library, ~8 downstream consumer packages within the monorepo

### Research Needed

1. **MCP SDK multi-transport API**: Current `@modelcontextprotocol/sdk` API for creating servers supporting stdio, SSE, and WebSocket transports simultaneously — ✅ RESOLVED (see research.md Research Item 1)
2. **playwright-extra + stealth compatibility**: Current compatibility status of `playwright-extra` with `puppeteer-extra-plugin-stealth` for fingerprint masking — ✅ RESOLVED (see research.md Research Item 2)
3. **NHTSA vPIC API response schema**: Exact JSON response structure from `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/{vin}?format=json` — ✅ RESOLVED (see research.md Research Item 3)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Evaluation

| Gate | Pillar | Status | Notes |
|------|--------|--------|-------|
| Gate 1 – Safety | I. Safety & Cost Controls | ✅ PASS | No CAPTCHA solving. No NMVTIS calls in shared. VIN validation rejects I/O/Q per spec. |
| Gate 2 – Validation | I. Safety & Cost Controls | ✅ PASS | Shared package defines canonical `validateVin` (17 chars, reject I/O/Q). Lot/zip validators available for consumers. |
| Gate 3 – Cache | II. Data Integrity & Caching | ✅ PASS | VIN cache: 90-day TTL (matches table). SQLite WAL mode. Prepared statements only. LRU capped at 200. `StaleableResponse<T>` type defined in shared types. Negative cache: 5 min for failed decodes. |
| Gate 4 – Tests | III. Test-First Quality | ✅ PASS | Required test layers: normalizer tests, priority queue tests, error type tests, input validation tests — all in `packages/shared/tests/`. |
| Gate 5 – Rate Limits | IV. Performance | ✅ PASS | Priority queue enforces 1 req/3s token bucket (configurable). Not a scraper package — rate limit enforcement is in the queue, consumed by scrapers. |
| Gate 6 – Types | V. DX & Consistency | ✅ PASS | This package IS the single source of shared types. All error classes defined here. No local redefinitions possible (it's the origin). |
| Gate 7 – Build | V. DX & Consistency | ✅ PASS | TypeScript strict mode, ES2022. ESLint flat config + Prettier enforced. |
| Gate 8 – Observability | VI. Observability | ✅ PASS | Tracing module defined here: `initTracing`, `withSpan`, required span attributes (`tool.name`, `tool.status`, `tool.duration_ms`). No-op when `OTEL_EXPORTER_OTLP_ENDPOINT` unset. |

**Result**: All 8 gates PASS. No violations to justify. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-utilities-lib/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── public-api.md    # Export contract
└── tasks.md             # Phase 2 output (created by /speckit.tasks, NOT this command)
```

### Source Code (repository root)

```text
packages/
└── shared/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── index.ts              # Public API barrel (re-exports only)
    │   ├── types/
    │   │   └── index.ts          # All shared TypeScript interfaces
    │   ├── errors.ts             # ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError
    │   ├── normalizer/
    │   │   ├── index.ts          # Re-exports normalizeCopart, normalizeIaai
    │   │   ├── copart.ts         # Copart raw → AuctionListing
    │   │   └── iaai.ts           # IAAI raw → AuctionListing (title code map, type coercions)
    │   ├── vin-decoder/
    │   │   ├── index.ts          # Re-exports decodeVin, validateVin, VinCache
    │   │   ├── decoder.ts        # NHTSA vPIC API client + caching logic
    │   │   ├── validator.ts      # VIN validation (17 chars, reject I/O/Q)
    │   │   ├── sqlite-cache.ts   # SqliteVinCache (WAL mode, data/vin-cache.sqlite)
    │   │   └── memory-cache.ts   # InMemoryVinCache (LRU, for testing)
    │   ├── mcp-helpers/
    │   │   └── index.ts          # createMcpServer bootstrap (stdio/SSE/WebSocket)
    │   ├── browser-pool/
    │   │   └── index.ts          # BrowserPool class (Playwright lifecycle, stealth, proxy)
    │   ├── priority-queue/
    │   │   └── index.ts          # PriorityQueue class (5 levels, token bucket, starvation prevention)
    │   └── tracing/
    │       └── index.ts          # initTracing, withSpan, SpanAttributes
    ├── data/                     # Runtime data (gitignored)
    └── tests/
        ├── normalizer.test.ts    # Copart + IAAI normalization with fixtures
        ├── vin-decoder.test.ts   # VIN validation + decode + caching
        ├── priority-queue.test.ts # Ordering, preemption, starvation, rate limiting
        ├── errors.test.ts        # Error type structured responses
        ├── tracing.test.ts       # Span emission with mock exporter
        └── fixtures/             # Raw Copart/IAAI JSON fixtures for normalizer tests
```

**Structure Decision**: Single library package at `packages/shared/` following the monorepo layout from `docs/spec.md`. Sub-modules are organized by domain (normalizer, vin-decoder, etc.) with a barrel `index.ts` at root for public API. This matches the canonical package structure pattern from copilot-instructions.md (adapted for a library rather than an MCP server — no `server.ts`, `tools/`, `scraper/`, or `cache/` top-level dirs needed).

## Complexity Tracking

> No constitution gate violations. Table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
