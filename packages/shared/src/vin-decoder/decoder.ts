/**
 * VIN decoder — NHTSA vPIC API client with caching
 */
import type { VINDecodeResult, VinCache } from '../types/index.js';
import { ScraperError } from '../errors.js';
import { validateVin } from './validator.js';

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues';
const TTL_SUCCESS = 90 * 24 * 60 * 60 * 1000; // 90 days
const TTL_NEGATIVE = 5 * 60 * 1000; // 5 minutes

/** Sentinel VINDecodeResult used for negative caching (errorCode starts with "ERR:") */
const NEGATIVE_CACHE_PREFIX = 'ERR:';

interface NhtsaResponse {
  Count: number;
  Message: string;
  Results: Array<Record<string, string>>;
}

/**
 * Decode a VIN via the NHTSA vPIC API with optional caching.
 *
 * @throws {ScraperError} On invalid VIN or API failure
 * @example
 * const result = await decodeVin('1HGCM82633A004352', { cache: new InMemoryVinCache() });
 */
export async function decodeVin(
  vin: string,
  options?: { cache?: VinCache }
): Promise<VINDecodeResult> {
  const validation = validateVin(vin);
  if (!validation.valid) {
    throw new ScraperError(`Invalid VIN: ${validation.error}`, 'SCRAPER_ERROR', false);
  }

  const cache = options?.cache;

  // Check cache
  if (cache) {
    const cached = await cache.get(vin);
    if (cached) {
      // Check if it's a negatively cached error
      if (cached.errorCode.startsWith(NEGATIVE_CACHE_PREFIX)) {
        throw new ScraperError(
          cached.errorCode.slice(NEGATIVE_CACHE_PREFIX.length),
          'SCRAPER_ERROR',
          false
        );
      }
      return cached;
    }
  }

  // Call NHTSA API
  let result: VINDecodeResult;
  try {
    const url = `${NHTSA_BASE}/${encodeURIComponent(vin)}?format=json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = (await response.json()) as NhtsaResponse;
    const raw = data.Results?.[0];
    if (!raw) {
      throw new Error('Empty Results array from NHTSA API');
    }
    result = mapNhtsaResponse(vin, raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Negatively cache the failure
    if (cache) {
      const sentinel: VINDecodeResult = {
        vin,
        year: 0,
        make: '',
        model: '',
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
        errorCode: `${NEGATIVE_CACHE_PREFIX}${message}`,
      };
      await cache.set(vin, sentinel, TTL_NEGATIVE);
    }
    throw new ScraperError(`NHTSA API error for VIN ${vin}: ${message}`, 'SCRAPER_ERROR', false);
  }

  // Cache success
  if (cache) {
    await cache.set(vin, result, TTL_SUCCESS);
  }

  return result;
}

function mapNhtsaResponse(vin: string, raw: Record<string, string>): VINDecodeResult {
  const yearRaw = parseInt(raw['ModelYear'] ?? '', 10);
  const cylRaw = parseInt(raw['EngineCylinders'] ?? '', 10);
  const displRaw = parseFloat(raw['DisplacementL'] ?? '');

  // Engine type: prefer EngineModel, fallback to cylinder+displacement combo
  let engineType: string | null = raw['EngineModel'] || null;
  if (!engineType) {
    const cyl = raw['EngineCylinders'];
    const disp = raw['DisplacementL'];
    if (cyl || disp) {
      engineType = [cyl ? `${cyl}-cyl` : '', disp ? `${disp}L` : ''].filter(Boolean).join(' ');
    }
  }

  return {
    vin,
    year: isNaN(yearRaw) ? 0 : yearRaw,
    make: raw['Make'] ?? '',
    model: raw['Model'] ?? '',
    trim: raw['Trim'] || null,
    engineType: engineType || null,
    bodyClass: raw['BodyClass'] || null,
    driveType: raw['DriveType'] || null,
    fuelType: raw['FuelTypePrimary'] || null,
    transmission: raw['TransmissionStyle'] || null,
    cylinders: isNaN(cylRaw) ? null : cylRaw,
    displacementL: isNaN(displRaw) ? null : displRaw,
    manufacturer: raw['Manufacturer'] || null,
    plantCountry: raw['PlantCountry'] || null,
    vehicleType: raw['VehicleType'] || null,
    errorCode: raw['ErrorCode'] ?? '0',
  };
}
