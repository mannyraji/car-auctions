/**
 * DOM/JSON → typed data transformations for IAAI responses
 */
import type { Page } from 'playwright';
import { ScraperError } from '@car-auctions/shared';
import type { IaaiRawStockData, IaaiSoldEntry, SoldHistoryResponse } from '../types/index.js';

// ─── Type guards ─────────────────────────────────────────────────────────────

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isStockObject(item: unknown): item is IaaiRawStockData {
  return typeof item === 'object' && item !== null;
}

// ─── parseSearchResults ──────────────────────────────────────────────────────

/**
 * Parse raw /inventorySearch payload into IaaiRawStockData array.
 * Throws ScraperError on malformed or missing input.
 */
export function parseSearchResults(raw: unknown): IaaiRawStockData[] {
  if (raw === null || raw === undefined) {
    throw new ScraperError('parseSearchResults: received null/undefined payload');
  }
  if (typeof raw !== 'object') {
    throw new ScraperError(`parseSearchResults: expected object, got ${typeof raw}`);
  }

  // Direct array
  if (Array.isArray(raw)) {
    return raw.filter(isStockObject);
  }

  const data = raw as Record<string, unknown>;

  // IAAI standard: top-level "items" key
  if (Array.isArray(data['items'])) {
    return (data['items'] as unknown[]).filter(isStockObject);
  }

  // Unwrap optional top-level "data" wrapper
  const dataLevel = isPlainObject(data['data']) ? (data['data'] as Record<string, unknown>) : data;

  if (Array.isArray(dataLevel['items'])) {
    return (dataLevel['items'] as unknown[]).filter(isStockObject);
  }
  if (Array.isArray(dataLevel['results'])) {
    return (dataLevel['results'] as unknown[]).filter(isStockObject);
  }
  if (Array.isArray(dataLevel['content'])) {
    return (dataLevel['content'] as unknown[]).filter(isStockObject);
  }
  if (Array.isArray(dataLevel['lots'])) {
    return (dataLevel['lots'] as unknown[]).filter(isStockObject);
  }

  // Nested results object
  const results = dataLevel['results'];
  if (isPlainObject(results)) {
    const r = results as Record<string, unknown>;
    if (Array.isArray(r['items'])) return (r['items'] as unknown[]).filter(isStockObject);
    if (Array.isArray(r['content'])) return (r['content'] as unknown[]).filter(isStockObject);
    if (Array.isArray(r['lots'])) return (r['lots'] as unknown[]).filter(isStockObject);
  }

  throw new ScraperError('parseSearchResults: could not locate items array in payload');
}

// ─── parseListingDetail ──────────────────────────────────────────────────────

/** Detail-only fields that get aggregated into grid_row */
const DETAIL_FIELDS = [
  'conditionGradeDisplay',
  'lossType',
  'highlights',
  'startCode',
  'bodyStyle',
  'series',
  'runnable',
] as const;

/**
 * Parse raw /stockDetails payload into IaaiRawStockData.
 * Maps detail-only fields (conditionGradeDisplay, lossType, highlights, startCode,
 * bodyStyle, series, runnable) into the grid_row catch-all field.
 * Throws ScraperError on malformed payload.
 */
export function parseListingDetail(raw: unknown): IaaiRawStockData {
  if (raw === null || raw === undefined) {
    throw new ScraperError('parseListingDetail: received null/undefined payload');
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ScraperError(`parseListingDetail: expected object, got ${typeof raw}`);
  }

  const data = raw as Record<string, unknown>;

  // Unwrap optional data/lot/stockDetails wrappers
  let stock: Record<string, unknown>;
  if (isPlainObject(data['data'])) {
    stock = data['data'] as Record<string, unknown>;
  } else if (isPlainObject(data['lot'])) {
    stock = data['lot'] as Record<string, unknown>;
  } else if (isPlainObject(data['stockDetails'])) {
    stock = data['stockDetails'] as Record<string, unknown>;
  } else {
    stock = data;
  }

  if (!stock['stockNumber'] && !stock['vin']) {
    throw new ScraperError('parseListingDetail: payload missing required stockNumber or vin field');
  }

  // Build grid_row from detail-only fields present in the payload
  const grid_row: Record<string, unknown> = {};
  for (const field of DETAIL_FIELDS) {
    if (stock[field] !== undefined) {
      grid_row[field] = stock[field];
    }
  }

  return {
    ...stock,
    grid_row: Object.keys(grid_row).length > 0 ? grid_row : undefined,
  } as IaaiRawStockData;
}

// ─── parseSoldResults ────────────────────────────────────────────────────────

