/**
 * @file types/index.ts
 * @description All shared interfaces and type aliases for the car-auctions monorepo.
 * @since 001-shared-utilities-lib
 */

// ─── Auction Data ──────────────────────────────────────────────────────────────

/**
 * Source-agnostic normalized representation of a vehicle at auction.
 * Both `normalizeCopart` and `normalizeIaai` produce this shape.
 *
 * @example
 * const listing: AuctionListing = normalizeCopart(rawCopartData);
 * console.log(listing.source); // 'copart'
 */
export interface AuctionListing {
  // Identity
  source: 'copart' | 'iaai';
  lot_number: string;
  vin: string;

  // Vehicle specs
  year: number;
  make: string;
  model: string;
  trim: string | null;
  body_style: string | null;
  color: string | null;
  odometer_km: number | null;

  // Damage
  damage_primary: string | null;
  damage_secondary: string | null;
  has_keys: boolean;
  title_type: string | null;

  // Bid / sale
  current_bid_usd: number | null;
  buy_now_usd: number | null;
  sale_date: string | null; // ISO 8601
  sale_status: 'upcoming' | 'live' | 'sold' | 'cancelled' | null;

  // Location
  auction_yard: string | null;
  state: string | null;
  zip: string | null;

  // Extended (optional, populated by downstream enrichment)
  estimated_repair_usd: number | null;
  acv_usd: number | null;
}

/**
 * Raw API response from Copart's internal API (intercepted by the scraper).
 *
 * @example
 * const raw: CopartRawListing = await fetchCopartLot('12345678');
 */
export interface CopartRawListing {
  lotNumberStr: string;
  vn: string; // VIN
  mkn: string; // make
  lnn: string; // model
  yn: number; // year
  clr: string; // color
  dd: string; // primary damage description
  sdd: string | null; // secondary damage description
  hk: boolean; // has keys
  ln: string; // lane / sale lot name
  orr: number; // odometer reading
  obd: string; // odometer brand (e.g. "Actual Miles")
  tmtp: string; // title type code
  htrf: boolean; // high title risk flag
  cd: number | null; // current bid USD
  bnp: number | null; // buy now price USD
  sed: string; // sale end date (ISO or epoch)
  syn: string; // auction yard name
  st: string; // state abbreviation
  pc: string; // postal code (zip)
}

/**
 * Raw API response from IAAI's internal API.
 *
 * @example
 * const raw: IaaiRawListing = await fetchIaaiStock('ABC123');
 */
export interface IaaiRawListing {
  StockNumber: string;
  Vin: string;
  Year: number;
  Make: string;
  Model: string;
  Trim: string | null;
  BodyStyle: string | null;
  Color: string | null;
  Mileage: number | null;
  PrimaryDamage: string | null;
  SecondaryDamage: string | null;
  hasKeys: 'YES' | 'NO' | null;
  titleCode: string;
  CurrentBid: number | null;
  BuyItNow: number | null;
  SaleDate: string | null;
  BranchName: string | null;
  State: string | null;
  Zip: string | null;
}

// ─── Analysis & Deal Entities ──────────────────────────────────────────────────

/**
 * Complete output of the `analyze_vehicle` pipeline.
 *
 * @example
 * const analysis: DealAnalysis = await analyzePipeline(listing);
 */
export interface DealAnalysis {
  listing: AuctionListing;
  vin_decode: VINDecodeResult | null;
  repair_estimate: RepairEstimate | null;
  profit_estimate: ProfitEstimate | null;
  deal_score: number; // 0–100
  risk_flags: RiskFlag[];
  summary: DealSummary;
  analyzed_at: string; // ISO 8601
}

/**
 * Summary of the deal analysis recommendation.
 *
 * @example
 * const summary: DealSummary = { recommendation: 'buy', headline: 'Strong deal', max_bid_usd: 5000 };
 */
export interface DealSummary {
  recommendation: 'buy' | 'pass' | 'watch';
  headline: string;
  max_bid_usd: number | null;
}

