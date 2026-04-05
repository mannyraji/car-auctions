# Car Auctions MCP Monorepo — Implementation Plan

> Source of truth: [`docs/spec.md`](spec.md)
> Created: 2026-04-05

---

## Overview

Build a TypeScript monorepo with 8 MCP server packages, a shared library, and an alerts service. The project surfaces AI-powered deal analysis for salvage auction car flippers by scraping Copart/IAAI, pulling vehicle history from Carfax/NMVTIS, sourcing real parts pricing, and computing profit/risk scores.

**Package count**: 9 workspace packages + 1 standalone service
**Estimated source files**: ~80 TypeScript files
**Phased build**: 10 phases, ~4 parallelizable after Phase 1

---

## Dependency Graph

```
Phase 0 (Scaffolding)
  └─► Phase 1 (Shared Foundations)
        ├─► Phase 2 (Copart Scraper)  ────────────────────┐
        ├─► Phase 3 (IAAI Scraper)    ── parallel ──┐     │
        ├─► Phase 4 (Carfax Scraper)  ── parallel ──┤     │
        ├─► Phase 5A (NMVTIS)         ── parallel* ─┤     │
        └─► Phase 5B (Parts Pricing)  ── parallel ──┤     │
                                                     ▼     ▼
                                        Phase 6 (Deal Analyzer) ◄── all above
                                                     │
                                        Phase 7 (Gateway)
              Phase 8 (Alerts) ◄── Phase 2+ (watchlist schema)
                                        Phase 9 (Docker + Observability)
```

*Phase 5A's `nmvtis_compare_carfax` depends on Phase 4 (Carfax), but `nmvtis_title_check` is independent.

---

## Phase 0 — Project Scaffolding

**Goal**: Monorepo workspace structure, tooling configs, empty package stubs.
**Dependencies**: None.

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 0.1 | Root `package.json` with npm workspaces for all 9 packages | `package.json` |
| 0.2 | Shared TypeScript config | `tsconfig.base.json` |
| 0.3 | Environment variable template | `.env.example` |
| 0.4 | Git ignore rules | `.gitignore` |
| 0.5 | ESLint config (flat config, TypeScript) | `eslint.config.js` |
| 0.6 | Prettier config | `.prettierrc` |
| 0.7 | Root Vitest config | `vitest.config.ts` |
| 0.8 | Stub `package.json` + `tsconfig.json` for each package (9 total) | `packages/*/package.json`, `packages/*/tsconfig.json`, `alerts/package.json`, `alerts/tsconfig.json` |
| 0.9 | Empty directory structures matching spec file tree | All `src/`, `config/`, `tests/`, `data/` dirs |
| 0.10 | Update README with project overview + link to spec | `README.md` |

### npm Workspaces

```json
{
  "workspaces": [
    "packages/shared",
    "packages/copart-scraper-mcp",
    "packages/iaai-scraper-mcp",
    "packages/carfax-scraper-mcp",
    "packages/parts-pricing-mcp",
    "packages/nmvtis-mcp",
    "packages/gateway-mcp",
    "packages/deal-analyzer-mcp",
    "alerts"
  ]
}
```

### tsconfig.base.json Key Settings

- `target`: ES2022
- `module`: Node16
- `moduleResolution`: Node16
- `strict`: true
- `composite`: true (for project references)
- `outDir`: `dist`
- `rootDir`: `src`
- `declaration`: true

### .env.example Variables

```
# Auction credentials
COPART_EMAIL=
COPART_PASSWORD=
IAAI_EMAIL=
IAAI_PASSWORD=
CARFAX_EMAIL=
CARFAX_PASSWORD=

# NMVTIS provider
NMVTIS_PROVIDER_URL=
NMVTIS_API_KEY=

# eBay Motors (optional)
EBAY_APP_ID=

# Proxy (optional)
PROXY_URL=

# Transport
TRANSPORT=stdio
PORT=3000
WS_PORT=3001

# Alerts
RESEND_API_KEY=
ALERT_WEBHOOK_URL=
ALERT_EMAIL_TO=
SLACK_WEBHOOK_URL=

# Buyer config
BUYER_ZIP=

# Observability (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=car-auctions
```

### Acceptance Criteria

