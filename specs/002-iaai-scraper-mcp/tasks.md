---
description: "Task list for 002-iaai-scraper-mcp implementation"
---

# Tasks: IAAI Scraper MCP

**Input**: Design documents from `/specs/002-iaai-scraper-mcp/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/public-api.md ✅, quickstart.md ✅

**Branch**: `002-iaai-scraper-mcp`
**Package**: `packages/iaai-scraper-mcp/` (mirrors `copart-scraper-mcp` 1:1)
**Cross-package fix**: `packages/shared/src/normalizer/iaai.ts` (see T005)
**Generated**: 2026-04-09

## Format: `- [ ] [ID] [P?] [Story?] Description with file path`

- **`- [ ]`**: Markdown checkbox (required on every task)
- **[P]**: Can run in parallel (different files, no unresolved dependencies)
- **[USx]**: User story label — US1=P1 Search, US2=P1 Listing, US3=P2 Images, US4=P2 VIN, US5=P3 Sold History, US6=P2 Watchlist

### Pre-Scaffolded (already exist — no task needed)

The following files are already scaffolded and do NOT require tasks:
- `packages/iaai-scraper-mcp/vitest.config.ts` — `resolveJsToTs` plugin, `@car-auctions/shared` alias, v8 coverage at 80% thresholds
- `packages/iaai-scraper-mcp/config/default.json` — rate limit (0.33 rps, 500 daily cap, 60 s max backoff), cache TTLs (15 m/60 m/24 h/7 d/90 d), proxy config
- `packages/iaai-scraper-mcp/package.json` — build/typecheck/test/start scripts, all dependencies declared
- `packages/iaai-scraper-mcp/tsconfig.json` — ES2022 target, Node16 module resolution, strict mode
- `packages/iaai-scraper-mcp/src/types/index.ts` — partially scaffolded (`IaaiSearchParams`, `IaaiRawStockData` partial, `IaaiSoldEntry`, `IaaiSoldParams`, `ScraperResult<T>`)
- `packages/iaai-scraper-mcp/src/utils/config.ts` — scaffolded

---

## Phase 1: Setup (Fixtures & Types)

**Purpose**: Complete local type definitions and create test fixtures so all subsequent phases have a stable, no-network foundation.

- [x] T001 [P] Complete all local type definitions in `packages/iaai-scraper-mcp/src/types/index.ts`: (a) add missing fields to `IaaiRawStockData` (`conditionGradeDisplay`, `lossType`, `highlights`, `startCode`, `bodyStyle`, `series`, `runnable` per research.md §2), (b) add `SoldHistoryResponse` type with `lots: IaaiSoldEntry[]` and `aggregates: { count: number; avg_final_bid: number; median_final_bid: number; price_range: { low: number; high: number } }` per data-model.md §4, (c) add `WatchlistEntry` type per data-model.md §2, (d) add `IaaiSession` type (`cookies`, `localStorage`, `savedAt`) per data-model.md §5, (e) add `IaaiConfig` type matching the `config/default.json` shape
- [ ] T002 [P] Create `packages/iaai-scraper-mcp/tests/fixtures/iaai-search-response.json` with a realistic mocked IAAI `/inventorySearch` response: ≥3 vehicles each with `stockNumber`, `vin`, `year`, `makeName`, `modelName`, `branchName`, `branchZip`, `hasKeys` as `"YES"`/`"NO"`, `titleCode` including `"SV"` and one unknown code (`"DM"`), `primaryDamage`, `secondaryDamage`, `imageUrls` array, `currentBid`, `saleDate`, `saleStatus`, `latitude`, `longitude`, `detailUrl`
- [ ] T003 [P] Create `packages/iaai-scraper-mcp/tests/fixtures/iaai-listing-response.json` with a mocked IAAI `/stockDetails` full-detail response: all `IaaiRawStockData` fields populated including `conditionGradeDisplay`, `engineSize`, `driveType`, `fuelType`, `odometerBrand`, `trimLevel`, `buyNowPrice`, `highlights`, `lossType`, `startCode`, `bodyStyle`
- [ ] T004 [P] Create `packages/iaai-scraper-mcp/tests/fixtures/iaai-sold-response.json` with a mocked IAAI sold vehicles response: ≥5 entries with varied `finalBid` values including at least one `null`, `saleStatus: "SOLD"` on all entries, to exercise aggregate computation and the all-null edge case
- [x] T005 Fix shared normalizer and types: (a) add `location_zip: string | null` to `AuctionListing` in `packages/shared/src/types/index.ts` if missing, (b) add `branchZip?: string | number` to `IaaiRawListing` if missing, (c) update `normalizeIaai()` in `packages/shared/src/normalizer/iaai.ts` to set `location_zip: raw.branchZip != null ? String(raw.branchZip) : null`, (d) update `normalizeCopart()` in `packages/shared/src/normalizer/copart.ts` to set `location_zip: null`, (e) update `resolveTitleType()` in `packages/shared/src/normalizer/iaai.ts` to return ``Unknown (${code})`` instead of `"Unknown"` for unmapped title codes, (f) update all assertions in `packages/shared/tests/normalizer.test.ts` and `packages/shared/tests/normalizer-structural.test.ts` that expected `"Unknown"` to expect `"Unknown (XX)"` — rebuild shared afterwards (FR-015, data-model.md §1)

**Checkpoint**: All local types complete; 3 fixture files ready; shared normalizer fix committed; subsequent phases have a stable foundation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All shared infrastructure — utility helpers, cache layers, the full scraper pipeline (browser → interceptor → parser → client), and the MCP server wiring — that MUST exist before any user story tool handler can be implemented.

**⚠️ CRITICAL**: No user story work (Phase 3+) can begin until this phase is complete.

### Utility Helpers

- [ ] T006 [P] Create `packages/iaai-scraper-mcp/src/utils/tool-response.ts` with: `createSuccessResponse<T>(data, cached, stale, cachedAt)` and `toToolError(err)` helpers producing the standard MCP `{ content: [{type:"text", text: JSON.stringify({success, data, ...})}] }` envelope per contracts/public-api.md; `withToolSpan(toolName, handler)` tracing wrapper that emits an OTEL span with attributes `tool.name`, `tool.status` (`"ok"|"error"`), `tool.duration_ms`, sets span status `ERROR` on failure without raw stack traces (FR-021); 60-second handler-level timeout that aborts and returns `ScraperError` with code `TIMEOUT`
- [ ] T007 [P] Create `packages/iaai-scraper-mcp/src/utils/rate-limiter.ts` with `RateLimiter` class: 1 req/3 s token bucket, exponential backoff on 403/429 (initial 3 s, max 60 s, factor ×2), daily cap 500 with reset at midnight UTC; throws `RateLimitError` from `@car-auctions/shared` on cap exceeded; reads config from `config/default.json` via `IaaiConfig` (FR-006, mirrors `packages/copart-scraper-mcp/src/utils/rate-limiter.ts`)
- [ ] T008 [P] Create `packages/iaai-scraper-mcp/src/utils/stealth.ts` with: `randomDelay(min?, max?): Promise<void>` (default 2000–5000 ms), `simulateMouseMovement(page: Page): Promise<void>` (random cursor moves + scroll), `isCaptchaPage(page: Page): Promise<boolean>` detecting IAAI CAPTCHA challenge by title/selector pattern (FR-005, FR-007)
- [ ] T009 [P] Create `packages/iaai-scraper-mcp/src/utils/image-utils.ts` with `resizeAndCompress(inputBuffer: Buffer): Promise<{ buffer: Buffer; width: number; height: number }>` using `sharp`: resize to max 800 px width (preserve aspect ratio), convert to WebP at 75% quality (FR-008)

### Cache Layers

- [ ] T010 [P] Create `packages/iaai-scraper-mcp/src/cache/memory.ts` with `MemoryCache<T>` LRU class: max 200 entries, configurable TTL (default 15 min), `get(key): T | undefined`, `set(key, value): void`, `delete(key): void`, `clear(): void` (FR-009)
- [ ] T011 [P] Create `packages/iaai-scraper-mcp/src/cache/sqlite.ts` with `IaaiSqliteCache` class using `better-sqlite3` via `createRequire(import.meta.url)` (required for ESM interop) at `data/iaai.sqlite`; initialize WAL mode and all tables from data-model.md §3: `listings` (lot_number TEXT PK, data TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at INTEGER NOT NULL), `searches` (cache_key TEXT PK, data TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at INTEGER NOT NULL), `sold_history` (cache_key TEXT PK, data TEXT NOT NULL, fetched_at TEXT NOT NULL, expires_at INTEGER NOT NULL), `watchlist` (lot_number TEXT PK, source TEXT NOT NULL DEFAULT 'iaai', added_at TEXT NOT NULL, bid_threshold REAL, last_checked_at TEXT, last_bid REAL, last_status TEXT, notes TEXT), `watchlist_history` (id INTEGER PK AUTOINCREMENT, lot_number TEXT NOT NULL, field TEXT NOT NULL, old_value TEXT, new_value TEXT, detected_at TEXT NOT NULL, FK → watchlist); create indexes `idx_watchlist_source`, `idx_watchlist_last_checked`, `idx_watchlist_history_lot`; all queries use prepared statements only — no string interpolation in SQL (FR-010, FR-019)
- [ ] T012 [P] Create `packages/iaai-scraper-mcp/src/cache/image-cache.ts` with `ImageCache` class: disk storage under `data/images/`, files named by SHA-256 hash of source URL with `.webp` suffix, 24-hour TTL enforced by `mtime` check; `get(url): Buffer | null`, `set(url, buffer): void`, `has(url): boolean` (FR-009)

### Scraper Pipeline (sequential — each step depends on the previous)

- [ ] T013 Create `packages/iaai-scraper-mcp/src/scraper/browser.ts` with `IaaiBrowser` class: `launch()` initializes Playwright Chromium via `playwright-extra` + stealth plugin (both through `createRequire(import.meta.url)`) with optional `PROXY_URL`; `authenticate(email, password)` navigates to `https://www.iaai.com/Account/Login`, fills `#Email`/`#Password`, submits, detects CAPTCHA via `isCaptchaPage()` throwing `CaptchaError`, persists cookies + `localStorage` to `data/iaai-session.json` per `IaaiSession` in data-model.md §5; `restoreSession()` loads saved session on startup and re-authenticates once on redirect to `/Account/Login`; `close()` saves session + tears down browser; exports `getBrowserInstance()` singleton (FR-005, FR-014)
- [ ] T014 Create `packages/iaai-scraper-mcp/src/scraper/interceptor.ts` with `IaaiInterceptor` class: `interceptSearch(page, params)` uses `page.route()` to intercept IAAI `/inventorySearch` XHR and resolve with raw JSON payload; `interceptListing(page, stockNumber)` intercepts `/stockDetails` or `/VehicleDetail`; `interceptSold(page, params)` intercepts `/inventorySearch` with `saleStatus=SOLD` filter; each resolves with `null` on timeout to signal DOM fallback; uses Promise-based pattern with configurable timeout (FR-003, FR-004)
- [ ] T015 Create `packages/iaai-scraper-mcp/src/scraper/parser.ts` with: `parseSearchResults(raw: unknown): IaaiRawStockData[]` (validates + extracts `/inventorySearch` items array), `parseListingDetail(raw: unknown): IaaiRawStockData` (validates `/stockDetails` payload, maps detail-only fields to `grid_row`), `parseSoldResults(raw: unknown): IaaiSoldEntry[]` (maps sold endpoint payload, preserves `null` for missing `finalBid`), `computeAggregates(entries: IaaiSoldEntry[]): SoldHistoryResponse['aggregates']` (count/avg/median/range from non-null `final_bid` entries, all zeros when none valid), `extractImageUrls(raw: IaaiRawStockData): string[]` (handles both array and keyed-object `imageUrls` formats per research.md §4), `parseDomSearch(page: Page): Promise<IaaiRawStockData[]>` (DOM fallback when interception fails); all throw `ScraperError` on malformed input (FR-003, FR-004, FR-020)
- [ ] T016 Create `packages/iaai-scraper-mcp/src/scraper/iaai-client.ts` with `IaaiClient` class orchestrating the full pipeline: `search(params)` → `MemoryCache` check → `SQLite searches` check → interceptor → parser → `normalizeIaai()` → cache write (LRU + SQLite); `getListing(stockNumber)` → `SQLite listings` check → interceptor → parser → normalize → cache write (30 s nav timeout); `getImages(stockNumber, opts)` → `ImageCache` check → fetch CDN URLs via page context → sharp pipeline → disk cache write (re-auth once on session expiry, `partial: true` if still incomplete); `getSoldHistory(params)` → `SQLite sold_history` check → interceptor → parser → `computeAggregates()` → cache write; `watchListing(action, stockNumber?, bidThreshold?, notes?)` → CRUD on `IaaiSqliteCache` watchlist tables; all navigation methods call `RateLimiter.acquire()` first, call `isCaptchaPage()` after navigation throwing `CaptchaError`; on upstream failure return stale cached data with `stale: true` when any entry exists, otherwise surface the original error (FR-005, FR-006, FR-007, FR-009, FR-011)

