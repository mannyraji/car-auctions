/**
 * IAAI Scraper MCP — entry point
 */
import { initTracing } from '@car-auctions/shared';
import { IaaiBrowser } from './scraper/browser.js';
import { IaaiClient } from './scraper/iaai-client.js';
import { IaaiSqliteCache } from './cache/sqlite.js';
import { MemoryCache } from './cache/memory.js';
import { ImageCache } from './cache/image-cache.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { config } from './utils/config.js';
import { createServer } from './server.js';
import type { McpServerOptions } from '@car-auctions/shared';

// 1. Fail-fast env validation
const email = process.env['IAAI_EMAIL'];
const password = process.env['IAAI_PASSWORD'];
if (!email || !password) {
  const missing: string[] = [];
  if (!email) missing.push('IAAI_EMAIL');
  if (!password) missing.push('IAAI_PASSWORD');
  console.error(`Config error: missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

// 2. Initialize tracing (no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset)
initTracing({ serviceName: 'iaai-scraper-mcp' });

async function main(): Promise<void> {
  // 3. Instantiate all dependencies
  const browser = new IaaiBrowser();
  const cache = new IaaiSqliteCache();
  const memoryCache = new MemoryCache();
  const imageCache = new ImageCache();
  const rateLimiter = new RateLimiter(config.rateLimit);
  const client = new IaaiClient(browser, cache, memoryCache, imageCache, rateLimiter, config);

  // 5. Select transport from TRANSPORT env var ("ws" is normalized to "websocket")
  const rawTransport = process.env['TRANSPORT'] ?? 'stdio';
  const transport: McpServerOptions['transport'] =
    rawTransport === 'ws' ? 'websocket' : (rawTransport as McpServerOptions['transport']);

  // 4 & 6. Build the MCP server and start listening on the selected transport
  await createServer({ client, cache, imageCache }, transport);

  // Graceful shutdown — guard ensures cleanup runs at most once
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await browser.close();
      cache.close();
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
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
