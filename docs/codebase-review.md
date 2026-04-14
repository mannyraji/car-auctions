# Codebase Review

**Date:** 2026-04-14
**Scope:** Full monorepo (`packages/shared`, `packages/copart-scraper-mcp`, `packages/iaai-scraper-mcp`)
**Revision:** Post-Phase 3 (IAAI scraper merge, PR #62)

---

## Executive Summary

The car-auctions monorepo is a well-architected TypeScript project with clean package boundaries, a comprehensive type system, and strong tooling (ESLint 9, Vitest, Husky, Dependabot). The codebase has zero npm audit vulnerabilities and nearly zero TODO/FIXME markers in production code.

The primary concern is **code duplication between the Copart and IAAI scraper packages**. Five utility files are near-identical copies with the IAAI versions consistently more robust. This creates a maintenance burden where bug fixes must be applied twice and quality diverges over time. The Copart package also has significantly lower test coverage than IAAI.

### Top 3 Priorities

1. **Consolidate duplicated utilities** into `@car-auctions/shared` (~400 LOC reduction)
2. **Backport IAAI's MemoryCache fixes** to Copart (eviction guard + consistent return types)
3. **Close Copart's test coverage gap** (3 test files vs IAAI's 12)

---

## Findings

### P0 - Code Duplication Across Scraper Packages (HIGH)

Five files are near-identical between `copart-scraper-mcp` and `iaai-scraper-mcp`. In every case, the IAAI version is the more robust implementation:

| File | Copart LOC | IAAI LOC | Key Difference |
|------|-----------|----------|----------------|
| `utils/config.ts` | 139 | 138 | Only the type name differs (`CopartConfig` vs `IaaiConfig`). Identical Zod schemas, defaults, loader logic |
| `cache/memory.ts` | 79 | 75 | Copart returns `T \| null`, IAAI returns `T \| undefined`. IAAI has LRU eviction guard (see P1) |
| `cache/image-cache.ts` | 53 | 53 | Only the file extension differs (`.jpg` vs `.webp`). Logic is byte-for-byte identical |
| `utils/rate-limiter.ts` | 80 | 85 | IAAI respects server `Retry-After` headers and reads defaults from config file (see P4) |
| `utils/stealth.ts` | 47 | 175 | IAAI has injectable timers for testing, configurable constants, DOM selector CAPTCHA detection, async API |

**Impact:** Bug fixes must be applied in both packages. Quality has already diverged (Copart's `memory.ts` has a bug that IAAI's version fixed). Future scraper packages (Carfax, parts pricing) would add more copies.

**Recommendation:** Extract a shared base into `@car-auctions/shared`, parameterized where needed (e.g., image file extension passed to `ImageCache` constructor). Use IAAI's implementations as the baseline.

**Files:**
- `packages/copart-scraper-mcp/src/utils/config.ts` vs `packages/iaai-scraper-mcp/src/utils/config.ts`
- `packages/copart-scraper-mcp/src/cache/memory.ts` vs `packages/iaai-scraper-mcp/src/cache/memory.ts`
- `packages/copart-scraper-mcp/src/cache/image-cache.ts` vs `packages/iaai-scraper-mcp/src/cache/image-cache.ts`
- `packages/copart-scraper-mcp/src/utils/rate-limiter.ts` vs `packages/iaai-scraper-mcp/src/utils/rate-limiter.ts`
- `packages/copart-scraper-mcp/src/utils/stealth.ts` vs `packages/iaai-scraper-mcp/src/utils/stealth.ts`

---

### P1 - MemoryCache Inconsistency (HIGH)

The two `MemoryCache` implementations have diverged in ways that break interface consistency and introduce a subtle bug in Copart's version.

**Return type mismatch:**
- `packages/copart-scraper-mcp/src/cache/memory.ts:22` - `get()` returns `T | null`
- `packages/iaai-scraper-mcp/src/cache/memory.ts:22` - `get()` returns `T | undefined`

**Unnecessary LRU eviction on update (Copart bug):**
```typescript
// packages/copart-scraper-mcp/src/cache/memory.ts:33-37
set(key: string, value: T): void {
  this.evictExpired();
  if (this.store.size >= this.maxEntries) {  // BUG: evicts even when updating existing key
    this.evictLru();
  }
```
vs the correct IAAI version:
```typescript
// packages/iaai-scraper-mcp/src/cache/memory.ts:33-36
set(key: string, value: T): void {
  this.evictExpired();
  if (this.store.size >= this.maxEntries && !this.store.has(key)) {  // CORRECT: skips eviction on update
    this.evictLru();
  }
```

When updating an existing key at full capacity, Copart's version unnecessarily evicts the oldest entry first. This degrades cache hit rates under load.

