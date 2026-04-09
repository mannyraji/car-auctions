/**
 * IAAI scraper client
 * Orchestrates the full scraper pipeline: cache checks → navigation → interception → parsing → cache write
 */
import { ScraperError, CaptchaError, RateLimitError, normalizeIaai } from '@car-auctions/shared';
import type { AuctionListing, IaaiRawListing } from '@car-auctions/shared';
import type { IaaiBrowser } from './browser.js';
import { IaaiInterceptor } from './interceptor.js';
import {
  parseSearchResults,
  parseListingDetail,
  parseSoldResults,
  computeAggregates,
  extractImageUrls,
  parseDomSearch,
} from './parser.js';
import { randomDelay, simulateMouseMovement, isCaptchaPage, isLoginPage } from '../utils/stealth.js';
import { fetchImageAsBase64 } from '../utils/image-utils.js';
import type {
  IaaiSearchParams,
  IaaiSoldParams,
  IaaiImageEntry,
  IaaiImageResult,
  IaaiRawStockData,
  SoldHistoryResponse,
  WatchlistEntry,
  WatchlistAddParams,
  ScraperResult,
  IaaiGetImagesOpts,
} from '../types/index.js';
import type { IaaiSqliteCache } from '../cache/sqlite.js';
import type { MemoryCache } from '../cache/memory.js';
import type { ImageCache } from '../cache/image-cache.js';
import type { RateLimiter } from '../utils/rate-limiter.js';

const BASE_URL = 'https://www.iaai.com';
const NAV_TIMEOUT = 30000;

/**
 * Adapt IaaiRawStockData (which allows null for some fields) to IaaiRawListing
 * (which uses undefined for optional fields). The normalizeIaai() function from
 * @car-auctions/shared expects IaaiRawListing.
 */
function toRawListing(raw: IaaiRawStockData): IaaiRawListing {
  return {
    ...raw,
    currentBid: raw.currentBid ?? undefined,
    buyNowPrice: raw.buyNowPrice ?? undefined,
    saleDate: raw.saleDate ?? undefined,
    finalBid: raw.finalBid ?? undefined,
  };
}

/** Action types for watchListing CRUD */
export type WatchlistAction = 'add' | 'remove' | 'list';

export class IaaiClient {
  constructor(
    private readonly browser: IaaiBrowser,
    private readonly cache: IaaiSqliteCache,
    private readonly memoryCache: MemoryCache<AuctionListing[]>,
    private readonly imageCache: ImageCache,
    private readonly rateLimiter?: RateLimiter
  ) {}

  // ─── search ───────────────────────────────────────────────────────────────

