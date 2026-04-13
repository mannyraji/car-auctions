/**
 * Unit tests for IAAI MCP bootstrap utilities
 *
 * Covers:
 *  - resolveTransport(): TRANSPORT normalization, ws alias, invalid value rejection
 *  - assertRequiredCredentials(): missing IAAI_EMAIL / IAAI_PASSWORD detection
 *  - closeResources(): independent teardown of browser and cache
 *  - startWithCleanup(): resource cleanup when createServer() fails
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveTransport,
  assertRequiredCredentials,
  closeResources,
  startWithCleanup,
} from '../src/bootstrap.js';

// ─── resolveTransport ─────────────────────────────────────────────────────────

describe('resolveTransport', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('defaults to stdio when TRANSPORT is unset', () => {
    vi.stubEnv('TRANSPORT', '');
    expect(resolveTransport()).toBe('stdio');
  });

  it('returns stdio for TRANSPORT=stdio', () => {
    vi.stubEnv('TRANSPORT', 'stdio');
    expect(resolveTransport()).toBe('stdio');
  });

  it('returns sse for TRANSPORT=sse', () => {
    vi.stubEnv('TRANSPORT', 'sse');
    expect(resolveTransport()).toBe('sse');
  });

  it('normalises ws alias to websocket', () => {
    vi.stubEnv('TRANSPORT', 'ws');
    expect(resolveTransport()).toBe('websocket');
  });

  it('normalises uppercase WS to websocket', () => {
    vi.stubEnv('TRANSPORT', 'WS');
    expect(resolveTransport()).toBe('websocket');
  });

  it('normalises mixed-case WebSocket to websocket', () => {
    vi.stubEnv('TRANSPORT', 'WebSocket');
    expect(resolveTransport()).toBe('websocket');
  });

  it('strips surrounding whitespace before lookup', () => {
    vi.stubEnv('TRANSPORT', '  sse  ');
    expect(resolveTransport()).toBe('sse');
  });

  it('throws a descriptive error for an unrecognised value', () => {
    vi.stubEnv('TRANSPORT', 'grpc');
    expect(() => resolveTransport()).toThrow(
      'Config error: invalid TRANSPORT "grpc". Must be one of: stdio, sse, ws, websocket'
    );
  });

  it('throws for values that are close but not valid (e.g. "http")', () => {
    vi.stubEnv('TRANSPORT', 'http');
    expect(() => resolveTransport()).toThrow(/Config error.*TRANSPORT/);
  });
});

// ─── assertRequiredCredentials ────────────────────────────────────────────────

describe('assertRequiredCredentials', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('does not throw when both IAAI_EMAIL and IAAI_PASSWORD are set', () => {
    vi.stubEnv('IAAI_EMAIL', 'user@example.com');
    vi.stubEnv('IAAI_PASSWORD', 's3cr3t');
    expect(() => assertRequiredCredentials()).not.toThrow();
  });

  it('throws mentioning IAAI_EMAIL when only IAAI_EMAIL is missing', () => {
    vi.stubEnv('IAAI_EMAIL', '');
    vi.stubEnv('IAAI_PASSWORD', 's3cr3t');
    expect(() => assertRequiredCredentials()).toThrow(/IAAI_EMAIL/);
    expect(() => assertRequiredCredentials()).not.toThrow(/IAAI_PASSWORD/);
  });

  it('throws mentioning IAAI_PASSWORD when only IAAI_PASSWORD is missing', () => {
    vi.stubEnv('IAAI_EMAIL', 'user@example.com');
    vi.stubEnv('IAAI_PASSWORD', '');
    expect(() => assertRequiredCredentials()).toThrow(/IAAI_PASSWORD/);
    expect(() => assertRequiredCredentials()).not.toThrow(/IAAI_EMAIL/);
  });

  it('throws mentioning both variables when both are missing', () => {
    vi.stubEnv('IAAI_EMAIL', '');
    vi.stubEnv('IAAI_PASSWORD', '');
    expect(() => assertRequiredCredentials()).toThrow(/IAAI_EMAIL/);
    expect(() => assertRequiredCredentials()).toThrow(/IAAI_PASSWORD/);
  });

  it('includes "Config error" in the message', () => {
    vi.stubEnv('IAAI_EMAIL', '');
    vi.stubEnv('IAAI_PASSWORD', '');
    expect(() => assertRequiredCredentials()).toThrow(/Config error/);
  });
});

// ─── closeResources ───────────────────────────────────────────────────────────

describe('closeResources', () => {
  it('closes browser and cache without error on success', async () => {
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    const cache = { close: vi.fn() };

    await expect(closeResources(browser, cache)).resolves.toBeUndefined();
    expect(browser.close).toHaveBeenCalledOnce();
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it('always attempts cache.close() even when browser.close() throws', async () => {
    const browser = { close: vi.fn().mockRejectedValue(new Error('browser error')) };
    const cache = { close: vi.fn() };

    await expect(closeResources(browser, cache)).rejects.toThrow('browser error');
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it('rethrows browser error when only browser.close() fails', async () => {
    const browser = { close: vi.fn().mockRejectedValue(new Error('browser crash')) };
    const cache = { close: vi.fn() };

    await expect(closeResources(browser, cache)).rejects.toThrow('browser crash');
  });

  it('rethrows cache error when only cache.close() fails', async () => {
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    const cache = {
      close: vi.fn().mockImplementation(() => {
        throw new Error('sqlite error');
      }),
    };

    await expect(closeResources(browser, cache)).rejects.toThrow('sqlite error');
  });

  it('rethrows browser error when both fail (cache error is logged)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const browser = { close: vi.fn().mockRejectedValue(new Error('browser crash')) };
    const cache = {
      close: vi.fn().mockImplementation(() => {
        throw new Error('sqlite error');
      }),
    };

    await expect(closeResources(browser, cache)).rejects.toThrow('browser crash');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error closing cache during shutdown:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});

// ─── startWithCleanup ─────────────────────────────────────────────────────────

describe('startWithCleanup', () => {
  it('resolves without calling cleanup when start() succeeds', async () => {
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    const cache = { close: vi.fn() };
    const start = vi.fn().mockResolvedValue(undefined);

    await startWithCleanup({ browser, cache, start });

    expect(start).toHaveBeenCalledOnce();
    expect(browser.close).not.toHaveBeenCalled();
    expect(cache.close).not.toHaveBeenCalled();
  });

  it('closes browser and cache when start() throws', async () => {
    const browser = { close: vi.fn().mockResolvedValue(undefined) };
    const cache = { close: vi.fn() };
    const start = vi.fn().mockRejectedValue(new Error('transport bind failed'));

    await expect(startWithCleanup({ browser, cache, start })).rejects.toThrow(
      'transport bind failed'
    );

    expect(browser.close).toHaveBeenCalledOnce();
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it('rethrows the original startup error even when cleanup also fails', async () => {
    const browser = { close: vi.fn().mockRejectedValue(new Error('browser close error')) };
    const cache = { close: vi.fn() };
    const start = vi.fn().mockRejectedValue(new Error('startup failure'));

    // Original error must propagate, not the cleanup error
    await expect(startWithCleanup({ browser, cache, start })).rejects.toThrow('startup failure');
  });

  it('logs a cleanup error when cleanup itself fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const browser = { close: vi.fn().mockRejectedValue(new Error('browser close error')) };
    const cache = { close: vi.fn() };
    const start = vi.fn().mockRejectedValue(new Error('startup failure'));

    await expect(startWithCleanup({ browser, cache, start })).rejects.toThrow('startup failure');
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error during startup cleanup:',
      expect.any(Error)
    );
    consoleErrorSpy.mockRestore();
  });
});
