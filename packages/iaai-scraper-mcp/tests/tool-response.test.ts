import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createSuccessResponse,
  toToolError,
  withToolSpan,
  buildToolResponse,
  createErrorResponse,
} from '../src/utils/tool-response.js';
import { ScraperError, CaptchaError, RateLimitError, CacheError } from '@car-auctions/shared';

afterEach(() => {
  vi.useRealTimers();
});

// ─── createSuccessResponse ─────────────────────────────────────────────────────

describe('createSuccessResponse', () => {
  it('produces the correct MCP content envelope for a fresh result', () => {
    const data = { lot: '12345', make: 'Toyota' };
    const result = createSuccessResponse(data);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]!.type).toBe('text');

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(data);
    expect(parsed.cached).toBe(false);
    expect(parsed.stale).toBe(false);
    expect(parsed.cachedAt).toBeNull();
    expect(parsed.error).toBeNull();
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('passes cached=true, stale=true, and cachedAt when provided', () => {
    const cachedAt = '2026-04-09T10:00:00.000Z';
    const result = createSuccessResponse({ value: 1 }, true, true, cachedAt);

    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(true);
    expect(parsed.cached).toBe(true);
    expect(parsed.stale).toBe(true);
    expect(parsed.cachedAt).toBe(cachedAt);
  });

  it('defaults cached=false, stale=false, cachedAt=null when not provided', () => {
    const result = createSuccessResponse([]);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.cached).toBe(false);
    expect(parsed.stale).toBe(false);
    expect(parsed.cachedAt).toBeNull();
  });
});

// ─── toToolError ──────────────────────────────────────────────────────────────

describe('toToolError', () => {
  it('maps ScraperError to SCRAPER_ERROR code', () => {
    const err = new ScraperError('Playwright crash');
    const toolError = toToolError(err);
    expect(toolError.code).toBe('SCRAPER_ERROR');
    expect(toolError.message).toBe('Playwright crash');
    expect(toolError.retryable).toBe(false);
    expect(toolError.retryAfterMs).toBeNull();
  });

  it('maps ScraperError with TIMEOUT code', () => {
    const err = new ScraperError('Navigation timeout', 'TIMEOUT');
    const toolError = toToolError(err);
    expect(toolError.code).toBe('TIMEOUT');
    expect(toolError.retryable).toBe(true);
  });

  it('maps CaptchaError to CAPTCHA_DETECTED code', () => {
    const err = new CaptchaError('CAPTCHA detected');
    const toolError = toToolError(err);
    expect(toolError.code).toBe('CAPTCHA_DETECTED');
    expect(toolError.retryable).toBe(false);
    expect(toolError.retryAfterMs).toBeNull();
  });

  it('maps RateLimitError to RATE_LIMITED code with retryAfterMs', () => {
    const err = new RateLimitError('Too many requests', 30000);
    const toolError = toToolError(err);
    expect(toolError.code).toBe('RATE_LIMITED');
    expect(toolError.retryable).toBe(true);
    expect(toolError.retryAfterMs).toBe(30000);
  });

  it('maps CacheError to CACHE_ERROR code', () => {
    const err = new CacheError('SQLite write failure');
    const toolError = toToolError(err);
    expect(toolError.code).toBe('CACHE_ERROR');
    expect(toolError.retryable).toBe(false);
    expect(toolError.retryAfterMs).toBeNull();
  });

  it('maps generic Error to UNKNOWN_ERROR', () => {
    const err = new Error('Something went wrong');
    const toolError = toToolError(err);
    expect(toolError.code).toBe('UNKNOWN_ERROR');
    expect(toolError.message).toBe('An internal error occurred');
    expect(toolError.retryable).toBe(false);
  });

  it('maps non-Error unknown value to UNKNOWN_ERROR', () => {
    const toolError = toToolError('string error');
    expect(toolError.code).toBe('UNKNOWN_ERROR');
    expect(toolError.message).toBe('An unknown error occurred');
  });
});

// ─── buildToolResponse ────────────────────────────────────────────────────────

describe('buildToolResponse', () => {
  it('defaults cached/stale/cachedAt when not provided', () => {
    const response = buildToolResponse({ success: true, data: 42, error: null });
    expect(response.cached).toBe(false);
    expect(response.stale).toBe(false);
    expect(response.cachedAt).toBeNull();
    expect(typeof response.timestamp).toBe('string');
  });

  it('preserves explicit cached/stale/cachedAt values', () => {
    const cachedAt = '2026-01-01T00:00:00.000Z';
    const response = buildToolResponse({
      success: false,
      data: null,
      error: null,
      cached: true,
      stale: true,
      cachedAt,
    });
    expect(response.cached).toBe(true);
    expect(response.stale).toBe(true);
    expect(response.cachedAt).toBe(cachedAt);
  });
});

// ─── createErrorResponse ──────────────────────────────────────────────────────

describe('createErrorResponse', () => {
  it('builds error content from a CaptchaError', () => {
    const result = createErrorResponse(new CaptchaError('Bot check'));
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(false);
    expect(parsed.data).toBeNull();
    expect(parsed.error.code).toBe('CAPTCHA_DETECTED');
  });

  it('builds error content from an unknown non-Error value', () => {
    const result = createErrorResponse(null);
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('UNKNOWN_ERROR');
  });
});

// ─── withToolSpan ─────────────────────────────────────────────────────────────

describe('withToolSpan', () => {
  it('returns the handler result on success', async () => {
    const data = { stock_number: 'ABC123' };
    const handler = vi.fn().mockResolvedValue(createSuccessResponse(data));

    const result = await withToolSpan('iaai_search', handler);
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(data);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('returns structured error content when handler throws ScraperError', async () => {
    const handler = vi.fn().mockRejectedValue(new ScraperError('Playwright crash'));

    const result = await withToolSpan('iaai_search', handler);
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('SCRAPER_ERROR');
  });

  it('returns structured error content when handler throws CaptchaError', async () => {
    const handler = vi.fn().mockRejectedValue(new CaptchaError('CAPTCHA on page'));

    const result = await withToolSpan('iaai_get_listing', handler);
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('CAPTCHA_DETECTED');
  });

  it('returns structured error content when handler throws RateLimitError', async () => {
    const handler = vi.fn().mockRejectedValue(new RateLimitError('429', 60000));

    const result = await withToolSpan('iaai_sold_history', handler);
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('RATE_LIMITED');
    expect(parsed.error.retryAfterMs).toBe(60000);
  });

  it('returns structured error content when handler throws CacheError', async () => {
    const handler = vi.fn().mockRejectedValue(new CacheError('SQLite error'));

    const result = await withToolSpan('iaai_watch_listing', handler);
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('CACHE_ERROR');
  });

  it('returns TIMEOUT ScraperError when handler exceeds 60 seconds', async () => {
    vi.useFakeTimers();

    const handler = vi.fn().mockImplementation(
      () => new Promise<never>(() => {}) // never resolves
    );

    const promise = withToolSpan('iaai_search', handler);

    // Advance past the 60-second timeout
    await vi.advanceTimersByTimeAsync(60_001);

    const result = await promise;
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('TIMEOUT');
    expect(parsed.error.retryable).toBe(true);
  });
});
