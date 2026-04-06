# Implementation Plan: 001-shared-utilities-lib

**Branch**: `001-shared-utilities-lib` | **Date**: 2026-04-06 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `specs/001-shared-utilities-lib/spec.md`

## Summary

Bootstrap the `@car-auctions/shared` npm workspace package — a zero-side-effect TypeScript utility library that provides the common foundation every other monorepo package depends on. It delivers: shared type definitions (`AuctionListing`, `DealAnalysis`, `ToolResponse`, et al.), typed error classes, a Copart/IAAI auction normalizer, a NHTSA vPIC VIN decoder with 90-day SQLite caching, an MCP server bootstrap helper (stdio/SSE/WebSocket transports), a Playwright browser pool with stealth and proxy support, a five-level priority queue with token-bucket rate limiting and starvation prevention, and an OpenTelemetry tracing module that is a complete no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset.

This feature also establishes the monorepo skeleton itself: root `package.json` with npm workspaces, `tsconfig.base.json`, root ESLint/Prettier config, and `.gitignore` entries — the CI scaffold all downstream packages will inherit.

## Technical Context

**Language/Version**: TypeScript 5.8.x, Node.js 20+  
**Primary Dependencies**: `@modelcontextprotocol/sdk` ^1.29.0, `playwright` ^1.59.1, `playwright-extra` ^4.3.6, `puppeteer-extra-plugin-stealth` ^2.11.2, `better-sqlite3` ^12.8.0, `sharp` ^0.34.5, `@opentelemetry/sdk-node` ^0.214.0, `@opentelemetry/exporter-trace-otlp-http` ^0.214.0, `ws` ^8.x  
**Storage**: SQLite (WAL mode) via `better-sqlite3` for VIN cache; in-memory LRU fallback for tests  
**Testing**: Vitest ^4.1.2 — unit tests in `packages/shared/tests/`  
**Target Platform**: Node.js 20+ on Linux (CI: ubuntu-latest); no browser/DOM target  
**Project Type**: Shared npm workspace library (not a standalone CLI or server)  
**Performance Goals**: VIN decode ≤ 2s first call; ≤ 10ms cached. Priority-queue `critical` dispatch ≤ 100ms. OTEL tracing adds < 5% latency overhead.  
**Constraints**: Zero runtime dependencies outside the allow-list in NFR-002. Named exports only (tree-shakeable). TypeScript `strict: true`. `module: Node16` requires `.js` extensions on all relative imports in source.  
**Scale/Scope**: Single shared package consumed by 8 downstream packages; ~1 500 LOC source across 7 modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — all gates remain green.*

| Gate | Status | Notes |
|------|--------|-------|
| **Gate 1 – Safety** | ✅ PASS | No scraping, no CAPTCHA code, no NMVTIS calls in this package. `CaptchaError` class is defined here but never invoked. |
| **Gate 2 – Validation** | ✅ PASS | `validateVin` enforces exactly 17 alphanumeric chars, rejects I/O/Q per constitution Pillar I Rule 3. Lot number and zip code validators are thin helpers exposed for consumers. |
| **Gate 3 – Cache** | ✅ PASS | SQLite opened in WAL mode (`PRAGMA journal_mode=WAL`). VIN decode TTL = 90 days (matches Pillar II table). `StaleableResponse<T>` wrapper defined here with `cachedAt: string` (ISO 8601). |
| **Gate 4 – Tests** | ✅ PASS | Constitution table requires normalizer and priority-queue tests in `packages/shared/tests/`. Both are included in this feature's test plan. Branch coverage ≥ 80% target on all non-thin-wrapper files. |
| **Gate 5 – Rate Limits** | ✅ PASS | `PriorityQueue` encapsulates the token-bucket: 1 req/3 s default, configurable. All scrapers will import this; the rate limit lives here. |
| **Gate 6 – Types** | ✅ PASS | This package IS the source of truth for all shared types. No local redefinitions by definition. Error→condition mapping table from constitution implemented in the five error classes. |
| **Gate 7 – Build** | ✅ PASS | `tsc --noEmit` + ESLint flat config + Prettier enforced. Package `build` script runs `tsc -p tsconfig.json`. |
| **Gate 8 – Observability** | ✅ PASS | `withSpan` wrapper requires `tool.name`, `tool.status`, `tool.duration_ms`. `initTracing` exports OTLP or no-ops. No console-only observability path. |

## Project Structure

