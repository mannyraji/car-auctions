# Public API Contract: IAAI Scraper MCP

**Feature**: `002-iaai-scraper-mcp`  
**Phase**: 1 — Design & Contracts  
**Date**: 2026-04-08  
**MCP Server Name**: `iaai-scraper-mcp`

All six tools follow the `{source}_{action}` naming convention (Constitution Gate 6). All inputs are validated at the tool boundary via Zod schemas. All outputs conform to the standard MCP `{ content: [{type:"text", text: string}] }` shape; the `text` field is a JSON-stringified response object.

---

## Standard Response Envelope

Every tool returns a JSON-stringified object matching this shape:

```typescript
// Success
{
  success: true,
  data: T,
  cached?: boolean,
  stale?: boolean,
  cachedAt: string | null    // ISO 8601; always null (never undefined) when freshly fetched
}

// Error
{
  success: false,
  data: null,                // always present as null in error responses; never omitted
  error: {
    type: "ScraperError" | "CaptchaError" | "RateLimitError" | "CacheError",
    message: string,
    retryAfterMs?: number   // present for RateLimitError
  }
}
```

---

## Tool: `iaai_search`

**Description**: Search IAAI live auction inventory by make, model, year range, damage, and location.  
**Priority**: P1  
**FR**: FR-001, FR-003, FR-005, FR-006, FR-007, FR-009, FR-011, FR-016

### Input Schema

```typescript
{
  query: string;            // required — free-text search term
  make?: string;            // e.g., "Toyota"
  model?: string;           // e.g., "Camry"
  year_min?: number;        // int 1900–2100
  year_max?: number;        // int 1900–2100
  zip?: string;             // 5-digit numeric (validated)
  radius?: number;          // positive int, miles
  limit?: number;           // 1–100, default 50
}
```

**Input Validation**:
- `query`: max 200 characters; exceeding this limit returns `ScraperError`
- `zip`: validated as string matching `/^\d{5}$/`; never coerced to integer; leading zeros (e.g., `"01234"`) are preserved
- `limit`: if outside `[1, 100]`, returns `ScraperError` with message `"limit must be between 1 and 100"`
- `year_min` / `year_max`: if `year_min > year_max`, returns `ScraperError` with message `"year_min must be ≤ year_max"`

### Output: `data` field type

```typescript
AuctionListing[]   // source: "iaai" on all items
```

### Behavior

- Intercepts `/inventorySearch` IAAI internal API endpoint
- **Interception hit (full mode)**: all `AuctionListing` fields populated from JSON payload
- **DOM fallback (interception miss)**: limited result set; fields available: `lot_number`, `vin`, `year`, `make`, `model`, `damage_primary`, `current_bid`, `sale_date`, `location`; all other fields are `null`
- Checks in-memory LRU cache first (15 min TTL, 200 entries max); cache key: `JSON.stringify` of `{type:"search", make, model, year_min, year_max, zip, radius, limit, query}` with keys sorted alphabetically to ensure parameter-order-independent cache hits
- **Daily cap exhaustion**: when the 500-request daily cap is reached, the system checks for a stale cache entry before throwing `RateLimitError`; if a stale entry exists it is returned with `stale: true`; if no cached entry exists, `RateLimitError` is thrown
- On scraper failure: returns stale cache with `stale: true` and non-null `cachedAt` if any entry exists (staleness measured from `fetched_at`), otherwise re-throws
- On HTTP 429/403: throws `RateLimitError` with `retryAfterMs`
- On CAPTCHA: throws `CaptchaError`

### Example Response

```json
{
  "success": true,
  "data": [
    {
      "source": "iaai",
      "lot_number": "38234521",
      "vin": "1HGBH41JXMN109186",
      "year": 2021,
      "make": "Toyota",
      "model": "Camry",
      "trim": "LE",
      "title_type": "Salvage",
      "title_code": "SV",
      "damage_primary": "Front End",
      "has_keys": true,
      "odometer": 42000,
      "current_bid": 4200,
      "sale_date": "2026-04-15T14:00:00.000Z",
      "location": "Dallas",
      "location_zip": "75201",
      "images_available": 12,
      "source": "iaai"
    }
  ],
  "cached": false,
  "stale": false,
  "cachedAt": null
}
```

