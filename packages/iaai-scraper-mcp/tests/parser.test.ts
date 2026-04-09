import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseSearchResults,
  parseListingDetail,
  parseSoldResults,
  computeAggregates,
  extractImageUrls,
} from '../src/scraper/parser.js';
import { IaaiClient } from '../src/scraper/iaai-client.js';
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';
import type { AuctionListing } from '@car-auctions/shared';
import type { ScraperResult, IaaiSoldEntry, SoldHistoryResponse } from '../src/types/index.js';
import searchFixture from './fixtures/iaai-search-response.json';
import listingFixture from './fixtures/iaai-listing-response.json';
import soldFixture from './fixtures/iaai-sold-response.json';

// ─── parser tests ─────────────────────────────────────────────────────────────

describe('parseSearchResults', () => {
  it('parses items array from search fixture', () => {
    const items = parseSearchResults(searchFixture);
    expect(items).toHaveLength(3);
    expect(items[0]?.stockNumber).toBe('A12345678');
    expect(items[1]?.makeName).toBe('Honda');
  });

  it('throws ScraperError for null input', () => {
    expect(() => parseSearchResults(null)).toThrow(ScraperError);
  });

  it('throws ScraperError for non-object input', () => {
    expect(() => parseSearchResults('invalid')).toThrow(ScraperError);
  });

  it('handles flat array input', () => {
    const items = parseSearchResults([{ stockNumber: 'X1', makeName: 'Ford' }]);
    expect(items).toHaveLength(1);
    expect(items[0]?.makeName).toBe('Ford');
  });

  it('handles results key', () => {
    const items = parseSearchResults({ results: [{ stockNumber: 'R1' }] });
    expect(items).toHaveLength(1);
  });
});

describe('parseListingDetail', () => {
  it('parses listing from fixture', () => {
    const item = parseListingDetail(listingFixture);
    expect(item.stockNumber).toBe('A12345678');
    expect(item.makeName).toBe('Toyota');
    expect(item.year).toBe(2019);
  });

  it('maps detail-only fields into grid_row', () => {
    const item = parseListingDetail(listingFixture);
    expect(item.grid_row).toBeDefined();
    const gr = item.grid_row as Record<string, unknown>;
    expect(gr['conditionGradeDisplay']).toBe('3.5');
    expect(gr['lossType']).toBe('Collision');
    expect(gr['startCode']).toBe('START');
  });

  it('throws ScraperError for null input', () => {
    expect(() => parseListingDetail(null)).toThrow(ScraperError);
  });

  it('unwraps stockDetails wrapper', () => {
    const wrapped = { stockDetails: { stockNumber: 'WRAP1', makeName: 'Kia' } };
    const item = parseListingDetail(wrapped);
    expect(item.stockNumber).toBe('WRAP1');
    expect(item.makeName).toBe('Kia');
  });
});

describe('parseSoldResults', () => {
  it('parses sold entries from fixture', () => {
    const entries = parseSoldResults(soldFixture);
    expect(entries).toHaveLength(5);
    expect(entries[0]?.lot_number).toBe('S10000001');
    expect(entries[0]?.final_bid).toBe(4200);
  });

  it('preserves null for missing finalBid', () => {
    const entries = parseSoldResults(soldFixture);
    const nullEntry = entries.find((e) => e.lot_number === 'S10000003');
    expect(nullEntry?.final_bid).toBeNull();
  });

  it('throws ScraperError for null input', () => {
    expect(() => parseSoldResults(null)).toThrow(ScraperError);
  });

  it('returns empty array for empty items', () => {
    expect(parseSoldResults({ items: [] })).toEqual([]);
  });
});

