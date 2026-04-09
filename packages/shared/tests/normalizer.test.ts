import { describe, it, expect, vi } from 'vitest';
import { normalizeCopart } from '../src/normalizer/copart.js';
import { normalizeIaai } from '../src/normalizer/iaai.js';
import copartFull from './fixtures/copart-raw-listing.json';
import iaaiFullRaw from './fixtures/iaai-raw-listing.json';
import copartMinimal from './fixtures/copart-raw-minimal.json';
import iaaiMinimal from './fixtures/iaai-raw-minimal.json';
import type { CopartRawListing, IaaiRawListing } from '../src/types/index.js';

const copartFixture = copartFull as CopartRawListing;
const iaaiFixture = iaaiFullRaw as IaaiRawListing;

describe('normalizeCopart', () => {
  it('maps all required fields from full fixture', () => {
    const listing = normalizeCopart(copartFixture);

    expect(listing.source).toBe('copart');
    expect(listing.lot_number).toBe('71234567');
    expect(listing.vin).toBe('1HGCM82633A004352');
    expect(listing.year).toBe(2003);
    expect(listing.make).toBe('Honda');
    expect(listing.model).toBe('Accord');
    expect(listing.damage_primary).toBe('FRONT END');
    expect(listing.damage_secondary).toBe('MINOR DENTS/SCRATCHES');
    expect(listing.has_keys).toBe(true);
    expect(listing.odometer).toBe(142300);
    expect(listing.color).toBe('SILVER');
    expect(listing.engine).toBe('4-2.4L');
    expect(listing.transmission).toBe('AUTOMATIC');
    expect(listing.title_type).toBe('SV');
    expect(listing.title_code).toBe('SV');
    expect(listing.location).toBe('Houston - North, TX');
    expect(listing.current_bid).toBe(2400);
    expect(listing.detail_url).toBe('https://www.copart.com/lot/71234567');
    expect(listing.seller).toBe('State Farm');
    expect(listing.sale_status).toBe('UPCOMING');
  });

  it('populates image_urls from tims object', () => {
    const listing = normalizeCopart(copartFixture);
    expect(listing.image_urls).toBeInstanceOf(Array);
    expect(listing.image_urls.length).toBeGreaterThan(0);
    expect(listing.image_url).toBeTruthy();
  });

  it('sets fetched_at to a valid ISO timestamp', () => {
    const before = Date.now();
    const listing = normalizeCopart(copartFixture);
    const after = Date.now();
    const ts = new Date(listing.fetched_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('handles minimal fixture with missing optional fields', () => {
    const listing = normalizeCopart(copartMinimal as CopartRawListing);

    expect(listing.source).toBe('copart');
    expect(listing.lot_number).toBe('99000001');
    expect(listing.vin).toBe('1HGCM82633A004352');
    // Defaults
    expect(listing.make).toBe('');
    expect(listing.model).toBe('');
    expect(listing.year).toBe(0);
    expect(listing.has_keys).toBe(false);
    expect(listing.odometer).toBeNull();
    expect(listing.image_urls).toEqual([]);
    expect(listing.color).toBeNull();
    expect(listing.engine).toBeNull();
    expect(listing.seller).toBeNull();
  });

  it('never throws on empty input', () => {
    expect(() => normalizeCopart({})).not.toThrow();
  });
});

describe('normalizeIaai', () => {
  it('maps all required fields from full fixture', () => {
    const listing = normalizeIaai(iaaiFixture);

    expect(listing.source).toBe('iaai');
    expect(listing.lot_number).toBe('A12345678');
    expect(listing.vin).toBe('1HGCM82633A004352');
    expect(listing.year).toBe(2003);
    expect(listing.make).toBe('Honda');
    expect(listing.model).toBe('Accord');
    expect(listing.trim).toBe('EX');
    expect(listing.damage_primary).toBe('Front End');
    expect(listing.damage_secondary).toBe('Undercarriage');
    expect(listing.has_keys).toBe(true);
    expect(listing.odometer).toBe(142300);
    expect(listing.odometer_status).toBe('ACTUAL');
    expect(listing.color).toBe('Silver');
    expect(listing.engine).toBe('2.4L I4 DOHC 16V');
    expect(listing.transmission).toBe('Automatic');
    expect(listing.fuel_type).toBe('Gas');
    expect(listing.cylinders).toBe(4);
    expect(listing.current_bid).toBe(2400);
    expect(listing.location).toBe('Houston North');
    expect(listing.location_zip).toBe('77060');
    expect(listing.detail_url).toBe('https://www.iaai.com/VehicleDetail/A12345678');
    expect(listing.seller).toBe('Allstate Insurance');
    expect(listing.sale_status).toBe('UPCOMING');
  });

  it('maps title code SV to "Salvage"', () => {
    const listing = normalizeIaai(iaaiFixture);
    expect(listing.title_type).toBe('Salvage');
    expect(listing.title_code).toBe('SV');
  });

  it('maps all known title codes', () => {
    const codes: Array<[string, string]> = [
      ['CL', 'Clean'],
      ['RB', 'Rebuilt'],
      ['FL', 'Flood'],
      ['NR', 'Non-Repairable'],
      ['JK', 'Junk'],
      ['MV', 'Manufacturer Buyback'],
    ];
    for (const [code, expected] of codes) {
      const listing = normalizeIaai({ titleCode: code } as IaaiRawListing);
      expect(listing.title_type).toBe(expected);
    }
  });

  it('maps unknown title code to "Unknown (XX)" with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listing = normalizeIaai({ titleCode: 'XX' } as IaaiRawListing);
    expect(listing.title_type).toBe('Unknown (XX)');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown title code'));
    warnSpy.mockRestore();
  });

  it('coerces hasKeys "YES" to true and "NO" to false', () => {
    expect(normalizeIaai({ hasKeys: 'YES' } as IaaiRawListing).has_keys).toBe(true);
    expect(normalizeIaai({ hasKeys: 'NO' } as IaaiRawListing).has_keys).toBe(false);
    expect(normalizeIaai({ hasKeys: 'yes' } as IaaiRawListing).has_keys).toBe(true);
  });

  it('coerces odometer string to number', () => {
    const listing = normalizeIaai({ odometer: '142300' } as IaaiRawListing);
    expect(listing.odometer).toBe(142300);
  });

  it('returns null odometer for empty string', () => {
    const listing = normalizeIaai(iaaiMinimal as IaaiRawListing);
    expect(listing.odometer).toBeNull();
  });

  it('extracts image_urls from imageUrls object', () => {
    const listing = normalizeIaai(iaaiFixture);
    expect(listing.image_urls.length).toBeGreaterThan(0);
    expect(listing.image_url).toBeTruthy();
  });

  it('defaults image_urls to [] when missing', () => {
    const listing = normalizeIaai({} as IaaiRawListing);
    expect(listing.image_urls).toEqual([]);
  });

  it('handles minimal fixture with missing optional fields', () => {
    const listing = normalizeIaai(iaaiMinimal as IaaiRawListing);
    expect(listing.source).toBe('iaai');
    expect(listing.lot_number).toBe('X99000001');
    expect(listing.has_keys).toBe(false);
  });

  it('never throws on empty input', () => {
    expect(() => normalizeIaai({})).not.toThrow();
  });
});

describe('Structural identity between Copart and IAAI outputs', () => {
  it('both outputs have the same top-level keys', () => {
    const copartKeys = Object.keys(normalizeCopart(copartFixture)).sort();
    const iaaiKeys = Object.keys(normalizeIaai(iaaiFixture)).sort();
    expect(copartKeys).toEqual(iaaiKeys);
  });
});
