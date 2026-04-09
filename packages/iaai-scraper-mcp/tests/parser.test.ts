import { describe, it, expect } from 'vitest';
import {
  parseSearchResults,
  parseListingDetail,
  parseSoldResults,
  computeAggregates,
  extractImageUrls,
} from '../src/scraper/parser.js';
import { ScraperError } from '@car-auctions/shared';
import searchFixture from './fixtures/iaai-search-response.json';
import listingFixture from './fixtures/iaai-listing-response.json';
import soldFixture from './fixtures/iaai-sold-response.json';

// ─── parseSearchResults ────────────────────────────────────────────────────

describe('parseSearchResults', () => {
  it('parses items array from standard IAAI search response', () => {
    const items = parseSearchResults(searchFixture);
    expect(items).toHaveLength(3);
    expect(items[0]?.stockNumber).toBe('A12345678');
    expect(items[1]?.makeName).toBe('Honda');
    expect(items[2]?.modelName).toBe('F-150');
  });

  it('throws ScraperError for null input', () => {
    expect(() => parseSearchResults(null)).toThrow(ScraperError);
  });

  it('throws ScraperError for undefined input', () => {
    expect(() => parseSearchResults(undefined)).toThrow(ScraperError);
  });

  it('throws ScraperError for non-object primitive', () => {
    expect(() => parseSearchResults('bad')).toThrow(ScraperError);
    expect(() => parseSearchResults(42)).toThrow(ScraperError);
  });

  it('handles a direct array payload', () => {
    const raw = [{ stockNumber: 'X1', vin: '1HGCM82633A004352' }];
    const items = parseSearchResults(raw);
    expect(items).toHaveLength(1);
    expect(items[0]?.stockNumber).toBe('X1');
  });

  it('unwraps a nested data.items structure', () => {
    const raw = { data: { items: [{ stockNumber: 'A1', vin: 'TEST' }] } };
    const items = parseSearchResults(raw);
    expect(items).toHaveLength(1);
    expect(items[0]?.stockNumber).toBe('A1');
  });

  it('handles results array key', () => {
    const raw = { results: [{ stockNumber: 'R1', makeName: 'Ford' }] };
    const items = parseSearchResults(raw);
    expect(items).toHaveLength(1);
    expect(items[0]?.makeName).toBe('Ford');
  });

  it('handles content array key', () => {
    const raw = { content: [{ stockNumber: 'C1', makeName: 'BMW' }] };
    const items = parseSearchResults(raw);
    expect(items).toHaveLength(1);
  });

  it('handles lots array key', () => {
    const raw = { lots: [{ stockNumber: 'L1', makeName: 'Tesla' }] };
    const items = parseSearchResults(raw);
    expect(items).toHaveLength(1);
  });

  it('throws ScraperError when no recognizable array is found', () => {
    expect(() => parseSearchResults({ unrelated: 'data' })).toThrow(ScraperError);
  });

  it('filters out non-object items from array', () => {
    const raw = { items: [{ stockNumber: 'A1' }, null, 'bad', 42] };
    const items = parseSearchResults(raw);
    // null is filtered out, 'bad' and 42 are filtered out
    expect(items).toHaveLength(1);
  });
});

// ─── parseListingDetail ────────────────────────────────────────────────────

