/**
 * @file index.ts
 * @description Public barrel for `@car-auctions/shared`.
 *
 * All consumers import from `@car-auctions/shared`; never from sub-paths.
 * Named exports only (tree-shakeable, NFR-001).
 *
 * @since 001-shared-utilities-lib
 */

// ─── Types & Interfaces ────────────────────────────────────────────────────────

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

  // Priority queue types
  PriorityLevel,
  PriorityRequest,
} from './types/index.js';

// ─── Error Classes ─────────────────────────────────────────────────────────────

export {
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  AnalysisError,
} from './errors.js';

// ─── Auction Normalizer ────────────────────────────────────────────────────────

export { normalizeCopart, normalizeIaai } from './normalizer.js';

// ─── VIN Decoder ───────────────────────────────────────────────────────────────

export { decodeVin, validateVin, SqliteVinCache, MemoryVinCache } from './vin-decoder.js';

export type { VinCache, SqliteVinCacheOptions } from './vin-decoder.js';

// ─── MCP Server Bootstrap ──────────────────────────────────────────────────────

export { createMcpServer } from './mcp-helpers.js';

export type { McpServerOptions } from './types/index.js';

// ─── Browser Pool ──────────────────────────────────────────────────────────────

export { BrowserPool } from './browser-pool.js';

export type { BrowserPoolOptions } from './browser-pool.js';

// ─── Priority Queue ────────────────────────────────────────────────────────────

export { PriorityQueue } from './priority-queue.js';

export type { PriorityQueueOptions } from './priority-queue.js';

// ─── OpenTelemetry Tracing ─────────────────────────────────────────────────────

export { initTracing, withSpan } from './tracing.js';

export type { SpanAttributes } from './tracing.js';
