/**
 * Tests for IaaiInterceptor
 *
 * Exercises the three public methods (interceptSearch, interceptListing,
 * interceptSold) by mocking Playwright's Page and Route objects. Each test
 * scenario verifies:
 *  - JSON payload is returned when the route fires in time.
 *  - null is returned on timeout (no route fires).
 *  - Requests that don't pass the filter are forwarded via route.continue().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IaaiInterceptor } from '../src/scraper/interceptor.js';
import type { IaaiSearchParams, IaaiSoldParams } from '../src/types/index.js';

// ─── Fixtures (from tests/fixtures/) ─────────────────────────────────────────

import searchFixture from './fixtures/iaai-search-response.json';
import listingFixture from './fixtures/iaai-listing-response.json';
import soldFixture from './fixtures/iaai-sold-response.json';

// ─── Mock builders ────────────────────────────────────────────────────────────

/**
 * Build a minimal Playwright Route mock.
 * `responseJson` is what `route.fetch()` → `response.json()` returns.
 * `requestUrl` is the URL that `route.request().url()` returns.
 */
function makeRoute(requestUrl: string, responseJson: unknown) {
  const responseMock = {
    json: vi.fn().mockResolvedValue(responseJson),
  };
  const requestMock = {
    url: vi.fn().mockReturnValue(requestUrl),
  };
  return {
    request: vi.fn().mockReturnValue(requestMock),
    fetch: vi.fn().mockResolvedValue(responseMock),
    fulfill: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn().mockResolvedValue(undefined),
    _response: responseMock,
  };
}

type RouteHandler = (route: ReturnType<typeof makeRoute>) => Promise<void>;

/**
 * Build a minimal Playwright Page mock.
 *
 * `route()` stores the handler; `triggerRoute()` (test-only helper) calls the
 * stored handler with the provided route mock so tests can control timing.
 */
function makePage() {
  const handlers: Map<string, RouteHandler[]> = new Map();

  const page = {
    route: vi.fn(async (pattern: string, handler: RouteHandler) => {
      const list = handlers.get(pattern) ?? [];
      list.push(handler);
      handlers.set(pattern, list);
    }),
    unroute: vi.fn().mockResolvedValue(undefined),

    /** Test helper: invoke all handlers registered for `pattern` with `route`. */
    async triggerRoute(pattern: string, route: ReturnType<typeof makeRoute>) {
      const list = handlers.get(pattern) ?? [];
      for (const h of list) {
        await h(route);
      }
    },

    /** Test helper: number of handlers registered for `pattern`. */
    handlerCount(pattern: string) {
      return (handlers.get(pattern) ?? []).length;
    },
  };

  return page;
}

// ─── Shared params ────────────────────────────────────────────────────────────