describe('computeAggregates', () => {
  it('computes correct aggregates from sold entries', () => {
    const entries: IaaiSoldEntry[] = [
      { lot_number: 'A', sale_date: '', final_bid: 4200, damage_primary: '', odometer: null, title_type: '' },
      { lot_number: 'B', sale_date: '', final_bid: 5800, damage_primary: '', odometer: null, title_type: '' },
      { lot_number: 'C', sale_date: '', final_bid: null, damage_primary: '', odometer: null, title_type: '' },
      { lot_number: 'D', sale_date: '', final_bid: 7100, damage_primary: '', odometer: null, title_type: '' },
      { lot_number: 'E', sale_date: '', final_bid: 3500, damage_primary: '', odometer: null, title_type: '' },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(4); // null excluded
    expect(agg.price_range.low).toBe(3500);
    expect(agg.price_range.high).toBe(7100);
    expect(agg.avg_final_bid).toBeCloseTo(5150, 1);
    expect(agg.median_final_bid).toBe(5000); // median of [3500, 4200, 5800, 7100]
  });

  it('returns all zeros when all finalBids are null', () => {
    const entries: IaaiSoldEntry[] = [
      { lot_number: 'X', sale_date: '', final_bid: null, damage_primary: '', odometer: null, title_type: '' },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(0);
    expect(agg.avg_final_bid).toBe(0);
    expect(agg.median_final_bid).toBe(0);
    expect(agg.price_range.low).toBe(0);
    expect(agg.price_range.high).toBe(0);
  });

  it('returns all zeros for empty array', () => {
    const agg = computeAggregates([]);
    expect(agg.count).toBe(0);
  });

  it('computes median correctly for odd-length array', () => {
    const entries: IaaiSoldEntry[] = [
      { lot_number: 'A', sale_date: '', final_bid: 1000, damage_primary: '', odometer: null, title_type: '' },
      { lot_number: 'B', sale_date: '', final_bid: 2000, damage_primary: '', odometer: null, title_type: '' },
      { lot_number: 'C', sale_date: '', final_bid: 3000, damage_primary: '', odometer: null, title_type: '' },
    ];
    const agg = computeAggregates(entries);
    expect(agg.median_final_bid).toBe(2000);
  });
});

describe('extractImageUrls', () => {
  it('extracts URLs from array format', () => {
    const raw = {
      imageUrls: [
        'https://vg.iaai.com/img1.jpg',
        'https://vg.iaai.com/img2.jpg',
      ],
    };
    const urls = extractImageUrls(raw as never);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('iaai.com');
  });

  it('extracts URLs from keyed object format', () => {
    const raw = {
      imageUrls: {
        large: 'https://vg.iaai.com/large.jpg',
        thumbnail: 'https://vg.iaai.com/thumb.jpg',
      },
    };
    const urls = extractImageUrls(raw as never);
    expect(urls).toHaveLength(2);
  });

  it('returns empty array when imageUrls is missing', () => {
    const urls = extractImageUrls({} as never);
    expect(urls).toEqual([]);
  });

  it('handles mixed array of strings and non-strings', () => {
    const raw = { imageUrls: ['https://good.com/img.jpg', 42, null] };
    const urls = extractImageUrls(raw as never);
    expect(urls).toHaveLength(1);
  });
});

// ─── IaaiClient unit tests (mocked dependencies) ──────────────────────────────

const mockListing: AuctionListing = {
  source: 'iaai',
  lot_number: 'A12345678',
  vin: '1HGCM82633A004352',
  year: 2019,
  make: 'Toyota',
  model: 'Camry',
  trim: 'SE',
  title_type: 'Salvage',
  title_code: 'SV',
  damage_primary: 'Front End',
  damage_secondary: 'Minor Dents/Scratches',
  has_keys: true,
  odometer: 45231,
  odometer_status: 'ACTUAL',
  color: 'Silver',
  engine: '2.5L 4 Cylinder',
  transmission: 'Automatic',
  drive_type: 'FWD',
  fuel_type: 'Gas',
  cylinders: 4,
  current_bid: 3200,
  buy_now_price: 6500,
  sale_date: '2026-04-20T10:00:00Z',
  sale_status: 'UPCOMING',
  final_bid: null,
  location: 'Houston North',
  location_zip: '77060',
  latitude: 29.9902,
  longitude: -95.3368,
  image_url: 'https://vg.iaai.com/A12345678_1_lrg.jpg',
  image_urls: ['https://vg.iaai.com/A12345678_1_lrg.jpg'],
  detail_url: 'https://www.iaai.com/VehicleDetail/A12345678',
  seller: 'GEICO',
  grid_row: null,
  fetched_at: new Date().toISOString(),
};

const mockSoldResponse: SoldHistoryResponse = {
  lots: [
    {
      lot_number: 'S10000001',
      sale_date: '2026-01-10T10:00:00Z',
      final_bid: 4200,
      damage_primary: 'Front End',
      odometer: 55000,
      title_type: 'SV',
    },
  ],
  aggregates: {
    count: 1,
    avg_final_bid: 4200,
    median_final_bid: 4200,
    price_range: { low: 4200, high: 4200 },
  },
};

function freshResult<T>(data: T): ScraperResult<T> {
  return { data, cached: false, stale: false, cachedAt: null };
}

function staleResult<T>(data: T, cachedAt: string): ScraperResult<T> {
  return { data, cached: true, stale: true, cachedAt };
}

function makeMockBrowser() {
  return {
    getPage: vi.fn(),
    authenticate: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockPage() {
  return {
    goto: vi.fn().mockResolvedValue({ status: () => 200 }),
    url: vi.fn().mockReturnValue('https://www.iaai.com/Search'),
    content: vi.fn().mockResolvedValue('<html><body>results</body></html>'),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    evaluate: vi.fn().mockResolvedValue(null),
    mouse: { move: vi.fn().mockResolvedValue(undefined), wheel: vi.fn().mockResolvedValue(undefined) },
  };
}

function makeMockSqliteCache() {
  return {
    getSearch: vi.fn().mockResolvedValue(null),
    setSearch: vi.fn().mockResolvedValue(undefined),
    getListing: vi.fn().mockResolvedValue(null),
    setListing: vi.fn().mockResolvedValue(undefined),
    getSoldHistory: vi.fn().mockResolvedValue(null),
    setSoldHistory: vi.fn().mockResolvedValue(undefined),
    watchlistAdd: vi.fn(),
    watchlistRemove: vi.fn().mockReturnValue(true),
    watchlistList: vi.fn().mockReturnValue([]),
    watchlistGet: vi.fn().mockReturnValue(null),
    watchlistUpdate: vi.fn(),
    watchlistAddHistory: vi.fn(),
  };
}

function makeMockMemoryCache() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn((key: string) => store.get(key)),
    set: vi.fn((key: string, value: unknown) => { store.set(key, value); }),
    has: vi.fn((key: string) => store.has(key)),
    delete: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
  };
}

function makeMockImageCache() {
  return {
    has: vi.fn().mockResolvedValue(false),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockRateLimiter() {
  return {
    acquire: vi.fn().mockResolvedValue(undefined),
    applyBackoff: vi.fn(),
    resetBackoff: vi.fn(),
    execute: vi.fn((fn: () => Promise<unknown>) => fn()),
  };
}

// ─── IaaiClient.search ────────────────────────────────────────────────────────

describe('IaaiClient.search', () => {
  let browser: ReturnType<typeof makeMockBrowser>;
  let sqliteCache: ReturnType<typeof makeMockSqliteCache>;
  let memoryCache: ReturnType<typeof makeMockMemoryCache>;
  let imageCache: ReturnType<typeof makeMockImageCache>;
  let rateLimiter: ReturnType<typeof makeMockRateLimiter>;
  let client: IaaiClient;

  beforeEach(() => {
    browser = makeMockBrowser();
    sqliteCache = makeMockSqliteCache();
    memoryCache = makeMockMemoryCache();
    imageCache = makeMockImageCache();
    rateLimiter = makeMockRateLimiter();
    client = new IaaiClient(
      browser as never,
      sqliteCache as never,
      memoryCache as never,
      imageCache as never,
      rateLimiter as never
    );
  });

  it('returns LRU cache hit without touching SQLite or browser', async () => {
    memoryCache.get.mockReturnValue([mockListing]);

    const result = await client.search({ query: 'Toyota Camry' });
    expect(result.cached).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.data).toHaveLength(1);
    expect(sqliteCache.getSearch).not.toHaveBeenCalled();
    expect(browser.getPage).not.toHaveBeenCalled();
  });

  it('returns SQLite cache hit and populates LRU', async () => {
    const now = new Date().toISOString();
    sqliteCache.getSearch.mockResolvedValue({ data: [mockListing], fetched_at: now });

    const result = await client.search({ query: 'Toyota Camry' });
    expect(result.cached).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(memoryCache.set).toHaveBeenCalled();
    expect(browser.getPage).not.toHaveBeenCalled();
  });

  it('calls RateLimiter.acquire() before navigation', async () => {
    const page = makeMockPage();
    browser.getPage.mockResolvedValue(page);

    await client.search({ query: 'Honda Civic' }).catch(() => {});
    expect(rateLimiter.acquire).toHaveBeenCalledOnce();
  });

  it('throws CaptchaError when CAPTCHA detected', async () => {
    const page = makeMockPage();
    page.url.mockReturnValue('https://www.iaai.com/captcha');
    page.content.mockResolvedValue('<html>captcha challenge</html>');
    browser.getPage.mockResolvedValue(page);

    await expect(client.search({ query: 'test' })).rejects.toThrow(CaptchaError);
  });

  it('returns stale cache fallback on scraper failure', async () => {
    const now = new Date().toISOString();
    const page = makeMockPage();
    page.goto.mockRejectedValue(new Error('Network error'));
    browser.getPage.mockResolvedValue(page);
    sqliteCache.getSearch
      .mockResolvedValueOnce(null) // fresh miss
      .mockResolvedValueOnce({ data: [mockListing], fetched_at: now }); // stale hit

    const result = await client.search({ query: 'Honda Accord' });
    expect(result.stale).toBe(true);
    expect(result.cached).toBe(true);
    expect(result.cachedAt).toBe(now);
  });

  it('throws ScraperError when no cache and scraper fails', async () => {
    const page = makeMockPage();
    page.goto.mockRejectedValue(new Error('Connection refused'));
    browser.getPage.mockResolvedValue(page);

    await expect(client.search({ query: 'Ford F-150' })).rejects.toThrow(ScraperError);
  });

  it('throws RateLimitError on HTTP 429', async () => {
    const page = makeMockPage();
    page.goto.mockResolvedValue({ status: () => 429 });
    browser.getPage.mockResolvedValue(page);

    await expect(client.search({ query: 'BMW' })).rejects.toThrow(RateLimitError);
    expect(rateLimiter.applyBackoff).toHaveBeenCalled();
  });
});

// ─── IaaiClient.getListing ────────────────────────────────────────────────────

describe('IaaiClient.getListing', () => {
  let browser: ReturnType<typeof makeMockBrowser>;
  let sqliteCache: ReturnType<typeof makeMockSqliteCache>;
  let memoryCache: ReturnType<typeof makeMockMemoryCache>;
  let imageCache: ReturnType<typeof makeMockImageCache>;
  let rateLimiter: ReturnType<typeof makeMockRateLimiter>;
  let client: IaaiClient;

  beforeEach(() => {
    browser = makeMockBrowser();
    sqliteCache = makeMockSqliteCache();
    memoryCache = makeMockMemoryCache();
    imageCache = makeMockImageCache();
    rateLimiter = makeMockRateLimiter();
    client = new IaaiClient(
      browser as never,
      sqliteCache as never,
      memoryCache as never,
      imageCache as never,
      rateLimiter as never
    );
  });

  it('returns SQLite cache hit', async () => {
    const now = new Date().toISOString();
    sqliteCache.getListing.mockResolvedValue({ data: mockListing, fetched_at: now });

    const result = await client.getListing('A12345678');
    expect(result.cached).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.data.lot_number).toBe('A12345678');
    expect(browser.getPage).not.toHaveBeenCalled();
  });

  it('calls RateLimiter.acquire() before navigation', async () => {
    const page = makeMockPage();
    browser.getPage.mockResolvedValue(page);

    await client.getListing('A12345678').catch(() => {});
    expect(rateLimiter.acquire).toHaveBeenCalledOnce();
  });

  it('throws ScraperError on 404', async () => {
    const page = makeMockPage();
    page.goto.mockResolvedValue({ status: () => 404 });
    browser.getPage.mockResolvedValue(page);

    await expect(client.getListing('NOTFOUND')).rejects.toThrow(ScraperError);
  });

  it('returns stale cache on scraper failure', async () => {
    const now = new Date().toISOString();
    const page = makeMockPage();
    page.goto.mockRejectedValue(new Error('Timeout'));
    browser.getPage.mockResolvedValue(page);
    sqliteCache.getListing
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ data: mockListing, fetched_at: now });

    const result = await client.getListing('A12345678');
    expect(result.stale).toBe(true);
    expect(result.data.lot_number).toBe('A12345678');
  });
});

