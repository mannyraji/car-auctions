/**
 * @car-auctions/shared — Error classes
 *
 * All application-specific error types with MCP serialization support.
 */
import type { ErrorCode, ToolError } from './types/index.js';

/**
 * Abstract base class for all application errors.
 * Provides `toToolError()` for MCP response serialization.
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = this.constructor.name;
    this.retryAfterMs = retryAfterMs;
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serialize this error to a ToolError shape for MCP responses.
   * @example
   * const err = new ScraperError('Page timed out');
   * return { success: false, error: err.toToolError(), ... };
   */
  toToolError(): ToolError {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs ?? null,
    };
  }
}

/**
 * Scraping failure — Playwright crash, navigation timeout, or upstream 5xx.
 * @example
 * throw new ScraperError('Navigation timeout after 30s', 'TIMEOUT', false, 5000);
 */
export class ScraperError extends AppError {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(
    message: string,
    code: 'SCRAPER_ERROR' | 'TIMEOUT' = 'SCRAPER_ERROR',
    retryable = false,
    retryAfterMs?: number
  ) {
    super(message, retryAfterMs);
    this.code = code;
    this.retryable = code === 'TIMEOUT' ? true : retryable;
  }
}

/**
 * CAPTCHA detected — the target site presented a challenge page.
 * Not retryable without human intervention.
 * @example
 * throw new CaptchaError('Cloudflare turnstile detected on /search');
 */
export class CaptchaError extends AppError {
  readonly code: ErrorCode = 'CAPTCHA_DETECTED';
  readonly retryable = false;
}

/**
 * Rate limit hit — HTTP 429 or 403 from the target.
 * Always retryable; include retryAfterMs when known.
 * @example
 * throw new RateLimitError('429 from Copart search API', 60_000);
 */
export class RateLimitError extends AppError {
  readonly code: ErrorCode = 'RATE_LIMITED';
  readonly retryable = true;

  constructor(message: string, retryAfterMs?: number) {
    super(message, retryAfterMs);
  }
}

/**
 * Cache read/write failure — SQLite error or serialization problem.
 * Not retryable; the caller should fall back to a live fetch.
 * @example
 * throw new CacheError('SQLite SQLITE_CORRUPT on vin-cache.sqlite');
 */
export class CacheError extends AppError {
  readonly code: ErrorCode = 'CACHE_ERROR';
  readonly retryable = false;
}

/**
 * Analysis pipeline failure — scoring, profit calculation, or vision call failed.
 * Not retryable with the same inputs.
 * @example
 * throw new AnalysisError('Vision model returned empty response for lot 12345');
 */
export class AnalysisError extends AppError {
  readonly code: ErrorCode = 'ANALYSIS_ERROR';
  readonly retryable = false;
}
