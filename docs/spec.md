# Car Auctions MCP Monorepo — Technical Specification v2.1

Build a TypeScript monorepo for MCP (Model Context Protocol) servers that scrape vehicle auction data, estimate repair costs, calculate profit margins, and surface the best deals — an AI-powered copilot for auction car flippers.

---

### Changelog

| Version | Date | Changes |
|---------|------|---------|
| v2.1 | 2026-04-06 | Added: missing interface definitions, IAAI fee schedule, full IAAI tool definitions, error response contract with error codes, deal scoring formula & thresholds, scan_deals pipeline, transport cost model, gateway failover/timeout spec, WebSocket bid protocol, rate limiter ↔ queue interaction, ESLint/Prettier config, watchlist indexes |
| v2.0 | — | Added parts-pricing-mcp, nmvtis-mcp, gateway-mcp, AI vision modules, priority queue, OpenTelemetry, alerts service overhaul |
| v1.0 | — | Original spec: Copart + IAAI scrapers, Carfax, deal analyzer |

---

## Monorepo Structure

Use npm workspaces with this layout:

```
car-auctions/
├── package.json                    # Root workspace config
├── tsconfig.base.json              # Shared TS config
├── .env.example                    # Environment variables template
├── packages/
│   ├── copart-scraper-mcp/         # MCP server: Copart auction scraper
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── config/
│   │   │   └── default.json        # Rate limits, cache TTLs, proxy config
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point (stdio + SSE)
│   │   │   ├── server.ts           # Tool registration & routing
│   │   │   ├── tools/
│   │   │   │   ├── search.ts       # copart_search — filtered inventory search
│   │   │   │   ├── listing.ts      # copart_get_listing — full lot details
│   │   │   │   ├── images.ts       # copart_get_images — base64 vehicle photos
│   │   │   │   ├── vin.ts          # copart_decode_vin — NHTSA vPIC API decode
│   │   │   │   ├── watchlist.ts    # copart_watch_listing — track lots for changes
│   │   │   │   └── sold.ts         # copart_sold_history — past sold lots by make/model
│   │   │   ├── scraper/
│   │   │   │   ├── browser.ts      # Playwright lifecycle (launch, context, close)
│   │   │   │   ├── copart-client.ts # Page navigation, search, detail extraction
│   │   │   │   ├── interceptor.ts  # Network request interception for Copart internal APIs
│   │   │   │   └── parser.ts       # DOM/API response → structured data
│   │   │   ├── cache/
│   │   │   │   ├── sqlite.ts       # SQLite cache (better-sqlite3)
│   │   │   │   ├── image-cache.ts  # Disk-based image cache
│   │   │   │   └── memory.ts       # In-memory LRU for search results
│   │   │   ├── utils/
│   │   │   │   ├── rate-limiter.ts # Throttling, exponential backoff, priority queues
│   │   │   │   ├── stealth.ts      # Anti-detection config for playwright-extra
│   │   │   │   └── image-utils.ts  # Resize/compress with Sharp, base64 encode
│   │   │   └── types/
│   │   │       └── index.ts        # All TypeScript interfaces
│   │   ├── data/                    # Runtime data (gitignored)
│   │   └── tests/
│   │       ├── tools.test.ts
│   │       ├── parser.test.ts
│   │       └── fixtures/            # Sample Copart HTML/API responses
│   │
│   ├── iaai-scraper-mcp/           # MCP server: IAAI auction scraper
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── config/
│   │   │   └── default.json
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point
│   │   │   ├── server.ts           # Tool registration & routing
│   │   │   ├── tools/
│   │   │   │   ├── search.ts       # iaai_search — filtered inventory search
│   │   │   │   ├── listing.ts      # iaai_get_listing — full stock details
│   │   │   │   ├── images.ts       # iaai_get_images — base64 vehicle photos
│   │   │   │   ├── vin.ts          # iaai_decode_vin — reuses shared VIN decoder
│   │   │   │   └── sold.ts         # iaai_sold_history — past sold lots
│   │   │   ├── scraper/
│   │   │   │   ├── browser.ts
│   │   │   │   ├── iaai-client.ts  # IAAI site navigation, search, extraction
│   │   │   │   ├── interceptor.ts  # IAAI internal API interception
│   │   │   │   └── parser.ts
│   │   │   ├── cache/
│   │   │   │   ├── sqlite.ts
│   │   │   │   ├── image-cache.ts
│   │   │   │   └── memory.ts
│   │   │   ├── utils/
│   │   │   │   ├── rate-limiter.ts
│   │   │   │   ├── stealth.ts
│   │   │   │   └── image-utils.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   ├── data/
│   │   └── tests/
│   │       ├── tools.test.ts
│   │       ├── parser.test.ts
│   │       └── fixtures/
│   │
│   ├── carfax-scraper-mcp/         # MCP server: Carfax report scraper
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point
│   │   │   ├── server.ts           # Tool registration
│   │   │   ├── tools/
│   │   │   │   ├── report.ts       # carfax_get_report — full vehicle history by VIN
│   │   │   │   └── summary.ts      # carfax_get_summary — key flags (accidents, title, owners)
│   │   │   ├── scraper/
│   │   │   │   ├── browser.ts      # Playwright browser management
│   │   │   │   ├── carfax-client.ts # Login, VIN lookup, report extraction
│   │   │   │   └── parser.ts       # HTML → structured report data
│   │   │   ├── cache/
│   │   │   │   └── sqlite.ts       # Cache reports by VIN (30-day TTL)
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── tests/
│   │
│   ├── parts-pricing-mcp/          # MCP server: Real parts & labor pricing  [NEW]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── config/
│   │   │   ├── default.json        # Rate limits, cache TTLs
│   │   │   └── labor-rates.json    # Fallback labor rate table by region
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point
│   │   │   ├── server.ts           # Tool registration
│   │   │   ├── tools/
│   │   │   │   ├── parts-search.ts # parts_search — search car-part.com / eBay Motors
│   │   │   │   ├── parts-price.ts  # parts_get_price — best price for specific part
│   │   │   │   ├── labor-rates.ts  # labor_get_rates — local shop rates by zip
│   │   │   │   └── repair-quote.ts # repair_build_quote — parts + labor for damage type
│   │   │   ├── scraper/
│   │   │   │   ├── browser.ts
│   │   │   │   ├── carpart-client.ts   # car-part.com interchange lookup
│   │   │   │   ├── ebay-client.ts      # eBay Motors parts search (API or scrape)
│   │   │   │   ├── repairpal-client.ts # RepairPal labor rate lookup
│   │   │   │   └── parser.ts
│   │   │   ├── cache/
│   │   │   │   └── sqlite.ts       # Cache part prices (7-day TTL), labor rates (30-day TTL)
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── tests/
│   │       ├── parts.test.ts
│   │       ├── labor.test.ts
│   │       └── fixtures/
│   │
│   ├── nmvtis-mcp/                 # MCP server: NMVTIS title history  [NEW]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point
│   │   │   ├── server.ts           # Tool registration
│   │   │   ├── tools/
│   │   │   │   ├── title-check.ts  # nmvtis_title_check — authoritative title/brand history
│   │   │   │   └── compare.ts      # nmvtis_compare_carfax — cross-reference NMVTIS vs Carfax
│   │   │   ├── client/
│   │   │   │   ├── nmvtis-api.ts   # NMVTIS approved provider API client
│   │   │   │   └── parser.ts       # API response → structured title history
│   │   │   ├── cache/
│   │   │   │   └── sqlite.ts       # Cache by VIN (30-day TTL)
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── tests/
│   │       ├── title-check.test.ts
│   │       └── fixtures/
│   │
│   ├── gateway-mcp/                # MCP server: Unified API gateway  [NEW]
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point (stdio + SSE + WebSocket)
│   │   │   ├── server.ts           # Aggregated tool registration
│   │   │   ├── router.ts           # Route tool calls to downstream MCP servers
│   │   │   ├── registry.ts         # Downstream server discovery & health
│   │   │   ├── transports/
│   │   │   │   ├── stdio.ts
│   │   │   │   ├── sse.ts
│   │   │   │   └── websocket.ts    # WebSocket transport for real-time bid updates
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── tests/
│   │       └── router.test.ts
│   │
│   ├── deal-analyzer-mcp/          # MCP server: Profit calculator & orchestration
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── config/
│   │   │   ├── default.json        # Buyer premium rates, transport cost tables
│   │   │   ├── fee-schedules.json  # Copart/IAAI buyer fee tiers by price bracket
│   │   │   ├── regions.json        # Auction yard locations for transport estimation
│   │   │   └── damage-scoring.json # Damage severity classifier config  [NEW]
│   │   ├── src/
│   │   │   ├── index.ts            # MCP server entry point
│   │   │   ├── server.ts           # Tool registration
│   │   │   ├── tools/
│   │   │   │   ├── analyze.ts      # analyze_vehicle — full pipeline orchestration
│   │   │   │   ├── profit.ts       # estimate_profit — cost breakdown & margin calc
│   │   │   │   ├── comps.ts        # get_market_comps — comparable sold vehicle prices
│   │   │   │   ├── scan.ts         # scan_deals — batch search + score + rank
│   │   │   │   ├── transport.ts    # estimate_transport — carrier cost by distance
│   │   │   │   └── export.ts       # export_analysis — dump results to CSV/JSON
│   │   │   ├── pricing/
│   │   │   │   ├── fee-calculator.ts    # Buyer premium, gate fee, title fee, env fee
│   │   │   │   ├── repair-estimator.ts  # Damage-type → repair cost (now parts+labor aware)
│   │   │   │   ├── market-value.ts      # Aggregate comps from auction sold data + API sources
│   │   │   │   └── transport-calc.ts    # Distance-based carrier cost estimation
│   │   │   ├── scoring/
│   │   │   │   ├── deal-scorer.ts       # Composite score: margin, risk, liquidity
│   │   │   │   └── risk-flags.ts        # Title wash detection, flood/structural flags
│   │   │   ├── vision/                  # AI vision analysis modules  [NEW]
│   │   │   │   ├── damage-classifier.ts # Severity 1-5 scoring per photo
│   │   │   │   ├── paint-analyzer.ts    # Detect tri-coat, pearl, metallic finishes
│   │   │   │   └── frame-inspector.ts   # Undercarriage frame damage detection prompts
│   │   │   ├── cache/
│   │   │   │   └── sqlite.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   └── tests/
│   │       ├── profit.test.ts
│   │       ├── scorer.test.ts
│   │       ├── damage-classifier.test.ts
│   │       └── fixtures/
│   │
│   └── shared/                     # Shared utilities across packages
│       ├── package.json
│       ├── src/
│       │   ├── mcp-helpers.ts      # Common MCP server setup (stdio/SSE/WebSocket transport)
│       │   ├── browser-pool.ts     # Shared Playwright browser pool
│       │   ├── vin-decoder.ts      # NHTSA vPIC API client (free, no scraping)
│       │   ├── auction-normalizer.ts # Normalize Copart + IAAI data to common schema
│       │   ├── priority-queue.ts   # Priority-aware request queue  [NEW]
│       │   ├── tracing.ts          # OpenTelemetry instrumentation  [NEW]
│       │   └── types.ts            # Shared types
│       └── tsconfig.json
│
├── alerts/
│   ├── package.json
│   ├── src/
│   │   ├── poller.ts               # Cron-based watchlist checker
│   │   ├── channels/
│   │   │   ├── webhook.ts          # Generic webhook notifications
│   │   │   ├── email.ts            # Email via Resend API
│   │   │   └── slack.ts            # Slack incoming webhook
│   │   └── config.ts               # Alert rules (bid threshold, sale date approaching)
│   └── tsconfig.json
│
├── docker/
│   ├── Dockerfile.gateway          # [NEW]
│   ├── Dockerfile.copart
│   ├── Dockerfile.iaai
│   ├── Dockerfile.carfax
│   ├── Dockerfile.parts            # [NEW]
│   ├── Dockerfile.nmvtis           # [NEW]
│   ├── Dockerfile.analyzer
│   └── Dockerfile.alerts
├── docker-compose.yml
├── otel-collector-config.yaml      # OpenTelemetry collector config  [NEW]
└── docs/
    └── setup.md
```

