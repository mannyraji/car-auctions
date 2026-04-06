/**
 * @file normalizer.ts
 * @description Auction data normalizers for Copart and IAAI raw API responses.
 *
 * Both normalizers produce a source-agnostic `AuctionListing`. Unknown or
 * missing fields are mapped to `null` rather than throwing.
 *
 * @since 001-shared-utilities-lib
 */

import type { AuctionListing, CopartRawListing, IaaiRawListing } from './types/index.js';

// ─── Internal IAAI title code map ─────────────────────────────────────────────

/**
 * Maps IAAI `titleCode` values to human-readable title type strings.
 * Internal — not exported from the public API.
 */
const IAAI_TITLE_CODE_MAP: Record<string, string> = {
  CL: 'Clean',
  SV: 'Salvage',
  RB: 'Rebuilt',
  SL: 'Salvage Lien',
};

// ─── Copart odometer helpers ───────────────────────────────────────────────────

/**
 * Converts an odometer reading to kilometres.
 * Copart `obd` field indicates the unit brand; if it mentions "KM" we assume
 * the reading is already in kilometres, otherwise we convert miles → km.
 */
function toKilometres(reading: number, obd: string): number {
  const brand = obd.toUpperCase();
  if (brand.includes('KM') || brand.includes('KILOMETER')) {
    return Math.round(reading);
  }
  // miles → km
  return Math.round(reading * 1.60934);
}

// ─── Sale status helpers ───────────────────────────────────────────────────────

type SaleStatus = 'upcoming' | 'live' | 'sold' | 'cancelled' | null;

/**
 * Attempts to derive a normalised sale status from the Copart `ln` (lane) field
 * and the sale-end-date. Falls back to `null` when undeterminable.
 */
function copartSaleStatus(_ln: string, sed: string): SaleStatus {
  if (!sed) return null;
  const now = Date.now();
  const sedNum = Number(sed);
  const saleTime = isNaN(sedNum) ? Date.parse(sed) : sedNum;
  if (isNaN(saleTime) || saleTime === 0) return null;
  return saleTime > now ? 'upcoming' : 'sold';
}

// ─── normalizeCopart ──────────────────────────────────────────────────────────

/**
 * Converts a raw Copart API response into a source-agnostic `AuctionListing`.
 *
 * Field mapping:
 * - `lotNumberStr` → `lot_number`
 * - `vn`          → `vin`
 * - `mkn`         → `make`
 * - `lnn`         → `model`
 * - `yn`          → `year`
 * - `clr`         → `color`
 * - `dd`          → `damage_primary`
 * - `sdd`         → `damage_secondary`
 * - `hk`          → `has_keys`
 * - `orr` + `obd` → `odometer_km` (converted to km)
 * - `tmtp`        → `title_type`
 * - `cd`          → `current_bid_usd`
 * - `bnp`         → `buy_now_usd`
 * - `sed`         → `sale_date` (ISO 8601)
 * - `syn`         → `auction_yard`
 * - `st`          → `state`
 * - `pc`          → `zip`
 *
 * @example
 * import copartFixture from './tests/fixtures/copart-raw.json' assert { type: 'json' };
 * const listing = normalizeCopart(copartFixture);
 * console.log(listing.source); // 'copart'
 */
export function normalizeCopart(raw: CopartRawListing): AuctionListing {
  // Parse sale date
  const sedNum = Number(raw.sed);
  let saleDate: string | null = null;
  if (!isNaN(sedNum) && sedNum > 0) {
    saleDate = new Date(sedNum).toISOString();
  } else if (raw.sed) {
    const parsed = Date.parse(raw.sed);
    saleDate = isNaN(parsed) ? null : new Date(parsed).toISOString();
  }

  return {
    source: 'copart',
    lot_number: raw.lotNumberStr ?? '',
    vin: raw.vn ?? '',
    year: typeof raw.yn === 'number' ? raw.yn : 0,
    make: raw.mkn ?? '',
    model: raw.lnn ?? '',
    trim: null,
    body_style: null,
    color: raw.clr ?? null,
    odometer_km:
      typeof raw.orr === 'number' && raw.orr > 0
        ? toKilometres(raw.orr, raw.obd ?? '')
        : null,
    damage_primary: raw.dd ?? null,
    damage_secondary: raw.sdd ?? null,
    has_keys: Boolean(raw.hk),
    title_type: raw.tmtp ?? null,
    current_bid_usd: raw.cd ?? null,
    buy_now_usd: raw.bnp ?? null,
    sale_date: saleDate,
    sale_status: copartSaleStatus(raw.ln ?? '', raw.sed ?? ''),
    auction_yard: raw.syn ?? null,
    state: raw.st ?? null,
    zip: raw.pc ?? null,
    estimated_repair_usd: null,
    acv_usd: null,
  };
}

// ─── normalizeIaai ────────────────────────────────────────────────────────────

/**
 * Converts a raw IAAI API response into a source-agnostic `AuctionListing`.
 *
 * Type coercions:
 * - `hasKeys: "YES"/"NO"` → `boolean`
 * - `titleCode: "SV"/"CL"/"RB"/"SL"` → human-readable string
 * - Unknown `titleCode` values → `"Unknown"` (with console.warn)
 *
 * @example
 * import iaaiFixture from './tests/fixtures/iaai-raw.json' assert { type: 'json' };
 * const listing = normalizeIaai(iaaiFixture);
 * console.log(listing.has_keys); // true
 */
export function normalizeIaai(raw: IaaiRawListing): AuctionListing {
  // Resolve title type
  const code = raw.titleCode?.toUpperCase() ?? '';
  let titleType: string | null = IAAI_TITLE_CODE_MAP[code] ?? null;
  if (code && !IAAI_TITLE_CODE_MAP[code]) {
    titleType = 'Unknown';
    console.warn(`[normalizeIaai] Unknown titleCode: "${raw.titleCode}"`);
  }

  // Resolve has_keys
  const hasKeys = raw.hasKeys === 'YES' ? true : raw.hasKeys === 'NO' ? false : false;

  // Convert mileage (IAAI provides miles) → km
  const odometerKm =
    typeof raw.Mileage === 'number' && raw.Mileage > 0
      ? Math.round(raw.Mileage * 1.60934)
      : null;

  // Parse sale date
  let saleDate: string | null = null;
  if (raw.SaleDate) {
    const parsed = Date.parse(raw.SaleDate);
    saleDate = isNaN(parsed) ? raw.SaleDate : new Date(parsed).toISOString();
  }

  return {
    source: 'iaai',
    lot_number: raw.StockNumber ?? '',
    vin: raw.Vin ?? '',
    year: typeof raw.Year === 'number' ? raw.Year : 0,
    make: raw.Make ?? '',
    model: raw.Model ?? '',
    trim: raw.Trim ?? null,
    body_style: raw.BodyStyle ?? null,
    color: raw.Color ?? null,
    odometer_km: odometerKm,
    damage_primary: raw.PrimaryDamage ?? null,
    damage_secondary: raw.SecondaryDamage ?? null,
    has_keys: hasKeys,
    title_type: titleType,
    current_bid_usd: raw.CurrentBid ?? null,
    buy_now_usd: raw.BuyItNow ?? null,
    sale_date: saleDate,
    sale_status: null,
    auction_yard: raw.BranchName ?? null,
    state: raw.State ?? null,
    zip: raw.Zip ?? null,
    estimated_repair_usd: null,
    acv_usd: null,
  };
}