---

## Tool: `iaai_get_listing`

**Description**: Fetch complete details for a specific IAAI lot by stock number.  
**Priority**: P1  
**FR**: FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, FR-009, FR-011, FR-016

### Input Schema

```typescript
{
  stock_number: string;   // required — alphanumeric only (validated)
}
```

### Output: `data` field type

```typescript
AuctionListing   // source: "iaai"; full detail fields populated
```

### Behavior

- Intercepts `/stockDetails` or `/VehicleDetail` endpoint
- **Interception hit (full mode)**: all `AuctionListing` fields populated, including detail-only fields: `conditionGradeDisplay`, `lossType`, `highlights`, `startCode`, `bodyStyle`, `series`, `runnable` (captured into `grid_row`)
- **DOM fallback (interception miss)**: fields available: `lot_number`, `vin`, `year`, `make`, `model`, `odometer`, `damage_primary`, `title_type`, `location`, `current_bid`, `sale_date`, `has_keys`; detail-only fields (`conditionGradeDisplay`, `lossType`, `highlights`, `startCode`, `bodyStyle`, `series`, `runnable`) are `null` / absent from `grid_row`
- Checks SQLite cache first (60 min TTL)
- **Daily cap exhaustion**: same stale-before-throw behavior as `iaai_search`
- On scraper failure: returns stale entry with `stale: true` and non-null `cachedAt` if any entry exists; staleness measured from `fetched_at`, not from `expires_at`; otherwise re-throws
- If stock number not found: returns `ScraperError` carrying a `notFound: true` boolean property on the error object (not embedded in the message string) — enables programmatic detection by downstream callers
- Timeout: 30 s hard limit per navigation (`page.goto` timeout); on timeout, stale fallback is checked before re-throwing

---

## Tool: `iaai_get_images`

**Description**: Fetch and return compressed vehicle photos for a specific IAAI lot.  
**Priority**: P2  
**FR**: FR-001, FR-008, FR-009, FR-011, FR-016

### Input Schema

```typescript
{
  stock_number: string;           // required — alphanumeric only
  max_images?: number;            // 1–50, default 20
  image_types?: Array<
    "exterior" | "interior" | "damage" | "engine" | "undercarriage"
  >;                              // optional filter
}
```

### Output: `data` field type

```typescript
{
  images: Array<{
    index: number;
    label: string;         // e.g., "Exterior 1", "detail-3"
    category: string;      // "exterior" | "interior" | "damage" | "engine" | "detail-{n}"
                           // Images in a flat array (no category metadata) receive "detail-1", "detail-2", etc.
    base64: string;        // WebP, max 800px width, 75% quality
    width: number;
    height: number;
  }>;
  total_available: number; // total images found before max_images truncation and type filtering
  partial: boolean;        // true if session expired mid-fetch and one re-auth retry was insufficient
  stock_number: string;
}
```

### Behavior

- Image URLs sourced from `iaai_get_listing` or inline from raw data
- Each image processed through sharp: resize ≤ 800px width → WebP 75%
- Disk cache hit returns immediately without re-downloading (24 h TTL)
- If session expires during image fetch: re-authenticates once; if still incomplete after re-auth, returns `success: true` with `partial: true` and the images fetched so far — no error is thrown
- `image_types` filter applied after fetching all available image metadata

**Possible errors**: `RateLimitError` (daily cap or HTTP 429), `CaptchaError` (CAPTCHA detected on image page context), `ScraperError` (navigation timeout; CDN unreachable; stock number not found), `CacheError` (disk write failure on image cache)

---

## Tool: `iaai_decode_vin`

**Description**: Decode a 17-character VIN using the NHTSA vPIC API (90-day cache).  
**Priority**: P2  
**FR**: FR-001, FR-012, FR-016, FR-017

### Input Schema

```typescript
{
  vin: string;   // required — exactly 17 alphanumeric chars; I, O, Q rejected
}
```

### Output: `data` field type

```typescript
VINDecodeResult   // from @car-auctions/shared
// {
//   vin: string;
//   year: number;
//   make: string;
//   model: string;
//   trim: string | null;
//   engine: string | null;
//   body_class: string | null;
//   transmission: string | null;
//   drive_type: string | null;
// }
```

