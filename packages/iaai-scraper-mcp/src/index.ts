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

const TRANSPORT_ALIASES: Record<string, McpServerOptions['transport']> = {
  sse: 'sse',
  stdio: 'stdio',
  websocket: 'websocket',
  ws: 'websocket',
};

function assertRequiredCredentials(): void {
  const email = process.env['IAAI_EMAIL'];
  const password = process.env['IAAI_PASSWORD'];

  if (!email || !password) {
    const missing: string[] = [];
    if (!email) missing.push('IAAI_EMAIL');
    if (!password) missing.push('IAAI_PASSWORD');
    throw new Error(
      `Config error: missing required environment variable(s): ${missing.join(', ')}`
    );
  }
}

function resolveTransport(): McpServerOptions['transport'] {
  const rawTransport = (process.env['TRANSPORT'] ?? 'stdio').trim().toLowerCase();
  const transport = TRANSPORT_ALIASES[rawTransport];

  if (!transport) {
    throw new Error(
      `Config error: invalid TRANSPORT "${rawTransport}". Must be one of: stdio, sse, ws, websocket`
    );
  }

  return transport;
}

async function cleanupResources(browser: IaaiBrowser, cache: IaaiSqliteCache): Promise<void> {
  const cleanupErrors: unknown[] = [];

  try {
    await browser.close();
  } catch (err) {
    cleanupErrors.push(err);
  }

  try {
    cache.close();
  } catch (err) {
    cleanupErrors.push(err);
  }

  if (cleanupErrors.length > 0) {
    throw cleanupErrors[0];
  }
}

// 2. Initialize tracing (no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset)
initTracing({ serviceName: 'iaai-scraper-mcp' });

async function main(): Promise<void> {
  // 1. Fail-fast env validation
  assertRequiredCredentials();

  // 3. Instantiate all dependencies
  const browser = new IaaiBrowser();
  const cache = new IaaiSqliteCache();
  const memoryCache = new MemoryCache();
  const imageCache = new ImageCache();
  const rateLimiter = new RateLimiter(config.rateLimit);
  const client = new IaaiClient(browser, cache, memoryCache, imageCache, rateLimiter, config);

  // 5. Select transport from TRANSPORT env var ("ws" is normalized to "websocket")
  const transport = resolveTransport();

  // Graceful shutdown — guard ensures cleanup runs at most once
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await cleanupResources(browser, cache);
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

  try {
    // 4 & 6. Build the MCP server and start listening on the selected transport
    await createServer({ client, cache, imageCache }, transport);
  } catch (err) {
    try {
      await cleanupResources(browser, cache);
    } catch (cleanupErr) {
      console.error('Error during startup cleanup:', cleanupErr);
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error('Fatal error:', err.message);
  } else {
    console.error('Fatal error:', err);
  }
  process.exit(1);
});
