<!--
Sync Impact Report
==================
Version change:    1.1.0 → 1.2.0 (MINOR bump — stability-first context management rule added to Pillar V)
Modified principles:
  - V.   Developer Experience & Consistency — Rule 6 added (stability-first context management)

Prior changes (1.0.0 → 1.1.0):
  - II.  Data Integrity & Caching — Rule 1 expanded with StaleableResponse<T> shape contract
  - III. Test-First Quality Standards — Rule 2 expanded with ≥ 80% branch coverage threshold
  - IV.  Performance & Reliability — Rule 5 added (30s/60s timeout SLAs)
  - V.   Developer Experience & Consistency — Rule 3 expanded with error→condition mapping table
  - Quality Gates — CI enforcement sentence added to preamble; Gate 8 (Observability) added
  - Governance — Amendment approval and deprecation policy bullets added
  - VI.  Observability & Traceability (new pillar)

Removed sections: None

Templates reviewed:
  ✅ .specify/templates/plan-template.md
       "Constitution Check" gate placeholder correctly defers to this file's
       Quality Gates section — no template changes required.
  ✅ .specify/templates/spec-template.md
       No constitution-specific sections; no changes required.
  ✅ .specify/templates/tasks-template.md
       Task categorization (setup, foundational, user-story phases) is compatible
       with all six pillars — no changes required.
  ✅ .specify/templates/constitution-template.md
       Source template; not modified.

Deferred TODOs: StaleableResponse<T> type definition — belongs in packages/shared/types via a future spec.md PR.
-->

# Car Auctions MCP Monorepo Constitution

## Core Principles

### I. Safety & Cost Controls

**Rationale**: Scrapers operate against hostile, detection-aware sites; NMVTIS bills
per query — unsupervised automation or misrouted calls incur real financial and legal risk.

**Rules**:

1. CAPTCHA detection MUST immediately throw `CaptchaError` and surface stale cached data.
   Attempting to solve a CAPTCHA in any form — programmatically or via a third-party
   service — is strictly forbidden.
   *(→ copilot-instructions.md § Anti-Bot Strategy, rule 6)*

2. `nmvtis_title_check` MUST only be invoked from the single-lot `analyze_vehicle` path.
   Calling it inside `scan_deals` or any batch loop is forbidden.
   *(→ copilot-instructions.md § Security § NMVTIS cost guard)*

3. Every MCP tool MUST validate inputs at the tool boundary before any downstream call,
   using exactly these rules:
   - VIN: exactly 17 alphanumeric characters; characters I, O, Q are rejected.
   - Lot number: alphanumeric characters only.
   - Zip code: exactly 5 numeric digits.
   *(→ copilot-instructions.md § Input Validation)*

4. Proxy configuration MUST come exclusively from `process.env.PROXY_URL`; hardcoded
   proxy addresses are forbidden. Proxy rotation MUST occur on connection failure.
   *(→ copilot-instructions.md § Security)*

**Violation examples**:

```typescript
// ❌ Solving a CAPTCHA
await page.fill('#captcha-input', await thirdPartySolver(imageData));

// ❌ NMVTIS called inside a batch scan
for (const lot of lots) {
  await nmvtisCheck(lot.vin); // inside scan_deals — forbidden
}

// ❌ VIN validation missing character rejection
if (vin.length === 17) { proceed(); } // does not reject I, O, Q
```

---

### II. Data Integrity & Caching

**Rationale**: Scrapers fail regularly; stale data is more useful than a hard error.
Consistent TTLs and safe SQL prevent cache corruption and injection vulnerabilities.

**Rules**:

1. On any scraper or upstream failure, the tool MUST return stale cached data with
   `stale: true` in the response payload when a cached entry exists, rather than
   throwing to the caller. The stale fallback payload MUST conform to the
   `StaleableResponse<T>` wrapper from `@car-auctions/shared`:
   `{ data: T; stale: boolean; cachedAt: string }` where `cachedAt` is an ISO 8601
   timestamp. Omitting `cachedAt` is a violation.
   *(→ coding-standards.md § Error Handling § Stale fallback pattern)*

2. Cache TTLs MUST match the following table exactly:

   | Data               | TTL     |
   |--------------------|---------|
   | Search results (LRU) | 15 min |
   | Listing details    | 1 hour  |
   | Images (disk)      | 24 hours |
   | Sold history       | 7 days  |
   | VIN decode         | 90 days |
   | Carfax reports     | 30 days |
   | NMVTIS results     | 30 days |
   | Part prices        | 7 days  |
   | Labor rates        | 30 days |
   | Market value       | 24 hours |
   | Transport estimates | 7 days |
   | Deal analysis      | 1 hour  |

   *(→ copilot-instructions.md § SQLite Caching)*