### Behavior

- **Scope**: this tool delegates 100% of decode logic to `@car-auctions/shared` `SqliteVinCache` + NHTSA vPIC client; no IAAI-specific VIN decode logic exists in this package
- Validates VIN at tool boundary (17 chars, no I/O/Q) before any external call
- Delegates to `@car-auctions/shared` `SqliteVinCache` + NHTSA vPIC client
- Cache hit (90-day TTL): returns in <10 ms without external API call
- Invalid VIN: returns `ScraperError` with validation message (no external call made)
- **NHTSA unavailable**: if the NHTSA vPIC API is down (network error or non-200 response), throws `ScraperError` with message `"NHTSA vPIC API unavailable"`; the 90-day SQLite cache is the only caching layer; if the cache entry is expired and NHTSA is unreachable, the error is surfaced to the caller

---

## Tool: `iaai_sold_history`

**Description**: Query historical sold IAAI lots for a vehicle make/model to establish market baselines.  
**Priority**: P3  
**FR**: FR-001, FR-002, FR-009, FR-011, FR-016, FR-020

### Input Schema

```typescript
{
  make: string;          // required — e.g., "Honda"
  model: string;         // required — e.g., "Civic"
  year_min?: number;     // int 1900–2100
  year_max?: number;     // int 1900–2100
  limit?: number;        // 1–100, default 50
}
```

**Input Validation**: if `year_min > year_max`, returns `ScraperError` with message `"year_min must be ≤ year_max"`.

### Output: `data` field type

```typescript
{
  lots: Array<{
    lot_number: string;
    sale_date: string;
    final_bid: number | null;
    damage_primary: string;
    odometer: number | null;
    title_type: string;
  }>;
  aggregates: {
    count: number;
    avg_final_bid: number;
    median_final_bid: number;
    price_range: {
      low: number;
      high: number;
    };
  };
}
```

### Behavior

- SQLite cache first (7-day TTL), keyed by `{make, model, year_min, year_max}`
- Aggregates computed locally from `lots` where `final_bid !== null`
- On scraper failure: returns stale cache if entry ≤ 24 h old
- Empty aggregates (all `final_bid` null): all aggregate values are `0`

---

## Tool: `iaai_watch_listing`

**Description**: Manage the IAAI watchlist — add, remove, or list tracked lots.  
**Priority**: P2  
**FR**: FR-001, FR-016, FR-019

### Input Schema

```typescript
{
  action: "add" | "remove" | "list";
  stock_number?: string;    // required for "add" and "remove" — alphanumeric [A-Za-z0-9] only; hyphens, spaces, and special characters are rejected
  bid_threshold?: number;   // optional for "add" — positive number; intentionally unbounded above (no maximum); stored as IEEE 754 double (SQLite REAL); currency implicitly USD
  notes?: string;           // optional for "add"
}
```

**Validation**:
- `action: "add"` or `action: "remove"` without `stock_number`: returns `ScraperError` with message `"stock_number is required for action 'add'/'remove'"`
- `action: "list"` ignores `stock_number`
- `stock_number` format: `[A-Za-z0-9]` only; hyphens, spaces, and special characters return `ScraperError` with message `"stock_number must be alphanumeric"`

### Output: `data` field type

```typescript
// action: "add"
{
  added: true;
  lot_number: string;
  source: "iaai";
  added_at: string;     // ISO 8601
}

// action: "remove"
{
  removed: true;
  lot_number: string;
}

// action: "list"
{
  entries: Array<{
    lot_number: string;
    source: "iaai";
    added_at: string;
    bid_threshold: number | null;
    last_bid: number | null;
    last_status: string | null;
  }>;
}
```

### Behavior

- All operations are synchronous SQLite CRUD
- `"add"`: upserts into `watchlist` table with `source: "iaai"` (INSERT OR REPLACE)
- `"remove"`: deletes row; no error if lot not found (idempotent)
- `"list"`: returns all rows filtered by `source = "iaai"`
- No scraper interaction — this tool only operates on the local SQLite database

**Possible errors**: `ScraperError` (invalid action value, missing `stock_number` for add/remove, invalid `stock_number` format), `CacheError` (SQLite read/write failure; e.g., disk full, WAL lock unavailable)

