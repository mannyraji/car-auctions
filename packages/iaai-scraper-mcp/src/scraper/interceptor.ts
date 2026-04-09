/**
 * Network interceptor for IAAI internal APIs
 * Captures XHR/fetch responses from /inventorySearch and /stockDetails
 */
import type { Page, Response } from 'playwright';
import type { IaaiSearchParams, IaaiSoldParams, IaaiRawStockData } from '../types/index.js';

const SEARCH_PATTERNS = ['/inventorySearch', '/InventorySearch'];
const LISTING_PATTERNS = ['/stockDetails', '/StockDetails', '/VehicleDetail'];
const INTERCEPT_TIMEOUT_MS = 15000;

export interface IaaiSearchPayload {
  items: IaaiRawStockData[];
  totalCount: number;
  startIndex: number;
  pageSize: number;
}

export class IaaiInterceptor {
  private capturedSearch: IaaiSearchPayload | null = null;
  private capturedListing: IaaiRawStockData | null = null;

  attach(page: Page): void {
    page.on('response', (response: Response) => {
      this.handleResponse(response).catch((err) => {
        console.warn(
          'IAAI interceptor response handling failed:',
          err instanceof Error ? err.message : err
        );
      });
    });
  }

  private async handleResponse(response: Response): Promise<void> {
    const url = response.url();
    const isSearch = SEARCH_PATTERNS.some((p) => url.includes(p));
    const isListing = LISTING_PATTERNS.some((p) => url.includes(p));
    if (!isSearch && !isListing) return;

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return;
    }

    if (isSearch) {
      const data = json as Record<string, unknown>;
      const items = (data['items'] ?? data['results'] ?? []) as IaaiRawStockData[];
      this.capturedSearch = {
        items: Array.isArray(items) ? items : [],
        totalCount:
          typeof data['totalCount'] === 'number'
            ? data['totalCount']
            : (items as IaaiRawStockData[]).length,
        startIndex: typeof data['startIndex'] === 'number' ? data['startIndex'] : 0,
        pageSize: typeof data['pageSize'] === 'number' ? data['pageSize'] : 20,
      };
    } else if (isListing) {
      const data = json as Record<string, unknown>;
      this.capturedListing = (data['stockDetails'] ?? data['vehicle'] ?? data) as IaaiRawStockData;
    }
  }

  getSearchResult(): IaaiSearchPayload | null {
    const result = this.capturedSearch;
    this.capturedSearch = null;
    return result;
  }

  getListing(): IaaiRawStockData | null {
    const result = this.capturedListing;
    this.capturedListing = null;
    return result;
  }

  reset(): void {
    this.capturedSearch = null;
    this.capturedListing = null;
  }

  /**
   * Intercept search XHR and resolve with payload, or null on timeout.
   * Uses a Promise-based approach with configurable timeout.
   */
  interceptSearch(page: Page, _params: IaaiSearchParams): Promise<IaaiSearchPayload | null> {
    return new Promise<IaaiSearchPayload | null>((resolve) => {
      const timer = setTimeout(() => {
        page.removeAllListeners('response');
        resolve(null);
      }, INTERCEPT_TIMEOUT_MS);

      const handler = (response: Response): void => {
        const url = response.url();
        if (!SEARCH_PATTERNS.some((p) => url.includes(p))) return;
        clearTimeout(timer);
        page.removeListener('response', handler);
        response
          .json()
          .then((json) => {
            const data = json as Record<string, unknown>;
            const items = (data['items'] ?? data['results'] ?? []) as IaaiRawStockData[];
            resolve({
              items: Array.isArray(items) ? items : [],
              totalCount:
                typeof data['totalCount'] === 'number' ? data['totalCount'] : items.length,
              startIndex: typeof data['startIndex'] === 'number' ? data['startIndex'] : 0,
              pageSize: typeof data['pageSize'] === 'number' ? data['pageSize'] : 20,
            });
          })
          .catch(() => resolve(null));
      };

      page.on('response', handler);
    });
  }

  /**
   * Intercept listing detail XHR and resolve with payload, or null on timeout.
   */
  interceptListing(page: Page, _stockNumber: string): Promise<IaaiRawStockData | null> {
    return new Promise<IaaiRawStockData | null>((resolve) => {
      const timer = setTimeout(() => {
        page.removeAllListeners('response');
        resolve(null);
      }, INTERCEPT_TIMEOUT_MS);

      const handler = (response: Response): void => {
        const url = response.url();
        if (!LISTING_PATTERNS.some((p) => url.includes(p))) return;
        clearTimeout(timer);
        page.removeListener('response', handler);
        response
          .json()
          .then((json) => {
            const data = json as Record<string, unknown>;
            resolve(
              (data['stockDetails'] ?? data['vehicle'] ?? data) as IaaiRawStockData
            );
          })
          .catch(() => resolve(null));
      };

      page.on('response', handler);
    });
  }

  /**
   * Intercept sold history XHR and resolve with payload, or null on timeout.
   */
  interceptSold(page: Page, _params: IaaiSoldParams): Promise<IaaiSearchPayload | null> {
    return new Promise<IaaiSearchPayload | null>((resolve) => {
      const timer = setTimeout(() => {
        page.removeAllListeners('response');
        resolve(null);
      }, INTERCEPT_TIMEOUT_MS);

      const handler = (response: Response): void => {
        const url = response.url();
        if (!SEARCH_PATTERNS.some((p) => url.includes(p))) return;
        clearTimeout(timer);
        page.removeListener('response', handler);
        response
          .json()
          .then((json) => {
            const data = json as Record<string, unknown>;
            const items = (data['items'] ?? data['results'] ?? []) as IaaiRawStockData[];
            resolve({
              items: Array.isArray(items) ? items : [],
              totalCount:
                typeof data['totalCount'] === 'number' ? data['totalCount'] : items.length,
              startIndex: typeof data['startIndex'] === 'number' ? data['startIndex'] : 0,
              pageSize: typeof data['pageSize'] === 'number' ? data['pageSize'] : 20,
            });
          })
          .catch(() => resolve(null));
      };

      page.on('response', handler);
    });
  }
}
