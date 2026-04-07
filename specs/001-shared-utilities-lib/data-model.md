# Data Model — Shared Utilities Library

**Feature**: `001-shared-utilities-lib`  
**Date**: 2026-04-07  
**Source**: `docs/spec.md § Shared Types`, feature spec FR-001 through FR-004

---

## Overview

`@car-auctions/shared` defines the **single source of truth** for all TypeScript types used across the monorepo. All 7 MCP server packages and the alerts service import exclusively from this package. No local type redefinitions are permitted anywhere else (Constitution Pillar V Rule 2).

The data model is organized into five logical groups:

1. **Auction Domain** — the core listing schema and source-specific raw types
2. **Analysis Domain** — deal analysis, profit, repair, and risk types
3. **History & Compliance** — Carfax and NMVTIS sub-record types
4. **Infrastructure** — tool response envelope, error codes, browser config
5. **Queue & Tracing** — priority queue request type and span attributes

---

## Group 1: Auction Domain

### `AuctionListing` — Core Normalized Entity

The source-agnostic representation of a vehicle at auction. Both Copart and IAAI map to this shape after normalization.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `source` | `'copart' \| 'iaai'` | ✅ | Auction source identifier |
| `lot_number` | `string` | ✅ | Platform lot/stock number |
| `title` | `string` | ✅ | Human-readable title (e.g. "2018 Honda Civic LX") |
| `vin` | `string` | ✅ | 17-character VIN |
| `year` | `number` | ✅ | Model year |
| `make` | `string` | ✅ | Vehicle make (e.g. "Honda") |
| `model` | `string` | ✅ | Vehicle model (e.g. "Civic") |
| `trim` | `string` | ❌ | Trim level (e.g. "LX") |
| `damage_primary` | `string` | ✅ | Primary damage description |
| `damage_secondary` | `string` | ❌ | Secondary damage description |
| `has_keys` | `boolean` | ✅ | Vehicle has keys (IAAI coercion: `"YES"/"NO"` → boolean) |
| `odometer` | `number` | ✅ | Odometer reading in miles |
| `odometer_status` | `'actual' \| 'exempt' \| 'not_actual' \| 'exceeds_limit'` | ✅ | Odometer brand |
| `drive_type` | `string` | ✅ | e.g. "FWD", "RWD", "AWD" |
| `fuel_type` | `string` | ✅ | e.g. "Gasoline", "Electric" |
| `engine` | `string` | ✅ | Engine description |
| `transmission` | `string` | ✅ | e.g. "Automatic", "Manual" |
| `color` | `string` | ✅ | Exterior color |
| `current_bid` | `number` | ✅ | Current bid in USD |
| `buy_it_now` | `number` | ❌ | Buy-it-now price if set |
| `sale_date` | `string` | ✅ | ISO 8601 sale date/time |
| `sale_status` | `'upcoming' \| 'live' \| 'sold' \| 'cancelled'` | ✅ | Auction state |
| `location` | `string` | ✅ | Auction yard location name |
| `location_zip` | `string` | ✅ | ZIP code of auction location |
| `thumbnail_url` | `string` | ✅ | URL of primary vehicle image |
| `listing_url` | `string` | ✅ | Direct link to listing page |
| `body_style` | `string` | ❌ | e.g. "Sedan", "SUV" — from `get_listing` |
| `cylinders` | `number` | ❌ | Engine cylinder count |
| `retail_value` | `number` | ❌ | Estimated retail value (MMR/book) |
| `title_type` | `string` | ❌ | e.g. "Salvage", "Clean", "Rebuilt" |
| `title_state` | `string` | ❌ | State of title issuance |
| `seller` | `string` | ❌ | Insurance company or fleet seller name |
| `highlights` | `string[]` | ❌ | Notable vehicle features/notes |
| `condition` | `{ start_code: string; keys: boolean; airbags: string }` | ❌ | Condition summary |
| `image_count` | `number` | ❌ | Total number of listing images |

