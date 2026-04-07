/**
 * @file src/normalizer/copart.ts
 * @description Copart raw listing → AuctionListing field mapping.
 * INTERNAL — not re-exported from normalizer/index.ts or src/index.ts.
 */

import type { AuctionListing, CopartRawListing } from '../types/index.js';

/**
 * Maps Copart odometerBrand string to AuctionListing odometer_status enum.
 */
function mapOdometerBrand(
  brand: string
): AuctionListing['odometer_status'] {
  const normalized = (brand ?? '').toUpperCase();
  if (normalized === 'EXEMPT') return 'exempt';
  if (normalized === 'NOT ACTUAL' || normalized === 'NOTACTUAL') return 'not_actual';
  if (normalized === 'EXCEEDS MECHANICAL LIMITS' || normalized === 'EXCEEDSLIMIT') {
    return 'exceeds_limit';
  }
  return 'actual';
}

/**
 * Converts a raw Copart API response into a normalized AuctionListing.
 *
 * @param raw - Raw Copart listing object
 * @returns Normalized AuctionListing
 */
export function normalizeCopartListing(raw: CopartRawListing): AuctionListing {
  const thumbnailUrl =
    Array.isArray(raw.tims?.full) && raw.tims.full.length > 0
      ? raw.tims.full[0]
      : '';

  const lotNumber = String(raw.lotNumberStr ?? '');

  return {
    source: 'copart',
    lot_number: lotNumber,
    title: `${raw.lcy ?? ''} ${raw.mkn ?? ''} ${raw.mmod ?? ''}`.trim(),
    vin: String(raw.vin ?? ''),
    year: Number(raw.lcy ?? 0),
    make: String(raw.mkn ?? ''),
    model: String(raw.mmod ?? ''),
    trim: raw.ltrim ? String(raw.ltrim) : undefined,
    damage_primary: String(raw.dd ?? ''),
    damage_secondary: raw.sdd ? String(raw.sdd) : undefined,
    has_keys: Boolean(raw.hk),
    odometer: Number(raw.orr ?? 0),
    odometer_status: mapOdometerBrand(String(raw.odometerBrand ?? '')),
    drive_type: String(raw.drv ?? ''),
    fuel_type: String(raw.fuel ?? ''),
    engine: String(raw.eng ?? ''),
    transmission: String(raw.trans ?? ''),
    color: String(raw.clr ?? ''),
    current_bid: Number(raw.dynamicBidAmount ?? 0),
    buy_it_now: raw.bin !== undefined ? Number(raw.bin) : undefined,
    sale_date: (raw.ad && String(raw.ad).trim()) ? String(raw.ad) : new Date().toISOString(),
    sale_status: 'upcoming',
    location: String(raw.la ?? ''),
    location_zip: String(raw.zip ?? ''),
    thumbnail_url: thumbnailUrl,
    listing_url: lotNumber
      ? `https://www.copart.com/lot/${lotNumber}`
      : '',
    body_style: raw.bstyl ? String(raw.bstyl) : undefined,
    cylinders: raw.cyl !== undefined ? Number(raw.cyl) : undefined,
    retail_value: raw.est !== undefined ? Number(raw.est) : undefined,
    title_type: raw.tt ? String(raw.tt) : undefined,
    title_state: raw.ts ? String(raw.ts) : undefined,
    seller: raw.seller ? String(raw.seller) : undefined,
    image_count: Array.isArray(raw.tims?.full) ? raw.tims.full.length : undefined,
  };
}
