# Data Model: IAAI Scraper MCP

**Feature**: `002-iaai-scraper-mcp`  
**Phase**: 1 — Design & Contracts  
**Date**: 2026-04-08

---

## 1. Shared Types (from `@car-auctions/shared`)

All entities below that cross the MCP tool boundary use the following shared types. Local redefinitions are forbidden (Constitution Gate 6).

### `AuctionListing`

Normalized, source-agnostic vehicle listing. Defined in `packages/shared/src/types/index.ts`.

| Field | Type | Notes |
|---|---|---|
| `source` | `"copart" \| "iaai"` | Always `"iaai"` for this package |
| `lot_number` | `string` | Maps from `stockNumber` |
| `vin` | `string` | Direct |
| `year` | `number` | `0` if missing |
| `make` | `string` | Maps from `makeName` |
| `model` | `string` | Maps from `modelName` |
| `trim` | `string \| null` | Maps from `trimLevel` |
| `title_type` | `string` | Human-readable label (see Title Code Map) |
| `title_code` | `string \| null` | Raw IAAI code (e.g., `"SV"`) |
| `damage_primary` | `string` | Maps from `primaryDamage` |
| `damage_secondary` | `string \| null` | Maps from `secondaryDamage` |
| `has_keys` | `boolean` | `"YES"` → `true`, all else → `false` |
| `odometer` | `number \| null` | Parsed from string or number |
| `odometer_status` | `string \| null` | Maps from `odometerBrand` |
| `color` | `string \| null` | Direct |
| `engine` | `string \| null` | Maps from `engineSize` |
| `transmission` | `string \| null` | Direct |
| `drive_type` | `string \| null` | Maps from `driveType` |
| `fuel_type` | `string \| null` | Maps from `fuelType` |
| `cylinders` | `number \| null` | Parsed int |
| `current_bid` | `number \| null` | Direct |
| `buy_now_price` | `number \| null` | Maps from `buyNowPrice` |
| `sale_date` | `string \| null` | ISO 8601 or `null` |
| `sale_status` | `string` | Default `"UPCOMING"` |
| `final_bid` | `number \| null` | Direct |
| `location` | `string` | Maps from `branchName` |
| `location_zip` | `string \| null` | Maps from `branchZip` |
| `latitude` | `number \| null` | Direct |
| `longitude` | `number \| null` | Direct |
| `image_url` | `string \| null` | First URL from `image_urls` |
| `image_urls` | `string[]` | Extracted from `imageUrls` (array or object) |
| `detail_url` | `string` | Maps from `detailUrl` |
| `seller` | `string \| null` | Direct |
| `grid_row` | `Record<string, unknown> \| null` | Extra detail fields (conditionGradeDisplay, etc.) |
| `fetched_at` | `string` | ISO 8601 timestamp set by normalizer |

**Normalizer fix applied**: `location_zip` mapping and `Unknown (XX)` title code format have been added to the shared normalizer (see T007 in tasks.md).

### Title Code Map

| IAAI Code | `title_type` label |
|---|---|
| `SV` | `"Salvage"` |
| `CL` | `"Clean"` |
| `RB` | `"Rebuilt"` |
| `FL` | `"Flood"` |
| `NR` | `"Non-Repairable"` |
| `JK` | `"Junk"` |
| `MV` | `"Manufacturer Buyback"` |
| *(unknown)* | `"Unknown (XX)"` where XX = raw code |

**Fix required**: `resolveTitleType()` in `packages/shared/src/normalizer/iaai.ts` currently returns `"Unknown"` for unmapped codes. Must return `` `Unknown (${code})` `` (see research.md Item 6).

---

## 2. Local Types (in `packages/iaai-scraper-mcp/src/types/index.ts`)

These types exist only within the IAAI scraper package. They are not exported or shared.

### `IaaiSearchParams`

Input parameters for `iaai_search`.

