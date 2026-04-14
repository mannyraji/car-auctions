# Feature Specification: Carfax Scraper MCP — Tools

**Feature Branch**: `003-carfax-tools-spec`  
**Created**: 2026-04-14  
**Status**: Draft  
**Input**: User description: "review docs/spec.md and create feature spec for Carfax Scraper MCP — Tools"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retrieve Full Vehicle History (Priority: P1)

A vehicle flipper (through an AI assistant) needs a complete history report for a single VIN before bidding, so they can identify major hidden risks such as title branding, structural damage, flood history, or odometer concerns.

**Why this priority**: Full history retrieval is the core value of the Carfax scraper and the foundation for downstream deal analysis decisions.

**Independent Test**: Can be fully tested by requesting a report for a valid VIN and verifying that all required report sections are returned in a structured response.

**Acceptance Scenarios**:

1. **Given** a valid 17-character VIN, **When** `carfax_get_report` is requested, **Then** the system returns a structured report including ownership, accident, title, service, odometer, recall, and damage-related indicators
2. **Given** the same VIN with a fresh cached report, **When** `carfax_get_report` is requested again, **Then** the system returns the cached report
3. **Given** report retrieval fails but a prior cached report exists, **When** `carfax_get_report` is requested, **Then** the system returns the most recent cached report marked as stale

---

### User Story 2 - Get Quick Risk Snapshot (Priority: P1)

A vehicle flipper needs a fast go/no-go summary for a VIN to triage many vehicles quickly before running deeper analysis.

**Why this priority**: Rapid screening enables users to eliminate high-risk vehicles quickly and focus effort on promising inventory.

**Independent Test**: Can be fully tested by requesting a summary for a valid VIN and verifying that all summary fields are present and internally consistent with the related report data.

**Acceptance Scenarios**:

1. **Given** a valid VIN, **When** `carfax_get_summary` is requested, **Then** the system returns total accidents, title issue presence, owner count, latest odometer reading, open recall count, and an overall risk rating
2. **Given** 0 accidents AND no title-brand flags AND 0 open recalls in available history, **When** `carfax_get_summary` is returned, **Then** the overall risk rating is `low`
3. **Given** exactly 1 accident OR ≥1 open recall OR a rebuilt title (and no major brand), **When** `carfax_get_summary` is returned, **Then** the overall risk rating is `medium`
4. **Given** ≥2 accidents OR any major title brand (salvage, lemon, flood, structural damage, or airbag deployment record), **When** `carfax_get_summary` is returned, **Then** the overall risk rating is `high`

---

### User Story 3 - Consume Carfax Data in Deal Analysis (Priority: P2)

A deal-analysis workflow needs Carfax-derived risk signals in a predictable format so it can combine them with auction, pricing, and title data to produce a confident recommendation.

**Why this priority**: This ensures Carfax output is useful in broader business workflows and not only as a standalone lookup.

**Independent Test**: Can be fully tested by using returned summary/report data as input to downstream analysis and verifying expected risk flags can be derived without transformation ambiguity.

**Acceptance Scenarios**:

1. **Given** a report showing flood or structural concerns, **When** downstream analysis consumes the Carfax output, **Then** those risks can be directly represented as risk flags
2. **Given** a summary response, **When** downstream analysis consumes it, **Then** required indicators are available without requiring raw page parsing

---

### Edge Cases

- VIN format is invalid (wrong length, unsupported characters): request is rejected with a validation error
- VIN is valid but no Carfax data is available: system returns a clear not-found style response
- Carfax session is expired or login fails: request fails with an authentication error
- Carfax temporarily rate-limits requests: system applies rate-limit behavior and returns retry guidance when appropriate
- Carfax retrieval fails and no cached data exists: system returns a structured scraper error (no stale fallback)
- Carfax retrieval fails and stale cache exists: stale result is returned with explicit stale indicator
- Two simultaneous requests arrive for the same VIN: the system coalesces the in-flight scrape; the second caller waits for the first scrape to complete and both callers receive the same result (no duplicate scrape is initiated)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST expose two Carfax MCP tools: `carfax_get_report` and `carfax_get_summary`
- **FR-002**: The system MUST validate VIN input before processing; VINs must be exactly 17 alphanumeric characters and must not include I, O, or Q
- **FR-003**: `carfax_get_report` MUST return a structured vehicle-history result containing ownership history, accident history, title history, service records, odometer history, recall status, and key risk indicators (including structural damage, airbag deployment, flood damage, lemon history when available)
- **FR-004**: `carfax_get_summary` MUST return a concise risk snapshot containing total accidents, title issue indicator, owner count, latest odometer reading, open recall count, and an overall risk rating of `low`, `medium`, or `high` computed as follows: `low` = 0 accidents AND no title-brand flags AND 0 open recalls; `medium` = 1 accident OR ≥1 open recall OR rebuilt title (with no major brand present); `high` = ≥2 accidents OR any major title brand (salvage, lemon, flood, structural damage, or airbag deployment record)
- **FR-005**: The system MUST cache full Carfax report results for repeated VIN lookups using a 30-day freshness window; cached records MUST be persisted in a SQLite table (`carfax_cache`) keyed by VIN to survive process restarts
- **FR-006**: When Carfax retrieval fails and prior cached data exists, the system MUST return stale cached data flagged as stale
- **FR-007**: When Carfax retrieval fails and no cached data exists, the system MUST return a structured error response
- **FR-008**: The system MUST detect and surface CAPTCHA-related blocking as a distinct failure condition and MUST NOT attempt automated CAPTCHA solving
- **FR-009**: The system MUST enforce request throttling for Carfax scrape calls with a default minimum inter-request delay of 10 seconds (configurable via the `CARFAX_THROTTLE_DELAY_MS` environment variable); this rate limit MUST apply globally across all concurrent tool invocations to reduce blocking risk and preserve service stability
- **FR-010**: The system MUST return tool responses in a consistent structured envelope including success/failure status, data or error payload, cache indicator, stale indicator, and timestamp
- **FR-011**: The summary output MUST be derivable from the same underlying vehicle history used for the report to prevent contradictory report-vs-summary results for a VIN at the same point in time
- **FR-012**: The feature MUST support secure credential-based access to Carfax through configured environment variables without exposing credentials in tool responses
- **FR-013**: Tool outputs MUST provide enough structured fields for downstream deal-analysis workflows to identify major title, mileage, and damage-related risk signals without free-form scraping
- **FR-014**: The system MUST emit structured JSON logs (at INFO, WARN, and ERROR levels) for every tool invocation, cache hit/miss event, scrape attempt outcome, and CAPTCHA detection event; log entries MUST include VIN (redacted to last 6 characters), tool name, operation result, latency, and cache status
- **FR-015**: The system MUST expose the following operational metrics to support success-criteria monitoring: (1) cache hit rate per tool, (2) per-tool request latency (P50/P95), (3) scrape error rate broken down by error type including CAPTCHA as a distinct category