- [ ] `npm install` succeeds at root (all workspaces resolve)
- [ ] `npx tsc --build` succeeds (empty projects, valid configs)
- [ ] All 9 package directories exist with `package.json` + `tsconfig.json`
- [ ] `data/` dirs are gitignored
- [ ] ESLint + Prettier configs are valid

---

## Phase 1 — Shared Foundations (`packages/shared`)

**Goal**: All shared utilities that downstream packages depend on.
**Dependencies**: Phase 0 complete.

### Deliverables

| # | Task | File(s) | Tests |
|---|------|---------|-------|
| 1.1 | All shared TypeScript interfaces + enums | `src/types.ts` | Type-only, compile check |
| 1.2 | MCP server bootstrap factory (stdio + SSE + WebSocket) | `src/mcp-helpers.ts` | Manual verification |
| 1.3 | Playwright browser pool (stealth, concurrency, shutdown) | `src/browser-pool.ts` | Unit: pool lifecycle |
| 1.4 | NHTSA vPIC VIN decoder | `src/vin-decoder.ts` | Unit: mock API, validate output shape |
| 1.5 | Auction normalizer (Copart + IAAI → `AuctionListing`) | `src/auction-normalizer.ts` | Unit: fixture data, both sources |
| 1.6 | Priority-aware request queue | `src/priority-queue.ts` | Unit: ordering, preemption, starvation prevention |
| 1.7 | OpenTelemetry tracing setup | `src/tracing.ts` | Manual: verify no-op when env not set |

### Key Types to Define (1.1)

```
AuctionListing, AuctionSource, VINDecodeResult
DealAnalysis, DealSummary, ProfitEstimate, RepairQuote, RepairArea
DamageClassification, PaintAnalysis, FrameInspection
NMVTISResult, TitleComparison
CarfaxReport, CarfaxSummary
RiskFlag, RiskFlagType
WatchlistEntry, WatchlistHistoryEntry
AlertTrigger, AlertChannel
PriorityLevel (critical | high | normal | low | background)
ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError
```

### Priority Queue Spec (1.6)

| Priority | Max Wait | Use Case |
|----------|----------|----------|
| `critical` | 0s (bypass) | Active-bid lot, selling within 1hr |
| `high` | 2s | Watchlist refresh, `analyze_vehicle` calls |
| `normal` | 5s | User search, listing fetch |
| `low` | 10s | Sold history backfill, comp refresh |
| `background` | 30s | Cache pre-warming, image pre-fetch |

Starvation prevention: `low`/`background` guaranteed 1 slot per 60s under sustained high-priority load.

### Dependencies to Install

```
@modelcontextprotocol/sdk
playwright playwright-extra puppeteer-extra-plugin-stealth
better-sqlite3 @types/better-sqlite3
sharp @types/sharp
@opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http
ws @types/ws
dotenv
```

### Acceptance Criteria

- [ ] `npm run build` in `packages/shared` produces valid JS output
- [ ] Types are importable from other workspace packages: `import { AuctionListing } from '@car-auctions/shared'`
- [ ] VIN decoder unit tests pass (mocked NHTSA responses)
- [ ] Auction normalizer tests pass with Copart + IAAI fixture data
- [ ] Priority queue tests pass: ordering, preemption, starvation prevention
- [ ] Tracing is no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset

---

## Phase 2 — Copart Scraper MCP (`packages/copart-scraper-mcp`)

