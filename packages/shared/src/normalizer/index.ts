/**
 * @file src/normalizer/index.ts
 * @description Public exports for the auction normalizer module.
 *
 * Only normalizeCopart and normalizeIaai are exported.
 * Internal modules (codes.ts, copart.ts, iaai.ts) are NOT re-exported.
 */

import type { AuctionListing, CopartRawListing, IaaiRawListing } from '../types/index.js';
import { normalizeCopartListing } from './copart.js';
import { normalizeIaaiListing } from './iaai.js';

/**
 * Converts a raw Copart API response into a normalized AuctionListing.
 *
 * Field mapping: lotNumberStr→lot_number, mkn→make, mmod→model, lcy→year,
 * dd→damage_primary, sdd→damage_secondary, orr→odometer, hk→has_keys,
 * dynamicBidAmount→current_bid, ad→sale_date, la→location, tims.full[0]→thumbnail_url.
 *
 * Unknown or missing fields degrade gracefully — never throws on unexpected input.
 *
 * @param raw - Raw Copart API response object
 * @returns Normalized AuctionListing
 * @example
 * const listing = normalizeCopart(rawCopartData);
 * // listing.source === 'copart'
 * // listing.has_keys === true (boolean from raw boolean hk field)
 */
export function normalizeCopart(raw: CopartRawListing): AuctionListing {
  return normalizeCopartListing(raw);
}

/**
 * Converts a raw IAAI API response into a normalized AuctionListing.
 *
 * Includes type coercions: hasKeys "YES"/"NO" → boolean, titleCode → human-readable label
 * via TITLE_CODE_MAP (SV→Salvage, CL→Clean, RB→Rebuilt; unknown→"Unknown" + warn).
 *
 * Unknown or missing fields degrade gracefully — never throws on unexpected input.
 *
 * @param raw - Raw IAAI API response object
 * @returns Normalized AuctionListing
 * @example
 * const listing = normalizeIaai(rawIaaiData);
 * // listing.source === 'iaai'
 * // listing.has_keys === true (coerced from "YES")
 * // listing.title_type === 'Salvage' (from titleCode "SV")
 */
export function normalizeIaai(raw: IaaiRawListing): AuctionListing {
  return normalizeIaaiListing(raw);
}
