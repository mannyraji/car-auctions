/**
 * IAAI Scraper MCP — entry point
 */
import type { AuctionListing } from '@car-auctions/shared';
import { initTracing, MemoryCache, ImageCache, RateLimiter } from '@car-auctions/shared';
import { IaaiBrowser } from './scraper/browser.js';
import { IaaiClient } from './scraper/iaai-client.js';
import { IaaiSqliteCache } from './cache/sqlite.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './utils/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMAGE_CACHE_DIR = path.resolve(__dirname, '..', 'data', 'images');
import { createServer } from './server.js';
import {
  resolveTransport,
  assertRequiredCredentials,
  closeResources,
  startWithCleanup,
} from './bootstrap.js';

// ─── Tracing (no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset) ───────────────
initTracing({ serviceName: 'iaai-scraper-mcp' });

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Fail-fast env validation
  const { email, password } = assertRequiredCredentials();

  // 3. Instantiate all dependencies
  const browser = new IaaiBrowser({ email, password });
  const cache = new IaaiSqliteCache();
  const memoryCache = new MemoryCache<AuctionListing[]>();
  const imageCache = new ImageCache(IMAGE_CACHE_DIR, '.webp');
  const rateLimiter = new RateLimiter(config.rateLimit);
  const credentials = { email, password };
  const client = new IaaiClient(browser, cache, memoryCache, imageCache, rateLimiter, credentials);

  // 5. Resolve transport before startup so a bad TRANSPORT value surfaces early
  const transport = resolveTransport();

  let shuttingDown = false;

  // 4 & 6. Start server; cleanup browser + cache if startup throws
  await startWithCleanup({
    browser,
    cache,
    start: () => createServer({ client, cache, imageCache }, transport),
  });

  // Graceful shutdown — guard ensures cleanup runs at most once
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await closeResources(browser, cache);
      process.exitCode = 0;
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exitCode = 1;
    }
  };

  process.on('SIGINT', () => {
    shutdown()
      .catch(console.error)
      .finally(() => process.exit(process.exitCode ?? 0));
  });
  process.on('SIGTERM', () => {
    shutdown()
      .catch(console.error)
      .finally(() => process.exit(process.exitCode ?? 0));
  });
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
