/**
 * @file errors.test.ts
 * @description Tests for all five shared error classes.
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
  it('has correct code', () => {
    const err = new ScraperError('test');
    expect(err.code).toBe('SCRAPER_ERROR');
  });

  it('is retryable', () => {
    const err = new ScraperError('test');
    expect(err.retryable).toBe(true);
  });

  it('extends Error', () => {
    const err = new ScraperError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ScraperError);
  });

  it('has correct name', () => {
    const err = new ScraperError('navigation failed');
    expect(err.name).toBe('ScraperError');
  });

  it('sets message', () => {
    const err = new ScraperError('page timed out');
    expect(err.message).toBe('page timed out');
  });

  it('accepts retryAfterMs option', () => {
    const err = new ScraperError('timeout', { retryAfterMs: 5000 });
    expect(err.retryAfterMs).toBe(5000);
  });

  it('accepts cause option', () => {
    const cause = new Error('root cause');
    const err = new ScraperError('wrapper', { cause });
    expect(err.cause).toBe(cause);
  });

  it('has undefined retryAfterMs by default', () => {
    const err = new ScraperError('test');
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe('CaptchaError', () => {
  it('has correct code', () => {
    const err = new CaptchaError('captcha detected');
    expect(err.code).toBe('CAPTCHA_DETECTED');
  });

  it('is NOT retryable', () => {
    const err = new CaptchaError('captcha detected');
    expect(err.retryable).toBe(false);
  });

  it('extends Error and CaptchaError', () => {
    const err = new CaptchaError('captcha detected');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CaptchaError);
  });

  it('has correct name', () => {
    const err = new CaptchaError('detected');
    expect(err.name).toBe('CaptchaError');
  });

  it('has undefined retryAfterMs', () => {
    const err = new CaptchaError('test');
    expect(err.retryAfterMs).toBeUndefined();
  });

  it('accepts cause option', () => {
    const cause = new Error('inner');
    const err = new CaptchaError('captcha', { cause });
    expect(err.cause).toBe(cause);
  });
});

describe('RateLimitError', () => {
  it('has correct code', () => {
    const err = new RateLimitError('rate limited');
    expect(err.code).toBe('RATE_LIMITED');
  });

  it('is retryable', () => {
    const err = new RateLimitError('rate limited');
    expect(err.retryable).toBe(true);
  });

  it('extends Error and RateLimitError', () => {
    const err = new RateLimitError('rate limited');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimitError);
  });

  it('has correct name', () => {
    const err = new RateLimitError('test');
    expect(err.name).toBe('RateLimitError');
  });

  it('accepts retryAfterMs', () => {
    const err = new RateLimitError('rate limited', { retryAfterMs: 3000 });
    expect(err.retryAfterMs).toBe(3000);
  });
});

describe('CacheError', () => {
  it('has correct code', () => {
    const err = new CacheError('sqlite failed');
    expect(err.code).toBe('CACHE_ERROR');
  });

  it('is NOT retryable', () => {
    const err = new CacheError('sqlite failed');
    expect(err.retryable).toBe(false);
  });

  it('extends Error and CacheError', () => {
    const err = new CacheError('sqlite failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CacheError);
  });

  it('has correct name', () => {
    const err = new CacheError('test');
    expect(err.name).toBe('CacheError');
  });

  it('has undefined retryAfterMs', () => {
    const err = new CacheError('test');
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe('AnalysisError', () => {
  it('has correct code', () => {
    const err = new AnalysisError('scoring failed');
    expect(err.code).toBe('ANALYSIS_ERROR');
  });

  it('is NOT retryable', () => {
    const err = new AnalysisError('scoring failed');
    expect(err.retryable).toBe(false);
  });

  it('extends Error and AnalysisError', () => {
    const err = new AnalysisError('scoring failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AnalysisError);
  });

  it('has correct name', () => {
    const err = new AnalysisError('test');
    expect(err.name).toBe('AnalysisError');
  });

  it('accepts cause option', () => {
    const cause = new TypeError('NaN');
    const err = new AnalysisError('profit NaN', { cause });
    expect(err.cause).toBe(cause);
  });

  it('has undefined retryAfterMs', () => {
    const err = new AnalysisError('test');
    expect(err.retryAfterMs).toBeUndefined();
  });
});

describe('Error class distinctions', () => {
  it('ScraperError is not an instance of CaptchaError', () => {
    const err = new ScraperError('test');
    expect(err).not.toBeInstanceOf(CaptchaError);
  });

  it('CaptchaError is not an instance of RateLimitError', () => {
    const err = new CaptchaError('test');
    expect(err).not.toBeInstanceOf(RateLimitError);
  });

  it('all errors produce a stack trace property', () => {
    const errors = [
      new ScraperError('a'),
      new CaptchaError('b'),
      new RateLimitError('c'),
      new CacheError('d'),
      new AnalysisError('e'),
    ];
    for (const err of errors) {
      expect(err.stack).toBeTruthy();
    }
  });
});
