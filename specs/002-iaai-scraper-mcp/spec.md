# Feature Specification: IAAI Scraper MCP

**Feature Branch**: `002-iaai-scraper-mcp`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: User description: "Phase 3 — IAAI Scraper MCP"

## Clarifications

### Session 2026-04-08

- Q: Should `iaai_watch_listing` be included in Phase 3 or deferred? → A: In scope — add `iaai_watch_listing` with the same SQLite schema as Copart
- Q: Should `iaai_sold_history` include aggregate statistics alongside the raw array? → A: Yes — include aggregates matching `copart_sold_history`: `count`, `avg_final_bid`, `median_final_bid`, `price_range {low, high}`
- Q: Where should IAAI session cookies be persisted? → A: Disk — JSON file in `data/` directory (survives restarts)
- Q: Should there be a maximum staleness age for the stale cache fallback? → A: No — return the most recent cached result whenever one exists; stale responses must include `cachedAt`, while TTLs still govern whether a cache entry is considered fresh
- Q: How should unmapped/unknown IAAI title codes be handled? → A: Return `"Unknown (XX)"` where XX is the raw code (preserves data for auditing)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Search IAAI Inventory (Priority: P1)

An AI assistant helping a car flipper wants to search IAAI's live auction inventory for vehicles matching specific criteria (make, model, year range, damage type, location, max price). The assistant calls `iaai_search` and receives a normalized list of auction listings in the same schema used by the Copart scraper, so downstream tools require no source-specific logic.

**Why this priority**: Inventory search is the entry point for every deal-finding workflow. Without it, no other tool in this package has listings to act on. It is also the primary value add for doubling inventory coverage beyond Copart.

**Independent Test**: Can be tested by supplying a mocked `/inventorySearch` API response and verifying the output is an array of `AuctionListing` objects with all required fields correctly mapped from IAAI's field names (e.g., `stockNumber` → `lot_number`, `branch` → `location`, `hasKeys: "YES"` → `has_keys: true`).

**Acceptance Scenarios**:

1. **Given** a search for `make: "Toyota", model: "Camry"`, **When** `iaai_search` is called, **Then** the response is an array of `AuctionListing` objects with `source` set to `"iaai"` and all required fields populated
2. **Given** the IAAI `/inventorySearch` endpoint returns `hasKeys: "YES"` and `titleCode: "SV"`, **When** the listing is normalized, **Then** `has_keys` is `true` (boolean) and `title_type` is `"Salvage"` (human-readable label)
3. **Given** a valid search result that was fetched within the last 15 minutes, **When** the same search is called again, **Then** the cached result is returned without hitting the IAAI site
4. **Given** IAAI returns a 429 or 403 response, **When** the rate limiter detects it, **Then** exponential backoff is applied and a `RateLimitError` is returned after retries are exhausted

---

### User Story 2 - Fetch Full Listing Details (Priority: P1)

After identifying a promising vehicle in search results, the AI assistant needs the complete details for a specific lot — condition grade, sale date, odometer, title type, damage details, and all other available fields. The assistant calls `iaai_get_listing` with a stock number and receives the full `AuctionListing` shape, identical in structure to `copart_get_listing` output.

**Why this priority**: Full listing details are required by `analyze_vehicle` and `estimate_profit` in the deal analyzer. Without this tool, the deal analysis pipeline cannot process IAAI vehicles.

**Independent Test**: Can be tested by supplying a mocked `/stockDetails` API response and verifying the output is a complete `AuctionListing` with all fields from both the IAAI detail endpoint and the shared normalizer applied correctly.

**Acceptance Scenarios**:

1. **Given** a valid stock number, **When** `iaai_get_listing` is called, **Then** the response includes at minimum: `lot_number`, `vin`, `year`, `make`, `model`, `odometer`, `damage_primary`, `title_type`, `location`, `location_zip`, `current_bid`, `sale_date`, `has_keys`, `source: "iaai"`
2. **Given** a stock number fetched within the last 60 minutes, **When** the same stock number is looked up again, **Then** the cached SQLite result is returned without navigating the IAAI site
3. **Given** IAAI is unreachable and a cached result exists, **When** `iaai_get_listing` is called, **Then** the stale cached result is returned with `stale: true` and `cachedAt` in the response