**Goal**: First complete scraper — end-to-end from search to cached results.
**Dependencies**: Phase 1 (shared types, browser pool, VIN decoder, priority queue).

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 2.1 | Rate limit + cache TTL config | `config/default.json` |
| 2.2 | Playwright browser lifecycle | `src/scraper/browser.ts` |
| 2.3 | Anti-detection stealth config | `src/utils/stealth.ts` |
| 2.4 | Copart page navigation + extraction | `src/scraper/copart-client.ts` |
| 2.5 | Network interception (internal APIs) | `src/scraper/interceptor.ts` |
| 2.6 | DOM/API response parser | `src/scraper/parser.ts` |
| 2.7 | SQLite cache (WAL mode, TTL) | `src/cache/sqlite.ts` |
| 2.8 | Disk-based image cache | `src/cache/image-cache.ts` |
| 2.9 | In-memory LRU for search results | `src/cache/memory.ts` |
| 2.10 | Rate limiter (wraps shared priority queue) | `src/utils/rate-limiter.ts` |
| 2.11 | Image resize/compress → base64 | `src/utils/image-utils.ts` |
| 2.12 | Tool: `copart_search` | `src/tools/search.ts` |
| 2.13 | Tool: `copart_get_listing` | `src/tools/listing.ts` |
| 2.14 | Tool: `copart_get_images` | `src/tools/images.ts` |
| 2.15 | Tool: `copart_decode_vin` | `src/tools/vin.ts` |
| 2.16 | Tool: `copart_watch_listing` + SQLite schema | `src/tools/watchlist.ts` |
| 2.17 | Tool: `copart_sold_history` | `src/tools/sold.ts` |
| 2.18 | MCP tool registration + routing | `src/server.ts` |
| 2.19 | Entry point (tracing, browser, caches, server) | `src/index.ts` |
| 2.20 | Package-local types | `src/types/index.ts` |
| 2.21 | Test fixtures (sample HTML + API responses) | `tests/fixtures/` |
| 2.22 | Parser tests | `tests/parser.test.ts` |
| 2.23 | Tool handler tests (mocked scraper) | `tests/tools.test.ts` |

### config/default.json

```json
{
  "rateLimit": {
    "requestsPerSecond": 0.33,
    "maxConcurrent": 1,
    "backoffMultiplier": 2,
    "maxBackoffMs": 60000,
    "dailyCap": 500
  },
  "cache": {
    "searchTtlMinutes": 15,
    "listingTtlMinutes": 60,
    "imageTtlHours": 24,
    "soldTtlDays": 7,
    "vinTtlDays": 90,
    "lruMaxEntries": 200
  },
  "proxy": {
    "url": null,
    "rotateOnFailure": true
  }
}
```

### Watchlist SQLite Schema

```sql
CREATE TABLE watchlist (
  lot_number TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'copart',
  added_at TEXT NOT NULL,
  bid_threshold REAL,
  last_checked_at TEXT,
  last_bid REAL,
  last_status TEXT,
  notes TEXT
);

CREATE TABLE watchlist_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_number TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  detected_at TEXT NOT NULL,
  FOREIGN KEY (lot_number) REFERENCES watchlist(lot_number)
);
```

### Anti-Bot Strategy

