/**
 * Public API contract test
 *
 * Verifies every export listed in contracts/public-api.md is actually
 * re-exported from the barrel (src/index.ts). Catches regressions where
 * downstream MCP server packages would break due to missing exports.
 */
import { describe, it, expect } from 'vitest';
import * as shared from '../src/index.js';

// ─── Type exports (verified structurally via runtime artefacts) ──────────────

describe('Public API — type exports compile', () => {
  // Types are erased at runtime so we verify them by constructing values
  // that satisfy the interfaces. If any type export is missing, TS will
  // fail to compile this test file.

  it('AuctionListing interface is usable', () => {
    const listing: import('../src/types/index.js').AuctionListing = {
      source: 'copart',
      lot_number: '1',
      vin: '1HGCM82633A004352',
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: null,
      title_type: 'SV',
      title_code: 'SV',
      damage_primary: 'FRONT END',
      damage_secondary: null,
      has_keys: true,
      odometer: 100000,
      odometer_status: null,
      color: null,
      engine: null,
      transmission: null,
      drive_type: null,
      fuel_type: null,
      cylinders: null,
      current_bid: null,
      buy_now_price: null,
      sale_date: null,
      sale_status: 'UPCOMING',
      final_bid: null,
      location: 'Houston, TX',
      latitude: null,
      longitude: null,
      image_url: null,
      image_urls: [],
      detail_url: '',
      seller: null,
      grid_row: null,
      fetched_at: new Date().toISOString(),
    };
    expect(listing.source).toBe('copart');
  });

  it('ToolResponse envelope is usable', () => {
    const resp: import('../src/types/index.js').ToolResponse<string> = {
      success: true,
      data: 'ok',
      error: null,
      cached: false,
      stale: false,
      cachedAt: null,
      timestamp: new Date().toISOString(),
    };
    expect(resp.success).toBe(true);
  });

  it('RiskFlag interface is usable', () => {
    const flag: import('../src/types/index.js').RiskFlag = {
      type: 'title_wash',
      severity: 'critical',
      detail: 'Title history mismatch',
      source: null,
    };
    expect(flag.severity).toBe('critical');
  });

  it('VINDecodeResult interface is usable', () => {
    const result: import('../src/types/index.js').VINDecodeResult = {
      vin: '1HGCM82633A004352',
      year: 2003,
      make: 'HONDA',
      model: 'Accord',
      trim: null,
      engineType: null,
      bodyClass: null,
      driveType: null,
      fuelType: null,
      transmission: null,
      cylinders: null,
      displacementL: null,
      manufacturer: null,
      plantCountry: null,
      vehicleType: null,
      errorCode: '0',
    };
    expect(result.vin).toBeTruthy();
  });
});

// ─── Runtime exports ─────────────────────────────────────────────────────────

describe('Public API — runtime value exports exist', () => {
  it('exports error classes', () => {
    expect(shared.ScraperError).toBeTypeOf('function');
    expect(shared.CaptchaError).toBeTypeOf('function');
    expect(shared.RateLimitError).toBeTypeOf('function');
    expect(shared.CacheError).toBeTypeOf('function');
    expect(shared.AnalysisError).toBeTypeOf('function');
  });

  it('exports auction normalizers', () => {
    expect(shared.normalizeCopart).toBeTypeOf('function');
    expect(shared.normalizeIaai).toBeTypeOf('function');
  });

  it('exports VIN decoder functions and cache implementations', () => {
    expect(shared.decodeVin).toBeTypeOf('function');
    expect(shared.validateVin).toBeTypeOf('function');
    expect(shared.SqliteVinCache).toBeTypeOf('function');
    expect(shared.InMemoryVinCache).toBeTypeOf('function');
  });

  it('exports MCP server helper', () => {
    expect(shared.createMcpServer).toBeTypeOf('function');
  });

  it('exports BrowserPool class', () => {
    expect(shared.BrowserPool).toBeTypeOf('function');
  });

  it('exports PriorityQueue class', () => {
    expect(shared.PriorityQueue).toBeTypeOf('function');
  });

  it('exports tracing utilities', () => {
    expect(shared.initTracing).toBeTypeOf('function');
    expect(shared.withSpan).toBeTypeOf('function');
  });
});

// ─── No unexpected default export ────────────────────────────────────────────

describe('Public API — tree-shakeable (no default export)', () => {
  it('has no default export', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((shared as any).default).toBeUndefined();
  });
});
