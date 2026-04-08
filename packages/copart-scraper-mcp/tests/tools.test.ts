import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSearchHandler } from '../src/tools/search.js';
import { createListingHandler } from '../src/tools/listing.js';
import { createSoldHandler } from '../src/tools/sold.js';
import { createWatchlistHandler } from '../src/tools/watchlist.js';
import { createVinHandler } from '../src/tools/vin.js';
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';
import type { AuctionListing } from '@car-auctions/shared';
import type { ScraperResult } from '../src/types/index.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const mockListing: AuctionListing = {
  source: 'copart',
  lot_number: '12345678',
  vin: '4T1B11HK3KU123456',
  year: 2019,
  make: 'Toyota',
  model: 'Camry',
  trim: null,
  title_type: 'SV - State of TX',
  title_code: null,
  damage_primary: 'Front End',
  damage_secondary: 'Minor Dents/Scratches',
  has_keys: true,
  odometer: 45231,
  odometer_status: null,
  color: 'Silver',
  engine: '2.5L 4 Cylinder',
  transmission: 'Automatic',
  drive_type: null,
  fuel_type: null,
  cylinders: null,
  current_bid: 3200,
  buy_now_price: 15000,
  sale_date: '2024-01-15',
  sale_status: 'On Minimum Bid',
  final_bid: null,
  location: 'Houston, TX',
  latitude: null,
  longitude: null,
  image_url: 'https://cs.copart.com/v1/AUTH_svc/12345678_ful.jpg',
  image_urls: ['https://cs.copart.com/v1/AUTH_svc/12345678_ful.jpg'],
  detail_url: '/lot/12345678',
  seller: 'GEICO',
  grid_row: null,
  fetched_at: new Date().toISOString(),
};

function freshResult<T>(data: T): ScraperResult<T> {
  return { data, cached: false, stale: false, cachedAt: null };
}

function staleResult<T>(data: T, cachedAt: string): ScraperResult<T> {
  return { data, cached: true, stale: true, cachedAt };
}

// ─── Mock Client ───────────────────────────────────────────────────────────────

function makeMockClient() {
  return {
    search: vi.fn(),
    getListing: vi.fn(),
    getImages: vi.fn(),
    getSoldHistory: vi.fn(),
  };
}

// ─── Mock Cache ────────────────────────────────────────────────────────────────

function makeMockCache() {
  const store = new Map<string, unknown>();
  return {
    watchlistAdd: vi.fn(
      (params: { lot_number: string; bid_threshold?: number; notes?: string }) => {
        store.set(params.lot_number, {
          lot_number: params.lot_number,
          source: 'copart',
          added_at: new Date().toISOString(),
          bid_threshold: params.bid_threshold ?? null,
          last_checked_at: null,
          last_bid: null,
          last_status: null,
          notes: params.notes ?? null,
        });
      }
    ),
    watchlistRemove: vi.fn((lot: string) => {
      const existed = store.has(lot);
      store.delete(lot);
      return existed;
    }),
    watchlistList: vi.fn(() => Array.from(store.values())),
    watchlistGet: vi.fn((lot: string) => store.get(lot) ?? null),
  };
}

// ─── Mock VinCache ─────────────────────────────────────────────────────────────

function makeMockVinCache() {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── copart_search tests ───────────────────────────────────────────────────────

describe('copart_search tool', () => {
  it('returns listings on success', async () => {
    const client = makeMockClient();
    client.search.mockResolvedValue(freshResult([mockListing]));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'Toyota Camry' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.error).toBeNull();
    expect(parsed.cached).toBe(false);
    expect(parsed.stale).toBe(false);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].lot_number).toBe('12345678');
  });

  it('propagates stale=true from cache fallback', async () => {
    const client = makeMockClient();
    const cachedAt = '2024-01-10T00:00:00.000Z';
    client.search.mockResolvedValue(staleResult([mockListing], cachedAt));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'Toyota Camry' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.stale).toBe(true);
    expect(parsed.cached).toBe(true);
    expect(parsed.cachedAt).toBe(cachedAt);
  });

  it('returns structured error on ScraperError', async () => {
    const client = makeMockClient();
    client.search.mockRejectedValue(new ScraperError('Page timeout', 'TIMEOUT', true, 5000));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'Ford F-150' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('TIMEOUT');
    expect(parsed.error.retryable).toBe(true);
  });

  it('returns structured error on CaptchaError', async () => {
    const client = makeMockClient();
    client.search.mockRejectedValue(new CaptchaError('CAPTCHA detected'));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'Honda Civic' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('CAPTCHA_DETECTED');
    expect(parsed.error.retryable).toBe(false);
  });

  it('returns structured error on RateLimitError', async () => {
    const client = makeMockClient();
    client.search.mockRejectedValue(new RateLimitError('Rate limited', 60000));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'BMW' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('RATE_LIMITED');
    expect(parsed.error.retryAfterMs).toBe(60000);
  });

  it('returns empty data array when no results', async () => {
    const client = makeMockClient();
    client.search.mockResolvedValue(freshResult([]));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'rare model' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(0);
  });

  it('includes timestamp in all responses', async () => {
    const client = makeMockClient();
    client.search.mockResolvedValue(freshResult([mockListing]));
    const handler = createSearchHandler(client as never);

    const result = await handler({ query: 'test' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(typeof parsed.timestamp).toBe('string');
    expect(new Date(parsed.timestamp).getTime()).toBeGreaterThan(0);
  });
});