  async search(params: IaaiSearchParams): Promise<ScraperResult<AuctionListing[]>> {
    const cacheKey = JSON.stringify({ type: 'search', ...params });

    // 1. Check MemoryCache (LRU, 15 min TTL)
    const lruHit = this.memoryCache.get(cacheKey);
    if (lruHit !== undefined) {
      return { data: lruHit, cached: true, stale: false, cachedAt: null };
    }

    // 2. Check SQLite searches table
    const sqliteHit = await this.cache.getSearch(cacheKey);
    if (sqliteHit) {
      this.memoryCache.set(cacheKey, sqliteHit.data);
      return { data: sqliteHit.data, cached: true, stale: false, cachedAt: sqliteHit.fetched_at };
    }

    // 3. Fetch via interceptor → parser → normalize → cache write
    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new IaaiInterceptor();
      interceptor.attach(p);

      const url = this.buildSearchUrl(params);

      // Call RateLimiter.acquire() before navigation
      if (this.rateLimiter) await this.rateLimiter.acquire();

      const response = await p.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

      if (!response) throw new ScraperError('No response from IAAI search page');
      if (response.status() === 429 || response.status() === 403) {
        if (this.rateLimiter) this.rateLimiter.applyBackoff();
        throw new RateLimitError(`HTTP ${response.status()} from IAAI`, 60000);
      }

      // Call isCaptchaPage() after navigation
      const pageUrl = p.url();
      const content = await p.content();
      if (isCaptchaPage(pageUrl, content)) {
        throw new CaptchaError('IAAI CAPTCHA detected on search page');
      }

      await simulateMouseMovement(p);
      await randomDelay(1000, 2000);

      let rawItems = interceptor.getSearchResult()?.items ?? [];

      if (rawItems.length === 0) {
        rawItems = await parseDomSearch(p);
      }

      if (rawItems.length === 0) {
        const pageJson = await this.extractPageJson(p);
        if (pageJson) rawItems = parseSearchResults(pageJson);
      }

      const limit = params.limit ?? 50;
      const listings = rawItems.slice(0, limit).map((item) => normalizeIaai(toRawListing(item)));

      // Cache write: LRU + SQLite
      this.memoryCache.set(cacheKey, listings);
      await this.cache.setSearch(cacheKey, listings);

      if (this.rateLimiter) this.rateLimiter.resetBackoff();
      return { data: listings, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
      // Stale fallback: return cached data with stale: true
      const stale = await this.cache.getSearch(cacheKey, true);
      if (stale) {
        return { data: stale.data, cached: true, stale: true, cachedAt: stale.fetched_at };
      }
      throw new ScraperError(
        err instanceof Error ? err.message : 'Unknown scraper error',
        'SCRAPER_ERROR',
        false
      );
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  // ─── getListing ────────────────────────────────────────────────────────────

  async getListing(stockNumber: string): Promise<ScraperResult<AuctionListing>> {
    // 1. Check SQLite listings table
    const sqliteHit = await this.cache.getListing(stockNumber);
    if (sqliteHit) {
      return {
        data: sqliteHit.data,
        cached: true,
        stale: false,
        cachedAt: sqliteHit.fetched_at,
      };
    }

    // 2. Fetch via interceptor → parser → normalize → cache write (30 s nav timeout)
    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new IaaiInterceptor();
      interceptor.attach(p);

      const url = `${BASE_URL}/VehicleDetail/${stockNumber}`;

      // Call RateLimiter.acquire() before navigation
      if (this.rateLimiter) await this.rateLimiter.acquire();

      const response = await p.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

      if (!response) throw new ScraperError('No response from IAAI listing page');
      if (response.status() === 404) {
        throw new ScraperError(`Stock number ${stockNumber} not found`, 'SCRAPER_ERROR', false);
      }
      if (response.status() === 429 || response.status() === 403) {
        if (this.rateLimiter) this.rateLimiter.applyBackoff();
        throw new RateLimitError(`HTTP ${response.status()} from IAAI`, 60000);
      }

      // Call isCaptchaPage() after navigation
      const pageUrl = p.url();
      const content = await p.content();
      if (isCaptchaPage(pageUrl, content)) {
        throw new CaptchaError('IAAI CAPTCHA detected on listing page');
      }

      await simulateMouseMovement(p);
      await randomDelay(500, 1500);

      const interceptedRaw = interceptor.getListing();
      let listing: AuctionListing;

      if (interceptedRaw) {
        listing = normalizeIaai(toRawListing(interceptedRaw));
      } else {
        const pageJson = await this.extractPageJson(p);
        const raw = parseListingDetail(pageJson ?? {});
        listing = normalizeIaai(toRawListing(raw));
      }

      await this.cache.setListing(stockNumber, listing);

      if (this.rateLimiter) this.rateLimiter.resetBackoff();
      return { data: listing, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
      // Stale fallback
      const stale = await this.cache.getListing(stockNumber, true);
      if (stale) {
        return { data: stale.data, cached: true, stale: true, cachedAt: stale.fetched_at };
      }
      throw new ScraperError(
        err instanceof Error ? err.message : 'Unknown scraper error',
        'SCRAPER_ERROR',
        false
      );
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  // ─── getImages ─────────────────────────────────────────────────────────────

  async getImages(
    stockNumber: string,
    opts: IaaiGetImagesOpts = {}
  ): Promise<ScraperResult<IaaiImageResult>> {
    const { maxImages, imageTypes } = opts;

    // 1. Attempt to load image URLs from the listing cache first
    const cachedListing = await this.cache.getListing(stockNumber);
    let imageUrls: string[] = cachedListing?.data.image_urls ?? [];

    // 2. If we have URLs, check disk cache for all of them
    if (imageUrls.length > 0) {
      const allCached = await Promise.all(imageUrls.map((u) => this.imageCache.has(u)));
      if (allCached.every(Boolean)) {
        const images = await this.buildImageEntries(imageUrls, maxImages, imageTypes);
        return {
          data: { stock_number: stockNumber, images },
          cached: true,
          stale: false,
          cachedAt: cachedListing?.fetched_at ?? null,
        };
      }
    }

    // 3. Fetch CDN URLs via page context. Re-auths once on session expiry.
    const fetchUrls = async (): Promise<{ urls: string[]; sessionExpired: boolean }> => {
      let page: import('playwright').Page | null = null;
      try {
        const p = await this.browser.getPage();
        page = p;
        const interceptor = new IaaiInterceptor();
        interceptor.attach(p);

        const url = `${BASE_URL}/VehicleDetail/${stockNumber}`;

        // Call RateLimiter.acquire() before navigation
        if (this.rateLimiter) await this.rateLimiter.acquire();

        await p.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

        const pageUrl = p.url();
        const content = await p.content();

        if (isCaptchaPage(pageUrl, content)) {
          throw new CaptchaError('IAAI CAPTCHA detected fetching images');
        }

        // Detect session expiry (redirect to login)
        if (isLoginPage(pageUrl)) {
          return { urls: [], sessionExpired: true };
        }

        await randomDelay(500, 1500);

        let urls: string[] = [];
        const interceptedRaw = interceptor.getListing();
        if (interceptedRaw) {
          urls = extractImageUrls(interceptedRaw);
        }

        if (urls.length === 0) {
          const pageJson = await this.extractPageJson(p);
          if (pageJson) {
            const raw = parseListingDetail(pageJson);
            urls = extractImageUrls(raw);
          }
        }

        if (this.rateLimiter) this.rateLimiter.resetBackoff();
        return { urls, sessionExpired: false };
      } finally {
        if (page) await page.close().catch(() => {});
      }
    };

    let fetchResult: { urls: string[]; sessionExpired: boolean };
    try {
      fetchResult = await fetchUrls();
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
      throw new ScraperError(
        err instanceof Error ? err.message : 'Unknown scraper error',
        'SCRAPER_ERROR',
        false
      );
    }

    // Re-authenticate once on session expiry, then retry
    if (fetchResult.sessionExpired) {
      const email = process.env['IAAI_EMAIL'];
      const password = process.env['IAAI_PASSWORD'];
      if (email && password) {
        try {
          await this.browser.authenticate(email, password);
          // Retry navigation after successful re-auth
          try {
            fetchResult = await fetchUrls();
          } catch (retryErr) {
            console.warn(
              '[IaaiClient.getImages] Retry after re-auth failed:',
              retryErr instanceof Error ? retryErr.message : retryErr
            );
            fetchResult = { urls: [], sessionExpired: false };
          }
        } catch (authErr) {
          console.warn(
            '[IaaiClient.getImages] Re-authentication failed:',
            authErr instanceof Error ? authErr.message : authErr
          );
          fetchResult = { urls: [], sessionExpired: false };
        }
      } else {
        fetchResult = { urls: [], sessionExpired: false };
      }
    }

    imageUrls = fetchResult.urls;

    // 4. sharp pipeline → disk cache write
    const images = await this.buildImageEntries(imageUrls, maxImages, imageTypes);
    const expectedCount = imageUrls.length;
    const fetchedCount = images.filter((img) => img.base64 !== null).length;
    const partial = imageUrls.length === 0 || fetchedCount < expectedCount;

    return {
      data: { stock_number: stockNumber, images },
      cached: false,
      stale: false,
      cachedAt: null,
      ...(partial ? { partial: true } : {}),
    };
  }

  // ─── getSoldHistory ────────────────────────────────────────────────────────

  async getSoldHistory(params: IaaiSoldParams): Promise<ScraperResult<SoldHistoryResponse>> {
    const cacheKey = JSON.stringify({ type: 'sold', ...params });

    // 1. Check SQLite sold_history (7 day TTL)
    const sqliteHit = await this.cache.getSoldHistory(cacheKey);
    if (sqliteHit) {
      return {
        data: sqliteHit.data,
        cached: true,
        stale: false,
        cachedAt: sqliteHit.fetched_at,
      };
    }

    // 2. Fetch via interceptor → parser → computeAggregates() → cache write
    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new IaaiInterceptor();
      interceptor.attach(p);

      const url = this.buildSoldUrl(params);

      // Call RateLimiter.acquire() before navigation
      if (this.rateLimiter) await this.rateLimiter.acquire();

      await p.goto(url, { waitUntil: 'networkidle', timeout: NAV_TIMEOUT });

      // Call isCaptchaPage() after navigation
      const pageUrl = p.url();
      const content = await p.content();
      if (isCaptchaPage(pageUrl, content)) {
        throw new CaptchaError('IAAI CAPTCHA detected on sold history page');
      }

      await randomDelay(500, 1500);

      const intercepted = interceptor.getSearchResult();
      let soldEntries = intercepted ? parseSoldResults({ items: intercepted.items }) : [];

      if (soldEntries.length === 0) {
        const pageJson = await this.extractPageJson(p);
        if (pageJson) soldEntries = parseSoldResults(pageJson);
      }

      const limit = params.limit ?? 100;
      soldEntries = soldEntries.slice(0, limit);

      const aggregates = computeAggregates(soldEntries);
      const response: SoldHistoryResponse = { lots: soldEntries, aggregates };

      await this.cache.setSoldHistory(cacheKey, response);

      if (this.rateLimiter) this.rateLimiter.resetBackoff();
      return { data: response, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
      // Stale fallback
      const stale = await this.cache.getSoldHistory(cacheKey, true);
      if (stale) {
        return { data: stale.data, cached: true, stale: true, cachedAt: stale.fetched_at };
      }
      throw new ScraperError(
        err instanceof Error ? err.message : 'Unknown scraper error',
        'SCRAPER_ERROR',
        false
      );
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  // ─── watchListing ──────────────────────────────────────────────────────────

  watchListing(
    action: WatchlistAction,
    stockNumber?: string,
    bidThreshold?: number,
    notes?: string
  ): WatchlistEntry[] | boolean | void {
    switch (action) {
      case 'add': {
        if (!stockNumber) throw new ScraperError('watchListing add requires stockNumber');
        const addParams: WatchlistAddParams = {
          lot_number: stockNumber,
          ...(bidThreshold !== undefined ? { bid_threshold: bidThreshold } : {}),
          ...(notes !== undefined ? { notes } : {}),
        };
        this.cache.watchlistAdd(addParams);
        return;
      }
      case 'remove': {
        if (!stockNumber) throw new ScraperError('watchListing remove requires stockNumber');
        return this.cache.watchlistRemove(stockNumber);
      }
      case 'list': {
        return this.cache.watchlistList();
      }
      default: {
        throw new ScraperError(`Unknown watchListing action: ${String(action)}`);
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private buildSearchUrl(params: IaaiSearchParams): string {
    const url = new URL(`${BASE_URL}/Search`);
    url.searchParams.set('q', params.query);
    if (params.make) url.searchParams.set('make', params.make);
    if (params.model) url.searchParams.set('model', params.model);
    if (params.year_min) url.searchParams.set('yearFrom', String(params.year_min));
    if (params.year_max) url.searchParams.set('yearTo', String(params.year_max));
    if (params.zip) url.searchParams.set('zip', params.zip);
    if (params.radius) url.searchParams.set('radius', String(params.radius));
    return url.toString();
  }

  private buildSoldUrl(params: IaaiSoldParams): string {
    const url = new URL(`${BASE_URL}/Search`);
    url.searchParams.set('q', `${params.make} ${params.model}`);
    url.searchParams.set('make', params.make);
    url.searchParams.set('model', params.model);
    if (params.year_min) url.searchParams.set('yearFrom', String(params.year_min));
    if (params.year_max) url.searchParams.set('yearTo', String(params.year_max));
    url.searchParams.set('saleStatus', 'SOLD');
    return url.toString();
  }

  private async extractPageJson(page: import('playwright').Page): Promise<unknown> {
    try {
      return await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const s of scripts) {
          const text = s.textContent ?? '';
          if (text.includes('stockNumber') || text.includes('window.__INITIAL_STATE__')) {
            const match =
              text.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s) ??
              text.match(/(\{.*?"stockNumber".*?\})/s);
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
    } catch {
      return null;
    }
  }

  private async buildImageEntries(
    imageUrls: string[],
    maxImages?: number,
    imageTypes?: string[]
  ): Promise<IaaiImageEntry[]> {
    let urls = imageUrls;

    // Filter by image type if specified (category is derived from URL naming convention)
    if (imageTypes && imageTypes.length > 0) {
      urls = urls.filter((url) => {
        const lower = url.toLowerCase();
        return imageTypes.some((t) => lower.includes(t.toLowerCase()));
      });
    }

    if (maxImages !== undefined) {
      urls = urls.slice(0, maxImages);
    }

    const entries: IaaiImageEntry[] = await Promise.all(
      urls.map(async (url, idx) => {
        const base64 = await fetchImageAsBase64(url, this.imageCache);
        return {
          url,
          category: this.inferCategory(url, idx),
          base64,
        };
      })
    );

    return entries;
  }

  private inferCategory(url: string, index: number): string {
    const lower = url.toLowerCase();
    if (lower.includes('damage')) return 'damage';
    if (lower.includes('engine')) return 'engine';
    if (lower.includes('interior') || lower.includes('int_')) return 'interior';
    if (lower.includes('under') || lower.includes('chassis')) return 'undercarriage';
    return index === 0 ? 'exterior_front' : 'exterior';
  }
}
