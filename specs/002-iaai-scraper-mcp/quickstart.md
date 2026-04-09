# Quickstart: IAAI Scraper MCP

**Feature**: `002-iaai-scraper-mcp`  
**Package**: `@car-auctions/iaai-scraper-mcp`  
**Branch**: `002-iaai-scraper-mcp`

---

## Prerequisites

- Node.js ≥ 20
- An IAAI account (email + password)
- `@car-auctions/shared` built (the IAAI package depends on it)

---

## 1. Environment Setup

Create a `.env` file in the project root (or export env vars in your shell):

```bash
# Required — IAAI authentication
IAAI_EMAIL=your@email.com
IAAI_PASSWORD=yourpassword

# Optional — proxy for scraping (recommended for production)
PROXY_URL=http://user:pass@proxy.example.com:8080

# Optional — OpenTelemetry (omit for no-op tracing)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Optional — MCP transport (default: stdio)
# TRANSPORT=stdio | sse | ws
TRANSPORT=stdio
```

The server will **fail to start** with a clear error if `IAAI_EMAIL` or `IAAI_PASSWORD` are missing.

---

## 2. Install Dependencies

All dependencies are hoisted to the monorepo root:

```bash
# From the monorepo root
npm install
```

---

## 3. Build Shared Package First

The IAAI scraper depends on `@car-auctions/shared`. Build it before building the scraper:

```bash
cd packages/shared
npm run build
```

---

## 4. Build the IAAI Scraper

```bash
cd packages/iaai-scraper-mcp
npm run build
```

This outputs compiled files to `packages/iaai-scraper-mcp/dist/`.

---

## 5. Run the Server

```bash
cd packages/iaai-scraper-mcp
npm start
# or directly:
node dist/index.js
```

On first run, the browser will authenticate with IAAI using `IAAI_EMAIL` and `IAAI_PASSWORD` and persist the session to `data/iaai-session.json`. Subsequent starts reuse the saved session.

---

## 6. Run Tests

Tests use fixture JSON files in `tests/fixtures/` — **no live IAAI access required** for the parser and tool suites:

```bash
cd packages/iaai-scraper-mcp
npx vitest run
```

Run with coverage:

```bash
npx vitest run --coverage
```

Live integration tests (skipped in CI):

```bash
LIVE_TEST=1 npx vitest run
```

Startup smoke check is separate from the fixture-based Vitest suite. Run it only in an environment with valid `IAAI_EMAIL` and `IAAI_PASSWORD` configured after the package has been built:

```bash
node dist/index.js
```

---

## 7. Directory Layout (runtime)

The `data/` directory is gitignored and created on first run:

```text
packages/iaai-scraper-mcp/
└── data/
    ├── iaai.sqlite       # SQLite cache (listings, sold history, watchlist)
    ├── iaai-session.json # Persisted IAAI session (cookies + localStorage)
    └── images/           # Disk-cached WebP images (SHA-256 filename)
```

---

## 8. Key Files for Implementers

| File | Purpose |
|---|---|
| `src/index.ts` | Entry point — init tracing, create deps, start server |
| `src/server.ts` | Register 6 MCP tools via `createMcpServer` |
| `src/scraper/browser.ts` | Playwright lifecycle, stealth, session persistence |
| `src/scraper/iaai-client.ts` | Navigation logic, stale fallback orchestration |
| `src/scraper/interceptor.ts` | Network interception for `/inventorySearch`, `/stockDetails` |
| `src/scraper/parser.ts` | DOM fallback parser + aggregate computation |
| `src/cache/sqlite.ts` | SQLite WAL cache for listings, sold history, watchlist |
| `src/cache/image-cache.ts` | Disk-based 24 hr image cache |
| `src/cache/memory.ts` | In-memory LRU cache for search results |
| `src/utils/rate-limiter.ts` | 1 req/3 s, exponential backoff, 500/day cap |
| `src/utils/stealth.ts` | Random delays, mouse simulation, CAPTCHA detection |
| `config/default.json` | Default rate limit and cache TTL config |
| `tests/fixtures/` | JSON fixtures for unit tests |

---

## 9. Adding a New Test Fixture

1. Capture a real IAAI `/inventorySearch` API response (e.g., via browser DevTools)
2. Sanitize: remove personal account identifiers
3. Save to `tests/fixtures/iaai-search-response.json`
4. Reference in `tests/parser.test.ts` using `fs.readFileSync`

---

## 10. Cross-Package Change: Shared Normalizer Fix

Before implementing `iaai_search` and `iaai_get_listing`, apply this fix to ensure FR-015 compliance:

**File**: `packages/shared/src/normalizer/iaai.ts`  
**Change**: In `resolveTitleType()`, replace:
```typescript
return 'Unknown';
```
with:
```typescript
return `Unknown (${code})`;
```

Then rebuild `@car-auctions/shared` and update the normalizer test in `packages/shared/tests/normalizer.test.ts` to assert `"Unknown (XX)"` for unmapped codes.
