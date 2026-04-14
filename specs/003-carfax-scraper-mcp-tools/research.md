# Research: Carfax Scraper MCP Tools

**Feature**: `003-carfax-scraper-mcp-tools`  
**Phase**: 0 — Outline & Research  
**Date**: 2026-04-14  
**Status**: Complete

---

## Research Item 1 — Carfax report acquisition strategy

### Decision
Use Playwright-based authenticated navigation with network interception as the primary extraction path, and a parser fallback for stable report sections when interception is unavailable.

### Rationale
This aligns with the monorepo scraper architecture and constitution requirement to prefer interception over DOM scraping while retaining resilience.

### Alternatives considered
- DOM-only extraction: rejected due to fragility under layout changes.
- Direct unofficial API calls without browser context: rejected due to auth/session volatility.

---

## Research Item 2 — Session and authentication handling

### Decision
Authenticate with `CARFAX_EMAIL` and `CARFAX_PASSWORD`, persist reusable session state under package `data/`, and restore at startup to reduce repeated logins.

### Rationale
Persistent session reuse reduces bot-detection risk and aligns with scraper packages that persist browser auth state.

### Alternatives considered
- Login on every request: rejected as noisy and high-risk for detection/rate-limit triggers.
- In-memory-only sessions: rejected because restarts would force re-login bursts.

---

## Research Item 3 — Data shaping for report and summary tools

### Decision
Treat `carfax_get_report` as the source-of-truth payload and derive `carfax_get_summary` from normalized report fields in the same schema family.

### Rationale
Single-source normalization avoids duplicate parsing logic and keeps summary risk metrics consistent with full report output.

### Alternatives considered
- Independent summary scraper path: rejected due to duplicated extraction and drift risk.
- Only return unstructured raw report payloads: rejected because downstream analyzers need typed fields.

---

## Research Item 4 — Cache and stale fallback behavior

### Decision
Store report payloads in SQLite WAL with 30-day TTL (Carfax policy), and return stale cached payloads with `stale: true` and `cachedAt` when scraper calls fail.

### Rationale
This follows constitution stale-fallback guarantees and existing monorepo cache conventions.

### Alternatives considered
- No stale fallback: rejected because degraded-but-usable output is preferred over hard failure.
- Memory-only caching: rejected due to restart data loss and weak cross-invocation resilience.

---

## Research Item 5 — Validation, errors, and observability contract

### Decision
Validate VIN at tool boundary (17 chars, alphanumeric, no I/O/Q), map failures to typed errors only (`ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`), and emit one OTEL span per tool invocation with required attributes.

### Rationale
Directly required by constitution gates for safety, type consistency, and traceability.

### Alternatives considered
- Propagate raw/unknown exceptions: rejected due to contract inconsistency.
- Console-only logging: rejected for production observability requirements.
