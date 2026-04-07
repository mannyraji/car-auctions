/**
 * @file src/vin-decoder/sqlite-cache.ts
 * @description VinCache implementations: SqliteVinCache (production) and FifoVinCache (testing).
 * INTERNAL — not re-exported from vin-decoder/index.ts or src/index.ts.
 * FifoVinCache IS exported for use in test files.
 */

import type { VINDecodeResult } from '../types/index.js';
import type { VinCache } from './index.js';
import { CacheError } from '../errors.js';

// ============================================================
// SqliteVinCache — production implementation
// ============================================================

interface CacheRow {
  result: string;
  cached_at: number;
  expires_at: number;
}

/**
 * SQLite-backed VinCache implementation using better-sqlite3.
 * Uses WAL journal mode for concurrent read performance.
 * Database is stored at `data/vin-cache.sqlite` relative to CWD by default.
 *
 * @example
 * const cache = new SqliteVinCache('./data/vin-cache.sqlite');
 * const result = cache.get('1HGBH41JXMN109186');
 */
export class SqliteVinCache implements VinCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: any;

  constructor(dbPath = 'data/vin-cache.sqlite') {
    try {
      // Using require() for CJS-only native module (better-sqlite3) in ESM context.
      // This is intentional — better-sqlite3 does not have an ESM build.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Database = require('better-sqlite3') as new (path: string) => any;
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this._initialize();
    } catch (err) {
      throw new CacheError(
        `Failed to open SQLite VIN cache at "${dbPath}": ${String(err)}`
      );
    }
  }

  private _initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vin_cache (
        vin TEXT PRIMARY KEY,
        result TEXT NOT NULL,
        cached_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vin_cache_expires ON vin_cache(expires_at);
    `);
    // Sweep expired rows on open
    this.db
      .prepare('DELETE FROM vin_cache WHERE expires_at <= ?')
      .run(Date.now());
  }

  /**
   * Returns cached VINDecodeResult if present and not expired, null otherwise.
   */
  get(vin: string): VINDecodeResult | null {
    try {
      const row = this.db
        .prepare(
          'SELECT result, cached_at, expires_at FROM vin_cache WHERE vin = ?'
        )
        .get(vin) as CacheRow | undefined;

      if (!row) return null;
      if (row.expires_at <= Date.now()) return null;
      return JSON.parse(row.result) as VINDecodeResult;
    } catch (err) {
      throw new CacheError(`Failed to read VIN cache for "${vin}": ${String(err)}`);
    }
  }

  /**
   * Stores a VINDecodeResult with the given TTL.
   */
  set(vin: string, result: VINDecodeResult, ttlMs: number): void {
    const now = Date.now();
    try {
      this.db
        .prepare(`
          INSERT OR REPLACE INTO vin_cache (vin, result, cached_at, expires_at)
          VALUES (?, ?, ?, ?)
        `)
        .run(vin, JSON.stringify(result), now, now + ttlMs);
    } catch (err) {
      throw new CacheError(`Failed to write VIN cache for "${vin}": ${String(err)}`);
    }
  }
}

// ============================================================
// FifoVinCache — in-memory LRU for testing
// ============================================================

interface FifoCacheEntry {
  result: VINDecodeResult;
  expiresAt: number;
}

/**
 * In-memory FIFO VinCache implementation for testing.
 * Uses insertion-order eviction at maxSize (default: 200).
 *
 * @example
 * const cache = new FifoVinCache(100);
 * cache.set(vin, result, 90 * 24 * 60 * 60 * 1000);
 * const hit = cache.get(vin); // VINDecodeResult or null
 */
export class FifoVinCache implements VinCache {
  private readonly store: Map<string, FifoCacheEntry>;
  private readonly maxSize: number;

  constructor(maxSize = 200) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Returns cached result or null if not found / expired.
   */
  get(vin: string): VINDecodeResult | null {
    const entry = this.store.get(vin);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(vin);
      return null;
    }
    return entry.result;
  }

  /**
   * Stores result with the given TTL. Evicts oldest entry if at capacity.
   */
  set(vin: string, result: VINDecodeResult, ttlMs: number): void {
    // Evict existing entry to re-insert at end (update access order)
    if (this.store.has(vin)) {
      this.store.delete(vin);
    } else if (this.store.size >= this.maxSize) {
      // Evict the oldest-inserted key
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) {
        this.store.delete(firstKey);
      }
    }
    this.store.set(vin, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }
}
