/**
 * @file src/vin-decoder/nhtsa-client.ts
 * @description NHTSA vPIC API client for VIN decoding.
 * INTERNAL — not re-exported from vin-decoder/index.ts or src/index.ts.
 */

import type { VINDecodeResult } from '../types/index.js';
import { ScraperError } from '../errors.js';

const NHTSA_BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

/**
 * Raw structure of a single result item from the NHTSA DecodeVinValues endpoint.
 */
interface NhtsaDecodeResult {
  Make: string;
  Model: string;
  ModelYear: string;
  Trim: string;
  BodyClass: string;
  DriveType: string;
  EngineConfiguration: string;
  EngineCylinders: string;
  DisplacementL: string;
  FuelTypePrimary: string;
  TransmissionStyle: string;
  VIN: string;
  ErrorCode: string;
  ErrorText: string;
  [key: string]: string;
}

interface NhtsaResponse {
  Count: number;
  Message: string;
  SearchCriteria: string;
  Results: NhtsaDecodeResult[];
}

/**
 * Converts a NHTSA Make string to title case.
 * NHTSA returns make in ALL CAPS (e.g. "HONDA" → "Honda").
 */
function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .replace(/(?:^|\s|-)\w/g, (char) => char.toUpperCase());
}

/**
 * Safely parses a string to a number; returns undefined for empty/non-numeric.
 */
function parseOptionalNumber(value: string): number | undefined {
  if (!value || value.trim() === '') return undefined;
  const n = parseFloat(value);
  return isNaN(n) ? undefined : n;
}

/**
 * Fetches VIN decode data from the NHTSA vPIC API.
 *
 * @param vin - A validated 17-character VIN
 * @returns Structured VINDecodeResult
 * @throws ScraperError with code SCRAPER_ERROR on HTTP or parse failures
 */
export async function fetchVinFromNhtsa(vin: string): Promise<VINDecodeResult> {
  const url = `${NHTSA_BASE_URL}/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new ScraperError(
      `NHTSA vPIC API request failed for VIN ${vin}: ${String(err)}`,
      { code: 'SCRAPER_ERROR', retryable: true }
    );
  }

  if (!response.ok) {
    throw new ScraperError(
      `NHTSA vPIC API returned HTTP ${response.status} for VIN ${vin}`,
      { code: 'SCRAPER_ERROR', retryable: response.status >= 500 }
    );
  }

  let data: NhtsaResponse;
  try {
    data = (await response.json()) as NhtsaResponse;
  } catch (err) {
    throw new ScraperError(
      `Failed to parse NHTSA vPIC API response for VIN ${vin}: ${String(err)}`,
      { code: 'SCRAPER_ERROR', retryable: false }
    );
  }

  if (!data.Results || data.Results.length === 0) {
    throw new ScraperError(
      `VIN not found in NHTSA database: ${vin}`,
      { code: 'SCRAPER_ERROR', retryable: false }
    );
  }

  const r = data.Results[0];

  const modelYear = parseInt(r.ModelYear ?? '0', 10);
  const cylinders = parseOptionalNumber(r.EngineCylinders);
  const displacementL = parseOptionalNumber(r.DisplacementL);

  // Non-zero error code means partial decode
  const decodeNotes =
    r.ErrorCode && r.ErrorCode !== '0'
      ? `NHTSA decode note: ${r.ErrorText ?? r.ErrorCode}`
      : undefined;

  const trim = r.Trim?.trim() || undefined;
  const engineConfig = r.EngineConfiguration?.trim() || undefined;

  return {
    vin,
    year: isNaN(modelYear) ? 0 : modelYear,
    make: toTitleCase(r.Make ?? ''),
    model: r.Model ?? '',
    trim,
    engine_type: r.FuelTypePrimary ?? '',
    body_class: r.BodyClass ?? '',
    drive_type: r.DriveType ?? '',
    fuel_type: r.FuelTypePrimary ?? '',
    transmission: r.TransmissionStyle ?? '',
    engine_cylinders: cylinders,
    displacement_l: displacementL,
    engine_config: engineConfig,
    decode_notes: decodeNotes,
  };
}
