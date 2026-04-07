/**
 * @file src/index.ts
 * @description Public barrel for @car-auctions/shared.
 *
 * This is the ONLY consumer-facing entry point.
 * Internal modules are not re-exported (NFR-001).
 */

// Types & interfaces
export type {
  AuctionListing,
  CopartRawListing,
  IaaiRawListing,
  DealAnalysis,
  DealSummary,
  RiskFlag,
  VINDecodeResult,
  ProfitEstimate,
  RepairEstimate,
  RepairLineItem,
  CarrierQuote,
  ValueAdjustment,
  BrowserConfig,
  ToolResponse,
  ErrorCode,
  ServiceRecord,
  RecallRecord,
  NmvtisTitleRecord,
  InsuranceLossRecord,
  JunkSalvageRecord,
  OdometerRecord,
  // Extended analysis types
  NMVTISResult,
  CarfaxSummary,
  TitleComparison,
  DamageImage,
  DamageClassification,
  PaintAnalysis,
  FrameInspection,
  // Queue & tracing
  PriorityLevel,
  PriorityRequest,
  SpanAttributes,
} from './types/index.js';

// Error classes
export { ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError } from './errors.js';

// Auction normalizer
export { normalizeCopart, normalizeIaai } from './normalizer/index.js';

// VIN decoder
export { decodeVin, validateVin, type VinCache } from './vin-decoder/index.js';

// MCP server bootstrap
export { createMcpServer, type McpServerOptions } from './mcp-helpers.js';

// Browser pool
export { BrowserPool, type BrowserPoolOptions } from './browser-pool.js';

// Priority queue
export { PriorityQueue, type PriorityQueueOptions } from './priority-queue.js';

// OpenTelemetry tracing
export { initTracing, withSpan } from './tracing.js';