**Validation Rules**:
- `vin` must be exactly 17 alphanumeric characters, not containing I, O, or Q
- `year` must be a 4-digit number in the range [1900, currentYear + 1]
- `current_bid` must be ≥ 0
- `sale_date` must be a valid ISO 8601 date string

**State Transitions** (`sale_status`):
```
upcoming → live → sold
upcoming → cancelled
live → cancelled
```

### `CopartRawListing` — Pre-Normalization (Copart)

Raw API response from Copart internal API (intercepted from browser). Not exported as a runtime value; used by normalizer only.

| Field | Type | Maps To |
|-------|------|---------|
| `lotNumberStr` | `string` | `lot_number` |
| `mkn` | `string` | `make` |
| `mmod` | `string` | `model` |
| `lcy` | `number` | `year` |
| `dd` | `string` | `damage_primary` |
| `sdd` | `string?` | `damage_secondary` |
| `orr` | `number` | `odometer` |
| `odometerBrand` | `string` | `odometer_status` |
| `la` | `string` | `location` |
| `dynamicBidAmount` | `number` | `current_bid` |
| `bin` | `number?` | `buy_it_now` |
| `tims.full` | `string[]` | `thumbnail_url` (first element) |
| `ad` | `string` | `sale_date` |
| `hk` | `boolean` | `has_keys` |
| `ts` | `string` | `title_state` |
| `tt` | `string` | `title_type` |
| `[key: string]` | `unknown` | — (passthrough extras) |

### `IaaiRawListing` — Pre-Normalization (IAAI)

Raw response from IAAI internal API (intercepted). Notable coercions required.

| Field | Type | Maps To | Coercion |
|-------|------|---------|---------|
| `stockNumber` | `string` | `lot_number` | — |
| `year` | `number` | `year` | — |
| `makeName` | `string` | `make` | — |
| `modelName` | `string` | `model` | — |
| `primaryDamage` | `string` | `damage_primary` | — |
| `secondaryDamage` | `string?` | `damage_secondary` | — |
| `odometerReading` | `number` | `odometer` | — |
| `odometerUnit` | `string` | `odometer_status` | map to enum |
| `branch` | `string` | `location` | — |
| `currentBid` | `number` | `current_bid` | — |
| `buyNowPrice` | `number?` | `buy_it_now` | — |
| `saleDate` | `string` | `sale_date` | ISO parse |
| `hasKeys` | `string` | `has_keys` | `"YES"` → `true`, `"NO"` → `false` |
| `titleState` | `string` | `title_state` | — |
| `titleCode` | `string` | `title_type` | lookup in `TITLE_CODE_MAP` |
| `images[0].url` | `string` | `thumbnail_url` | — |
| `[key: string]` | `unknown` | — | — |

---

## Group 2: Analysis Domain

### `DealAnalysis` — Full Deal Output

Complete output of the `analyze_vehicle` pipeline.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `listing` | `AuctionListing` | ✅ | Normalized auction listing |
| `vin_decode` | `VINDecodeResult` | ✅ | NHTSA vehicle specifications |
| `nmvtis_result` | `NMVTISResult` | ❌ | NMVTIS title history |
| `carfax_summary` | `CarfaxSummary` | ❌ | Carfax summary data |
| `title_comparison` | `TitleComparison` | ❌ | NMVTIS vs Carfax cross-ref |
| `profit_estimate` | `ProfitEstimate` | ✅ | Calculated profit projection |
| `repair_quote` | `RepairQuote` | ❌ | Parts-based repair estimate |
| `deal_score` | `number` | ✅ | 0–100 deal quality score |
| `risk_flags` | `RiskFlag[]` | ✅ | Array of risk warnings |
| `images` | `DamageImage[]` | ❌ | Processed vehicle images |
| `damage_classifications` | `DamageClassification[]` | ❌ | AI vision damage severity |
| `paint_analysis` | `PaintAnalysis` | ❌ | AI paint color analysis |
| `frame_inspection` | `FrameInspection` | ❌ | AI frame damage inspection |
| `generated_at` | `string` | ✅ | ISO 8601 generation timestamp |

### `VINDecodeResult` — Decoded Vehicle Specs