## Tech Stack

- Runtime: Node.js 20+, TypeScript 5+
- MCP SDK: `@modelcontextprotocol/sdk` (latest) — register stdio, SSE, and WebSocket transports
- Browser automation: `playwright` + `playwright-extra` + `puppeteer-extra-plugin-stealth`
- Cache: `better-sqlite3` for persistent cache, in-memory LRU for search results
- Image processing: `sharp` for resize/compress before base64 encoding
- Alerts: `node-cron` for polling, `resend` for email, standard fetch for webhooks
- Observability: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`
- WebSocket: `ws` for real-time bid transport
- Testing: `vitest`
- Config: `dotenv` + JSON config files
- Linting: ESLint + Prettier

---

## Copart Scraper MCP — Tools

### copart_search
Search Copart inventory. Params: query (string), make, model, year_min, year_max, damage_type, location, price_max, sort_by (bid_asc/bid_desc/year_desc/sale_date_asc), limit (default 20, max 50), page. Returns array of listing summaries: lot_number, title, vin, year, make, model, trim, damage_primary, damage_secondary, has_keys, odometer, odometer_status, drive_type, fuel_type, engine, transmission, color, current_bid, buy_it_now, sale_date, sale_status, location, thumbnail_url, listing_url.

### copart_get_listing
Full lot details by lot_number. Returns everything from search plus: body_style, cylinders, retail_value, repair_cost_estimate, title_type, title_state, seller, highlights array, sale_history array, condition object (start_code, keys, airbags), image_count, images array.

### copart_get_images
Download vehicle photos as base64. Params: lot_number (required), image_types (filter: exterior/interior/undercarriage/engine/damage), max_images (default 10). Returns array of {index, label, category, base64, width, height}. Images are tagged by damage area to support AI-based visual damage assessment — Claude can analyze these directly when included in the `analyze_vehicle` flow.

### copart_decode_vin
Decode VIN via NHTSA vPIC API (free, no scraping). Param: vin (17-char). Returns decoded vehicle specs.

### copart_watch_listing
Track listings for bid/sale changes. Params: lot_number, action (add/remove/list). Watchlist stored in SQLite (see Watchlist Storage below). Change flags included on subsequent queries. Feeds the alert system.

### copart_sold_history
Retrieve past sold lot data for comparable vehicles. Params: make, model, year_min, year_max, damage_type, location, limit (default 20). Returns array of: lot_number, sale_date, final_bid, damage_primary, odometer, title_type. Used by `get_market_comps` to establish salvage-side pricing baselines.

---

## IAAI Scraper MCP — Tools

IAAI (Insurance Auto Auctions) is the second-largest US salvage auction after Copart. Adding it roughly doubles inventory coverage. The scraper architecture mirrors Copart's since the data model is nearly identical.

### iaai_search
Search IAAI inventory. Params: query (string), make, model, year_min, year_max, damage_type, location, price_max, sort_by (bid_asc/bid_desc/year_desc/sale_date_asc), limit (default 20, max 50), page. Returns normalized listing summaries using the same shared `AuctionListing` schema as Copart.

**Key field mapping** (IAAI → normalized):
| IAAI field | AuctionListing field | Notes |
|------------|---------------------|-------|
| `stockNumber` | `lot_number` | Primary identifier |
| `branch` | `location` | Auction yard name |
| `branchZip` | `location_zip` | |
| `hasKeys` | `has_keys` | IAAI returns `"YES"`/`"NO"` string → boolean |
| `titleCode` | `title_type` | Requires code-to-label mapping (SV→Salvage, CL→Clean, RB→Rebuilt) |
| `primaryDamage` | `damage_primary` | Damage codes differ from Copart — normalizer handles mapping |

**Implementation notes:**
- Intercept IAAI's `/inventorySearch` endpoint to capture JSON search results
- Fall back to DOM scraping with IAAI-specific selectors if interception fails
- Cache results in memory LRU (15 min TTL)

### iaai_get_listing
Full stock details by stock_number. Params: stock_number (string, required). Returns the full `AuctionListing` shape via `auction-normalizer.ts`, identical to `copart_get_listing` output.

**Implementation notes:**
- Navigate to `https://www.iaai.com/VehicleDetail/{stockNumber}`
- Intercept IAAI's `/stockDetails` or `/VehicleDetail` API endpoint
- IAAI DOM structure differs from Copart — `iaai-client.ts` handles IAAI-specific selectors for condition, sale info, and vehicle details panels
- Cache in SQLite (1 hour TTL)

