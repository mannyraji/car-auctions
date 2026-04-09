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
  currentBid?: number;
  buyNowPrice?: number;
  saleDate?: string;
  saleStatus?: string;
  finalBid?: number;
  branchName?: string;
  branchZip?: string;
  latitude?: number;
  longitude?: number;
  imageUrls?: Record<string, unknown> | string[];
  detailUrl?: string;
  seller?: string;
  [key: string]: unknown;
}

/** Sold history entry */
export interface IaaiSoldEntry {
  stockNumber: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  finalBid: number | null;
  saleDate: string;
  location: string;
  damage: string;
  titleType: string;
  odometer: number | null;
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

/** Result wrapper returned by IaaiClient methods, includes cache provenance metadata. */
export interface ScraperResult<T> {
  data: T;
  /** Whether data came from cache (fresh or stale). */
  cached: boolean;
  /** Whether the cached entry is expired (stale fallback). */
  stale: boolean;
  /** ISO timestamp when data was cached; null if freshly scraped. */
  cachedAt: string | null;
}
