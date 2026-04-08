/**
 * Copart Scraper MCP — entry point
 */
import { CopartBrowser } from './scraper/browser.js';
import { CopartClient } from './scraper/copart-client.js';
import { CopartSqliteCache } from './cache/sqlite.js';
import { ImageCache } from './cache/image-cache.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { config } from './utils/config.js';
import { SqliteVinCache } from '@car-auctions/shared';
import { createCopartServer } from './server.js';

async function main(): Promise<void> {
  const browser = new CopartBrowser();
  const cache = new CopartSqliteCache();
  const imageCache = new ImageCache();
  const vinCache = new SqliteVinCache();
  const rateLimiter = new RateLimiter(config.rateLimit);
  const client = new CopartClient(browser, cache, rateLimiter);

  await createCopartServer(client, cache, imageCache, vinCache);

  const shutdown = async (): Promise<void> => {
    await browser.close();
    cache.close();
    process.exit(0);
  };
  process.on('SIGINT', () => {
    shutdown().catch(console.error);
  });
  process.on('SIGTERM', () => {
    shutdown().catch(console.error);
  });
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