/**
 * A risk warning or alert about a vehicle.
 *
 * @example
 * const flag: RiskFlag = { type: 'flood', severity: 'critical', detail: 'Flood title in TX' };
 */
export interface RiskFlag {
  type:
    | 'title_wash'
    | 'flood'
    | 'odometer_rollback'
    | 'frame_damage'
    | 'airbag_deployed'
    | 'theft_recovery'
    | 'lemon'
    | 'other';
  severity: 'info' | 'warning' | 'critical';
  detail: string;
}

// ─── VIN & Vehicle Entities ────────────────────────────────────────────────────

/**
 * Decoded vehicle specification from NHTSA vPIC API.
 *
 * @example
 * const result: VINDecodeResult = await decodeVin('1HGCM82633A123456');
 */
export interface VINDecodeResult {
  vin: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  engine_type: string | null;
  body_class: string | null;
  drive_type: string | null;
  fuel_type: string | null;
  transmission: string | null;
}

// ─── Financial Entities ────────────────────────────────────────────────────────

/**
 * Profit/loss estimate for a potential vehicle purchase.
 *
 * @example
 * const est: ProfitEstimate = calculateProfit(listing, repairCost);
 */
export interface ProfitEstimate {
  purchase_price_usd: number;
  buyer_premium_usd: number;
  auction_fee_usd: number;
  repair_cost_usd: number;
  transport_cost_usd: number;
  total_cost_usd: number;
  estimated_resale_usd: number;
  gross_profit_usd: number;
  margin_pct: number; // 0–100
}

/**
 * Aggregated repair cost estimate.
 *
 * @example
 * const estimate: RepairEstimate = { total_usd: 3200, confidence: 'high', line_items: [] };
 */
export interface RepairEstimate {
  total_usd: number;
  confidence: 'high' | 'medium' | 'low';
  line_items: RepairLineItem[];
}

/**
 * Individual repair line item.
 *
 * @example
 * const item: RepairLineItem = { description: 'Front bumper', part_usd: 400, labor_usd: 200, total_usd: 600 };
 */
export interface RepairLineItem {
  description: string;
  part_usd: number;
  labor_usd: number;
  total_usd: number;
}

/**
 * Adjustment to a vehicle's estimated value.
 *
 * @example
 * const adj: ValueAdjustment = { reason: 'High mileage', amount_usd: -500 };
 */
export interface ValueAdjustment {
  reason: string;
  amount_usd: number;
}

/**
 * Transport carrier quote.
 *
 * @example
 * const quote: CarrierQuote = { carrier: 'uShip', price_usd: 800, eta_days: 5 };
 */
export interface CarrierQuote {
  carrier: string;
  price_usd: number;
  eta_days: number | null;
}

// ─── Browser Pool Config ───────────────────────────────────────────────────────

/**
 * Configuration for the shared browser pool.
 *
 * @example
 * const config: BrowserConfig = { proxy_url: null, stealth: true, headless: true, max_contexts: 3, timeout_ms: 30000 };
 */
export interface BrowserConfig {
  proxy_url: string | null;
  stealth: boolean;
  headless: boolean;
  max_contexts: number;
  timeout_ms: number;
}

// ─── Tool Response Envelope ────────────────────────────────────────────────────

/**
 * All valid error codes for structured error handling.
 */
export type ErrorCode =
  | 'SCRAPER_ERROR'
  | 'CAPTCHA_DETECTED'
  | 'RATE_LIMITED'
  | 'CACHE_ERROR'
  | 'ANALYSIS_ERROR'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'TIMEOUT'
  | 'UNKNOWN';

/**
 * Structured error information returned in ToolResponse.
 *
 * @example
 * const err: ToolError = { code: 'RATE_LIMITED', message: 'Too many requests', retryable: true, retryAfterMs: 3000 };
 */
export interface ToolError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  retryAfterMs: number | null;
}

