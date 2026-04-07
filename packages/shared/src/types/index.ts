/**
 * @car-auctions/shared — Core type definitions
 *
 * All shared interfaces, types, and enumerations used across the monorepo.
 */

// ─── Auction listing types ────────────────────────────────────────────────────

/** Normalized, source-agnostic auction listing */
export interface AuctionListing {
  source: 'copart' | 'iaai';
  lot_number: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  title_type: string;
  title_code: string | null;
  damage_primary: string;
  damage_secondary: string | null;
  has_keys: boolean;
  odometer: number | null;
  odometer_status: string | null;
  color: string | null;
  engine: string | null;
  transmission: string | null;
  drive_type: string | null;
  fuel_type: string | null;
  cylinders: number | null;
  current_bid: number | null;
  buy_now_price: number | null;
  sale_date: string | null;
  sale_status: string;
  final_bid: number | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  image_url: string | null;
  image_urls: string[];
  detail_url: string;
  seller: string | null;
  grid_row: Record<string, unknown> | null;
  fetched_at: string;
}

/** Raw Copart API listing shape (partial — key fields) */
export interface CopartRawListing {
  lotNumberStr?: string;
  ln?: string; // lot number alternative
  mkn?: string; // make
  mdn?: string; // model
  lcy?: number; // year
  dd?: string; // damage_primary
  sdd?: string; // damage_secondary
  tims?: Record<string, unknown> | string[]; // images
  dynamicLotDetails?: {
    currentBid?: number;
    [key: string]: unknown;
  };
  fv?: string; // vin
  ld?: string; // location
  tmtp?: string; // title_type
  orr?: number; // odometer
  clr?: string; // color
  egn?: string; // engine
  tsmn?: string; // transmission
  htsmn?: string; // has_keys ("Yes"/"No")
  bn?: number; // buy_now_price
  sd?: string; // sale_date
  ss?: string; // sale_status
  fb?: number; // final_bid
  lat?: number;
  lng?: number;
  imgUrl?: string;
  du?: string; // detail_url
  slr?: string; // seller
  [key: string]: unknown;
}

/** Raw IAAI API listing shape (partial — key fields) */
export interface IaaiRawListing {
  stockNumber?: string;
  vin?: string;
  year?: number;
  makeName?: string;
  modelName?: string;
  trimLevel?: string;
  titleCode?: string;
  primaryDamage?: string;
  secondaryDamage?: string;
  hasKeys?: string; // "YES" | "NO"
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
  latitude?: number;
  longitude?: number;
  imageUrls?: Record<string, unknown> | string[];
  detailUrl?: string;
  seller?: string;
  [key: string]: unknown;
}

// ─── VIN decode types ─────────────────────────────────────────────────────────

/** Structured result from NHTSA vPIC VIN decode */
export interface VINDecodeResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  engineType: string | null;
  bodyClass: string | null;
  driveType: string | null;
  fuelType: string | null;
  transmission: string | null;
  cylinders: number | null;
  displacementL: number | null;
  manufacturer: string | null;
  plantCountry: string | null;
  vehicleType: string | null;
  errorCode: string;
}

/** VIN cache storage interface */
export interface VinCache {
  get(vin: string): Promise<VINDecodeResult | null>;
  set(vin: string, result: VINDecodeResult, ttlMs: number): Promise<void>;
}

// ─── Tool response envelope ───────────────────────────────────────────────────

/** Machine-readable error codes */
export type ErrorCode =
  | 'SCRAPER_ERROR'
  | 'CAPTCHA_DETECTED'
  | 'RATE_LIMITED'
  | 'CACHE_ERROR'
  | 'ANALYSIS_ERROR'
  | 'TIMEOUT'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'VIN_DECODE_ERROR'
  | 'UNKNOWN_ERROR';

/** Serialized error shape for MCP responses */
export interface ToolError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
}

/** Standard MCP tool response envelope */
export interface ToolResponse<T> {
  success: boolean;
  data: T | null;
  error: ToolError | null;
  cached: boolean;
  stale: boolean;
  cachedAt: string | null;
  timestamp: string;
}

/**
 * Constitution II.1 compliance — stale cache wrapper.
 * ToolResponse<T> structurally satisfies this when stale=true and cachedAt is set.
 */
export interface StaleableResponse<T> {
  data: T;
  stale: true;
  cachedAt: string;
}

// ─── Deal analysis types ──────────────────────────────────────────────────────