| Field | Type | Required | Validation |
|---|---|---|---|
| `query` | `string` | yes | non-empty |
| `make` | `string` | no | |
| `model` | `string` | no | |
| `year_min` | `number` | no | int 1900–2100 |
| `year_max` | `number` | no | int 1900–2100 |
| `zip` | `string` | no | 5-digit numeric |
| `radius` | `number` | no | positive int |
| `limit` | `number` | no | 1–100 |

### `IaaiRawStockData`

Wire format from IAAI's `/inventorySearch` and `/stockDetails` APIs. Already defined in `src/types/index.ts`.

### `IaaiSoldParams`

Input for `iaai_sold_history`.

| Field | Type | Required |
|---|---|---|
| `make` | `string` | yes |
| `model` | `string` | yes |
| `year_min` | `number` | no |
| `year_max` | `number` | no |
| `limit` | `number` | no |

### `IaaiSoldEntry`

One entry in the sold history response.

| Field | Type |
|---|---|
| `lot_number` | `string` |
| `sale_date` | `string` |
| `final_bid` | `number \| null` |
| `damage_primary` | `string` |
| `odometer` | `number \| null` |
| `title_type` | `string` |

### `SoldHistoryResponse`

Return value of `iaai_sold_history`.

| Field | Type |
|---|---|
| `lots` | `IaaiSoldEntry[]` |
| `aggregates.count` | `number` |
| `aggregates.avg_final_bid` | `number` |
| `aggregates.median_final_bid` | `number` |
| `aggregates.price_range.low` | `number` |
| `aggregates.price_range.high` | `number` |

Aggregates are computed locally from `lots` where `final_bid !== null`.

### `ScraperResult<T>`

Return type from `IaaiClient` methods. Mirrors the Copart equivalent.

```typescript
interface ScraperResult<T> {
  data: T;
  cached: boolean;
  stale: boolean;
  cachedAt: string | null;   // ISO 8601; null when freshly fetched
}
```

### `WatchlistEntry` (mirrors copart type)

| Field | Type | Notes |
|---|---|---|
| `lot_number` | `string` | PK |
| `source` | `"iaai"` | Always `"iaai"` for IAAI entries |
| `added_at` | `string` | ISO 8601 |
| `bid_threshold` | `number \| null` | Optional notify threshold |
| `last_checked_at` | `string \| null` | ISO 8601 |
| `last_bid` | `number \| null` | |
| `last_status` | `string \| null` | |
| `notes` | `string \| null` | |

---

## 3. SQLite Schema (`data/iaai.sqlite`)

All tables use WAL mode and prepared statements only.

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS listings (
  lot_number   TEXT PRIMARY KEY,
  data         TEXT    NOT NULL,   -- JSON-serialized AuctionListing
  fetched_at   TEXT    NOT NULL,   -- ISO 8601
  expires_at   INTEGER NOT NULL    -- Unix ms
);

