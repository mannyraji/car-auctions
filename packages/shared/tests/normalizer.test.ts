/**
 * @file tests/normalizer.test.ts
 * @description Fixture-driven tests for normalizeCopart() and normalizeIaai().
 */

import { describe, it, expect, vi } from 'vitest';
import { normalizeCopart, normalizeIaai } from '../src/normalizer/index.js';
import type { AuctionListing, CopartRawListing, IaaiRawListing } from '../src/types/index.js';
import copartFixture from './fixtures/copart-listing.json' assert { type: 'json' };
import iaaiFixture from './fixtures/iaai-listing.json' assert { type: 'json' };

describe('normalizeCopart', () => {
  it('returns source: copart', () => {
    const listing = normalizeCopart(copartFixture as CopartRawListing);
    expect(listing.source).toBe('copart');
  });

  it('maps all required fields from copart fixture', () => {
    const listing = normalizeCopart(copartFixture as CopartRawListing);
    expect(listing.lot_number).toBe('12345678');
    expect(listing.make).toBe('Honda');
    expect(listing.model).toBe('Civic');
    expect(listing.year).toBe(2019);
    expect(listing.damage_primary).toBe('Front End');
    expect(listing.damage_secondary).toBe('Minor Dents/Scratches');
    expect(listing.odometer).toBe(42500);
    expect(listing.has_keys).toBe(true);
    expect(listing.current_bid).toBe(4500);
    expect(listing.buy_it_now).toBe(7500);
    expect(listing.location).toBe('Los Angeles - CA');
    expect(listing.title_state).toBe('CA');
    expect(listing.title_type).toBe('Salvage');
  });

  it('has_keys is always a boolean', () => {
    const listing = normalizeCopart(copartFixture as CopartRawListing);
    expect(typeof listing.has_keys).toBe('boolean');
  });

  it('thumbnail_url is the first image URL', () => {
    const listing = normalizeCopart(copartFixture as CopartRawListing);
    expect(listing.thumbnail_url).toBe(
      'https://cs.copart.com/v1/AUTH_svc.pdoc00001/LOT/2019/Honda_Civic_Front.jpg'
    );
  });

  it('100% required fields populated — no undefined for required fields', () => {
    const listing = normalizeCopart(copartFixture as CopartRawListing);
    const requiredFields: (keyof AuctionListing)[] = [
      'source', 'lot_number', 'title', 'vin', 'year', 'make', 'model',
      'damage_primary', 'has_keys', 'odometer', 'odometer_status',
      'drive_type', 'fuel_type', 'engine', 'transmission', 'color',
      'current_bid', 'sale_date', 'sale_status', 'location', 'location_zip',
      'thumbnail_url', 'listing_url',
    ];
    for (const field of requiredFields) {
      expect(listing[field], `Field "${field}" should not be undefined`).not.toBeUndefined();
    }
  });

  it('does not throw on missing optional fields', () => {
    const minimal: CopartRawListing = {
      lotNumberStr: 'MINIMAL',
      mkn: 'Ford',
      mmod: 'F-150',
      lcy: 2020,
      dd: 'All Over',
      orr: 0,
      odometerBrand: 'ACTUAL',
      la: 'Austin - TX',
      dynamicBidAmount: 100,
      tims: { full: [] },
      ad: '',
      hk: false,
      dr: false,
      ts: 'TX',
      tt: 'Clean',
    };
    expect(() => normalizeCopart(minimal)).not.toThrow();
  });

  it('defaults sale_date to ISO 8601 when upstream value is empty string', () => {
    const raw: CopartRawListing = {
      lotNumberStr: 'TEST',
      mkn: 'Ford', mmod: 'F-150', lcy: 2020, dd: 'All Over',
      orr: 0, odometerBrand: 'ACTUAL', la: 'TX', dynamicBidAmount: 0,
      tims: { full: [] }, ad: '', hk: false, dr: false, ts: 'TX', tt: 'Clean',
    };
    const listing = normalizeCopart(raw);
    expect(listing.sale_date).toBeTruthy();
    // Should be a valid ISO date string, not an empty string
    expect(() => new Date(listing.sale_date)).not.toThrow();
    expect(new Date(listing.sale_date).getTime()).not.toBeNaN();
  });
});

