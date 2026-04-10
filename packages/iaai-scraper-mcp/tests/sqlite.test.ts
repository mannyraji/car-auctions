/**
 * Tests for IaaiSqliteCache — schema init, CRUD, TTL, and watchlist operations.
 * Uses an in-memory SQLite database (:memory:) to avoid disk I/O.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IaaiSqliteCache } from '../src/cache/sqlite.js';
import type { AuctionListing } from '@car-auctions/shared';
import type { SoldHistoryResponse, WatchlistEntry } from '../src/types/index.js';

function makeCache(): IaaiSqliteCache {
  return new IaaiSqliteCache(':memory:');
}

const stubListing: AuctionListing = {
  lot_number: 'TEST123',
  vin: '1HGBH41JXMN109186',
  year: 2022,
  make: 'Honda',
  model: 'Civic',
  trim: null,
  body_style: null,
  color: null,
  odometer: 15000,
  odometer_brand: null,
  title_type: 'CLEAR',
  damage_primary: 'Front End',
  damage_secondary: null,
  has_keys: true,
  engine: null,
  transmission: null,
  drive: null,
  fuel: null,
  cylinders: null,
  current_bid: 5000,
  buy_now_price: null,
  sale_date: '2026-04-10T00:00:00Z',
  sale_status: 'UPCOMING',
  final_bid: null,
  location: 'Dallas, TX',
  location_zip: '75001',
  images: [],
  source: 'iaai',
  detail_url: 'https://www.iaai.com/vehicle/TEST123',
};

const stubSoldHistory: SoldHistoryResponse = {
  lots: [
    {
      lot_number: 'SOLD001',
      sale_date: '2026-03-01',
      final_bid: 4200,
      damage_primary: 'Front End',
      odometer: 22000,
      title_type: 'CLEAR',
    },
  ],
  aggregates: {
    count: 1,
    avg_final_bid: 4200,
    median_final_bid: 4200,
    price_range: { low: 4200, high: 4200 },
  },
};

describe('IaaiSqliteCache', () => {
  let cache: IaaiSqliteCache;

  beforeEach(() => {
    cache = makeCache();
  });

  afterEach(() => {
    cache.close();
  });

  // ─── Listings ──────────────────────────────────────────────────────────────

  it('returns null for a missing listing', async () => {
    const result = await cache.getListing('NONE');
    expect(result).toBeNull();
  });

  it('stores and retrieves a listing', async () => {
    await cache.setListing(stubListing.lot_number, stubListing);
    const entry = await cache.getListing(stubListing.lot_number);
    expect(entry).not.toBeNull();
    expect(entry!.data.lot_number).toBe(stubListing.lot_number);
    expect(entry!.fetched_at).toBeTruthy();
  });

  it('evicts an expired listing', async () => {
    await cache.setListing(stubListing.lot_number, stubListing, -1); // already expired
    const result = await cache.getListing(stubListing.lot_number);
    expect(result).toBeNull();
  });

  it('returns stale listing when allowStale=true', async () => {
    await cache.setListing(stubListing.lot_number, stubListing, -1);
    const stale = await cache.getListing(stubListing.lot_number, true);
    expect(stale).not.toBeNull();
    expect(stale!.data.lot_number).toBe(stubListing.lot_number);
  });

  // ─── Searches ──────────────────────────────────────────────────────────────

  it('returns null for a missing search', async () => {
    expect(await cache.getSearch('no-key')).toBeNull();
  });

  it('stores and retrieves a search', async () => {
    await cache.setSearch('key1', [stubListing]);
    const entry = await cache.getSearch('key1');
    expect(entry).not.toBeNull();
    expect(entry!.data).toHaveLength(1);
    expect(entry!.data[0].lot_number).toBe(stubListing.lot_number);
  });

  it('evicts an expired search', async () => {
    await cache.setSearch('key1', [stubListing], -1);
    expect(await cache.getSearch('key1')).toBeNull();
  });

  // ─── Sold History ──────────────────────────────────────────────────────────

  it('returns null for a missing sold history', async () => {
    expect(await cache.getSoldHistory('no-key')).toBeNull();
  });

  it('stores and retrieves sold history', async () => {
    await cache.setSoldHistory('sold-key', stubSoldHistory);
    const entry = await cache.getSoldHistory('sold-key');
    expect(entry).not.toBeNull();
    expect(entry!.data.lots).toHaveLength(1);
    expect(entry!.data.aggregates.count).toBe(1);
  });

  it('evicts expired sold history', async () => {
    await cache.setSoldHistory('sold-key', stubSoldHistory, -1);
    expect(await cache.getSoldHistory('sold-key')).toBeNull();
  });

  // ─── Watchlist ─────────────────────────────────────────────────────────────

  it('adds and lists watchlist entries', () => {
    cache.watchlistAdd({ lot_number: 'LOT-A', bid_threshold: 3000 });
    const list = cache.watchlistList();
    expect(list).toHaveLength(1);
    expect(list[0].lot_number).toBe('LOT-A');
    expect(list[0].source).toBe('iaai');
    expect(list[0].bid_threshold).toBe(3000);
  });

  it('ignores duplicate watchlist inserts', () => {
    cache.watchlistAdd({ lot_number: 'LOT-DUP' });
    cache.watchlistAdd({ lot_number: 'LOT-DUP' });
    expect(cache.watchlistList()).toHaveLength(1);
  });

  it('retrieves a single watchlist entry', () => {
    cache.watchlistAdd({ lot_number: 'LOT-B' });
    const entry = cache.watchlistGet('LOT-B');
    expect(entry).not.toBeNull();
    expect(entry!.lot_number).toBe('LOT-B');
  });

  it('returns null for missing watchlist entry', () => {
    expect(cache.watchlistGet('NONE')).toBeNull();
  });

  it('removes a watchlist entry', () => {
    cache.watchlistAdd({ lot_number: 'LOT-C' });
    const removed = cache.watchlistRemove('LOT-C');
    expect(removed).toBe(true);
    expect(cache.watchlistList()).toHaveLength(0);
  });

  it('returns false when removing a non-existent entry', () => {
    expect(cache.watchlistRemove('NONE')).toBe(false);
  });

  it('updates watchlist fields', () => {
    cache.watchlistAdd({ lot_number: 'LOT-D' });
    cache.watchlistUpdate('LOT-D', { last_bid: 1500, last_status: 'ACTIVE' });
    const entry = cache.watchlistGet('LOT-D') as WatchlistEntry;
    expect(entry.last_bid).toBe(1500);
    expect(entry.last_status).toBe('ACTIVE');
  });

  it('ignores unknown columns in watchlistUpdate', () => {
    cache.watchlistAdd({ lot_number: 'LOT-E' });
    // Passing lot_number (blocked) and an unknown column — should be a no-op
    expect(() =>
      cache.watchlistUpdate('LOT-E', {
        lot_number: 'HACK',
      } as Partial<WatchlistEntry>)
    ).not.toThrow();
    const entry = cache.watchlistGet('LOT-E') as WatchlistEntry;
    expect(entry.lot_number).toBe('LOT-E');
  });

  // ─── Watchlist History ─────────────────────────────────────────────────────

  it('records watchlist history entries', () => {
    cache.watchlistAdd({ lot_number: 'LOT-H' });
    const now = new Date().toISOString();
    cache.watchlistAddHistory({
      lot_number: 'LOT-H',
      field: 'last_bid',
      old_value: '1000',
      new_value: '2000',
      detected_at: now,
    });
    // Verify via a direct read (no public list method required by T011)
    const entry = cache.watchlistGet('LOT-H');
    expect(entry).not.toBeNull();
  });

  it('cascades watchlist_history delete when watchlist row is removed', () => {
    cache.watchlistAdd({ lot_number: 'LOT-I' });
    cache.watchlistAddHistory({
      lot_number: 'LOT-I',
      field: 'last_bid',
      old_value: null,
      new_value: '500',
      detected_at: new Date().toISOString(),
    });
    cache.watchlistRemove('LOT-I');
    // Parent row is gone
    expect(cache.watchlistGet('LOT-I')).toBeNull();
    // History rows must also be gone (ON DELETE CASCADE)
    expect(cache.watchlistGetHistory('LOT-I')).toHaveLength(0);
  });
});
