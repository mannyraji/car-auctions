/**
 * @file src/vin-decoder/index.ts
 * @description Public exports for the VIN decoder module.
 *
 * Only validateVin, decodeVin, VinCache, and FifoVinCache (for tests) are exported.
 * SqliteVinCache is intentionally NOT exported here — consumers that need the
 * production SQLite cache should import it via the top-level package barrel
 * (src/index.ts re-exports it explicitly for test/internal use).
 */

import type { VINDecodeResult } from '../types/index.js';
import { ScraperError } from '../errors.js';
import { fetchVinFromNhtsa } from './nhtsa-client.js';

// FifoVinCache exported for in-memory test convenience
export { FifoVinCache } from './sqlite-cache.js';

/** Default VIN cache TTL: 90 days in milliseconds */
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Interface for a pluggable VIN decode result cache.
 * The default production implementation uses better-sqlite3 (WAL mode).
 * Use FifoVinCache for in-memory testing.
 */
export interface VinCache {
  /** Returns cached result or null if not found / expired. */
  get(vin: string): VINDecodeResult | null;
  /** Stores result with the given TTL in milliseconds. */
  set(vin: string, result: VINDecodeResult, ttlMs: number): void;
}

/**
 * Validates a VIN without making any network calls.
 *
 * Rules: exactly 17 alphanumeric characters; characters I, O, Q are rejected.
 *
 * @param vin - The VIN string to validate
 * @returns true if valid, false otherwise
 * @example
 * validateVin('1HGBH41JXMN109186') // true
 * validateVin('1HGBH41JXMN10918O') // false — contains O
 * validateVin('1HGBH41')           // false — too short
 */
export function validateVin(vin: string): boolean {
  if (!vin || typeof vin !== 'string') return false;
  if (vin.length !== 17) return false;
  // Must be alphanumeric (letters and digits only)
  if (!/^[A-Z0-9]+$/i.test(vin)) return false;
  // Must not contain I, O, or Q (per VIN standard)
  if (/[IOQ]/i.test(vin)) return false;
  return true;
}

/**
 * Decodes a VIN using the free NHTSA vPIC API with optional caching.
 *
 * - Validates VIN before any network call (throws ScraperError with code
 *   VALIDATION_ERROR on invalid VIN)
 * - Checks cache first; returns cached result if within TTL (90 days default)
 * - On NHTSA API failure: throws ScraperError with code SCRAPER_ERROR
 * - On partial decode (NHTSA ErrorCode !== "0"): returns available fields +
 *   sets decode_notes; does NOT throw
 *
 * @param vin - 17-character VIN
 * @param options.cache - Optional VinCache implementation. If omitted, no caching is applied.
 * @param options.ttlMs - Cache TTL in ms. Default: 90 * 24 * 60 * 60 * 1000 (90 days)
 * @returns Structured VINDecodeResult
 * @throws ScraperError with code VALIDATION_ERROR if VIN is invalid
 * @throws ScraperError with code SCRAPER_ERROR if NHTSA API call fails
 * @example
 * const cache = new SqliteVinCache('./data/vin-cache.sqlite');
 * const specs = await decodeVin('1HGBH41JXMN109186', { cache });
 * // specs.make === 'Honda', specs.model === 'Civic', specs.year === 1991
 */
export async function decodeVin(
  vin: string,
  options?: { cache?: VinCache; ttlMs?: number }
): Promise<VINDecodeResult> {
  if (!validateVin(vin)) {
    throw new ScraperError(
      `Invalid VIN "${vin}": must be exactly 17 alphanumeric characters, excluding I, O, Q`,
      { code: 'VALIDATION_ERROR', retryable: false }
    );
  }

  const cache = options?.cache;
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;

  // Check cache first
  if (cache) {
    const cached = cache.get(vin);
    if (cached) return cached;
  }

  // Fetch from NHTSA
  const result = await fetchVinFromNhtsa(vin);

  // Store in cache
  if (cache) {
    cache.set(vin, result, ttlMs);
  }

  return result;
}
