/**
 * @file src/types/index.ts
 * @description All shared TypeScript interfaces for @car-auctions/shared.
 * This is the single source of truth for all domain types across the monorepo.
 */

// ============================================================
// Auction Domain
// ============================================================

/** Source-agnostic normalized auction listing. Both Copart and IAAI map to this shape. */
export interface AuctionListing {
  source: 'copart' | 'iaai';
  lot_number: string;
  title: string;
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  damage_primary: string;
  damage_secondary?: string;
  has_keys: boolean;
  odometer: number;
  odometer_status: 'actual' | 'exempt' | 'not_actual' | 'exceeds_limit';
  drive_type: string;
  fuel_type: string;
  engine: string;
  transmission: string;
  color: string;
  current_bid: number;
  buy_it_now?: number;
  sale_date: string; // ISO 8601
  sale_status: 'upcoming' | 'live' | 'sold' | 'cancelled';
  location: string;
  location_zip: string;
  thumbnail_url: string;
  listing_url: string;
  // Extended fields (present on get_listing responses)
  body_style?: string;
  cylinders?: number;
  retail_value?: number;
  title_type?: string; // e.g. "Salvage", "Clean", "Rebuilt"
  title_state?: string;
  seller?: string;
  highlights?: string[];
  condition?: { start_code: string; keys: boolean; airbags: string };
  image_count?: number;
}

/** Raw Copart API response — pre-normalization. Used only inside normalizer. */
export interface CopartRawListing {
  lotNumberStr: string;
  mkn: string; // Make name
  mmod: string; // Model
  lcy: number; // Year
  dd: string; // Primary damage
  sdd?: string; // Secondary damage
  orr: number; // Odometer reading
  odometerBrand: string;
  la: string; // Location / auction yard
  dynamicBidAmount: number;
  bin?: number; // Buy It Now
  tims: { full: string[] }; // Image URLs
  ad: string; // Auction date
  hk: boolean; // Has keys
  dr: boolean; // Driveable
  ts: string; // Title state
  tt: string; // Title type
  [key: string]: unknown;
}

/** Raw IAAI API response — pre-normalization. Used only inside normalizer. */
export interface IaaiRawListing {
  stockNumber: string;
  year: number;
  makeName: string;
  modelName: string;
  primaryDamage: string;
  secondaryDamage?: string;
  odometerReading: number;
  odometerUnit: string;
  branch: string; // IAAI branch = location
  currentBid: number;
  buyNowPrice?: number;
  saleDate: string;
  hasKeys: string; // "YES" | "NO" — NOT boolean
  titleState: string;
  titleCode: string; // "SV", "CL", "RB", etc.
  images: { url: string; seq: number }[];
  [key: string]: unknown;
}

// ============================================================
// Analysis Domain
// ============================================================

/** Full output of the analyze_vehicle pipeline. */
export interface DealAnalysis {
  listing: AuctionListing;
  vin_decode: VINDecodeResult;
  nmvtis_result?: NMVTISResult;
  carfax_summary?: CarfaxSummary;
  title_comparison?: TitleComparison;
  profit_estimate: ProfitEstimate;
  repair_quote?: RepairEstimate;
  deal_score: number; // 0–100
  risk_flags: RiskFlag[];
  images?: DamageImage[];
  damage_classifications?: DamageClassification[];
  paint_analysis?: PaintAnalysis;
  frame_inspection?: FrameInspection;
  generated_at: string; // ISO 8601
}

/** Structured vehicle specifications decoded from a VIN via NHTSA vPIC API. */
export interface VINDecodeResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  engine_type: string;
  body_class: string;
  drive_type: string;
  fuel_type: string;
  transmission: string;
  engine_cylinders?: number;
  displacement_l?: number;
  engine_config?: string;
  decode_notes?: string; // Non-empty when NHTSA returned error codes
}

