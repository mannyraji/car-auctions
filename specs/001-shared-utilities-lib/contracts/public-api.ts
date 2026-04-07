/**
 * @file contracts/public-api.ts
 * @description Public API surface contract for @car-auctions/shared.
 *
 * This file defines the exact exported function/class signatures that will be
 * implemented in packages/shared/src/. Consumers import from the package barrel:
 *
 *   import { normalizeCopart, decodeVin, BrowserPool, ... } from '@car-auctions/shared';
 *
 * Internal modules (nhtsa-client.ts, sqlite-cache.ts, normalizer/codes.ts, etc.)
 * are NOT part of the public API and MUST NOT be re-exported from src/index.ts.
 */

import type {
  AuctionListing,
  BrowserConfig,
  CopartRawListing,
  ErrorCode,
  IaaiRawListing,
  PriorityLevel,
  PriorityRequest,
  SpanAttributes,
  VINDecodeResult,
} from './types';

// ============================================================
// Errors — src/errors.ts
// ============================================================

/**
 * Base class for all scraper-layer errors.
 * @example
 * throw new ScraperError('Navigation timeout on Copart listing page', { code: 'TIMEOUT' });
 */
export declare class ScraperError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  constructor(message: string, options?: { code?: ErrorCode; retryable?: boolean });
}

/**
 * Thrown when a CAPTCHA challenge is detected. Non-retryable.
 * Callers MUST return stale cached data instead of propagating.
 * @example
 * throw new CaptchaError('Copart CAPTCHA detected on search page');
 */
export declare class CaptchaError extends ScraperError {
  constructor(message: string);
}

/**
 * Thrown on HTTP 429, HTTP 403, or when the daily request cap is exceeded.
 * @example
 * throw new RateLimitError('Copart returned 429', { retryAfterMs: 30_000 });
 */
export declare class RateLimitError extends ScraperError {
  readonly retryAfterMs?: number;
  constructor(message: string, options?: { retryAfterMs?: number; code?: ErrorCode });
}

/**
 * Thrown on SQLite cache read/write failures.
 * @example
 * throw new CacheError('Failed to write VIN cache entry');
 */
export declare class CacheError extends ScraperError {
  constructor(message: string);
}

/**
 * Thrown when the deal analysis pipeline fails (scoring, profit calc, vision).
 * @example
 * throw new AnalysisError('Deal scorer produced NaN for lot 12345');
 */
export declare class AnalysisError extends ScraperError {
  constructor(message: string);
}

// ============================================================
// Auction Normalizer — src/normalizer/index.ts
// ============================================================

/**
 * Converts a raw Copart API response into a normalized AuctionListing.
 *
 * Field mapping: lotNumberStr→lot_number, mkn→make, mmod→model, lcy→year,
 * dd→damage_primary, sdd→damage_secondary, orr→odometer, hk→has_keys,
 * dynamicBidAmount→current_bid, ad→sale_date, la→location, tims.full[0]→thumbnail_url.
 *
 * Unknown or missing fields degrade gracefully — never throws on unexpected input.
 *
 * @example
 * const listing = normalizeCopart(rawCopartData);
 * // listing.source === 'copart'
 * // listing.has_keys === true (boolean from raw boolean hk field)
 */
export declare function normalizeCopart(raw: CopartRawListing): AuctionListing;

/**
 * Converts a raw IAAI API response into a normalized AuctionListing.
 *
 * Includes type coercions: hasKeys "YES"/"NO" → boolean, titleCode → human-readable label
 * via TITLE_CODE_MAP (SV→Salvage, CL→Clean, RB→Rebuilt; unknown→"Unknown" + warn).
 *
 * Unknown or missing fields degrade gracefully — never throws on unexpected input.
 *
 * @example
 * const listing = normalizeIaai(rawIaaiData);
 * // listing.source === 'iaai'
 * // listing.has_keys === true (coerced from "YES")
 * // listing.title_type === 'Salvage' (from titleCode "SV")
 */