### Documentation (this feature)

```text
specs/001-shared-utilities-lib/
├── plan.md              ← this file
├── research.md          ← Phase 0 output
├── data-model.md        ← Phase 1 output
├── quickstart.md        ← Phase 1 output
├── contracts/
│   └── public-api.ts    ← Phase 1 output (canonical export surface)
└── tasks.md             ← Phase 2 output (generated separately by /speckit.tasks)
```

### Source Code (repository root)

```text
/                                        ← repo root
├── package.json                         ← NEW: npm workspaces root (private)
├── tsconfig.base.json                   ← NEW: shared TS config (ES2022, Node16, strict)
├── eslint.config.mjs                    ← NEW: ESLint flat config (shared rules)
├── .prettierrc                          ← NEW: Prettier config
├── .gitignore                           ← NEW/UPDATE: node_modules, dist, data/
└── packages/
    └── shared/                          ← NEW: the package delivered by this feature
        ├── package.json                 ← name: "@car-auctions/shared"
        ├── tsconfig.json                ← extends ../../tsconfig.base.json
        ├── vitest.config.ts
        ├── src/
        │   ├── index.ts                 ← public re-export barrel (named exports only)
        │   ├── types/
        │   │   └── index.ts             ← ALL shared interfaces & type aliases
        │   ├── errors.ts                ← ScraperError, CaptchaError, RateLimitError,
        │   │                               CacheError, AnalysisError
        │   ├── normalizer.ts            ← normalizeCopart, normalizeIaai
        │   ├── vin-decoder.ts           ← decodeVin, validateVin, VinCache interface,
        │   │                               SqliteVinCache, MemoryVinCache
        │   ├── mcp-helpers.ts           ← createMcpServer, McpServerOptions
        │   ├── browser-pool.ts          ← BrowserPool, BrowserPoolOptions
        │   ├── priority-queue.ts        ← PriorityQueue, PriorityLevel, PriorityRequest,
        │   │                               TokenBucket (internal)
        │   └── tracing.ts               ← initTracing, withSpan, SpanAttributes
        ├── tests/
        │   ├── normalizer.test.ts
        │   ├── vin-decoder.test.ts
        │   ├── errors.test.ts
        │   ├── priority-queue.test.ts
        │   ├── tracing.test.ts
        │   └── fixtures/
        │       ├── copart-raw.json       ← sample CopartRawListing
        │       └── iaai-raw.json         ← sample IaaiRawListing
        └── data/                         ← runtime SQLite (gitignored)
```

**Structure Decision**: Single library package inside `packages/shared/`. The canonical MCP server package structure (from copilot-instructions) does not apply here — `shared` has no `scraper/`, `cache/`, or `tools/` directories; those layers are implemented in each MCP package. Source modules are flat files under `src/` rather than subdirectories, keeping the package shallow and import paths short.

## Module Design Decisions

### Decision 1: `module: Node16` vs `moduleResolution: Bundler`

**Chosen**: `module: Node16` with explicit `.js` extensions on all relative imports.  
**Rationale**: Matches the constitution (Pillar V Rule 4 mandates `module: Node16`). The CI workflow runs `tsc` directly without a bundler, so Node16 is the correct resolution mode for the runtime.  
**Implication**: Every relative import in `src/` must use the `.js` extension at source (TypeScript resolves `.ts` files, emits `.js`). E.g., `import { normalizeCopart } from './normalizer.js'`.

### Decision 2: WebSocket Transport Strategy

**Chosen**: Custom `WebSocketServerTransport` class implementing the MCP SDK `Transport` interface, built on top of the `ws` package.  
**Rationale**: `@modelcontextprotocol/sdk` v1.29.0 provides `StdioServerTransport` and `SSEServerTransport` natively. WebSocket is not bundled. The spec and constitution reference WebSocket transport (gateway-mcp uses it for real-time bid streaming). The custom wrapper is ~80 LOC and has no coupling to the rest of the library.  
**Alternative rejected**: Dropping WebSocket in favour of Streamable HTTP — ruled out because the gateway spec and watchlist bid protocol explicitly require WebSocket.

### Decision 3: VIN Cache Interface Injection