| Field | Type | Required | Source |
|-------|------|----------|--------|
| `vin` | `string` | ✅ | Input VIN |
| `year` | `number` | ✅ | `ModelYear` |
| `make` | `string` | ✅ | `Make` |
| `model` | `string` | ✅ | `Model` |
| `trim` | `string` | ❌ | `Series`/`Trim` |
| `engine_type` | `string` | ✅ | `FuelTypePrimary` |
| `body_class` | `string` | ✅ | `BodyClass` |
| `drive_type` | `string` | ✅ | `DriveType` |
| `fuel_type` | `string` | ✅ | `FuelTypePrimary` |
| `transmission` | `string` | ✅ | `TransmissionStyle` |
| `engine_cylinders` | `number` | ❌ | `EngineCylinders` |
| `displacement_l` | `number` | ❌ | `DisplacementL` |
| `engine_config` | `string` | ❌ | `EngineConfiguration` |
| `decode_notes` | `string` | ❌ | Error/partial decode notes |

### `RiskFlag`

| Field | Type | Values |
|-------|------|--------|
| `type` | union | `'title_wash' \| 'odometer_rollback' \| 'flood' \| 'structural' \| 'airbag' \| 'excessive_owners' \| 'no_keys' \| 'non_runner' \| 'nmvtis_discrepancy' \| 'frame_damage'` |
| `severity` | enum | `'info' \| 'warning' \| 'critical'` |
| `detail` | `string` | Human-readable description |

### `DealSummary`

Lightweight listing summary returned by `scan_deals`.

| Field | Type | Required |
|-------|------|----------|
| `lot_number` | `string` | ✅ |
| `source` | `'copart' \| 'iaai'` | ✅ |
| `title` | `string` | ✅ |
| `year` | `number` | ✅ |
| `make` | `string` | ✅ |
| `model` | `string` | ✅ |
| `current_bid` | `number` | ✅ |
| `estimated_profit` | `number` | ✅ |
| `deal_score` | `number` | ✅ |
| `risk_flags` | `RiskFlag[]` | ✅ |
| `sale_date` | `string` | ✅ |
| `listing_url` | `string` | ✅ |

### `ProfitEstimate`

| Field | Type | Description |
|-------|------|-------------|
| `purchase_price` | `number` | Winning bid + buyer premium |
| `repair_cost` | `number` | Estimated repair total |
| `transport_cost` | `number` | Estimated shipping |
| `auction_fees` | `number` | Calculated buyer premium |
| `total_cost` | `number` | Sum of all costs |
| `market_value` | `number` | Estimated post-repair retail |
| `estimated_profit` | `number` | `market_value - total_cost` |
| `roi_percent` | `number` | `(profit / total_cost) * 100` |
| `value_adjustments` | `ValueAdjustment[]` | Per-factor adjustments |

### `RepairEstimate`

| Field | Type | Description |
|-------|------|-------------|
| `totalCost` | `number` | Total estimated repair |
| `confidence` | `'low' \| 'medium' \| 'high'` | Estimate confidence level |
| `source` | `'heuristic' \| 'parts_lookup' \| 'image_analysis' \| 'combined'` | How estimate was derived |
| `lineItems` | `RepairLineItem[]` | Per-repair-item breakdown |
| `paintMultiplier` | `number` | Vision paint adjustment (1.0 default) |
| `severityMultiplier` | `number` | Vision severity adjustment (1.0 default) |
| `frameCostAdditional` | `number` | Frame damage premium ($0 default) |

### `RepairLineItem`

| Field | Type |
|-------|------|
| `description` | `string` |
| `partCost` | `number` |
| `laborCost` | `number` |
| `laborHours` | `number` |
| `partSource` | `string?` |
| `lineTotal` | `number` |

### `ValueAdjustment`

| Field | Type |
|-------|------|
| `factor` | `string` (e.g. `"mileage"`, `"title_type"`, `"damage"`, `"region"`) |
| `adjustment` | `number` (± dollars) |
| `reason` | `string` |

### `CarrierQuote`