// ─── IaaiClient.getSoldHistory ────────────────────────────────────────────────

describe('IaaiClient.getSoldHistory', () => {
  let browser: ReturnType<typeof makeMockBrowser>;
  let sqliteCache: ReturnType<typeof makeMockSqliteCache>;
  let memoryCache: ReturnType<typeof makeMockMemoryCache>;
  let imageCache: ReturnType<typeof makeMockImageCache>;
  let client: IaaiClient;

  beforeEach(() => {
    browser = makeMockBrowser();
    sqliteCache = makeMockSqliteCache();
    memoryCache = makeMockMemoryCache();
    imageCache = makeMockImageCache();
    client = new IaaiClient(
      browser as never,
      sqliteCache as never,
      memoryCache as never,
      imageCache as never
    );
  });

  it('returns SQLite cache hit (7-day TTL)', async () => {
    const now = new Date().toISOString();
    sqliteCache.getSoldHistory.mockResolvedValue({ data: mockSoldResponse, fetched_at: now });

    const result = await client.getSoldHistory({ make: 'Toyota', model: 'Camry' });
    expect(result.cached).toBe(true);
    expect(result.data.aggregates.count).toBe(1);
    expect(browser.getPage).not.toHaveBeenCalled();
  });

  it('returns stale sold history on failure when cache exists', async () => {
    const now = new Date().toISOString();
    const page = makeMockPage();
    page.goto.mockRejectedValue(new Error('Network error'));
    browser.getPage.mockResolvedValue(page);
    sqliteCache.getSoldHistory
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ data: mockSoldResponse, fetched_at: now });

    const result = await client.getSoldHistory({ make: 'Honda', model: 'Civic' });
    expect(result.stale).toBe(true);
    expect(result.data.lots).toHaveLength(1);
  });
});