**Chosen**: `decodeVin(vin, cache?: VinCache)` — cache is an optional injected dependency.  
**Rationale**: The spec assumption states "VIN caching is handled by consumers via their own SQLite cache layers." The decoder provides a `SqliteVinCache` convenience class (WAL mode, stored at `data/vin-cache.sqlite`) and a `MemoryVinCache` for unit tests. When no cache is passed, decoding proceeds without caching.  
**Alternative rejected**: Making the decoder always open its own SQLite database — rejected because each scraper package manages its own `data/` directory.

### Decision 4: Browser Pool Singleton Pattern

**Chosen**: `BrowserPool` is a regular class (not a module-level singleton). Consumers decide whether to share an instance.  
**Rationale**: The spec edge case requires shutdown to be idempotent and reference-counted. A class instance lets consumers call `pool.acquire()` / `pool.release()` and `pool.shutdown()`. The scraper packages that run in-process share the same instance by passing it around; each process creates at most one.  
**Alternative rejected**: Module-level singleton — rejected because it makes unit testing impossible without mocking module state.

### Decision 5: Monorepo Root Scripts

**Chosen**: Root `package.json` contains no `build/lint/test` scripts of its own; CI runs `npm run --workspaces --if-present build` which delegates to each workspace.  
**Rationale**: The CI workflow explicitly uses `--workspaces --if-present`. The root package never runs its own build. Keeping root scripts absent avoids confusion and matches the `--if-present` contract.

## Implementation Phases

### Phase A — Monorepo Scaffold (prerequisite, no source code)

Sets up the files required for `npm ci` to succeed and for downstream packages to be added:

1. Root `package.json` (workspaces, `"private": true`, devDependencies: `typescript`, `eslint`, `prettier`)
2. `tsconfig.base.json` (ES2022, Node16, strict, declaration, declarationMap, sourceMap)
3. `eslint.config.mjs` (ESLint flat config, `@typescript-eslint`, Prettier plugin)
4. `.prettierrc`
5. `.gitignore` additions (`packages/*/dist`, `packages/*/data`, `node_modules`)

### Phase B — Package Scaffold

1. `packages/shared/package.json` (`@car-auctions/shared`, `"type": "module"`, exports, scripts: build/lint/test)
2. `packages/shared/tsconfig.json` (extends base, `outDir: dist`, `rootDir: src`)
3. `packages/shared/vitest.config.ts`

### Phase C — Types & Errors (no external dependencies)

1. `src/types/index.ts` — all interface and type alias definitions
2. `src/errors.ts` — five error classes extending `Error` with `code`, `message`, `retryable`

### Phase D — Auction Normalizer

1. Internal IAAI title code map
2. `normalizeCopart(raw: CopartRawListing): AuctionListing`
3. `normalizeIaai(raw: IaaiRawListing): AuctionListing`
4. Tests + fixtures

### Phase E — VIN Decoder

1. `validateVin(vin: string): boolean`
2. `decodeVin(vin: string, cache?: VinCache): Promise<ToolResponse<VINDecodeResult>>`
3. `SqliteVinCache` (WAL, 90-day TTL)
4. `MemoryVinCache` (for tests)
5. Tests

### Phase F — MCP Helpers

1. `createMcpServer(options: McpServerOptions): Promise<void>` — selects transport by env/param
2. `StdioServerTransport` (SDK-native)
3. `SSEServerTransport` (SDK-native, requires Express)
4. `WebSocketServerTransport` (custom, using `ws`)
5. Integration tests (stub server + transport)

### Phase G — Browser Pool

1. `BrowserPool` class with `acquire()`, `release()`, `shutdown()`
2. Stealth plugin integration
3. Proxy config from `PROXY_URL`
4. Reference counting for idempotent shutdown
5. Tests

### Phase H — Priority Queue

1. `TokenBucket` (internal, not exported) — continuous refill model
2. `PriorityQueue` class with five-level ordering and starvation prevention
3. Tests (ordering, preemption, starvation guarantee, rate limit respect)

### Phase I — OpenTelemetry Tracing

1. `initTracing(serviceName: string): void` — OTLP when env set, no-op otherwise
2. `withSpan<T>(name: string, attrs: SpanAttributes, fn: () => Promise<T>): Promise<T>`
3. Error status handling (`SpanStatusCode.ERROR`, no stack trace on span)
4. Tests with mock exporter

### Phase J — Public Barrel & Final Build

1. `src/index.ts` re-exports — exactly the surface defined in spec § Public API Surface
2. `npm run build` passes
3. `npm run lint` passes
4. `npm run test` passes (all tests green, ≥ 80% branch coverage on non-wrapper files)
