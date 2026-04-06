/**
 * @file vin-decoder.ts
 * @description NHTSA vPIC VIN decoder with pluggable cache interface.
 *
 * Provides:
 *  - `validateVin`   — synchronous validation (17 chars, no I/O/Q)
 *  - `decodeVin`     — async NHTSA vPIC decode with optional caching
 *  - `VinCache`      — pluggable cache interface
 *  - `SqliteVinCache` — better-sqlite3 implementation (WAL, 90-day TTL)
 *  - `MemoryVinCache` — in-memory LRU for tests
 *
 * @since 001-shared-utilities-lib
 */

import type { ToolResponse, VINDecodeResult } from './types/index.js';

// ─── NHTSA variable IDs (internal) ────────────────────────────────────────────

/**
 * Mapping of NHTSA vPIC variable names to the field names in `VINDecodeResult`.
 * Internal — not exported from the public API.
 */
const NHTSA_VARIABLE_MAP: Record<string, keyof VINDecodeResult> = {
  ModelYear: 'year',
  Make: 'make',
  Model: 'model',
  Trim: 'trim',
  DisplacementL: 'engine_type',
  BodyClass: 'body_class',
  DriveType: 'drive_type',
  FuelTypePrimary: 'fuel_type',
  TransmissionStyle: 'transmission',
};

/** NHTSA vPIC base URL */
const NHTSA_BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin';

/** Cache TTL: 90 days in seconds */
const CACHE_TTL_SECONDS = 90 * 24 * 60 * 60;

// ─── VinCache interface ────────────────────────────────────────────────────────

/**
 * Options for constructing a SqliteVinCache.
 */
export interface SqliteVinCacheOptions {
  /** Path to the SQLite database file. Defaults to `data/vin-cache.sqlite` */
  dbPath?: string;
  /** TTL in seconds. Defaults to 90 days (7_776_000) */
  ttlSeconds?: number;
}

/**
 * Pluggable cache interface for VIN decode results.
 * Inject an implementation into `decodeVin` to enable caching.
 *
 * @example
 * const cache: VinCache = new MemoryVinCache();
 * const result = await decodeVin('1HGCM82633A123456', cache);
 */
export interface VinCache {
  /** Retrieve a cached result. Returns null if not found or expired. */
  get(vin: string): Promise<VINDecodeResult | null>;
  /** Store a result in the cache. */
  set(vin: string, result: VINDecodeResult, ttlSeconds: number): Promise<void>;
}

// ─── SqliteVinCache ────────────────────────────────────────────────────────────

/**
 * SQLite-backed VIN cache using better-sqlite3 (WAL mode).
 * Database is stored at `data/vin-cache.sqlite` by default (gitignored).
 *
 * @example
 * const cache = new SqliteVinCache({ dbPath: 'data/vin-cache.sqlite' });
 * const result = await decodeVin('1HGCM82633A123456', cache);
 */
export class SqliteVinCache implements VinCache {
  private db: import('better-sqlite3').Database | null = null;
  private readonly dbPath: string;
  private readonly ttlSeconds: number;
  private initialized = false;

  constructor(options?: SqliteVinCacheOptions) {
    this.dbPath = options?.dbPath ?? 'data/vin-cache.sqlite';
    this.ttlSeconds = options?.ttlSeconds ?? CACHE_TTL_SECONDS;
  }

