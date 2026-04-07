/**
 * SQLite VIN cache
 *
 * Uses better-sqlite3 in WAL mode. CJS-only module loaded via createRequire.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import type { VINDecodeResult, VinCache } from '../types/index.js';

const require = createRequire(import.meta.url);

// Lazy-loaded to avoid errors when better-sqlite3 is not available
let BetterSqlite3: typeof import('better-sqlite3') | null = null;

function loadSqlite(): typeof import('better-sqlite3') {
  if (!BetterSqlite3) {
    BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
  }
  return BetterSqlite3;
}

interface CacheRow {
  vin: string;
  result_json: string;
  expires_at: number;
}

/**
 * SQLite-backed VIN cache with WAL mode and TTL support.
 *
 * @example
 * const cache = new SqliteVinCache('./data/vin-cache.sqlite');
 * await cache.set(vin, result, 90 * 24 * 60 * 60 * 1000);
 * const cached = await cache.get(vin);
 */
export class SqliteVinCache implements VinCache {
  private readonly db: import('better-sqlite3').Database;
  private readonly stmtGet: import('better-sqlite3').Statement;
  private readonly stmtSet: import('better-sqlite3').Statement;
  private readonly stmtDelete: import('better-sqlite3').Statement;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? resolveDefaultPath();
    const Database = loadSqlite();
    this.db = new (Database as unknown as new (path: string) => import('better-sqlite3').Database)(
      resolvedPath
    );

    // WAL mode for concurrent reads
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    // Create table if not exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vin_cache (
        vin        TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        expires_at  INTEGER NOT NULL
      )
    `);

    this.stmtGet = this.db.prepare(
      'SELECT vin, result_json, expires_at FROM vin_cache WHERE vin = ?'
    );
    this.stmtSet = this.db.prepare(
      'INSERT OR REPLACE INTO vin_cache (vin, result_json, expires_at) VALUES (?, ?, ?)'
    );
    this.stmtDelete = this.db.prepare('DELETE FROM vin_cache WHERE vin = ?');
  }

  async get(vin: string): Promise<VINDecodeResult | null> {
    const row = this.stmtGet.get(vin) as CacheRow | undefined;
    if (!row) return null;
    if (Date.now() > row.expires_at) {
      this.stmtDelete.run(vin);
      return null;
    }
    return JSON.parse(row.result_json) as VINDecodeResult;
  }

  async set(vin: string, result: VINDecodeResult, ttlMs: number): Promise<void> {
    this.stmtSet.run(vin, JSON.stringify(result), Date.now() + ttlMs);
  }

  /** Close the database connection */
  close(): void {
    this.db.close();
  }
}

function resolveDefaultPath(): string {
  // Resolve relative to the package root (two levels up from src/vin-decoder/)
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), '..', '..', 'data', 'vin-cache.sqlite');
}