export declare function normalizeIaai(raw: IaaiRawListing): AuctionListing;

// ============================================================
// VIN Decoder — src/vin-decoder/index.ts
// ============================================================

/**
 * Interface for a pluggable VIN decode result cache.
 * The default implementation uses better-sqlite3 (WAL mode).
 * An LruVinCache implementation is also exported for use in tests.
 */
export interface VinCache {
  /** Returns cached result or null if not found / expired. */
  get(vin: string): VINDecodeResult | null;
  /** Stores result with the given TTL in milliseconds. */
  set(vin: string, result: VINDecodeResult, ttlMs: number): void;
}

/**
 * Validates a VIN without making any network calls.
 *
 * Rules: exactly 17 alphanumeric characters; characters I, O, Q are rejected.
 *
 * @returns true if valid, false otherwise.
 * @example
 * validateVin('1HGBH41JXMN109186') // true
 * validateVin('1HGBH41JXMN10918O') // false — contains O
 * validateVin('1HGBH41')           // false — too short
 */
export declare function validateVin(vin: string): boolean;

/**
 * Decodes a VIN using the free NHTSA vPIC API with optional caching.
 *
 * - Validates VIN before any network call (throws ScraperError with code
 *   VALIDATION_ERROR on invalid VIN)
 * - Checks cache first; returns cached result if within TTL (90 days default)
 * - On NHTSA API failure: throws ScraperError with code SCRAPER_ERROR
 * - On partial decode (NHTSA ErrorCode !== "0"): returns available fields +
 *   sets decode_notes; does NOT throw
 *
 * @param vin - 17-character VIN
 * @param options.cache - Optional VinCache implementation. If omitted, no caching is applied.
 * @param options.ttlMs - Cache TTL in ms. Default: 90 * 24 * 60 * 60 * 1000 (90 days)
 *
 * @example
 * const cache = new SqliteVinCache('./data/vin-cache.sqlite');
 * const specs = await decodeVin('1HGBH41JXMN109186', { cache });
 * // specs.make === 'Honda', specs.model === 'Civic', specs.year === 1991
 */
export declare function decodeVin(
  vin: string,
  options?: { cache?: VinCache; ttlMs?: number }
): Promise<VINDecodeResult>;

// ============================================================
// MCP Server Bootstrap — src/mcp-helpers.ts
// ============================================================

/** Options for createMcpServer(). */
export interface McpServerOptions {
  /** Server name reported in MCP handshake. */
  name: string;
  /** Server version reported in MCP handshake. */
  version: string;
  /** MCP server capabilities (tools, prompts, resources). */
  capabilities: Record<string, unknown>;
  /** Callback to register all MCP tool handlers on the server instance. */
  registerTools: (server: unknown) => void;
  /**
   * Transport override. Defaults to process.env.TRANSPORT ('stdio' | 'sse' | 'websocket').
   * Falls back to 'stdio' if env var is not set.
   */
  transport?: 'stdio' | 'sse' | 'websocket';
  /** HTTP port for SSE transport. Defaults to process.env.PORT ?? 3000. */
  port?: number;
  /** WebSocket port for websocket transport. Defaults to process.env.WS_PORT ?? 3001. */
  wsPort?: number;
}

/**
 * Bootstraps an MCP server with the specified transport.
 *
 * Supports:
 * - stdio: Claude Desktop integration; listens on stdin/stdout
 * - sse: HTTP SSE transport; listens on `port` for /sse connections
 * - websocket: WebSocket transport; listens on `wsPort`
 *
 * Transport is selected by (in order): options.transport → TRANSPORT env var → 'stdio'
 *
 * @example
 * await createMcpServer({
 *   name: 'copart-scraper',
 *   version: '1.0.0',
 *   capabilities: { tools: {} },
 *   registerTools: (server) => {
 *     server.tool('copart_search', searchSchema, copartSearch);
 *   },
 * });
 */
