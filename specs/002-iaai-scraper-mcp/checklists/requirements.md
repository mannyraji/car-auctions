# Specification Quality Checklist: IAAI Scraper MCP

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-04-08
**Feature**: [../spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All checklist items pass. Spec is ready for `/speckit.plan`.
- The spec intentionally references shared package modules (browser pool, VIN decoder, normalizer) in the Assumptions section to document dependencies — these are not implementation details but boundary conditions.

---

# Pre-Tasks Requirements Checklist: IAAI Scraper MCP

**Purpose**: Validate requirements quality, completeness, and implementation-readiness across all 6 MCP tools, cross-cutting concerns, SQLite schema, normalizer fix, and test requirements before task execution begins.
**Created**: 2026-04-08
**Feature**: [../spec.md](../spec.md)
**References**: [contracts/public-api.md](../contracts/public-api.md), [data-model.md](../data-model.md), [research.md](../research.md), [plan.md](../plan.md)
**Depth**: Standard | **Actor**: Implementer (pre-tasks gate) | **Focus**: Tool specification, schema, cross-cutting NFRs, test coverage

---

## Tool Specification Completeness

- [x] CHK001 - Are all six required MCP tools (`iaai_search`, `iaai_get_listing`, `iaai_get_images`, `iaai_decode_vin`, `iaai_sold_history`, `iaai_watch_listing`) documented with input schema, output schema, behavior, and error codes? [Completeness, Spec §FR-001, Contracts]
- [x] CHK002 - Are the priority classifications (P1/P2/P3) of all six tools documented in the contract, and do they align with the priority assignments in the spec's user stories? [Consistency, Spec §User Stories, Contracts]
- [x] CHK003 - Is the "falls back to DOM scraping on interception miss" behavior for `iaai_search` specified with a definition of what constitutes a partial DOM result versus a full interception result? [Clarity, Spec §FR-003, Contracts §iaai_search] ✅ *contracts: full-mode vs DOM-fallback field tables added*
- [x] CHK004 - Is the "falls back to DOM scraping" behavior for `iaai_get_listing` (FR-004) documented with what fields are available in DOM-only mode versus full JSON interception mode? [Clarity, Spec §FR-004, Research §Item 2] ✅ *contracts: full-mode vs DOM-fallback field tables added*
- [x] CHK005 - Is the scope of `iaai_decode_vin` limited to NHTSA vPIC delegation documented explicitly in the contract, making clear that no IAAI-specific VIN logic exists in this package? [Completeness, Contracts §iaai_decode_vin, Spec §Assumptions] ✅ *contracts: Scope note added to iaai_decode_vin Behavior*
- [x] CHK006 - Is the `iaai_watch_listing` requirement to write `source: "iaai"` for all entries formally present in both the contract (output schema) and the functional requirement (FR-019)? [Consistency, Spec §FR-019, Contracts §iaai_watch_listing]

---

## Tool Input Schema Quality

- [x] CHK007 - Is the behavior when `iaai_search` receives `limit` outside the `1–100` range defined in the contract? (The range is stated but the error type and message for an out-of-range value are not.) [Clarity, Gap, Contracts §iaai_search] ✅ *contracts: Input Validation block added to iaai_search*
- [x] CHK008 - Is the behavior when `year_min > year_max` specified for `iaai_search` and `iaai_sold_history`? The schema validates each value independently but does not define behavior for logically inverted year ranges. [Coverage, Gap, Contracts §iaai_search, §iaai_sold_history] ✅ *contracts: Input Validation blocks added to both tools*
- [x] CHK009 - Is there a formal definition of "alphanumeric only" for `stock_number` validation — specifically, does it permit hyphens or spaces that may appear in some IAAI lot identifiers? [Clarity, Spec §FR-016, Contracts §iaai_get_listing] ✅ *contracts: `[A-Za-z0-9]` only; hyphens and spaces rejected — added to iaai_watch_listing input schema*
- [x] CHK010 - For `iaai_watch_listing`, is the error behavior when `action: "add"` or `"remove"` is called without providing `stock_number` explicitly specified in the contract? The validation rule is noted in prose but missing from the error codes table. [Completeness, Gap, Contracts §iaai_watch_listing] ✅ *contracts: explicit ScraperError message specified in Validation block*
- [x] CHK011 - Is `bid_threshold` validated beyond "positive number" for `iaai_watch_listing`? The contract specifies no upper bound, maximum precision, or currency unit — are these intentionally unbounded? [Clarity, Contracts §iaai_watch_listing] ✅ *contracts: design note added — intentionally unbounded, implicitly USD, stored as SQLite REAL — see Design Decisions*
- [x] CHK012 - Is the `query` field in `iaai_search` constrained beyond "required, non-empty"? A maximum length, character restrictions, or injection-safety note is absent from the input schema. [Clarity, Gap, Contracts §iaai_search] ✅ *contracts: max 200 characters added to Input Validation block*

---

## Tool Output Schema Quality

- [x] CHK013 - Is the `AuctionListing` field `images_available` (listed in Spec §Key Entities) present in the contract's `iaai_search` example response and the `iaai_get_listing` output type definition? [Completeness, Spec §Key Entities, Contracts §iaai_search] ✅ *contracts: `images_available: 12` added to iaai_search example response*
- [x] CHK014 - Is the `category` field on `ImageResult` formally enumerated in the contract? The contract mentions `"exterior" | "interior" | "damage" | "engine" | "detail"` but research describes a different fallback label pattern (`"detail-{n}"`) for flat image arrays — are these consistent? [Consistency, Contracts §iaai_get_images, Research §Item 4] ✅ *contracts: category type updated to `"detail-{n}"` pattern with explanation*
- [x] CHK015 - Is the `partial: boolean` field on `iaai_get_images` output accompanied by a machine-readable indicator of how many images were successfully returned versus expected? The current shape has `images[]` and `partial: true` but no `total_available` count. [Clarity, Contracts §iaai_get_images] ✅ *contracts: `total_available: number` added to output type*
- [x] CHK016 - Is the `cachedAt` field in the standard response envelope defined to be `null` (not `undefined`) for freshly fetched results, and is this distinction enforced in the contract? [Clarity, Contracts §Standard Response Envelope] ✅ *contracts: changed to `cachedAt: string | null` with "always null (never undefined)" note*
- [x] CHK017 - For `iaai_sold_history`, are the aggregate values specified to be `0` (not `null` or `undefined`) when all lots have `final_bid === null`? The spec and FR-020 state this, but the contract's output schema defines these fields as `number` without explicitly excluding `null`. [Clarity, Spec §FR-020, Contracts §iaai_sold_history]
- [x] CHK018 - Is the `data` field explicitly typed as `null` (not absent) in the error response envelope, and does the contract clarify that tooling must not rely on `data` being omitted on error? [Clarity, Contracts §Standard Response Envelope] ✅ *contracts: `// always present as null in error responses; never omitted` added to envelope*

---

## Tool Error Coverage

- [x] CHK019 - Are the error types that `iaai_get_images` can throw enumerated in the error codes table? The table covers `RateLimitError`, `CaptchaError`, `ScraperError`, `CacheError` globally — but there is no explicit mapping of which errors `iaai_get_images` can raise (e.g., session re-auth failure, CDN unreachable). [Completeness, Gap, Contracts §Error Codes] ✅ *contracts: Possible errors list added to iaai_get_images Behavior*
- [x] CHK020 - Is there a defined error response for `iaai_decode_vin` when the NHTSA vPIC API is unavailable (not a validation failure)? The contract states "no staleness cap" for VIN, but no fallback or error type is specified for an NHTSA outage. [Coverage, Gap, Contracts §iaai_decode_vin] ✅ *contracts: NHTSA unavailable → `ScraperError("NHTSA vPIC API unavailable")` added to iaai_decode_vin Behavior*
- [x] CHK021 - Is the `ScraperError` with `notFound: true` for `iaai_get_listing` distinguished at the type level from a generic `ScraperError`? The contract describes this semantically but does not specify whether `notFound` is a field on the error object or a separate error subtype. [Clarity, Contracts §iaai_get_listing] ✅ *contracts: `notFound: true` is a boolean property on the error object (not a message substring) — added to iaai_get_listing Behavior*
- [x] CHK022 - Are `CacheError` scenarios for `iaai_watch_listing` (e.g., SQLite write failure on `"add"`) included in the tool's error contract? The error codes table lists `CacheError` globally, but the `iaai_watch_listing` tool section contains no error clause. [Completeness, Gap, Contracts §iaai_watch_listing] ✅ *contracts: Possible errors block added to iaai_watch_listing Behavior*
- [x] CHK023 - When the daily 500-request cap is reached mid-scrape, is the error response for `iaai_search` and `iaai_get_listing` specified to check the stale cache before throwing `RateLimitError`? The stale fallback (FR-011) and rate limit (FR-006) requirements exist separately — their interaction on cap exhaustion is not specified. [Coverage, Gap, Spec §FR-006, §FR-011] ✅ *contracts: Daily cap exhaustion bullet added to iaai_search and iaai_get_listing Behavior*
- [x] CHK024 - Is the error behavior defined when `iaai_get_images` returns `partial: true` after one session re-authentication attempt? The contract documents the `partial` flag but does not specify the error type (if any) that accompanies an incomplete image set. [Clarity, Contracts §iaai_get_images] ✅ *contracts: `success: true` with `partial: true` — no error thrown on incomplete re-auth result*

---

## Cache Behavior Requirements

- [x] CHK025 - Is the relationship between the in-memory LRU search cache and the SQLite `searches` table formally specified? The data-model defines both (§3 SQLite schema includes a `searches` table; §6 TTL summary assigns search to in-memory LRU only), but neither document states whether the SQLite table is used as a stale fallback when the LRU is empty after a server restart. [Consistency, Conflict, Data-model §3, §6] ✅ *FR-009 updated: "supplemental SQLite persistence permitted for warm restart and stale fallback"*
- [x] CHK026 - Is the LRU cache key format for `iaai_search` specified to include parameter ordering so that `{make:"Toyota", model:"Camry"}` and `{model:"Camry", make:"Toyota"}` produce the same cache key? [Clarity, Gap, Research §Item 3] ✅ *contracts: alphabetically sorted key format added to iaai_search Behavior*
- [x] CHK027 - Is the TTL enforcement mechanism for expired SQLite rows specified? The schema defines `expires_at INTEGER` columns but no requirement states whether expired rows are deleted eagerly (on write), lazily (on read), or via a scheduled cleanup job. [Completeness, Gap, Data-model §3] ✅ *contracts: Cache Mechanics section added — lazy read + 10-min cleanup job*
- [x] CHK028 - Are the five distinct TTL values (15 min / 60 min / 24 hr / 7 day / 90 day) all traceable to a formal FR reference? FR-009 lists them and SC-009 verifies them — but the success criterion does not state how TTL enforcement failure would be detected in tests. [Measurability, Spec §FR-009, §SC-009]
- [x] CHK029 - Is the staleness cap of 24 hours for search, listing, images, and sold history measured from `fetched_at` or from `expires_at`? The data-model stores both timestamps, but the contract's stale fallback description references an entry being "≤ 24 h old" without clarifying which timestamp is used. [Clarity, Contracts §iaai_get_listing Behavior, Data-model §6] ✅ *contracts: stale age measured from `fetched_at` added to Cache Mechanics section and iaai_get_listing Behavior*
- [x] CHK030 - Is the VIN cache's "no staleness cap" (FR-011) reconciled with the 90-day TTL in the shared `SqliteVinCache`? An entry older than 90 days would be expired from the VIN TTL, but FR-011 says there is no staleness cap for VIN data. [Consistency, Spec §FR-011, Data-model §6] ✅ *data-model §6: VIN stale-cap footnote added*

---

## Cross-Cutting: OTEL Tracing

- [x] CHK031 - Is the `tool.duration_ms` span attribute specified to measure the full tool handler duration (including cache lookup) or only the scraper/external call duration? [Clarity, Spec §FR-021] ✅ *contracts: OTEL Tracing Contract section added — full handler duration defined*
- [x] CHK032 - Is the no-op behavior when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset verified to still emit spans locally (no export) or to suppress span creation entirely? The spec says "no-op" but SC-011 requires spans to be verifiable in tests — these requirements may be in tension. [Measurability, Spec §FR-017, §SC-011] ✅ *contracts: spans always created; only OTLP exporter is no-op; tests use spy/in-memory exporter*
- [x] CHK033 - Are the required span attributes (`tool.name`, `tool.status`, `tool.duration_ms`) specified as OTEL semantic conventions or as custom attributes? If custom, is the attribute namespace prefix documented? [Clarity, Gap, Spec §FR-021] ✅ *contracts: custom `tool.*` namespace documented in OTEL Tracing Contract section*
- [x] CHK034 - Is the requirement that spans must not export raw stack traces accompanied by a definition of what constitutes a "raw stack trace" — e.g., is the error message allowed, only the error type, or neither? [Clarity, Spec §FR-021] ✅ *contracts: `error.type` + `error.message` included; `error.stack` frames excluded*

---

## Cross-Cutting: Stale Fallback & Input Validation

- [x] CHK035 - Is the `stale: true` response accompanied by a requirement that `cachedAt` is always a non-null ISO 8601 string when `stale: true`? The standard envelope defines both fields but does not formally forbid `cachedAt: null` alongside `stale: true`. [Completeness, Contracts §Standard Response Envelope, Spec §FR-011]
- [x] CHK036 - Is the interaction between stale fallback and OTEL span outcome defined? When a stale result is returned, should `tool.status` be `"ok"` or `"error"`? This is not specified and affects observability dashboards. [Coverage, Gap, Spec §FR-011, §FR-021] ✅ *contracts: stale fallback → `tool.status: "ok"`, span status `OK`*
- [x] CHK037 - Are the Zod validation error messages for invalid inputs (e.g., invalid VIN, non-alphanumeric stock number) specified to use the standard `ScraperError` envelope rather than raw Zod error output? [Clarity, Spec §FR-016, Contracts §Standard Response Envelope] ✅ *contracts: Zod errors wrapped in ScraperError before return — noted after Error Codes table*
- [x] CHK038 - Is the input validation for `zip` (5-digit numeric) defined to preserve leading zeros? US zip codes can start with `0` (e.g., `"01234"`) — if the validator coerces to integer it silently truncates. [Clarity, Spec §FR-016, Contracts §iaai_search] ✅ *contracts: `/^\d{5}$/` string-only validation added to iaai_search Input Validation block*

---

## Cross-Cutting: Anti-Bot & Session

- [x] CHK039 - Is the startup failure behavior when `IAAI_EMAIL` or `IAAI_PASSWORD` is missing specified as a synchronous configuration check (before MCP tool registration) or an async failure on first tool invocation? [Clarity, Spec §FR-014, §FR-018, §Edge Cases] ✅ *contracts: Cross-Cutting Behaviors — synchronous `process.exit(1)` before tool registration*
- [x] CHK040 - Is the session re-authentication retry limit ("one attempt") consistent across all scraper operations? The image fetch contract and research §Item 5 both describe a single retry, but this is not unified in a single requirement applicable to all tools. [Consistency, Gap, Research §Item 5, Contracts §iaai_get_images] ✅ *contracts: Session Re-Authentication section added — one retry for all operations*
- [x] CHK041 - Is proxy rotation on failure (described in the Assumptions section) a formal requirement, or only an assumption? If required for rate-limit evasion or resilience, it should appear in an FR rather than only in Assumptions. [Completeness, Spec §Assumptions] ✅ *spec.md: FR-023 added for proxy rotation*
- [x] CHK042 - Is the 2–5 second random delay requirement (FR-005) measurable in tests? If the delay must be verifiable, is a test hook or injectable delay function required? [Measurability, Spec §FR-005] ✅ *spec.md: FR-005 updated — delay function must be injectable for test overrides*

---

## SQLite Schema Completeness

- [x] CHK043 - Is the `searches` SQLite table (defined in data-model §3) formally required by any functional requirement? FR-009 assigns search caching to in-memory LRU only — the SQLite `searches` table may be a spec artifact without a driving requirement. [Consistency, Conflict, Data-model §3, Spec §FR-009] ✅ *FR-009 updated: SQLite `searches` table has formal role for warm restart and stale fallback*
- [x] CHK044 - Are indexes on `listings.expires_at` and `sold_history.expires_at` specified? Without them, any TTL-based row cleanup query would perform a full-table scan. [Completeness, Gap, Data-model §3] ✅ *data-model §3: `idx_listings_expires` and `idx_sold_expires` added*
- [x] CHK045 - Is the foreign key `watchlist_history.lot_number → watchlist.lot_number` specified to cascade on delete, so that removing a watchlist entry also removes its history rows? [Coverage, Gap, Data-model §3] ✅ *data-model §3: `ON DELETE CASCADE` added to FK definition*
- [x] CHK046 - Is `PRAGMA synchronous = NORMAL` in the schema documented as an intentional trade-off with a rationale traceable to a design decision or non-functional requirement? [Clarity, Data-model §3] ✅ *data-model §3: rationale note added — cache-only DB; data loss = cache miss only*
- [x] CHK047 - Is the session persistence file path consistently named across all documents? Research §Item 5 and data-model §5 use `data/session.json`, while FR-014 explicitly names it `data/iaai-session.json`. This inconsistency must be resolved before implementation. [Consistency, Conflict, Spec §FR-014, Research §Item 5, Data-model §5] ✅ *FR-014, Assumptions, and data-model §5 all consistently use `data/iaai-session.json`*
- [x] CHK048 - Is the `IaaiSession.localStorage` outer key format (origin string) formally defined? The data-model uses `Record<string, Record<string, string>>` but does not specify whether the key is `"https://www.iaai.com"` or `"www.iaai.com"` — a mismatch would silently fail to restore localStorage tokens. [Clarity, Data-model §5] ✅ *data-model §5: outer key = full origin `"https://www.iaai.com"` documented*

---

## Normalizer Fix Requirements

- [x] CHK049 - Is the required change to `resolveTitleType()` in `@car-auctions/shared` captured as an explicit cross-package task dependency rather than only a research observation? Research §Item 6 and data-model §1 describe the fix, but no FR or task dependency formally declares that the shared package must be updated before IAAI scraper implementation begins. [Completeness, Spec §FR-015, Research §Item 6] ✅ *tasks.md T005 is a blocking prerequisite in Phase 1 that explicitly requires the normalizer fix before any other phase begins*
- [x] CHK050 - Is the requirement to update existing shared normalizer tests (`packages/shared/tests/normalizer.test.ts`) formally specified — including which assertions must change from `=== "Unknown"` to `=== "Unknown (XX)"`? [Coverage, Research §Item 6, Spec §SC-005] ✅ *tasks.md T005(f) explicitly requires updating all `"Unknown"` assertions in normalizer.test.ts and normalizer-structural.test.ts*
- [x] CHK051 - Is there a requirement that downstream consumers checking `title_type === "Unknown"` (e.g., deal-analyzer risk flags) be updated to `startsWith("Unknown")`? Research §Item 6 identifies this risk but no FR or SC addresses it — is the fix deferred? [Coverage, Gap, Research §Item 6] ✅ *Design Decision: deferred — tracked in deal-analyzer spec; out of scope for this package — see Design Decisions table*
- [x] CHK052 - Is the title code map (SV/CL/RB/FL/NR/JK/MV + `Unknown (XX)` fallback) authoritative in data-model §1, and is it cross-referenced consistently from FR-015 and the contract's example response? [Consistency, Data-model §1, Spec §FR-015, Contracts §iaai_search]

---

## Test Requirements Coverage

- [x] CHK053 - Is the ≥80% branch coverage threshold for `src/tools/` and `src/scraper/parser.ts` specified in verifiable form (e.g., as Vitest `coverage.thresholds` config entries) rather than only in the plan narrative? [Measurability, Plan §Technical Context] ✅ *vitest.config.ts is pre-scaffolded with v8 coverage thresholds at 80% (tasks.md pre-scaffolded list)*
- [x] CHK054 - Are fixture files formally required for all three scraped endpoints, and is each fixture linked to specific parser test assertions? The plan lists the three fixture files but no requirement maps each fixture to a set of mandatory assertions. [Completeness, Plan §Project Structure, Spec §SC-001] ✅ *tasks.md T002/T003/T004 create fixtures; T015 creates parser with named parse functions (parseSearchResults, parseListingDetail, parseSoldResults) that form the assertion targets; SC-001 requires fixture-based testing*
- [x] CHK055 - Is the live test gating convention (`{ skip: !process.env.LIVE_TEST }`) specified as a hard requirement for all real-network tests, or only a convention? If it is a requirement, it should appear in SC-001 or FR-022. [Clarity, Gap, Spec §SC-001] ✅ *spec.md SC-001 updated: `LIVE_TEST` gating is a hard requirement*
- [x] CHK056 - Is there a defined fixture or test scenario for the `Unknown (XX)` title code path in the parser tests? SC-005 requires 100% title code mapping accuracy, which implies at least one unknown-code fixture must exist. [Coverage, Spec §SC-005, Research §Item 6] ✅ *tasks.md T002 explicitly requires one listing with `titleCode: "DM"` (unknown code) in the search fixture*
- [x] CHK057 - Are the OTEL span emission tests (SC-011) specified to use a no-op or spy tracer in the unit test context, or do they require a running OTLP endpoint? If a spy tracer is required, is that infrastructure defined in the test requirements? [Clarity, Spec §SC-011] ✅ *contracts: in-memory spy exporter documented; no running OTLP endpoint required*
- [x] CHK058 - Is the `config.test.ts` coverage scope formally defined? The plan includes the file but neither spec nor plan states which configuration scenarios (e.g., missing env vars, malformed JSON config) must be covered. [Completeness, Gap, Plan §Project Structure] ✅ *Design Decision: config.test.ts covers (a) missing `IAAI_EMAIL`/`IAAI_PASSWORD` triggers startup error, (b) valid `config/default.json` loads with correct defaults, (c) env var overrides apply — see Design Decisions table*
- [x] CHK059 - Is the `iaai_search` / `copart_search` structural equivalence test (SC-003) specified to use a fixture-based field-by-field comparison, or is a TypeScript type-level check acceptable? [Measurability, Spec §SC-003] ✅ *SC-003 specifies "normalizer structural test suite" field-by-field comparison — fixture-based, same mechanism as `normalizer-structural.test.ts` in shared*
- [x] CHK060 - Are the watchlist round-trip tests (SC-010) required to cover all five acceptance scenarios from User Story 6, specifically the upsert-on-duplicate-add (AS-4) and idempotent-remove (AS-5) cases? [Coverage, Spec §SC-010, §User Story 6]

---

## Consistency & Conflict Detection

- [x] CHK061 - Is the stale fallback for `iaai_search` possible after a server restart? The in-memory LRU is cleared on restart — if IAAI is unreachable immediately after restart, there is no stale entry to return. Is this gap in coverage intentional and documented? [Consistency, Conflict, Spec §FR-009, §FR-011] ✅ *FR-009 updated: SQLite `searches` table used as stale fallback when LRU is empty post-restart*
- [x] CHK062 - Is the boundary between `IaaiRawStockData` (local package type) and `IaaiRawListing` (shared type) formally specified, or are implementations expected to infer it? The plan describes the boundary in prose but no requirement prevents local type duplication of shared fields. [Consistency, Plan §Key Design Decisions] ✅ *contracts: Implementation Notes — type boundary section added*
- [x] CHK063 - Is the 30s navigation timeout (contract) and 60s tool handler timeout (plan) interaction specified? If navigation consumes 30s, is the remaining 30s budget defined for normalization, caching, and response serialization — or can a single tool invocation exceed 60s on slow pages? [Clarity, Plan §Constraints, Contracts §iaai_get_listing] ✅ *contracts: Timeout Budget section added*
- [x] CHK064 - Is there a requirement that the IAAI `watchlist` table schema remains byte-for-byte identical to the Copart `watchlist` table schema, so the alerts service can query both with the same SQL? [Consistency, Data-model §3, Spec §FR-019]
- [x] CHK065 - Is the `AuctionListing.fetched_at` (set by the normalizer at normalization time) the same timestamp stored in `listings.fetched_at` in SQLite? If SQLite re-stamps this field on cache write, stale fallback calculations based on `fetched_at` will be systematically off. [Clarity, Gap, Data-model §1, §3] ✅ *contracts: `fetched_at` Consistency section added — cache writes MUST NOT re-stamp*

---

## Checklist Notes

All 65 CHK items resolved as of 2026-04-09. See inline ✅ annotations for resolution sources.

---

## Design Decisions

| CHK | Decision | Rationale |
|-----|----------|-----------|
| CHK011 | `bid_threshold` is intentionally unbounded above (no maximum enforced) | Auction bids are unbounded in practice; adding an arbitrary cap would break legitimate high-value lots; currency is implicitly USD and stored as SQLite `REAL` |
| CHK041 | Proxy rotation promoted from Assumption to formal **FR-023** | Proxy rotation is a functional resilience requirement, not merely an assumption; it must be testable and enforceable |
| CHK051 | Downstream consumers checking `title_type === "Unknown"` (e.g., deal-analyzer risk flags) are **deferred** | The fix (change to `startsWith("Unknown")`) is tracked in the deal-analyzer spec; it is out of scope for this package and does not block correct IAAI normalizer output |
| CHK055 | `LIVE_TEST` gating is a **hard requirement**, not a convention | Real-network tests that run in CI without opt-in break reproducibility; SC-001 now explicitly requires the gate |
| CHK058 | `config.test.ts` scope: (a) missing `IAAI_EMAIL`/`IAAI_PASSWORD` triggers `process.exit(1)` startup error, (b) `config/default.json` loads with correct defaults (rate limits, TTLs), (c) env var overrides apply correctly | Scoping prevents the file from becoming a catch-all; these three scenarios cover every startup-time configuration path |
