# Implementation Plan: IAAI Scraper MCP

**Branch**: `002-iaai-scraper-mcp` | **Date**: 2026-04-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-iaai-scraper-mcp/spec.md`

## Summary

Build the `@car-auctions/iaai-scraper-mcp` MCP server package — the IAAI counterpart to the existing Copart scraper. Exposes 6 MCP tools (`iaai_search`, `iaai_get_listing`, `iaai_get_images`, `iaai_decode_vin`, `iaai_sold_history`, `iaai_watch_listing`) using the same scraper architecture (browser → client → interceptor → parser), the same shared types from `@car-auctions/shared`, and the same caching strategy (in-memory LRU, SQLite WAL, disk image cache). Doubles the project's auction inventory coverage. The IAAI normalizer in `@car-auctions/shared` handles field mapping; a small normalizer fix (`Unknown (XX)` title codes) is required.

## Technical Context

**Language/Version**: TypeScript 5+ on Node.js 20+ (ES2022 target, Node16 module resolution, strict mode)
**Primary Dependencies**: `@car-auctions/shared`, `@modelcontextprotocol/sdk ^1.18.0`, `playwright ^1.55.0`, `playwright-extra ^4.3.6`, `puppeteer-extra-plugin-stealth ^2.11.2`, `better-sqlite3 ^12.2.0`, `sharp ^0.33.0`, `zod ^3.23.8`
**Storage**: SQLite via `better-sqlite3` (WAL mode) at `data/iaai.sqlite` for listings, sold history, watchlist; in-memory LRU (max 200 entries, 15 min) for search results; disk (`data/images/`) for compressed WebP images at 24 hr TTL; VIN cache delegated to `@car-auctions/shared` `SqliteVinCache`
**Testing**: Vitest (fixture-driven; ≥80% branch coverage on `src/tools/` and `src/scraper/parser.ts`)
**Target Platform**: Node.js 20+ (Linux server production, macOS development)
**Project Type**: MCP server (npm workspace package within monorepo, one of 7 scraper servers)
**Performance Goals**: Search cache hit <10 ms; listing cache hit <10 ms; image compression <500 ms per image; VIN decode <2 s first call, <10 ms cached
**Constraints**: Rate limit 1 req/3 s, daily cap 500 requests, exponential backoff on 403/429 (max 60 s); 30 s page navigation timeout; 60 s tool handler timeout; stale fallback returns the most recent cached result when available, while TTLs still govern freshness
**Scale/Scope**: 6 MCP tools, ~15 source files, 1 SQLite DB, session persistence file, fixture-based tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Evidence |
|------|--------|----------|
| **Gate 1 — Safety** | ✅ PASS | No CAPTCHA-solving code; `iaai_decode_vin` delegates to `@car-auctions/shared` (no NMVTIS calls); CaptchaError thrown on detection (FR-007) |
| **Gate 2 — Validation** | ✅ PASS | All 6 tools validate inputs at tool boundary via Zod schemas: stock_number alphanumeric, VIN 17-char no I/O/Q, zip 5-digit (FR-016) |
| **Gate 3 — Cache** | ✅ PASS | SQLite WAL mode; TTLs match constitution table (15 min/60 min/24 hr/7 days/90 days); stale fallback returns `cachedAt` ISO timestamp (FR-009, FR-011) |
| **Gate 4 — Tests** | ✅ PASS | Parser tests (`tests/parser.test.ts`), tool tests (`tests/tools.test.ts`) planned; fixtures in `tests/fixtures/`; live tests gated by `LIVE_TEST`; ≥80% branch coverage target on tools/parser |
| **Gate 5 — Rate Limits** | ✅ PASS | Rate limiter: 1 req/3 s, 500/day cap, exponential backoff on 403/429 (FR-006); mirrors Copart implementation |
| **Gate 6 — Types** | ✅ PASS | All types imported from `@car-auctions/shared`; no local `AuctionListing` redefinition; all errors use typed classes; error→condition mapping followed |
| **Gate 7 — Build** | ✅ PASS | `tsc --noEmit` and ESLint required zero errors/warnings (FR-022) |
| **Gate 8 — Observability** | ✅ PASS | OTEL spans for all tool invocations with `tool.name`, `tool.status`, `tool.duration_ms`; spans exported via OTLP; no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` unset (FR-017, FR-021) |
| **Gate 9 — Stability** | ✅ PASS | Follows established Copart scraper architecture 1:1; no unsolicited refactors; canonical directory layout preserved |

## Project Structure

### Documentation (this feature)