### iaai_get_images
Download vehicle photos as base64. Params: stock_number (required), image_types (filter: exterior/interior/undercarriage/engine/damage), max_images (default 10). Returns same `{index, label, category, base64, width, height}` shape as `copart_get_images`.

**Implementation notes:**
- IAAI image URLs follow a different CDN pattern (`gw.img.iaai.com`) — `iaai-client.ts` constructs URLs from stock number + image sequence
- Images may require session cookie for full-resolution access
- Same Sharp processing pipeline as Copart (resize to 800px, WebP 75%)

### iaai_decode_vin
Reuses shared `vin-decoder.ts`. Same interface and behavior as `copart_decode_vin`. Params: vin (17-char). Returns decoded vehicle specs via NHTSA vPIC API.

### iaai_sold_history
Past sold lots for comparable vehicles. Params: make, model, year_min, year_max, damage_type, location, limit (default 20). Returns same shape as `copart_sold_history`: array of `{lot_number, sale_date, final_bid, damage_primary, odometer, title_type}` plus aggregate statistics.

**Implementation notes:**
- IAAI sold data is behind `/soldVehicles` or similar search endpoint
- Cache in SQLite (7 day TTL)
- Combined with Copart sold data in `get_market_comps` for wider price baselines

### Implementation Notes — IAAI
- IAAI's site uses a different internal API structure than Copart — prioritize network interception of their `/inventorySearch` and `/stockDetails` endpoints.
- IAAI requires a member account for full access; add IAAI_EMAIL and IAAI_PASSWORD to .env.
- IAAI images are served via different CDN patterns; `iaai-client.ts` handles URL construction.
- `auction-normalizer.ts` in shared/ maps both Copart and IAAI responses into a common `AuctionListing` type so downstream tools (deal-analyzer) are source-agnostic.

---

## Carfax Scraper MCP — Tools

### carfax_get_report
Full vehicle history by VIN. Returns structured data: ownership_history (owners, dates, locations), accident_history (count, severity, date, damage areas), title_history (clean/salvage/rebuilt, state, date), service_records array, odometer_readings array, recall_status, structural_damage boolean, airbag_deployment boolean, flood_damage boolean, lemon_history boolean.

### carfax_get_summary
Quick risk flags for a VIN. Returns: total_accidents, title_issues, owner_count, last_odometer, open_recalls count, overall_risk_rating (low/medium/high).

---

## Parts Pricing MCP — Tools  [NEW]

Replaces heuristic-only repair estimates with real market data for parts and labor. This server is called by the deal-analyzer's `repair-estimator.ts` to produce grounded cost estimates.

### parts_search
Search for OEM and aftermarket parts across multiple sources. Params: year, make, model, part_name (e.g. "front bumper cover", "radiator"), part_type (oem|aftermarket|used, default all), zip (for used parts proximity). Returns array of: part_name, source (car-part.com|ebay|rockauto), condition (new|used|remanufactured), price, seller_location, distance_miles (used parts only), url.

### parts_get_price
Best price for a specific part. Params: year, make, model, part_name, condition_preference (used|aftermarket|oem, default used). Returns: best_price, average_price, price_range {low, high}, source, condition, interchange_number (if available). Used parts prioritized for salvage flip economics.

### labor_get_rates
Local shop labor rates by zip code. Params: zip, repair_type (body|mechanical|paint, default all). Returns: body_rate_per_hour, mechanical_rate_per_hour, paint_rate_per_hour, source (repairpal|fallback), region. Falls back to `labor-rates.json` regional averages if RepairPal unavailable.

### repair_build_quote
Assemble a complete repair quote for a damage scenario. Params: year, make, model, damage_areas (array of {area, severity}), zip. Returns:

```typescript
interface RepairQuote {
  line_items: {
    part_name: string;
    part_cost: number;         // Best available price
    part_source: string;
    labor_hours: number;       // Estimated from repair guides
    labor_rate: number;        // Local rate for this repair type
    labor_cost: number;
    subtotal: number;
  }[];
  paint: {
    panels_count: number;
    cost_per_panel: number;
    paint_type_multiplier: number;  // 1.0 standard, 1.3 metallic, 1.8 tri-coat/pearl
    total: number;
  };
  total_parts: number;
  total_labor: number;
  total_paint: number;
  grand_total: number;
  confidence: 'low' | 'medium' | 'high';  // Based on parts data availability
}
```

### Implementation Notes — Parts Pricing
- car-part.com is the primary source for used/salvage parts — it aggregates inventory from thousands of junkyards nationwide with interchange number lookups.
- eBay Motors API (or scrape) for aftermarket and OEM surplus pricing.
- RepairPal provides regional labor rate data; scrape their estimator tool for body/mechanical/paint rates by zip.
- Parts pricing feeds directly into `repair-estimator.ts` in the deal-analyzer, replacing or augmenting the heuristic lookup table.
- Cache part prices with 7-day TTL (prices fluctuate but not daily). Cache labor rates with 30-day TTL.
- The `paint_type_multiplier` in `repair_build_quote` is informed by the vision module's paint analyzer (see Vision Analysis section).

---

## NMVTIS MCP — Tools  [NEW]

NMVTIS (National Motor Vehicle Title Information System) is the federal authoritative source for title history, administered by AAMVA. It provides data that Carfax may not have — particularly for vehicles that moved between states or had title brands applied by insurers.

### nmvtis_title_check
Authoritative title and brand history for a VIN. Params: vin (17-char). Returns:

```typescript
interface NMVTISResult {
  vin: string;
  title_records: {
    state: string;
    date: string;
    title_type: string;          // Clean, Salvage, Rebuilt, Junk, etc.
    brand_codes: string[];       // NMVTIS standard brand codes
    brand_descriptions: string[];
    odometer: number;
    odometer_status: string;
  }[];
  insurance_total_loss: {
    reported: boolean;
    date?: string;
    insurer?: string;
  };
  junk_salvage_records: {
    reported: boolean;
    facility_name?: string;
    date?: string;
    disposition?: string;        // Crushed, Sold, Rebuilt
  }[];
  title_brand_count: number;
  state_count: number;           // Number of distinct states in history
  query_date: string;
}
```

### nmvtis_compare_carfax
Cross-reference NMVTIS data against Carfax for the same VIN. Params: vin. Returns:

```typescript
interface TitleComparison {
  vin: string;
  discrepancies: {
    field: string;               // e.g. "title_brand", "odometer", "total_loss"
    nmvtis_value: string;
    carfax_value: string;
    severity: 'info' | 'warning' | 'critical';
    detail: string;
  }[];
  nmvtis_only_records: string[]; // Title events NMVTIS has but Carfax doesn't
  carfax_only_records: string[]; // Events Carfax has but NMVTIS doesn't
  agreement_score: number;       // 0-100, how well the two sources align
}
```

### Implementation Notes — NMVTIS
- NMVTIS data is accessed through approved providers (e.g., VinAudit, NICB, AutoCheck). You must register with an approved data provider and obtain API credentials. Add NMVTIS_PROVIDER_URL and NMVTIS_API_KEY to .env.
- NMVTIS is the single authoritative federal source — if NMVTIS and Carfax disagree on title brands, NMVTIS wins.
- The `nmvtis_compare_carfax` tool is called automatically by `analyze_vehicle` when both sources are available. Discrepancies auto-generate `RiskFlag` entries.
- NMVTIS is particularly strong at detecting title washing: if a vehicle had a salvage brand in State A, was moved to State B and retitled as clean, NMVTIS retains the full brand chain. The `risk-flags.ts` module uses `state_count` and brand history to flag this.
- Cost: NMVTIS queries typically cost $1-2 per VIN through approved providers. Cache aggressively (30-day TTL) to control costs.

---

## Gateway MCP — Architecture  [NEW]

Single entry point that exposes all tools from all downstream MCP servers through one connection. Claude only needs to connect to the gateway instead of managing 6+ separate MCP server configs.

