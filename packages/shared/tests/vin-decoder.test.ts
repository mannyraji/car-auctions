/**
 * @file tests/vin-decoder.test.ts
 * @description Tests for validateVin(), decodeVin(), and VinCache implementations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateVin, decodeVin } from '../src/vin-decoder/index.js';
import type { VinCache } from '../src/vin-decoder/index.js';
import { FifoVinCache } from '../src/vin-decoder/sqlite-cache.js';
import type { VINDecodeResult } from '../src/types/index.js';

// Representative NHTSA DecodeVinValues response
const MOCK_NHTSA_RESPONSE = {
  Count: 1,
  Message: 'Results returned successfully',
  SearchCriteria: 'VIN(s): 1HGBH41JXMN109186',
  Results: [
    {
      Make: 'HONDA',
      Model: 'Civic',
      ModelYear: '1991',
      Trim: 'LX',
      BodyClass: 'Sedan/Saloon',
      DriveType: 'FWD/Front-Wheel Drive',
      EngineConfiguration: 'Inline',
      EngineCylinders: '4',
      DisplacementL: '1.5',
      FuelTypePrimary: 'Gasoline',
      TransmissionStyle: 'Manual',
      VIN: '1HGBH41JXMN109186',
      ErrorCode: '0',
      ErrorText: '0 - VIN decoded clean. Check Digit (9th position) is correct',
    },
  ],
};

const VALID_VIN = '1HGBH41JXMN109186';

describe('validateVin', () => {
  it('returns true for a valid 17-character VIN', () => {
    expect(validateVin(VALID_VIN)).toBe(true);
  });

  it('returns false for a VIN that is too short (16 chars)', () => {
    expect(validateVin('1HGBH41JXMN10918')).toBe(false);
  });

  it('returns false for a VIN that is too long (18 chars)', () => {
    expect(validateVin('1HGBH41JXMN109186X')).toBe(false);
  });

  it('returns false for a VIN containing I', () => {
    expect(validateVin('1HGBH41JXMN10918I')).toBe(false);
  });

  it('returns false for a VIN containing O', () => {
    expect(validateVin('1HGBH41JXMN10918O')).toBe(false);
  });

  it('returns false for a VIN containing Q', () => {
    expect(validateVin('1HGBH41JXMN10918Q')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(validateVin('')).toBe(false);
  });

  it('returns false for non-alphanumeric characters', () => {
    expect(validateVin('1HGBH41JXM-109186')).toBe(false);
  });

  it('accepts alphanumeric VIN without I, O, Q', () => {
    // All letters except I, O, Q
    expect(validateVin('ABCDEFGHJKLMNPRSZ')).toBe(true);
  });
});

describe('decodeVin', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => MOCK_NHTSA_RESPONSE,
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns VINDecodeResult with correct fields', async () => {
    const result = await decodeVin(VALID_VIN);
    expect(result.vin).toBe(VALID_VIN);
    expect(result.make).toBe('Honda');
    expect(result.model).toBe('Civic');
    expect(result.year).toBe(1991);
    expect(result.body_class).toBe('Sedan/Saloon');
    expect(result.drive_type).toBe('FWD/Front-Wheel Drive');
    expect(result.fuel_type).toBe('Gasoline');
    expect(result.transmission).toBe('Manual');
    expect(result.trim).toBe('LX');
  });

  it('throws ScraperError with VALIDATION_ERROR for an invalid VIN', async () => {
    await expect(decodeVin('BAD_VIN')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not call fetch when cache returns a hit', async () => {
    const mockResult: VINDecodeResult = {
      vin: VALID_VIN,
      year: 1991,
      make: 'Honda',
      model: 'Civic',
      engine_type: 'Gasoline',
      body_class: 'Sedan/Saloon',
      drive_type: 'FWD',
      fuel_type: 'Gasoline',
      transmission: 'Manual',
    };

    const cache: VinCache = {
      get: vi.fn().mockReturnValue(mockResult),
      set: vi.fn(),
    };

    const result = await decodeVin(VALID_VIN, { cache });
    expect(result).toEqual(mockResult);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.get).toHaveBeenCalledWith(VALID_VIN);
  });

  it('calls cache.set after a successful fetch', async () => {
    const cache: VinCache = {
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
    };

    await decodeVin(VALID_VIN, { cache });
    expect(cache.set).toHaveBeenCalledWith(
      VALID_VIN,
      expect.objectContaining({ vin: VALID_VIN }),
      expect.any(Number)
    );
  });

  it('works without any cache (cache optional)', async () => {
    const result = await decodeVin(VALID_VIN);
    expect(result.vin).toBe(VALID_VIN);
  });

  it('sets decode_notes when NHTSA ErrorCode is not "0"', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...MOCK_NHTSA_RESPONSE,
        Results: [
          {
            ...MOCK_NHTSA_RESPONSE.Results[0],
            ErrorCode: '6',
            ErrorText: '6 - Incomplete VIN; results may be partial',
          },
        ],
      }),
    } as Response);

    const result = await decodeVin(VALID_VIN);
    expect(result.decode_notes).toBeTruthy();
  });

  it('throws ScraperError on HTTP error from NHTSA', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    await expect(decodeVin(VALID_VIN)).rejects.toMatchObject({
      code: 'SCRAPER_ERROR',
    });
  });
});

describe('FifoVinCache', () => {
  it('returns null for a cache miss', () => {
    const cache = new FifoVinCache();
    expect(cache.get('NOTEXIST12345678')).toBeNull();
  });

  it('returns result after set', () => {
    const cache = new FifoVinCache();
    const result: VINDecodeResult = {
      vin: VALID_VIN,
      year: 1991,
      make: 'Honda',
      model: 'Civic',
      engine_type: 'Gasoline',
      body_class: 'Sedan',
      drive_type: 'FWD',
      fuel_type: 'Gasoline',
      transmission: 'Manual',
    };
    cache.set(VALID_VIN, result, 90 * 24 * 60 * 60 * 1000);
    expect(cache.get(VALID_VIN)).toEqual(result);
  });

  it('returns null for an expired entry', () => {
    const cache = new FifoVinCache();
    const result: VINDecodeResult = {
      vin: VALID_VIN,
      year: 1991,
      make: 'Honda',
      model: 'Civic',
      engine_type: 'Gasoline',
      body_class: 'Sedan',
      drive_type: 'FWD',
      fuel_type: 'Gasoline',
      transmission: 'Manual',
    };
    // Set with a TTL of 1ms (already expired)
    cache.set(VALID_VIN, result, -1);
    expect(cache.get(VALID_VIN)).toBeNull();
  });

  it('evicts oldest entry when maxSize is reached', () => {
    const cache = new FifoVinCache(2);
    const makeResult = (vin: string): VINDecodeResult => ({
      vin,
      year: 2020,
      make: 'Test',
      model: 'Car',
      engine_type: 'Gas',
      body_class: 'Sedan',
      drive_type: 'FWD',
      fuel_type: 'Gasoline',
      transmission: 'Auto',
    });

    const vin1 = 'AAAAAAAAAAAAAAAAA';
    const vin2 = 'BBBBBBBBBBBBBBBBB';
    const vin3 = 'CCCCCCCCCCCCCCCCC';

    cache.set(vin1, makeResult(vin1), 999999);
    cache.set(vin2, makeResult(vin2), 999999);
    cache.set(vin3, makeResult(vin3), 999999); // should evict vin1

    expect(cache.get(vin1)).toBeNull(); // evicted
    expect(cache.get(vin2)).not.toBeNull();
    expect(cache.get(vin3)).not.toBeNull();
  });
});