---

### User Story 3 - Retrieve Vehicle Photos (Priority: P2)

The AI assistant running damage analysis needs vehicle photos to pass to the vision classifier. The assistant calls `iaai_get_images` with a stock number and optionally filters by image type (exterior, interior, undercarriage, engine, damage). Photos are returned as compressed base64-encoded WebP images with category labels.

**Why this priority**: Images are essential for the deal analyzer's vision modules (damage severity, paint type, frame inspection). Without images, repair estimates fall back to the lowest-confidence heuristic tier.

**Independent Test**: Can be tested by mocking IAAI CDN image URLs derived from a known stock number, verifying that the Sharp resize/compress pipeline produces WebP output capped at 800px width, and that each returned image has the expected `{index, label, category, base64, width, height}` shape.

**Acceptance Scenarios**:

1. **Given** a stock number with 12 available photos, **When** `iaai_get_images` is called with `max_images: 10`, **Then** 10 images are returned, each with `base64`, `category`, `label`, `width`, and `height` fields populated
2. **Given** `image_types: ["damage"]` is specified, **When** images are fetched, **Then** only images categorized as damage photos are returned
3. **Given** fetched images are within the 24-hour disk cache TTL, **When** images are requested again, **Then** the cached copies are served without re-downloading from CDN

---

### User Story 4 - Decode VIN (Priority: P2)

When a user or the deal analyzer needs decoded vehicle specifications (engine type, trim level, body class, drive type), the AI assistant calls `iaai_decode_vin` with a 17-character VIN. The tool reuses the shared NHTSA vPIC decoder from `@car-auctions/shared` with a 90-day cache.

**Why this priority**: VIN decoding is used both in standalone queries and as part of the `analyze_vehicle` pipeline. Sharing the implementation via the shared package avoids duplication and ensures consistent caching.

**Independent Test**: Can be tested by passing a known VIN and verifying the decoded output matches expected year, make, model, engine, and body class, and that a second call within 90 days returns cached data.

**Acceptance Scenarios**:

1. **Given** a valid 17-character VIN, **When** `iaai_decode_vin` is called, **Then** the response includes year, make, model, trim, engine type, body class, and transmission
2. **Given** a VIN containing `I`, `O`, or `Q`, **When** decoded, **Then** a validation error is returned immediately without calling the NHTSA API
3. **Given** a VIN decoded within the last 90 days, **When** decoded again, **Then** the cached result is returned without an external API call

---

### User Story 5 - Query Sold History for Market Comps (Priority: P3)

The deal analyzer needs historical sold prices for comparable IAAI vehicles to establish salvage-side market baselines. The AI assistant calls `iaai_sold_history` with vehicle attributes and receives an array of recent sold lots with sale dates, final bids, odometer, and title types — the same shape as `copart_sold_history` — so `get_market_comps` can blend both sources.

**Why this priority**: Sold history extends the market comp dataset used by the deal analyzer. It is lower priority than live search and detail tools because the deal analyzer can function (with reduced accuracy) using only Copart sold data.

**Independent Test**: Can be tested by supplying a mocked IAAI sold vehicles endpoint response and verifying the output contains both the raw array of `{lot_number, sale_date, final_bid, damage_primary, odometer, title_type}` and aggregate statistics `{count, avg_final_bid, median_final_bid, price_range: {low, high}}` with correct field mappings and a 7-day SQLite cache TTL.

**Acceptance Scenarios**:

1. **Given** a query for `make: "Honda", model: "Civic"`, **When** `iaai_sold_history` is called, **Then** the response contains both a `lots` array (each item with `lot_number`, `sale_date`, `final_bid`, `damage_primary`, `odometer`, `title_type`) and an `aggregates` object with `count`, `avg_final_bid`, `median_final_bid`, and `price_range {low, high}`; lots where `final_bid` is null are excluded from all aggregate calculations
2. **Given** all returned lots have `final_bid: null` (e.g., no bids recorded), **When** aggregates are computed, **Then** `count`, `avg_final_bid`, `median_final_bid`, `price_range.low`, and `price_range.high` are all `0`
3. **Given** results fetched within the last 7 days for the same query parameters, **When** called again, **Then** cached SQLite results are returned without contacting the IAAI site

---