1. Playwright stealth plugin (fingerprint masking)
2. Random delays 2-5s between actions
3. Mouse movement + scroll simulation
4. Session/cookie persistence
5. Network interception over DOM scraping where possible
6. Rate limiting: 1 req/3s, exponential backoff on 403/429
7. CAPTCHA detection → descriptive error (don't solve)

### Acceptance Criteria

- [ ] All parser tests pass with fixture data
- [ ] All tool handler tests pass with mocked scraper
- [ ] MCP server starts via stdio: `node dist/index.js`
- [ ] `copart_search` returns array of `AuctionListing` objects
- [ ] `copart_get_listing` returns full details
- [ ] `copart_get_images` returns base64-encoded images with categories
- [ ] `copart_watch_listing` add/remove/list round-trips correctly
- [ ] Cache hit/miss logged
- [ ] SQLite WAL mode active

---

## Phase 3 — IAAI Scraper MCP (`packages/iaai-scraper-mcp`)

**Goal**: Second auction source, mirrors Copart, validates the normalizer.
**Dependencies**: Phase 1. **Parallel with**: Phases 4, 5A, 5B.

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 3.1 | IAAI-specific rate/cache config | `config/default.json` |
| 3.2 | IAAI browser lifecycle | `src/scraper/browser.ts` |
| 3.3 | IAAI navigation + extraction (intercept `/inventorySearch`, `/stockDetails`) | `src/scraper/iaai-client.ts` |
| 3.4 | IAAI network interception | `src/scraper/interceptor.ts` |
| 3.5 | IAAI response parser | `src/scraper/parser.ts` |
| 3.6 | Cache layer (SQLite + image + LRU) | `src/cache/*.ts` |
| 3.7 | Rate limiter + stealth + image utils | `src/utils/*.ts` |
| 3.8 | Tool: `iaai_search` | `src/tools/search.ts` |
| 3.9 | Tool: `iaai_get_listing` | `src/tools/listing.ts` |
| 3.10 | Tool: `iaai_get_images` | `src/tools/images.ts` |
| 3.11 | Tool: `iaai_decode_vin` | `src/tools/vin.ts` |
| 3.12 | Tool: `iaai_sold_history` | `src/tools/sold.ts` |
| 3.13 | Server + entry point | `src/server.ts`, `src/index.ts` |
| 3.14 | Fixtures + tests | `tests/` |

### Key Differences from Copart

- Internal API: `/inventorySearch` and `/stockDetails` instead of Copart's GraphQL
- Field mapping: `stock_number` → `lot_number`, `branch` → `location`
- CDN patterns for images differ — handled in `iaai-client.ts`
- Requires member account: `IAAI_EMAIL` + `IAAI_PASSWORD`

### Acceptance Criteria

- [ ] All tests pass
- [ ] `iaai_search` output shape matches `copart_search` exactly (normalizer works)
- [ ] IAAI-specific fields map correctly: `stock_number` → `lot_number`, `branch` → `location`
- [ ] MCP server starts cleanly

---

## Phase 4 — Carfax Scraper MCP (`packages/carfax-scraper-mcp`)

**Goal**: Vehicle history reports by VIN.
**Dependencies**: Phase 1. **Parallel with**: Phases 3, 5A, 5B.

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 4.1 | Carfax login + VIN lookup + extraction | `src/scraper/carfax-client.ts` |
| 4.2 | HTML → structured report parser | `src/scraper/parser.ts` |
| 4.3 | Browser lifecycle | `src/scraper/browser.ts` |
| 4.4 | SQLite cache (30-day TTL, by VIN) | `src/cache/sqlite.ts` |
| 4.5 | Tool: `carfax_get_report` — full vehicle history | `src/tools/report.ts` |
| 4.6 | Tool: `carfax_get_summary` — quick risk flags | `src/tools/summary.ts` |
| 4.7 | Server + entry point | `src/server.ts`, `src/index.ts` |
| 4.8 | Package-local types | `src/types/index.ts` |
| 4.9 | Fixtures + tests | `tests/` |

### `carfax_get_report` Output Fields

- `ownership_history`: owners, dates, locations
- `accident_history`: count, severity, date, damage areas
- `title_history`: clean/salvage/rebuilt, state, date
- `service_records[]`
- `odometer_readings[]`
- `recall_status`
- `structural_damage` (boolean)
- `airbag_deployment` (boolean)
- `flood_damage` (boolean)
- `lemon_history` (boolean)

### `carfax_get_summary` Output Fields

- `total_accidents`, `title_issues`, `owner_count`, `last_odometer`
- `open_recalls` (count), `overall_risk_rating` (low/medium/high)

### Acceptance Criteria

- [ ] Parser tests pass with fixture HTML
- [ ] Report output includes all specified fields
- [ ] Summary produces correct risk rating from fixture data
- [ ] 30-day cache TTL respected

---

## Phase 5A — NMVTIS MCP (`packages/nmvtis-mcp`)

**Goal**: Federal authoritative title history for title-wash detection.
**Dependencies**: Phase 1 (core tool). Phase 4 (for compare tool). **Parallel with**: Phases 3, 5B (core tool only).

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 5A.1 | NMVTIS approved-provider API client | `src/client/nmvtis-api.ts` |
| 5A.2 | API response parser → `NMVTISResult` | `src/client/parser.ts` |
| 5A.3 | SQLite cache (30-day TTL, by VIN) | `src/cache/sqlite.ts` |
| 5A.4 | Tool: `nmvtis_title_check` | `src/tools/title-check.ts` |
| 5A.5 | Tool: `nmvtis_compare_carfax` (depends on Phase 4) | `src/tools/compare.ts` |
| 5A.6 | Server + entry point | `src/server.ts`, `src/index.ts` |
| 5A.7 | Package-local types | `src/types/index.ts` |
| 5A.8 | Fixtures + tests (title-wash scenario) | `tests/` |

### Title-Wash Detection Logic

A vehicle is flagged for potential title washing when:
1. It had a salvage/junk brand in State A
2. Later appears with a clean title in State B
3. `state_count > 2` within a short time window is suspicious

NMVTIS retains the full brand chain across states. If NMVTIS shows salvage brand anywhere in history but current title is clean → `RiskFlag` with `type: 'title_wash'`, `severity: 'critical'`.

### Cost Control

- NMVTIS queries cost ~$1-2/VIN through approved providers
- 30-day cache TTL
- **Guard**: NMVTIS is only called during `analyze_vehicle` (single lot), **never** during `scan_deals` batch scanning

### Acceptance Criteria

- [ ] Unit tests pass with mocked API responses
- [ ] Title-wash scenario: fixture with salvage in State A → clean in State B → flagged
- [ ] Compare tool identifies discrepancies between NMVTIS and Carfax fixtures
- [ ] Cache prevents redundant paid API calls

---

## Phase 5B — Parts Pricing MCP (`packages/parts-pricing-mcp`)

**Goal**: Real market pricing for parts and labor.
**Dependencies**: Phase 1. **Fully parallel** with Phases 3, 4, 5A.

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 5B.1 | Rate limit + cache config | `config/default.json` |
| 5B.2 | Fallback regional labor rate table | `config/labor-rates.json` |
| 5B.3 | car-part.com scraper (used/salvage parts) | `src/scraper/carpart-client.ts` |
| 5B.4 | eBay Motors client (API or scrape) | `src/scraper/ebay-client.ts` |
| 5B.5 | RepairPal labor rate scraper | `src/scraper/repairpal-client.ts` |
| 5B.6 | Response parser | `src/scraper/parser.ts` |
| 5B.7 | Browser lifecycle | `src/scraper/browser.ts` |
| 5B.8 | SQLite cache (parts: 7-day, labor: 30-day) | `src/cache/sqlite.ts` |
| 5B.9 | Tool: `parts_search` | `src/tools/parts-search.ts` |
| 5B.10 | Tool: `parts_get_price` | `src/tools/parts-price.ts` |
| 5B.11 | Tool: `labor_get_rates` | `src/tools/labor-rates.ts` |
| 5B.12 | Tool: `repair_build_quote` | `src/tools/repair-quote.ts` |
| 5B.13 | Server + entry point | `src/server.ts`, `src/index.ts` |
| 5B.14 | Package-local types | `src/types/index.ts` |
| 5B.15 | Fixtures + tests | `tests/parts.test.ts`, `tests/labor.test.ts` |

### `repair_build_quote` Output

```typescript
{
  line_items: [{ part_name, part_cost, part_source, labor_hours, labor_rate, labor_cost, subtotal }],
  paint: { panels_count, cost_per_panel, paint_type_multiplier, total },
  total_parts, total_labor, total_paint, grand_total,
  confidence: 'low' | 'medium' | 'high'
}
```

### Acceptance Criteria

- [ ] Parts search returns results from multiple sources with normalized schema
- [ ] `repair_build_quote` produces complete quote with line items + totals
- [ ] Fallback labor rates work when RepairPal is unavailable
- [ ] Cache TTLs: 7-day for parts, 30-day for labor

---

## Phase 6 — Deal Analyzer MCP (`packages/deal-analyzer-mcp`)

**Goal**: Intelligence layer — profit calc, scoring, vision analysis, risk detection.
**Dependencies**: Phases 2-5B (all data sources). This is the integration hub.

### Sub-phases

#### Phase 6A — Config & Types

| # | Task | File(s) |
|---|------|---------|
| 6A.1 | Buyer premium rates + transport tables | `config/default.json` |
| 6A.2 | Fee schedules (Copart + IAAI tiers) | `config/fee-schedules.json` |
| 6A.3 | Auction yard locations | `config/regions.json` |
| 6A.4 | Damage severity classifier config | `config/damage-scoring.json` |
| 6A.5 | Package-local types | `src/types/index.ts` |

#### Phase 6B — Pricing Engine

| # | Task | File(s) | Tests |
|---|------|---------|-------|
| 6B.1 | Fee calculator (premium, gate, title, env) | `src/pricing/fee-calculator.ts` | All premium tiers |
| 6B.2 | 3-tier repair estimator | `src/pricing/repair-estimator.ts` | Heuristic + parts + image |
| 6B.3 | Market value aggregation | `src/pricing/market-value.ts` | Comp stats |
| 6B.4 | Transport cost estimation | `src/pricing/transport-calc.ts` | Distance calc |

**Repair Estimator 3-Tier Approach:**
1. **Heuristic**: Lookup by `(damage_type, vehicle_class, year_range)` → cost range
2. **Parts + labor**: Call `repair_build_quote` from parts-pricing-mcp
3. **Image-augmented**: Severity multiplier from vision classifier

**Confidence levels:**
- Heuristic only → `low`
- Heuristic + parts → `medium`
- Parts + images → `high`
- All three → `high`

#### Phase 6C — Vision Modules

| # | Task | File(s) | Tests |
|---|------|---------|-------|
| 6C.1 | Damage severity classifier (1-5 scale) | `src/vision/damage-classifier.ts` | Severity → multiplier mapping |
| 6C.2 | Paint type analyzer | `src/vision/paint-analyzer.ts` | Paint type → multiplier |
| 6C.3 | Frame damage inspector (6-point checklist) | `src/vision/frame-inspector.ts` | Structural → caps verdict |

**Severity Scale:**

| Score | Label | Multiplier |
|-------|-------|------------|
| 1 | Cosmetic | 0.5x |
| 2 | Minor | 0.75x |
| 3 | Moderate | 1.0x |
| 4 | Major | 1.5x |
| 5 | Catastrophic | 2.5x |

**Paint Multipliers:**

| Type | Multiplier |
|------|-----------|
| Solid | 1.0x |
| Metallic | 1.3x |
| Pearl | 1.5x |
| Tri-coat | 1.8x |
| Matte | 2.0x |
| Wrap | 0.8x |

**Frame Inspector Checklist:**
1. Frame rails (buckling, kinking, fresh welds, misalignment)
2. Apron/strut towers (deformation, pushed-back firewall)
3. Unibody seams (factory spot welds vs aftermarket plug welds)
4. Subframe/cradle (stress marks, bent cross-member)
5. Undercoating disruption (fresh undercoating in isolated areas)
6. Gap analysis (uneven panel gaps → frame shift)

**Rule**: If `frame_damage_detected` + severity `structural` → verdict capped at `marginal`.

#### Phase 6D — Scoring & Risk

| # | Task | File(s) | Tests |
|---|------|---------|-------|
| 6D.1 | Composite deal scorer (0-100) | `src/scoring/deal-scorer.ts` | Known good/bad deals |
| 6D.2 | Risk flag detection | `src/scoring/risk-flags.ts` | Title wash, odometer, etc. |

**Scoring Weights:**
- Margin: 40%
- Risk: 30%
- Liquidity: 15%
- Information: 15%

**Risk Flags:**
- `title_wash` — NMVTIS state chain shows brand removed
- `nmvtis_discrepancy` — NMVTIS vs Carfax disagreement (warning/critical)
- `odometer_rollback` — readings decrease or deviate >15%
- `flood` / `structural` — passthrough from Carfax + NMVTIS + frame inspector
- `airbag` — auto-inflates repair estimate
- `excessive_owners` — >4 in <10 years

#### Phase 6E — MCP Tools

| # | Task | File(s) |
|---|------|---------|
| 6E.1 | `analyze_vehicle` — full pipeline orchestration | `src/tools/analyze.ts` |
| 6E.2 | `estimate_profit` — cost breakdown + margin | `src/tools/profit.ts` |
| 6E.3 | `get_market_comps` — comparable sold vehicles | `src/tools/comps.ts` |
| 6E.4 | `scan_deals` — batch search + score + rank | `src/tools/scan.ts` |
| 6E.5 | `estimate_transport` — carrier cost | `src/tools/transport.ts` |
| 6E.6 | `export_analysis` — CSV/JSON dump | `src/tools/export.ts` |

**`analyze_vehicle` Pipeline:**
```
listing → VIN decode → NMVTIS title check → Carfax summary
→ NMVTIS/Carfax cross-reference → damage photos (severity + paint + frame)
→ parts-based repair estimate → market comps → profit calc → risk score
```
Parallelize where possible: VIN decode + image fetch concurrently.

**`scan_deals` Guard**: Must NOT call NMVTIS for batch queries (cost control: $1-2/VIN). NMVTIS only during single-lot `analyze_vehicle`.

#### Phase 6F — Wiring

| # | Task | File(s) |
|---|------|---------|
| 6F.1 | MCP tool registration + routing | `src/server.ts` |
| 6F.2 | Entry point | `src/index.ts` |
| 6F.3 | SQLite cache | `src/cache/sqlite.ts` |

### Acceptance Criteria

- [ ] Fee calculator covers all buyer premium tiers for both Copart and IAAI
- [ ] Repair estimator produces correct confidence levels for each tier combination
- [ ] Damage classifier maps severity 1-5 to correct multipliers
- [ ] Frame damage with severity `structural` caps verdict at `marginal`
- [ ] Deal scorer produces 0-100 with correct component weights
- [ ] Risk flags detect title-wash from NMVTIS fixture data
- [ ] `analyze_vehicle` with mocked downstream → complete `DealAnalysis`
- [ ] `scan_deals` returns ranked results from both Copart and IAAI
- [ ] `scan_deals` does NOT call NMVTIS
- [ ] `export_analysis` produces valid CSV and JSON

---

## Phase 7 — Gateway MCP (`packages/gateway-mcp`)

**Goal**: Single MCP entry point aggregating all downstream servers.
**Dependencies**: Phases 2-6 (all downstream servers exist).

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 7.1 | Downstream server config | `config/gateway.json` |
| 7.2 | Server discovery + health tracking | `src/registry.ts` |
| 7.3 | Tool name → downstream routing | `src/router.ts` |
| 7.4 | stdio transport | `src/transports/stdio.ts` |
| 7.5 | SSE transport | `src/transports/sse.ts` |
| 7.6 | WebSocket transport (real-time bid updates) | `src/transports/websocket.ts` |
| 7.7 | `gateway_health` meta-tool | (in `src/server.ts`) |
| 7.8 | Server + entry point | `src/server.ts`, `src/index.ts` |
| 7.9 | Router tests | `tests/router.test.ts` |

### Transport Matrix

| Transport | Use Case |
|-----------|----------|
| stdio | Claude Desktop / Claude Code |
| SSE | Remote deployment, claude.ai |
| WebSocket | Real-time bid dashboards |

### Downstream Modes

- **In-process** (local dev): Direct module import — fastest, no networking
- **SSE** (Docker deployment): HTTP-based, standard MCP transport
- **WebSocket** (real-time): For live bid streaming

### Claude Desktop Config (end result)

```json
{
  "mcpServers": {
    "car-auctions": {
      "command": "node",
      "args": ["path/to/packages/gateway-mcp/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    }
  }
}
```

### Acceptance Criteria

- [ ] All downstream tools accessible through single gateway connection
- [ ] Router correctly maps tool prefixes to downstream servers
- [ ] `gateway_health` reports status of each downstream server
- [ ] Downstream failure → graceful degradation (error for that tool, others still work)
- [ ] stdio, SSE, and WebSocket transports all functional

---

## Phase 8 — Alerts Service (`alerts/`)

**Goal**: Standalone polling service for watchlist monitoring + notifications.
**Dependencies**: Phase 2+ (at least one scraper + watchlist schema).

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 8.1 | Alert rules + cron config | `src/config.ts` |
| 8.2 | Cron-based watchlist poller | `src/poller.ts` |
| 8.3 | Webhook notification channel | `src/channels/webhook.ts` |
| 8.4 | Email notification (Resend API) | `src/channels/email.ts` |
| 8.5 | Slack notification | `src/channels/slack.ts` |
| 8.6 | Tests | `tests/` |

### Alert Triggers

| Trigger | Description |
|---------|-------------|
| `bid_change` | Current bid increased |
| `bid_threshold` | Bid exceeds user-set max (per-lot) |
| `sale_date_approaching` | Sale within 24 hours |
| `sale_completed` | Status changed to sold |
| `buy_it_now_available` | BIN price appeared/changed |
| `price_drop` | BIN price decreased |
| `new_match` | New lot matches saved search |

### Poller Behavior

- Cron: every 30 min, 7am-7pm ET weekdays (configurable)
- Reads watchlist from shared SQLite (same DB as scraper MCPs)
- `high` priority queue for lots approaching sale date
- `normal` priority for routine checks
- Logs all changes to `watchlist_history`

### Acceptance Criteria

- [ ] Each trigger condition has unit tests
- [ ] Each notification channel has unit tests (mocked HTTP)
- [ ] Integration: watchlist entry → state change → alert fires
- [ ] Poller respects cron schedule

---

## Phase 9 — Docker & Observability

**Goal**: Containerize all services + wire up distributed tracing.
**Dependencies**: All previous phases.

### Deliverables

| # | Task | File(s) |
|---|------|---------|
| 9.1 | Dockerfile for each service (8 total) | `docker/Dockerfile.*` |
| 9.2 | docker-compose.yml | `docker-compose.yml` |
| 9.3 | OTEL collector config | `otel-collector-config.yaml` |
| 9.4 | Setup documentation | `docs/setup.md` |

### Dockerfile Strategy

Multi-stage builds:
1. **Build stage**: `node:20-slim`, install deps, `npm run build`
2. **Runtime stage**: `node:20-slim`, copy dist + node_modules, install Playwright browsers (scraper images only)

### docker-compose.yml Services

```
copart-scraper, iaai-scraper, carfax-scraper, parts-pricing,
nmvtis, deal-analyzer, gateway, alerts, jaeger
```

### Jaeger Config

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"   # UI
    - "4318:4318"     # OTLP HTTP
```

### Acceptance Criteria

- [ ] `docker compose up` starts all services without errors
- [ ] `docker compose ps` shows all healthy
- [ ] Jaeger UI at `localhost:16686` shows traces
- [ ] Full `analyze_vehicle` trace visible end-to-end
- [ ] Gateway routes to containerized downstream servers

---

## Cross-Cutting Concerns

### Caching Strategy

| Data | Storage | TTL |
|------|---------|-----|
| Search results | In-memory LRU | 15 min |
| Listing details | SQLite | 1 hour |
| Images | Disk (`data/`) | 24 hours |
| Sold history | SQLite | 7 days |
| VIN decode | SQLite | 90 days |
| Carfax reports | SQLite | 30 days |
| NMVTIS results | SQLite | 30 days |
| Part prices | SQLite | 7 days |
| Labor rates | SQLite | 30 days |
| Market value | SQLite | 24 hours |
| Transport estimates | SQLite | 7 days |
| Deal analysis | SQLite | 1 hour |

### SQLite Conventions

- WAL mode everywhere (concurrent readers + single writer)
- Shared SQLite file for watchlist across all MCPs + alerts
- `data/` directories gitignored

### Error Types

```
ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError
```

All tools return structured MCP errors. Scraper failures return stale cache data with `stale: true` flag when available.

### Input Validation

- VIN: 17-char alphanumeric, no I/O/Q
- Lot number: alphanumeric
- Zip code: 5-digit numeric
- All tool params validated at boundaries

### Security

- No credentials in code — all from `.env`
- SQLite databases in `data/` (gitignored)
- Proxy support for IP rotation
- Rate limiting to avoid bans

---

## Testing Strategy (Vitest)

| Category | What | Where |
|----------|------|-------|
| Parser tests | Fixture HTML/JSON → structured data | `packages/*/tests/parser.test.ts` |
| Tool tests | Mocked scraper → correct tool output | `packages/*/tests/tools.test.ts` |
| Normalizer | Copart + IAAI fixtures → identical schema | `packages/shared/tests/` |
| Fee calc | All buyer premium tiers | `packages/deal-analyzer-mcp/tests/` |
| Scorer | Known good/bad deal fixtures | `packages/deal-analyzer-mcp/tests/scorer.test.ts` |
| Risk flags | Title-wash, odometer, flood scenarios | `packages/deal-analyzer-mcp/tests/` |
| Priority queue | Ordering, preemption, starvation | `packages/shared/tests/` |
| Router | Tool → downstream mapping | `packages/gateway-mcp/tests/router.test.ts` |
| Alert triggers | Each trigger condition | `alerts/tests/` |
| Browser tests | Live scraper (skip in CI) | `packages/*/tests/` (integration) |

---

## Execution Notes

1. **Start with Phase 0 + 1** — everything else depends on these
2. **Phases 3, 4, 5A (core), 5B are parallelizable** after Phase 1
3. **Phase 6 is the largest phase** — break into sub-phases 6A-6F and execute sequentially
4. **Phase 8 can start as soon as Phase 2 is done** (only needs watchlist schema + one scraper)
5. **Phase 9 is last** — containerize only after everything works locally
6. **NMVTIS cost guard**: Never call during `scan_deals` batch operations
7. **Gateway in-process mode** for local dev, SSE for Docker — support both via config