CREATE TABLE IF NOT EXISTS searches (
  cache_key    TEXT PRIMARY KEY,   -- JSON.stringify of search params
  data         TEXT    NOT NULL,   -- JSON-serialized AuctionListing[]
  fetched_at   TEXT    NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sold_history (
  cache_key    TEXT PRIMARY KEY,
  data         TEXT    NOT NULL,   -- JSON-serialized SoldHistoryResponse
  fetched_at   TEXT    NOT NULL,
  expires_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS watchlist (
  lot_number       TEXT PRIMARY KEY,
  source           TEXT    NOT NULL DEFAULT 'iaai',
  added_at         TEXT    NOT NULL,
  bid_threshold    REAL,
  last_checked_at  TEXT,
  last_bid         REAL,
  last_status      TEXT,
  notes            TEXT
);

CREATE INDEX IF NOT EXISTS idx_watchlist_source       ON watchlist(source);
CREATE INDEX IF NOT EXISTS idx_watchlist_last_checked ON watchlist(last_checked_at);

CREATE TABLE IF NOT EXISTS watchlist_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_number   TEXT    NOT NULL,
  field        TEXT    NOT NULL,
  old_value    TEXT,
  new_value    TEXT,
  detected_at  TEXT    NOT NULL,
  FOREIGN KEY (lot_number) REFERENCES watchlist(lot_number) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_watchlist_history_lot ON watchlist_history(lot_number);
CREATE INDEX IF NOT EXISTS idx_listings_expires      ON listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_sold_expires         ON sold_history(expires_at);
```

**Notes**:
- The `watchlist` and `watchlist_history` schema is identical to the Copart schema (`packages/copart-scraper-mcp/src/cache/sqlite.ts`) — the alerts service queries both databases with the same SQL.
- `VIN` cache is NOT in `data/iaai.sqlite` — it is delegated to `@car-auctions/shared` `SqliteVinCache` at a separate path (`data/vin-cache.sqlite`).
- `PRAGMA synchronous = NORMAL` is a deliberate performance trade-off: it allows SQLite to defer fsync to the OS, which is acceptable for a cache-only database where data loss on an OS crash means only a cache miss (never data corruption) — all data is always re-fetchable from IAAI.

---

## 4. Disk Image Cache (`data/images/`)

Files are named by SHA-256 hash of the source URL with a `.webp` suffix after Sharp compression. TTL is 24 hours, enforced by `mtime` comparison (same mechanism as `copart image-cache.ts`).

---

## 5. Session Persistence (`data/iaai-session.json`)

```typescript
interface IaaiSession {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    [key: string]: unknown;
  }>;
  localStorage: Record<string, Record<string, string>>;  // origin → key → value
  savedAt: string;  // ISO 8601
}
```

Stored at `data/iaai-session.json` (gitignored). Loaded on `IaaiBrowser.launch()`. Saved after every successful navigation and on graceful shutdown.

**localStorage key format**: the outer key in `IaaiSession.localStorage` is the full origin string `"https://www.iaai.com"`. Nested keys are the actual localStorage key names used by IAAI's SPA. A mismatch in origin format (e.g., using `"www.iaai.com"` without the scheme) silently fails to restore SPA auth tokens.

---

## 6. Cache TTLs Summary

| Cache Layer | Storage | TTL | Key |
|---|---|---|---|
| Search results | In-memory LRU (200 entries) | 15 min | `JSON.stringify({type:"search",...params})` |
| Listing details | SQLite `listings` table | 60 min | `lot_number` |
| Images | Disk (`data/images/`) | 24 hr | SHA-256 of URL |
| Sold history | SQLite `sold_history` table | 7 days | `JSON.stringify({type:"sold",...params})` |
| VIN decode | SQLite (shared `SqliteVinCache`) | 90 days | VIN string |
| Stale fallback cap | Listings, search, images, sold | 24 hr | Same keys, `allowStale=true` |

**VIN stale-cap note**: the 90-day TTL governs *freshness* (whether a VIN cache hit is served as non-stale). The "no stale-fallback age cap" (FR-011) means: if a VIN cache entry is expired *and* NHTSA vPIC is unreachable, the stale entry is returned regardless of age. This is intentional — VIN metadata does not change once a vehicle is manufactured.

---

## 7. State Transitions

### Watchlist Entry State

```
(not watched)
     │
     │  action: "add"
     ▼
 WATCHING ──────── alerts service polls ──────── no change
     │                                              │
     │  action: "remove"       bid/status changed   │
     ▼                                              ▼
 (deleted)                              watchlist_history row inserted
```

### Scraper Request Flow

```
Tool called
    │
    ├── Cache hit (fresh)? ──YES──► return cached data (stale: false)
    │
    ├── Rate limit / daily cap? ──YES──► throw RateLimitError
    │
    ├── Navigate page (timeout: 30s)
    │       └── CAPTCHA detected? ──YES──► throw CaptchaError
    │       └── HTTP 429/403? ──YES──► throw RateLimitError + exponential backoff
    │       └── Success ──► capture intercepted JSON
    │               └── Interceptor miss ──► fall back to DOM parser
    │
    ├── Normalize via @car-auctions/shared normalizer
    │
    ├── Write to cache
    │
    └── return data (stale: false, cached: false)

On any non-CAPTCHA, non-RateLimit error:
    └── Stale entry ≤ 24h old? ──YES──► return with stale: true, cachedAt
                               ──NO──► re-throw original error
```
