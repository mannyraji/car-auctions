/**
 * Network interceptor for Copart internal APIs
 * Captures XHR/fetch responses from Copart's API endpoints
 */
import type { Page, Response } from 'playwright';
import type { CopartRawLotData, CopartSearchResult } from '../types/index.js';

const COPART_API_PATTERNS = [
  '/public/lots/search/',
  '/public/lots/',
  '/vcr/public/lots/',
  '/public/vehicleDetails/',
];

export class CopartInterceptor {
  private capturedSearchResult: CopartSearchResult | null = null;
  private capturedListing: CopartRawLotData | null = null;

  attach(page: Page): void {
    page.on('response', (response: Response) => {
      this.handleResponse(response).catch((err) => {
        console.warn(
          'Interceptor response handling failed:',
          err instanceof Error ? err.message : err
        );
      });
    });
  }

  private async handleResponse(response: Response): Promise<void> {
    const url = response.url();
    const isApiCall = COPART_API_PATTERNS.some((pattern) => url.includes(pattern));
    if (!isApiCall) return;

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return;
    }

    if (url.includes('/search/') || url.includes('search')) {
      const data = json as Record<string, unknown>;
      if (data['data'] !== undefined) {
        const inner = data['data'] as Record<string, unknown>;
        const results = (inner['results'] ?? inner['content'] ?? inner) as Record<string, unknown>;
        const lots = (results['content'] ?? results['results'] ?? []) as CopartRawLotData[];
        this.capturedSearchResult = {
          lots,
          totalCount: (results['totalElements'] as number | undefined) ?? lots.length,
          page: (results['number'] as number | undefined) ?? 0,
          pageSize: (results['size'] as number | undefined) ?? lots.length,
        };
      }
    } else if (url.includes('/item') || url.includes('vehicleDetails')) {
      const data = json as Record<string, unknown>;
      const lot = (data['data'] ?? data) as CopartRawLotData;
      this.capturedListing = lot;
    }
  }

  getSearchResult(): CopartSearchResult | null {
    const result = this.capturedSearchResult;
    this.capturedSearchResult = null;
    return result;
  }

  getListing(): CopartRawLotData | null {
    const result = this.capturedListing;
    this.capturedListing = null;
    return result;
  }

  reset(): void {
    this.capturedSearchResult = null;
    this.capturedListing = null;
  }
}
