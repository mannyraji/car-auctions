/**
 * DOM/JSON → typed data transformations for Copart responses
 */
import { normalizeCopart } from '@car-auctions/shared';
import type { AuctionListing, CopartRawListing } from '@car-auctions/shared';
import type { CopartRawLotData, CopartSoldEntry } from '../types/index.js';

function isLotObject(item: unknown): item is CopartRawLotData {
  return typeof item === 'object' && item !== null;
}

/** Parse raw search API response into CopartRawLotData array */
export function parseSearchResults(raw: unknown): CopartRawLotData[] {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw.filter(isLotObject);

  const data = raw as Record<string, unknown>;

  // Unwrap top-level `data` wrapper if present
  const dataLevel = (
    typeof data['data'] === 'object' && data['data'] !== null ? data['data'] : data
  ) as Record<string, unknown>;

  // Handle { content: [...] } directly
  if (Array.isArray(dataLevel['content'])) {
    return (dataLevel['content'] as unknown[]).filter(isLotObject);
  }
  if (Array.isArray(dataLevel['lots'])) {
    return (dataLevel['lots'] as unknown[]).filter(isLotObject);
  }

  // Handle { results: [...] } or { results: { content: [...] } }
  const results = dataLevel['results'];
  if (Array.isArray(results)) return results.filter(isLotObject);
  if (results && typeof results === 'object') {
    const r = results as Record<string, unknown>;
    if (Array.isArray(r['content'])) return (r['content'] as unknown[]).filter(isLotObject);
    if (Array.isArray(r['results'])) return (r['results'] as unknown[]).filter(isLotObject);
    if (Array.isArray(r['lots'])) return (r['lots'] as unknown[]).filter(isLotObject);
  }

  return [];
}

/** Parse single listing API response */
export function parseListing(raw: unknown): CopartRawLotData | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const lot = (data['data'] ?? data['lot'] ?? data) as CopartRawLotData;
  if (!lot || typeof lot !== 'object') return null;
  return lot;
}

/** Parse sold history API response */
export function parseSoldHistory(raw: unknown): CopartSoldEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;

  // Unwrap top-level `data` wrapper
  const dataLevel = (
    typeof data['data'] === 'object' && data['data'] !== null ? data['data'] : data
  ) as Record<string, unknown>;

  // Find the results array
  let items: unknown[] | null = null;
  if (Array.isArray(dataLevel['results'])) {
    items = dataLevel['results'];
  } else if (Array.isArray(dataLevel['content'])) {
    items = dataLevel['content'];
  } else if (Array.isArray(dataLevel['lots'])) {
    items = dataLevel['lots'];
  }

  if (!items) return [];
  return items
    .filter((item): item is CopartRawLotData => typeof item === 'object' && item !== null)
    .map((item) => ({
      lotNumber: String(item['lotNumberStr'] ?? item['ln'] ?? ''),
      vin: String(item['fv'] ?? ''),
      year: Number(item['lcy'] ?? 0),
      make: String(item['mkn'] ?? ''),
      model: String(item['mdn'] ?? ''),
      finalBid: item['fb'] != null ? Number(item['fb']) : null,
      saleDate: String(item['sd'] ?? ''),
      location: String(item['ld'] ?? ''),
      damage: String(item['dd'] ?? ''),
      titleType: String(item['tmtp'] ?? ''),
      odometer: item['orr'] != null ? Number(item['orr']) : null,
    }));
}

/** Parse image URLs from lot data */
export function parseImageUrls(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const data = raw as Record<string, unknown>;

  const tims = data['tims'];
  if (Array.isArray(tims)) {
    return tims.filter((u): u is string => typeof u === 'string');
  }
  if (tims && typeof tims === 'object') {
    const timsObj = tims as Record<string, unknown>;
    return Object.values(timsObj)
      .filter((v): v is string => typeof v === 'string')
      .filter((v) => v.startsWith('http'));
  }

  const imgUrl = data['imgUrl'];
  if (typeof imgUrl === 'string') return [imgUrl];

  return [];
}

/** Convert CopartRawLotData to normalized AuctionListing */
export function toAuctionListing(raw: CopartRawLotData): AuctionListing {
  const listing: CopartRawListing = {
    ...raw,
    // CopartRawListing.fb is number|undefined; our local type allows null — normalize here
    fb: raw.fb ?? undefined,
    lotNumberStr: String(raw['lotNumberStr'] ?? raw['ln'] ?? ''),
  };
  return normalizeCopart(listing);
}

/** Convert an array of raw lots to normalized AuctionListings */
export function toAuctionListings(raws: CopartRawLotData[]): AuctionListing[] {
  return raws.map(toAuctionListing);
}