```text
specs/002-iaai-scraper-mcp/
├── plan.md              # This file
├── research.md          # Phase 0 output — all unknowns resolved
├── data-model.md        # Phase 1 output — entities, SQLite schema, cache TTLs
├── quickstart.md        # Phase 1 output — setup & run instructions
├── contracts/
│   └── public-api.md    # Phase 1 output — MCP tool input/output contracts
├── checklists/
│   └── requirements.md  # Requirements checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/iaai-scraper-mcp/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── config/
│   └── default.json              # Rate limit, cache TTL, proxy defaults
├── src/
│   ├── index.ts                  # Entry point — init tracing, create deps, start server
│   ├── server.ts                 # Register 6 MCP tools via createMcpServer
│   ├── scraper/
│   │   ├── browser.ts            # Playwright lifecycle, stealth, session persistence
│   │   ├── iaai-client.ts        # Navigation, interception, stale fallback orchestration
│   │   ├── interceptor.ts        # Network interception: /inventorySearch, /stockDetails
│   │   └── parser.ts             # DOM fallback parser + aggregate computation
│   ├── cache/
│   │   ├── sqlite.ts             # SQLite WAL cache: listings, sold history, watchlist
│   │   ├── image-cache.ts        # Disk-based 24 hr WebP image cache
│   │   └── memory.ts             # In-memory LRU (200 entries, 15 min TTL)
│   ├── tools/
│   │   ├── search.ts             # iaai_search tool handler
│   │   ├── listing.ts            # iaai_get_listing tool handler
│   │   ├── images.ts             # iaai_get_images tool handler
│   │   ├── vin.ts                # iaai_decode_vin tool handler
│   │   ├── sold.ts               # iaai_sold_history tool handler
│   │   └── watchlist.ts          # iaai_watch_listing tool handler
│   ├── utils/
│   │   ├── config.ts             # Config loader (Zod validated, default.json)
│   │   ├── rate-limiter.ts       # 1 req/3 s, backoff, 500/day cap
│   │   ├── stealth.ts            # Random delays, mouse sim, CAPTCHA detection
│   │   ├── image-utils.ts        # Sharp resize/compress pipeline
│   │   └── tool-response.ts      # MCP response builders (ToolResponse<T>)
│   └── types/
│       └── index.ts              # Package-local interfaces (already scaffolded)
├── tests/
│   ├── config.test.ts            # Config loader & validation tests
│   ├── parser.test.ts            # Parser fixture tests
│   ├── tools.test.ts             # Tool handler mocked tests
│   └── fixtures/
│       ├── iaai-search-response.json
│       ├── iaai-listing-response.json
│       └── iaai-sold-response.json
└── data/                         # Runtime (gitignored)
    ├── iaai.sqlite
    ├── iaai-session.json
    └── images/
```

**Structure Decision**: Follows the canonical MCP server package layout defined in `copilot-instructions.md` § Package Structure Pattern. Mirrors the Copart scraper structure 1:1 for consistency (Constitution Pillar V Rule 5).

## Phase 0 Artifacts

Research is complete. See [research.md](research.md) for all resolved unknowns:

| Research Item | Summary |
|--------------|---------|
| IAAI `/inventorySearch` API | Intercept JSON endpoint; field mappings fully documented |
| IAAI Listing Detail Endpoint | Intercept `/stockDetails`; extra fields → `grid_row` |
| IAAI Sold History Endpoint | Same `/inventorySearch` with `saleStatus=SOLD` filter; aggregates computed locally |
| IAAI Image CDN URL Pattern | Pre-formed URLs in `imageUrls`; array or object format; sharp pipeline |
| IAAI Auth/Session Persistence | Login flow → cookies + localStorage → `data/iaai-session.json` |
| Normalizer Title Code Fix | `resolveTitleType()` → `Unknown (${code})` one-line fix in shared |

## Phase 1 Artifacts

Design is complete. See:

| Artifact | Path | Content |
|----------|------|---------|
| Data Model | [data-model.md](data-model.md) | Entities, SQLite schema, cache TTLs, state transitions |
| API Contract | [contracts/public-api.md](contracts/public-api.md) | All 6 MCP tool I/O schemas, behaviors, error codes |
| Quickstart | [quickstart.md](quickstart.md) | Setup, build, run, test instructions |

### Key Design Decisions

1. **Session persistence includes localStorage** (unlike Copart cookies-only) — IAAI uses localStorage tokens for auth state
2. **Sold history aggregates computed locally** — IAAI endpoint doesn't return aggregates; `count`, `avg_final_bid`, `median_final_bid`, `price_range` calculated from `lots` array
3. **VIN decode fully delegated** to `@car-auctions/shared` `SqliteVinCache` + NHTSA vPIC — no IAAI-specific VIN logic
4. **Cross-package fix required** before implementation: shared normalizer `resolveTitleType()` must return `Unknown (${code})` instead of `"Unknown"` (FR-015)
5. **Dual-layer search caching** keeps in-memory LRU as the primary fast path, with SQLite persistence retained for warm restart and stale fallback continuity

## Complexity Tracking

> No constitution violations identified. All gates pass.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