describe('parseListingDetail', () => {
  it('parses listing detail from standard fixture', () => {
    const listing = parseListingDetail(listingFixture);
    expect(listing.stockNumber).toBe('A12345678');
    expect(listing.vin).toBe('1HGCM82633A004352');
    expect(listing.conditionGradeDisplay).toBe('3.5');
    expect(listing.lossType).toBe('Collision');
    expect(listing.startCode).toBe('START');
    expect(listing.bodyStyle).toBe('Sedan');
    expect(listing.series).toBe('XSE');
    expect(listing.runnable).toBe(true);
  });

  it('populates grid_row with detail-only fields', () => {
    const listing = parseListingDetail(listingFixture);
    expect(listing.grid_row).toBeDefined();
    const grid = listing.grid_row as Record<string, unknown>;
    expect(grid['conditionGradeDisplay']).toBe('3.5');
    expect(grid['lossType']).toBe('Collision');
    expect(grid['startCode']).toBe('START');
    expect(grid['bodyStyle']).toBe('Sedan');
    expect(grid['series']).toBe('XSE');
    expect(grid['runnable']).toBe(true);
  });

  it('throws ScraperError for null input', () => {
    expect(() => parseListingDetail(null)).toThrow(ScraperError);
  });

  it('throws ScraperError for undefined input', () => {
    expect(() => parseListingDetail(undefined)).toThrow(ScraperError);
  });

  it('throws ScraperError for array input', () => {
    expect(() => parseListingDetail([])).toThrow(ScraperError);
  });

  it('throws ScraperError when stockNumber and vin are both missing', () => {
    expect(() => parseListingDetail({ makeName: 'Toyota' })).toThrow(ScraperError);
  });

  it('unwraps data wrapper', () => {
    const raw = { data: { stockNumber: 'W1', vin: '1TEST', conditionGradeDisplay: '4.0' } };
    const listing = parseListingDetail(raw);
    expect(listing.stockNumber).toBe('W1');
    const grid = listing.grid_row as Record<string, unknown>;
    expect(grid['conditionGradeDisplay']).toBe('4.0');
  });

  it('unwraps lot wrapper', () => {
    const raw = { lot: { stockNumber: 'L1', vin: '1TEST' } };
    const listing = parseListingDetail(raw);
    expect(listing.stockNumber).toBe('L1');
  });

  it('sets grid_row to undefined when no detail fields present', () => {
    const raw = { stockNumber: 'N1', vin: '1TEST', makeName: 'Ford' };
    const listing = parseListingDetail(raw);
    expect(listing.grid_row).toBeUndefined();
  });

  it('handles highlights array in grid_row', () => {
    const raw = {
      stockNumber: 'H1',
      vin: '1TEST',
      highlights: ['Engine starts', 'All tires present'],
    };
    const listing = parseListingDetail(raw);
    const grid = listing.grid_row as Record<string, unknown>;
    expect(grid['highlights']).toEqual(['Engine starts', 'All tires present']);
  });
});

// ─── parseSoldResults ──────────────────────────────────────────────────────

describe('parseSoldResults', () => {
  it('parses sold entries from fixture', () => {
    const entries = parseSoldResults(soldFixture);
    expect(entries).toHaveLength(5);
  });

  it('preserves null for missing finalBid', () => {
    const entries = parseSoldResults(soldFixture);
    // Fixture lot S10000003 has finalBid: null
    const nullEntry = entries.find((e) => e.lot_number === 'S10000003');
    expect(nullEntry).toBeDefined();
    expect(nullEntry?.final_bid).toBeNull();
  });

  it('correctly maps IaaiSoldEntry fields', () => {
    const entries = parseSoldResults(soldFixture);
    const first = entries[0]!;
    expect(first.lot_number).toBe('S10000001');
    expect(first.sale_date).toBe('2026-01-10T10:00:00Z');
    expect(first.final_bid).toBe(4200);
    expect(first.damage_primary).toBe('Front End');
    expect(first.odometer).toBe(55000);
    expect(first.title_type).toBe('SV');
  });

  it('throws ScraperError for null input', () => {
    expect(() => parseSoldResults(null)).toThrow(ScraperError);
  });

  it('throws ScraperError for undefined input', () => {
    expect(() => parseSoldResults(undefined)).toThrow(ScraperError);
  });

  it('throws ScraperError for non-object input', () => {
    expect(() => parseSoldResults('bad')).toThrow(ScraperError);
  });

  it('handles missing odometer as null', () => {
    const raw = {
      items: [
        {
          stockNumber: 'T1',
          saleDate: '2026-01-01T00:00:00Z',
          finalBid: 5000,
          primaryDamage: 'Rear End',
          titleCode: 'SV',
        },
      ],
    };
    const entries = parseSoldResults(raw);
    expect(entries[0]?.odometer).toBeNull();
  });

  it('handles string odometer value', () => {
    const raw = {
      items: [
        {
          stockNumber: 'T2',
          saleDate: '2026-01-01T00:00:00Z',
          finalBid: 3000,
          primaryDamage: 'Front End',
          titleCode: 'CL',
          odometer: '42500',
        },
      ],
    };
    const entries = parseSoldResults(raw);
    expect(entries[0]?.odometer).toBe(42500);
  });

  it('uses "Unknown" for missing titleCode', () => {
    const raw = {
      items: [
        {
          stockNumber: 'T3',
          saleDate: '2026-01-01T00:00:00Z',
          finalBid: 2000,
          primaryDamage: 'Side',
        },
      ],
    };
    const entries = parseSoldResults(raw);
    expect(entries[0]?.title_type).toBe('Unknown');
  });
});