### Design
- **Tool aggregation**: On startup, the gateway discovers all downstream MCP servers (configured in `gateway.json`), fetches their tool manifests, and re-registers every tool under its own namespace. Tool names are passed through unchanged (e.g., `copart_search`, `nmvtis_title_check`).
- **Request routing**: When a tool call arrives, `router.ts` maps the tool name prefix to the correct downstream server and forwards the call via the configured transport (in-process import, SSE, or WebSocket).
- **Health aggregation**: Exposes `gateway_health` tool returning status of all downstream servers, cache stats, and rate limit remaining across all scrapers.
- **WebSocket transport**: In addition to stdio and SSE, the gateway supports WebSocket connections. This enables real-time bid update streaming for watched lots during live auctions — the gateway subscribes to watchlist changes from the scraper MCPs and pushes updates to connected clients.

### Transports
| Transport | Use Case |
|-----------|----------|
| stdio | Claude Desktop / Claude Code local usage |
| SSE | Remote deployment, claude.ai MCP integration |
| WebSocket | Real-time bid monitoring dashboards, live auction tracking |

### Configuration (`gateway.json`)
```json
{
  "downstream": [
    { "name": "copart", "transport": "in-process", "module": "../copart-scraper-mcp/src/index.ts" },
    { "name": "iaai", "transport": "in-process", "module": "../iaai-scraper-mcp/src/index.ts" },
    { "name": "carfax", "transport": "in-process", "module": "../carfax-scraper-mcp/src/index.ts" },
    { "name": "parts", "transport": "in-process", "module": "../parts-pricing-mcp/src/index.ts" },
    { "name": "nmvtis", "transport": "sse", "url": "http://nmvtis-service:3004/sse" },
    { "name": "analyzer", "transport": "in-process", "module": "../deal-analyzer-mcp/src/index.ts" }
  ]
}
```

### Claude Desktop Config (simplified)
With the gateway, the MCP config collapses from 6+ entries to one:
```json
{
  "mcpServers": {
    "car-auctions": {
      "command": "node",
      "args": ["path/to/car-auctions/packages/gateway-mcp/dist/index.js"],
      "env": { "TRANSPORT": "stdio" }
    }
  }
}
```

### Failover & Timeout Behavior

When a downstream MCP server is unavailable or slow:

| Scenario | Gateway Behavior |
|----------|------------------|
| Downstream unreachable | Return `DOWNSTREAM_UNAVAILABLE` error with `retryable: true`. If cached data exists for the requested tool+params, return stale cached result with `stale: true`. |
| Downstream timeout (>30s) | Cancel request, return `TIMEOUT` error. Timeout is configurable per downstream in `gateway.json` via `timeoutMs` field (default 30000). |
| Downstream returns error | Pass through the original error code and message to the caller. |
| Partial pipeline failure | For `analyze_vehicle`, if a non-critical step fails (e.g., Carfax, NMVTIS), continue the pipeline with available data and note the skipped step in the response. Critical failures (listing fetch, VIN decode) abort the pipeline. |

**Circuit breaker**: If a downstream server fails 5 consecutive requests within 2 minutes, the gateway marks it as `degraded` and skips it for 60 seconds before retrying. `gateway_health` reports circuit breaker state for each downstream.

### WebSocket Bid Monitoring Protocol

The WebSocket transport enables real-time bid updates for watched lots during live auctions.

**Connection:** `ws://gateway:3001/ws`

**Client → Server messages:**

```typescript
// Subscribe to bid updates for specific lots
{ type: 'subscribe', lots: [{ source: 'copart', lotNumber: '12345678' }] }

// Unsubscribe
{ type: 'unsubscribe', lots: [{ source: 'copart', lotNumber: '12345678' }] }

// Ping (keepalive)
{ type: 'ping' }
```

**Server → Client messages:**

```typescript
// Bid update pushed to subscribers
{
  type: 'bid_update',
  source: 'copart',
  lotNumber: '12345678',
  previousBid: 3500,
  currentBid: 3750,
  bidCount: 12,
  saleStatus: 'live',
  timestamp: '2026-04-06T14:30:00Z'
}

// Lot status change (sold, cancelled, etc.)
{
  type: 'status_change',
  source: 'copart',
  lotNumber: '12345678',
  previousStatus: 'live',
  currentStatus: 'sold',
  finalPrice: 4200,
  timestamp: '2026-04-06T14:35:00Z'
}

// Pong (keepalive response)
{ type: 'pong' }

// Error
{ type: 'error', code: 'RATE_LIMITED', message: 'Too many subscriptions' }
```

**Limits:** Max 50 lot subscriptions per WebSocket connection. Bid updates are polled from scrapers at `high` priority every 30 seconds for live-auction lots, every 5 minutes for upcoming lots.

---

## Deal Analyzer MCP — Tools

This is the intelligence layer that turns raw auction data into actionable buy/pass decisions. It orchestrates calls to the scraper MCPs and layers on cost modeling, market valuation, risk scoring, and AI vision analysis.

### analyze_vehicle
**Full-pipeline orchestration tool.** Single-call entry point that chains: listing details → VIN decode → NMVTIS title check → Carfax summary → NMVTIS/Carfax cross-reference → damage photo analysis (severity classification + paint detection + frame inspection) → parts-based repair estimate → market comps → profit calculation → risk score. Params: lot_number (required), source (copart|iaai, default copart), include_images (boolean, default true), buyer_location (zip code for transport & labor rates). Returns a complete `DealAnalysis` object (see types below).

### estimate_profit
Detailed cost breakdown and margin calculation. Params: lot_number, source, buyer_location. Returns:

```typescript
interface ProfitEstimate {
  acquisition: {
    current_bid: number;
    buyer_premium: number;        // Tiered: 18% on first $7500, then lower brackets
    gate_fee: number;             // Typically $59-$79
    title_fee: number;            // State-dependent
    environmental_fee: number;    // $15-$25
    virtual_bid_fee: number;      // $0 if bidding in-person
    total_acquisition: number;
  };
  repair: {
    estimate_low: number;
    estimate_high: number;
    estimate_mid: number;
    confidence: 'low' | 'medium' | 'high';
    breakdown_by_area: RepairArea[];
    parts_sourced: boolean;       // True if real parts pricing was used
    labor_regionalized: boolean;  // True if local labor rates were used
    paint_multiplier: number;     // 1.0 standard, 1.3 metallic, 1.8 tri-coat/pearl
    source: 'heuristic' | 'parts_lookup' | 'image_analysis' | 'combined';
  };
  transport: {
    distance_miles: number;
    carrier_estimate: number;
    self_pickup: boolean;
  };
  market_value: {
    retail_clean: number;
    retail_rebuilt: number;
    wholesale: number;
    source_count: number;
    confidence: 'low' | 'medium' | 'high';
  };
  summary: {
    total_cost: number;
    projected_sale_price: number;
    projected_profit: number;
    profit_margin_pct: number;
    roi_pct: number;
    verdict: 'strong_buy' | 'possible' | 'marginal' | 'pass';
  };
}
```

### get_market_comps
Find comparable sold vehicles to establish post-repair market value. Params: make, model, year, trim (optional), condition (rebuilt|clean), location (zip), radius_miles (default 150). Sources: Copart/IAAI sold history (salvage comps), plus external API if configured. Returns array of comps with sale_price, date, mileage, condition, source. Also returns aggregate stats: median, mean, min, max, count.

### scan_deals
**Batch search + score + rank.** Proactive deal-finding across both Copart and IAAI simultaneously. Params: make (optional), model (optional), year_min, year_max, damage_types (array), location, radius, price_max, min_profit_target (default $2000), limit (default 25). Runs search on both auction sources, applies the scoring model to each, and returns a ranked list of `DealSummary` objects sorted by deal score descending.

**Pipeline steps:**
1. **Search both sources** — Run `copart_search` + `iaai_search` in parallel with user criteria. Collect up to `limit * 3` raw listings (over-fetch to account for filtering).
2. **Quick filter** — Discard listings with `sale_status: 'sold'`, price above `price_max`, or obvious non-starters (Certificate of Destruction title, zero images).
3. **VIN decode** — Batch decode VINs via shared `vin-decoder.ts` (cached, free NHTSA API). Used for vehicle class determination.
4. **Heuristic repair estimate** — Apply tier-1 heuristic repair estimate based on `(damage_type, vehicle_class, year_range)`. **No parts lookup** (too slow for batch). **No NMVTIS** (cost guard: $1–2/query).
5. **Quick market value** — Pull cached sold history comps. If no cache, use heuristic value from VIN decode + listing `retail_value`.
6. **Quick profit calc** — `estimated_retail - (current_bid + fees + heuristic_repair + transport)`. Discard if below `min_profit_target`.
7. **Score & rank** — Apply scoring model (margin + risk + liquidity + info scores). Sort descending by `deal_score`.
8. **Return top N** — Return top `limit` results as `DealSummary[]` with `quick_analysis` one-liner.

