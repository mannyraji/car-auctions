# Implementation Plan: Carfax Scraper MCP Tools

**Branch**: `003-carfax-scraper-mcp-tools` | **Date**: 2026-04-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/003-carfax-scraper-mcp-tools/spec.md`

## Summary

Build `@car-auctions/carfax-scraper-mcp` with two MCP tools: `carfax_get_report` (full history by VIN) and `carfax_get_summary` (risk-focused summary by VIN). Follow existing scraper package architecture (browser → client → interceptor → parser), monorepo conventions, typed error contracts, stale fallback semantics, and constitution quality gates. Use SQLite WAL for 30-day Carfax cache and fixture-driven Vitest suites.

## Technical Context

**Language/Version**: TypeScript 5+ on Node.js 20+ (ES2022 target, Node16 module resolution, strict mode)  
**Primary Dependencies**: `@car-auctions/shared`, `@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `zod`  
**Storage**: SQLite WAL (`data/carfax.sqlite`) for Carfax reports (30-day TTL), optional disk session state in `data/`  
**Testing**: Vitest fixture-driven parser/tool tests, with constitution coverage targets for tools/parser  
**Target Platform**: Node.js 20+ MCP server runtime (Linux production, local dev environments)  
**Project Type**: MCP server npm workspace package  
**Performance Goals**: Cached Carfax read <100ms; summary derivation from cached report <20ms; end-to-end report retrieval within 60s handler timeout  
**Constraints**: Input validation at tool boundary; typed errors only; 30s page navigation timeout; stale fallback contract with `cachedAt`; no CAPTCHA solving  
**Scale/Scope**: 2 MCP tools, 1 new package, parser+tool test suites, SQLite cache tables for report/summary fetches

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

*Pre-Phase-0 Check*

| Gate | Status | Evidence |
|------|--------|----------|
| **Gate 1 — Safety** | ✅ PASS | CAPTCHA detection and no-solve policy required by design; no NMVTIS coupling |
| **Gate 2 — Validation** | ✅ PASS | Both tools require VIN boundary validation (17 chars, no I/O/Q) |
| **Gate 3 — Cache** | ✅ PASS | SQLite WAL cache with 30-day Carfax TTL and stale fallback including `cachedAt` |
| **Gate 4 — Tests** | ✅ PASS | Fixture-driven `tests/parser.test.ts` and `tests/tools.test.ts` planned |
| **Gate 5 — Rate Limits** | ✅ PASS | Carfax scraper follows 1 req/3s, backoff on 403/429, daily cap behavior |
| **Gate 6 — Types** | ✅ PASS | Shared types/errors from `@car-auctions/shared`; no bare `Error` from handlers |
| **Gate 7 — Build** | ✅ PASS | Typecheck/lint/build/test checks remain mandatory before merge |
| **Gate 8 — Observability** | ✅ PASS | OTEL span attributes required for all tool calls |
| **Gate 9 — Stability** | ✅ PASS | New package follows canonical structure; no unsolicited refactors |

## Project Structure

### Documentation (this feature)

```text
specs/003-carfax-scraper-mcp-tools/
├── plan.md
├── spec.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── public-api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - not created in this run)
```

### Source Code (repository root)
```text
packages/carfax-scraper-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── config/
│   └── default.json
├── src/
│   ├── index.ts
│   ├── server.ts
│   ├── tools/
│   │   ├── report.ts
│   │   └── summary.ts
│   ├── scraper/
│   │   ├── browser.ts
│   │   ├── carfax-client.ts
│   │   ├── interceptor.ts
│   │   └── parser.ts
│   ├── cache/
│   │   ├── sqlite.ts
│   │   └── memory.ts
│   ├── utils/
│   │   ├── config.ts
│   │   ├── rate-limiter.ts
│   │   └── tool-response.ts
│   └── types/
│       └── index.ts
├── tests/
│   ├── parser.test.ts
│   ├── tools.test.ts
│   └── fixtures/
└── data/
```

**Structure Decision**: Add a new scraper MCP package under `packages/carfax-scraper-mcp` using the same canonical package layout used by existing scraper servers.

## Phase 0 Artifacts

Research is complete in [research.md](research.md), including decisions for:

- Carfax fetch and parsing strategy
- Carfax auth/session handling
- Report/summary derivation model
- Cache and stale fallback behavior
- Validation and error mapping contract

## Phase 1 Artifacts

Design is complete in:

- [data-model.md](data-model.md)
- [contracts/public-api.md](contracts/public-api.md)
- [quickstart.md](quickstart.md)

### Post-Design Constitution Re-Check

| Gate | Status | Evidence |
|------|--------|----------|
| **Gate 1 — Safety** | ✅ PASS | CAPTCHA is terminal (`CaptchaError`); no solve paths; no NMVTIS use in Carfax tools |
| **Gate 2 — Validation** | ✅ PASS | VIN validation contract captured in API contract and data model |
| **Gate 3 — Cache** | ✅ PASS | 30-day Carfax TTL + stale response metadata defined in model/contract |
| **Gate 4 — Tests** | ✅ PASS | Parser/tool fixture suites specified in quickstart and project structure |
| **Gate 5 — Rate Limits** | ✅ PASS | Rate-limit/backoff requirements captured in research and contracts |
| **Gate 6 — Types** | ✅ PASS | Shared typed errors and shared type imports mandated in contract |
| **Gate 7 — Build** | ✅ PASS | Root typecheck/build/lint/test validation kept as merge requirement |
| **Gate 8 — Observability** | ✅ PASS | Tool span contract documented in API contract |
| **Gate 9 — Stability** | ✅ PASS | Scope limited to new Carfax package artifacts only |

## Complexity Tracking

> No constitution violations identified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |
