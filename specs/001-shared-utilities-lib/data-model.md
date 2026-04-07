# Data Model: Shared Utilities Library

**Feature**: 001-shared-utilities-lib
**Date**: 2026-04-06

## Entity Overview

```
AuctionListing ─────────── DealAnalysis
     │                        │
     ├── VINDecodeResult      ├── ProfitEstimate
     ├── CopartRawListing     ├── RepairEstimate ── RepairLineItem[]
     └── IaaiRawListing       ├── RiskFlag[]
                              ├── CarrierQuote
                              └── ValueAdjustment[]

ToolResponse<T>  (envelope for all MCP returns)
PriorityRequest  (queue item wrapper)
BrowserConfig    (pool configuration)
SpanAttributes   (tracing metadata)
```

## Core Types

### AuctionListing (normalized, source-agnostic)

| Field | Type | Required | Description |
|---|---|---|---|
| `source` | `'copart' \| 'iaai'` | ✅ | Auction house origin |
| `lot_number` | `string` | ✅ | Alphanumeric lot ID |
| `vin` | `string` | ✅ | 17-character Vehicle Identification Number |
| `year` | `number` | ✅ | Model year |
| `make` | `string` | ✅ | Manufacturer (e.g., "Honda") |
| `model` | `string` | ✅ | Model name (e.g., "Accord") |
| `trim` | `string \| null` | ❌ | Trim level |
| `title_type` | `string` | ✅ | Human-readable title status (e.g., "Salvage", "Clean") |
| `title_code` | `string \| null` | ❌ | Raw source title code (e.g., "SV") |
| `damage_primary` | `string` | ✅ | Primary damage description |
| `damage_secondary` | `string \| null` | ❌ | Secondary damage description |
| `has_keys` | `boolean` | ✅ | Whether keys are present |
| `odometer` | `number \| null` | ❌ | Odometer reading in miles |
| `odometer_status` | `string \| null` | ❌ | e.g., "ACTUAL", "EXEMPT", "EXCEEDS" |
| `color` | `string \| null` | ❌ | Exterior color |
| `engine` | `string \| null` | ❌ | Engine description |
| `transmission` | `string \| null` | ❌ | Transmission type |
| `drive_type` | `string \| null` | ❌ | e.g., "FWD", "AWD", "RWD" |
| `fuel_type` | `string \| null` | ❌ | e.g., "Gas", "Diesel", "Electric" |
| `cylinders` | `number \| null` | ❌ | Engine cylinder count |
| `current_bid` | `number \| null` | ❌ | Current high bid in USD |
| `buy_now_price` | `number \| null` | ❌ | Buy-it-now price in USD |
| `sale_date` | `string \| null` | ❌ | ISO 8601 date of scheduled sale |
| `sale_status` | `string` | ✅ | e.g., "UPCOMING", "ON_SALE", "SOLD" |
| `final_bid` | `number \| null` | ❌ | Final sale price (if sold) |
| `location` | `string` | ✅ | Yard/facility location |
| `latitude` | `number \| null` | ❌ | Facility latitude |
| `longitude` | `number \| null` | ❌ | Facility longitude |
| `image_url` | `string \| null` | ❌ | Primary listing image URL |
| `image_urls` | `string[]` | ✅ | All available image URLs (may be empty array) |
| `detail_url` | `string` | ✅ | Direct URL to listing page |
| `seller` | `string \| null` | ❌ | Seller name (typically insurer) |
| `grid_row` | `Record<string, unknown> \| null` | ❌ | Raw grid/search result data (source-specific) |
| `fetched_at` | `string` | ✅ | ISO 8601 timestamp of when data was retrieved |

**Validation Rules**:
- `vin`: 17 alphanumeric characters, no I/O/Q
- `lot_number`: alphanumeric only
- `year`: 1900–2100 range
- `source`: must be `'copart'` or `'iaai'`
- `image_urls`: defaults to `[]` if missing

---

### VINDecodeResult

| Field | Type | Required | Description |
|---|---|---|---|
| `vin` | `string` | ✅ | Input VIN |
| `year` | `number` | ✅ | Model year |
| `make` | `string` | ✅ | Manufacturer |
| `model` | `string` | ✅ | Model name |
| `trim` | `string \| null` | ❌ | Trim level |
| `engineType` | `string \| null` | ❌ | Engine description |
| `bodyClass` | `string \| null` | ❌ | Body style (Sedan, SUV, etc.) |
| `driveType` | `string \| null` | ❌ | e.g., "Front-Wheel Drive" |
| `fuelType` | `string \| null` | ❌ | Primary fuel type |
| `transmission` | `string \| null` | ❌ | Transmission style |
| `cylinders` | `number \| null` | ❌ | Cylinder count |
| `displacementL` | `number \| null` | ❌ | Engine displacement in liters |
| `manufacturer` | `string \| null` | ❌ | Full manufacturer name |
| `plantCountry` | `string \| null` | ❌ | Country of assembly |
| `vehicleType` | `string \| null` | ❌ | e.g., "PASSENGER CAR" |
| `errorCode` | `string` | ✅ | NHTSA error code(s), "0" = clean |