3. All SQLite queries MUST use `better-sqlite3` prepared statements.
   String interpolation into SQL is forbidden.
   *(→ coding-standards.md § SQL & Database Safety)*

4. In-memory LRU cache for search results MUST be capped at 200 entries.
   *(→ copilot-instructions.md § Tech Stack)*

**Violation examples**:

```typescript
// ❌ Hard failure instead of stale fallback
throw new ScraperError('Scraper failed'); // stale cache entry exists — must return it

// ❌ Wrong TTL
const LISTING_TTL_MS = 30 * 60 * 1000; // 30 min — spec requires 1 hour

// ❌ String-interpolated SQL
db.exec(`SELECT * FROM listings WHERE id = '${id}'`);

// ❌ Stale fallback missing cachedAt
return { ...listing, stale: true }; // must include cachedAt: new Date().toISOString()
```

---

### III. Test-First Quality Standards

**Rationale**: Parser and tool logic is fragile against site schema changes — fixture-driven
tests catch regressions before deployment. Vitest is the sole test runner for this project.

**Rules**:

1. Fixture HTML/JSON files MUST exist in `tests/fixtures/` before the corresponding parser
   is implemented. Tests MUST be written first, confirmed failing, then implementation begins.
   *(→ coding-standards.md § Testing Philosophy § Fixture-based)*

2. Every package MUST contain all applicable test layers before shipping. Additionally,
   unit test branch coverage MUST be ≥ 80% for all files under `src/tools/` and
   `src/scraper/parser.ts` in every package. This threshold does not apply to thin
   wrappers such as `index.ts` or `server.ts`.

   | Layer           | File                                | Package         |
   |-----------------|-------------------------------------|-----------------|
   | Parser          | `tests/parser.test.ts`              | each scraper    |
   | Tool (mocked)   | `tests/tools.test.ts`               | each scraper    |
   | Normalizer      | `packages/shared/tests/`            | shared          |
   | Fee calc        | `packages/deal-analyzer-mcp/tests/` | deal-analyzer   |
   | Scorer          | `tests/scorer.test.ts`              | deal-analyzer   |
   | Risk flags      | `tests/`                            | deal-analyzer   |
   | Priority queue  | `packages/shared/tests/`            | shared          |
   | Gateway router  | `packages/gateway-mcp/tests/`       | gateway         |
   | Alert triggers  | `alerts/tests/`                     | alerts          |

   *(→ copilot-instructions.md § Testing Strategy)*

3. Live/integration tests MUST use `{ skip: !process.env.LIVE_TEST }` and MUST NOT execute
   in CI pipelines.
   *(→ coding-standards.md § Testing Philosophy § Gate integration tests)*

4. Every error type (`ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`,
   `AnalysisError`) MUST have at least one test proving it produces the correct structured
   MCP error response.

5. Every input validation rule (VIN, lot number, zip code) MUST have tests covering:
   valid input, invalid input, and edge cases (e.g., VIN containing O/I/Q, 4-digit zip,
   lot with special characters).

**Violation examples**:

```typescript
// ❌ Parser implemented before fixtures exist
// tests/fixtures/copart-search.json does not exist — parser written anyway

// ❌ Live test missing CI guard
it('fetches real Copart listing', async () => {
  // No { skip: !process.env.LIVE_TEST } — this runs in CI
});
```

---

### IV. Performance & Reliability

**Rationale**: Auction sites aggressively block scrapers; exceeding rate limits triggers
account bans that defeat the entire anti-bot investment. DOM scraping is fragile —
structural stability requires preferring intercepted API responses.

**Rules**:

1. All scrapers MUST enforce a maximum of 1 request per 3 seconds, exponential backoff
   on HTTP 403 and 429 responses, and a daily hard cap of 500 requests per scraper instance.
   *(→ copilot-instructions.md § Anti-Bot Strategy, rule 5)*

2. Network API interception MUST be preferred over DOM scraping for all data extraction.
   DOM scraping is permitted only as a fallback; fallback code MUST handle schema changes
   gracefully without uncaught exceptions.
   *(→ copilot-instructions.md § Scraper Architecture)*

3. The stealth plugin (`puppeteer-extra-plugin-stealth`) MUST be active on every Playwright
   browser instance. Random delays of 2–5 seconds MUST be inserted between user-facing
   page actions.
   *(→ copilot-instructions.md § Anti-Bot Strategy, rules 1–2)*

4. Image assets MUST be resized and compressed via `sharp` before base64 encoding for MCP
   transport. Raw full-resolution images MUST NOT be base64-encoded inline.
   *(→ copilot-instructions.md § Tech Stack)*