export declare function createMcpServer(options: McpServerOptions): Promise<void>;

// ============================================================
// Browser Pool — src/browser-pool.ts
// ============================================================

/** Options for BrowserPool constructor. */
export interface BrowserPoolOptions {
  /**
   * Maximum number of concurrent browser contexts.
   * Default: 3 (NFR-004).
   */
  maxConcurrency?: number;
  /** Whether to use headless mode. Default: true */
  headless?: boolean;
  /** Viewport dimensions. Default: { width: 1280, height: 720 } */
  viewport?: { width: number; height: number };
  /**
   * Proxy URL for all network traffic.
   * Default: process.env.PROXY_URL
   * IMPORTANT: Never hardcode proxy URLs in source code (Constitution Pillar I Rule 4).
   */
  proxyUrl?: string;
  /** Navigation timeout in ms. Default: 30_000 (Constitution Pillar IV Rule 5) */
  navigationTimeoutMs?: number;
  /** Minimum random delay between user-facing page actions (ms). Default: 2_000 */
  actionDelayMinMs?: number;
  /** Maximum random delay between user-facing page actions (ms). Default: 5_000 */
  actionDelayMaxMs?: number;
}

/**
 * Manages a shared Playwright browser instance with stealth plugin and proxy support.
 *
 * Key behaviors:
 * - Lazily launches a single browser on first getContext() call
 * - Stealth plugin (puppeteer-extra-plugin-stealth) is always active (Constitution Pillar IV Rule 3)
 * - Maximum concurrent contexts enforced by maxConcurrency (default: 3)
 * - shutdown() is idempotent and reference-counted (edge case: dual shutdown calls)
 * - Proxy URL sourced from options.proxyUrl ?? process.env.PROXY_URL
 *
 * @example
 * const pool = new BrowserPool({ maxConcurrency: 3 });
 * const ctx = await pool.getContext();
 * const page = await ctx.newPage();
 * await page.goto('https://www.copart.com', { timeout: 30_000 });
 * await pool.releaseContext(ctx);
 * await pool.shutdown(); // idempotent
 */
export declare class BrowserPool {
  constructor(options?: BrowserPoolOptions);

  /**
   * Returns a new browser context from the shared browser instance.
   * If the browser is not yet launched, launches it first.
   * Throws ScraperError if maxConcurrency is already reached.
   */
  getContext(config?: Partial<BrowserConfig>): Promise<unknown>; // BrowserContext

  /**
   * Releases a browser context back to the pool (closes it).
   * Decrements the active context counter.
   */
  releaseContext(context: unknown): Promise<void>; // context: BrowserContext

  /**
   * Shuts down the underlying browser process.
   * Idempotent — calling multiple times from different scrapers is safe.
   * Waits for the browser to close before resolving.
   */
  shutdown(): Promise<void>;
}

// ============================================================
// Priority Queue — src/priority-queue.ts
// ============================================================

/** Configuration for PriorityQueue. */
export interface PriorityQueueOptions {
  /**
   * Token bucket rate limit: one request per `rateLimitIntervalMs` ms.
   * Default: 3_000 (1 req per 3 seconds, per Constitution Pillar IV Rule 1).
   */
  rateLimitIntervalMs?: number;
  /**
   * Starvation prevention threshold in ms.
   * Low/background tasks are guaranteed execution at least once per this interval.
   * Default: 60_000 (60 seconds).
   */
  starvationThresholdMs?: number;
  /**
   * Max time to wait for a token before rejecting the request.
   * Maps per priority level (critical items bypass this).
   * Defaults: critical=0, high=2000, normal=5000, low=10000, background=30000
   */
  maxWaitMs?: Partial<Record<PriorityLevel, number>>;
}