### Key Entities *(include if feature involves data)*

- **VehicleHistoryReport**: Full vehicle history record keyed by VIN; includes ownership, accidents, title events, service events, odometer events, recalls, and major risk indicators
- **VehicleRiskSummary**: Compact risk profile keyed by VIN; includes aggregate indicators used for rapid triage and ranking
- **OwnershipEvent**: Owner change information including timeframe and location context
- **AccidentEvent**: Incident details including date, severity, and affected damage area(s)
- **TitleEvent**: Title state/type history and branding changes over time
- **ServiceEvent**: Maintenance/service record including date, description, and optional location/provider details
- **OdometerEvent**: Timestamped mileage reading used to identify consistency or rollback concerns
- **CacheRecord**: SQLite row in `carfax_cache` table keyed by VIN; stores serialised `VehicleHistoryReport`, retrieval timestamp, and staleness flag; used to serve repeated lookups within the 30-day freshness window without re-scraping

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 95% of valid VIN summary requests return a complete risk summary in under 5 seconds under normal operating conditions
- **SC-002**: 95% of valid VIN full report requests return complete structured report data in under 15 seconds under normal operating conditions
- **SC-003**: 100% of invalid VIN requests are rejected with validation errors before external lookup
- **SC-004**: At least 90% of repeated requests for the same VIN within the cache window are served from cache
- **SC-005**: 100% of responses during upstream retrieval failures include either a structured error or stale cached result (no unstructured failures)
- **SC-006**: In consistency checks, summary fields match the corresponding full report facts for the same VIN and retrieval timestamp in at least 99% of sampled cases
- **SC-007**: For a representative batch of candidate vehicles, users can complete initial risk triage (accept/reject for deeper review) for at least 50 vehicles in under 15 minutes using summary output
- **SC-008**: Cache hit rate for repeated VIN lookups within the 30-day freshness window is observable via emitted metrics and MUST be ≥90% in steady-state operation (aligns with SC-004)

## Assumptions

- Users are internal or trusted assistant-driven operators evaluating single VINs for salvage auction decision-making
- This feature covers Carfax tool behavior and output contracts only; downstream scoring formulas remain outside this scope
- Credential configuration for Carfax access is already managed by the deployment environment
- Upstream Carfax data availability can vary by VIN; the system must handle partial availability gracefully
- The stale-cache fallback model follows repository-wide behavior: stale data may be returned when live retrieval fails and cached data exists

## Clarifications

### Session 2026-04-14

- Q: What numeric thresholds define the low / medium / high overall risk rating in `carfax_get_summary`? → A: Low = 0 accidents AND no title-brand flags AND 0 open recalls; Medium = 1 accident OR ≥1 open recall OR rebuilt title (no major brand); High = ≥2 accidents OR any major title brand (salvage, lemon, flood, structural damage, airbag deployment record)
- Q: Where should cached VIN reports be stored (cache storage backend)? → A: SQLite table (`carfax_cache`) — persistent across restarts, zero external infrastructure dependency, keyed by VIN
- Q: What is the default request throttle rate for Carfax scrape calls (FR-009)? → A: 1 request per 10 seconds (6 req/min) as the default; configurable via `CARFAX_THROTTLE_DELAY_MS` env var
- Q: What observability signals are required for operational readiness? → A: Structured JSON logs (INFO/WARN/ERROR) per invocation + metrics for cache hit rate, per-tool P50/P95 latency, and scrape error rate (CAPTCHA as distinct error type)
- Q: How should simultaneous requests for the same VIN be handled? → A: Request coalescing — deduplicate in-flight scrapes per VIN; second caller waits and both callers receive the same result (no duplicate scrape)