**Missing method:** Copart has a `has()` method; IAAI does not.

**Recommendation:** Create a single `MemoryCache<T>` in `@car-auctions/shared` with:
- Consistent `T | undefined` return type (aligns with `Map.get()` semantics)
- The `!this.store.has(key)` eviction guard
- The `has()` convenience method

---

### P2 - Fire-and-Forget Authentication with Silent Failures (MEDIUM)

`packages/iaai-scraper-mcp/src/scraper/browser.ts:190-206`:
```typescript
page.on('response', (response) => {
  try {
    const parsed = new URL(response.url());
    const isLoginRedirect =
      parsed.hostname === 'www.iaai.com' && parsed.pathname === '/Account/Login';
    if (!isLoginRedirect || this._reauthing) return;

    const email = process.env['IAAI_EMAIL'];
    const password = process.env['IAAI_PASSWORD'];
    if (email && password) {
      this._reauthing = true;
      this.authenticate(email, password)
        .catch(() => {})           // errors silently swallowed
        .finally(() => {
          this._reauthing = false;
        });
    }
  } catch {
    // Ignore malformed URLs
  }
});
```

**Issues:**
1. **Silent error swallowing:** `.catch(() => {})` discards all auth failures without logging or telemetry. If auth fails repeatedly, there is no observable signal.
2. **Scattered credential reads:** `process.env['IAAI_EMAIL']` and `process.env['IAAI_PASSWORD']` are read at three separate locations:
   - `packages/iaai-scraper-mcp/src/bootstrap.ts` (line 56-57)
   - `packages/iaai-scraper-mcp/src/scraper/browser.ts` (line 198-199)
   - `packages/iaai-scraper-mcp/src/scraper/iaai-client.ts` (referenced in image error recovery)
3. **Race condition potential:** The `_reauthing` boolean flag prevents concurrent auth attempts but isn't fully safe - if `authenticate()` throws synchronously before setting internal state, the flag could get stuck.

**Recommendation:**
- Replace `.catch(() => {})` with `.catch((err) => console.warn('[iaai] re-auth failed:', err.message))`
- Read credentials once at startup (already done in `bootstrap.ts`) and inject them via the `IaaiBrowser` constructor
- Consider replacing the boolean flag with a promise-based mutex

---

### P3 - Copart Test Coverage Gap (MEDIUM)

Test file comparison:

| Component | Copart | IAAI |
|-----------|--------|------|
| config | `config.test.ts` | `config.test.ts` (via bootstrap) |
| parser | `parser.test.ts` | `parser.test.ts` |
| tools | `tools.test.ts` | `tool-response.test.ts` |
| browser | -- | `browser.test.ts` |
| interceptor | -- | `interceptor.test.ts` |
| sqlite cache | -- | `sqlite.test.ts` |
| memory cache | -- | `memory.test.ts` |
| rate limiter | -- | `rate-limiter.test.ts` |
| stealth | -- | `stealth.test.ts` |
| image cache | -- | `image-cache.test.ts` |
| image utils | -- | `image-utils.test.ts` |
| bootstrap | -- | `bootstrap.test.ts` |

Copart has **3 test files (~628 LOC)** vs IAAI's **12 test files (~2,848 LOC)**. The 80% coverage threshold in `vitest.config.ts` may not be enforced effectively for Copart since many modules lack any test coverage.

**Recommendation:** Port IAAI's test patterns to Copart, prioritizing:
1. `sqlite.test.ts` - most complex caching logic with TTL and watchlist
2. `rate-limiter.test.ts` - critical for respecting auction site limits
3. `browser.test.ts` - browser lifecycle, stealth plugin application, proxy handling

---

### P4 - Copart Rate Limiter Ignores Retry-After (LOW-MEDIUM)

`packages/copart-scraper-mcp/src/utils/rate-limiter.ts:54-62`:
```typescript
catch (err) {
  if (err instanceof RateLimitError) {
    this.currentBackoffMs = Math.min(
      (this.currentBackoffMs || 1000) * this.backoffMultiplier,
      this.maxBackoffMs
    );
  }
  throw err;
}
```

vs `packages/iaai-scraper-mcp/src/utils/rate-limiter.ts:55-67`:
```typescript
catch (err) {
  if (err instanceof RateLimitError) {
    const computedBackoffMs = this.currentBackoffMs
      ? this.currentBackoffMs * this.backoffMultiplier
      : 3000;
    const retryAfterMs = err.retryAfterMs ?? 0;
    this.currentBackoffMs = Math.min(
      Math.max(computedBackoffMs, retryAfterMs),
      this.maxBackoffMs
    );
  }
  throw err;
}
```