> **What scan_deals explicitly skips** (vs. `analyze_vehicle`): No Carfax, no NMVTIS, no vision analysis, no real parts pricing, no transport quotes. These are deferred to per-lot `analyze_vehicle` calls for deals the user wants to investigate further.

### estimate_transport
Carrier cost estimation. Params: origin_zip (auction yard), destination_zip, vehicle_type (sedan/suv/truck), operable (boolean, default true). Returns: distance_miles, open_carrier_estimate, enclosed_estimate, self_pickup_viable (boolean).

**Transport cost model (`transport-calc.ts`):**

Cost is calculated using a distance-based per-mile rate with minimum and surcharges:

```typescript
interface TransportCostModel {
  // Base rates (open carrier, per mile)
  baseCostPerMile: {
    '0-500': 1.20;      // Short haul: higher per-mile
    '500-1000': 0.85;    // Medium haul
    '1000-1500': 0.70;   // Long haul
    '1500+': 0.58;       // Cross-country
  };
  minimumCharge: 250;     // Floor price regardless of distance
  enclosedMultiplier: 1.5; // 50% premium for enclosed trailer
  inoperableSurcharge: 150; // Extra for winch/dolly load
  oversizeMultiplier: {    // Vehicle type multiplier
    sedan: 1.0;
    suv: 1.10;
    truck: 1.15;
    van: 1.10;
  };
}
```

**Distance calculation:** Zip-to-zip distance is computed via a bundled US zip code centroid table (`config/regions.json`) using the Haversine formula. No external API call required.

**Self-pickup threshold:** `self_pickup_viable` is `true` when `distance_miles < 150`.

### export_analysis
Dump analysis results. Params: lot_numbers (array), format (csv|json). Returns file content as string.

---

## AI Vision Analysis  [NEW]

Three vision modules that structure Claude's image analysis into systematic, repeatable assessments. Each module provides prompt templates and scoring rubrics that the `analyze_vehicle` pipeline includes alongside damage photos.

### Damage Severity Classifier (`damage-classifier.ts`)

Scores each damage photo on a 1-5 severity scale and maps to cost multipliers.

```typescript
interface DamageClassification {
  image_index: number;
  category: string;              // exterior_front, exterior_rear, undercarriage, etc.
  severity: 1 | 2 | 3 | 4 | 5;
  severity_label: string;        // cosmetic | minor | moderate | major | catastrophic
  cost_multiplier: number;       // 0.5 | 0.75 | 1.0 | 1.5 | 2.5
  description: string;           // What Claude observed
  repair_feasibility: 'straightforward' | 'complex' | 'specialist_required';
}
```

**Severity Scale:**

| Score | Label | Multiplier | Description |
|-------|-------|------------|-------------|
| 1 | Cosmetic | 0.5x | Scratches, scuffs, minor dents. No structural concern. |
| 2 | Minor | 0.75x | Single panel damage, cracked bumper, broken light. Bolt-on replacement. |
| 3 | Moderate | 1.0x | Multi-panel damage, deployed airbag, suspension visible. Standard body shop. |
| 4 | Major | 1.5x | Significant structural intrusion, frame rail visible, multiple airbags. Experienced shop. |
| 5 | Catastrophic | 2.5x | Roof crush, full side impact, fire damage, submerged. Parts car only or specialist. |

The multiplier is applied to the heuristic/parts-based repair estimate. For example, a $3,000 heuristic estimate on a car scored severity 4 becomes $4,500.

### Paint Color Analyzer (`paint-analyzer.ts`)

Analyzes exterior photos to classify paint type, which directly affects repair cost through the paint multiplier in the repair quote.

```typescript
interface PaintAnalysis {
  detected_color: string;        // "Pearl White", "Metallic Blue", "Solid Black"
  paint_type: 'solid' | 'metallic' | 'pearl' | 'tri_coat' | 'matte' | 'wrap';
  cost_multiplier: number;       // 1.0 | 1.3 | 1.5 | 1.8 | 2.0 | 0.8
  confidence: 'low' | 'medium' | 'high';
  notes: string;                 // e.g. "Tri-coat pearl requires 3-stage paint process"
}
```

**Paint Multipliers:**

| Type | Multiplier | Notes |
|------|-----------|-------|
| Solid | 1.0x | Single-stage, cheapest to match |
| Metallic | 1.3x | Requires base/clear, common |
| Pearl | 1.5x | Directional flake, harder to match |
| Tri-coat | 1.8x | 3-stage process (Lexus, some Toyota/Honda colors) |
| Matte | 2.0x | Specialty clear coat, very limited shops |
| Wrap | 0.8x | Can remove instead of repaint |

### Frame Damage Inspector (`frame-inspector.ts`)

Structured prompt template for analyzing undercarriage and engine bay photos. Guides Claude to look for specific visual indicators of frame damage that dramatically affect repair viability.

**Inspection Checklist (embedded in prompt):**
- **Frame rails**: Look for buckling, kinking, fresh welds, or misalignment. Compare left vs right symmetry.
- **Apron/strut towers**: Check for deformation, pushed-back firewall, crumpling around shock mounts.
- **Unibody seams**: Factory spot welds intact vs. aftermarket plug welds (sign of previous repair).
- **Subframe/cradle**: Bolts showing stress marks, cross-member bent or shifted.
- **Undercoating disruption**: Fresh undercoating in isolated areas suggests hidden repair.
- **Gap analysis**: Visible in exterior photos — uneven panel gaps suggest frame shift.

```typescript
interface FrameInspection {
  frame_damage_detected: boolean;
  confidence: 'low' | 'medium' | 'high';
  indicators_found: {
    indicator: string;            // e.g. "kinked_frame_rail", "misaligned_gap", "fresh_welds"
    location: string;             // e.g. "front_left_rail", "rear_subframe"
    severity: 'minor' | 'major' | 'structural';
    photo_index: number;
  }[];
  repair_viable: boolean;         // False if structural integrity is compromised beyond repair
  estimated_frame_cost: number;   // Additional cost on top of body repair
  recommendation: string;
}
```

If `frame_damage_detected` is true with severity `structural`, the deal score receives a heavy penalty and the verdict is capped at `marginal` regardless of profit margin.

---

## Scoring Model (`deal-scorer.ts`)

Composite score (0–100) combining:
- **Margin score** (40% weight): Projected profit margin relative to total cost
- **Risk score** (30% weight): Penalty for salvage title, structural damage, flood, airbag deployment, odometer issues, title state history (title-wash detection via NMVTIS)
- **Liquidity score** (15% weight): How quickly this make/model/year sells in the region (based on comp volume and days-to-sell)
- **Information score** (15% weight): Bonus for having keys, running/driving, high image count, Carfax available, NMVTIS clear, real parts pricing sourced — more data = higher confidence

### Scoring Formula

```typescript
function calculateDealScore(
  margin: ProfitEstimate,
  risks: RiskFlag[],
  comps: MarketComps,
  info: InformationFactors
): number {
  const marginScore = clamp(margin.profit_margin_pct * 2, 0, 100);
  // 20% margin = 40 points, 50% margin = 100 points

  const riskScore = 100 - risks.reduce((penalty, flag) => {
    const penalties = { info: 0, warning: 15, critical: 35 };
    return penalty + penalties[flag.severity];
  }, 0);
  // Each critical flag costs 35 points, warnings cost 15

  const liquidityScore = clamp(
    (comps.recentSales.length / 10) * 50 +      // Volume: 10+ comps = 50 pts
    (comps.confidence === 'high' ? 50 : comps.confidence === 'medium' ? 30 : 10),
    0, 100
  );

  const infoScore = [
    info.hasKeys ? 15 : 0,
    info.isRunning ? 20 : 0,
    info.imageCount >= 8 ? 15 : info.imageCount >= 4 ? 10 : 0,
    info.carfaxAvailable ? 15 : 0,
    info.nmvtisClear ? 20 : 0,
    info.realPartsPrice ? 15 : 0,
  ].reduce((a, b) => a + b, 0);

  const raw =
    marginScore * 0.40 +
    Math.max(riskScore, 0) * 0.30 +
    liquidityScore * 0.15 +
    infoScore * 0.15;

  return clamp(Math.round(raw), 0, 100);
}
```