  private async ensureInit(): Promise<import('better-sqlite3').Database> {
    if (this.initialized && this.db) return this.db;

    // Lazy import to avoid loading better-sqlite3 in test environments
    // that don't need it (MemoryVinCache is used instead)
    const { mkdirSync, existsSync } = await import('fs');
    const path = await import('path');
    const dir = path.dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const Database = (await import('better-sqlite3')).default;
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vin_cache (
        vin       TEXT PRIMARY KEY,
        result    TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      )
    `);
    this.initialized = true;
    return this.db;
  }

  async get(vin: string): Promise<VINDecodeResult | null> {
    const db = await this.ensureInit();
    const now = Math.floor(Date.now() / 1000);
    const row = db
      .prepare('SELECT result, cached_at FROM vin_cache WHERE vin = ?')
      .get(vin) as { result: string; cached_at: number } | undefined;

    if (!row) return null;
    if (now - row.cached_at > this.ttlSeconds) {
      // Expired — evict lazily
      db.prepare('DELETE FROM vin_cache WHERE vin = ?').run(vin);
      return null;
    }
    return JSON.parse(row.result) as VINDecodeResult;
  }

  async set(vin: string, result: VINDecodeResult, _ttlSeconds: number): Promise<void> {
    const db = await this.ensureInit();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      'INSERT OR REPLACE INTO vin_cache (vin, result, cached_at) VALUES (?, ?, ?)',
    ).run(vin, JSON.stringify(result), now);
  }
}

// ─── MemoryVinCache ───────────────────────────────────────────────────────────

interface MemoryCacheEntry {
  result: VINDecodeResult;
  cachedAt: number;
  ttlSeconds: number;
}

/**
 * In-memory VIN cache for use in tests.
 * No persistence — data is lost when the process exits.
 *
 * @example
 * const cache = new MemoryVinCache();
 * await cache.set('1HGCM82633A123456', result, 7776000);
 * const hit = await cache.get('1HGCM82633A123456');
 */
export class MemoryVinCache implements VinCache {
  private readonly store = new Map<string, MemoryCacheEntry>();

  async get(vin: string): Promise<VINDecodeResult | null> {
    const entry = this.store.get(vin);
    if (!entry) return null;
    const now = Math.floor(Date.now() / 1000);
    if (now - entry.cachedAt > entry.ttlSeconds) {
      this.store.delete(vin);
      return null;
    }
    return entry.result;
  }

  async set(vin: string, result: VINDecodeResult, ttlSeconds: number): Promise<void> {
    this.store.set(vin, {
      result,
      cachedAt: Math.floor(Date.now() / 1000),
      ttlSeconds,
    });
  }

  /** Clears all cached entries (useful for test setup/teardown) */
  clear(): void {
    this.store.clear();
  }

  /** Number of entries currently in the cache */
  get size(): number {
    return this.store.size;
  }
}

// ─── validateVin ─────────────────────────────────────────────────────────────

/**
 * Validates a VIN string per NHTSA rules:
 * - Exactly 17 characters
 * - Alphanumeric only
 * - Must NOT contain I, O, or Q
 *
 * @example
 * validateVin('1HGCM82633A123456'); // true
 * validateVin('1HGCM82633A12345');  // false (only 16 chars)
 * validateVin('1HGCM82633A12345O'); // false (contains O)
 */
export function validateVin(vin: string): boolean {
  if (typeof vin !== 'string') return false;
  // /^[A-HJ-NPR-Z0-9]{17}$/i — excludes I (between H and J), O (between N and P), Q (between P and R)
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}

// ─── NHTSA response parsing ───────────────────────────────────────────────────

interface NhtsaResultItem {
  Variable: string;
  Value: string | null;
}

interface NhtsaResponse {
  Results: NhtsaResultItem[];
  Count: number;
  Message: string;
}

function parseNhtsaResponse(vin: string, data: NhtsaResponse): VINDecodeResult {
  const fields: Partial<VINDecodeResult> = { vin };

  for (const item of data.Results) {
    const field = NHTSA_VARIABLE_MAP[item.Variable];
    if (!field || !item.Value || item.Value === 'Not Applicable') continue;

    if (field === 'year') {
      const y = parseInt(item.Value, 10);
      if (!isNaN(y)) fields.year = y;
    } else {
      (fields as Record<string, unknown>)[field] = item.Value;
    }
  }

  return {
    vin,
    year: fields.year ?? 0,
    make: fields.make ?? '',
    model: fields.model ?? '',
    trim: fields.trim ?? null,
    engine_type: fields.engine_type ?? null,
    body_class: fields.body_class ?? null,
    drive_type: fields.drive_type ?? null,
    fuel_type: fields.fuel_type ?? null,
    transmission: fields.transmission ?? null,
  };
}

// ─── decodeVin ────────────────────────────────────────────────────────────────

/**
 * Decodes a VIN using the free NHTSA vPIC API.
 *
 * - Validates the VIN before making any network calls
 * - Checks the injected cache (if provided) before hitting the API
 * - Returns a `ToolResponse<VINDecodeResult>` envelope — never throws
 *
 * @param vin   - The 17-character VIN to decode
 * @param cache - Optional cache implementation (SqliteVinCache or MemoryVinCache)
 *
 * @example
 * const response = await decodeVin('1HGCM82633A123456', new MemoryVinCache());
 * if (response.success) console.log(response.data?.make); // 'HONDA'
 */
export async function decodeVin(
  vin: string,
  cache?: VinCache,
): Promise<ToolResponse<VINDecodeResult>> {
  const timestamp = new Date().toISOString();

  // Validate first
  if (!validateVin(vin)) {
    return {
      success: false,
      data: null,
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid VIN: "${vin}". Must be 17 alphanumeric characters excluding I, O, Q.`,
        retryable: false,
        retryAfterMs: null,
      },
      cached: false,
      stale: false,
      cachedAt: null,
      timestamp,
    };
  }

  // Check cache
  if (cache) {
    try {
      const cached = await cache.get(vin);
      if (cached) {
        return {
          success: true,
          data: cached,
          error: null,
          cached: true,
          stale: false,
          cachedAt: timestamp,
          timestamp,
        };
      }
    } catch {
      // Cache read failure — proceed without cache
    }
  }

  // Fetch from NHTSA
  try {
    const url = `${NHTSA_BASE_URL}/${encodeURIComponent(vin)}?format=json`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return {
        success: false,
        data: null,
        error: {
          code: 'SCRAPER_ERROR',
          message: `NHTSA API returned HTTP ${response.status}`,
          retryable: true,
          retryAfterMs: null,
        },
        cached: false,
        stale: false,
        cachedAt: null,
        timestamp,
      };
    }

    const data = (await response.json()) as NhtsaResponse;
    const result = parseNhtsaResponse(vin, data);

    // Store in cache
    if (cache) {
      try {
        await cache.set(vin, result, CACHE_TTL_SECONDS);
      } catch {
        // Cache write failure — non-fatal
      }
    }

    return {
      success: true,
      data: result,
      error: null,
      cached: false,
      stale: false,
      cachedAt: null,
      timestamp,
    };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      success: false,
      data: null,
      error: {
        code: isTimeout ? 'TIMEOUT' : 'SCRAPER_ERROR',
        message:
          err instanceof Error ? err.message : 'Unknown error contacting NHTSA API',
        retryable: true,
        retryAfterMs: null,
      },
      cached: false,
      stale: false,
      cachedAt: null,
      timestamp,
    };
  }
}
