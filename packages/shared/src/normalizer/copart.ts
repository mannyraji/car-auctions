/**
 * Copart auction listing normalizer
 *
 * Converts raw Copart API JSON to the normalized AuctionListing shape.
 * Pure function — never throws. Missing/unknown fields use sensible defaults.
 */
import type { AuctionListing, CopartRawListing } from '../types/index.js';

/**
 * Normalize a raw Copart API response to an AuctionListing.
 *
 * @example
 * const listing = normalizeCopart(rawJson);
 * console.log(listing.source); // 'copart'
 */
export function normalizeCopart(raw: CopartRawListing): AuctionListing {
  // Extract image URLs from tims object or array
  const imageUrls = extractCopartImages(raw.tims);

  // has_keys: "Yes" (case-insensitive) → true, anything else → false
  const hasKeys = typeof raw.htsmn === 'string' ? raw.htsmn.toLowerCase() === 'yes' : false;

  return {
    source: 'copart',
    lot_number: String(raw.lotNumberStr ?? raw.ln ?? ''),
    vin: String(raw.fv ?? ''),
    year: typeof raw.lcy === 'number' ? raw.lcy : 0,
    make: String(raw.mkn ?? ''),
    model: String(raw.mdn ?? ''),
    trim: null,
    title_type: String(raw.tmtp ?? ''),
    title_code: raw.tmtp != null ? String(raw.tmtp) : null,
    damage_primary: String(raw.dd ?? ''),
    damage_secondary: raw.sdd != null ? String(raw.sdd) : null,
    has_keys: hasKeys,
    odometer: typeof raw.orr === 'number' ? raw.orr : null,
    odometer_status: null,
    color: raw.clr != null ? String(raw.clr) : null,
    engine: raw.egn != null ? String(raw.egn) : null,
    transmission: raw.tsmn != null ? String(raw.tsmn) : null,
    drive_type: raw.driveType != null ? String(raw.driveType) : null,
    fuel_type: null,
    cylinders: null,
    current_bid:
      raw.dynamicLotDetails?.currentBid != null ? Number(raw.dynamicLotDetails.currentBid) : null,
    buy_now_price: raw.bn != null ? Number(raw.bn) : null,
    sale_date: raw.sd != null ? String(raw.sd) : null,
    sale_status: String(raw.ss ?? 'UPCOMING'),
    final_bid: raw.fb != null ? Number(raw.fb) : null,
    location: String(raw.ld ?? ''),
    latitude: raw.lat != null ? Number(raw.lat) : null,
    longitude: raw.lng != null ? Number(raw.lng) : null,
    image_url: imageUrls.length > 0 ? imageUrls[0] : raw.imgUrl != null ? String(raw.imgUrl) : null,
    image_urls: imageUrls,
    detail_url: String(raw.du ?? ''),
    seller: raw.slr != null ? String(raw.slr) : null,
    grid_row: null,
    fetched_at: new Date().toISOString(),
  };
}

function extractCopartImages(tims: CopartRawListing['tims']): string[] {
  if (!tims) return [];
  if (Array.isArray(tims)) {
    return tims.filter((u): u is string => typeof u === 'string');
  }
  if (typeof tims === 'object') {
    return Object.values(tims).filter((v): v is string => typeof v === 'string');
  }
  return [];
}
