/**
 * @file public-api.ts
 * @description Canonical public API surface for `@car-auctions/shared`.
 *
 * This file is the authoritative contract document for the shared package.
 * It mirrors `packages/shared/src/index.ts` exactly.
 *
 * Rules:
 *   - ALL exports are named (no default exports) — tree-shakeable (NFR-001)
 *   - Internal helpers (IAAI code maps, parser utilities, TokenBucket) are NOT re-exported
 *   - Consumers may only import from `@car-auctions/shared`; never from sub-paths
 *
 * @version 1.0.0
 * @since 001-shared-utilities-lib
 */

// ─── Types & Interfaces ────────────────────────────────────────────────────────
// Re-exported from packages/shared/src/types/index.ts

export type {
  // Auction data
  AuctionListing,
  CopartRawListing,
  IaaiRawListing,

  // Analysis pipeline
  DealAnalysis,
  DealSummary,
  RiskFlag,

  // VIN decode
  VINDecodeResult,

  // Financial
  ProfitEstimate,
  RepairEstimate,
  RepairLineItem,
  CarrierQuote,
  ValueAdjustment,

  // Browser pool config
  BrowserConfig,

  // Tool response envelope
  ToolResponse,
  ToolError,
  StaleableResponse,
  ErrorCode,

  // Carfax sub-records
  ServiceRecord,
  RecallRecord,

  // NMVTIS sub-records
  NmvtisTitleRecord,
  InsuranceLossRecord,
  JunkSalvageRecord,
  OdometerRecord,
} from './types/index.js';


// ─── Error Classes ─────────────────────────────────────────────────────────────
// Re-exported from packages/shared/src/errors.ts

export {
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  AnalysisError,
} from './errors.js';


// ─── Auction Normalizer ────────────────────────────────────────────────────────
// Re-exported from packages/shared/src/normalizer.ts

export {
  normalizeCopart,
  normalizeIaai,
} from './normalizer.js';


// ─── VIN Decoder ───────────────────────────────────────────────────────────────
// Re-exported from packages/shared/src/vin-decoder.ts

export {
  decodeVin,
  validateVin,
} from './vin-decoder.js';

export type {
  VinCache,
  SqliteVinCacheOptions,
} from './vin-decoder.js';

// Named VinCache implementations are exported as values (not just types)
export {
  SqliteVinCache,
  MemoryVinCache,
} from './vin-decoder.js';


// ─── MCP Server Bootstrap ──────────────────────────────────────────────────────
// Re-exported from packages/shared/src/mcp-helpers.ts

export {
  createMcpServer,
} from './mcp-helpers.js';

export type {
  McpServerOptions,
} from './mcp-helpers.js';


// ─── Browser Pool ──────────────────────────────────────────────────────────────
// Re-exported from packages/shared/src/browser-pool.ts

export {
  BrowserPool,
} from './browser-pool.js';

export type {
  BrowserPoolOptions,
} from './browser-pool.js';


// ─── Priority Queue ────────────────────────────────────────────────────────────
// Re-exported from packages/shared/src/priority-queue.ts
// Note: TokenBucket is internal and NOT exported.

export {
  PriorityQueue,
} from './priority-queue.js';

export type {
  PriorityLevel,
  PriorityRequest,
  PriorityQueueOptions,
} from './priority-queue.js';


// ─── OpenTelemetry Tracing ─────────────────────────────────────────────────────
// Re-exported from packages/shared/src/tracing.ts

export {
  initTracing,
  withSpan,
} from './tracing.js';

export type {
  SpanAttributes,
} from './tracing.js';


// ─── NOT EXPORTED (internal) ───────────────────────────────────────────────────
//
// The following are implementation details and MUST NOT be imported by consumers:
//
//   TokenBucket          — internal rate-limiter used by PriorityQueue
//   IAAI_TITLE_CODE_MAP  — internal lookup table used by normalizeIaai
//   NHTSA_VARIABLE_IDS   — internal constants used by decodeVin
//   SqliteVinCacheDb     — internal class used by SqliteVinCache
//
// If a consumer needs access to one of these, a new public API must be proposed.