### User Story 6 - Watch IAAI Lots for Changes (Priority: P2)

A car flipper wants to track specific IAAI lots and be alerted when the bid price changes or the lot status updates. The AI assistant uses `iaai_watch_listing` to add a stock number to the watchlist with an optional bid threshold, list currently watched lots, and remove lots no longer of interest. The alerts service polls the watchlist to detect changes.

**Why this priority**: Watchlist is required for the alerts pipeline and enables the "active bid" use case where time-sensitive notifications are generated. Parity with `copart_watch_listing` ensures downstream alerts service code is source-agnostic.

**Independent Test**: Can be tested by calling add, list, and remove operations against a mocked SQLite database and verifying the `watchlist` and `watchlist_history` tables are updated correctly with `source: "iaai"`.

**Acceptance Scenarios**:

1. **Given** a valid stock number, **When** `iaai_watch_listing` is called with `action: "add"` and optional `bid_threshold`, **Then** the lot is inserted into the `watchlist` table with `source: "iaai"` and the correct `added_at` timestamp
2. **Given** a watched lot, **When** `iaai_watch_listing` is called with `action: "list"`, **Then** all currently watched IAAI lots are returned with their `lot_number`, `bid_threshold`, `last_bid`, and `last_status`
3. **Given** a watched lot, **When** `iaai_watch_listing` is called with `action: "remove"`, **Then** the lot is deleted from the `watchlist` table and is no longer returned by list
4. **Given** a stock number already in the watchlist, **When** `action: "add"` is called again, **Then** the existing entry is updated (upsert) rather than creating a duplicate
5. **Given** a stock number that is NOT in the watchlist, **When** `action: "remove"` is called for it, **Then** the operation succeeds with `removed: true` and no error is returned (idempotent delete)

---

### Edge Cases

