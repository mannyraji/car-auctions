# Research: IAAI Scraper MCP

**Feature**: `002-iaai-scraper-mcp`  
**Phase**: 0 — Outline & Research  
**Date**: 2026-04-08  
**Status**: Complete — all NEEDS CLARIFICATION resolved

---

## Research Item 1 — IAAI `/inventorySearch` API Endpoint

**Task**: Document the request/response field mapping for IAAI's internal search endpoint.

### Decision
Intercept `https://www.iaai.com/vehiclesearch/inventorysearch` (or the equivalent JSON API that IAAI's SPA calls). The raw response wraps an array of stock objects under a `data` or `items` key. Each item maps to `IaaiRawStockData` (defined in `packages/iaai-scraper-mcp/src/types/index.ts`).

### Key field mappings (raw API → `AuctionListing`)

| IAAI Raw Field | `AuctionListing` Field | Notes |
|---|---|---|
| `stockNumber` | `lot_number` | String cast |
| `vin` | `vin` | Direct |
| `year` | `year` | Number; 0 if missing |
| `makeName` | `make` | String |
| `modelName` | `model` | String |
| `trimLevel` | `trim` | Nullable |
| `titleCode` | `title_type` + `title_code` | Code → label via map |
| `primaryDamage` | `damage_primary` | String |
| `secondaryDamage` | `damage_secondary` | Nullable |
| `hasKeys` | `has_keys` | `"YES"` → `true` |
| `odometer` | `odometer` | String or number → int |
| `odometerBrand` | `odometer_status` | Nullable |
| `color` | `color` | Nullable |
| `engineSize` | `engine` | Nullable |
| `transmission` | `transmission` | Nullable |
| `driveType` | `drive_type` | Nullable |
| `fuelType` | `fuel_type` | Nullable |
| `cylinders` | `cylinders` | String or number → int |
| `currentBid` | `current_bid` | Nullable number |
| `buyNowPrice` | `buy_now_price` | Nullable number |
| `saleDate` | `sale_date` | ISO string or null |
| `saleStatus` | `sale_status` | String; default `"UPCOMING"` |
| `finalBid` | `final_bid` | Nullable number |
| `branchName` | `location` | String (branch name) |
| `branchZip` | `location_zip` | Nullable string (FR-015) |
| `latitude` | `latitude` | Nullable number |
| `longitude` | `longitude` | Nullable number |
| `imageUrls` | `image_urls` + `image_url` | Array or object — extract all URL strings |
| `detailUrl` | `detail_url` | String |
| `seller` | `seller` | Nullable |

**Note**: `location_zip` is an important field for the deal-analyzer transport estimator. `branchZip` must be preserved. The shared `AuctionListing` type already includes `location_zip: string | null` — see `packages/shared/src/normalizer/iaai.ts` (current implementation omits this field; must add `location_zip: raw.branchZip ?? null` mapping).

### Pagination
The `/inventorySearch` endpoint supports pagination via `startIndex` + `pageSize` query params (or `page` + `size` depending on IAAI's current API version). The interceptor captures the first page; pagination is deferred to `limit` parameter truncation for Phase 3.

### Rationale
The field mapping is already partially implemented in `@car-auctions/shared/src/normalizer/iaai.ts`. The IAAI scraper package builds on this foundation. `IaaiRawStockData` in `src/types/index.ts` mirrors `IaaiRawListing` from shared types — the client uses shared types at the normalizer boundary, local types for raw transport.

### Alternatives Considered
- DOM scraping the search results page: rejected — fragile against layout changes; interceptor captures structured JSON with ~zero DOM dependency.

---

## Research Item 2 — IAAI Listing Detail Endpoint

**Task**: Identify whether `/stockDetails` or `/VehicleDetail` is the correct endpoint for full lot details, and document its extra fields beyond what `/inventorySearch` provides.

### Decision
Intercept `https://www.iaai.com/vehiclesearch/stockdetails` (JSON) or the SPA-level `VehicleDetail` API. Both return the same `IaaiRawStockData` shape with additional fields:

| Additional Field | Notes |
|---|---|
| `conditionGradeDisplay` | Condition grade string (e.g. `"3.0"`) |
| `lossType` | More specific damage description |
| `highlights` | Array of strings with inspection notes |
| `startCode` | Whether vehicle can be started |
| `bodyStyle` | Coupe, sedan, SUV, etc. |
| `series` | Sub-model/series |
| `runnable` | Boolean-like string |

These map gracefully to `grid_row` (the catch-all `Record<string, unknown>` field in `AuctionListing`) for fields not in the canonical schema.

### DOM Fallback
If the JSON endpoint is not intercepted, `parser.ts` scrapes the vehicle detail page DOM to extract the key fields listed in FR-004. The fallback handles schema changes gracefully (returns partial data rather than throwing).

### Rationale
Using the interceptor avoids fragile DOM parsing. The `grid_row` field provides a safe catch-all for detail-page-only fields that the deal analyzer may query later.

---

## Research Item 3 — IAAI Sold History Endpoint

**Task**: Identify the IAAI sold history endpoint path and parameters.

### Decision
IAAI exposes sold vehicle history via a search endpoint filtered by sale status. The interceptor pattern is:
- Navigate to `https://www.iaai.com/vehiclesearch` with parameters `saleStatus=SOLD`, `make`, `model`, `yearFrom`, `yearTo`
- The same `/inventorySearch` endpoint returns sold lots when the appropriate status filter is applied
- Alternatively, IAAI has a dedicated sold history section at `/vehiclesearch/sold` — the interceptor captures whichever JSON endpoint fires

### Response Shape
Same raw `IaaiRawStockData` shape as search results but with `saleStatus: "SOLD"` and `finalBid` populated. The `IaaiSoldEntry` type (local types) and `SoldLot` (implied by `SoldHistoryResponse` in the spec) are normalized from this.

### Aggregates Computation
`count`, `avg_final_bid`, `median_final_bid`, and `price_range {low, high}` are computed locally from the `lots` array — they are not returned by the IAAI endpoint and must be calculated in `parser.ts` or `iaai-client.ts`.

### Cache Key
`JSON.stringify({ type: 'sold', make, model, year_min, year_max })` — same pattern as copart.

### Rationale
Computing aggregates locally avoids a second API call. The `SoldHistoryResponse` shape matches `copart_sold_history` output (FR-020), enabling source-agnostic blending in `get_market_comps`.

---

## Research Item 4 — IAAI Image CDN URL Pattern

**Task**: Understand how vehicle image URLs are constructed from raw listing data.

### Decision
IAAI images are returned as pre-formed URLs in the `imageUrls` field of the raw listing. Two formats exist:

1. **Array of strings**: `["https://cs.iaai.com/images/{stockNumber}/0{n}.jpg", ...]`
2. **Object keyed by type**: `{ "exterior": ["url1", "url2"], "interior": ["url1"], "damage": ["url1"] }`

The `extractIaaiImages` function in `@car-auctions/shared/src/normalizer/iaai.ts` already handles both formats. For `iaai_get_images`, images are downloaded via Playwright page context (to send authenticated session cookies with image requests) or directly via HTTP for public CDN URLs.

### Image Category Labels
When `imageUrls` is an object, the key (e.g., `"exterior"`, `"interior"`, `"damage"`) becomes the `category` field on `ImageResult`. When it is a flat array, category is inferred from position (`index === 0` → `"exterior"`, otherwise `"detail-{n}"`).

### Processing Pipeline
Each image URL → sharp resize ≤ 800px width → WebP at 75% quality → base64 encode → return as `ImageResult`. Disk cache keyed by SHA-256 of the URL.

### Rationale
Using session-authenticated Playwright requests handles CDN images that require valid session cookies. The sharp pipeline matches the spec (FR-008) and mirrors the copart implementation in `packages/copart-scraper-mcp/src/utils/image-utils.ts`.

---

## Research Item 5 — IAAI Auth/Session Persistence

**Task**: Document the IAAI login flow and the format for persisting session state (cookies + localStorage) to disk.

### Decision
IAAI requires authentication for full inventory access. The login flow:

1. Navigate to `https://www.iaai.com/Account/Login`
2. Fill `#Email` and `#Password` fields using `IAAI_EMAIL` and `IAAI_PASSWORD` env vars
3. Submit form and wait for redirect to the user dashboard
4. Persist both cookies and localStorage to `data/session.json`

**Session persistence format** (JSON file at `data/session.json`):
```json
{
  "cookies": [ { "name": "...", "value": "...", "domain": "...", ... } ],
  "localStorage": { "https://www.iaai.com": { "key": "value", ... } },
  "savedAt": "2026-04-08T12:00:00.000Z"
}
```

On `IaaiBrowser.launch()`, both cookies and localStorage are restored before the first page request. If `IAAI_EMAIL` or `IAAI_PASSWORD` is missing, the server throws a configuration error at startup (FR-014 via FR-018).

### Difference from Copart
Copart persists only cookies (no localStorage). IAAI uses localStorage tokens for authentication state — both must be persisted and restored.

### Session Expiry Detection
If the first page navigation after restoring the session returns a redirect to `/Account/Login`, `IaaiBrowser` re-authenticates automatically (one attempt) before re-raising.

### Rationale
Disk persistence (not memory-only) ensures the session survives server restarts, reducing login frequency and blocking detection risk (frequent fresh logins are a bot signal). The JSON format is human-readable for debugging.

---

## Research Item 6 — Normalizer Title Code Fix

**Task**: Determine the correct change to `@car-auctions/shared/src/normalizer/iaai.ts` to satisfy FR-015.

### Decision
FR-015 requires: `"Unknown (XX)"` where XX is the raw unmapped title code (e.g., `"IN"`, `"JU"`, `"DM"` → `"Unknown (IN)"`, `"Unknown (JU)"`, `"Unknown (DM)"`).

Current implementation in `resolveTitleType()`:
```typescript
return 'Unknown'; // ← incorrect
```

Required change:
```typescript
return `Unknown (${code})`; // ← returns raw code for auditability
```

This is a one-line fix in `packages/shared/src/normalizer/iaai.ts`. The existing `console.warn` can be removed since the code is now preserved in the return value.

### Impact
All consumers of `normalizeIaai()` that check `title_type === "Unknown"` will now receive more specific values. The deal-analyzer risk flag for unknown title types should use a `startsWith("Unknown")` check rather than an exact match. This is tracked as a note in `data-model.md` — no breaking change to `AuctionListing` schema.

### Test Impact
The existing normalizer tests in `packages/shared/tests/normalizer.test.ts` that assert `title_type === "Unknown"` for unknown codes need to be updated to `title_type === "Unknown (XX)"`.

### Rationale
Code preservation enables downstream risk flag detection and audit trails (spec clarification, 2026-04-08). The current `"Unknown"` flat value discards the raw code, making it impossible to diagnose title wash or identify jurisdiction-specific codes.
