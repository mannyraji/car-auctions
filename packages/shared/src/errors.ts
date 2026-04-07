/**
 * @file src/errors.ts
 * @description Typed error hierarchy for @car-auctions/shared.
 * All errors are named exports with no module-scope side effects (NFR-001).
 */

import type { ErrorCode } from './types/index.js';

/**
 * Base class for all scraper-layer errors.
 *
 * @example
 * throw new ScraperError('Navigation timeout on Copart listing page', { code: 'TIMEOUT' });
 */
export class ScraperError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;

  constructor(
    message: string,
    options?: { code?: ErrorCode; retryable?: boolean }
  ) {
    super(message);
    this.name = 'ScraperError';
    this.code = options?.code ?? 'SCRAPER_ERROR';
    this.retryable = options?.retryable ?? true;
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a CAPTCHA challenge is detected. Non-retryable.
 * Callers MUST return stale cached data instead of propagating.
 *
 * @example
 * throw new CaptchaError('Copart CAPTCHA detected on search page');
 */
export class CaptchaError extends ScraperError {
  constructor(message: string) {
    super(message, { code: 'CAPTCHA_DETECTED', retryable: false });
    this.name = 'CaptchaError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown on HTTP 429, HTTP 403, or when the daily request cap is exceeded.
 *
 * @example
 * throw new RateLimitError('Copart returned 429', { retryAfterMs: 30_000 });
 */
export class RateLimitError extends ScraperError {
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options?: { retryAfterMs?: number; code?: ErrorCode }
  ) {
    super(message, {
      code: options?.code ?? 'RATE_LIMITED',
      retryable: true,
    });
    this.name = 'RateLimitError';
    this.retryAfterMs = options?.retryAfterMs;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown on SQLite cache read/write failures.
 *
 * @example
 * throw new CacheError('Failed to write VIN cache entry');
 */
export class CacheError extends ScraperError {
  constructor(message: string) {
    super(message, { code: 'CACHE_ERROR', retryable: false });
    this.name = 'CacheError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when the deal analysis pipeline fails (scoring, profit calc, vision).
 *
 * @example
 * throw new AnalysisError('Deal scorer produced NaN for lot 12345');
 */
export class AnalysisError extends ScraperError {
  constructor(message: string) {
    super(message, { code: 'ANALYSIS_ERROR', retryable: false });
    this.name = 'AnalysisError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
