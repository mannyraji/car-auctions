import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { validateVin } from '../src/vin-decoder/validator.js';
import { decodeVin } from '../src/vin-decoder/decoder.js';
import { InMemoryVinCache } from '../src/vin-decoder/memory-cache.js';
import { SqliteVinCache } from '../src/vin-decoder/sqlite-cache.js';
import type { VINDecodeResult } from '../src/types/index.js';
import nhtsaFixture from './fixtures/nhtsa-decode-response.json';

const VALID_VIN = '1HGCM82633A004352';

// ─── validateVin ─────────────────────────────────────────────────────────────

describe('validateVin', () => {
  it('accepts a valid 17-char VIN', () => {
    expect(validateVin(VALID_VIN)).toEqual({ valid: true });
  });

  it('rejects VIN that is too short', () => {
    const result = validateVin('1HGCM826');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/17/);
  });

  it('rejects VIN that is too long', () => {
    const result = validateVin('1HGCM82633A0043521234');
    expect(result.valid).toBe(false);
  });

  it('rejects VIN containing letter I', () => {
    const result = validateVin('1HGCM82633I004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/I/);
  });

  it('rejects VIN containing letter O', () => {
    const result = validateVin('1HGCM82633O004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/O/);
  });

  it('rejects VIN containing letter Q', () => {
    const result = validateVin('1HGCM82633Q004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Q/);
  });

  it('rejects VIN with non-alphanumeric characters', () => {
    const result = validateVin('1HGCM826-3A004352');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/alphanumeric/);
  });

  it('rejects empty string', () => {
    expect(validateVin('')).toMatchObject({ valid: false });
  });
});

// ─── decodeVin ────────────────────────────────────────────────────────────────

describe('decodeVin', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(body: unknown, ok = true, status = 200) {
    vi.mocked(fetch).mockResolvedValue({
      ok,
      status,
      statusText: ok ? 'OK' : 'Error',
      json: () => Promise.resolve(body),
    } as Response);
  }

  it('decodes a valid VIN using fixture response', async () => {
    mockFetch(nhtsaFixture);

    const result = await decodeVin(VALID_VIN);

    expect(result.vin).toBe(VALID_VIN);
    expect(result.year).toBe(2003);
    expect(result.make).toBe('HONDA');
    expect(result.model).toBe('Accord');
    expect(result.trim).toBe('EX');
    expect(result.bodyClass).toBe('Sedan/Saloon');
    expect(result.fuelType).toBe('Gasoline');
    expect(result.transmission).toBe('Automatic');
    expect(result.cylinders).toBe(4);
    expect(result.displacementL).toBe(2.4);
    expect(result.vehicleType).toBe('PASSENGER CAR');
    expect(result.plantCountry).toBe('UNITED STATES (USA)');
    expect(result.errorCode).toBe('0');
  });

  it('throws ScraperError for invalid VIN (no fetch call)', async () => {
    await expect(decodeVin('TOOSHORT')).rejects.toThrow(/Invalid VIN/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('throws ScraperError on HTTP error', async () => {
    mockFetch('Internal Server Error', false, 500);
    await expect(decodeVin(VALID_VIN)).rejects.toThrow(/NHTSA API error/);
  });

  it('returns cached result without making a fetch call', async () => {
    const cache = new InMemoryVinCache();
    const fakeResult = {
      vin: VALID_VIN,
      year: 2003,
      make: 'HONDA',
      model: 'Accord',
      trim: null,
      engineType: null,
      bodyClass: null,
      driveType: null,
      fuelType: null,
      transmission: null,
      cylinders: null,
      displacementL: null,
      manufacturer: null,
      plantCountry: null,
      vehicleType: null,
      errorCode: '0',
    };
    await cache.set(VALID_VIN, fakeResult, 1_000_000);

    const result = await decodeVin(VALID_VIN, { cache });

    expect(result.make).toBe('HONDA');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('caches result on successful decode', async () => {
    mockFetch(nhtsaFixture);
    const cache = new InMemoryVinCache();

    await decodeVin(VALID_VIN, { cache });

    // Second call should use cache
    const second = await decodeVin(VALID_VIN, { cache });
    expect(second.year).toBe(2003);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it('negatively caches failures and re-throws on second call', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const cache = new InMemoryVinCache();

    // First call: fails and negatively caches
    await expect(decodeVin(VALID_VIN, { cache })).rejects.toThrow(/NHTSA API error/);

    // Second call: returns cached error without fetch
    await expect(decodeVin(VALID_VIN, { cache })).rejects.toThrow(/network error/);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

// ─── InMemoryVinCache ────────────────────────────────────────────────────────

describe('InMemoryVinCache', () => {
  it('returns null for unknown VIN', async () => {
    const cache = new InMemoryVinCache();
    expect(await cache.get('UNKNOWN')).toBeNull();
  });

  it('stores and retrieves a VIN result', async () => {
    const cache = new InMemoryVinCache();
    const result = {
      vin: VALID_VIN,
      year: 2003,
    } as VINDecodeResult;
    await cache.set(VALID_VIN, result, 60_000);
    expect(await cache.get(VALID_VIN)).toEqual(result);
  });

  it('returns null after TTL expires', async () => {
    vi.useFakeTimers();
    try {
      const cache = new InMemoryVinCache();
      const result = {
        vin: VALID_VIN,
        year: 2003,
      } as VINDecodeResult;
      await cache.set(VALID_VIN, result, 1000);
      vi.advanceTimersByTime(2000);
      expect(await cache.get(VALID_VIN)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('evicts oldest entry when max capacity reached', async () => {
    const cache = new InMemoryVinCache(2);
    const makeResult = (vin: string) => ({ vin, year: 2020 }) as VINDecodeResult;

    await cache.set('VIN00000000000001A', makeResult('VIN00000000000001A'), 60_000);
    await cache.set('VIN00000000000002A', makeResult('VIN00000000000002A'), 60_000);
    await cache.set('VIN00000000000003A', makeResult('VIN00000000000003A'), 60_000);

    // Oldest entry should be evicted
    expect(await cache.get('VIN00000000000001A')).toBeNull();
    expect(await cache.get('VIN00000000000002A')).not.toBeNull();
    expect(await cache.get('VIN00000000000003A')).not.toBeNull();
  });

  it('size property returns current entry count', async () => {
    const cache = new InMemoryVinCache();
    expect(cache.size).toBe(0);
    await cache.set(VALID_VIN, { vin: VALID_VIN, year: 2003 } as VINDecodeResult, 60_000);
    expect(cache.size).toBe(1);
  });

  it('clear() removes all entries', async () => {
    const cache = new InMemoryVinCache();
    await cache.set(VALID_VIN, { vin: VALID_VIN, year: 2003 } as VINDecodeResult, 60_000);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(await cache.get(VALID_VIN)).toBeNull();
  });
});

// ─── decodeVin edge cases ─────────────────────────────────────────────────────

describe('decodeVin edge cases', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when NHTSA returns empty Results array', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ Count: 0, Message: 'Empty', Results: [] }),
    } as Response);

    await expect(decodeVin(VALID_VIN)).rejects.toThrow(/NHTSA API error/);
  });

  it('builds engineType fallback from cylinders and displacement when EngineModel is absent', async () => {
    const responseWithoutEngineModel = {
      ...nhtsaFixture,
      Results: [
        {
          ...(nhtsaFixture.Results[0] as Record<string, string>),
          EngineModel: '',
          EngineCylinders: '6',
          DisplacementL: '3.5',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(responseWithoutEngineModel),
    } as Response);

    const result = await decodeVin(VALID_VIN);
    expect(result.engineType).toBe('6-cyl 3.5L');
  });

  it('sets engineType to null when EngineModel and cyl/disp are all absent', async () => {
    const responseNoEngine = {
      ...nhtsaFixture,
      Results: [
        {
          ...(nhtsaFixture.Results[0] as Record<string, string>),
          EngineModel: '',
          EngineCylinders: '',
          DisplacementL: '',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(responseNoEngine),
    } as Response);

    const result = await decodeVin(VALID_VIN);
    expect(result.engineType).toBeNull();
  });

  it('handles non-Error thrown by fetch (covers String(err) branch)', async () => {
    // Throw a plain string, not an Error instance
    vi.mocked(fetch).mockRejectedValue('plain string error');

    await expect(decodeVin(VALID_VIN)).rejects.toThrow(/NHTSA API error/);
  });

  it('maps null for optional NHTSA fields when they are absent', async () => {
    // Response with all optional fields empty/absent
    const minimalResponse = {
      Count: 1,
      Message: 'Results returned successfully',
      Results: [
        {
          VIN: VALID_VIN,
          Make: 'HONDA',
          Model: 'Accord',
          ModelYear: '2003',
          Trim: '',
          EngineModel: '',
          BodyClass: '',
          DriveType: '',
          FuelTypePrimary: '',
          TransmissionStyle: '',
          EngineCylinders: '',
          DisplacementL: '',
          Manufacturer: '',
          PlantCountry: '',
          VehicleType: '',
          ErrorCode: '0',
        },
      ],
    };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve(minimalResponse),
    } as Response);

    const result = await decodeVin(VALID_VIN);
    expect(result.trim).toBeNull();
    expect(result.bodyClass).toBeNull();
    expect(result.driveType).toBeNull();
    expect(result.fuelType).toBeNull();
    expect(result.transmission).toBeNull();
    expect(result.cylinders).toBeNull();
    expect(result.displacementL).toBeNull();
    expect(result.manufacturer).toBeNull();
    expect(result.plantCountry).toBeNull();
    expect(result.vehicleType).toBeNull();
    expect(result.engineType).toBeNull();
  });
});

// ─── SqliteVinCache ───────────────────────────────────────────────────────────

describe('SqliteVinCache', () => {
  let dbPath: string;
  let cache: SqliteVinCache;

  beforeEach(() => {
    // Use crypto.randomUUID() for a guaranteed-unique path even in parallel test runs
    dbPath = path.join(os.tmpdir(), `vin-cache-test-${crypto.randomUUID()}.sqlite`);
    cache = new SqliteVinCache(dbPath);
  });

  afterEach(() => {
    try {
      cache.close();
    } catch {
      // already closed
    }
    for (const filePath of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(filePath);
      } catch {
        // file may not exist
      }
    }
  });

  it('returns null for a VIN not in cache', async () => {
    expect(await cache.get(VALID_VIN)).toBeNull();
  });

  it('stores and retrieves a VIN result', async () => {
    const result: VINDecodeResult = {
      vin: VALID_VIN,
      year: 2003,
      make: 'HONDA',
      model: 'Accord',
      trim: 'EX',
      engineType: '4-cyl 2.4L',
      bodyClass: 'Sedan/Saloon',
      driveType: 'FWD',
      fuelType: 'Gasoline',
      transmission: 'Automatic',
      cylinders: 4,
      displacementL: 2.4,
      manufacturer: 'HONDA',
      plantCountry: 'USA',
      vehicleType: 'PASSENGER CAR',
      errorCode: '0',
    };

    await cache.set(VALID_VIN, result, 90 * 24 * 60 * 60 * 1000);
    const retrieved = await cache.get(VALID_VIN);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.vin).toBe(VALID_VIN);
    expect(retrieved?.make).toBe('HONDA');
    expect(retrieved?.year).toBe(2003);
  });

  it('returns null after TTL expires', async () => {
    // Fake timers control Date.now(), which SqliteVinCache uses for TTL expiry checks
    vi.useFakeTimers();
    try {
      const result = {
        vin: VALID_VIN,
        year: 2003,
      } as VINDecodeResult;
      await cache.set(VALID_VIN, result, 1000);

      vi.advanceTimersByTime(2000);

      expect(await cache.get(VALID_VIN)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('overwrites an existing entry on set', async () => {
    const r1 = { vin: VALID_VIN, year: 2003 } as VINDecodeResult;
    const r2 = { vin: VALID_VIN, year: 2020 } as VINDecodeResult;

    await cache.set(VALID_VIN, r1, 60_000);
    await cache.set(VALID_VIN, r2, 60_000);

    const retrieved = await cache.get(VALID_VIN);
    expect(retrieved?.year).toBe(2020);
  });

  it('closes the database cleanly', () => {
    expect(() => cache.close()).not.toThrow();
  });
});
