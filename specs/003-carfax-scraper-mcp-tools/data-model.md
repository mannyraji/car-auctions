# Data Model: Carfax Scraper MCP Tools

**Feature**: `003-carfax-scraper-mcp-tools`  
**Phase**: 1 — Design & Contracts  
**Date**: 2026-04-14

---

## 1. Tool Boundary Entities

### CarfaxReport

Full normalized report payload keyed by VIN.

| Field | Type | Notes |
|---|---|---|
| `vin` | `string` | Validated VIN |
| `ownership_history` | `OwnershipEvent[]` | Owner count, tenure, location/date spans |
| `accident_history` | `AccidentEvent[]` | Date, severity, damage areas |
| `title_history` | `TitleEvent[]` | Brand/state/date progression |
| `service_records` | `ServiceEvent[]` | Service date, location, description |
| `odometer_readings` | `OdometerEvent[]` | Ordered historical readings |
| `recall_status` | `RecallStatus` | Open/closed recalls and counts |
| `structural_damage` | `boolean` | Flag |
| `airbag_deployment` | `boolean` | Flag |
| `flood_damage` | `boolean` | Flag |
| `lemon_history` | `boolean` | Flag |
| `fetched_at` | `string` | ISO 8601 normalization timestamp |

### CarfaxSummary

Derived risk summary optimized for quick triage.

| Field | Type | Derivation |
|---|---|---|
| `vin` | `string` | From report |
| `total_accidents` | `number` | `accident_history.length` |
| `title_issues` | `number` | Count of adverse title brand events |
| `owner_count` | `number` | Derived from ownership history |
| `last_odometer` | `number \| null` | Latest reading by date |
| `open_recalls` | `number` | From recall status |
| `overall_risk_rating` | `"low" \| "medium" \| "high"` | Rule-based summary scoring |

---

## 2. Support Entities

### OwnershipEvent

| Field | Type |
|---|---|
| `owner_index` | `number` |
| `acquired_at` | `string \| null` |
| `released_at` | `string \| null` |
| `state` | `string \| null` |
| `owner_type` | `string \| null` |

### AccidentEvent

| Field | Type |
|---|---|
| `date` | `string \| null` |
| `severity` | `"minor" \| "moderate" \| "severe" \| "unknown"` |
| `damage_areas` | `string[]` |
| `airbag_deployed` | `boolean \| null` |

### TitleEvent

| Field | Type |
|---|---|
| `state` | `string \| null` |
| `date` | `string \| null` |
| `brand` | `string` |
| `is_adverse` | `boolean` |

### ServiceEvent

| Field | Type |
|---|---|
| `date` | `string \| null` |
| `location` | `string \| null` |
| `description` | `string` |

### OdometerEvent

| Field | Type |
|---|---|
| `date` | `string \| null` |
| `value` | `number` |
| `unit` | `"mi" \| "km"` |

### RecallStatus

| Field | Type |
|---|---|
| `open_recalls` | `number` |
| `closed_recalls` | `number` |
| `items` | `Array<{ id: string; status: string; summary: string }>` |

---

## 3. Cache Model (SQLite WAL)

### `carfax_reports` table

| Column | Type | Notes |
|---|---|---|
| `vin` | `TEXT PRIMARY KEY` | Cache key |
| `data` | `TEXT NOT NULL` | JSON-serialized `CarfaxReport` |
| `fetched_at` | `TEXT NOT NULL` | ISO 8601 timestamp |
| `expires_at` | `INTEGER NOT NULL` | Unix ms; 30-day TTL |

All statements use prepared queries only.

---

## 4. Validation Rules

- VIN is required, exactly 17 chars, alphanumeric only, and rejects `I`, `O`, `Q`.
- Summary is generated from normalized report data only (no independent unvalidated source).
- Cache fallback responses include `cachedAt` when `stale: true`.

---

## 5. State Transitions

```
Request
  │
  ├── Validate VIN (boundary)
  │     └── invalid -> VALIDATION_ERROR  (code: "VALIDATION_ERROR", retryable: false)
  │
  ├── Cache fresh hit -> success (stale: false)
  │
  ├── Scrape + parse + normalize -> cache write -> success
  │
  └── Scrape failure
        ├── stale cache exists -> success (stale: true, cachedAt)
        └── no cache -> typed error (CaptchaError / RateLimitError / ScraperError / CacheError)
```