describe('normalizeIaai', () => {
  it('returns source: iaai', () => {
    const listing = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(listing.source).toBe('iaai');
  });

  it('maps all required fields from iaai fixture', () => {
    const listing = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(listing.lot_number).toBe('87654321');
    expect(listing.make).toBe('Honda');
    expect(listing.model).toBe('Civic');
    expect(listing.year).toBe(2019);
    expect(listing.damage_primary).toBe('Front End');
    expect(listing.damage_secondary).toBe('Minor Dents/Scratches');
    expect(listing.odometer).toBe(42500);
    expect(listing.current_bid).toBe(4500);
    expect(listing.buy_it_now).toBe(7500);
    expect(listing.location).toBe('Los Angeles - CA');
  });

  it('coerces hasKeys "YES" to true', () => {
    const listing = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(listing.has_keys).toBe(true);
    expect(typeof listing.has_keys).toBe('boolean');
  });

  it('coerces hasKeys "NO" to false', () => {
    const raw = { ...iaaiFixture, hasKeys: 'NO' } as IaaiRawListing;
    const listing = normalizeIaai(raw);
    expect(listing.has_keys).toBe(false);
  });

  it('maps titleCode "SV" to title_type "Salvage"', () => {
    const listing = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(listing.title_type).toBe('Salvage');
  });

  it('maps unknown titleCode to "Unknown" without throwing', () => {
    const raw = { ...iaaiFixture, titleCode: 'ZZ' } as IaaiRawListing;
    // Should not throw
    expect(() => normalizeIaai(raw)).not.toThrow();
    const listing = normalizeIaai(raw);
    expect(listing.title_type).toBe('Unknown');
  });

  it('has_keys is always a boolean', () => {
    const listing = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(typeof listing.has_keys).toBe('boolean');
  });

  it('coerces unexpected hasKeys value to false', () => {
    const raw = { ...iaaiFixture, hasKeys: 'MAYBE' } as IaaiRawListing;
    const listing = normalizeIaai(raw);
    expect(listing.has_keys).toBe(false);
  });

  it('100% required fields populated — no undefined for required fields', () => {
    const listing = normalizeIaai(iaaiFixture as IaaiRawListing);
    const requiredFields: (keyof AuctionListing)[] = [
      'source', 'lot_number', 'title', 'vin', 'year', 'make', 'model',
      'damage_primary', 'has_keys', 'odometer', 'odometer_status',
      'drive_type', 'fuel_type', 'engine', 'transmission', 'color',
      'current_bid', 'sale_date', 'sale_status', 'location', 'location_zip',
      'thumbnail_url', 'listing_url',
    ];
    for (const field of requiredFields) {
      expect(listing[field], `Field "${field}" should not be undefined`).not.toBeUndefined();
    }
  });

  it('does not throw on missing optional fields', () => {
    const minimal: IaaiRawListing = {
      stockNumber: 'MINIMAL',
      year: 2020,
      makeName: 'Ford',
      modelName: 'F-150',
      primaryDamage: 'All Over',
      odometerReading: 0,
      odometerUnit: 'Miles',
      branch: 'Austin - TX',
      currentBid: 100,
      saleDate: '',
      hasKeys: 'NO',
      titleState: 'TX',
      titleCode: 'CL',
      images: [],
    };
    expect(() => normalizeIaai(minimal)).not.toThrow();
  });

  it('defaults sale_date to ISO 8601 when upstream value is empty string', () => {
    const raw: IaaiRawListing = {
      stockNumber: 'TEST', year: 2020, makeName: 'Ford', modelName: 'F-150',
      primaryDamage: 'All Over', odometerReading: 0, odometerUnit: 'Miles',
      branch: 'TX', currentBid: 0, saleDate: '', hasKeys: 'NO',
      titleState: 'TX', titleCode: 'CL', images: [],
    };
    const listing = normalizeIaai(raw);
    expect(listing.sale_date).toBeTruthy();
    expect(() => new Date(listing.sale_date)).not.toThrow();
    expect(new Date(listing.sale_date).getTime()).not.toBeNaN();
  });

  it('maps lowercase titleCode to the correct label (case-insensitive lookup)', () => {
    const raw = { ...iaaiFixture, titleCode: 'sv' } as IaaiRawListing;
    const listing = normalizeIaai(raw);
    expect(listing.title_type).toBe('Salvage');
  });

  it('maps titleCode with surrounding whitespace to the correct label', () => {
    const raw = { ...iaaiFixture, titleCode: ' SV ' } as IaaiRawListing;
    const listing = normalizeIaai(raw);
    expect(listing.title_type).toBe('Salvage');
  });
});

describe('Cross-source structural comparison', () => {
  it('copart and iaai normalized listings have structurally identical shapes', () => {
    const copart = normalizeCopart(copartFixture as CopartRawListing);
    const iaai = normalizeIaai(iaaiFixture as IaaiRawListing);

    // Both should have the same required keys
    const copartKeys = Object.keys(copart).filter(
      (k) => copart[k as keyof AuctionListing] !== undefined
    );
    const iaaiKeys = Object.keys(iaai).filter(
      (k) => iaai[k as keyof AuctionListing] !== undefined
    );

    // Required fields should be present in both
    const requiredFields = [
      'source', 'lot_number', 'title', 'vin', 'year', 'make', 'model',
      'damage_primary', 'has_keys', 'odometer', 'current_bid', 'sale_date',
    ];
    for (const field of requiredFields) {
      expect(copartKeys).toContain(field);
      expect(iaaiKeys).toContain(field);
    }

    // Both listings can be compared without source-specific handling
    const compareByBid = (a: AuctionListing, b: AuctionListing) => a.current_bid - b.current_bid;
    const sorted = [copart, iaai].sort(compareByBid);
    expect(sorted).toHaveLength(2);
  });

  it('warns when unknown IAAI titleCode is encountered in non-production', () => {
    const originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'development';

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const raw = { ...iaaiFixture, titleCode: 'UNKNOWN_CODE' } as IaaiRawListing;
    normalizeIaai(raw);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
    process.env['NODE_ENV'] = originalNodeEnv;
  });
});