**Differences:**
1. Copart starts backoff at **1,000ms**; IAAI starts at **3,000ms** (more conservative, less likely to trigger further rate limiting)
2. Copart **ignores `err.retryAfterMs`** entirely, potentially retrying before the server allows
3. Copart **hardcodes defaults** in the constructor; IAAI reads from `config.rateLimit`

**Recommendation:** Adopt IAAI's backoff logic for both packages. The `Math.max(computedBackoffMs, retryAfterMs)` pattern ensures the limiter always respects server-specified retry delays.

---

### P5 - Unused Exports and Dead Code (LOW)

**`getBrowserInstance()` singleton - never imported:**
`packages/iaai-scraper-mcp/src/scraper/browser.ts:239-244`
```typescript
export function getBrowserInstance(): IaaiBrowser {
  if (!_instance) {
    _instance = new IaaiBrowser();
  }
  return _instance;
}
```
This singleton factory is exported but never imported anywhere in the codebase. The entry point (`index.ts`) creates `IaaiBrowser` instances directly.

**Unused BrowserPool methods:**
`packages/shared/src/browser-pool/index.ts` exports `releaseContext()` and `acquireContext()` methods that have zero references in the codebase. Only `acquire()` and `release()` are used.

**Recommendation:** Remove unused exports, or if intended for future use, add a `@internal` JSDoc tag and an explanatory comment.

---

### P6 - Session Files Stored Unencrypted (LOW)

- `packages/iaai-scraper-mcp/data/iaai-session.json` stores cookies and localStorage data as plaintext JSON
- Session files include auth tokens that could grant account access
- Files are `.gitignore`d and local-only, limiting exposure

**Recommendation:** Accepted risk for local development. For Phase 9 (Docker deployment), consider:
- Encrypting session files at rest with a key from environment
- Using OS keychain integration
- Setting restrictive file permissions (0600)

---

## Strengths

The codebase demonstrates strong engineering practices across several dimensions:

**Architecture:**
- Clean monorepo structure with well-defined package boundaries
- Consistent scraper pipeline: Browser -> Interceptor -> Parser -> Normalizer -> Cache
- Multi-layer caching hierarchy (memory LRU -> SQLite -> disk image cache)
- Three transport modes for MCP servers (stdio, SSE, WebSocket)

**Type Safety:**
- TypeScript strict mode across all packages
- 386-line shared type definitions covering all domain models
- Zod validation on all MCP tool inputs with bounded ranges (year: 1900-2100, query: max 200 chars, results: 1-100)
- Public API contract tests verify all type exports compile correctly

**Error Handling:**
- Sophisticated error hierarchy (`ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`, `AnalysisError`)
- Each error type carries retryability semantics and serializes to MCP `ToolError` shape
- Stale cache fallback pattern: returns cached data on scraper failure with `stale: true` flag

**Quality Tooling:**
- ESLint 9 (flat config) with TypeScript strict rules
- Prettier with pre-commit enforcement via Husky + lint-staged
- Pre-push TypeScript type checking across all workspaces
- Vitest with 80% coverage thresholds (branches, functions, lines, statements)
- GitHub Actions CI: build, test, lint, format check on every PR
- Automated PR code review, security scanning, and coverage reporting
- Dependabot with weekly schedule and grouped updates

**Security:**
- 0 npm audit vulnerabilities
- Input validation with bounded Zod schemas (no unbounded string inputs)
- Parameterized SQL queries throughout (no string interpolation)
- Rate limiting with daily caps and exponential backoff
- Anti-detection stealth plugin with CAPTCHA detection
- Credential validation at startup (`assertRequiredCredentials()` in IAAI)

**Observability:**
- OpenTelemetry integration with opt-in OTLP export
- Structured tool response envelope (`success`, `data`, `error`, `cached`, `stale`, `cachedAt`, `timestamp`)

---

## Recommendations Summary

| Priority | Finding | Effort | Impact | Action |
|----------|---------|--------|--------|--------|
| P0 | Code duplication (5 files) | M | High | Extract to `@car-auctions/shared` |
| P1 | MemoryCache inconsistency + bug | S | High | Unify with IAAI's corrected version |
| P2 | Silent auth failures | S | Medium | Add logging, centralize credentials |
| P3 | Copart test coverage gap | L | Medium | Port IAAI test patterns |
| P4 | Rate limiter ignores Retry-After | S | Medium | Adopt IAAI's backoff logic |
| P5 | Unused exports | S | Low | Remove or mark internal |
| P6 | Unencrypted session files | S | Low | Document as accepted risk, defer to Phase 9 |

**Effort key:** S = < 1 hour, M = 1-4 hours, L = 4+ hours
