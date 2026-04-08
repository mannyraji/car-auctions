/**
 * Normalizer structural guarantee tests
 *
 * Covers "Things to watch" from PR #27:
 * - SC-001: Both Copart and IAAI outputs have no `undefined` on required fields
 * - Both outputs can be merged, sorted, and compared without source-specific handling
 * - FR-007 defaults are applied for every nullable field
 * - Copart htsmn case-insensitive truthy matching (FR-005)
 * - IAAI hasKeys case-insensitive matching (FR-006)
 */
import { describe, it, expect, vi } from 'vitest';
import { normalizeCopart } from '../src/normalizer/copart.js';
import { normalizeIaai } from '../src/normalizer/iaai.js';
import copartFull from './fixtures/copart-raw-listing.json';
import iaaiFullRaw from './fixtures/iaai-raw-listing.json';
import type { AuctionListing, CopartRawListing, IaaiRawListing } from '../src/types/index.js';

const copartFixture = copartFull as CopartRawListing;
const iaaiFixture = iaaiFullRaw as IaaiRawListing;

// ─── Required field keys — none may be undefined (SC-001) ────────────────────

const REQUIRED_STRING_FIELDS: (keyof AuctionListing)[] = [
  'source',
  'lot_number',
  'vin',
  'make',
  'model',
  'title_type',
  'damage_primary',
  'sale_status',
  'location',
  'detail_url',
  'fetched_at',
];

const REQUIRED_NON_UNDEFINED_FIELDS: (keyof AuctionListing)[] = [
  ...REQUIRED_STRING_FIELDS,
  'year',
  'has_keys',
  'image_urls',
];

describe('SC-001 — no undefined on required fields', () => {
  it.each([
    ['Copart full', normalizeCopart(copartFixture)],
    ['IAAI full', normalizeIaai(iaaiFixture)],
    ['Copart empty', normalizeCopart({} as CopartRawListing)],
    ['IAAI empty', normalizeIaai({} as IaaiRawListing)],
  ])('%s listing has no undefined required fields', (_label, listing) => {
    for (const key of REQUIRED_NON_UNDEFINED_FIELDS) {
      expect(listing[key], `${key} should not be undefined`).not.toBeUndefined();
    }
  });

  it.each([
    ['Copart full', normalizeCopart(copartFixture)],
    ['IAAI full', normalizeIaai(iaaiFixture)],
    ['Copart empty', normalizeCopart({} as CopartRawListing)],
    ['IAAI empty', normalizeIaai({} as IaaiRawListing)],
  ])('%s listing — all required string fields are strings', (_label, listing) => {
    for (const key of REQUIRED_STRING_FIELDS) {
      expect(typeof listing[key], `${key} should be a string`).toBe('string');
    }
  });
});

// ─── Cross-source merge/sort/compare (User Story 1, Scenario 3) ──────────────

describe('Cross-source structural equivalence', () => {
  const copartOutput = normalizeCopart(copartFixture);
  const iaaiOutput = normalizeIaai(iaaiFixture);

  it('both outputs have identical key sets', () => {
    expect(Object.keys(copartOutput).sort()).toEqual(Object.keys(iaaiOutput).sort());
  });

  it('can be collected into an array and sorted by year', () => {
    const combined = [copartOutput, iaaiOutput];
    const sorted = combined.sort((a, b) => a.year - b.year);
    expect(sorted).toHaveLength(2);
    expect(sorted[0].year).toBeLessThanOrEqual(sorted[1].year);
  });

  it('can be sorted by current_bid (nullable, nulls last)', () => {
    const combined = [
      copartOutput,
      iaaiOutput,
      normalizeCopart({} as CopartRawListing), // null current_bid
    ];
    const sorted = combined.sort(
      (a, b) => (a.current_bid ?? Infinity) - (b.current_bid ?? Infinity)
    );
    expect(sorted).toHaveLength(3);
    // Last entry has null bid
    expect(sorted[2].current_bid).toBeNull();
  });

  it('can be filtered by source without source-specific field access', () => {
    const combined = [copartOutput, iaaiOutput];
    const coparts = combined.filter((l) => l.source === 'copart');
    const iaais = combined.filter((l) => l.source === 'iaai');
    expect(coparts).toHaveLength(1);
    expect(iaais).toHaveLength(1);
  });
});

// ─── FR-007 defaults for nullable fields ─────────────────────────────────────

