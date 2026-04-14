# Feature Specification: Carfax Scraper MCP Tools

**Feature Branch**: `003-carfax-scraper-mcp-tools`  
**Created**: 2026-04-14  
**Status**: Draft  
**Input**: User description: "Carfax Scraper MCP tools"

## Clarifications

### Session 2026-04-14

- Q: How should Carfax session/auth artifacts be persisted at rest? → A: Option B — encrypt persisted session/auth artifacts at rest with a managed key.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fetch full Carfax history by VIN (Priority: P1)

As a vehicle flipper, I need a full Carfax report for a VIN so I can evaluate title, accident, service, and ownership risk before bidding.

**Why this priority**: This is the core Carfax capability and the highest-value input to downstream deal analysis.

**Independent Test**: Call `carfax_get_report` with a valid VIN and verify a structured report is returned with expected sections and typed fields.

**Acceptance Scenarios**:

1. **Given** a valid 17-character VIN, **When** `carfax_get_report` is called, **Then** the tool returns a structured report including ownership, accident, title, service, odometer, and key damage flags.
2. **Given** a VIN with a fresh cache entry, **When** `carfax_get_report` is called, **Then** the response is served from cache without scraper navigation.

---

### User Story 2 - Fetch quick risk summary by VIN (Priority: P2)

As a vehicle flipper, I need a lightweight Carfax summary so I can quickly triage many listings before deeper analysis.

**Why this priority**: Summary enables fast screening but depends on the full report model from P1.

**Independent Test**: Call `carfax_get_summary` with a valid VIN and verify risk summary fields are returned with correct types.

**Acceptance Scenarios**:

1. **Given** a valid VIN with available history, **When** `carfax_get_summary` is called, **Then** the tool returns `total_accidents`, `title_issues`, `owner_count`, `last_odometer`, `open_recalls`, and `overall_risk_rating`.
2. **Given** a stale cache entry and transient scraper failure, **When** `carfax_get_summary` is called, **Then** stale data is returned with `stale: true` and `cachedAt`.

---

### User Story 3 - Safe and resilient scraper behavior (Priority: P3)

As a maintainer, I need Carfax tool behavior to follow anti-bot, validation, caching, and error contracts so operations stay reliable and safe.

**Why this priority**: Operational safety and consistency are required for CI gates and production stability.

**Independent Test**: Run tool/unit/parser tests that verify validation, error mapping, stale fallback behavior, and cache TTL handling.

**Acceptance Scenarios**:

1. **Given** invalid VIN input, **When** either Carfax tool is called, **Then** the request is rejected at tool boundary with structured error output.
2. **Given** CAPTCHA detection or 403/429 responses, **When** Carfax scraping runs, **Then** typed errors are returned (`CaptchaError`/`RateLimitError`) with no CAPTCHA-solving attempts.

---

### Edge Cases

- VIN contains forbidden characters (`I`, `O`, `Q`) or wrong length.
- Carfax session expires mid-request and requires re-authentication.
- Carfax response has partial/missing sections (e.g., no service records).
- Cached record exists but is expired while upstream is temporarily unavailable.
- Request volume approaches daily cap and must return `RateLimitError` if no stale fallback exists.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose MCP tools `carfax_get_report` and `carfax_get_summary` following `{source}_{action}` naming.
- **FR-002**: Both tools MUST validate VIN at tool boundary (17 alphanumeric chars, reject `I/O/Q`) before scraper or cache calls.
- **FR-003**: `carfax_get_report` MUST return a structured report including ownership history, accident history, title history, service records, odometer readings, recall status, structural/flood/lemon flags, and airbag deployment indicator when available.
- **FR-004**: `carfax_get_summary` MUST return `total_accidents`, `title_issues`, `owner_count`, `last_odometer`, `open_recalls`, and `overall_risk_rating`.
- **FR-005**: Carfax report results MUST be cached in SQLite (WAL mode) with 30-day TTL.
- **FR-006**: On scraper/upstream failure, tools MUST return stale cached data with `{ stale: true, cachedAt }` when a cached entry exists.
- **FR-007**: Scraper must enforce anti-bot behavior: stealth enabled, random 2–5s delays, and CAPTCHA detection that throws `CaptchaError`.
- **FR-008**: HTTP 403/429 and daily cap exhaustion MUST map to `RateLimitError` with retry metadata where applicable.
- **FR-009**: Tool handlers MUST return structured typed errors only (`ScraperError`, `CaptchaError`, `RateLimitError`, `CacheError`).
- **FR-010**: Each tool invocation MUST emit OTEL span attributes `tool.name`, `tool.status`, and `tool.duration_ms`.
- **FR-011**: Parser and tool tests MUST use fixture-driven Vitest suites with coverage targets aligned to constitution quality gates.
- **FR-012**: Persisted Carfax session/auth artifacts MUST be encrypted at rest using a managed encryption key.

### Key Entities *(include if feature involves data)*

- **CarfaxReport**: Full normalized history payload for a VIN (ownership, accidents, title, service, odometer, recalls, risk flags).
- **CarfaxSummary**: Condensed risk-focused projection of `CarfaxReport` used for fast triage.
- **CarfaxCacheRecord**: Cached report JSON with `fetched_at`, `expires_at`, and stale metadata.
- **CarfaxSessionState**: Persisted authenticated browser/session context used for scraper reuse across runs, encrypted at rest with a managed key.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `carfax_get_report` and `carfax_get_summary` are callable through MCP and return valid typed JSON responses for valid VINs.
- **SC-002**: Invalid VIN requests are rejected at boundary validation with no downstream network call.
- **SC-003**: Cache hits return in under 100ms for warm entries in local testing.
- **SC-004**: On simulated upstream failure with cached data present, tools return stale payloads with `stale: true` and non-null `cachedAt`.
- **SC-005**: Persisted Carfax session/auth artifacts are encrypted at rest with managed-key protection in implementation and tests.

## Assumptions

- Carfax authentication credentials are available via `CARFAX_EMAIL` and `CARFAX_PASSWORD`.
- Carfax tools are implemented as a new MCP package under `packages/carfax-scraper-mcp`.
- Downstream consumers rely on shared envelope/error conventions already used by existing scraper MCP packages.
- Live Carfax integration tests remain optional and gated outside CI by environment flags.
