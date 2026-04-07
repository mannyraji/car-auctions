/**
 * IAAI auction listing normalizer
 *
 * Converts raw IAAI API JSON to the normalized AuctionListing shape.
 * Pure function — never throws. Unknown title codes map to "Unknown" with a warning.
 */
import type { AuctionListing, IaaiRawListing } from '../types/index.js';

const TITLE_CODE_MAP: Record<string, string> = {
  SV: 'Salvage',
  CL: 'Clean',
  RB: 'Rebuilt',
  FL: 'Flood',
  NR: 'Non-Repairable',
  JK: 'Junk',
  MV: 'Manufacturer Buyback',
};

/**
 * Normalize a raw IAAI API response to an AuctionListing.
 *
 * @example
 * const listing = normalizeIaai(rawJson);
 * console.log(listing.source); // 'iaai'
 */
export function normalizeIaai(raw: IaaiRawListing): AuctionListing {
  const titleCode = raw.titleCode != null ? String(raw.titleCode) : null;
  const titleType = resolveTitleType(titleCode);

  const hasKeys = typeof raw.hasKeys === 'string' ? raw.hasKeys.toUpperCase() === 'YES' : false;

  const odometer = parseOdometer(raw.odometer);
  const cylinders = raw.cylinders != null ? parseIntOrNull(String(raw.cylinders)) : null;
  const imageUrls = extractIaaiImages(raw.imageUrls);

  return {
    source: 'iaai',
    lot_number: String(raw.stockNumber ?? ''),
    vin: String(raw.vin ?? ''),
    year: typeof raw.year === 'number' ? raw.year : 0,
    make: String(raw.makeName ?? ''),
    model: String(raw.modelName ?? ''),
    trim: raw.trimLevel != null ? String(raw.trimLevel) : null,
    title_type: titleType,
    title_code: titleCode,
    damage_primary: String(raw.primaryDamage ?? ''),
    damage_secondary: raw.secondaryDamage != null ? String(raw.secondaryDamage) : null,
    has_keys: hasKeys,
    odometer: odometer,
    odometer_status: raw.odometerBrand != null ? String(raw.odometerBrand) : null,
    color: raw.color != null ? String(raw.color) : null,
    engine: raw.engineSize != null ? String(raw.engineSize) : null,
    transmission: raw.transmission != null ? String(raw.transmission) : null,
    drive_type: raw.driveType != null ? String(raw.driveType) : null,
    fuel_type: raw.fuelType != null ? String(raw.fuelType) : null,
    cylinders: cylinders,
    current_bid: raw.currentBid != null ? Number(raw.currentBid) : null,
    buy_now_price: raw.buyNowPrice != null ? Number(raw.buyNowPrice) : null,
    sale_date: raw.saleDate != null ? String(raw.saleDate) : null,
    sale_status: String(raw.saleStatus ?? 'UPCOMING'),
    final_bid: raw.finalBid != null ? Number(raw.finalBid) : null,
    location: String(raw.branchName ?? ''),
    latitude: raw.latitude != null ? Number(raw.latitude) : null,
    longitude: raw.longitude != null ? Number(raw.longitude) : null,
    image_url: imageUrls.length > 0 ? imageUrls[0] : null,
    image_urls: imageUrls,
    detail_url: String(raw.detailUrl ?? ''),
    seller: raw.seller != null ? String(raw.seller) : null,
    grid_row: null,
    fetched_at: new Date().toISOString(),
  };
}

function resolveTitleType(code: string | null): string {
  if (code == null) return 'Unknown';
  const mapped = TITLE_CODE_MAP[code.toUpperCase()];
  if (mapped) return mapped;
  console.warn(`[normalizeIaai] Unknown title code: "${code}" — defaulting to "Unknown"`);
  return 'Unknown';
}

function parseOdometer(value: string | number | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function parseIntOrNull(value: string): number | null {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function extractIaaiImages(imageUrls: IaaiRawListing['imageUrls']): string[] {
  if (!imageUrls) return [];
  if (Array.isArray(imageUrls)) {
    return imageUrls.filter((u): u is string => typeof u === 'string');
  }
  if (typeof imageUrls === 'object') {
    const urls: string[] = [];
    for (const val of Object.values(imageUrls)) {
      if (Array.isArray(val)) {
        urls.push(...val.filter((u): u is string => typeof u === 'string'));
      } else if (typeof val === 'string') {
        urls.push(val);
      }
    }
    return urls;
  }
  return [];
}
