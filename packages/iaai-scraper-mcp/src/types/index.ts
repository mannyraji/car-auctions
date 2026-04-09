/** Search parameters for IAAI */
export interface IaaiSearchParams {
  query: string;
  year_min?: number;
  year_max?: number;
  make?: string;
  model?: string;
  zip?: string;
  radius?: number;
  limit?: number;
}

/** Raw search result from IAAI */
export interface IaaiSearchResult {
  items: IaaiRawStockData[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** IAAI raw stock data from API */
export interface IaaiRawStockData {
  stockNumber?: string;
  vin?: string;
  year?: number;
  makeName?: string;
  modelName?: string;
  trimLevel?: string;
  titleCode?: string;
  primaryDamage?: string;
  secondaryDamage?: string;
  hasKeys?: string;
  odometer?: string | number;
  odometerBrand?: string;
  color?: string;
  engineSize?: string;
  transmission?: string;
  driveType?: string;
  fuelType?: string;
  cylinders?: string | number;
  currentBid?: number | null;
  buyNowPrice?: number | null;
  saleDate?: string | null;
  saleStatus?: string;
  finalBid?: number | null;
  branchName?: string;
  branchZip?: string | number;
  latitude?: number;
  longitude?: number;
  imageUrls?: Record<string, unknown> | string[];
  detailUrl?: string;
  seller?: string;
  conditionGradeDisplay?: string;
  lossType?: string;
  highlights?: string[];
  startCode?: string;
  bodyStyle?: string;
  series?: string;
  runnable?: boolean | string;
  [key: string]: unknown;
}

/** Sold history entry (normalized, snake_case contract fields) */
export interface IaaiSoldEntry {
  lot_number: string;
  sale_date: string;
  final_bid: number | null;
  damage_primary: string;
  odometer: number | null;
  title_type: string;
}

/** Sold history response with computed aggregate metrics. */
export interface SoldHistoryResponse {
  lots: IaaiSoldEntry[];
  aggregates: {
    count: number;
    avg_final_bid: number;
    median_final_bid: number;
    price_range: {
      low: number;
      high: number;
    };
  };
}

/** Sold history query params */
export interface IaaiSoldParams {
  make: string;
  model: string;
  year_min?: number;
  year_max?: number;
  limit?: number;
}

/** Image result */
export interface IaaiImageResult {
  stock_number: string;
  images: IaaiImageEntry[];
}

export interface IaaiImageEntry {
  url: string;
  category: string;
  base64: string | null;
}

/** Watchlist row for IAAI lots persisted in SQLite. */
export interface WatchlistEntry {
  lot_number: string;
  source: 'iaai';
  added_at: string;
  bid_threshold: number | null;
  last_checked_at: string | null;
  last_bid: number | null;
  last_status: string | null;
  notes: string | null;
}

/** Watchlist history entry */
export interface WatchlistHistoryEntry {
  id: number;
  lot_number: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
}

/** Params for watchlist add */
export interface WatchlistAddParams {
  lot_number: string;
  bid_threshold?: number;
  notes?: string;
}

/** Options for getImages */
export interface IaaiGetImagesOpts {
  maxImages?: number;
  imageTypes?: string[];
}

/** Persisted IAAI session state used for auth restoration. */
export interface IaaiSession {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    [key: string]: unknown;
  }>;
  localStorage: Record<string, Record<string, string>>;
  savedAt: string;
}

/** Runtime config shape — single source of truth is the Zod schema in utils/config.ts. */
export type { IaaiConfig } from '../utils/config.js';

/** Result wrapper returned by IaaiClient methods, includes cache provenance metadata. */
export interface ScraperResult<T> {
  data: T;
  /** Whether data came from cache (fresh or stale). */
  cached: boolean;
  /** Whether the cached entry is expired (stale fallback). */
  stale: boolean;
  /** ISO timestamp when data was cached; null if freshly scraped. */
  cachedAt: string | null;
  /** Whether the result is partial (some images missing). Only used by getImages. */
  partial?: boolean;
}
