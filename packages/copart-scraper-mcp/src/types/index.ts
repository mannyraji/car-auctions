/** Search parameters for Copart */
export interface CopartSearchParams {
  query: string;
  year_min?: number;
  year_max?: number;
  make?: string;
  model?: string;
  zip?: string;
  radius?: number;
  limit?: number;
}

/** Raw search result from Copart */
export interface CopartSearchResult {
  lots: CopartRawLotData[];
  totalCount: number;
  page: number;
  pageSize: number;
}

/** Copart raw lot from API */
export interface CopartRawLotData {
  lotNumberStr?: string;
  ln?: string;
  mkn?: string;
  mdn?: string;
  lcy?: number;
  dd?: string;
  sdd?: string;
  tims?: Record<string, unknown> | string[];
  dynamicLotDetails?: { currentBid?: number; [key: string]: unknown };
  fv?: string;
  ld?: string;
  tmtp?: string;
  orr?: number;
  clr?: string;
  egn?: string;
  tsmn?: string;
  htsmn?: string;
  bn?: number;
  sd?: string;
  ss?: string;
  fb?: number | null;
  lat?: number;
  lng?: number;
  imgUrl?: string;
  du?: string;
  slr?: string;
  [key: string]: unknown;
}

/** Sold history entry */
export interface CopartSoldEntry {
  lotNumber: string;
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
export interface CopartSoldParams {
  make: string;
  model: string;
  year_min?: number;
  year_max?: number;
  limit?: number;
}

/** Watchlist entry */
export interface WatchlistEntry {
  lot_number: string;
  source: string;
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

/** Image result */
export interface CopartImageResult {
  lot_number: string;
  images: CopartImageEntry[];
}

export interface CopartImageEntry {
  url: string;
  category: string;
  base64: string | null;
}

/** Result wrapper returned by CopartClient methods, includes cache provenance metadata. */
export interface ScraperResult<T> {
  data: T;
  /** Whether data came from cache (fresh or stale). */
  cached: boolean;
  /** Whether the cached entry is expired (stale fallback). */
  stale: boolean;
  /** ISO timestamp when data was cached; null if freshly scraped. */
  cachedAt: string | null;
}
