/**
 * @file tests/error-types.test.ts
 * @description Tests for all five typed error classes.
 */

import { describe, it, expect } from 'vitest';
import {
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  AnalysisError,
} from '../src/errors.js';

describe('ScraperError', () => {
  it('is an instance of Error', () => {
    const err = new ScraperError('test message');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ScraperError);
  });

  it('sets name to ScraperError', () => {
    const err = new ScraperError('test message');
    expect(err.name).toBe('ScraperError');
  });

  it('sets message correctly', () => {
    const err = new ScraperError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('defaults code to SCRAPER_ERROR', () => {
    const err = new ScraperError('test');
    expect(err.code).toBe('SCRAPER_ERROR');
  });

  it('accepts custom code', () => {
    const err = new ScraperError('timeout', { code: 'TIMEOUT' });
    expect(err.code).toBe('TIMEOUT');
  });

  it('defaults retryable to true', () => {
    const err = new ScraperError('test');
    expect(err.retryable).toBe(true);
  });

  it('accepts retryable: false', () => {
    const err = new ScraperError('test', { retryable: false });
    expect(err.retryable).toBe(false);
  });

  it('has a stack trace', () => {
    const err = new ScraperError('test');
    expect(err.stack).toBeDefined();
  });
});

describe('CaptchaError', () => {
  it('is an instance of ScraperError and Error', () => {
    const err = new CaptchaError('CAPTCHA found');
    expect(err).toBeInstanceOf(ScraperError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CaptchaError);
  });

  it('sets name to CaptchaError', () => {
    const err = new CaptchaError('CAPTCHA found');
    expect(err.name).toBe('CaptchaError');
  });

  it('sets code to CAPTCHA_DETECTED', () => {
    const err = new CaptchaError('CAPTCHA found');
    expect(err.code).toBe('CAPTCHA_DETECTED');
  });

  it('is not retryable', () => {
    const err = new CaptchaError('CAPTCHA found');
    expect(err.retryable).toBe(false);
  });
});

describe('RateLimitError', () => {
  it('is an instance of ScraperError and Error', () => {
    const err = new RateLimitError('rate limited');
    expect(err).toBeInstanceOf(ScraperError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it('sets name to RateLimitError', () => {
    const err = new RateLimitError('rate limited');
    expect(err.name).toBe('RateLimitError');
  });

  it('sets code to RATE_LIMITED by default', () => {
    const err = new RateLimitError('rate limited');
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('accepts custom code RATE_LIMIT_DAILY_CAP', () => {
    const err = new RateLimitError('daily cap', { code: 'RATE_LIMIT_DAILY_CAP' });
    expect(err.code).toBe('RATE_LIMIT_DAILY_CAP');
  });

  it('is retryable', () => {
    const err = new RateLimitError('rate limited');
    expect(err.retryable).toBe(true);
  });

  it('exposes retryAfterMs when provided', () => {
    const err = new RateLimitError('rate limited', { retryAfterMs: 30_000 });
    expect(err.retryAfterMs).toBe(30_000);
  });

  it('retryAfterMs is undefined when not provided', () => {
    const err = new RateLimitError('rate limited');
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe('CacheError', () => {
  it('is an instance of ScraperError and Error', () => {
    const err = new CacheError('cache failure');
    expect(err).toBeInstanceOf(ScraperError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CacheError);
  });

  it('sets name to CacheError', () => {
    const err = new CacheError('cache failure');
    expect(err.name).toBe('CacheError');
  });

  it('sets code to CACHE_ERROR', () => {
    const err = new CacheError('cache failure');
    expect(err.code).toBe('CACHE_ERROR');
  });

  it('is not retryable', () => {
    const err = new CacheError('cache failure');
    expect(err.retryable).toBe(false);
  });
});

describe('AnalysisError', () => {
  it('is an instance of ScraperError and Error', () => {
    const err = new AnalysisError('analysis failed');
    expect(err).toBeInstanceOf(ScraperError);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AnalysisError);
  });

  it('sets name to AnalysisError', () => {
    const err = new AnalysisError('analysis failed');
    expect(err.name).toBe('AnalysisError');
  });

  it('sets code to ANALYSIS_ERROR', () => {
    const err = new AnalysisError('analysis failed');
    expect(err.code).toBe('ANALYSIS_ERROR');
  });

  it('is not retryable', () => {
    const err = new AnalysisError('analysis failed');
    expect(err.retryable).toBe(false);
  });
});
