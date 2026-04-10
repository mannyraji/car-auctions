/**
 * SQLite cache for IAAI data (WAL mode, TTL-based expiry)
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import type { AuctionListing } from '@car-auctions/shared';
import type {
  SoldHistoryResponse,
  WatchlistEntry,
  WatchlistHistoryEntry,
  WatchlistAddParams,
} from '../types/index.js';

const require = createRequire(import.meta.url);

let BetterSqlite3: typeof import('better-sqlite3') | null = null;
function loadSqlite(): typeof import('better-sqlite3') {
  if (!BetterSqlite3) {
    BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
  }
  return BetterSqlite3;
}

function resolveDefaultPath(): string {
  // Resolves to <package-root>/data/iaai.sqlite regardless of cwd.
  // src/cache/sqlite.ts → ../../ = package root
  const here = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(here), '..', '..', 'data', 'iaai.sqlite');
}

/** Cache row with both data and timing metadata. */
export interface CacheEntry<T> {
  data: T;
  fetched_at: string;
}

export class IaaiSqliteCache {
  private readonly db: import('better-sqlite3').Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath ?? resolveDefaultPath();
    const Database = loadSqlite();
    this.db = new (Database as unknown as new (path: string) => import('better-sqlite3').Database)(
      resolvedPath
    );
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS listings (
        lot_number TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS searches (
        cache_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sold_history (
        cache_key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS watchlist (
        lot_number TEXT PRIMARY KEY,
        source TEXT NOT NULL DEFAULT 'iaai',
        added_at TEXT NOT NULL,
        bid_threshold REAL,
        last_checked_at TEXT,
        last_bid REAL,
        last_status TEXT,
        notes TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_watchlist_source ON watchlist(source);
      CREATE INDEX IF NOT EXISTS idx_watchlist_last_checked ON watchlist(last_checked_at);
      CREATE TABLE IF NOT EXISTS watchlist_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lot_number TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        detected_at TEXT NOT NULL,
        FOREIGN KEY (lot_number) REFERENCES watchlist(lot_number) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_watchlist_history_lot ON watchlist_history(lot_number);
      CREATE INDEX IF NOT EXISTS idx_listings_expires ON listings(expires_at);
      CREATE INDEX IF NOT EXISTS idx_sold_expires ON sold_history(expires_at);
    `);
  }

  // ─── Listings ──────────────────────────────────────────────────────────────

  async getListing(
    lotNumber: string,
    allowStale = false
  ): Promise<CacheEntry<AuctionListing> | null> {
    const stmt = this.db.prepare<
      [string],
      { data: string; expires_at: number; fetched_at: string }
    >('SELECT data, expires_at, fetched_at FROM listings WHERE lot_number = ?');
    const row = stmt.get(lotNumber);
    if (!row) return null;
    if (!allowStale && Date.now() > row.expires_at) {
      this.db.prepare('DELETE FROM listings WHERE lot_number = ?').run(lotNumber);
      return null;
    }
    return { data: JSON.parse(row.data) as AuctionListing, fetched_at: row.fetched_at };
  }

  async setListing(lotNumber: string, listing: AuctionListing, ttlMinutes = 60): Promise<void> {
    const now = new Date().toISOString();
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    this.db
      .prepare(
        'INSERT OR REPLACE INTO listings (lot_number, data, fetched_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(lotNumber, JSON.stringify(listing), now, expiresAt);
  }

  // ─── Searches ──────────────────────────────────────────────────────────────

  async getSearch(
    cacheKey: string,
    allowStale = false
  ): Promise<CacheEntry<AuctionListing[]> | null> {
    const stmt = this.db.prepare<
      [string],
      { data: string; expires_at: number; fetched_at: string }
    >('SELECT data, expires_at, fetched_at FROM searches WHERE cache_key = ?');
    const row = stmt.get(cacheKey);
    if (!row) return null;
    if (!allowStale && Date.now() > row.expires_at) {
      this.db.prepare('DELETE FROM searches WHERE cache_key = ?').run(cacheKey);
      return null;
    }
    return { data: JSON.parse(row.data) as AuctionListing[], fetched_at: row.fetched_at };
  }

  async setSearch(cacheKey: string, listings: AuctionListing[], ttlMinutes = 15): Promise<void> {
    const now = new Date().toISOString();
    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;
    this.db
      .prepare(
        'INSERT OR REPLACE INTO searches (cache_key, data, fetched_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(cacheKey, JSON.stringify(listings), now, expiresAt);
  }

  // ─── Sold History ──────────────────────────────────────────────────────────

  async getSoldHistory(
    cacheKey: string,
    allowStale = false
  ): Promise<CacheEntry<SoldHistoryResponse> | null> {
    const stmt = this.db.prepare<
      [string],
      { data: string; expires_at: number; fetched_at: string }
    >('SELECT data, expires_at, fetched_at FROM sold_history WHERE cache_key = ?');
    const row = stmt.get(cacheKey);
    if (!row) return null;
    if (!allowStale && Date.now() > row.expires_at) {
      this.db.prepare('DELETE FROM sold_history WHERE cache_key = ?').run(cacheKey);
      return null;
    }
    return { data: JSON.parse(row.data) as SoldHistoryResponse, fetched_at: row.fetched_at };
  }

  async setSoldHistory(
    cacheKey: string,
    response: SoldHistoryResponse,
    ttlDays = 7
  ): Promise<void> {
    const now = new Date().toISOString();
    const expiresAt = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
    this.db
      .prepare(
        'INSERT OR REPLACE INTO sold_history (cache_key, data, fetched_at, expires_at) VALUES (?, ?, ?, ?)'
      )
      .run(cacheKey, JSON.stringify(response), now, expiresAt);
  }

  // ─── Watchlist ─────────────────────────────────────────────────────────────

  watchlistAdd(params: WatchlistAddParams): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO watchlist (lot_number, source, added_at, bid_threshold, notes)
         VALUES (?, 'iaai', ?, ?, ?)`
      )
      .run(params.lot_number, now, params.bid_threshold ?? null, params.notes ?? null);
  }

  watchlistRemove(lotNumber: string): boolean {
    const result = this.db.prepare('DELETE FROM watchlist WHERE lot_number = ?').run(lotNumber);
    return result.changes > 0;
  }

  watchlistList(): WatchlistEntry[] {
    return this.db
      .prepare('SELECT * FROM watchlist ORDER BY added_at DESC')
      .all() as WatchlistEntry[];
  }

  watchlistGet(lotNumber: string): WatchlistEntry | null {
    return (
      (this.db.prepare('SELECT * FROM watchlist WHERE lot_number = ?').get(lotNumber) as
        | WatchlistEntry
        | undefined) ?? null
    );
  }

  private static readonly WATCHLIST_COLUMNS = new Set([
    'source',
    'added_at',
    'bid_threshold',
    'last_checked_at',
    'last_bid',
    'last_status',
    'notes',
  ]);

  watchlistUpdate(lotNumber: string, updates: Partial<WatchlistEntry>): void {
    // Safety: only entries whose key is in WATCHLIST_COLUMNS (a static allowlist) reach
    // the SQL template. lot_number is explicitly excluded to prevent PK mutation.
    // The column names never come from user input — they originate from the typed
    // Partial<WatchlistEntry> keys, and the allowlist rejects anything unexpected.
    const safeEntries = Object.entries(updates).filter(
      ([k]) => k !== 'lot_number' && IaaiSqliteCache.WATCHLIST_COLUMNS.has(k)
    );
    if (safeEntries.length === 0) return;
    const fields = safeEntries.map(([k]) => `${k} = ?`).join(', ');
    const values = safeEntries.map(([, v]) => v);
    this.db
      .prepare(`UPDATE watchlist SET ${fields} WHERE lot_number = ?`)
      .run(...values, lotNumber);
  }

  watchlistAddHistory(entry: Omit<WatchlistHistoryEntry, 'id'>): void {
    this.db
      .prepare(
        `INSERT INTO watchlist_history (lot_number, field, old_value, new_value, detected_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(entry.lot_number, entry.field, entry.old_value, entry.new_value, entry.detected_at);
  }

  close(): void {
    this.db.close();
  }
}