### Score → Recommendation Mapping

| Score Range | Recommendation | Action |
|-------------|---------------|--------|
| 80–100 | `strong_buy` | High confidence, act quickly |
| 65–79 | `buy` | Good deal, proceed with due diligence |
| 45–64 | `hold` | Marginal — investigate further or wait for price drop |
| 0–44 | `avoid` | Risk outweighs reward |

**Hard caps** (override score-based recommendation):
- Frame damage with severity `structural` → recommendation capped at `hold` regardless of score
- Any `critical` risk flag → recommendation capped at `hold`
- Profit margin < 5% → recommendation set to `avoid`
- Certificate of Destruction title → recommendation set to `avoid`

## Risk Flags (`risk-flags.ts`)

Automated red flag detection:
- **Title washing**: Cross-reference NMVTIS `title_records` state chain. Flag if vehicle had salvage/junk brand in any state and later appears clean. Also flag if `state_count > 2` within a short time window.
- **NMVTIS/Carfax discrepancy**: Auto-flag if `nmvtis_compare_carfax` returns discrepancies with severity `warning` or `critical`.
- **Odometer rollback**: Flag if Carfax or NMVTIS odometer readings show decrease, or if listing odometer deviates >15% from last known reading.
- **Flood/structural**: Direct passthrough from Carfax and NMVTIS flags. Frame inspector findings override if available.
- **Airbag deployment**: Major cost flag — repair estimate inflated automatically.
- **Excessive owners**: >4 owners in <10 years flagged.

## Repair Estimation (`repair-estimator.ts`)

Three-tier approach (upgraded from two-tier):

1. **Heuristic baseline**: Lookup table keyed by `(damage_type, vehicle_class, year_range)` → repair cost range. Covers common damage types. Vehicle class derived from make/model (economy, mid-size, luxury, truck, SUV).

2. **Parts + labor lookup** [NEW]: When the parts-pricing-mcp is available, `repair_build_quote` replaces the heuristic for specific damage areas. Real used/aftermarket part prices from car-part.com and eBay Motors, combined with local labor rates from RepairPal, produce a grounded estimate. The paint multiplier from the vision paint analyzer adjusts paint costs.

3. **Image-augmented refinement**: When `analyze_vehicle` runs with `include_images: true`, damage photos are processed through all three vision modules (severity classifier, paint analyzer, frame inspector). The severity classifier's cost multiplier adjusts the estimate up or down. Frame inspector findings can add structural repair costs or flag the deal as non-viable.

Confidence levels are now derived from which tiers were used:
- `heuristic` only → `low` confidence
- `heuristic` + `parts_lookup` → `medium` confidence
- `parts_lookup` + `image_analysis` → `high` confidence
- All three → `high` confidence

---

## Priority Queue Rate Limiter  [NEW]

Replaces simple throttling with a priority-aware request queue (`shared/src/priority-queue.ts`). Not all scrape requests are equal — a watched lot approaching its sale time is more urgent than a casual browse.

### Priority Levels

| Priority | Use Case | Max Wait |
|----------|----------|----------|
| `critical` | Active-bid lot refresh, lot selling within 1 hour | 0s (immediate, bypass queue) |
| `high` | Watchlist refresh, `analyze_vehicle` pipeline calls | 2s |
| `normal` | User-initiated search, listing detail fetch | 5s |
| `low` | Sold history backfill, comp data refresh | 10s |
| `background` | Pre-warming cache, image pre-fetch | 30s |

### Behavior
- Each scraper MCP's `rate-limiter.ts` wraps the shared priority queue.
- The queue enforces the global rate limit (1 req/3s) but processes `critical` requests immediately, preempting any queued `normal`/`low` work.
- Starvation prevention: `low` and `background` tasks are guaranteed at least 1 slot per 60s even under sustained high-priority load.
- The alert poller uses `high` priority for watchlist lots approaching sale date, `normal` for routine checks.

### Rate Limiter ↔ Priority Queue Interaction

The per-package `rate-limiter.ts` and shared `priority-queue.ts` compose as follows:

```
Tool handler
  → rate-limiter.ts (per-scraper)
    → checks daily cap (reject if exceeded with RATE_LIMIT_DAILY_CAP)
    → assigns priority based on calling context
    → enqueues into priority-queue.ts (shared singleton)
      → priority queue sorts by priority level, then FIFO within level
      → dequeues respecting global token bucket (1 req/3s)
      → on 403/429 response: triggers exponential backoff in rate-limiter
        (backoffBaseMs * 2^attempt, capped at backoffMaxMs)
    → returns result to tool handler
```

**Scope:** Each scraper package has its own `RateLimiter` instance with independent daily counters and backoff state. The `PriorityRequestQueue` is a **per-process singleton** — when scrapers run in-process via the gateway, all scrapers share one queue and one global rate limit. When scrapers run as separate processes, each has its own queue.

**Gateway coordination:** The gateway does NOT enforce a global cross-process rate limit. Each downstream process self-governs. This is acceptable because each scraper targets a different site (Copart vs IAAI vs Carfax) so their rate limits are independent.

---

## Watchlist Storage  [UPDATED]

Watchlists are now stored in SQLite instead of JSON files. This resolves concurrent read/write issues between the MCP server tool handlers and the alert poller.

```sql
CREATE TABLE watchlist (
  lot_number TEXT PRIMARY KEY,
  source TEXT NOT NULL,              -- 'copart' | 'iaai'
  added_at TEXT NOT NULL,            -- ISO timestamp
  bid_threshold REAL,                -- Optional max bid alert
  last_checked_at TEXT,
  last_bid REAL,
  last_status TEXT,
  notes TEXT                         -- User notes
);

CREATE TABLE watchlist_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lot_number TEXT NOT NULL,
  field TEXT NOT NULL,                -- 'bid' | 'status' | 'buy_it_now'
  old_value TEXT,
  new_value TEXT,
  detected_at TEXT NOT NULL,
  FOREIGN KEY (lot_number) REFERENCES watchlist(lot_number)
);

-- Indexes for efficient polling and history queries
CREATE INDEX idx_watchlist_source ON watchlist(source);
CREATE INDEX idx_watchlist_last_checked ON watchlist(last_checked_at);
CREATE INDEX idx_watchlist_history_lot ON watchlist_history(lot_number, detected_at);
```

All scraper MCPs and the alert poller share the same SQLite database file (WAL mode enabled for concurrent readers + single writer).

---

## OpenTelemetry Observability  [NEW]

Full distributed tracing across the `analyze_vehicle` pipeline to identify bottlenecks and monitor scraper health.

### Instrumentation (`shared/src/tracing.ts`)

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
}
```

### What Gets Traced
- Each MCP tool call: tool name, params, duration, success/failure
- Scraper operations: page load time, API interception time, parse time
- Cache operations: hit/miss, TTL remaining
- Rate limiter: queue depth, wait time, priority level
- External API calls: NHTSA, NMVTIS provider, RepairPal
- `analyze_vehicle` end-to-end: each pipeline stage as a child span

### Metrics Emitted
- `scraper.request.duration` — histogram by scraper + operation
- `scraper.cache.hit_rate` — gauge by cache type
- `scraper.rate_limit.queue_depth` — gauge by priority level
- `analyzer.pipeline.duration` — histogram for full analysis
- `analyzer.deal_score.distribution` — histogram of computed scores
- `nmvtis.daily_spend` — gauge tracking cumulative NMVTIS cost per day
- `scraper.rate_limit.daily_remaining` — gauge of remaining daily requests per scraper

### Span Naming Conventions

All spans follow the format `{package}.{operation}` for consistency:

| Span Name | Package | Description |
|-----------|---------|-------------|
| `copart.search` | copart-scraper-mcp | Search request (including queue wait) |
| `copart.get_listing` | copart-scraper-mcp | Single lot fetch |
| `copart.intercept_api` | copart-scraper-mcp | Network API interception attempt |
| `copart.parse_dom` | copart-scraper-mcp | DOM fallback parsing |
| `iaai.search` | iaai-scraper-mcp | IAAI search request |
| `carfax.get_report` | carfax-scraper-mcp | Full Carfax report fetch |
| `nmvtis.title_check` | nmvtis-mcp | NMVTIS API call |
| `parts.search` | parts-pricing-mcp | Parts search across sources |
| `analyzer.pipeline` | deal-analyzer-mcp | Full analyze_vehicle pipeline (parent span) |
| `analyzer.pipeline.vin_decode` | deal-analyzer-mcp | VIN decode step (child span) |
| `analyzer.pipeline.vision` | deal-analyzer-mcp | All vision analysis (child span) |
| `analyzer.pipeline.repair_estimate` | deal-analyzer-mcp | Repair cost estimation (child span) |
| `analyzer.pipeline.scoring` | deal-analyzer-mcp | Deal scoring (child span) |
| `gateway.route` | gateway-mcp | Tool call routing |
| `cache.read` | any | Cache lookup (tag: hit/miss) |
| `cache.write` | any | Cache store |

**Custom attributes** added to all spans: `tool.name`, `tool.source` (copart/iaai), `cache.hit` (boolean), `queue.priority`, `queue.wait_ms`.

### Local Dev
`docker-compose.yml` includes Jaeger for local trace visualization:
```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"   # UI
    - "4318:4318"     # OTLP HTTP