- What happens when IAAI's `/inventorySearch` endpoint structure changes? The interceptor fails gracefully and falls back to DOM scraping; if that also fails, a `ScraperError` is returned.
- What happens when a CAPTCHA challenge is detected mid-session? A `CaptchaError` is thrown immediately — the scraper never attempts to solve CAPTCHAs.
- What happens when a stock number does not exist? `iaai_get_listing` returns a not-found `ScraperError` with a clear message.
- What happens when the daily request cap (500) is reached? All new requests return a `RateLimitError` with a message indicating the daily cap has been hit.
- What happens when an image URL requires a valid session cookie and the session has expired? The browser pool re-authenticates and retries once before returning a partial image set with `partial: true`.
- What happens when the `IAAI_EMAIL` or `IAAI_PASSWORD` env vars are missing? The server fails to start with a clear configuration error.
- What happens when IAAI is unreachable and a cached result exists but is no longer fresh? The system returns the most recent cached result with `stale: true` and `cachedAt`; cache TTLs control freshness, but they do not impose a separate stale-fallback age cap.
- What happens when an unknown IAAI title code (e.g., `IN`, `JU`, `DM`) is encountered? The title_type is mapped to `"Unknown (XX)"` where XX is the raw code, preserving the code for downstream risk flag detection and audit trails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose six MCP tools: `iaai_search`, `iaai_get_listing`, `iaai_get_images`, `iaai_decode_vin`, `iaai_sold_history`, and `iaai_watch_listing`
- **FR-002**: All tools MUST return responses that conform to the same data shapes as their Copart equivalents (`AuctionListing`, `VINDecodeResult`, etc.), enabling source-agnostic downstream consumption
- **FR-003**: `iaai_search` MUST intercept IAAI's `/inventorySearch` internal API endpoint and fall back to DOM scraping if interception fails
- **FR-004**: `iaai_get_listing` MUST intercept IAAI's `/stockDetails` or `/VehicleDetail` API endpoint to retrieve full lot details
- **FR-005**: The scraper MUST apply the full anti-bot strategy: Playwright stealth plugin, random delays of 2–5 seconds between page actions, mouse movement and scroll simulation, and session/cookie persistence; the random delay function MUST be injectable via a parameter (default: real `setTimeout`) to allow test overrides without incurring real delays in unit tests
- **FR-006**: The system MUST enforce a rate limit of 1 request per 3 seconds, with exponential backoff on 403/429 responses, capped at a maximum backoff of 60 seconds and a daily cap of 500 requests
- **FR-007**: The system MUST detect CAPTCHA pages and throw a `CaptchaError` without attempting to solve them
- **FR-008**: `iaai_get_images` MUST process images through a resize-and-compress pipeline (max 800px width, WebP at 75% quality) before returning base64-encoded output
- **FR-009**: The system MUST cache search results in an in-memory LRU cache (15-minute TTL, max 200 entries) as the primary search cache, with supplemental SQLite persistence permitted for warm restart and stale fallback behavior; listing details MUST be cached in SQLite (60-minute TTL), images on disk (24-hour TTL), sold history in SQLite (7-day TTL), and VIN decode results in SQLite (90-day TTL)
- **FR-010**: All SQLite databases MUST operate in WAL mode and be stored in the gitignored `data/` directory
- **FR-011**: On scraper failure, the system MUST return stale cached data with a `stale: true` flag and non-null `cachedAt` timestamp whenever a cached result exists; freshness remains governed by each cache TTL, but there is no additional stale-fallback age cap. If no cached result exists, the original scraper error MUST be surfaced instead
- **FR-012**: `iaai_decode_vin` MUST validate that the VIN is exactly 17 alphanumeric characters and does not contain the letters I, O, or Q before making any external call
- **FR-013**: The MCP server MUST support stdio, SSE, and WebSocket transports, selected via the `TRANSPORT` environment variable
- **FR-014**: The system MUST authenticate with IAAI using `IAAI_EMAIL` and `IAAI_PASSWORD` environment variables and persist the session (cookies and local storage) to `data/iaai-session.json` so that authentication survives server restarts; the file is gitignored via the `data/` rule and re-created on first successful login if absent (canonical path per data-model.md §5)
- **FR-015**: The normalizer MUST map IAAI-specific fields to the shared `AuctionListing` schema: `stockNumber` → `lot_number`, `branch` → `location`, `branchZip` → `location_zip`, `hasKeys: "YES"|"NO"` → `has_keys: boolean`, `titleCode` → `title_type` (SV→Salvage, CL→Clean, RB→Rebuilt, other codes mapped as `"Unknown (XX)"` where XX is the unmapped code)
- **FR-016**: All tool inputs MUST be validated at the tool boundary: stock number must be alphanumeric only, VIN must be 17 characters with no I/O/Q, zip codes must be 5-digit numeric
- **FR-017**: The MCP server MUST initialize OpenTelemetry tracing from `@car-auctions/shared` at startup; tracing MUST be a no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is not set
- **FR-018**: The server entry point MUST start successfully via `node dist/index.js` using stdio transport
- **FR-019**: `iaai_watch_listing` MUST store watched lots in a SQLite table using the same schema as `copart_watch_listing` (`watchlist` + `watchlist_history` tables, WAL mode), supporting add, remove, and list operations; the `source` column MUST be set to `"iaai"` for all entries
- **FR-020**: `iaai_sold_history` MUST return both a `lots` array and an `aggregates` object containing `count`, `avg_final_bid`, `median_final_bid`, and `price_range {low, high}`, matching the response shape of `copart_sold_history`; aggregates MUST be computed locally from only the lots where `final_bid !== null` (lots without a final bid are excluded from all aggregate calculations); when all returned lots have `final_bid === null`, all aggregate values MUST be `0`
- **FR-021**: Every MCP tool invocation in this package MUST emit an OpenTelemetry span with attributes `tool.name`, `tool.status` (`"ok"|"error"`), and `tool.duration_ms`; on error, span status MUST be set to `ERROR` without exporting raw stack traces
- **FR-022**: Package quality gates MUST pass before merge: `tsc --noEmit` and ESLint must complete with zero errors or warnings
- **FR-023**: When a proxy is configured via `PROXY_URL`, the scraper MUST rotate to the next available proxy on 403/429 responses or network timeout; proxy rotation failure does not block the request — the scraper proceeds without proxy

### Key Entities

