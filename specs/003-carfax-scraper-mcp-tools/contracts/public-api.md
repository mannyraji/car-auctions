# Public API Contract: Carfax Scraper MCP Tools

**Feature**: `003-carfax-scraper-mcp-tools`  
**Phase**: 1 — Design & Contracts  
**Date**: 2026-04-14

---

## Standard Envelope

All tool responses return MCP text content containing JSON matching `ToolResponse<T>` from `@car-auctions/shared`:

```typescript
// success
{
  success: true;
  data: T;
  error: null;
  cached: boolean;        // always present; true when served from cache
  stale: boolean;         // always present; true when cache entry is expired
  cachedAt: string | null;
  timestamp: string;      // ISO 8601 response timestamp
}

// error
{
  success: false;
  data: null;
  error: {
    code: "SCRAPER_ERROR" | "TIMEOUT" | "CAPTCHA_DETECTED" | "RATE_LIMITED"
        | "CACHE_ERROR" | "VALIDATION_ERROR" | "UNKNOWN_ERROR";
    message: string;
    retryable: boolean;
    retryAfterMs: number | null;  // null when no retry window is known
  };
  cached: boolean;
  stale: boolean;
  cachedAt: string | null;
  timestamp: string;
}
```

---

## Tool: `carfax_get_report`

### Input

```typescript
{
  vin: string; // required; 17 chars, alphanumeric, reject I/O/Q
}
```

### Output (`data`)

```typescript
{
  vin: string;
  ownership_history: OwnershipEvent[];
  accident_history: AccidentEvent[];
  title_history: TitleEvent[];
  service_records: ServiceEvent[];
  odometer_readings: OdometerEvent[];
  recall_status: RecallStatus;
  structural_damage: boolean;
  airbag_deployment: boolean;
  flood_damage: boolean;
  lemon_history: boolean;
  fetched_at: string; // ISO 8601
}
```

### Behavior

- Validates VIN at tool boundary; invalid VIN returns `code: "VALIDATION_ERROR"` immediately with no cache or scraper call.
- Checks SQLite cache (30-day TTL) before scraping.
- On scraper failure, returns stale cache (if present) with `stale: true` and `cachedAt`.
- CAPTCHA returns `code: "CAPTCHA_DETECTED"`; HTTP 403/429 or daily cap exhaustion returns `code: "RATE_LIMITED"` with `retryAfterMs` when available.

---

## Tool: `carfax_get_summary`

### Input

```typescript
{
  vin: string; // required; 17 chars, alphanumeric, reject I/O/Q
}
```

### Output (`data`)

```typescript
{
  vin: string;
  total_accidents: number;
  title_issues: number;
  owner_count: number;
  last_odometer: number | null;
  open_recalls: number;
  overall_risk_rating: "low" | "medium" | "high";
}
```

### Behavior

- Validates VIN at tool boundary; invalid VIN returns `code: "VALIDATION_ERROR"` immediately with no cache or scraper call.
- Uses normalized report as source for summary derivation.
- Reuses report cache path and stale fallback behavior.
- Returns typed structured errors only.

---

## Cross-Cutting Contract Rules

- Tool naming follows `{source}_{action}`.
- Tool handlers never throw bare `Error`.
- One OTEL span per invocation with `tool.name`, `tool.status`, `tool.duration_ms`.
- No raw internal stack traces in tool response payloads.