/**
 * Standard envelope returned by every MCP tool handler.
 *
 * @example
 * const response: ToolResponse<VINDecodeResult> = await decodeVin('1HGCM82633A123456');
 * if (response.success) console.log(response.data);
 */
export interface ToolResponse<T> {
  success: boolean;
  data: T | null;
  error: ToolError | null;
  cached: boolean;
  stale: boolean;
  cachedAt: string | null; // ISO 8601 — required when stale: true
  timestamp: string; // ISO 8601 response time
}

/**
 * Convenience alias satisfying the constitution's StaleableResponse<T> contract.
 *
 * @example
 * const cached: StaleableResponse<VINDecodeResult> = { data: result, stale: false, cachedAt: new Date().toISOString() };
 */
export type StaleableResponse<T> = {
  data: T;
  stale: boolean;
  cachedAt: string; // ISO 8601
};

// ─── Vehicle History Sub-Records ───────────────────────────────────────────────

/**
 * A Carfax service record entry.
 *
 * @example
 * const record: ServiceRecord = { date: '2023-01-15', mileage: 45000, service: 'Oil change', source: 'Carfax' };
 */
export interface ServiceRecord {
  date: string; // ISO 8601
  mileage: number | null;
  service: string;
  source: string;
}

/**
 * A vehicle recall record.
 *
 * @example
 * const recall: RecallRecord = { campaign_id: '23V123', component: 'Airbag', status: 'open' };
 */
export interface RecallRecord {
  campaign_id: string;
  component: string;
  status: 'open' | 'completed' | 'unknown';
}

/**
 * NMVTIS title record entry.
 *
 * @example
 * const title: NmvtisTitleRecord = { state: 'TX', title_number: 'TX123', issue_date: '2020-03-01', brand: 'Salvage' };
 */
export interface NmvtisTitleRecord {
  state: string;
  title_number: string;
  issue_date: string; // ISO 8601
  brand: string | null;
}

/**
 * Insurance total-loss record from NMVTIS.
 *
 * @example
 * const loss: InsuranceLossRecord = { reported_date: '2021-06-01', loss_type: 'Flood', disposed: true };
 */
export interface InsuranceLossRecord {
  reported_date: string;
  loss_type: string;
  disposed: boolean;
}

/**
 * Junk or salvage record from NMVTIS.
 *
 * @example
 * const junk: JunkSalvageRecord = { reported_date: '2022-01-01', reporter: 'ACME Salvage', type: 'salvage' };
 */
export interface JunkSalvageRecord {
  reported_date: string;
  reporter: string;
  type: 'junk' | 'salvage';
}

/**
 * Odometer reading record.
 *
 * @example
 * const odo: OdometerRecord = { date: '2023-05-01', reading: 85000, unit: 'miles', brand: 'actual' };
 */
export interface OdometerRecord {
  date: string;
  reading: number;
  unit: 'miles' | 'kilometers';
  brand: 'actual' | 'not actual' | 'exempt' | null;
}

// ─── Priority Queue Types ──────────────────────────────────────────────────────

/**
 * Priority levels for the request queue.
 *
 * @example
 * const level: PriorityLevel = 'critical';
 */
export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low' | 'background';

/**
 * A queued request with priority information.
 *
 * @example
 * const req: PriorityRequest<string> = { id: 'req-1', priority: 'high', task: async () => 'done', enqueuedAt: Date.now() };
 */
export interface PriorityRequest<T = unknown> {
  id: string;
  priority: PriorityLevel;
  task: () => Promise<T>;
  enqueuedAt: number;
}

// ─── MCP Helper Types ──────────────────────────────────────────────────────────

/**
 * Options for the MCP server bootstrap helper.
 *
 * @example
 * const opts: McpServerOptions = { name: 'copart-mcp', version: '1.0.0', transport: 'stdio' };
 */
export interface McpServerOptions {
  name: string;
  version: string;
  transport?: 'stdio' | 'sse' | 'websocket';
  port?: number;
  wsPort?: number;
}