```

---

## Alerts System

Standalone service (not an MCP server) that polls watchlists and sends notifications.

### Architecture
- `poller.ts`: Runs on a configurable cron schedule (default: every 30 min during auction hours, 7am–7pm ET weekdays).
- Reads watchlist from shared SQLite database (replaces JSON file reads).
- For each watched lot, fetches current listing via the scraper MCPs' HTTP/SSE endpoints.
- Uses `high` priority queue level for lots approaching sale date, `normal` for routine checks.
- Compares against last-known state in the `watchlist` table.
- Fires alerts on configurable triggers, logs changes to `watchlist_history`.

### Alert Triggers
| Trigger | Description |
|---------|-------------|
| `bid_change` | Current bid increased since last check |
| `bid_threshold` | Bid exceeds a user-set maximum (per-lot config) |
| `sale_date_approaching` | Sale date within 24 hours |
| `sale_completed` | Lot status changed to sold |
| `buy_it_now_available` | BIN price appeared or changed |
| `price_drop` | BIN price decreased |
| `new_match` | New lot matches a saved search filter |

### Notification Channels
- **Webhook**: POST JSON payload to any URL. Default format compatible with Slack incoming webhooks.
- **Email**: Via Resend API (free tier: 100 emails/day). Sends HTML summary with lot photo, bid, and quick-link.
- **Slack**: Direct Slack incoming webhook integration.

---

## Anti-Bot Strategy (all scrapers)

1. Playwright stealth plugin to mask automation fingerprints
2. Random delays (2–5s), mouse movement, scroll simulation
3. Session/cookie persistence across requests
4. Network request interception to capture internal API calls instead of DOM parsing where possible
5. Rate limiting via priority queue: max 1 req/3s, exponential backoff on 403/429, configurable daily cap (default 500)
6. Optional residential proxy rotation
7. CAPTCHA detection — return descriptive error, don't attempt to solve

---

## Caching

| Data | TTL | Storage |
|------|-----|---------|
| Search results | 15 min | In-memory LRU |
| Listing details | 1 hour | SQLite |
| Images | 24 hours | Disk |
| VIN decode | 90 days | SQLite |
| Carfax reports | 30 days | SQLite |
| NMVTIS title checks | 30 days | SQLite |
| Sold history / comps | 7 days | SQLite |
| Market value estimates | 24 hours | SQLite |
| Transport estimates | 7 days | SQLite |
| Part prices | 7 days | SQLite |
| Labor rates | 30 days | SQLite |
| Deal analysis results | 1 hour | SQLite |
| Watchlist | Persistent | SQLite |
| Alert state (last-known) | Persistent | SQLite |

---

## Auction Fee Schedules

Stored in `config/fee-schedules.json` and consumed by `fee-calculator.ts`. Update periodically as auction houses change fees.

### Copart Buyer Premiums (public/non-member)

| Bid Range | Premium |
|-----------|---------|
| $0 – $99.99 | $1 (internet bid fee) |
| $100 – $499.99 | $49 |
| $500 – $999.99 | $49 |
| $1,000 – $1,499.99 | $99 |
| $1,500 – $1,999.99 | $149 |
| $2,000 – $3,999.99 | $199 |
| $4,000 – $5,999.99 | $299 |
| $6,000 – $7,999.99 | $399 |
| $8,000+ | 5% of bid |

Plus flat fees: gate fee ($79), environmental fee ($10 or $15 based on title).

### IAAI Buyer Premiums (public buyer)

| Bid Range | Premium |
|-----------|---------|
| $0 – $99.99 | $25 |
| $100 – $199.99 | $50 |
| $200 – $299.99 | $70 |
| $300 – $349.99 | $80 |
| $350 – $399.99 | $80 |
| $400 – $449.99 | $95 |
| $450 – $499.99 | $95 |
| $500 – $549.99 | $110 |
| $550 – $599.99 | $110 |
| $600 – $699.99 | $120 |
| $700 – $799.99 | $135 |
| $800 – $899.99 | $135 |
| $900 – $999.99 | $145 |
| $1,000 – $1,199.99 | $160 |
| $1,200 – $1,299.99 | $170 |
| $1,300 – $1,499.99 | $185 |
| $1,500 – $1,999.99 | $200 |
| $2,000 – $2,499.99 | $230 |
| $2,500 – $2,999.99 | $260 |
| $3,000 – $3,499.99 | $290 |
| $3,500 – $3,999.99 | $315 |
| $4,000 – $4,499.99 | $335 |
| $4,500 – $4,999.99 | $355 |
| $5,000 – $5,999.99 | $375 |
| $6,000 – $7,499.99 | $400 |
| $7,500 – $9,999.99 | $450 |
| $10,000 – $14,999.99 | 5% of bid |
| $15,000+ | 5% of bid |

Plus flat fees: internet bid fee ($100), environmental fee ($15), title processing ($15–$30).

### Fee Calculator Interface

```typescript
interface FeeOptions {
  memberType?: 'public' | 'dealer' | 'broker';
  bidType?: 'online' | 'in_person';
  state?: string;               // For state-specific title/env fees
}

interface FeeBreakdown {
  buyerPremium: number;
  gateFee: number;
  titleFee: number;
  environmentalFee: number;
  virtualBidFee: number;        // $0 if in-person
  technologyFee: number;        // IAAI-specific
  totalFees: number;
}

function calculateCopartFees(bidAmount: number, options?: FeeOptions): FeeBreakdown;
function calculateIaaiFees(bidAmount: number, options?: FeeOptions): FeeBreakdown;
```

---

## ESLint & Prettier Configuration

ESLint uses the flat config format (`eslint.config.js` at root):

```javascript
// eslint.config.js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    ignores: ['**/dist/**', '**/data/**', '**/node_modules/**'],
  }
);
```

Prettier config (`.prettierrc`):

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

Root `package.json` scripts:
```json
{
  "scripts": {
    "lint": "eslint packages/ alerts/",
    "lint:fix": "eslint --fix packages/ alerts/",
    "format": "prettier --write 'packages/*/src/**/*.ts' 'alerts/src/**/*.ts'",
    "format:check": "prettier --check 'packages/*/src/**/*.ts' 'alerts/src/**/*.ts'"
  }
}
```

---

## Shared Types

Key shared types in `shared/src/types.ts`:

```typescript
// Normalized auction listing — source-agnostic
interface AuctionListing {
  source: 'copart' | 'iaai';
  lot_number: string;
  title: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  damage_primary: string;
  damage_secondary?: string;
  has_keys: boolean;
  odometer: number;
  odometer_status: 'actual' | 'exempt' | 'not_actual' | 'exceeds_limit';
  drive_type: string;
  fuel_type: string;
  engine: string;
  transmission: string;
  color: string;
  current_bid: number;
  buy_it_now?: number;
  sale_date: string;
  sale_status: 'upcoming' | 'live' | 'sold' | 'cancelled';
  location: string;
  location_zip: string;
  thumbnail_url: string;
  listing_url: string;
  // Extended fields (from get_listing)
  body_style?: string;
  cylinders?: number;
  retail_value?: number;
  title_type?: string;
  title_state?: string;
  seller?: string;
  highlights?: string[];
  condition?: { start_code: string; keys: boolean; airbags: string };
  image_count?: number;
}