**Source**: NHTSA vPIC `DecodeVinValues` endpoint. Fields mapped from flat response keys.

---

### ToolResponse\<T\>

| Field | Type | Required | Description |
|---|---|---|---|
| `success` | `boolean` | ✅ | Whether the operation succeeded |
| `data` | `T \| null` | ❌ | Result payload (null on error) |
| `error` | `ToolError \| null` | ❌ | Error details (null on success) |
| `cached` | `boolean` | ✅ | Whether result came from cache |
| `stale` | `boolean` | ✅ | Whether the cached result is past its TTL |
| `cachedAt` | `string \| null` | ❌ | ISO 8601 timestamp of when data was cached (required when stale=true) |
| `timestamp` | `string` | ✅ | ISO 8601 timestamp of this response |

### ToolError

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | `ErrorCode` | ✅ | Machine-readable error code |
| `message` | `string` | ✅ | Human-readable error message |
| `retryable` | `boolean` | ✅ | Whether the caller should retry |
| `retryAfterMs` | `number \| null` | ❌ | Suggested retry delay in milliseconds |

---

### StaleableResponse\<T\>

> Constitution II.1 compliance type. `ToolResponse<T>` structurally satisfies this interface when `stale: true` and `cachedAt` is set. This type exists to enforce the contract at the type level; consumers typically use `ToolResponse<T>` directly.

| Field | Type | Required | Description |
|---|---|---|---|
| `data` | `T` | ✅ | The stale cached payload |
| `stale` | `boolean` | ✅ | Always `true` for this wrapper |
| `cachedAt` | `string` | ✅ | ISO 8601 timestamp of when data was cached |

---

### DealAnalysis

| Field | Type | Required | Description |
|---|---|---|---|
| `listing` | `AuctionListing` | ✅ | Normalized listing data |
| `vinDecode` | `VINDecodeResult \| null` | ❌ | Decoded VIN specifications |
| `profitEstimate` | `ProfitEstimate \| null` | ❌ | Projected profit breakdown |
| `repairEstimate` | `RepairEstimate \| null` | ❌ | Repair cost estimate |
| `riskFlags` | `RiskFlag[]` | ✅ | Warning/alert flags |
| `dealScore` | `number` | ✅ | 0–100 composite score |
| `dealGrade` | `string` | ✅ | A/B/C/D/F letter grade |
| `transportEstimate` | `CarrierQuote \| null` | ❌ | Shipping cost estimate |
| `marketComps` | `AuctionListing[]` | ✅ | Comparable sold listings |
| `analyzedAt` | `string` | ✅ | ISO 8601 timestamp |

### DealSummary

| Field | Type | Required | Description |
|---|---|---|---|
| `listing` | `AuctionListing` | ✅ | Minimal listing data |
| `dealScore` | `number` | ✅ | Composite score |
| `dealGrade` | `string` | ✅ | Letter grade |
| `estimatedProfit` | `number \| null` | ❌ | Quick profit estimate |
| `topRisk` | `string \| null` | ❌ | Highest-severity risk flag summary |

---

### RiskFlag

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | ✅ | e.g., "TITLE_WASH", "FLOOD", "ODOMETER_ROLLBACK" |
| `severity` | `'info' \| 'warning' \| 'critical'` | ✅ | Severity level |
| `detail` | `string` | ✅ | Human-readable explanation |
| `source` | `string \| null` | ❌ | Data source that triggered the flag |

---

### ProfitEstimate

| Field | Type | Required | Description |
|---|---|---|---|
| `acquisitionCost` | `number` | ✅ | Bid + buyer premium + fees |
| `repairCost` | `number` | ✅ | Total estimated repair cost |
| `transportCost` | `number` | ✅ | Shipping to buyer location |
| `totalInvestment` | `number` | ✅ | Sum of all costs |
| `estimatedRetailValue` | `number` | ✅ | Market value after repair |
| `estimatedProfit` | `number` | ✅ | Retail value − total investment |
| `profitMargin` | `number` | ✅ | Profit as percentage of investment |
| `adjustments` | `ValueAdjustment[]` | ✅ | Value modifiers applied |

### ValueAdjustment

| Field | Type | Required | Description |
|---|---|---|---|
| `reason` | `string` | ✅ | e.g., "Flood title -25%", "Low mileage +5%" |
| `amount` | `number` | ✅ | Dollar adjustment (positive or negative) |

