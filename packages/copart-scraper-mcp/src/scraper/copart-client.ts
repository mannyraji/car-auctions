/**
 * Copart scraper client
 * Navigates Copart pages and extracts data via network interception
 */
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';
import type { AuctionListing, RateLimiter } from '@car-auctions/shared';
import type { CopartBrowser } from './browser.js';
import { CopartInterceptor } from './interceptor.js';
import {
  parseSearchResults,
  parseListing,
  parseSoldHistory,
  parseImageUrls,
  toAuctionListings,
  toAuctionListing,
} from './parser.js';
import { randomDelay, simulateMouseMovement, isCaptchaPage } from '@car-auctions/shared';
import type { Response } from 'playwright';
import type {
  CopartSearchParams,
  CopartSoldParams,
  CopartSoldEntry,
  ScraperResult,
} from '../types/index.js';
import type { CopartSqliteCache } from '../cache/sqlite.js';

const BASE_URL = 'https://www.copart.com';

export class CopartClient {
  constructor(
    private readonly browser: CopartBrowser,
    private readonly cache: CopartSqliteCache,
    private readonly rateLimiter?: RateLimiter
  ) {}

  async search(params: CopartSearchParams): Promise<ScraperResult<AuctionListing[]>> {
    const cacheKey = JSON.stringify({ type: 'search', ...params });

    const cached = await this.cache.getSearch(cacheKey);
    if (cached) {
      return { data: cached.data, cached: true, stale: false, cachedAt: cached.fetched_at };
    }

    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new CopartInterceptor();
      interceptor.attach(p);

      const url = new URL(`${BASE_URL}/vehicleFinderSection.do`);
      url.searchParams.set('searchCriteria', params.query);
      if (params.make) url.searchParams.set('displayMake', params.make);
      if (params.model) url.searchParams.set('displayModel', params.model);
      if (params.year_min) url.searchParams.set('yearFrom', String(params.year_min));
      if (params.year_max) url.searchParams.set('yearTo', String(params.year_max));
      if (params.zip) url.searchParams.set('memberZipCode', params.zip);
      if (params.radius) url.searchParams.set('radialSearch', String(params.radius));

      const response = await (this.rateLimiter
        ? this.rateLimiter.execute(() =>
            p.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 })
          )
        : p.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 }));

      if (!response) throw new ScraperError('No response from Copart search page');
      if (response.status() === 429 || response.status() === 403) {
        const retryAfterMs = await this.getRetryAfterMs(response);
        throw new RateLimitError(`HTTP ${response.status()} from Copart`, retryAfterMs);
      }

      if (await isCaptchaPage(p)) {
        throw new CaptchaError('Copart CAPTCHA detected on search page');
      }

      await simulateMouseMovement(p);
      await randomDelay(1000, 2000);

      const intercepted = interceptor.getSearchResult();
      let lots = intercepted?.lots ?? [];

      if (lots.length === 0) {
        const rawJson = await this.extractPageJson(p);
        if (rawJson) {
          lots = parseSearchResults(rawJson);
        }
      }

      const limit = params.limit ?? 50;
      const listings = toAuctionListings(lots.slice(0, limit));

      await this.cache.setSearch(cacheKey, listings);
      return { data: listings, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
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

  async getListing(lotNumber: string): Promise<ScraperResult<AuctionListing>> {
    const cached = await this.cache.getListing(lotNumber);
    if (cached) {
      return { data: cached.data, cached: true, stale: false, cachedAt: cached.fetched_at };
    }

    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new CopartInterceptor();
      interceptor.attach(p);

      const url = `${BASE_URL}/lot/${lotNumber}`;
      const response = await (this.rateLimiter
        ? this.rateLimiter.execute(() => p.goto(url, { waitUntil: 'networkidle', timeout: 30000 }))
        : p.goto(url, { waitUntil: 'networkidle', timeout: 30000 }));

      if (!response) throw new ScraperError('No response from Copart listing page');
      if (response.status() === 404)
        throw new ScraperError(`Lot ${lotNumber} not found`, 'SCRAPER_ERROR', false);
      if (response.status() === 429 || response.status() === 403) {
        const retryAfterMs = await this.getRetryAfterMs(response);
        throw new RateLimitError(`HTTP ${response.status()} from Copart`, retryAfterMs);
      }

      if (await isCaptchaPage(p)) {
        throw new CaptchaError('Copart CAPTCHA detected on listing page');
      }

      await simulateMouseMovement(p);
      await randomDelay(500, 1500);

      const interceptedLot = interceptor.getListing();
      let listing: AuctionListing;

      if (interceptedLot) {
        listing = toAuctionListing(interceptedLot);
      } else {
        const rawLot = parseListing(await this.extractPageJson(p));
        if (!rawLot) throw new ScraperError(`Could not extract listing data for lot ${lotNumber}`);
        listing = toAuctionListing(rawLot);
      }

      await this.cache.setListing(lotNumber, listing);
      return { data: listing, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
      const stale = await this.cache.getListing(lotNumber, true);
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

  async getImages(lotNumber: string): Promise<ScraperResult<string[]>> {
    const cachedListing = await this.cache.getListing(lotNumber);
    if (cachedListing?.data.image_urls?.length) {
      return {
        data: cachedListing.data.image_urls,
        cached: true,
        stale: false,
        cachedAt: cachedListing.fetched_at,
      };
    }

    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new CopartInterceptor();
      interceptor.attach(p);

      const url = `${BASE_URL}/lot/${lotNumber}`;
      await (this.rateLimiter
        ? this.rateLimiter.execute(() => p.goto(url, { waitUntil: 'networkidle', timeout: 30000 }))
        : p.goto(url, { waitUntil: 'networkidle', timeout: 30000 }));

      if (await isCaptchaPage(p)) {
        throw new CaptchaError('Copart CAPTCHA detected');
      }

      await randomDelay(500, 1500);

      const interceptedLot = interceptor.getListing();
      if (interceptedLot) {
        const urls = parseImageUrls(interceptedLot);
        if (urls.length) return { data: urls, cached: false, stale: false, cachedAt: null };
      }

      const rawLot = parseListing(await this.extractPageJson(p));
      const urls = rawLot ? parseImageUrls(rawLot) : [];
      return { data: urls, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
      const stale = await this.cache.getListing(lotNumber, true);
      if (stale?.data.image_urls?.length) {
        return {
          data: stale.data.image_urls,
          cached: true,
          stale: true,
          cachedAt: stale.fetched_at,
        };
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

  async getSoldHistory(params: CopartSoldParams): Promise<ScraperResult<CopartSoldEntry[]>> {
    const cacheKey = JSON.stringify({ type: 'sold', ...params });
    const cached = await this.cache.getSoldHistory(cacheKey);
    if (cached) {
      return { data: cached.data, cached: true, stale: false, cachedAt: cached.fetched_at };
    }

    let page: import('playwright').Page | null = null;
    try {
      const p = await this.browser.getPage();
      page = p;
      const interceptor = new CopartInterceptor();
      interceptor.attach(p);

      const url = new URL(`${BASE_URL}/vehicleFinderSection.do`);
      url.searchParams.set('searchCriteria', `${params.make} ${params.model}`);
      url.searchParams.set('displayMake', params.make);
      url.searchParams.set('displayModel', params.model);
      if (params.year_min) url.searchParams.set('yearFrom', String(params.year_min));
      if (params.year_max) url.searchParams.set('yearTo', String(params.year_max));
      url.searchParams.set('sold', 'true');

      await (this.rateLimiter
        ? this.rateLimiter.execute(() =>
            p.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 })
          )
        : p.goto(url.toString(), { waitUntil: 'networkidle', timeout: 30000 }));

      if (await isCaptchaPage(p)) {
        throw new CaptchaError('Copart CAPTCHA detected on sold history page');
      }

      await randomDelay(500, 1500);

      const intercepted = interceptor.getSearchResult();
      let entries: CopartSoldEntry[] = [];

      if (intercepted?.lots) {
        entries = parseSoldHistory({ data: { results: intercepted.lots } });
      } else {
        const rawJson = await this.extractPageJson(p);
        entries = parseSoldHistory(rawJson);
      }

      const limit = params.limit ?? 100;
      entries = entries.slice(0, limit);

      await this.cache.setSoldHistory(cacheKey, entries);
      return { data: entries, cached: false, stale: false, cachedAt: null };
    } catch (err) {
      if (err instanceof CaptchaError || err instanceof RateLimitError) throw err;
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

  private async getRetryAfterMs(response: Response): Promise<number> {
    const fallbackMs = 60000;
    const retryAfterHeader = (await response.headerValue('retry-after').catch(() => null))?.trim();
    if (!retryAfterHeader) return fallbackMs;

    const retryAfterSeconds = Number(retryAfterHeader);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.round(retryAfterSeconds * 1000);
    }

    const retryAfterDateMs = Date.parse(retryAfterHeader);
    if (!Number.isNaN(retryAfterDateMs)) {
      const deltaMs = retryAfterDateMs - Date.now();
      return deltaMs > 0 ? deltaMs : 0;
    }

    return fallbackMs;
  }

  private async extractPageJson(page: import('playwright').Page): Promise<unknown> {
    try {
      return await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script'));
        for (const s of scripts) {
          const text = s.textContent ?? '';
          if (
            text.includes('lotNumberStr') ||
            text.includes('"fv"') ||
            text.includes('window.__INITIAL_STATE__')
          ) {
            const match =
              text.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s) ??
              text.match(/(\{.*?"lotNumberStr".*?\})/s);
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
}