5. Browser page navigation MUST set a hard timeout of 30 seconds
   (`page.goto(url, { timeout: 30_000 })`). MCP tool handlers MUST resolve within
   60 seconds; handlers that exceed this limit MUST return a structured `ScraperError`
   with code `TIMEOUT` rather than hanging indefinitely.
   *(→ Pillar V Rule 3 error mapping)*

**Violation examples**:

```typescript
// ❌ No rate limiting between requests
async function fetchListing(id: string) {
  return page.goto(`/lot/${id}`); // no delay, no daily cap
}

// ❌ DOM scraping when an interceptor already captures the data
const price = await page.$eval('.bid-price', el => el.textContent);

// ❌ Base64-encoding a raw buffer without sharp compression
const base64 = imageBuffer.toString('base64');

// ❌ Navigation with no timeout — hangs indefinitely on unresponsive page
await page.goto(url); // must be: page.goto(url, { timeout: 30_000 })
```

---

### V. Developer Experience & Consistency

**Rationale**: A uniform naming and type contract across all 7 MCP servers enables the
gateway to route predictably and gives AI consumers a stable, auditable interface.

**Rules**:

1. All MCP tool names MUST follow the `{source}_{action}` convention (snake_case).
   Deviating from the canonical list in copilot-instructions.md § MCP Tool Naming requires
   an explicit constitution amendment.
   *(→ copilot-instructions.md § Conventions § MCP Tool Naming)*

2. Shared types (`AuctionListing`, `DealAnalysis`, `RiskFlag`, etc.) MUST be imported
   exclusively from `@car-auctions/shared`. Defining equivalent types locally inside any
   package is forbidden.
   *(→ copilot-instructions.md § Shared Package Imports)*

3. All errors thrown or returned from tool handlers MUST be one of the five typed classes:
   `ScraperError | CaptchaError | RateLimitError | CacheError | AnalysisError`.
   Throwing bare `Error` instances or untyped objects from tool handlers is forbidden.
   The following canonical mapping determines which class applies to each condition:

   | Condition | Required Error Type |
   |---|---|
   | HTTP 429 or 403 response | `RateLimitError` |
   | CAPTCHA page detected | `CaptchaError` |
   | Playwright crash / navigation timeout / upstream 5xx | `ScraperError` |
   | SQLite read/write failure | `CacheError` |
   | Scoring / profit calc / vision analysis failure | `AnalysisError` |

   *(→ copilot-instructions.md § Error Types)*

4. All TypeScript MUST compile with `target: ES2022`, `module: Node16`, `strict: true`.
   ESLint flat config and Prettier MUST pass with zero errors or warnings before any PR
   merges.
   *(→ copilot-instructions.md § Tech Stack)*

5. Every MCP server package MUST follow the canonical directory layout:
   `src/{index.ts, server.ts, tools/, scraper/, cache/, utils/, types/index.ts}`.
   New top-level source directories require explicit justification in the PR.
   *(→ copilot-instructions.md § Package Structure Pattern)*

6. **Don't break what works — stability-first context management**: Established, working
   patterns MUST NOT be refactored, renamed, restructured, or replaced unless explicitly
   requested by the developer or required by a constitution amendment. This includes:
   - Existing file and directory structures that follow the canonical layout.
   - Established naming conventions already in use across the codebase.
   - Working scraper architectures (browser → client → interceptor → parser).
   - Cache layer implementations with correct TTLs.
   - Test fixtures and test structure that currently pass.
   - Anti-bot strategy configurations already deployed.
   - Error handling patterns that conform to Pillar V Rule 3.

   When making changes, the scope MUST be limited to what is explicitly requested.
   "Drive-by" refactors — renaming, restructuring, or "improving" adjacent working
   code as part of an unrelated task — are forbidden. If a structural improvement is
   identified, it MUST be proposed as a separate, reviewed change and MUST NOT be
   bundled silently into an unrelated task or PR.
   *(→ Governance § Context management)*

**Violation examples**:

```typescript
// ❌ Non-standard tool name
server.tool('getCopartLot', ...); // must be: copart_get_listing

// ❌ Local type redefinition
// In iaai-scraper-mcp/src/types/index.ts:
interface AuctionListing { lotId: string; ... } // import from @car-auctions/shared instead

// ❌ Bare Error thrown from a tool handler
throw new Error('Rate limit exceeded'); // must be: throw new RateLimitError(...)

// ❌ 429 mapped to the wrong error class
if (response.status === 429) throw new ScraperError('too many requests');
// must be: throw new RateLimitError('too many requests')

// ❌ Unsolicited refactor during an unrelated task
// Task: "Add timeout to copart_get_listing"
// Developer also renames parser functions and restructures return types — forbidden

// ❌ Replacing established error pattern with unrequested alternative
// Working: throw new RateLimitError('...')
// Changed to: return Result.err(new RateLimitError('...')) — not requested, forbidden

// ❌ Reorganizing passing tests into a "better" structure during a bug fix
// tests/parser.test.ts split into tests/parser/{search,listing,images}.test.ts
// without explicit request — forbidden
```

