/**
 * @car-auctions/shared — Public API
 *
 * Re-exports all public types, error classes, and utilities.
 * @packageDocumentation
 */

// ─── Types & Interfaces ───────────────────────────────────────────────────────
export type {
  // Core auction types
  AuctionListing,
  CopartRawListing,
  IaaiRawListing,

  // Deal analysis types
  DealAnalysis,
  DealSummary,
  RiskFlag,
  ProfitEstimate,
  RepairEstimate,
  RepairLineItem,
  CarrierQuote,
  ValueAdjustment,

  // VIN types
  VINDecodeResult,

  // Tool response envelope
  ToolResponse,
  ToolError,
  ErrorCode,
  StaleableResponse,

  // Browser config
  BrowserConfig,

  // Carfax sub-records
  ServiceRecord,
  RecallRecord,

  // NMVTIS sub-records
  NmvtisTitleRecord,
  InsuranceLossRecord,
  JunkSalvageRecord,
  OdometerRecord,
} from './types/index.js';

// ─── Error Classes ────────────────────────────────────────────────────────────
export { ScraperError, CaptchaError, RateLimitError, CacheError, AnalysisError } from './errors.js';

// ─── Auction Normalizer ───────────────────────────────────────────────────────
export { normalizeCopart, normalizeIaai } from './normalizer/index.js';

// ─── VIN Decoder ──────────────────────────────────────────────────────────────
export {
  decodeVin,
  validateVin,
  type VinCache,
  SqliteVinCache,
  InMemoryVinCache,
} from './vin-decoder/index.js';

// ─── MCP Server Bootstrap ─────────────────────────────────────────────────────
export { createMcpServer } from './mcp-helpers/index.js';
export type { McpServerOptions } from './types/index.js';

// ─── Browser Pool ─────────────────────────────────────────────────────────────
export { BrowserPool, type BrowserContext } from './browser-pool/index.js';
export type { BrowserPoolOptions } from './types/index.js';

// ─── Priority Queue ───────────────────────────────────────────────────────────
export { PriorityQueue } from './priority-queue/index.js';
export type { PriorityLevel, PriorityRequest, PriorityQueueOptions } from './types/index.js';

// ─── Cache Utilities ─────────────────────────────────────────────────────────
export { MemoryCache } from './cache/index.js';
export { ImageCache } from './cache/index.js';

// ─── Rate Limiter ────────────────────────────────────────────────────────────
export { RateLimiter, type RateLimiterConfig } from './rate-limiter/index.js';

// ─── Config Loader ───────────────────────────────────────────────────────────
export { loadConfigFile, validateConfig, parseRawConfig } from './config/index.js';

// ─── Stealth Utilities ───────────────────────────────────────────────────────
export { randomDelay, simulateMouseMovement, isCaptchaPage } from './stealth/index.js';

// ─── OpenTelemetry Tracing ────────────────────────────────────────────────────
export { initTracing, withSpan, type SpanAttributes } from './tracing/index.js';