const searchParams: IaaiSearchParams = { query: 'Toyota Camry' };
const soldParams: IaaiSoldParams = { make: 'Toyota', model: 'Camry' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IaaiInterceptor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── interceptSearch ───────────────────────────────────────────────────────

  describe('interceptSearch()', () => {
    it('resolves with the JSON payload when a matching inventorySearch response fires', async () => {
      const interceptor = new IaaiInterceptor({ searchTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptSearch(page as never, searchParams);

      // Simulate the browser firing the route
      const route = makeRoute(
        'https://www.iaai.com/vehiclesearch/inventorySearch?query=Toyota+Camry',
        searchFixture
      );
      await page.triggerRoute('**/inventorySearch**', route);

      const result = await capturePromise;

      expect(result).toEqual(searchFixture);
      expect(route.fetch).toHaveBeenCalledOnce();
      expect(route.fulfill).toHaveBeenCalledOnce();
    });

    it('resolves with null when the timeout fires before any route', async () => {
      const interceptor = new IaaiInterceptor({ searchTimeoutMs: 100 });
      const page = makePage();

      const capturePromise = interceptor.interceptSearch(page as never, searchParams);

      // Advance time past the timeout without triggering the route
      await vi.advanceTimersByTimeAsync(200);

      const result = await capturePromise;
      expect(result).toBeNull();
    });

    it('forwards SOLD requests via route.continue() (not resolved as a search result)', async () => {
      const interceptor = new IaaiInterceptor({ searchTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptSearch(page as never, searchParams);

      // A SOLD-filtered request should be forwarded, not captured
      const soldRoute = makeRoute(
        'https://www.iaai.com/vehiclesearch/inventorySearch?saleStatus=SOLD&make=Toyota',
        soldFixture
      );
      await page.triggerRoute('**/inventorySearch**', soldRoute);

      expect(soldRoute.continue).toHaveBeenCalledOnce();
      expect(soldRoute.fulfill).not.toHaveBeenCalled();

      // Timeout to clean up the capture promise
      await vi.advanceTimersByTimeAsync(6_000);
      const result = await capturePromise;
      expect(result).toBeNull();
    });

    it('calls page.unroute() after capturing the response', async () => {
      const interceptor = new IaaiInterceptor({ searchTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptSearch(page as never, searchParams);

      const route = makeRoute('https://www.iaai.com/vehiclesearch/inventorySearch', searchFixture);
      await page.triggerRoute('**/inventorySearch**', route);
      await capturePromise;

      expect(page.unroute).toHaveBeenCalled();
    });

    it('calls page.unroute() on timeout', async () => {
      const interceptor = new IaaiInterceptor({ searchTimeoutMs: 100 });
      const page = makePage();

      const capturePromise = interceptor.interceptSearch(page as never, searchParams);
      await vi.advanceTimersByTimeAsync(200);
      await capturePromise;

      expect(page.unroute).toHaveBeenCalled();
    });
  });

  // ─── interceptListing ─────────────────────────────────────────────────────

  describe('interceptListing()', () => {
    it('resolves with the JSON payload when a stockDetails response fires', async () => {
      const interceptor = new IaaiInterceptor({ listingTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptListing(page as never, 'A12345678');

      const route = makeRoute(
        'https://www.iaai.com/vehiclesearch/stockDetails?stockNumber=A12345678',
        listingFixture
      );
      await page.triggerRoute('**/stockDetails**', route);

      const result = await capturePromise;
      expect(result).toEqual(listingFixture);
      expect(route.fetch).toHaveBeenCalledOnce();
      expect(route.fulfill).toHaveBeenCalledOnce();
    });

    it('resolves with the JSON payload when a VehicleDetail response fires', async () => {
      const interceptor = new IaaiInterceptor({ listingTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptListing(page as never, 'A12345678');

      const route = makeRoute('https://www.iaai.com/VehicleDetail/A12345678', listingFixture);
      await page.triggerRoute('**/VehicleDetail/**', route);

      const result = await capturePromise;
      expect(result).toEqual(listingFixture);
    });

    it('resolves with null when the timeout fires before any route', async () => {
      const interceptor = new IaaiInterceptor({ listingTimeoutMs: 100 });
      const page = makePage();

      const capturePromise = interceptor.interceptListing(page as never, 'A12345678');

      await vi.advanceTimersByTimeAsync(200);

      const result = await capturePromise;
      expect(result).toBeNull();
    });

    it('registers handlers for both stockDetails and VehicleDetail patterns', async () => {
      const interceptor = new IaaiInterceptor({ listingTimeoutMs: 5_000 });
      const page = makePage();

      interceptor.interceptListing(page as never, 'A12345678').catch(() => {});

      // Allow route() calls to propagate
      await Promise.resolve();

      expect(page.handlerCount('**/stockDetails**')).toBe(1);
      expect(page.handlerCount('**/VehicleDetail/**')).toBe(1);

      // Clean up
      await vi.advanceTimersByTimeAsync(6_000);
    });

    it('calls page.unroute() for both patterns after a successful capture', async () => {
      const interceptor = new IaaiInterceptor({ listingTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptListing(page as never, 'A12345678');

      const route = makeRoute(
        'https://www.iaai.com/vehiclesearch/stockDetails?stockNumber=A12345678',
        listingFixture
      );
      await page.triggerRoute('**/stockDetails**', route);
      await capturePromise;

      // unroute should have been called for both patterns
      const unroutedPatterns = page.unroute.mock.calls.map((c: unknown[]) => c[0]);
      expect(unroutedPatterns).toContain('**/stockDetails**');
      expect(unroutedPatterns).toContain('**/VehicleDetail/**');
    });
  });

  // ─── interceptSold ────────────────────────────────────────────────────────

  describe('interceptSold()', () => {
    it('resolves with the JSON payload when a SOLD inventorySearch response fires', async () => {
      const interceptor = new IaaiInterceptor({ soldTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptSold(page as never, soldParams);

      const route = makeRoute(
        'https://www.iaai.com/vehiclesearch/inventorySearch?saleStatus=SOLD&make=Toyota&model=Camry',
        soldFixture
      );
      await page.triggerRoute('**/inventorySearch**', route);

      const result = await capturePromise;
      expect(result).toEqual(soldFixture);
      expect(route.fetch).toHaveBeenCalledOnce();
      expect(route.fulfill).toHaveBeenCalledOnce();
    });

    it('resolves with null when the timeout fires before any route', async () => {
      const interceptor = new IaaiInterceptor({ soldTimeoutMs: 100 });
      const page = makePage();

      const capturePromise = interceptor.interceptSold(page as never, soldParams);

      await vi.advanceTimersByTimeAsync(200);

      const result = await capturePromise;
      expect(result).toBeNull();
    });

    it('forwards non-SOLD inventorySearch requests via route.continue()', async () => {
      const interceptor = new IaaiInterceptor({ soldTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptSold(page as never, soldParams);

      // A request without saleStatus=SOLD should be forwarded
      const nonSoldRoute = makeRoute(
        'https://www.iaai.com/vehiclesearch/inventorySearch?query=Toyota',
        searchFixture
      );
      await page.triggerRoute('**/inventorySearch**', nonSoldRoute);

      expect(nonSoldRoute.continue).toHaveBeenCalledOnce();
      expect(nonSoldRoute.fulfill).not.toHaveBeenCalled();

      // Timeout to clean up
      await vi.advanceTimersByTimeAsync(6_000);
      const result = await capturePromise;
      expect(result).toBeNull();
    });

    it('accepts case-insensitive saleStatus values (e.g. "sold")', async () => {
      const interceptor = new IaaiInterceptor({ soldTimeoutMs: 5_000 });
      const page = makePage();

      const capturePromise = interceptor.interceptSold(page as never, soldParams);

      const route = makeRoute(
        'https://www.iaai.com/vehiclesearch/inventorySearch?saleStatus=sold',
        soldFixture
      );
      await page.triggerRoute('**/inventorySearch**', route);

      const result = await capturePromise;
      expect(result).toEqual(soldFixture);
    });
  });

  // ─── Constructor defaults ─────────────────────────────────────────────────

  describe('IaaiInterceptorOptions', () => {
    it('uses 15 000 ms as the default timeout for all methods', async () => {
      const interceptor = new IaaiInterceptor();
      const page = makePage();

      // interceptSearch with default timeout (15 s)
      const searchPromise = interceptor.interceptSearch(page as never, searchParams);
      await vi.advanceTimersByTimeAsync(14_999);
      // Should still be pending at 14 999 ms
      let settled = false;
      searchPromise
        .then(() => {
          settled = true;
        })
        .catch(() => {});
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(2);
      const result = await searchPromise;
      expect(result).toBeNull();
    });
  });
});