// ─── IaaiClient.watchListing ──────────────────────────────────────────────────

describe('IaaiClient.watchListing', () => {
  let sqliteCache: ReturnType<typeof makeMockSqliteCache>;
  let client: IaaiClient;

  beforeEach(() => {
    sqliteCache = makeMockSqliteCache();
    client = new IaaiClient(
      makeMockBrowser() as never,
      sqliteCache as never,
      makeMockMemoryCache() as never,
      makeMockImageCache() as never
    );
  });

  it('adds a stock number to watchlist', () => {
    client.watchListing('add', 'A12345678', 5000, 'Check daily');
    expect(sqliteCache.watchlistAdd).toHaveBeenCalledWith({
      lot_number: 'A12345678',
      bid_threshold: 5000,
      notes: 'Check daily',
    });
  });

  it('throws ScraperError when add is called without stockNumber', () => {
    expect(() => client.watchListing('add')).toThrow(ScraperError);
  });

  it('removes a stock number from watchlist', () => {
    sqliteCache.watchlistRemove.mockReturnValue(true);
    const result = client.watchListing('remove', 'A12345678');
    expect(result).toBe(true);
    expect(sqliteCache.watchlistRemove).toHaveBeenCalledWith('A12345678');
  });

  it('throws ScraperError when remove is called without stockNumber', () => {
    expect(() => client.watchListing('remove')).toThrow(ScraperError);
  });

  it('lists all watchlist entries', () => {
    const mockEntry = {
      lot_number: 'A12345678',
      source: 'iaai' as const,
      added_at: new Date().toISOString(),
      bid_threshold: null,
      last_checked_at: null,
      last_bid: null,
      last_status: null,
      notes: null,
    };
    sqliteCache.watchlistList.mockReturnValue([mockEntry]);

    const result = client.watchListing('list') as typeof mockEntry[];
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe('iaai');
  });

  it('throws ScraperError for unknown action', () => {
    expect(() => client.watchListing('unknown' as never)).toThrow(ScraperError);
  });
});
