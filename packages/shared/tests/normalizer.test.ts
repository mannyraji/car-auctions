/**
 * @file normalizer.test.ts
 * @description Tests for Copart and IAAI auction normalizers.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeCopart, normalizeIaai } from '../src/normalizer.js';
import type { CopartRawListing, IaaiRawListing } from '../src/types/index.js';
import copartFixture from './fixtures/copart-raw.json' assert { type: 'json' };
import iaaiFixture from './fixtures/iaai-raw.json' assert { type: 'json' };

// ─── Copart normalizer ────────────────────────────────────────────────────────

describe('normalizeCopart', () => {
  it('sets source to copart', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.source).toBe('copart');
  });

  it('maps all required identity fields', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.lot_number).toBe('45678901');
    expect(result.vin).toBe('1HGCM82633A123456');
    expect(result.year).toBe(2018);
    expect(result.make).toBe('HONDA');
    expect(result.model).toBe('ACCORD');
  });

  it('maps color correctly', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.color).toBe('Silver');
  });

  it('converts odometer from miles to km', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    // 55000 miles → ~88514 km
    expect(result.odometer_km).toBeGreaterThan(88000);
    expect(result.odometer_km).toBeLessThan(89000);
  });

  it('maps damage fields', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.damage_primary).toBe('Front End');
    expect(result.damage_secondary).toBe('Minor Dents/Scratches');
  });

  it('maps has_keys as boolean', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.has_keys).toBe(true);
  });

  it('maps title_type', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.title_type).toBe('Salvage');
  });

  it('maps bid and buy-now prices', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.current_bid_usd).toBe(4500);
    expect(result.buy_now_usd).toBe(8000);
  });

  it('maps location fields', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.auction_yard).toBe('Dallas/Ft Worth');
    expect(result.state).toBe('TX');
    expect(result.zip).toBe('75001');
  });

  it('sets extended fields to null', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result.estimated_repair_usd).toBeNull();
    expect(result.acv_usd).toBeNull();
  });

  it('handles null sdd field', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, sdd: null };
    const result = normalizeCopart(raw);
    expect(result.damage_secondary).toBeNull();
  });

  it('handles null bid/buy-now prices', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, cd: null, bnp: null };
    const result = normalizeCopart(raw);
    expect(result.current_bid_usd).toBeNull();
    expect(result.buy_now_usd).toBeNull();
  });

  it('sets sale_status to upcoming for future sale dates', () => {
    const futureDate = new Date(Date.now() + 86400 * 1000).toISOString();
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, sed: futureDate };
    const result = normalizeCopart(raw);
    expect(result.sale_status).toBe('upcoming');
  });

  it('sets sale_status to sold for past sale dates', () => {
    const pastDate = '2020-01-01T00:00:00Z';
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, sed: pastDate };
    const result = normalizeCopart(raw);
    expect(result.sale_status).toBe('sold');
  });

  it('handles epoch timestamp in sed field', () => {
    const epochMs = Date.now() + 86400 * 1000;
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, sed: String(epochMs) };
    const result = normalizeCopart(raw);
    expect(result.sale_date).toBeTruthy();
    expect(result.sale_status).toBe('upcoming');
  });

  it('handles km odometer brand without double-conversion', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, orr: 100000, obd: 'Actual KM' };
    const result = normalizeCopart(raw);
    expect(result.odometer_km).toBe(100000);
  });

  it('sets odometer_km to null when orr is 0', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, orr: 0 };
    const result = normalizeCopart(raw);
    expect(result.odometer_km).toBeNull();
  });

  it('sets sale_date to null when sed is empty string', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, sed: '' };
    const result = normalizeCopart(raw);
    expect(result.sale_date).toBeNull();
    expect(result.sale_status).toBeNull();
  });

  it('sets sale_date to null when sed is invalid date string', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, sed: 'not-a-date' };
    const result = normalizeCopart(raw);
    expect(result.sale_date).toBeNull();
    expect(result.sale_status).toBeNull();
  });

  it('handles yn being a non-number', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, yn: 'notANumber' as any };
    const result = normalizeCopart(raw);
    expect(result.year).toBe(0);
  });

  it('handles KILOMETER odometer brand variant', () => {
    const raw: CopartRawListing = { ...copartFixture as CopartRawListing, orr: 50000, obd: 'Total Kilometers' };
    const result = normalizeCopart(raw);
    expect(result.odometer_km).toBe(50000);
  });

  it('handles missing/null fields in sparse Copart object', () => {
    // Exercises all the `?? null` / `?? ''` fallback branches
    const sparse = {
      lotNumberStr: undefined as unknown as string,
      vn: undefined as unknown as string,
      mkn: undefined as unknown as string,
      lnn: undefined as unknown as string,
      yn: undefined as unknown as number,
      clr: undefined as unknown as string,
      dd: undefined as unknown as string,
      sdd: null,
      hk: false,
      ln: undefined as unknown as string,
      orr: undefined as unknown as number,
      obd: undefined as unknown as string,
      tmtp: undefined as unknown as string,
      htrf: false,
      cd: null,
      bnp: null,
      sed: '',
      syn: undefined as unknown as string,
      st: undefined as unknown as string,
      pc: undefined as unknown as string,
    } as CopartRawListing;
    const result = normalizeCopart(sparse);
    expect(result.lot_number).toBe('');
    expect(result.vin).toBe('');
    expect(result.make).toBe('');
    expect(result.model).toBe('');
    expect(result.year).toBe(0);
    expect(result.color).toBeNull();
    expect(result.damage_primary).toBeNull();
    expect(result.damage_secondary).toBeNull();
    expect(result.title_type).toBeNull();
    expect(result.current_bid_usd).toBeNull();
    expect(result.buy_now_usd).toBeNull();
    expect(result.auction_yard).toBeNull();
    expect(result.state).toBeNull();
    expect(result.zip).toBeNull();
    expect(result.odometer_km).toBeNull();
    expect(result.sale_status).toBeNull();
  });

  it('produces a result that conforms to AuctionListing shape', () => {
    const result = normalizeCopart(copartFixture as CopartRawListing);
    expect(result).toMatchObject({
      source: 'copart',
      lot_number: expect.any(String),
      vin: expect.any(String),
      year: expect.any(Number),
      make: expect.any(String),
      model: expect.any(String),
    });
  });
});

// ─── IAAI normalizer ──────────────────────────────────────────────────────────

describe('normalizeIaai', () => {
  it('sets source to iaai', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.source).toBe('iaai');
  });

  it('maps all required identity fields', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.lot_number).toBe('98765432');
    expect(result.vin).toBe('1FTFW1ET0DFC10312');
    expect(result.year).toBe(2013);
    expect(result.make).toBe('FORD');
    expect(result.model).toBe('F-150');
    expect(result.trim).toBe('XLT');
    expect(result.body_style).toBe('Pickup Truck');
  });

  it('maps hasKeys "YES" to true', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.has_keys).toBe(true);
  });

  it('maps hasKeys "NO" to false', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, hasKeys: 'NO' };
    const result = normalizeIaai(raw);
    expect(result.has_keys).toBe(false);
  });

  it('maps hasKeys null to false', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, hasKeys: null };
    const result = normalizeIaai(raw);
    expect(result.has_keys).toBe(false);
  });

  it('maps titleCode "SV" to "Salvage"', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.title_type).toBe('Salvage');
  });

  it('maps titleCode "CL" to "Clean"', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, titleCode: 'CL' };
    const result = normalizeIaai(raw);
    expect(result.title_type).toBe('Clean');
  });

  it('maps titleCode "RB" to "Rebuilt"', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, titleCode: 'RB' };
    const result = normalizeIaai(raw);
    expect(result.title_type).toBe('Rebuilt');
  });

  it('maps titleCode "SL" to "Salvage Lien"', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, titleCode: 'SL' };
    const result = normalizeIaai(raw);
    expect(result.title_type).toBe('Salvage Lien');
  });

  it('maps unknown titleCode to "Unknown" and warns', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, titleCode: 'XX' };
    const result = normalizeIaai(raw);
    expect(result.title_type).toBe('Unknown');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown titleCode'));
    warnSpy.mockRestore();
  });

  it('converts mileage from miles to km', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    // 120000 miles → ~193121 km
    expect(result.odometer_km).toBeGreaterThan(192000);
    expect(result.odometer_km).toBeLessThan(194000);
  });

  it('sets odometer_km to null when Mileage is 0', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, Mileage: 0 };
    const result = normalizeIaai(raw);
    expect(result.odometer_km).toBeNull();
  });

  it('sets odometer_km to null when Mileage is null', () => {
    const raw: IaaiRawListing = { ...iaaiFixture as IaaiRawListing, Mileage: null };
    const result = normalizeIaai(raw);
    expect(result.odometer_km).toBeNull();
  });

  it('maps location fields', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.auction_yard).toBe('Houston');
    expect(result.state).toBe('TX');
    expect(result.zip).toBe('77001');
  });

  it('maps bid price', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.current_bid_usd).toBe(3200);
    expect(result.buy_now_usd).toBeNull();
  });

  it('sets extended fields to null', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.estimated_repair_usd).toBeNull();
    expect(result.acv_usd).toBeNull();
  });

  it('parses sale_date as ISO 8601', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.sale_date).toBeTruthy();
    expect(() => new Date(result.sale_date!)).not.toThrow();
  });

  it('sets sale_status to null', () => {
    const result = normalizeIaai(iaaiFixture as IaaiRawListing);
    expect(result.sale_status).toBeNull();
  });

  it('produces structurally identical shapes for Copart and IAAI', () => {
    const copartResult = normalizeCopart(copartFixture as CopartRawListing);
    const iaaiResult = normalizeIaai(iaaiFixture as IaaiRawListing);
    const copartKeys = Object.keys(copartResult).sort();
    const iaaiKeys = Object.keys(iaaiResult).sort();
    expect(copartKeys).toEqual(iaaiKeys);
  });

  it('handles missing/null fields in sparse IAAI object', () => {
    const sparse = {
      StockNumber: undefined as unknown as string,
      Vin: undefined as unknown as string,
      Year: undefined as unknown as number,
      Make: undefined as unknown as string,
      Model: undefined as unknown as string,
      Trim: null,
      BodyStyle: null,
      Color: null,
      Mileage: null,
      PrimaryDamage: null,
      SecondaryDamage: null,
      hasKeys: null,
      titleCode: '',
      CurrentBid: null,
      BuyItNow: null,
      SaleDate: null,
      BranchName: null,
      State: null,
      Zip: null,
    } as IaaiRawListing;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = normalizeIaai(sparse);
    expect(result.lot_number).toBe('');
    expect(result.vin).toBe('');
    expect(result.make).toBe('');
    expect(result.model).toBe('');
    expect(result.trim).toBeNull();
    expect(result.body_style).toBeNull();
    expect(result.color).toBeNull();
    expect(result.odometer_km).toBeNull();
    expect(result.damage_primary).toBeNull();
    expect(result.damage_secondary).toBeNull();
    expect(result.has_keys).toBe(false);
    expect(result.current_bid_usd).toBeNull();
    expect(result.buy_now_usd).toBeNull();
    expect(result.sale_date).toBeNull();
    expect(result.auction_yard).toBeNull();
    expect(result.state).toBeNull();
    expect(result.zip).toBeNull();
    warnSpy.mockRestore();
  });



  afterEach(() => {
    vi.restoreAllMocks();
  });
});
