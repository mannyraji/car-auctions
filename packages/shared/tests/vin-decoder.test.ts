/**
 * @file vin-decoder.test.ts
 * @description Tests for VIN validation, decoding, and cache implementations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateVin, decodeVin, MemoryVinCache } from '../src/vin-decoder.js';
import type { VINDecodeResult } from '../src/types/index.js';

// ─── validateVin ─────────────────────────────────────────────────────────────

describe('validateVin', () => {
  it('accepts a valid 17-char VIN', () => {
    expect(validateVin('1HGCM82633A123456')).toBe(true);
  });

  it('accepts another valid VIN', () => {
    expect(validateVin('1FTFW1ET0DFC10312')).toBe(true);
  });

  it('rejects VIN shorter than 17 chars', () => {
    expect(validateVin('1HGCM82633A12345')).toBe(false);
  });

  it('rejects VIN longer than 17 chars', () => {
    expect(validateVin('1HGCM82633A12345678')).toBe(false);
  });

  it('rejects VIN containing I', () => {
    expect(validateVin('1HGCM82633A12345I')).toBe(false);
  });

  it('rejects VIN containing O', () => {
    expect(validateVin('1HGCM82633A12345O')).toBe(false);
  });

  it('rejects VIN containing Q', () => {
    expect(validateVin('1HGCM82633A12345Q')).toBe(false);
  });

  it('rejects VIN with special characters', () => {
    expect(validateVin('1HGCM82633A1234!')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateVin('')).toBe(false);
  });

  it('rejects non-string input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validateVin(null as any)).toBe(false);
  });

  it('accepts uppercase VIN', () => {
    expect(validateVin('1HGCM82633A123456')).toBe(true);
  });

  it('accepts lowercase VIN (case-insensitive per regex flag)', () => {
    expect(validateVin('1hgcm82633a123456')).toBe(true);
  });
});

// ─── decodeVin ────────────────────────────────────────────────────────────────

describe('decodeVin — validation errors (no network)', () => {
  it('returns VALIDATION_ERROR for invalid VIN', async () => {
    const result = await decodeVin('INVALID');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
    expect(result.error?.retryable).toBe(false);
  });

  it('returns VALIDATION_ERROR for VIN containing O', async () => {
    const result = await decodeVin('1HGCM82633A12345O');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });

  it('sets data to null on validation error', async () => {
    const result = await decodeVin('SHORT');
    expect(result.data).toBeNull();
    expect(result.cached).toBe(false);
  });

  it('includes a timestamp on validation error', async () => {
    const result = await decodeVin('SHORT');
    expect(result.timestamp).toBeTruthy();
    expect(() => new Date(result.timestamp)).not.toThrow();
  });
});

describe('decodeVin — cache behaviour', () => {
  let cache: MemoryVinCache;

  beforeEach(() => {
    cache = new MemoryVinCache();
  });

  it('returns cached result without network call', async () => {
    const mockResult: VINDecodeResult = {
      vin: '1HGCM82633A123456',
      year: 2003,
      make: 'HONDA',
      model: 'ACCORD',
      trim: 'EX',
      engine_type: '2.4L',
      body_class: 'Sedan',
      drive_type: 'FWD',
      fuel_type: 'Gasoline',
      transmission: 'Automatic',
    };

    await cache.set('1HGCM82633A123456', mockResult, 7_776_000);

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await decodeVin('1HGCM82633A123456', cache);

    expect(result.success).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.data?.make).toBe('HONDA');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('calls network when cache miss', async () => {
    const mockNhtsaResponse = {
      Results: [
        { Variable: 'Make', Value: 'HONDA' },
        { Variable: 'Model', Value: 'ACCORD' },
        { Variable: 'ModelYear', Value: '2003' },
        { Variable: 'Trim', Value: null },
        { Variable: 'DisplacementL', Value: null },
        { Variable: 'BodyClass', Value: null },
        { Variable: 'DriveType', Value: null },
        { Variable: 'FuelTypePrimary', Value: null },
        { Variable: 'TransmissionStyle', Value: null },
      ],
      Count: 9,
      Message: 'Results returned successfully',
    };

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockNhtsaResponse,
      } as Response);

    const result = await decodeVin('1HGCM82633A123456', cache);

    expect(result.success).toBe(true);
    expect(result.cached).toBe(false);
    expect(result.data?.make).toBe('HONDA');
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('stores result in cache after successful decode', async () => {
    const mockNhtsaResponse = {
      Results: [
        { Variable: 'Make', Value: 'TOYOTA' },
        { Variable: 'Model', Value: 'CAMRY' },
        { Variable: 'ModelYear', Value: '2020' },
      ],
      Count: 3,
      Message: 'Results returned successfully',
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockNhtsaResponse,
    } as Response);

    const vin = '4T1BF1FK5CU123456';
    await decodeVin(vin, cache);

    const cached = await cache.get(vin);
    expect(cached).toBeTruthy();
    expect(cached?.make).toBe('TOYOTA');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe('decodeVin — network errors', () => {
  it('returns SCRAPER_ERROR when API returns non-ok status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    const result = await decodeVin('1HGCM82633A123456');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCRAPER_ERROR');
    expect(result.error?.retryable).toBe(true);
  });

  it('returns SCRAPER_ERROR when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await decodeVin('1HGCM82633A123456');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SCRAPER_ERROR');
    expect(result.error?.retryable).toBe(true);
  });

  it('returns TIMEOUT error for timeout', async () => {
    const timeoutErr = new Error('The operation was aborted');
    timeoutErr.name = 'TimeoutError';
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(timeoutErr);

    const result = await decodeVin('1HGCM82633A123456');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('TIMEOUT');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

// ─── SqliteVinCache ──────────────────────────────────────────────────────────

describe('SqliteVinCache', () => {
  const tmpDbPath = '/tmp/test-vin-cache-' + Date.now() + '.sqlite';

  const sampleResult = {
    vin: '1HGCM82633A123456',
    year: 2003,
    make: 'HONDA',
    model: 'ACCORD',
    trim: null,
    engine_type: null,
    body_class: null,
    drive_type: null,
    fuel_type: null,
    transmission: null,
  };

  it('stores and retrieves a result', async () => {
    const { SqliteVinCache } = await import('../src/vin-decoder.js');
    const cache = new SqliteVinCache({ dbPath: tmpDbPath });
    await cache.set('1HGCM82633A123456', sampleResult, 7_776_000);
    const result = await cache.get('1HGCM82633A123456');
    expect(result).toEqual(sampleResult);
  });

  it('returns null for cache miss', async () => {
    const { SqliteVinCache } = await import('../src/vin-decoder.js');
    const cache = new SqliteVinCache({ dbPath: tmpDbPath });
    const result = await cache.get('NOTEXISTENT12345');
    expect(result).toBeNull();
  });

  it('evicts expired entries on get', async () => {
    const { SqliteVinCache } = await import('../src/vin-decoder.js');
    const cache = new SqliteVinCache({ dbPath: tmpDbPath, ttlSeconds: -1 });
    await cache.set('1HGCM82633A999999', sampleResult, -1);
    const result = await cache.get('1HGCM82633A999999');
    expect(result).toBeNull();
  });

  it('reuses initialized db on second call', async () => {
    const { SqliteVinCache } = await import('../src/vin-decoder.js');
    const cache = new SqliteVinCache({ dbPath: tmpDbPath });
    // Two calls to ensure ensureInit returns cached db
    await cache.set('TEST1234567890001', sampleResult, 7_776_000);
    await cache.set('TEST1234567890002', sampleResult, 7_776_000);
    const r1 = await cache.get('TEST1234567890001');
    const r2 = await cache.get('TEST1234567890002');
    expect(r1).toEqual(sampleResult);
    expect(r2).toEqual(sampleResult);
  });
});



describe('MemoryVinCache', () => {
  it('stores and retrieves a result', async () => {
    const cache = new MemoryVinCache();
    const result: VINDecodeResult = {
      vin: '1HGCM82633A123456',
      year: 2003,
      make: 'HONDA',
      model: 'ACCORD',
      trim: null,
      engine_type: null,
      body_class: null,
      drive_type: null,
      fuel_type: null,
      transmission: null,
    };

    await cache.set('1HGCM82633A123456', result, 7_776_000);
    const retrieved = await cache.get('1HGCM82633A123456');
    expect(retrieved).toEqual(result);
  });

  it('returns null for cache miss', async () => {
    const cache = new MemoryVinCache();
    const result = await cache.get('NONEXISTENT12345');
    expect(result).toBeNull();
  });

  it('expires entries after TTL', async () => {
    const cache = new MemoryVinCache();
    const result: VINDecodeResult = {
      vin: '1HGCM82633A123456',
      year: 2003,
      make: 'HONDA',
      model: 'ACCORD',
      trim: null,
      engine_type: null,
      body_class: null,
      drive_type: null,
      fuel_type: null,
      transmission: null,
    };

    // Set with TTL of -1 seconds (already expired)
    await cache.set('1HGCM82633A123456', result, -1);
    const retrieved = await cache.get('1HGCM82633A123456');
    expect(retrieved).toBeNull();
  });

  it('reports correct size', async () => {
    const cache = new MemoryVinCache();
    expect(cache.size).toBe(0);

    const result: VINDecodeResult = {
      vin: '1HGCM82633A123456',
      year: 2003,
      make: 'HONDA',
      model: 'ACCORD',
      trim: null,
      engine_type: null,
      body_class: null,
      drive_type: null,
      fuel_type: null,
      transmission: null,
    };

    await cache.set('1HGCM82633A123456', result, 7_776_000);
    expect(cache.size).toBe(1);
  });

  it('clears all entries', async () => {
    const cache = new MemoryVinCache();
    const result: VINDecodeResult = {
      vin: 'TEST1234567890123',
      year: 2020,
      make: 'TEST',
      model: 'TEST',
      trim: null,
      engine_type: null,
      body_class: null,
      drive_type: null,
      fuel_type: null,
      transmission: null,
    };

    await cache.set('TEST1234567890123', result, 7_776_000);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