/** Risk warning about a vehicle. */
export interface RiskFlag {
  type:
    | 'title_wash'
    | 'odometer_rollback'
    | 'flood'
    | 'structural'
    | 'airbag'
    | 'excessive_owners'
    | 'no_keys'
    | 'non_runner'
    | 'nmvtis_discrepancy'
    | 'frame_damage';
  severity: 'info' | 'warning' | 'critical';
  detail: string;
}

/** Lightweight deal summary — returned by scan_deals. */
export interface DealSummary {
  lot_number: string;
  source: 'copart' | 'iaai';
  title: string;
  year: number;
  make: string;
  model: string;
  current_bid: number;
  estimated_profit: number;
  deal_score: number;
  risk_flags: RiskFlag[];
  sale_date: string;
  listing_url: string;
}

/** Profit projection for a vehicle deal. */
export interface ProfitEstimate {
  purchase_price: number;
  repair_cost: number;
  transport_cost: number;
  auction_fees: number;
  total_cost: number;
  market_value: number;
  estimated_profit: number;
  roi_percent: number;
  value_adjustments: ValueAdjustment[];
}

/** Parts-based repair cost estimate. */
export interface RepairEstimate {
  totalCost: number;
  confidence: 'low' | 'medium' | 'high';
  source: 'heuristic' | 'parts_lookup' | 'image_analysis' | 'combined';
  lineItems: RepairLineItem[];
  paintMultiplier: number; // From vision paint analyzer (1.0 = no adjustment)
  severityMultiplier: number; // From vision damage classifier (1.0 = no adjustment)
  frameCostAdditional: number; // From vision frame inspector ($0 = no frame damage)
}

/** Single line item in a repair estimate. */
export interface RepairLineItem {
  description: string;
  partCost: number;
  laborCost: number;
  laborHours: number;
  partSource?: string;
  lineTotal: number;
}

/** Per-factor market value adjustment. */
export interface ValueAdjustment {
  factor: string; // e.g. "mileage", "title_type", "damage", "region"
  adjustment: number; // Dollar amount, positive = adds value, negative = reduces
  reason: string;
}

/** Transport carrier quote. */
export interface CarrierQuote {
  carrier: string;
  type: 'open' | 'enclosed';
  price: number;
  estimatedDays: number;
  rating?: number; // 1–5 carrier rating
  url?: string;
}

// ============================================================
// History & Compliance — Carfax Sub-Records
// ============================================================

export interface ServiceRecord {
  date: string;
  mileage?: number;
  description: string;
  facility?: string;
  location?: string;
}

export interface RecallRecord {
  campaignNumber: string;
  date: string;
  component: string;
  description: string;
  remedy: string;
  status: 'open' | 'completed' | 'unknown';
}

// ============================================================
// History & Compliance — NMVTIS Sub-Records
// ============================================================

export interface NmvtisTitleRecord {
  state: string;
  date: string;
  titleType: string;
  brandCodes: string[];
  brandDescriptions: string[];
  odometer?: number;
  odometerStatus?: string;
}

export interface InsuranceLossRecord {
  date: string;
  insurer?: string;
  claimType: string; // "Total Loss" | "Theft" | "Recovered Theft"
  disposition?: string;
}

export interface JunkSalvageRecord {
  reportedBy: string;
  date: string;
  disposition: string; // "Crushed" | "Sold" | "Rebuilt" | "Retained"
  state?: string;
}

export interface OdometerRecord {
  date: string;
  reading: number;
  source: string; // "Title" | "Inspection" | "Service"
  status: 'ok' | 'discrepancy' | 'rollback_suspected' | 'exceeds_limit';
}

// ============================================================
// Infrastructure — Tool Response & Error Codes
// ============================================================