### Server & Entry Point

- [ ] T017 Create `packages/iaai-scraper-mcp/src/server.ts` with `createServer(deps)` that instantiates the `@modelcontextprotocol/sdk` MCP server (via `createRequire` import pattern) and registers all 6 tool slots as stubs returning `{ success: false, error: "not implemented" }`, with correct Zod input schemas and descriptions from contracts/public-api.md; stubs are replaced by real handlers in Phases 3–8 (FR-001, FR-013)
- [ ] T018 Create `packages/iaai-scraper-mcp/src/index.ts` entry point: validate `IAAI_EMAIL`/`IAAI_PASSWORD` env vars at startup (fail-fast with clear config error if missing), call `initTracing()` from `@car-auctions/shared` (no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` unset), instantiate `IaaiBrowser`, `IaaiSqliteCache`, `MemoryCache`, `ImageCache`, `RateLimiter`, `IaaiClient`, call `createServer()`, select transport from `TRANSPORT` env (`"stdio"` default | `"sse"` | `"ws"`), start listening (FR-013, FR-014, FR-017, FR-018)

**Checkpoint**: Full scraper pipeline functional; server starts via stdio; all 6 tools registered as stubs; no user story logic yet

---

## Phase 3: User Story 1 — Search IAAI Inventory (Priority: P1) 🎯 MVP

**Goal**: `iaai_search` returns a normalized `AuctionListing[]` with `source: "iaai"`, served from LRU cache on repeated calls within 15 min, with rate limiting and CAPTCHA handling.

**Independent Test**: Supply mocked `/inventorySearch` fixture → verify array of `AuctionListing` with correct field mappings (`stockNumber`→`lot_number`, `branchName`→`location`, `branchZip`→`location_zip`, `hasKeys:"YES"`→`has_keys:true`, `titleCode:"SV"`→`title_type:"Salvage"`, unknown code→`"Unknown (DM)"`), all `source:"iaai"`, `cached:false` on first call, `cached:true` within 15 min (SC-001, SC-003, SC-004, SC-005).

- [ ] T019 [P] [US1] Write parser fixture tests in `packages/iaai-scraper-mcp/tests/parser.test.ts`: load `tests/fixtures/iaai-search-response.json`, call `parseSearchResults()`, assert: (a) correct item count, (b) all IAAI field mappings (`stockNumber`→`lot_number` etc.), (c) title code label resolution (`"SV"`→`"Salvage"`, unknown code→`"Unknown (DM)"`), (d) `hasKeys:"YES"`→`has_keys:true` boolean conversion, (e) `branchZip`→`location_zip` preserved as string, (f) `ScraperError` thrown on malformed/empty input
- [ ] T020 [P] [US1] Write tool handler tests for `iaai_search` in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `IaaiClient.search()` returning fixture data → assert MCP success envelope with `AuctionListing[]` in `data`; (b) mock stale cache hit → assert `stale:true` with non-null `cachedAt` ISO string; (c) mock `RateLimitError` → assert error envelope `type:"RateLimitError"` with `retryAfterMs`; (d) mock `CaptchaError` → assert error envelope `type:"CaptchaError"`; (e) mock scraper failure + no cached entry → assert original `ScraperError` surfaced; (f) mock `CacheError` → assert error envelope `type:"CacheError"`
- [ ] T021 [US1] Create `packages/iaai-scraper-mcp/src/tools/search.ts` and wire into `packages/iaai-scraper-mcp/src/server.ts` replacing the `iaai_search` stub: Zod schema (`query` required string, `make`/`model` optional string, `year_min`/`year_max` optional `z.number().int().min(1900).max(2100)`, `zip` optional `z.string().regex(/^\\d{5}$/)`, `radius` optional positive int, `limit` optional `z.number().int().min(1).max(100).default(50)`), call `client.search(params)`, wrap in `withToolSpan("iaai_search", ...)` + `createSuccessResponse()`, map errors via `toToolError()` (FR-001, FR-003, FR-006, FR-007, FR-009, FR-011, FR-016)

**Checkpoint**: `iaai_search` fully functional; fixture-based tests pass; LRU cache hit verifiable; MVP deliverable

---

## Phase 4: User Story 2 — Fetch Full Listing Details (Priority: P1)

**Goal**: `iaai_get_listing` returns a complete `AuctionListing` with all detail fields populated, served from SQLite cache within 60 min, with stale fallback on scraper failure.

**Independent Test**: Supply mocked `/stockDetails` fixture → verify all required fields present and correctly mapped including `conditionGradeDisplay`→`grid_row` and `location_zip`; call again (mock cache hit) → verify `cached:true`; mock scraper failure with recent cache entry → verify `stale:true` with `cachedAt` (SC-001, SC-002, SC-008).

- [ ] T022 [P] [US2] Write parser fixture tests for listing detail in `packages/iaai-scraper-mcp/tests/parser.test.ts`: load `tests/fixtures/iaai-listing-response.json`, call `parseListingDetail()`, assert: (a) all required `AuctionListing` fields mapped (`lot_number`, `vin`, `year`, `make`, `model`, `odometer`, `damage_primary`, `title_type`, `location`, `location_zip`, `current_bid`, `sale_date`, `has_keys`, `source:"iaai"`), (b) detail-only fields present in result (`conditionGradeDisplay`, `engineSize`, `driveType`, `fuelType`, `odometerBrand`, `trimLevel`), (c) `ScraperError` thrown on malformed payload
- [ ] T023 [P] [US2] Write tool handler tests for `iaai_get_listing` in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `IaaiClient.getListing()` with fixture → assert complete `AuctionListing` in success envelope; (b) mock SQLite cache hit → assert `cached:true`; (c) mock scraper failure + cached entry present → assert `stale:true` with `cachedAt`; (d) mock failure + no cached entry → assert `ScraperError` returned; (e) mock non-existent stock number → assert error envelope with not-found message
- [ ] T024 [US2] Create `packages/iaai-scraper-mcp/src/tools/listing.ts` and wire into `packages/iaai-scraper-mcp/src/server.ts` replacing the `iaai_get_listing` stub: Zod schema (`stock_number` required `z.string().regex(/^[a-zA-Z0-9]+$/)` per FR-016), call `client.getListing(stockNumber)`, wrap in `withToolSpan("iaai_get_listing", ...)` + `createSuccessResponse()`, map errors via `toToolError()` (FR-001, FR-002, FR-004, FR-009, FR-011, FR-016)

**Checkpoint**: `iaai_get_listing` fully functional; SQLite cache and stale fallback verified by tests

---

## Phase 5: User Story 3 — Retrieve Vehicle Photos (Priority: P2)

**Goal**: `iaai_get_images` returns compressed WebP base64 images (max 800 px wide, 75% quality) with category labels; disk cache hit serves without re-download; `image_types` filter applied correctly.

**Independent Test**: Mock IAAI CDN image URLs → verify each image has `{index, label, category, base64, width, height}` with WebP at ≤800 px; verify `max_images:10` caps a 12-image set; verify `image_types:["damage"]` returns only damage images; verify disk cache hit (SC-002, SC-009).

- [ ] T025 [P] [US3] Write tool handler tests for `iaai_get_images` in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `IaaiClient.getImages()` returning 12 images → assert 10 returned when `max_images:10`; (b) mock `image_types:["damage"]` → assert only damage-category images; (c) mock disk cache hit → assert `cached:true`; (d) mock session expiry + re-auth → assert `partial:true` in data; (e) mock scraper failure + cached set → assert `stale:true` with `cachedAt`; (f) mock failure + no cached set → assert `ScraperError`
- [ ] T026 [US3] Create `packages/iaai-scraper-mcp/src/tools/images.ts` and wire into `packages/iaai-scraper-mcp/src/server.ts` replacing the `iaai_get_images` stub: Zod schema (`stock_number` required `z.string().regex(/^[a-zA-Z0-9]+$/)`, `max_images` optional `z.number().int().min(1).max(50).default(20)`, `image_types` optional `z.array(z.enum(["exterior","interior","damage","engine","undercarriage"]))`), call `client.getImages(stockNumber, opts)`, wrap in `withToolSpan("iaai_get_images", ...)` + `createSuccessResponse()`, map errors via `toToolError()` (FR-001, FR-008, FR-009, FR-011, FR-016)

**Checkpoint**: `iaai_get_images` fully functional; image pipeline and disk cache verified by tests

---

## Phase 6: User Story 4 — Decode VIN (Priority: P2)

**Goal**: `iaai_decode_vin` validates VIN at the tool boundary (17 chars, no I/O/Q), delegates entirely to `@car-auctions/shared` `SqliteVinCache`, returns `VINDecodeResult` with 90-day caching.

**Independent Test**: Pass known valid VIN → verify `VINDecodeResult` fields (year, make, model, engine, body_class, transmission, drive_type); pass same VIN → verify `cached:true`; pass VIN containing `O` → assert validation error with no external API call (SC-002, SC-009, FR-012).

- [ ] T027 [P] [US4] Write tool handler tests for `iaai_decode_vin` in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `SqliteVinCache.decode()` → assert `VINDecodeResult` with all spec fields; (b) mock cache hit → assert `cached:true`; (c) test VIN `"1HGBH41JXMN10918O"` (contains O) → assert validation error, no call to decode; (d) test VIN < 17 chars → assert validation error; (e) test VIN containing `I` or `Q` → assert validation error
- [ ] T028 [US4] Create `packages/iaai-scraper-mcp/src/tools/vin.ts` and wire into `packages/iaai-scraper-mcp/src/server.ts` replacing the `iaai_decode_vin` stub: Zod schema (`vin` required `z.string().length(17).regex(/^[A-HJ-NPR-Z0-9]{17}$/i)` which rejects I/O/Q per FR-012), delegate to `@car-auctions/shared` `SqliteVinCache.decode(vin)`, wrap in `withToolSpan("iaai_decode_vin", ...)` + `createSuccessResponse()`, map errors via `toToolError()` (FR-001, FR-012, FR-016)

**Checkpoint**: `iaai_decode_vin` fully functional; VIN validation and 90-day shared cache delegation verified

---

## Phase 7: User Story 6 — Watch IAAI Lots for Changes (Priority: P2)

**Goal**: `iaai_watch_listing` add/remove/list operations round-trip correctly in SQLite with `source:"iaai"`, upsert on duplicate add, idempotent delete when lot not found.

**Independent Test**: `action:"add"` inserts with `source:"iaai"` and `added_at`; re-add upserts instead of duplicating; `action:"list"` returns all watched IAAI lots; `action:"remove"` deletes entry; `action:"remove"` for non-existent lot returns `removed:true` without error (SC-010, FR-019).

- [ ] T029 [P] [US6] Write tool handler tests for `iaai_watch_listing` in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `IaaiSqliteCache` watchlist → test add inserts with `source:"iaai"`, correct `added_at`, optional `bid_threshold`; (b) test duplicate add performs upsert not duplicate insert; (c) test list returns `WatchlistEntry[]`; (d) test remove deletes entry; (e) test `action:"add"` without `stock_number` → Zod validation error; (f) test `action:"remove"` without `stock_number` → Zod validation error; (g) test `action:"remove"` for stock_number NOT in watchlist → assert `removed:true` with no error (idempotent delete per AC-5)
- [ ] T030 [US6] Create `packages/iaai-scraper-mcp/src/tools/watchlist.ts` and wire into `packages/iaai-scraper-mcp/src/server.ts` replacing the `iaai_watch_listing` stub: Zod schema (`action` required `z.enum(["add","remove","list"])`, `stock_number` required when action is `"add"` or `"remove"` via Zod `.refine()` with `z.string().regex(/^[a-zA-Z0-9]+$/)`, `bid_threshold` optional `z.number().positive()`, `notes` optional `z.string()`), route to `client.watchListing(action, stockNumber, bidThreshold, notes)`, wrap in `withToolSpan("iaai_watch_listing", ...)` + `createSuccessResponse()`, map errors via `toToolError()` (FR-001, FR-016, FR-019)

**Checkpoint**: `iaai_watch_listing` round-trip verified; `watchlist` + `watchlist_history` tables confirmed with `source:"iaai"`

---

## Phase 8: User Story 5 — Query Sold History for Market Comps (Priority: P3)

**Goal**: `iaai_sold_history` returns `lots[]` + `aggregates` with correct statistics; `null` final_bid entries excluded from all aggregates; 7-day SQLite cache; stale fallback active on scraper failure.

**Independent Test**: Supply mocked sold fixture (≥5 entries, one `finalBid:null`) → verify `lots` array shape, `aggregates.count` = count of non-null bids, correct avg/median/range; all-null fixture → all aggregates `0`; mock 7-day cache hit → `cached:true` (SC-001, FR-020).

- [ ] T031 [P] [US5] Write parser fixture tests for sold history in `packages/iaai-scraper-mcp/tests/parser.test.ts`: load `tests/fixtures/iaai-sold-response.json`, call `parseSoldResults()`, assert: (a) correct mapping to `IaaiSoldEntry[]` (lot_number, sale_date, final_bid, damage_primary, odometer, title_type), (b) `null` preserved for missing `finalBid`; then test `computeAggregates()` with fixture data → assert count excludes null bids, correct avg/median/range; test with all-null input → assert all values `0`
- [ ] T032 [P] [US5] Write tool handler tests for `iaai_sold_history` in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `IaaiClient.getSoldHistory()` with 5-entry fixture (one null bid) → verify `lots` array shape and `aggregates` (count=4, correct avg/median/range); (b) mock 7-day cache hit → assert `cached:true`; (c) mock scraper failure + cached result present → assert `stale:true` with `cachedAt`; (d) mock failure + no cached result → assert `ScraperError`; (e) all-null `final_bid` → assert all aggregate values `0`
- [ ] T033 [US5] Create `packages/iaai-scraper-mcp/src/tools/sold.ts` and wire into `packages/iaai-scraper-mcp/src/server.ts` replacing the `iaai_sold_history` stub: Zod schema (`make` required `z.string().min(1)`, `model` required `z.string().min(1)`, `year_min`/`year_max` optional `z.number().int().min(1900).max(2100)`, `limit` optional `z.number().int().min(1).max(100).default(50)`), call `client.getSoldHistory(params)`, wrap in `withToolSpan("iaai_sold_history", ...)` + `createSuccessResponse()`, map errors via `toToolError()` (FR-001, FR-009, FR-011, FR-016, FR-020)

**Checkpoint**: All 6 MCP tools fully implemented; all user stories independently verifiable via fixture-based tests

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Validate observability, error-type coverage, build integrity, gitignore, and stability gates before merge.

- [ ] T034 [P] Verify `packages/iaai-scraper-mcp/data/` is covered by the root `.gitignore` for `data/iaai.sqlite`, `data/images/`, and `data/iaai-session.json`; add entry if missing (FR-010, FR-014)
- [ ] T035 [P] Verify `packages/shared` normalizer tests pass after the T005 fix: run `npx vitest run` from `packages/shared/` and confirm `normalizer.test.ts` + `normalizer-structural.test.ts` pass with updated `"Unknown (XX)"` assertions
- [ ] T036 [P] Add observability tests in `packages/iaai-scraper-mcp/tests/tools.test.ts`: for each tool assert span attributes `tool.name`, `tool.status:"ok"` on success and `tool.status:"error"` with span status `ERROR` on failure; assert no raw stack trace exported as span attribute (SC-011, FR-021)
- [ ] T037 [P] Add error-coverage tests in `packages/iaai-scraper-mcp/tests/tools.test.ts`: (a) mock `IaaiSqliteCache` read/write failure → assert structured `CacheError` envelope returned, (b) mock a tool handler exceeding 60 s → assert `ScraperError` with code `TIMEOUT` returned
- [ ] T038 Run `npx vitest run --coverage` in `packages/iaai-scraper-mcp/` and verify ≥80% branch coverage on `src/tools/` and `src/scraper/parser.ts`; fix any under-covered branches (Gate 4, SC-001, SC-002)
- [ ] T039 Build the full pipeline: `npm run build` in `packages/shared/`, then `npm run build` in `packages/iaai-scraper-mcp/`; confirm `packages/iaai-scraper-mcp/dist/index.js` exists; run `npx tsc --noEmit` from `packages/iaai-scraper-mcp/` with zero errors (SC-012, FR-022, Gate 7)
- [ ] T040 [P] Startup smoke check: with `IAAI_EMAIL` and `IAAI_PASSWORD` set, run `node dist/index.js` via stdio transport from `packages/iaai-scraper-mcp/` and confirm server starts without unhandled errors (SC-007, FR-018)
- [ ] T041 [P] Run ESLint for `packages/iaai-scraper-mcp/` with `--max-warnings 0`; confirm zero warnings (Gate 7, SC-012, FR-022)
- [ ] T042 [P] Scope and stability review: inspect all changed files in `packages/iaai-scraper-mcp/` to verify no unsolicited refactors, renames, or structural deviations from the canonical `copart-scraper-mcp` pattern; confirm no local redefinitions of `AuctionListing` or shared error types (Gate 9)

**Checkpoint**: All 42 tasks complete; all tests pass; ≥80% branch coverage; OTEL/lint/stability gates pass; server starts cleanly

---

## FR / SC / Quality-Gate Traceability Matrix

| Requirement / Gate | Task Coverage |
|---|---|
| FR-001 (6 MCP tools registered) | T017, T021, T024, T026, T028, T030, T033 |
| FR-002 (shared output shapes) | T021, T024, T033 |
| FR-003 (search interceptor + DOM fallback) | T014, T015, T016, T019, T021 |
| FR-004 (listing interceptor) | T014, T015, T016, T022, T024 |
| FR-005 (anti-bot: stealth, delays, mouse sim) | T008, T013, T016, T024 |
| FR-006 (rate limit 1/3 s, backoff, 500/day) | T007, T016, T006, T021 |
| FR-007 (CAPTCHA detection → CaptchaError) | T008, T013, T016, T020 |
| FR-008 (image resize/compress pipeline) | T009, T016, T025 |
| FR-009 (cache TTLs: LRU/SQLite/disk/VIN) | T010, T011, T012, T016, T025, T032 |
| FR-010 (SQLite WAL + data/ gitignored) | T011, T034 |
| FR-011 (stale fallback whenever cached data exists) | T016, T020, T023, T025, T032 |
| FR-012 (VIN validation 17 chars, no I/O/Q) | T027, T028 |
| FR-013 (stdio/SSE/WS transports) | T017, T018 |
| FR-014 (IAAI auth + session persistence) | T013, T018 |
| FR-015 (normalizer field mappings + Unknown(XX)) | T005, T019 |
| FR-016 (input validation at tool boundary) | T021, T024, T026, T028, T030, T033 |
| FR-017 (OTEL tracing init, no-op when unset) | T018 |
| FR-018 (server starts via `node dist/index.js`) | T039, T040 |
| FR-019 (watchlist SQLite schema, source=iaai) | T011, T029, T030 |
| FR-020 (sold history lots[] + aggregates) | T001, T015, T016, T031, T032, T033 |
| FR-021 (OTEL span per tool invocation) | T006, T036 |
| FR-022 (tsc --noEmit + ESLint zero errors) | T039, T041 |
| SC-001 (parser fixture tests pass) | T019, T022, T031, T038 |
| SC-002 (tool handler tests pass) | T020, T023, T025, T027, T029, T032, T038 |
| SC-003 (iaai_search structurally matches copart) | T019, T021 |
| SC-004 (search cache hit <10 ms) | T010, T016, T021 |
| SC-005 (field mappings 100% accurate) | T005, T019 |
| SC-006 (CAPTCHA → CaptchaError, no solving) | T008, T013, T020 |
| SC-007 (server starts cleanly via stdio) | T018, T040 |
| SC-008 (stale fallback returns last known) | T016, T020, T023, T025, T032 |
| SC-009 (5 cache TTLs enforced) | T010, T011, T012, T016, T038 |
| SC-010 (watchlist add/remove/list round-trip) | T029, T030 |
| SC-011 (span attributes per invocation) | T006, T036 |
| SC-012 (typecheck + ESLint zero errors/warnings) | T039, T041 |
| Gate 1 — Safety | T008, T013, T020 |
| Gate 2 — Validation | T021, T024, T026, T028, T030, T033 |
| Gate 3 — Cache | T010, T011, T012, T016, T023, T032 |
| Gate 4 — Tests | T019, T020, T022, T023, T025, T027, T029, T031, T032, T038 |
| Gate 5 — Rate Limits | T007, T016, T037 |
| Gate 6 — Types | T001, T006, T021, T024, T026, T028, T030, T033, T037 |
| Gate 7 — Build | T039, T041 |
| Gate 8 — Observability | T006, T018, T036 |
| Gate 9 — Stability | T042 |

**Note**: T002–T004 (fixtures) and T034 (gitignore) are enabling tasks not mapped to specific FR/SC requirements.

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup: T001–T005)
    |
    v
Phase 2 (Foundational: T006–T018) -- BLOCKS ALL user story phases
    |
    |---> Phase 3 (US1 Search -- P1)      T019-T021 -|
    |---> Phase 4 (US2 Listing -- P1)     T022-T024 -|
    |---> Phase 5 (US3 Images -- P2)      T025-T026 -| can run in parallel
    |---> Phase 6 (US4 VIN -- P2)         T027-T028 -|
    |---> Phase 7 (US6 Watchlist -- P2)   T029-T030 -|
    |---> Phase 8 (US5 Sold Hist -- P3)   T031-T033 -|
                                                     |
                                                     v
                                          Phase 9 (Polish: T034-T042)
```

### User Story Independence

| Story | Depends On | Can Parallelize With |
|---|---|---|
| US1 Search (P1) | Phase 2 only | US2, US3, US4, US5, US6 |
| US2 Listing (P1) | Phase 2 only | US1, US3, US4, US5, US6 |
| US3 Images (P2) | Phase 2 only (optionally uses US2 image URLs) | US1, US2, US4, US5, US6 |
| US4 VIN (P2) | Phase 2 only | All others |
| US6 Watchlist (P2) | Phase 2 only | All others |
| US5 Sold History (P3) | Phase 2 only | All others |

### Within Each User Story

1. Parser tests `[P]` + tool handler tests `[P]` can run in parallel (separate files)
2. Tool implementation (no `[P]`) follows after tests are written
3. Each story is independently testable without live IAAI access

### Parallel Opportunities

| Parallel Group | Tasks | Constraint |
|---|---|---|
| Phase 1 fixtures | T002, T003, T004 | Separate files, no deps |
| Phase 1 types + normalizer fix | T001 ∥ T005 | Different packages |
| Phase 2 utilities | T006, T007, T008, T009 | Separate files, no deps |
| Phase 2 caches | T010, T011, T012 | Separate files, no deps |
| Phase 2 scraper | T013 -> T014 -> T015 -> T016 | Sequential (internal deps) |
| Phase 2 server | T017 -> T018 | After T016 |
| Phases 3 + 4 (P1) | T019-T021 ∥ T022-T024 | Separate tool files |
| Phases 5 + 6 + 7 (P2) | T025-T026 ∥ T027-T028 ∥ T029-T030 | Separate tool files |
| Phase 9 verification | T034, T035, T036, T037, T040, T041, T042 | All parallelizable |

---

## Parallel Example: Phases 3 + 4 Concurrently

```bash
# Terminal 1 -- User Story 1 (Search)
# T019: parser tests (parallel) + T020: tool tests (parallel)
# T021: implement search.ts

# Terminal 2 -- User Story 2 (Listing)
# T022: parser tests (parallel) + T023: tool tests (parallel)
# T024: implement listing.ts
```

---

## Implementation Strategy

### MVP Scope (Phases 1–3): 21 tasks

Delivers a working `iaai_search` tool — the primary value for doubling inventory coverage beyond Copart. The normalizer fix (T005) ensures downstream deal-analyzer tools consume IAAI data without source-specific logic.

### Full Delivery (Phases 1–8): 33 tasks

All 6 tools implemented with full fixture-based test coverage and all cache layers. After Phase 4, the `analyze_vehicle` pipeline can process IAAI vehicles. After Phase 7, the alerts service gains IAAI lot tracking parity with Copart.

### Complete with Polish (Phases 1–9): 42 tasks

All quality gates verified: ≥80% branch coverage on `src/tools/` and `src/scraper/parser.ts`, OTEL span tests, `CacheError`/timeout coverage, ESLint/typecheck zero-error, end-to-end build, server startup confirmation.

### Validation (after each phase checkpoint)

```bash
cd packages/iaai-scraper-mcp
npx vitest run
```

Tests pass for all completed user stories. No live IAAI access required at any point.