| Field | Type |
|-------|------|
| `carrier` | `string` |
| `type` | `'open' \| 'enclosed'` |
| `price` | `number` |
| `estimatedDays` | `number` |
| `rating` | `number?` (1–5) |
| `url` | `string?` |

---

## Group 3: History & Compliance

### `ServiceRecord` (Carfax)

| Field | Type | Required |
|-------|------|----------|
| `date` | `string` | ✅ |
| `mileage` | `number` | ❌ |
| `description` | `string` | ✅ |
| `facility` | `string` | ❌ |
| `location` | `string` | ❌ |

### `RecallRecord` (Carfax)

| Field | Type | Required |
|-------|------|----------|
| `campaignNumber` | `string` | ✅ |
| `date` | `string` | ✅ |
| `component` | `string` | ✅ |
| `description` | `string` | ✅ |
| `remedy` | `string` | ✅ |
| `status` | `'open' \| 'completed' \| 'unknown'` | ✅ |

### `NmvtisTitleRecord`

| Field | Type | Required |
|-------|------|----------|
| `state` | `string` | ✅ |
| `date` | `string` | ✅ |
| `titleType` | `string` | ✅ |
| `brandCodes` | `string[]` | ✅ |
| `brandDescriptions` | `string[]` | ✅ |
| `odometer` | `number` | ❌ |
| `odometerStatus` | `string` | ❌ |

### `InsuranceLossRecord`

| Field | Type | Required |
|-------|------|----------|
| `date` | `string` | ✅ |
| `insurer` | `string` | ❌ |
| `claimType` | `string` (`"Total Loss"`, `"Theft"`, `"Recovered Theft"`) | ✅ |
| `disposition` | `string` | ❌ |

### `JunkSalvageRecord`

| Field | Type | Required |
|-------|------|----------|
| `reportedBy` | `string` | ✅ |
| `date` | `string` | ✅ |
| `disposition` | `string` (`"Crushed"`, `"Sold"`, `"Rebuilt"`, `"Retained"`) | ✅ |
| `state` | `string` | ❌ |

### `OdometerRecord`

| Field | Type | Required |
|-------|------|----------|
| `date` | `string` | ✅ |
| `reading` | `number` | ✅ |
| `source` | `string` (`"Title"`, `"Inspection"`, `"Service"`) | ✅ |
| `status` | `'ok' \| 'discrepancy' \| 'rollback_suspected' \| 'exceeds_limit'` | ✅ |

---

## Group 4: Infrastructure

### `ToolResponse<T>` — Standard MCP Response Envelope

All MCP tool return values MUST use this envelope.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `success` | `boolean` | ✅ | `true` = data present, `false` = error present |
| `data` | `T` | ❌ | Present when `success: true` |
| `error` | `{ code, message, retryable, retryAfterMs? }` | ❌ | Present when `success: false` |
| `error.code` | `ErrorCode` | ✅ when error | Structured error code |
| `error.message` | `string` | ✅ when error | Human-readable message |
| `error.retryable` | `boolean` | ✅ when error | Whether caller should retry |
| `error.retryAfterMs` | `number` | ❌ | Present for `RATE_LIMITED` errors |
| `cached` | `boolean` | ✅ | `true` if data came from cache |
| `stale` | `boolean` | ✅ | `true` when returning expired cache on upstream failure |
| `timestamp` | `string` | ✅ | ISO 8601 response timestamp |

**Note**: `stale: true` responses MUST also include `cachedAt` in the `data` object (or the `StaleableResponse<T>` wrapper). See constitution Pillar II Rule 1.

### `ErrorCode` — Union Type

```
'SCRAPER_ERROR' | 'CAPTCHA_DETECTED' | 'RATE_LIMITED' | 'RATE_LIMIT_DAILY_CAP' |
'CACHE_ERROR' | 'ANALYSIS_ERROR' | 'VALIDATION_ERROR' | 'AUTH_ERROR' |
'NOT_FOUND' | 'TIMEOUT' | 'NMVTIS_COST_GUARD' | 'DOWNSTREAM_UNAVAILABLE' | 'VISION_ERROR'
```