function parseOdometerValue(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse raw sold endpoint payload into IaaiSoldEntry array.
 * Preserves null for missing finalBid.
 * Throws ScraperError on malformed input.
 */
export function parseSoldResults(raw: unknown): IaaiSoldEntry[] {
  if (raw === null || raw === undefined) {
    throw new ScraperError('parseSoldResults: received null/undefined payload');
  }
  if (typeof raw !== 'object') {
    throw new ScraperError(`parseSoldResults: expected object, got ${typeof raw}`);
  }

  let items: IaaiRawStockData[];
  try {
    items = parseSearchResults(raw);
  } catch {
    throw new ScraperError('parseSoldResults: could not extract items from sold payload');
  }

  return items.map((item) => ({
    lot_number: String(item.stockNumber ?? ''),
    sale_date: item.saleDate != null ? String(item.saleDate) : '',
    final_bid: item.finalBid != null ? Number(item.finalBid) : null,
    damage_primary: String(item.primaryDamage ?? ''),
    odometer: parseOdometerValue(item.odometer),
    title_type: item.titleCode != null ? String(item.titleCode) : 'Unknown',
  }));
}

// ─── computeAggregates ───────────────────────────────────────────────────────

/**
 * Compute aggregate metrics from sold history entries.
 * Excludes null final_bid entries from avg/median/range calculations.
 * Returns all-zeros object when no valid (non-null) bids exist.
 */
export function computeAggregates(entries: IaaiSoldEntry[]): SoldHistoryResponse['aggregates'] {
  const validBids = entries.map((e) => e.final_bid).filter((b): b is number => b !== null);

  if (validBids.length === 0) {
    return {
      count: 0,
      avg_final_bid: 0,
      median_final_bid: 0,
      price_range: { low: 0, high: 0 },
    };
  }

  const count = validBids.length;
  const avg_final_bid = validBids.reduce((sum, b) => sum + b, 0) / count;

  const sorted = [...validBids].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median_final_bid =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

  return {
    count,
    avg_final_bid,
    median_final_bid,
    price_range: {
      low: sorted[0]!,
      high: sorted[sorted.length - 1]!,
    },
  };
}

// ─── extractImageUrls ────────────────────────────────────────────────────────

/**
 * Extract image URL strings from IaaiRawStockData.
 * Handles both array format and keyed-object format (research.md §4):
 *   - Array: ["url1", "url2", ...]
 *   - Object: { "exterior": ["url1", "url2"], "interior": ["url1"] }
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
        urls.push(...(val as unknown[]).filter((u): u is string => typeof u === 'string'));
      } else if (typeof val === 'string') {
        urls.push(val);
      }
    }
    return urls;
  }

  return [];
}

// ─── parseDomSearch ──────────────────────────────────────────────────────────

/**
 * DOM fallback when interception returns null (FR-003).
 * Scrapes the IAAI vehicle search results page for a limited field set:
 * lot_number, vin, year, make, model, damage_primary, current_bid, sale_date, location.
 * Returns partial data rather than throwing on schema changes.
 */
export async function parseDomSearch(page: Page): Promise<IaaiRawStockData[]> {
  return page.evaluate((): Array<Record<string, unknown>> => {
    function parseNumberFromText(text: string | null | undefined): number | null {
      if (!text) return null;
      const cleaned = text.replace(/[^0-9.]/g, '');
      const val = parseFloat(cleaned);
      return isNaN(val) ? null : val;
    }

    function textOf(el: Element | null): string | undefined {
      return el?.textContent?.trim() || undefined;
    }

    function attrOf(el: Element | null, attr: string): string | undefined {
      return el?.getAttribute(attr) || undefined;
    }

    // IAAI vehicle cards — try multiple known selector patterns
    const cards = Array.from(
      document.querySelectorAll(
        '[data-stock-number], .vehicle-card, .lot-card, .item-card, .search-result-item'
      )
    );

    return cards.reduce<Array<Record<string, unknown>>>((acc, card) => {
      const stockNumber =
        attrOf(card, 'data-stock-number') ?? textOf(card.querySelector('[data-stock-number]'));

      const vin =
        attrOf(card, 'data-vin') ?? textOf(card.querySelector('[data-vin], .vin-number, .vin'));

      // Skip cards with no identifying info
      if (!stockNumber && !vin) return acc;

      const yearText = textOf(card.querySelector('[data-year], .vehicle-year, .year'));
      const year = yearText ? parseInt(yearText, 10) || undefined : undefined;

      const make = textOf(card.querySelector('[data-make], .vehicle-make, .make'));
      const model = textOf(card.querySelector('[data-model], .vehicle-model, .model'));

      const bidText = textOf(card.querySelector('[data-bid], .current-bid, .bid-amount'));
      const currentBid = parseNumberFromText(bidText);

      const saleDate =
        attrOf(card.querySelector('[data-sale-date]'), 'data-sale-date') ??
        textOf(card.querySelector('.sale-date, .auction-date')) ??
        null;

      const branchName = textOf(card.querySelector('[data-location], .location, .branch-name'));

      const primaryDamage = textOf(card.querySelector('[data-damage], .damage, .primary-damage'));

      const detailAnchor = card.querySelector(
        'a[href*="/VehicleDetail"], a[href*="/vehicledetail"]'
      ) as HTMLAnchorElement | null;
      const detailUrl = detailAnchor?.href;

      acc.push({
        stockNumber,
        vin,
        year,
        makeName: make,
        modelName: model,
        currentBid,
        saleDate,
        branchName,
        primaryDamage,
        detailUrl,
      });

      return acc;
    }, []);
  }) as Promise<IaaiRawStockData[]>;
}