// Full deal analysis output
interface DealAnalysis {
  listing: AuctionListing;
  vin_decode: VINDecodeResult;
  nmvtis_result?: NMVTISResult;
  carfax_summary?: CarfaxSummary;
  title_comparison?: TitleComparison;
  profit_estimate: ProfitEstimate;
  repair_quote?: RepairQuote;
  deal_score: number;             // 0–100
  risk_flags: RiskFlag[];
  images?: DamageImage[];
  damage_classifications?: DamageClassification[];
  paint_analysis?: PaintAnalysis;
  frame_inspection?: FrameInspection;
  generated_at: string;
}

interface RiskFlag {
  type: 'title_wash' | 'odometer_rollback' | 'flood' | 'structural' |
        'airbag' | 'excessive_owners' | 'no_keys' | 'non_runner' |
        'nmvtis_discrepancy' | 'frame_damage';
  severity: 'info' | 'warning' | 'critical';
  detail: string;
}

interface DealSummary {
  lot_number: string;
  source: 'copart' | 'iaai';
  title: string;
  year: number;
  make: string;
  model: string;
  current_bid: number;
  estimated_profit: number;
  deal_score: number;
  risk_flags: RiskFlag[];
  sale_date: string;
  listing_url: string;
}

// --- Error types ---
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

interface ToolResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs?: number;       // Present for RATE_LIMITED errors
  };
  cached: boolean;
  stale: boolean;                // True when returning expired cache on failure
  timestamp: string;             // ISO 8601
}

// --- Source-specific raw types (pre-normalization) ---
interface CopartRawListing {
  lotNumberStr: string;
  mkn: string;                  // Make name
  mmod: string;                 // Model
  lcy: number;                  // Year
  dd: string;                   // Primary damage description
  sdd?: string;                 // Secondary damage
  orr: number;                  // Odometer reading
  odometerBrand: string;
  la: string;                   // Location / auction yard
  dynamicBidAmount: number;
  bin?: number;                 // Buy It Now
  tims: { full: string[] };     // Image URLs
  ad: string;                   // Auction date
  hk: boolean;                  // Has keys
  dr: boolean;                  // Driveable
  ts: string;                   // Title state
  tt: string;                   // Title type
  [key: string]: unknown;
}

interface IaaiRawListing {
  stockNumber: string;
  year: number;
  makeName: string;
  modelName: string;
  primaryDamage: string;
  secondaryDamage?: string;
  odometerReading: number;
  odometerUnit: string;
  branch: string;               // IAAI branch = location
  currentBid: number;
  buyNowPrice?: number;
  saleDate: string;
  hasKeys: string;              // "YES" | "NO" string, not boolean
  titleState: string;
  titleCode: string;
  images: { url: string; seq: number }[];
  [key: string]: unknown;
}

// --- Carfax sub-record types ---
interface ServiceRecord {
  date: string;
  mileage?: number;
  description: string;
  facility?: string;
  location?: string;
}

interface RecallRecord {
  campaignNumber: string;
  date: string;
  component: string;
  description: string;
  remedy: string;
  status: 'open' | 'completed' | 'unknown';
}

// --- NMVTIS sub-record types ---
interface NmvtisTitleRecord {
  state: string;
  date: string;
  titleType: string;
  brandCodes: string[];
  brandDescriptions: string[];
  odometer?: number;
  odometerStatus?: string;
}

interface InsuranceLossRecord {
  date: string;
  insurer?: string;
  claimType: string;            // "Total Loss", "Theft", "Recovered Theft"
  disposition?: string;
}

interface JunkSalvageRecord {
  reportedBy: string;
  date: string;
  disposition: string;          // "Crushed", "Sold", "Rebuilt", "Retained"
  state?: string;
}

interface OdometerRecord {
  date: string;
  reading: number;
  source: string;               // "Title", "Inspection", "Service"
  status: 'ok' | 'discrepancy' | 'rollback_suspected' | 'exceeds_limit';
}

// --- Market & transport types ---
interface CarrierQuote {
  carrier: string;
  type: 'open' | 'enclosed';
  price: number;
  estimatedDays: number;
  rating?: number;              // 1-5 carrier rating
  url?: string;
}

interface ValueAdjustment {
  factor: string;               // "mileage", "title_type", "damage", "region"
  adjustment: number;           // Dollar amount (+/-)
  reason: string;
}

// --- Repair types ---
interface RepairEstimate {
  totalCost: number;
  confidence: 'low' | 'medium' | 'high';
  source: 'heuristic' | 'parts_lookup' | 'image_analysis' | 'combined';
  lineItems: RepairLineItem[];
  paintMultiplier: number;      // From vision paint analyzer (1.0 default)
  severityMultiplier: number;   // From vision damage classifier (1.0 default)
  frameCostAdditional: number;  // From vision frame inspector ($0 default)
}

interface RepairLineItem {
  description: string;
  partCost: number;
  laborCost: number;
  laborHours: number;
  partSource?: string;
  lineTotal: number;
}

// --- Browser config ---
interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  userAgent?: string;           // null = rotate from stealth pool
  proxyUrl?: string;            // From PROXY_URL env var
  navigationTimeoutMs: number;
  actionDelayMinMs: number;
  actionDelayMaxMs: number;
  scrollSteps: number;
}
```

---

## Environment Variables

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

# Proxy
PROXY_URL=

# Transport
TRANSPORT=stdio              # stdio | sse | websocket
PORT=3000
WS_PORT=3001

# Alerts
RESEND_API_KEY=
ALERT_WEBHOOK_URL=
ALERT_EMAIL_TO=

# Buyer config
BUYER_ZIP=

# Observability
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=car-auctions
```

---

## Implementation Notes

- Each MCP server supports stdio (Claude Desktop), SSE (remote/claude.ai), and WebSocket (real-time dashboards) via CLI flag or TRANSPORT env var.
- The gateway-mcp is the recommended entry point — single MCP connection for all tools.
- Shared vin-decoder.ts calls the free NHTSA vPIC API at `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}?format=json`.
- Base64 images include the data URI prefix so Claude can analyze them directly.
- Keep MCP protocol concerns separate from scraping logic — tool handlers call clean async scraper functions.
- Custom error types: ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError.
- Add health check tools (copart_health, iaai_health, carfax_health, parts_health, nmvtis_health, analyzer_health, gateway_health) returning scraper status, cache stats, rate limit remaining.
- Docker images should install Playwright browsers.
- `auction-normalizer.ts` is critical path — test thoroughly with fixture data from both sources.
- The deal-analyzer-mcp does NOT scrape anything itself. It calls the other MCP servers' tools or their internal functions directly (if running in-process).
- Fee schedules vary by auction house and change periodically. Store in editable JSON config.
- OpenTelemetry tracing is opt-in via OTEL_EXPORTER_OTLP_ENDPOINT env var. When not set, tracing is a no-op.
- .gitignore: data/, node_modules/, .env, *.db, browser cache dirs.

---

## Testing (vitest)

- Unit tests for parsers using fixture HTML/JSON files (both Copart and IAAI fixtures)
- Unit tests for tool handlers with mocked scraper responses
- Unit tests for `auction-normalizer.ts` ensuring Copart and IAAI fixtures produce identical schema output
- Unit tests for `fee-calculator.ts` covering all buyer premium tiers
- Unit tests for `deal-scorer.ts` with known-outcome fixtures (verified good/bad deals)
- Unit tests for `risk-flags.ts` including title-wash detection scenarios (with NMVTIS data)
- Unit tests for `damage-classifier.ts` with sample severity assessments
- Unit tests for `repair-estimator.ts` verifying all three tiers (heuristic, parts+labor, image-augmented)
- Unit tests for `priority-queue.ts` verifying preemption and starvation prevention
- Unit tests for `nmvtis_compare_carfax` with discrepancy fixtures
- Integration test scaffolding for browser tests (skipped in CI by default)
- Sample fixtures in tests/fixtures/ with representative Copart, IAAI, Carfax, NMVTIS, and parts API responses