---

### VI. Observability & Traceability

**Rationale**: `@opentelemetry/sdk-node` with an OTLP exporter is part of the tech stack,
but the v1.0.0 constitution imposed no tracing requirements. Without enforcement, production
failures are invisible until they surface in user-visible errors.

**Rules**:

1. Every MCP tool invocation MUST be wrapped in an OpenTelemetry span. The span MUST set
   the following attributes before closing:
   - `tool.name` — the canonical MCP tool name (e.g., `copart_get_listing`)
   - `tool.status` — `"ok"` or `"error"`
   - `tool.duration_ms` — wall-clock milliseconds for the invocation
   *(→ copilot-instructions.md § Tech Stack)*

2. On error, `span.setStatus({ code: SpanStatusCode.ERROR, message })` MUST be called.
   Raw stack traces MUST NOT be attached to spans or exported to the OTLP backend.
   *(→ coding-standards.md § Error Handling § Never leak internals)*

3. Spans MUST be exported via the configured OTLP exporter. Using `console.log` or
   `console.error` as the sole observability mechanism is forbidden in production builds.
   Development-mode console output is acceptable when `NODE_ENV !== 'production'`.
   *(→ copilot-instructions.md § Tech Stack)*

**Violation examples**:

```typescript
// ❌ Tool handler with no span — failure is invisible to tracing backend
export async function copartGetListing(lotId: string) {
  return scraper.fetch(lotId); // no span wrapper
}

// ❌ Stack trace attached to span — leaks internal paths
span.setAttribute('error.stack', error.stack);

// ❌ Console-only observability in production
console.error('Tool failed:', error); // no span status set, not exported via OTLP
```

## Quality Gates

Every pull request MUST satisfy all of the following before merge. All gates MUST be
enforced by the CI pipeline (GitHub Actions). Pull requests failing any gate MUST be
blocked from merge via branch protection rules.

- **Gate 1 – Safety**: No CAPTCHA-solving code present; NMVTIS called only from `analyze_vehicle`.
- **Gate 2 – Validation**: All MCP tool inputs validated at tool boundary per Pillar I rules.
- **Gate 3 – Cache**: SQLite WAL mode confirmed; TTLs match Pillar II table; stale fallback present with `cachedAt`.
- **Gate 4 – Tests**: All mandatory test layers present per Pillar III table; live tests gated by `LIVE_TEST`; branch coverage ≥ 80% on `tools/` and `parser.ts` files.
- **Gate 5 – Rate Limits**: Rate limiter active on all scrapers; 1 req/3s, 500/day cap, backoff on 4xx.
- **Gate 6 – Types**: No bare `Error` throws from handlers; no local type redefinitions; `@car-auctions/shared` used exclusively; error→condition mapping followed.
- **Gate 7 – Build**: `tsc --noEmit` and ESLint pass with zero errors or warnings.
- **Gate 8 – Observability**: OTEL spans emitted for all tool invocations with required attributes; spans exported via OTLP; no `console`-only observability in production builds.
- **Gate 9 – Stability**: No unsolicited refactors of working patterns; change scope matches task scope; established conventions preserved per Pillar V Rule 6.

## Governance

- This constitution supersedes all other project-level practices. Conflicts with lower-level
  documents resolve in favor of this constitution.
- Amendments MUST include: (1) clear rationale, (2) version bump per the rules below,
  (3) propagation to affected templates, (4) a commit message referencing the new version.
- Amendments require at least one maintainer approval in a pull request before merge.
- **MAJOR** bump: a principle is removed, renamed, or made backward-incompatible.
- **MINOR** bump: a new principle or section is added, or existing content materially expanded.
- **PATCH** bump: clarification, wording fix, or non-semantic refinement.
- Deprecating a rule without removing it is a PATCH bump. Removing a deprecated rule is a MAJOR bump.
- All PRs MUST be verified against the Quality Gates section above.
- Canonical sources of truth for project conventions:
  `.github/copilot-instructions.md` and `.github/copilot-shared/instructions/coding-standards.md`.

**Version**: 1.2.0 | **Ratified**: 2026-04-06 | **Last Amended**: 2026-04-06
