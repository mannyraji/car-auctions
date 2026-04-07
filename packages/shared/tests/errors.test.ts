import { describe, it, expect } from 'vitest';
import {
  AppError,
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  AnalysisError,
} from '../src/errors.js';

describe('Error classes', () => {
  describe('ScraperError', () => {
    it('defaults code to SCRAPER_ERROR and retryable to false', () => {
      const err = new ScraperError('page crashed');
      expect(err.code).toBe('SCRAPER_ERROR');
      expect(err.retryable).toBe(false);
      expect(err.message).toBe('page crashed');
    });

    it('sets TIMEOUT code and retryable=true when code is TIMEOUT', () => {
      const err = new ScraperError('timed out', 'TIMEOUT');
      expect(err.code).toBe('TIMEOUT');
      expect(err.retryable).toBe(true);
    });

    it('accepts explicit retryAfterMs', () => {
      const err = new ScraperError('crash', 'SCRAPER_ERROR', false, 5000);
      expect(err.retryAfterMs).toBe(5000);
    });

    it('is instanceof ScraperError and AppError', () => {
      const err = new ScraperError('test');
      expect(err).toBeInstanceOf(ScraperError);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('toToolError serializes correctly', () => {
      const err = new ScraperError('nav timeout', 'TIMEOUT', true, 3000);
      const toolErr = err.toToolError();
      expect(toolErr.code).toBe('TIMEOUT');
      expect(toolErr.message).toBe('nav timeout');
      expect(toolErr.retryable).toBe(true);
      expect(toolErr.retryAfterMs).toBe(3000);
    });
  });

  describe('CaptchaError', () => {
    it('sets correct code and retryable=false', () => {
      const err = new CaptchaError('cloudflare detected');
      expect(err.code).toBe('CAPTCHA_DETECTED');
      expect(err.retryable).toBe(false);
    });

    it('is instanceof CaptchaError and AppError', () => {
      const err = new CaptchaError('test');
      expect(err).toBeInstanceOf(CaptchaError);
      expect(err).toBeInstanceOf(AppError);
    });

    it('toToolError has null retryAfterMs', () => {
      const err = new CaptchaError('blocked');
      const toolErr = err.toToolError();
      expect(toolErr.retryAfterMs).toBeNull();
      expect(toolErr.code).toBe('CAPTCHA_DETECTED');
    });
  });

  describe('RateLimitError', () => {
    it('sets code=RATE_LIMITED and retryable=true', () => {
      const err = new RateLimitError('429');
      expect(err.code).toBe('RATE_LIMITED');
      expect(err.retryable).toBe(true);
    });

    it('forwards retryAfterMs', () => {
      const err = new RateLimitError('throttled', 60000);
      expect(err.retryAfterMs).toBe(60000);
      expect(err.toToolError().retryAfterMs).toBe(60000);
    });

    it('is instanceof RateLimitError and AppError', () => {
      expect(new RateLimitError('test')).toBeInstanceOf(RateLimitError);
      expect(new RateLimitError('test')).toBeInstanceOf(AppError);
    });
  });

  describe('CacheError', () => {
    it('sets code=CACHE_ERROR and retryable=false', () => {
      const err = new CacheError('sqlite corrupt');
      expect(err.code).toBe('CACHE_ERROR');
      expect(err.retryable).toBe(false);
    });

    it('is instanceof CacheError and AppError', () => {
      expect(new CacheError('test')).toBeInstanceOf(CacheError);
      expect(new CacheError('test')).toBeInstanceOf(AppError);
    });
  });

  describe('AnalysisError', () => {
    it('sets code=ANALYSIS_ERROR and retryable=false', () => {
      const err = new AnalysisError('scoring failed');
      expect(err.code).toBe('ANALYSIS_ERROR');
      expect(err.retryable).toBe(false);
    });

    it('is instanceof AnalysisError and AppError', () => {
      expect(new AnalysisError('test')).toBeInstanceOf(AnalysisError);
      expect(new AnalysisError('test')).toBeInstanceOf(AppError);
    });
  });

  describe('ToolError shape', () => {
    it('always returns all required ToolError fields', () => {
      const classes = [
        new ScraperError('s'),
        new CaptchaError('c'),
        new RateLimitError('r'),
        new CacheError('ca'),
        new AnalysisError('a'),
      ];
      for (const err of classes) {
        const te = err.toToolError();
        expect(typeof te.code).toBe('string');
        expect(typeof te.message).toBe('string');
        expect(typeof te.retryable).toBe('boolean');
        expect(te.retryAfterMs === null || typeof te.retryAfterMs === 'number').toBe(true);
      }
    });
  });
});