/** Detailed deal analysis result */
export interface DealAnalysis {
  listing: AuctionListing;
  vinDecode: VINDecodeResult | null;
  profitEstimate: ProfitEstimate | null;
  repairEstimate: RepairEstimate | null;
  riskFlags: RiskFlag[];
  dealScore: number;
  dealGrade: string;
  transportEstimate: CarrierQuote | null;
  marketComps: AuctionListing[];
  analyzedAt: string;
}

/** Brief deal summary for listing grids */
export interface DealSummary {
  listing: AuctionListing;
  dealScore: number;
  dealGrade: string;
  estimatedProfit: number | null;
  topRisk: string | null;
}

/** Risk/warning flag */
export interface RiskFlag {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  source: string | null;
}

/** Profit breakdown estimate */
export interface ProfitEstimate {
  acquisitionCost: number;
  repairCost: number;
  transportCost: number;
  totalInvestment: number;
  estimatedRetailValue: number;
  estimatedProfit: number;
  profitMargin: number;
  adjustments: ValueAdjustment[];
}

/** Value modifier applied to a profit estimate */
export interface ValueAdjustment {
  reason: string;
  amount: number;
}

/** Itemized repair cost estimate */
export interface RepairEstimate {
  lineItems: RepairLineItem[];
  totalParts: number;
  totalLabor: number;
  totalCost: number;
  confidence: 'low' | 'medium' | 'high';
}

/** Single line item in a repair estimate */
export interface RepairLineItem {
  part: string;
  partCost: number;
  laborHours: number;
  laborRate: number;
  laborCost: number;
  source: string | null;
}

/** Vehicle transport quote */
export interface CarrierQuote {
  carrier: string;
  price: number;
  estimatedDays: number;
  distance: number;
  originZip: string;
  destinationZip: string;
  transportType: 'open' | 'enclosed';
}

// ─── Browser config ───────────────────────────────────────────────────────────

/** Shared browser configuration data shape */
export interface BrowserConfig {
  headless: boolean;
  proxyUrl: string | null;
  maxContexts: number;
  stealthEnabled: boolean;
  userAgent: string | null;
}

/** Constructor options for BrowserPool */
export interface BrowserPoolOptions {
  headless?: boolean;
  maxContexts?: number;
  stealthEnabled?: boolean;
  proxyUrl?: string | null;
  userAgent?: string | null;
}

// ─── MCP server options ───────────────────────────────────────────────────────

/** Options for createMcpServer */
export interface McpServerOptions {
  name: string;
  version: string;
  transport?: 'stdio' | 'sse' | 'websocket';
  port?: number;
  wsPort?: number;
}

// ─── Priority queue types ─────────────────────────────────────────────────────

/** Priority tier for queue entries */
export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';

/** A queued request item */
export interface PriorityRequest<T = void> {
  id: string;
  priority: PriorityLevel;
  enqueuedAt: number;
  execute: () => Promise<T>;
}

/** Options for PriorityQueue constructor */
export interface PriorityQueueOptions {
  rateLimit?: {
    requestsPerSecond?: number;
  };
  maxQueueDepth?: number;
}

// ─── Tracing ──────────────────────────────────────────────────────────────────

/** Custom span attributes for OpenTelemetry spans */
export interface SpanAttributes {
  'tool.name'?: string;
  'tool.source'?: string;
  'tool.status'?: 'ok' | 'error';
  'tool.duration_ms'?: number;
  'cache.hit'?: boolean;
  'queue.priority'?: string;
  'queue.wait_ms'?: number;
  [key: string]: string | number | boolean | undefined;
}

// ─── Carfax & NMVTIS sub-records ─────────────────────────────────────────────

export interface ServiceRecord {
  date: string;
  mileage: number | null;
  description: string;
  facility: string | null;
}

export interface RecallRecord {
  date: string;
  component: string;
  description: string;
  remedy: string | null;
  status: 'open' | 'completed';
}

export interface NmvtisTitleRecord {
  state: string;
  titleNumber: string | null;
  titleDate: string;
  titleType: string;
  brandDescriptions: string[];
}

export interface InsuranceLossRecord {
  date: string;
  reportingEntity: string;
  claimType: string;
  disposition: string | null;
}

export interface JunkSalvageRecord {
  date: string;
  reportingEntity: string;
  disposition: string;
}

export interface OdometerRecord {
  date: string;
  reading: number;
  unit: 'miles' | 'kilometers';
  status: string;
}
