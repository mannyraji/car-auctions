/**
 * @file errors.ts
 * @description Typed error classes for the car-auctions shared library.
 *
 * Each class extends Error and carries a structured `code` (ErrorCode),
 * `retryable` flag, and optional `retryAfterMs`. Stack traces are NOT
 * surfaced publicly (constitution Pillar VI Rule 2).
 *
 * @since 001-shared-utilities-lib
 */

import type { ErrorCode } from './types/index.js';

// ─── Base options shared across all error constructors ─────────────────────────

interface BaseErrorOptions {
  /** Optional upstream cause for error chaining */
  cause?: unknown;
  /** Milliseconds to wait before retrying (only meaningful when retryable=true) */
  retryAfterMs?: number;
}

// ─── ScraperError ──────────────────────────────────────────────────────────────

/**
 * Raised when a navigation, upstream HTTP 5xx, or timeout occurs during scraping.
 *
 * @example
 * throw new ScraperError('Page load timed out', { cause: err });
 */
export class ScraperError extends Error {
  readonly code: ErrorCode = 'SCRAPER_ERROR';
  readonly retryable: boolean = true;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options?: BaseErrorOptions) {
    super(message);
    this.name = 'ScraperError';
    this.retryAfterMs = options?.retryAfterMs;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    // Ensure prototype chain is correct for instanceof checks
    Object.setPrototypeOf(this, ScraperError.prototype);
  }
}

// ─── CaptchaError ─────────────────────────────────────────────────────────────

/**
 * Raised when a CAPTCHA page is detected during scraping.
 * Not retryable — human intervention or proxy rotation required.
 *
 * @example
 * throw new CaptchaError('CAPTCHA detected on Copart lot page');
 */
export class CaptchaError extends Error {
  readonly code: ErrorCode = 'CAPTCHA_DETECTED';
  readonly retryable: boolean = false;
  readonly retryAfterMs: undefined = undefined;

  constructor(message: string, options?: Pick<BaseErrorOptions, 'cause'>) {
    super(message);
    this.name = 'CaptchaError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, CaptchaError.prototype);
  }
}

// ─── RateLimitError ───────────────────────────────────────────────────────────

/**
 * Raised when an HTTP 429 or 403 response indicates rate limiting.
 * Retryable after the specified delay.
 *
 * @example
 * throw new RateLimitError('Rate limited by Copart API', { retryAfterMs: 3000 });
 */
export class RateLimitError extends Error {
  readonly code: ErrorCode = 'RATE_LIMITED';
  readonly retryable: boolean = true;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options?: BaseErrorOptions) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = options?.retryAfterMs;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

// ─── CacheError ───────────────────────────────────────────────────────────────

/**
 * Raised when a SQLite read or write failure occurs in the cache layer.
 * Not retryable — a storage or schema error requires investigation.
 *
 * @example
 * throw new CacheError('Failed to write VIN cache entry', { cause: sqliteErr });
 */
export class CacheError extends Error {
  readonly code: ErrorCode = 'CACHE_ERROR';
  readonly retryable: boolean = false;
  readonly retryAfterMs: undefined = undefined;

  constructor(message: string, options?: Pick<BaseErrorOptions, 'cause'>) {
    super(message);
    this.name = 'CacheError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, CacheError.prototype);
  }
}

// ─── AnalysisError ────────────────────────────────────────────────────────────

/**
 * Raised when the scoring, vision, or profit calculation pipeline fails.
 * Not retryable — indicates a programming error or unexpected data shape.
 *
 * @example
 * throw new AnalysisError('Profit calculation produced NaN', { cause: err });
 */
export class AnalysisError extends Error {
  readonly code: ErrorCode = 'ANALYSIS_ERROR';
  readonly retryable: boolean = false;
  readonly retryAfterMs: undefined = undefined;

  constructor(message: string, options?: Pick<BaseErrorOptions, 'cause'>) {
    super(message);
    this.name = 'AnalysisError';
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, AnalysisError.prototype);
  }
}
