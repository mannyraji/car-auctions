/**
 * Network interceptor for IAAI internal APIs
 *
 * Captures XHR/fetch responses from IAAI's internal JSON endpoints using
 * Promise-based page.route() interception.  Each public method registers a
 * one-shot route handler, awaits the first matching response within the
 * configured timeout, then unregisters the handler and resolves the Promise.
 *
 * A null return value signals the caller to fall back to DOM scraping.
 */
import type { Page, Route } from 'playwright';
import type {
  IaaiSearchResult,
  IaaiRawStockData,
  IaaiSearchParams,
  IaaiSoldParams,
} from '../types/index.js';

// ─── URL patterns (Playwright glob syntax) ─────────────────────────────────────

const INVENTORY_SEARCH_GLOB = '**/inventorySearch**';
const STOCK_DETAILS_GLOB = '**/stockDetails**';
const VEHICLE_DETAIL_GLOB = '**/VehicleDetail/**';

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Public options interface ─────────────────────────────────────────────────

export interface IaaiInterceptorOptions {
  /** Timeout (ms) for interceptSearch(). Defaults to 15 000. */
  searchTimeoutMs?: number;
  /** Timeout (ms) for interceptListing(). Defaults to 15 000. */
  listingTimeoutMs?: number;
  /** Timeout (ms) for interceptSold(). Defaults to 15 000. */
  soldTimeoutMs?: number;
}

// ─── Interceptor class ────────────────────────────────────────────────────────

export class IaaiInterceptor {
  private readonly searchTimeoutMs: number;
  private readonly listingTimeoutMs: number;
  private readonly soldTimeoutMs: number;

  constructor(options: IaaiInterceptorOptions = {}) {
    this.searchTimeoutMs = options.searchTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.listingTimeoutMs = options.listingTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.soldTimeoutMs = options.soldTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Intercepts the IAAI `/inventorySearch` XHR triggered by a general search.
   *
   * Registers a route handler on `page` and resolves with the raw JSON payload
   * when a non-SOLD response is captured. Resolves with `null` on timeout,
   * signalling that the caller should fall back to DOM scraping.
   *
   * @param page - Playwright page on which the navigation will happen.
   * @param _params - Search parameters (unused by the interceptor; provided for
   *   symmetry with the client API and future URL-based filtering).
   */
  async interceptSearch(page: Page, _params: IaaiSearchParams): Promise<IaaiSearchResult | null> {
    return this.captureRoute<IaaiSearchResult>(
      page,
      INVENTORY_SEARCH_GLOB,
      this.searchTimeoutMs,
      (url) => {
        const status = url.searchParams.get('saleStatus');
        return !status || status.toUpperCase() !== 'SOLD';
      }
    );
  }

  /**
   * Intercepts either the `/stockDetails` or `/VehicleDetail` XHR that IAAI
   * fires when rendering a vehicle detail page.
   *
   * Registers route handlers for both URL patterns; the first response that
   * arrives wins and the Promise resolves. Resolves with `null` on timeout.
   *
   * @param page - Playwright page on which the navigation will happen.
   * @param _stockNumber - Stock number of the listing (unused by the
   *   interceptor; provided for symmetry with the client API and future
   *   per-lot URL matching).
   */
  async interceptListing(page: Page, _stockNumber: string): Promise<IaaiRawStockData | null> {
    return new Promise<IaaiRawStockData | null>((resolve) => {
      let resolved = false;
      const patterns = [STOCK_DETAILS_GLOB, VEHICLE_DETAIL_GLOB];

      const cleanup = () => {
        for (const pattern of patterns) {
          page.unroute(pattern, handler).catch(() => {});
        }
      };

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, this.listingTimeoutMs);

      const handler = async (route: Route) => {
        try {
          const response = await route.fetch();
          await route.fulfill({ response });
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            cleanup();
            const json = (await response.json()) as IaaiRawStockData;
            resolve(json);
          }
        } catch {
          await route.continue().catch(() => {});
        }
      };

      for (const pattern of patterns) {
        page.route(pattern, handler).catch(() => {
          // Registration failure is handled silently; timeout will fire
        });
      }
    });
  }

  /**
   * Intercepts the IAAI `/inventorySearch` XHR triggered by a sold-history
   * query (i.e. when the request URL carries `saleStatus=SOLD`).
   *
   * Resolves with the raw JSON payload or `null` on timeout.
   *
   * @param page - Playwright page on which the navigation will happen.
   * @param _params - Sold history query parameters (unused by the interceptor;
   *   provided for symmetry with the client API).
   */
  async interceptSold(page: Page, _params: IaaiSoldParams): Promise<IaaiSearchResult | null> {
    return this.captureRoute<IaaiSearchResult>(
      page,
      INVENTORY_SEARCH_GLOB,
      this.soldTimeoutMs,
      (url) => {
        const status = url.searchParams.get('saleStatus');
        return !!status && status.toUpperCase() === 'SOLD';
      }
    );
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Generic one-shot route capture helper.
   *
   * Registers a `page.route()` handler for `urlPattern`. When the first
   * matching request fires (and passes the optional `filter`):
   * 1. Fetches the response via `route.fetch()`.
   * 2. Forwards it to the browser via `route.fulfill()`.
   * 3. Parses and resolves the Promise with the JSON payload.
   *
   * Non-matching requests (filtered out) are forwarded via `route.continue()`.
   * On timeout the handler is unregistered and the Promise resolves with `null`.
   *
   * @param page       - Playwright page.
   * @param urlPattern - Glob pattern passed to `page.route()`.
   * @param timeoutMs  - Milliseconds before resolving with `null`.
   * @param filter     - Optional predicate; returning `false` continues the route.
   */
  private captureRoute<T>(
    page: Page,
    urlPattern: string,
    timeoutMs: number,
    filter?: (url: URL) => boolean
  ): Promise<T | null> {
    return new Promise<T | null>((resolve) => {
      let resolved = false;

      const cleanup = () => {
        page.unroute(urlPattern, handler).catch(() => {});
      };

      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(null);
        }
      }, timeoutMs);

      const handler = async (route: Route) => {
        const reqUrl = new URL(route.request().url());

        if (filter && !filter(reqUrl)) {
          await route.continue();
          return;
        }

        try {
          const response = await route.fetch();
          await route.fulfill({ response });
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            cleanup();
            const json = (await response.json()) as T;
            resolve(json);
          }
        } catch {
          await route.continue().catch(() => {});
        }
      };

      page.route(urlPattern, handler).catch(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve(null);
        }
      });
    });
  }
}
