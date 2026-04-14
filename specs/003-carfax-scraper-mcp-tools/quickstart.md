# Quickstart: Carfax Scraper MCP Tools

**Feature**: `003-carfax-scraper-mcp-tools`  
**Package**: `@car-auctions/carfax-scraper-mcp`  
**Branch**: `003-carfax-scraper-mcp-tools`

---

## Prerequisites

- Node.js >= 20
- Monorepo dependencies installed from repo root
- Carfax credentials in environment:
  - `CARFAX_EMAIL`
  - `CARFAX_PASSWORD`

---

## 1. Install dependencies

```bash
cd /home/runner/work/car-auctions/car-auctions
npm install
```

---

## 2. Build shared package first

```bash
cd /home/runner/work/car-auctions/car-auctions/packages/shared
npm run build
```

---

## 3. Build Carfax package

```bash
cd /home/runner/work/car-auctions/car-auctions/packages/carfax-scraper-mcp
npm run build
```

---

## 4. Run Carfax MCP server

```bash
cd /home/runner/work/car-auctions/car-auctions/packages/carfax-scraper-mcp
npm start
```

The server should expose:

- `carfax_get_report`
- `carfax_get_summary`

---

## 5. Run tests

```bash
cd /home/runner/work/car-auctions/car-auctions/packages/carfax-scraper-mcp
npx vitest run
```

Coverage run:

```bash
npx vitest run --coverage
```

---

## 6. Runtime data layout

```text
packages/carfax-scraper-mcp/
└── data/
    ├── carfax.sqlite
    └── session.json
```

- `carfax.sqlite` stores 30-day report cache in WAL mode.
- `session.json` stores persisted authenticated browser/session state.

---

## 7. Validation checklist

- VIN boundary validation enforces 17 chars and rejects I/O/Q.
- Typed errors only: `ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`.
- Stale fallback returns `stale: true` with `cachedAt` when upstream fails.
- OTEL span attributes are emitted per tool invocation.
