/**
 * IAAI scraper client — orchestrates browser, interceptor, parser, and caches
 *
 * Full implementation: T016.
 */
import type { IaaiBrowser } from './browser.js';
import type { IaaiSqliteCache } from '../cache/sqlite.js';
import type { MemoryCache } from '../cache/memory.js';
import type { ImageCache } from '../cache/image-cache.js';
import type { RateLimiter } from '../utils/rate-limiter.js';
import type { IaaiConfig } from '../utils/config.js';

export class IaaiClient {
  constructor(
    _browser: IaaiBrowser,
    _cache: IaaiSqliteCache,
    _memoryCache: MemoryCache,
    _imageCache: ImageCache,
    _rateLimiter: RateLimiter,
    _config?: IaaiConfig
  ) {}
}
