import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateVin } from '../src/vin-decoder/validator.js';
import { decodeVin } from '../src/vin-decoder/decoder.js';
import { InMemoryVinCache } from '../src/vin-decoder/memory-cache.js';
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
    } as import('../src/types/index.js').VINDecodeResult;
    await cache.set(VALID_VIN, result, 60_000);
    expect(await cache.get(VALID_VIN)).toEqual(result);
  });

  it('returns null after TTL expires', async () => {
    vi.useFakeTimers();
    const cache = new InMemoryVinCache();
    const result = {
      vin: VALID_VIN,
      year: 2003,
    } as import('../src/types/index.js').VINDecodeResult;
    await cache.set(VALID_VIN, result, 1000);
    vi.advanceTimersByTime(2000);
    expect(await cache.get(VALID_VIN)).toBeNull();
    vi.useRealTimers();
  });

  it('evicts oldest entry when max capacity reached', async () => {
    const cache = new InMemoryVinCache(2);
    const makeResult = (vin: string) =>
      ({ vin, year: 2020 }) as import('../src/types/index.js').VINDecodeResult;

    await cache.set('VIN00000000000001A', makeResult('VIN00000000000001A'), 60_000);
    await cache.set('VIN00000000000002A', makeResult('VIN00000000000002A'), 60_000);
    await cache.set('VIN00000000000003A', makeResult('VIN00000000000003A'), 60_000);

    // Oldest entry should be evicted
    expect(await cache.get('VIN00000000000001A')).toBeNull();
    expect(await cache.get('VIN00000000000002A')).not.toBeNull();
    expect(await cache.get('VIN00000000000003A')).not.toBeNull();
  });
});
