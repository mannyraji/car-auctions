/**
 * @file src/normalizer/iaai.ts
 * @description IAAI raw listing → AuctionListing field mapping.
 * INTERNAL — not re-exported from normalizer/index.ts or src/index.ts.
 */

import type { AuctionListing, IaaiRawListing } from '../types/index.js';
import { titleCodeToLabel } from './codes.js';

/**
 * Maps IAAI odometerUnit to AuctionListing odometer_status enum.
 * IAAI uses unit strings, not brand codes like Copart.
 */
function mapOdometerUnit(
  unit: string
): AuctionListing['odometer_status'] {
  const normalized = (unit ?? '').toUpperCase();
  if (normalized === 'EXEMPT') return 'exempt';
  if (normalized === 'NOT ACTUAL') return 'not_actual';
  if (normalized === 'EXCEEDS LIMIT') return 'exceeds_limit';
  return 'actual';
}

/**
 * Coerces IAAI hasKeys string ("YES" / "NO") to boolean.
 * Any value other than "YES" (case-insensitive) returns false.
 */
function coerceHasKeys(value: string): boolean {
  return String(value ?? '').toUpperCase() === 'YES';
}

/**
 * Converts a raw IAAI API response into a normalized AuctionListing.
 *
 * @param raw - Raw IAAI listing object
 * @returns Normalized AuctionListing
 */
export function normalizeIaaiListing(raw: IaaiRawListing): AuctionListing {
  const thumbnailUrl =
    Array.isArray(raw.images) && raw.images.length > 0
      ? raw.images[0]?.url ?? ''
      : '';

  const stockNumber = String(raw.stockNumber ?? '');

  return {
    source: 'iaai',
    lot_number: stockNumber,
    title: `${raw.year ?? ''} ${raw.makeName ?? ''} ${raw.modelName ?? ''}`.trim(),
    vin: String(raw.vin ?? ''),
    year: Number(raw.year ?? 0),
    make: String(raw.makeName ?? ''),
    model: String(raw.modelName ?? ''),
    trim: raw.trim ? String(raw.trim) : undefined,
    damage_primary: String(raw.primaryDamage ?? ''),
    damage_secondary: raw.secondaryDamage ? String(raw.secondaryDamage) : undefined,
    has_keys: coerceHasKeys(raw.hasKeys),
    odometer: Number(raw.odometerReading ?? 0),
    odometer_status: mapOdometerUnit(String(raw.odometerUnit ?? '')),
    drive_type: String(raw.driveType ?? ''),
    fuel_type: String(raw.fuelType ?? ''),
    engine: String(raw.engine ?? ''),
    transmission: String(raw.transmission ?? ''),
    color: String(raw.color ?? ''),
    current_bid: Number(raw.currentBid ?? 0),
    buy_it_now: raw.buyNowPrice !== undefined ? Number(raw.buyNowPrice) : undefined,
    sale_date: String(raw.saleDate ?? new Date().toISOString()),
    sale_status: 'upcoming',
    location: String(raw.branch ?? ''),
    location_zip: String(raw.zipCode ?? ''),
    thumbnail_url: thumbnailUrl,
    listing_url: stockNumber
      ? `https://www.iaai.com/vehicle/${stockNumber}`
      : '',
    body_style: raw.bodyStyle ? String(raw.bodyStyle) : undefined,
    cylinders: raw.cylinders !== undefined ? Number(raw.cylinders) : undefined,
    retail_value: raw.retailValue !== undefined ? Number(raw.retailValue) : undefined,
    title_type: titleCodeToLabel(String(raw.titleCode ?? '')),
    title_state: raw.titleState ? String(raw.titleState) : undefined,
    image_count: Array.isArray(raw.images) ? raw.images.length : undefined,
  };
}