---

## Error Codes

| Error Type | Trigger Condition | `retryAfterMs` |
|---|---|---|
| `RateLimitError` | HTTP 429 or 403; daily cap reached | Yes |
| `CaptchaError` | CAPTCHA page detected | No |
| `ScraperError` | Playwright crash; navigation timeout; upstream 5xx; not-found | No |
| `CacheError` | SQLite read/write failure | No |

All error types are imported from `@car-auctions/shared`. Bare `Error` instances are never thrown from tool handlers.

**Zod validation errors** are caught at the tool boundary and wrapped in a `ScraperError` envelope with `type: "ScraperError"` before being returned. Raw Zod error objects are never surfaced to callers.

---

## Cross-Cutting Behaviors

### Startup Credential Validation

`IAAI_EMAIL` and `IAAI_PASSWORD` are validated **synchronously at process startup**, before any MCP tool registration. If either variable is missing or empty, the server exits immediately with `process.exit(1)` and a descriptive message — no tools are registered and no network connections are attempted.

### Session Re-Authentication

All scraper operations that detect a redirect to `/Account/Login` (session expiry) attempt exactly **one silent re-authentication**:
1. Call `IaaiBrowser.authenticate(email, password)`
2. Retry the original request once
3. If re-auth fails (CAPTCHA on login page): throw `CaptchaError`
4. If re-auth succeeds but request still fails: throw `ScraperError`

No operation retries re-authentication more than once per invocation.

### Cache Mechanics

- **Expiry on read**: on each cache read, if `expires_at` (Unix ms) has passed the entry is treated as expired and not returned as fresh; it may still be returned as stale (see FR-011)
- **Lazy cleanup**: expired rows are not deleted on read; a periodic background job runs every 10 minutes and deletes all rows where `expires_at < now()`
- **Staleness measurement**: stale entry age is always measured from `fetched_at` (the ISO 8601 timestamp set at normalization time), not from `expires_at`

---

## OpenTelemetry Tracing Contract

Every tool invocation emits one span with the following attributes:

| Attribute | Type | Description |
|---|---|---|
| `tool.name` | string | MCP tool name (e.g., `"iaai_search"`) |
| `tool.status` | `"ok"` \| `"error"` | Outcome; stale-fallback responses are `"ok"` |
| `tool.duration_ms` | float | Full handler duration: entry (post-Zod-validation) through response serialization, including cache lookup, scraper call, normalization, and cache write |

**Attribute namespace**: custom (`tool.*`); not OTEL semantic conventions.

**Span creation**: spans are always created, even when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset. Only the OTLP *exporter* is a no-op when the endpoint is absent. This allows in-process test assertions using a spy/in-memory exporter — no running OTLP endpoint is required.

**Error reporting**: on failure, span status is set to `ERROR`. The span error event includes `error.type` (class name) and `error.message`. Stack frames (`error.stack`) are **not** included in span attributes or events.

**Stale fallback**: when a stale result is returned, `tool.status` is `"ok"` and span status is `OK` — a stale response is a successful degraded result, not an error.

---

## Implementation Notes

### Type Boundary: IaaiRawStockData → IaaiRawListing

`IaaiRawStockData` (local type in `src/types/index.ts`) represents the wire format directly from IAAI's API. `IaaiRawListing` (shared type in `@car-auctions/shared`) is the input shape consumed by `normalizeIaai()`. `IaaiClient` is responsible for mapping `IaaiRawStockData → IaaiRawListing` before calling the normalizer. Fields present in the raw wire format but absent from `IaaiRawListing` are captured into `grid_row` on the resulting `AuctionListing`.

### Timeout Budget

Each `page.goto()` navigation has a **30 s** hard limit. The tool handler itself has a **60 s** outer timeout (enforced by `withToolSpan`). If navigation times out at 30 s, `ScraperError` is thrown with code `TIMEOUT` and the stale fallback is checked before re-throwing.

### `fetched_at` Consistency

`AuctionListing.fetched_at` is set by `normalizeIaai()` at normalization time — not at cache-write time. The identical timestamp is stored in `listings.fetched_at` in SQLite. Cache write implementations **MUST NOT** re-stamp this field; doing so would cause stale-fallback age calculations to be systematically incorrect.