describe('FR-007 — default values on empty input', () => {
  const copartEmpty = normalizeCopart({} as CopartRawListing);
  const iaaiEmpty = normalizeIaai({} as IaaiRawListing);

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — trim defaults to null', (_label, listing) => {
    expect(listing.trim).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — damage_secondary defaults to null', (_label, listing) => {
    expect(listing.damage_secondary).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — has_keys defaults to false', (_label, listing) => {
    expect(listing.has_keys).toBe(false);
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — odometer defaults to null', (_label, listing) => {
    expect(listing.odometer).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — color defaults to null', (_label, listing) => {
    expect(listing.color).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — engine defaults to null', (_label, listing) => {
    expect(listing.engine).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — transmission defaults to null', (_label, listing) => {
    expect(listing.transmission).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — current_bid defaults to null', (_label, listing) => {
    expect(listing.current_bid).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — buy_now_price defaults to null', (_label, listing) => {
    expect(listing.buy_now_price).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — sale_date defaults to null', (_label, listing) => {
    expect(listing.sale_date).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — sale_status defaults to "UPCOMING"', (_label, listing) => {
    expect(listing.sale_status).toBe('UPCOMING');
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — image_url defaults to null', (_label, listing) => {
    expect(listing.image_url).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — image_urls defaults to []', (_label, listing) => {
    expect(listing.image_urls).toEqual([]);
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — seller defaults to null', (_label, listing) => {
    expect(listing.seller).toBeNull();
  });

  it.each([
    ['Copart', copartEmpty],
    ['IAAI', iaaiEmpty],
  ])('%s — grid_row defaults to null', (_label, listing) => {
    expect(listing.grid_row).toBeNull();
  });
});

// ─── FR-005/FR-006 has_keys coercion edge cases ─────────────────────────────

describe('has_keys coercion edge cases', () => {
  describe('Copart htsmn → has_keys (FR-005)', () => {
    it('"Yes" (capital Y) → true', () => {
      expect(normalizeCopart({ htsmn: 'Yes' } as CopartRawListing).has_keys).toBe(true);
    });

    it('"yes" (all lower) → true', () => {
      expect(normalizeCopart({ htsmn: 'yes' } as CopartRawListing).has_keys).toBe(true);
    });

    it('"YES" (all upper) → true', () => {
      expect(normalizeCopart({ htsmn: 'YES' } as CopartRawListing).has_keys).toBe(true);
    });

    it('"No" → false', () => {
      expect(normalizeCopart({ htsmn: 'No' } as CopartRawListing).has_keys).toBe(false);
    });

    it('null → false', () => {
      expect(normalizeCopart({ htsmn: null } as unknown as CopartRawListing).has_keys).toBe(false);
    });

    it('undefined → false', () => {
      expect(normalizeCopart({ htsmn: undefined } as CopartRawListing).has_keys).toBe(false);
    });

    it('empty string → false', () => {
      expect(normalizeCopart({ htsmn: '' } as CopartRawListing).has_keys).toBe(false);
    });

    it('"true" (non-"yes" truthy string) → false', () => {
      expect(normalizeCopart({ htsmn: 'true' } as CopartRawListing).has_keys).toBe(false);
    });
  });

  describe('IAAI hasKeys → has_keys (FR-006)', () => {
    it('"YES" → true', () => {
      expect(normalizeIaai({ hasKeys: 'YES' } as IaaiRawListing).has_keys).toBe(true);
    });

    it('"yes" → true (case-insensitive)', () => {
      expect(normalizeIaai({ hasKeys: 'yes' } as IaaiRawListing).has_keys).toBe(true);
    });

    it('"NO" → false', () => {
      expect(normalizeIaai({ hasKeys: 'NO' } as IaaiRawListing).has_keys).toBe(false);
    });

    it('null → false', () => {
      expect(normalizeIaai({ hasKeys: null } as unknown as IaaiRawListing).has_keys).toBe(false);
    });

    it('undefined → false', () => {
      expect(normalizeIaai({ hasKeys: undefined } as IaaiRawListing).has_keys).toBe(false);
    });

    it('empty string → false', () => {
      expect(normalizeIaai({ hasKeys: '' } as IaaiRawListing).has_keys).toBe(false);
    });
  });
});

// ─── IAAI title code edge cases (FR-006) ─────────────────────────────────────

describe('IAAI title code edge cases', () => {
  it('null titleCode → title_type "Unknown"', () => {
    const listing = normalizeIaai({ titleCode: null } as unknown as IaaiRawListing);
    expect(listing.title_type).toBe('Unknown');
    expect(listing.title_code).toBeNull();
  });

  it('undefined titleCode → title_type "Unknown"', () => {
    const listing = normalizeIaai({} as IaaiRawListing);
    expect(listing.title_type).toBe('Unknown');
  });

  it('lowercase title code "sv" → "Salvage" (case-insensitive lookup)', () => {
    const listing = normalizeIaai({ titleCode: 'sv' } as IaaiRawListing);
    expect(listing.title_type).toBe('Salvage');
  });

  it('unknown code logs warning and returns "Unknown"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listing = normalizeIaai({ titleCode: 'ZZ' } as IaaiRawListing);
    expect(listing.title_type).toBe('Unknown');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('empty string titleCode logs warning and returns "Unknown"', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const listing = normalizeIaai({ titleCode: '' } as IaaiRawListing);
    expect(listing.title_type).toBe('Unknown');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