---

### RepairEstimate

| Field | Type | Required | Description |
|---|---|---|---|
| `lineItems` | `RepairLineItem[]` | ✅ | Itemized repair lines |
| `totalParts` | `number` | ✅ | Total parts cost |
| `totalLabor` | `number` | ✅ | Total labor cost |
| `totalCost` | `number` | ✅ | Parts + labor + misc |
| `confidence` | `'low' \| 'medium' \| 'high'` | ✅ | Estimate confidence level |

### RepairLineItem

| Field | Type | Required | Description |
|---|---|---|---|
| `part` | `string` | ✅ | Part name |
| `partCost` | `number` | ✅ | Part price in USD |
| `laborHours` | `number` | ✅ | Estimated labor hours |
| `laborRate` | `number` | ✅ | $/hour rate |
| `laborCost` | `number` | ✅ | laborHours × laborRate |
| `source` | `string \| null` | ❌ | Price data source (e.g., "eBay", "RockAuto") |

---

### CarrierQuote

| Field | Type | Required | Description |
|---|---|---|---|
| `carrier` | `string` | ✅ | Carrier name |
| `price` | `number` | ✅ | Transport cost in USD |
| `estimatedDays` | `number` | ✅ | Estimated transit time |
| `distance` | `number` | ✅ | Distance in miles |
| `originZip` | `string` | ✅ | Pickup zip code |
| `destinationZip` | `string` | ✅ | Delivery zip code |
| `transportType` | `'open' \| 'enclosed'` | ✅ | Carrier type |

---

### BrowserConfig

> **Relationship to `BrowserPoolOptions`**: `BrowserConfig` is the shared type interface defined in `types/index.ts` representing browser configuration data. `BrowserPoolOptions` is the constructor options type for the `BrowserPool` class, which extends/mirrors `BrowserConfig` fields with the same defaults. `BrowserPoolOptions` is the runtime API; `BrowserConfig` is the portable data shape that consumers may serialize or pass between packages.

| Field | Type | Required | Description |
|---|---|---|---|
| `headless` | `boolean` | ✅ | Run headless (default: true) |
| `proxyUrl` | `string \| null` | ❌ | Proxy server URL |
| `maxContexts` | `number` | ✅ | Max concurrent browser contexts (default: 3) |
| `stealthEnabled` | `boolean` | ✅ | Enable stealth plugin (default: true) |
| `userAgent` | `string \| null` | ❌ | Custom user agent |

---

### Error Classes

| Class | Code | Retryable | Condition |
|---|---|---|---|
| `ScraperError` | `SCRAPER_ERROR` \| `TIMEOUT` | Depends | Playwright crash, navigation timeout, upstream 5xx |
| `CaptchaError` | `CAPTCHA_DETECTED` | `false` | CAPTCHA page detected |
| `RateLimitError` | `RATE_LIMITED` | `true` | HTTP 429 or 403 response |
| `CacheError` | `CACHE_ERROR` | `false` | SQLite read/write failure |
| `AnalysisError` | `ANALYSIS_ERROR` | `false` | Scoring, profit calc, vision failure |

All error classes extend a base `AppError` that includes `code`, `message`, `retryable`, and optional `retryAfterMs`.

### ErrorCode (union type)

```typescript
type ErrorCode =
  | 'SCRAPER_ERROR'              // Generic scraper failure
  | 'CAPTCHA_DETECTED'           // CAPTCHA encountered, cannot proceed
  | 'RATE_LIMITED'               // 429 or per-request rate limit
  | 'RATE_LIMIT_DAILY_CAP'       // Daily request cap exceeded
  | 'RATE_LIMIT_QUEUE_FULL'      // Priority queue overflow, retry later
  | 'CACHE_ERROR'                // Cache read/write failure
  | 'ANALYSIS_ERROR'             // Deal analysis pipeline failure
  | 'VALIDATION_ERROR'           // Invalid input (bad VIN, lot number, zip)
  | 'AUTH_ERROR'                 // Login failed for auction site
  | 'NOT_FOUND'                  // Lot/stock number not found
  | 'TIMEOUT'                    // Navigation or API call timeout
  | 'NMVTIS_COST_GUARD'          // NMVTIS called in batch context
  | 'DOWNSTREAM_UNAVAILABLE'     // Gateway: downstream server down
  | 'VISION_ERROR';              // AI vision analysis failure
```

---

### PriorityRequest

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | ✅ | Unique request ID |
| `priority` | `PriorityLevel` | ✅ | Priority tier |
| `enqueuedAt` | `number` | ✅ | Unix timestamp (ms) of when request was queued |
| `execute` | `() => Promise<void>` | ✅ | Operation to perform |

### PriorityLevel

```typescript
type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';
```

**Priority Constraints**:

