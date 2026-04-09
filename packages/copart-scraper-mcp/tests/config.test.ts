import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import { validateConfig, parseRawConfig } from '../src/utils/config.js';

// We spy on console.warn to capture Option-B sanitized messages
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

afterEach(() => {
  warnSpy.mockClear();
});

afterAll(() => {
  warnSpy.mockRestore();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a complete, valid config payload.
 */
function validPayload() {
  return {
    rateLimit: {
      requestsPerSecond: 0.5,
      maxConcurrent: 2,
      backoffMultiplier: 3,
      maxBackoffMs: 30000,
      dailyCap: 300,
    },
    cache: {
      searchTtlMinutes: 10,
      listingTtlMinutes: 30,
      imageTtlHours: 12,
      soldTtlDays: 3,
      vinTtlDays: 60,
      lruMaxEntries: 100,
    },
    proxy: {
      url: 'http://proxy.example.com:8080',
      rotateOnFailure: false,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validateConfig — Zod validation', () => {
  describe('valid configs', () => {
    it('returns parsed config when all fields are valid', () => {
      const cfg = validateConfig(validPayload());
      expect(cfg.rateLimit.requestsPerSecond).toBe(0.5);
      expect(cfg.cache.lruMaxEntries).toBe(100);
      expect(cfg.proxy.url).toBe('http://proxy.example.com:8080');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('accepts null proxy.url', () => {
      const payload = { ...validPayload(), proxy: { url: null, rotateOnFailure: true } };
      const cfg = validateConfig(payload);
      expect(cfg.proxy.url).toBeNull();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('invalid configs → defaults + Option-B warning', () => {
    it('falls back to defaults when rateLimit.requestsPerSecond is 0', () => {
      const payload = validPayload();
      payload.rateLimit.requestsPerSecond = 0;
      const cfg = validateConfig(payload);
      // Default is 0.33
      expect(cfg.rateLimit.requestsPerSecond).toBe(0.33);
    });

    it('falls back to defaults when a required field is missing', () => {
      const payload = validPayload() as Record<string, unknown>;
      delete payload['rateLimit'];
      const cfg = validateConfig(payload);
      expect(cfg.rateLimit.dailyCap).toBe(500); // default
    });

    it('logs a sanitized warning (Option B) — shows field path + message, no stack traces', () => {
      const payload = validPayload();
      (payload.cache as Record<string, unknown>).lruMaxEntries = -5;
      validateConfig(payload);

      expect(warnSpy).toHaveBeenCalledOnce();
      const [msg] = warnSpy.mock.calls[0] as [string];
      expect(msg).toContain('[config]');
      // Field path must be present
      expect(msg).toContain('cache.lruMaxEntries');
      // Must NOT contain stack-trace noise or file-system paths
      expect(msg).not.toMatch(/at .*:\d+:\d+/);
      expect(msg).not.toMatch(/\/home\//);
      expect(msg).not.toMatch(/node_modules/);
    });

    it('reports all failing fields in a single warning message', () => {
      const payload = validPayload();
      (payload.rateLimit as Record<string, unknown>).maxConcurrent = -1;
      (payload.cache as Record<string, unknown>).searchTtlMinutes = 0;
      validateConfig(payload);

      expect(warnSpy).toHaveBeenCalledOnce();
      const [msg] = warnSpy.mock.calls[0] as [string];
      expect(msg).toContain('rateLimit.maxConcurrent');
      expect(msg).toContain('cache.searchTtlMinutes');
    });
  });

  describe('empty / missing config', () => {
    it('returns defaults silently when config is empty object {}', () => {
      const cfg = validateConfig({});
      expect(cfg.rateLimit.dailyCap).toBe(500);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});

describe('parseRawConfig', () => {
  it('returns defaults with warning for invalid JSON', () => {
    const cfg = parseRawConfig('{ not valid json }');
    expect(cfg.rateLimit.dailyCap).toBe(500);
    expect(warnSpy).toHaveBeenCalledOnce();
    const [msg] = warnSpy.mock.calls[0] as [string];
    expect(msg).toContain('[config]');
  });

  it('returns parsed config for valid JSON', () => {
    const cfg = parseRawConfig(JSON.stringify(validPayload()));
    expect(cfg.rateLimit.requestsPerSecond).toBe(0.5);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns defaults silently for empty JSON object', () => {
    const cfg = parseRawConfig('{}');
    expect(cfg.rateLimit.dailyCap).toBe(500);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
