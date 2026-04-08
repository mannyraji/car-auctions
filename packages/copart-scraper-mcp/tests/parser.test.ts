import { describe, it, expect } from 'vitest';
import {
  parseSearchResults,
  parseListing,
  parseSoldHistory,
  parseImageUrls,
  toAuctionListing,
  toAuctionListings,
} from '../src/scraper/parser.js';
import searchFixture from './fixtures/copart-search-response.json';
import listingFixture from './fixtures/copart-listing-response.json';

describe('parseSearchResults', () => {
  it('parses nested content array from search response', () => {
    const lots = parseSearchResults(searchFixture);
    expect(lots).toHaveLength(2);
    expect(lots[0]?.lotNumberStr).toBe('12345678');
    expect(lots[1]?.mkn).toBe('Honda');
  });

  it('returns empty array for null input', () => {
    expect(parseSearchResults(null)).toEqual([]);
  });

  it('returns empty array for non-object input', () => {
    expect(parseSearchResults('invalid')).toEqual([]);
  });

  it('handles flat results array', () => {
    const raw = { results: [{ lotNumberStr: 'ABC', mkn: 'Ford' }] };
    const lots = parseSearchResults(raw);
    expect(lots).toHaveLength(1);
    expect(lots[0]?.mkn).toBe('Ford');
  });

  it('handles lots key directly', () => {
    const raw = { lots: [{ lotNumberStr: 'XYZ', mkn: 'BMW' }] };
    const lots = parseSearchResults(raw);
    expect(lots).toHaveLength(1);
  });
});

describe('parseListing', () => {
  it('parses listing from data wrapper', () => {
    const lot = parseListing(listingFixture);
    expect(lot).not.toBeNull();
    expect(lot?.lotNumberStr).toBe('12345678');
    expect(lot?.mkn).toBe('Toyota');
    expect(lot?.lcy).toBe(2019);
  });

  it('returns null for null input', () => {
    expect(parseListing(null)).toBeNull();
  });

  it('handles direct lot object (no wrapper)', () => {
    const raw = { lotNumberStr: '99999', mkn: 'Ford' };
    const lot = parseListing(raw);
    expect(lot).not.toBeNull();
    expect(lot?.mkn).toBe('Ford');
  });
});

describe('parseSoldHistory', () => {
  it('parses sold entries from data.results', () => {
    const raw = {
      data: {
        results: [
          {
            lotNumberStr: '111',
            fv: '1HGBH41JXMN109186',
            lcy: 2021,
            mkn: 'Honda',
            mdn: 'Civic',
            fb: 8500,
            sd: '2023-06-01',
            ld: 'Austin, TX',
            dd: 'Rear End',
            tmtp: 'SV',
            orr: 22000,
          },
        ],
      },
    };
    const entries = parseSoldHistory(raw);
    expect(entries).toHaveLength(1);
    const entry = entries[0]!;
    expect(entry.lotNumber).toBe('111');
    expect(entry.make).toBe('Honda');
    expect(entry.model).toBe('Civic');
    expect(entry.finalBid).toBe(8500);
    expect(entry.odometer).toBe(22000);
  });

  it('handles null finalBid', () => {
    const raw = {
      data: {
        results: [{ lotNumberStr: '222', fb: null, lcy: 2020, mkn: 'Ford', mdn: 'F-150' }],
      },
    };
    const entries = parseSoldHistory(raw);
    expect(entries[0]?.finalBid).toBeNull();
  });

  it('returns empty array for empty input', () => {
    expect(parseSoldHistory(null)).toEqual([]);
    expect(parseSoldHistory({ data: { results: [] } })).toEqual([]);
  });
});

describe('parseImageUrls', () => {
  it('parses tims object with http URLs', () => {
    const raw = {
      tims: {
        '1': 'https://cs.copart.com/img1.jpg',
        '2': 'https://cs.copart.com/img2.jpg',
      },
    };
    const urls = parseImageUrls(raw);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('https://');
  });

  it('parses tims array', () => {
    const raw = {
      tims: ['https://cs.copart.com/a.jpg', 'https://cs.copart.com/b.jpg'],
    };
    const urls = parseImageUrls(raw);
    expect(urls).toHaveLength(2);
  });

  it('falls back to imgUrl', () => {
    const raw = { imgUrl: 'https://cs.copart.com/main.jpg' };
    const urls = parseImageUrls(raw);
    expect(urls).toEqual(['https://cs.copart.com/main.jpg']);
  });

  it('returns empty array if no images', () => {
    expect(parseImageUrls({})).toEqual([]);
    expect(parseImageUrls(null)).toEqual([]);
  });

  it('filters non-http values from tims object', () => {
    const raw = { tims: { '1': 'not-a-url', '2': 'https://good.com/img.jpg' } };
    const urls = parseImageUrls(raw);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://good.com/img.jpg');
  });
});

describe('toAuctionListing', () => {
  it('normalizes a raw lot into AuctionListing', () => {
    const raw = {
      lotNumberStr: '12345678',
      mkn: 'Toyota',
      mdn: 'Camry',
      lcy: 2019,
      dd: 'Front End',
      fv: '4T1B11HK3KU123456',
      ld: 'Houston, TX',
      tmtp: 'SV - State of TX',
      orr: 45231,
      htsmn: 'Yes',
    };
    const listing = toAuctionListing(raw);
    expect(listing.source).toBe('copart');
    expect(listing.lot_number).toBe('12345678');
    expect(listing.make).toBe('Toyota');
    expect(listing.model).toBe('Camry');
    expect(listing.year).toBe(2019);
    expect(listing.has_keys).toBe(true);
    expect(listing.odometer).toBe(45231);
    expect(listing.location).toBe('Houston, TX');
  });

  it('handles missing lot number with fallback to ln', () => {
    const raw = { ln: '99988877', mkn: 'Ford', mdn: 'F-150' };
    const listing = toAuctionListing(raw);
    expect(listing.lot_number).toBe('99988877');
  });
});

describe('toAuctionListings', () => {
  it('converts array of raw lots', () => {
    const lots = parseSearchResults(searchFixture);
    const listings = toAuctionListings(lots);
    expect(listings).toHaveLength(2);
    expect(listings[0]?.source).toBe('copart');
    expect(listings[1]?.make).toBe('Honda');
  });

  it('returns empty array for empty input', () => {
    expect(toAuctionListings([])).toEqual([]);
  });
});