/**
 * Priority-aware request queue with token bucket rate limiting.
 *
 * Design:
 * - Five priority tiers: critical > high > normal > low > background
 * - critical requests bypass queue ordering but still consume a rate limit token
 * - Starvation prevention: low/background tasks guaranteed 1 slot per 60s
 * - Rate limit: configurable token bucket (default 1 req/3s)
 * - FIFO within each priority tier
 * - Per-process singleton pattern recommended (see docs/spec.md § Priority Queue)
 *
 * @example
 * const queue = new PriorityQueue({ rateLimitIntervalMs: 3_000 });
 *
 * // Normal-priority request
 * const result = await queue.enqueue('normal', async () => {
 *   return fetchCopartListing(lotId);
 * });
 *
 * // Critical bypass (still rate-limited)
 * const urgentResult = await queue.enqueue('critical', async () => {
 *   return fetchCopartListing(urgentLotId);
 * });
 */
export declare class PriorityQueue {
  constructor(options?: PriorityQueueOptions);

  /**
   * Enqueues an operation at the given priority level.
   *
   * For 'critical': bypasses queue ordering; executes as soon as a rate limit
   * token is available (may still wait up to rateLimitIntervalMs).
   *
   * For all other levels: waits for queue position and token availability.
   * Rejects with ScraperError (code RATE_LIMITED) if maxWaitMs for the level is exceeded.
   *
   * @param priority - Priority level for this request
   * @param fn - Async operation to execute
   * @returns Promise resolving to the operation result
   */
  enqueue<T>(priority: PriorityLevel, fn: () => Promise<T>): Promise<T>;

  /**
   * Returns the current queue depth by priority level.
   * Useful for monitoring and rate limiter health checks.
   */
  getQueueDepth(): Record<PriorityLevel, number>;

  /**
   * Drains the queue and stops the dispatch loop.
   * In-flight requests complete; pending requests are rejected.
   */
  shutdown(): Promise<void>;
}

// ============================================================
// OpenTelemetry Tracing — src/tracing.ts
// ============================================================

/**
 * Initializes OpenTelemetry tracing for the calling package.
 *
 * Behavior:
 * - If OTEL_EXPORTER_OTLP_ENDPOINT is NOT set: complete no-op, zero overhead
 * - If set: starts NodeSDK with OTLPTraceExporter + auto-instrumentations
 * - Idempotent — calling multiple times is safe
 * - OTLP endpoint unreachable: export errors are swallowed; app continues normally
 *
 * Must be called once at application startup, before any MCP tool handlers are registered.
 *
 * @param serviceName - Service name for span metadata (e.g. 'copart-scraper-mcp')
 *
 * @example
 * // In packages/copart-scraper-mcp/src/index.ts:
 * initTracing('copart-scraper-mcp');
 * await createMcpServer({ name: 'copart-scraper', ... });
 */
export declare function initTracing(serviceName: string): void;

/**
 * Wraps an async operation in an OpenTelemetry span.
 *
 * When tracing is disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set), this is a
 * pure pass-through with zero overhead — no span is created.
 *
 * When tracing is enabled:
 * - Creates an active span with the given name and initial attributes
 * - Sets tool.status='ok' and tool.duration_ms on success
 * - Sets span status ERROR (without stack trace) and tool.status='error' on failure
 * - Always calls span.end()
 *
 * Span naming convention: '{package}.{operation}' (e.g. 'copart.search', 'cache.read')
 * Per Constitution Pillar VI Rule 2: stack traces MUST NOT be attached to spans.
 *
 * @example
 * export async function copartSearch(params: SearchParams) {
 *   return withSpan('copart.search', { 'tool.name': 'copart_search', 'tool.source': 'copart' }, async () => {
 *     const result = await scraper.search(params);
 *     return result;
 *   });
 * }
 */
export declare function withSpan<T>(
  name: string,
  attributes: Partial<SpanAttributes>,
  fn: () => Promise<T>
): Promise<T>;