- **AuctionListing**: Normalized vehicle listing sourced from IAAI; structurally identical to Copart listings with `source: "iaai"`. Key fields: `lot_number`, `vin`, `year`, `make`, `model`, `odometer`, `damage_primary`, `title_type`, `location`, `location_zip`, `current_bid`, `sale_date`, `has_keys`, `source`, `images_available`
- **SoldLot**: Historical sold vehicle record. Fields: `lot_number`, `sale_date`, `final_bid`, `damage_primary`, `odometer`, `title_type`
- **SoldHistoryResponse**: Return value of `iaai_sold_history`. Fields: `lots: SoldLot[]`, `aggregates: { count, avg_final_bid, median_final_bid, price_range: { low, high } }`
- **VINDecodeResult**: Decoded vehicle specifications from NHTSA vPIC. Fields: `vin`, `year`, `make`, `model`, `trim`, `engine`, `body_class`, `transmission`, `drive_type`
- **ImageResult**: A single vehicle photo. Fields: `index`, `label`, `category`, `base64`, `width`, `height`
- **WatchlistEntry**: A tracked IAAI lot. Fields: `lot_number`, `source: "iaai"`, `added_at`, `bid_threshold`, `last_checked_at`, `last_bid`, `last_status`, `notes`

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All parser tests pass using fixture-based IAAI API responses without hitting the live IAAI site; all real-network tests MUST be gated with `{ skip: !process.env.LIVE_TEST }` — this is a hard requirement, not a convention
- **SC-002**: All tool handler tests pass with mocked scraper implementations
- **SC-003**: The output shape of `iaai_search` is structurally identical to `copart_search` output when compared field-by-field using the normalizer structural test suite
- **SC-004**: A search result retrieved within 15 minutes is served from cache in under 10 milliseconds without browser activity
- **SC-005**: IAAI-specific field mappings are 100% accurate: `stockNumber` → `lot_number`, `branch` → `location`, `hasKeys` → `has_keys` (boolean), all `titleCode` values map to correct human-readable labels
- **SC-006**: A CAPTCHA detection scenario triggers a `CaptchaError` and never attempts automated solving
- **SC-007**: The MCP server starts cleanly via stdio with no unhandled errors when `IAAI_EMAIL` and `IAAI_PASSWORD` are set
- **SC-008**: Stale cache fallback activates on scraper failure and returns the last known result with `stale: true` and a non-null ISO 8601 `cachedAt`
- **SC-009**: All five cache TTLs are enforced: 15 min (search LRU), 60 min (listing SQLite), 24 hr (image disk), 7 day (sold history SQLite), 90 day (VIN SQLite)
- **SC-010**: `iaai_watch_listing` add/remove/list round-trips correctly verified in tool handler tests with mocked SQLite
- **SC-011**: Tool handler tests verify that each tool invocation emits a tracing span containing `tool.name`, `tool.status`, and `tool.duration_ms`, and that failed invocations set span status to `ERROR`
- **SC-012**: `npm run typecheck` and ESLint pass for `packages/iaai-scraper-mcp` with zero errors and zero warnings

## Assumptions

- IAAI requires a member account — `IAAI_EMAIL` and `IAAI_PASSWORD` environment variables are assumed to be valid credentials for a registered IAAI member account
- IAAI's internal API endpoints (`/inventorySearch`, `/stockDetails`) are assumed to follow the same general structure observed at the time of spec authoring; the interceptor falls back to DOM scraping if endpoint paths change
- IAAI's CDN for vehicle images follows the `gw.img.iaai.com` pattern; URL construction from stock number and image sequence is handled in `iaai-client.ts`
- The shared `auction-normalizer.ts` in `@car-auctions/shared` already contains the IAAI → `AuctionListing` mapping logic (implemented in Phase 1); this package consumes it and does not re-implement normalization
- The shared browser pool, VIN decoder, priority queue, and tracing modules from `@car-auctions/shared` are fully implemented (Phase 1 complete) and available as dependencies
- The Copart scraper MCP (Phase 2) serves as the reference implementation; the IAAI scraper follows the same architectural pattern: `browser.ts` → `iaai-client.ts` → `interceptor.ts` → `parser.ts`
- Daily request cap of 500 applies per running server instance; there is no cross-instance coordination
- Proxy support uses `process.env.PROXY_URL` and rotates on failure, consistent with the Copart scraper implementation
- IAAI session cookies and local storage are persisted to a JSON file in `data/iaai-session.json`; the file is gitignored via the `data/` rule and re-created on first successful login if absent