// ─── copart_get_listing tests ──────────────────────────────────────────────────

describe('copart_get_listing tool', () => {
  it('returns listing on success', async () => {
    const client = makeMockClient();
    client.getListing.mockResolvedValue(freshResult(mockListing));
    const handler = createListingHandler(client as never);

    const result = await handler({ lot_number: '12345678' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data.lot_number).toBe('12345678');
    expect(parsed.data.make).toBe('Toyota');
    expect(parsed.cached).toBe(false);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('returns error on not found', async () => {
    const client = makeMockClient();
    client.getListing.mockRejectedValue(new ScraperError('Lot not found', 'SCRAPER_ERROR', false));
    const handler = createListingHandler(client as never);

    const result = await handler({ lot_number: '00000000' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('SCRAPER_ERROR');
  });
});

// ─── copart_sold_history tests ─────────────────────────────────────────────────

describe('copart_sold_history tool', () => {
  it('returns sold entries on success', async () => {
    const client = makeMockClient();
    const entries = [
      {
        lotNumber: '111',
        vin: '4T1B11HK3KU111111',
        year: 2021,
        make: 'Toyota',
        model: 'Camry',
        finalBid: 8500,
        saleDate: '2023-06-01',
        location: 'Austin, TX',
        damage: 'Front End',
        titleType: 'SV',
        odometer: 22000,
      },
    ];
    client.getSoldHistory.mockResolvedValue(freshResult(entries));
    const handler = createSoldHandler(client as never);

    const result = await handler({ make: 'Toyota', model: 'Camry' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].finalBid).toBe(8500);
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('returns error on scraper failure', async () => {
    const client = makeMockClient();
    client.getSoldHistory.mockRejectedValue(new ScraperError('Scrape failed'));
    const handler = createSoldHandler(client as never);

    const result = await handler({ make: 'Ford', model: 'Mustang' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
  });
});

// ─── copart_watch_listing tests ────────────────────────────────────────────────

describe('copart_watch_listing tool', () => {
  let cache: ReturnType<typeof makeMockCache>;

  beforeEach(() => {
    cache = makeMockCache();
  });

  it('adds a lot to watchlist', async () => {
    const handler = createWatchlistHandler(cache as never);

    const result = await handler({
      action: 'add',
      lot_number: '12345678',
      bid_threshold: 5000,
    });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(cache.watchlistAdd).toHaveBeenCalledWith({
      lot_number: '12345678',
      bid_threshold: 5000,
      notes: undefined,
    });
    expect(typeof parsed.timestamp).toBe('string');
  });

  it('returns validation error when add is missing lot_number', async () => {
    const handler = createWatchlistHandler(cache as never);

    const result = await handler({ action: 'add' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it('removes a lot from watchlist', async () => {
    cache.watchlistRemove.mockReturnValue(true);
    const handler = createWatchlistHandler(cache as never);

    const result = await handler({ action: 'remove', lot_number: '12345678' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
  });

  it('returns not-found when removing nonexistent lot', async () => {
    cache.watchlistRemove.mockReturnValue(false);
    const handler = createWatchlistHandler(cache as never);

    const result = await handler({ action: 'remove', lot_number: 'NOTHERE' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('lists watchlist entries', async () => {
    cache.watchlistList.mockReturnValue([
      { lot_number: 'AAA', source: 'copart', added_at: new Date().toISOString() },
    ]);
    const handler = createWatchlistHandler(cache as never);

    const result = await handler({ action: 'list' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveLength(1);
  });
});

// ─── copart_decode_vin tests ───────────────────────────────────────────────────

describe('copart_decode_vin tool', () => {
  it('rejects VIN with forbidden characters', async () => {
    const vinCache = makeMockVinCache();
    const handler = createVinHandler(vinCache as never);

    // VIN containing 'I' (forbidden)
    const result = await handler({ vin: '1HGCM82633A1I4567' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(false);
    expect(parsed.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns decode result for valid VIN', async () => {
    const vinCache = makeMockVinCache();
    // Mock decodeVin by providing a cache that returns data
    vinCache.get.mockResolvedValue({
      vin: '4T1B11HK3KU123456',
      year: 2019,
      make: 'Toyota',
      model: 'Camry',
      trim: 'LE',
      engineType: '2.5L 4-cyl',
      bodyClass: 'Sedan',
      driveType: 'FWD',
      fuelType: 'Gasoline',
      transmission: 'Automatic',
      cylinders: 4,
      displacementL: 2.5,
      manufacturer: 'Toyota',
      plantCountry: 'Japan',
      vehicleType: 'PASSENGER CAR',
      errorCode: '0',
    });
    const handler = createVinHandler(vinCache as never);

    const result = await handler({ vin: '4T1B11HK3KU123456' });
    const parsed = JSON.parse(result.content[0]!.text);

    expect(parsed.success).toBe(true);
    expect(parsed.data.make).toBe('Toyota');
    expect(typeof parsed.timestamp).toBe('string');
  });
});