| Level | Head-of-Queue Target | Rate Limit | Starvation Prevention | Hard Guarantee? |
|---|---|---|---|---|
| `critical` | 100ms | Bypasses | N/A | Yes (FR-016) |
| `high` | 2s | Enforced | N/A | No (best-effort SLO) |
| `normal` | 5s | Enforced | N/A | No (best-effort SLO) |
| `low` | 10s | Enforced | ≥1 slot per 60s | Starvation only |
| `background` | 30s | Enforced | ≥1 slot per 60s | Starvation only |

---

## Source-Specific Raw Types

### CopartRawListing (partial, key fields)

| vPIC Field | Type | Maps To |
|---|---|---|
| `lotNumberStr` | `string` | `lot_number` |
| `mkn` | `string` | `make` |
| `mdn` | `string` | `model` |
| `lcy` | `number` | `year` |
| `dd` | `string` | `damage_primary` |
| `sdd` | `string` | `damage_secondary` |
| `tims` | `object` | `image_urls` |
| `dynamicLotDetails.currentBid` | `number` | `current_bid` |
| `fv` | `string` | `vin` |
| `ld` | `string` | `location` |
| `tmtp` | `string` | `title_type` |
| `orr` | `number` | `odometer` |
| `clr` | `string` | `color` |
| `egn` | `string` | `engine` |
| `tsmn` | `string` | `transmission` |
| `htsmn` | `string` | `has_keys` (case-insensitive: `"Yes"` → `true`, else `false`) |

### IaaiRawListing (partial, key fields)

| IAAI Field | Type | Maps To |
|---|---|---|
| `stockNumber` | `string` | `lot_number` |
| `vin` | `string` | `vin` |
| `year` | `number` | `year` |
| `makeName` | `string` | `make` |
| `modelName` | `string` | `model` |
| `titleCode` | `string` | `title_type` (via code map) |
| `primaryDamage` | `string` | `damage_primary` |
| `secondaryDamage` | `string` | `damage_secondary` |
| `hasKeys` | `"YES" \| "NO"` | `has_keys` (→ boolean) |
| `odometer` | `string` | `odometer` (→ number) |
| `color` | `string` | `color` |
| `engineSize` | `string` | `engine` |
| `transmission` | `string` | `transmission` |
| `currentBid` | `number` | `current_bid` |
| `saleDate` | `string` | `sale_date` |
| `branchName` | `string` | `location` |
| `imageUrls` | `object` | `image_urls` |

### IAAI Title Code Map

| Code | Label |
|---|---|
| `SV` | Salvage |
| `CL` | Clean |
| `RB` | Rebuilt |
| `FL` | Flood |
| `NR` | Non-Repairable |
| `JK` | Junk |
| `MV` | Manufacturer Buyback |
| _unknown_ | Unknown (with logged warning) |

---

## Carfax & NMVTIS Sub-Records

### ServiceRecord

| Field | Type | Required |
|---|---|---|
| `date` | `string` | ✅ |
| `mileage` | `number \| null` | ❌ |
| `description` | `string` | ✅ |
| `facility` | `string \| null` | ❌ |

### RecallRecord

| Field | Type | Required |
|---|---|---|
| `date` | `string` | ✅ |
| `component` | `string` | ✅ |
| `description` | `string` | ✅ |
| `remedy` | `string \| null` | ❌ |
| `status` | `'open' \| 'completed'` | ✅ |

### NmvtisTitleRecord

| Field | Type | Required |
|---|---|---|
| `state` | `string` | ✅ |
| `titleNumber` | `string \| null` | ❌ |
| `titleDate` | `string` | ✅ |
| `titleType` | `string` | ✅ |
| `brandDescriptions` | `string[]` | ✅ |

### InsuranceLossRecord

| Field | Type | Required |
|---|---|---|
| `date` | `string` | ✅ |
| `reportingEntity` | `string` | ✅ |
| `claimType` | `string` | ✅ |
| `disposition` | `string \| null` | ❌ |

### JunkSalvageRecord

| Field | Type | Required |
|---|---|---|
| `date` | `string` | ✅ |
| `reportingEntity` | `string` | ✅ |
| `disposition` | `string` | ✅ |

### OdometerRecord

| Field | Type | Required |
|---|---|---|
| `date` | `string` | ✅ |
| `reading` | `number` | ✅ |
| `unit` | `'miles' \| 'kilometers'` | ✅ |
| `status` | `string` | ✅ |

---

## State Transitions

### AuctionListing.sale_status

```
UPCOMING → ON_SALE → SOLD
                   → NO_SALE (reserve not met)
                   → CANCELLED
```

### PriorityRequest lifecycle

```
ENQUEUED → PROCESSING → COMPLETED
                      → FAILED
         → CANCELLED (manual)
```
