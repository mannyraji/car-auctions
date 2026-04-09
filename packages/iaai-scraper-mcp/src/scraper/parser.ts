/**
 * DOM/JSON → typed data transformations for IAAI responses
 */
import { ScraperError } from '@car-auctions/shared';
import type { Page } from 'playwright';
import type { IaaiRawStockData, IaaiSoldEntry, SoldHistoryResponse } from '../types/index.js';

function isStockDataObject(item: unknown): item is IaaiRawStockData {
  return typeof item === 'object' && item !== null;
}

/**
 * Parse raw /inventorySearch API response into IaaiRawStockData array.
 * Throws ScraperError on malformed input.
 */
export function parseSearchResults(raw: unknown): IaaiRawStockData[] {
  if (!raw || typeof raw !== 'object') {
    throw new ScraperError('parseSearchResults: invalid input — expected object', 'SCRAPER_ERROR');
  }
  if (Array.isArray(raw)) return raw.filter(isStockDataObject);

  const data = raw as Record<string, unknown>;

  // IAAI search responses wrap items under `items` key
  if (Array.isArray(data['items'])) {
    return (data['items'] as unknown[]).filter(isStockDataObject);
  }
  if (Array.isArray(data['results'])) {
    return (data['results'] as unknown[]).filter(isStockDataObject);
  }

  return [];
}

/**
 * Parse raw /stockDetails API response into IaaiRawStockData.
 * Maps detail-only fields (conditionGradeDisplay, lossType, startCode, bodyStyle, series, runnable)
 * into the `grid_row` sub-object for downstream normalization.
 * Throws ScraperError on malformed input.
 */
export function parseListingDetail(raw: unknown): IaaiRawStockData {
  if (!raw || typeof raw !== 'object') {
    throw new ScraperError('parseListingDetail: invalid input — expected object', 'SCRAPER_ERROR');
  }

  const data = raw as Record<string, unknown>;
  // Unwrap stockDetails/vehicle wrappers
  const item = (data['stockDetails'] ?? data['vehicle'] ?? data) as Record<string, unknown>;

  const detailFields: Record<string, unknown> = {};
  for (const key of [
    'conditionGradeDisplay',
    'lossType',
    'startCode',
    'bodyStyle',
    'series',
    'runnable',
  ]) {
    if (item[key] !== undefined) detailFields[key] = item[key];
  }

  return {
    ...item,
    grid_row: Object.keys(detailFields).length > 0 ? detailFields : undefined,
  } as IaaiRawStockData;
}

/**
 * Parse raw sold vehicles endpoint response into IaaiSoldEntry array.
 * Preserves null for missing finalBid.
 */
export function parseSoldResults(raw: unknown): IaaiSoldEntry[] {
  if (!raw || typeof raw !== 'object') {
    throw new ScraperError('parseSoldResults: invalid input — expected object', 'SCRAPER_ERROR');
  }

  const data = raw as Record<string, unknown>;
  let items: unknown[] | null = null;

  if (Array.isArray(data['items'])) {
    items = data['items'];
  } else if (Array.isArray(data['results'])) {
    items = data['results'];
  } else if (Array.isArray(raw)) {
    items = raw as unknown[];
  }

  if (!items) return [];

  return items
    .filter((item): item is IaaiRawStockData => typeof item === 'object' && item !== null)
    .map((item) => ({
      lot_number: String(item.stockNumber ?? ''),
      sale_date: String(item.saleDate ?? ''),
      final_bid: item.finalBid != null ? Number(item.finalBid) : null,
      damage_primary: String(item.primaryDamage ?? ''),
      odometer: item.odometer != null ? parseInt(String(item.odometer), 10) || null : null,
      title_type: String(item.titleCode ?? ''),
    }));
}

/**
 * Compute aggregate statistics from a list of sold entries.
 * Lots where final_bid is null are excluded from all calculations.
 * Returns all zeros when no valid entries exist.
 */
export function computeAggregates(entries: IaaiSoldEntry[]): SoldHistoryResponse['aggregates'] {
  const bids = entries.map((e) => e.final_bid).filter((b): b is number => b !== null);

  if (bids.length === 0) {
    return {
      count: 0,
      avg_final_bid: 0,
      median_final_bid: 0,
      price_range: { low: 0, high: 0 },
    };
  }

  const sorted = [...bids].sort((a, b) => a - b);
  const avg = bids.reduce((sum, b) => sum + b, 0) / bids.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);

  return {
    count: bids.length,
    avg_final_bid: Math.round(avg * 100) / 100,
    median_final_bid: median,
    price_range: { low: sorted[0] ?? 0, high: sorted[sorted.length - 1] ?? 0 },
  };
}

/**
 * Extract image URLs from a raw IAAI stock data object.
 * Handles both array and keyed-object imageUrls formats.
 */
export function extractImageUrls(raw: IaaiRawStockData): string[] {
  const { imageUrls } = raw;
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

/**
 * DOM fallback parser when network interception fails.
 * Attempts to extract embedded JSON from page scripts.
 */
export async function parseDomSearch(page: Page): Promise<IaaiRawStockData[]> {
  try {
    const raw = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const text = s.textContent ?? '';
        if (text.includes('stockNumber') || text.includes('inventoryItems')) {
          const match =
            text.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s) ??
            text.match(/inventoryItems\s*[:=]\s*(\[.*?\])/s) ??
            text.match(/(\[.*?"stockNumber".*?\])/s);
          if (match?.[1]) {
            try {
              return JSON.parse(match[1]);
            } catch {
              // continue
            }
          }
        }
      }
      return null;
    });

    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(isStockDataObject);
    return parseSearchResults(raw);
  } catch {
    return [];
  }
}
