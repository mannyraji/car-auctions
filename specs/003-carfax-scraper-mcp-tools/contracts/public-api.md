# Public API Contract: Carfax Scraper MCP Tools

**Feature**: `003-carfax-scraper-mcp-tools`  
**Phase**: 1 — Design & Contracts  
**Date**: 2026-04-14

---

## Standard Envelope

All tool responses return MCP text content containing JSON for:

```typescript
// success
{
  success: true;
  data: T;
  cached?: boolean;
  stale?: boolean;
  cachedAt: string | null;
}

// error
{
  success: false;
  data: null;
  error: {
    type: "ScraperError" | "CaptchaError" | "RateLimitError" | "CacheError";
    message: string;
    retryAfterMs?: number;
  };
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

- Validates VIN at tool boundary.
- Checks SQLite cache (30-day TTL) before scraping.
- On scraper failure, returns stale cache (if present) with `stale: true` and `cachedAt`.
- CAPTCHA returns `CaptchaError`; 403/429 or cap exhaustion returns `RateLimitError`.

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

- Validates VIN at tool boundary.
- Uses normalized report as source for summary derivation.
- Reuses report cache path and stale fallback behavior.
- Returns typed structured errors only.

---

## Cross-Cutting Contract Rules

- Tool naming follows `{source}_{action}`.
- Tool handlers never throw bare `Error`.
- One OTEL span per invocation with `tool.name`, `tool.status`, `tool.duration_ms`.
- No raw internal stack traces in tool response payloads.