// ─── computeAggregates ────────────────────────────────────────────────────

describe('computeAggregates', () => {
  it('returns all-zeros when entries array is empty', () => {
    const agg = computeAggregates([]);
    expect(agg.count).toBe(0);
    expect(agg.avg_final_bid).toBe(0);
    expect(agg.median_final_bid).toBe(0);
    expect(agg.price_range.low).toBe(0);
    expect(agg.price_range.high).toBe(0);
  });

  it('returns all-zeros when all final_bid entries are null', () => {
    const entries = [
      {
        lot_number: 'A',
        sale_date: '',
        final_bid: null,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'B',
        sale_date: '',
        final_bid: null,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(0);
    expect(agg.avg_final_bid).toBe(0);
    expect(agg.median_final_bid).toBe(0);
    expect(agg.price_range.low).toBe(0);
    expect(agg.price_range.high).toBe(0);
  });

  it('excludes null bids from calculations', () => {
    const entries = [
      {
        lot_number: 'A',
        sale_date: '',
        final_bid: 4000,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'B',
        sale_date: '',
        final_bid: null,
        damage_primary: '',
        odometer: null,
        title_type: 'FL',
      },
      {
        lot_number: 'C',
        sale_date: '',
        final_bid: 6000,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(2);
    expect(agg.avg_final_bid).toBe(5000);
    expect(agg.median_final_bid).toBe(5000);
    expect(agg.price_range.low).toBe(4000);
    expect(agg.price_range.high).toBe(6000);
  });

  it('computes correct aggregates from fixture sold results', () => {
    // Fixture has 4 non-null bids: 4200, 5800, 7100, 3500 (S10000003 is null)
    const entries = [
      {
        lot_number: 'S1',
        sale_date: '',
        final_bid: 4200,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'S2',
        sale_date: '',
        final_bid: 5800,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'S3',
        sale_date: '',
        final_bid: null,
        damage_primary: '',
        odometer: null,
        title_type: 'FL',
      },
      {
        lot_number: 'S4',
        sale_date: '',
        final_bid: 7100,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'S5',
        sale_date: '',
        final_bid: 3500,
        damage_primary: '',
        odometer: null,
        title_type: 'RB',
      },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(4);
    // avg of 3500, 4200, 5800, 7100 = 20600 / 4 = 5150
    expect(agg.avg_final_bid).toBe(5150);
    // sorted: [3500, 4200, 5800, 7100] → median = (4200 + 5800) / 2 = 5000
    expect(agg.median_final_bid).toBe(5000);
    expect(agg.price_range.low).toBe(3500);
    expect(agg.price_range.high).toBe(7100);
  });

  it('computes correct median for odd number of entries', () => {
    const entries = [
      {
        lot_number: 'A',
        sale_date: '',
        final_bid: 1000,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'B',
        sale_date: '',
        final_bid: 3000,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
      {
        lot_number: 'C',
        sale_date: '',
        final_bid: 2000,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(3);
    // sorted: [1000, 2000, 3000] → median = 2000
    expect(agg.median_final_bid).toBe(2000);
    expect(agg.avg_final_bid).toBeCloseTo(2000);
  });

  it('handles single entry', () => {
    const entries = [
      {
        lot_number: 'X',
        sale_date: '',
        final_bid: 5000,
        damage_primary: '',
        odometer: null,
        title_type: 'SV',
      },
    ];
    const agg = computeAggregates(entries);
    expect(agg.count).toBe(1);
    expect(agg.avg_final_bid).toBe(5000);
    expect(agg.median_final_bid).toBe(5000);
    expect(agg.price_range.low).toBe(5000);
    expect(agg.price_range.high).toBe(5000);
  });
});

// ─── extractImageUrls ─────────────────────────────────────────────────────

describe('extractImageUrls', () => {
  it('extracts URLs from array format', () => {
    const raw = {
      stockNumber: 'A12345678',
      imageUrls: [
        'https://vg.iaai.com/A12345678_1_lrg.jpg',
        'https://vg.iaai.com/A12345678_2_lrg.jpg',
        'https://vg.iaai.com/A12345678_3_lrg.jpg',
      ],
    };
    const urls = extractImageUrls(raw);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe('https://vg.iaai.com/A12345678_1_lrg.jpg');
  });

  it('extracts URLs from keyed-object format', () => {
    const raw = {
      stockNumber: 'B1',
      imageUrls: {
        exterior: ['https://cdn.iaai.com/ext1.jpg', 'https://cdn.iaai.com/ext2.jpg'],
        interior: ['https://cdn.iaai.com/int1.jpg'],
        damage: ['https://cdn.iaai.com/dmg1.jpg'],
      },
    };
    const urls = extractImageUrls(raw);
    expect(urls).toHaveLength(4);
    expect(urls).toContain('https://cdn.iaai.com/ext1.jpg');
    expect(urls).toContain('https://cdn.iaai.com/int1.jpg');
    expect(urls).toContain('https://cdn.iaai.com/dmg1.jpg');
  });

  it('handles keyed-object with string values', () => {
    const raw = {
      stockNumber: 'C1',
      imageUrls: {
        main: 'https://cdn.iaai.com/main.jpg',
      } as Record<string, unknown>,
    };
    const urls = extractImageUrls(raw);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://cdn.iaai.com/main.jpg');
  });

  it('returns empty array when imageUrls is undefined', () => {
    const raw = { stockNumber: 'D1' };
    expect(extractImageUrls(raw)).toEqual([]);
  });

  it('filters non-string values from array format', () => {
    const raw = {
      stockNumber: 'E1',
      imageUrls: [
        'https://cdn.iaai.com/a.jpg',
        null as unknown as string,
        42 as unknown as string,
        'https://cdn.iaai.com/b.jpg',
      ],
    };
    const urls = extractImageUrls(raw);
    expect(urls).toHaveLength(2);
  });

  it('extracts from search fixture first item (array format)', () => {
    // Fixture: iaai-search-response.json items[0] has 3 imageUrls as an array of strings
    const item = (searchFixture as { items: unknown[] }).items[0] as Parameters<
      typeof extractImageUrls
    >[0];
    const urls = extractImageUrls(item);
    expect(urls).toHaveLength(3);
    expect(urls[0]).toBe('https://vg.iaai.com/A12345678_1_lrg.jpg');
    expect(urls[1]).toBe('https://vg.iaai.com/A12345678_2_lrg.jpg');
    expect(urls[2]).toBe('https://vg.iaai.com/A12345678_3_lrg.jpg');
  });

  it('extracts from listing fixture (array format)', () => {
    const urls = extractImageUrls(listingFixture as Parameters<typeof extractImageUrls>[0]);
    expect(urls).toHaveLength(5);
  });
});
