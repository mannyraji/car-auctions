# Car Auctions MCP Monorepo — Copilot Instructions

> **Shared Standards**: See `.github/copilot-shared/instructions/coding-standards.md` for universal development standards (credential management, input validation principles, SQL safety, error handling, testing philosophy) that apply across all projects.

## Architecture

TypeScript npm monorepo with 9 workspace packages: 7 MCP (Model Context Protocol) servers, 1 shared utility library, and 1 standalone alerts service. Purpose: AI-powered deal analysis for salvage auction car flippers.

### Monorepo Layout

```
packages/
  shared/                  # Shared types, utilities (not an MCP server)
  copart-scraper-mcp/      # Copart auction scraper
  iaai-scraper-mcp/        # IAAI auction scraper
  carfax-scraper-mcp/      # Vehicle history reports
  parts-pricing-mcp/       # Real parts & labor pricing
  nmvtis-mcp/              # NMVTIS federal title history
  gateway-mcp/             # Unified API gateway (stdio/SSE/WebSocket)
  deal-analyzer-mcp/       # Profit calculator, risk scorer, AI vision
alerts/                    # Standalone cron-based watchlist poller
```

### Package Structure Pattern

Each MCP server package follows this layout:

```
src/
  index.ts          # MCP server entry point (stdio + SSE + WebSocket)
  server.ts         # Tool registration & routing
  tools/            # MCP tool implementations (one file per tool)
  scraper/          # Browser automation: browser.ts, *-client.ts, interceptor.ts, parser.ts
  cache/            # sqlite.ts, image-cache.ts, memory.ts
  utils/            # rate-limiter.ts, stealth.ts, image-utils.ts
  types/index.ts    # Package-local TypeScript interfaces
config/             # default.json (rate limits, cache TTLs, proxy config)
tests/              # Vitest tests + fixtures/
data/               # Runtime data (gitignored)
```

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript 5+ (ES2022 target, Node16 module, strict mode)
- **MCP Framework**: `@modelcontextprotocol/sdk` — stdio, SSE, and WebSocket transports
- **Browser Automation**: `playwright` + `playwright-extra` + `puppeteer-extra-plugin-stealth`
- **Cache**: `better-sqlite3` (WAL mode) + in-memory LRU (max 200 entries)
- **Image Processing**: `sharp` for resize/compress before base64 encoding
- **Observability**: `@opentelemetry/sdk-node` + OTLP exporter
- **WebSocket**: `ws` for real-time bid transport
- **Testing**: `vitest`
- **Alerts**: `node-cron`, `resend` (email), Slack webhooks
- **Config**: `dotenv` + JSON config files
- **Linting**: ESLint flat config + Prettier

## Conventions

### MCP Tool Naming

Tools are prefixed by source/package:
- `copart_search`, `copart_get_listing`, `copart_get_images`, `copart_decode_vin`, `copart_watch_listing`, `copart_sold_history`
- `iaai_search`, `iaai_get_listing`, `iaai_get_images`, `iaai_decode_vin`, `iaai_sold_history`
- `carfax_get_report`, `carfax_get_summary`
- `parts_search`, `parts_get_price`, `labor_get_rates`, `repair_build_quote`
- `nmvtis_title_check`, `nmvtis_compare_carfax`
- `analyze_vehicle`, `estimate_profit`, `get_market_comps`, `scan_deals`, `estimate_transport`, `export_analysis`
- `gateway_health`

### Shared Package Imports

```typescript
import { AuctionListing, DealAnalysis, RiskFlag } from '@car-auctions/shared';
```

### Scraper Architecture

Each scraper follows: `browser.ts` (Playwright lifecycle) → `*-client.ts` (navigation/extraction) → `interceptor.ts` (network API interception) → `parser.ts` (DOM/JSON → typed data). Prefer network interception over DOM scraping where possible.

### Anti-Bot Strategy

1. Playwright stealth plugin (fingerprint masking)
2. Random delays 2–5s between actions
3. Mouse movement + scroll simulation
4. Session/cookie persistence
5. Rate limiting: 1 req/3s, exponential backoff on 403/429, daily cap 500
6. CAPTCHA detection → throw `CaptchaError` (never attempt to solve)

### SQLite Caching

All SQLite databases use WAL mode, stored in gitignored `data/` directories.

| Data | TTL |
|------|-----|
| Search results (LRU) | 15 min |
| Listing details | 1 hour |
| Images (disk) | 24 hours |
| Sold history | 7 days |
| VIN decode | 90 days |
| Carfax reports | 30 days |
| NMVTIS results | 30 days |
| Part prices | 7 days |
| Labor rates | 30 days |
| Market value | 24 hours |
| Transport estimates | 7 days |
| Deal analysis | 1 hour |

On scraper failure, return stale cached data with `stale: true` flag when available.

### Error Types

```typescript
ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError
```

All tools return structured MCP errors.

### Input Validation (at tool boundaries)

- **VIN**: 17 characters, alphanumeric, reject I/O/Q
- **Lot number**: alphanumeric only
- **Zip code**: 5-digit numeric

### Security (Project-Specific)

> General security principles (credential handling, SQL safety, SSRF prevention) are in the shared coding standards.

Project-specific security rules:
- **Credential env vars**: `COPART_EMAIL`, `COPART_PASSWORD`, `IAAI_EMAIL`, `IAAI_PASSWORD`, `CARFAX_EMAIL`, `CARFAX_PASSWORD`, `NMVTIS_API_KEY`, `EBAY_APP_ID`, `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`
- SQLite databases in `data/` directories (gitignored)
- Proxy URL from `process.env.PROXY_URL`, rotation on failure
- **NMVTIS cost guard** ($1–2 per query): only called during single-lot `analyze_vehicle`, **never** during `scan_deals` batch operations

## Testing Strategy (Vitest)

| Category | Pattern | Location |
|----------|---------|----------|
| Parser tests | Fixture HTML/JSON → structured data | `tests/parser.test.ts` |
| Tool tests | Mocked scraper → correct MCP response | `tests/tools.test.ts` |
| Normalizer | Copart + IAAI fixtures → identical schema | `packages/shared/tests/` |
| Fee calc | All buyer premium tiers | `packages/deal-analyzer-mcp/tests/` |
| Scorer | Known good/bad deal fixtures | `tests/scorer.test.ts` |
| Risk flags | Title-wash, odometer, flood scenarios | `tests/` |
| Priority queue | Ordering, preemption, starvation | `packages/shared/tests/` |
| Router | Tool → downstream mapping | `packages/gateway-mcp/tests/` |
| Alert triggers | Each trigger condition | `alerts/tests/` |
| Live integration | Real scraper (skip in CI) | Tagged `{ skip: !process.env.LIVE_TEST }` |

## Key References

- **Technical Spec**: `docs/spec.md` — tool definitions, type interfaces, architecture
- **Implementation Plan**: `docs/plan.md` — 10 phases, acceptance criteria, dependency graph

## Active Technologies
- Runtime/compiler: TypeScript 5+ on Node.js 20+ (ES2022 target, Node16 module resolution, strict mode)
- MCP and browser automation: `@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`
- Storage and observability: `better-sqlite3`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `ws`
- Caching: SQLite via `better-sqlite3` (WAL mode) for VIN cache; in-memory LRU (max 200 entries) for hot data
- Change reference: `001-shared-utilities-lib`

## Recent Changes
- 001-shared-utilities-lib: Added TypeScript 5+ on Node.js 20+ (ES2022 target, Node16 module resolution, strict mode) + `@modelcontextprotocol/sdk`, `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`, `better-sqlite3`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `ws`