/** All structured error codes used across the monorepo. */
export type ErrorCode =
  | 'SCRAPER_ERROR' // Generic scraper failure
  | 'CAPTCHA_DETECTED' // CAPTCHA encountered; cannot proceed
  | 'RATE_LIMITED' // HTTP 429 or per-request rate limit hit
  | 'RATE_LIMIT_DAILY_CAP' // Daily request cap exceeded
  | 'CACHE_ERROR' // SQLite read/write failure
  | 'ANALYSIS_ERROR' // Deal analysis pipeline failure
  | 'VALIDATION_ERROR' // Invalid input (bad VIN, lot number, zip)
  | 'AUTH_ERROR' // Login failed for auction site
  | 'NOT_FOUND' // Lot/stock number not found
  | 'TIMEOUT' // Navigation or API call timeout
  | 'NMVTIS_COST_GUARD' // NMVTIS called in batch context
  | 'DOWNSTREAM_UNAVAILABLE' // Gateway: downstream server down
  | 'VISION_ERROR'; // AI vision analysis failure

/** Standard MCP tool return envelope. ALL tool responses must use this shape. */
export interface ToolResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfterMs?: number; // Present for RATE_LIMITED errors
  };
  cached: boolean;
  stale: boolean; // true when returning expired cache on upstream failure
  timestamp: string; // ISO 8601
}

/** Browser configuration for Playwright browser pool. */
export interface BrowserConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  userAgent?: string; // null = rotate from stealth pool
  proxyUrl?: string; // Defaults to process.env.PROXY_URL
  navigationTimeoutMs: number; // Default: 30_000
  actionDelayMinMs: number; // Default: 2_000
  actionDelayMaxMs: number; // Default: 5_000
  scrollSteps: number; // Default: 3
  maxConcurrency: number; // Max concurrent browser contexts (default: 3)
}

// ============================================================
// Queue & Tracing
// ============================================================

/** Priority level for queued scrape requests. */
export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';

/** A queued work item managed by PriorityQueue. */
export interface PriorityRequest<T = unknown> {
  id: string; // UUID
  priority: PriorityLevel;
  enqueuedAt: number; // Date.now() at enqueue time
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** Custom OTel span attributes applied to all instrumented operations. */
export interface SpanAttributes {
  'tool.name'?: string; // Canonical MCP tool name
  'tool.source'?: string; // "copart" | "iaai" | etc.
  'tool.status'?: 'ok' | 'error';
  'tool.duration_ms'?: number;
  'cache.hit'?: boolean;
  'queue.priority'?: PriorityLevel;
  'queue.wait_ms'?: number;
}

// ============================================================
// Placeholder interfaces for types owned by other packages
// (referenced by DealAnalysis but defined in their owning packages)
// ============================================================

/** @see packages/nmvtis-mcp/src/types */
export interface NMVTISResult {
  vin: string;
  titleRecords: NmvtisTitleRecord[];
  insuranceLossRecords: InsuranceLossRecord[];
  junkSalvageRecords: JunkSalvageRecord[];
  odometerRecords: OdometerRecord[];
  reportDate: string;
}

/** @see packages/carfax-scraper-mcp/src/types */
export interface CarfaxSummary {
  vin: string;
  ownerCount: number;
  accidentCount: number;
  titleIssues: boolean;
  lastOdometer: number;
  openRecalls: number;
  overallRisk: 'low' | 'medium' | 'high';
  serviceRecords: ServiceRecord[];
  recallRecords: RecallRecord[];
  reportDate: string;
}

/** @see packages/nmvtis-mcp/src/types */
export interface TitleComparison {
  vin: string;
  nmvtisTitle: string;
  carfaxTitle: string;
  discrepancyFound: boolean;
  discrepancyDetail?: string;
}

/** @see packages/deal-analyzer-mcp/src/types */
export interface DamageImage {
  url: string;
  base64: string;
  width: number;
  height: number;
}

/** @see packages/deal-analyzer-mcp/src/types */
export interface DamageClassification {
  imageUrl: string;
  severity: 'minor' | 'moderate' | 'severe' | 'total_loss';
  confidence: number;
  regions: string[];
}

/** @see packages/deal-analyzer-mcp/src/types */
export interface PaintAnalysis {
  detectedColor: string;
  isCustomPaint: boolean;
  paintMultiplier: number;
}

/** @see packages/deal-analyzer-mcp/src/types */
export interface FrameInspection {
  frameDamageDetected: boolean;
  confidence: number;
  frameCostAdditional: number;
  notes?: string;
}