**Error → Error Class Mapping** (Constitution Pillar V Rule 3):

| Condition | `ErrorCode` | Error Class |
|-----------|-------------|-------------|
| HTTP 429 or 403 | `RATE_LIMITED` | `RateLimitError` |
| CAPTCHA detected | `CAPTCHA_DETECTED` | `CaptchaError` |
| Playwright crash / timeout / 5xx | `SCRAPER_ERROR` or `TIMEOUT` | `ScraperError` |
| SQLite read/write failure | `CACHE_ERROR` | `CacheError` |
| Analysis pipeline failure | `ANALYSIS_ERROR` | `AnalysisError` |
| Invalid VIN / lot / zip | `VALIDATION_ERROR` | `ScraperError` |

### `BrowserConfig`

| Field | Type | Default | Required |
|-------|------|---------|----------|
| `headless` | `boolean` | `true` | ✅ |
| `viewport` | `{ width: number; height: number }` | `{ width: 1280, height: 720 }` | ✅ |
| `userAgent` | `string?` | `null` (rotate from stealth pool) | ❌ |
| `proxyUrl` | `string?` | `process.env.PROXY_URL` | ❌ |
| `navigationTimeoutMs` | `number` | `30_000` | ✅ |
| `actionDelayMinMs` | `number` | `2_000` | ✅ |
| `actionDelayMaxMs` | `number` | `5_000` | ✅ |
| `scrollSteps` | `number` | `3` | ✅ |

---

## Group 5: Queue & Tracing

### `PriorityLevel` — Priority Enum

```typescript
type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';
```

| Level | Max Wait | Use Case |
|-------|----------|---------|
| `critical` | 0s (bypass queue) | Active-bid lot, selling within 1 hour |
| `high` | 2s | Watchlist refresh, `analyze_vehicle` |
| `normal` | 5s | User search, listing fetch |
| `low` | 10s | Sold history, comp refresh |
| `background` | 30s | Cache warm-up, image pre-fetch |

### `PriorityRequest<T>` — Queued Work Item

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique request identifier (UUID) |
| `priority` | `PriorityLevel` | Assigned priority tier |
| `enqueuedAt` | `number` | Unix timestamp (ms) of enqueue time |
| `fn` | `() => Promise<T>` | The operation to execute |
| `resolve` | `(value: T) => void` | Promise resolve callback |
| `reject` | `(reason: unknown) => void` | Promise reject callback |

### `SpanAttributes` — OTel Custom Attributes

| Attribute | Type | Description |
|-----------|------|-------------|
| `tool.name` | `string` | Canonical MCP tool name (e.g. `copart_get_listing`) |
| `tool.source` | `string` | Data source (`copart`, `iaai`, etc.) |
| `tool.status` | `'ok' \| 'error'` | Invocation outcome |
| `tool.duration_ms` | `number` | Wall-clock duration |
| `cache.hit` | `boolean` | Cache hit or miss |
| `queue.priority` | `PriorityLevel` | Request priority level |
| `queue.wait_ms` | `number` | Time spent in queue before execution |

---

## Entity Relationships

```
AuctionListing ──[normalizeCopart]──► CopartRawListing
AuctionListing ──[normalizeIaai]────► IaaiRawListing
AuctionListing ──[decodeVin]────────► VINDecodeResult
DealAnalysis ──────────────────────► AuctionListing (listing)
DealAnalysis ──────────────────────► VINDecodeResult (vin_decode)
DealAnalysis ──────────────────────► ProfitEstimate
DealAnalysis ──────────────────────► RepairEstimate (repair_quote)
DealAnalysis ──────────────────────► RiskFlag[] (risk_flags)
ProfitEstimate ────────────────────► ValueAdjustment[]
RepairEstimate ────────────────────► RepairLineItem[]
ToolResponse<T> ───────────────────► T (data, e.g. AuctionListing)
ToolResponse<T> ───────────────────► ErrorCode (error.code)
PriorityRequest<T> ────────────────► PriorityLevel
```
