/**
 * IAAI Scraper MCP — entry point
 */
import { initTracing } from '@car-auctions/shared';
import type { McpServerOptions } from '@car-auctions/shared';
import { IaaiBrowser } from './scraper/browser.js';
import { IaaiClient } from './scraper/iaai-client.js';
import { IaaiSqliteCache } from './cache/sqlite.js';
import { MemoryCache } from './cache/memory.js';
import { ImageCache } from './cache/image-cache.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { config } from './utils/config.js';
import { createServer } from './server.js';

// ─── Transport resolution ─────────────────────────────────────────────────────

const TRANSPORT_ALIASES: Record<string, McpServerOptions['transport']> = {
  stdio: 'stdio',
  sse: 'sse',
  ws: 'websocket',
  websocket: 'websocket',
};

function resolveTransport(): McpServerOptions['transport'] {
  const raw = (process.env['TRANSPORT'] ?? 'stdio').trim().toLowerCase();
  const resolved = TRANSPORT_ALIASES[raw];
  if (!resolved) {
    throw new Error(
      `Config error: invalid TRANSPORT "${raw}". Must be one of: stdio, sse, ws, websocket`
    );
  }
  return resolved;
}

// ─── Credential validation ────────────────────────────────────────────────────

function assertRequiredCredentials(): void {
  const missing: string[] = [];
  if (!process.env['IAAI_EMAIL']) missing.push('IAAI_EMAIL');
  if (!process.env['IAAI_PASSWORD']) missing.push('IAAI_PASSWORD');
  if (missing.length > 0) {
    throw new Error(
      `Config error: missing required environment variable(s): ${missing.join(', ')}`
    );
  }
}

// ─── Resource cleanup helper ──────────────────────────────────────────────────

async function closeResources(browser: IaaiBrowser, cache: IaaiSqliteCache): Promise<void> {
  let firstError: unknown;

  try {
    await browser.close();
  } catch (err) {
    firstError = err;
  }

  try {
    cache.close();
  } catch (err) {
    if (firstError === undefined) {
      firstError = err;
    } else {
      console.error('Error closing cache during shutdown:', err);
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

// ─── Tracing (no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset) ───────────────
initTracing({ serviceName: 'iaai-scraper-mcp' });

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Fail-fast env validation
  assertRequiredCredentials();

  let shuttingDown = false;
  let browser: IaaiBrowser | undefined;
  let cache: IaaiSqliteCache | undefined;

  try {
    // 3. Instantiate all dependencies
    browser = new IaaiBrowser();
    cache = new IaaiSqliteCache();
    const memoryCache = new MemoryCache();
    const imageCache = new ImageCache();
    const rateLimiter = new RateLimiter(config.rateLimit);
    const client = new IaaiClient(browser, cache, memoryCache, imageCache, rateLimiter, config);

    // 5. Select transport from TRANSPORT env var ("ws" is normalized to "websocket")
    const transport = resolveTransport();

    // 4 & 6. Build the MCP server and start listening on the selected transport
    await createServer({ client, cache, imageCache }, transport);

    // Graceful shutdown — guard ensures cleanup runs at most once
    const shutdown = async (): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;

      if (!browser || !cache) {
        process.exitCode = 0;
        return;
      }

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
  } catch (err) {
    if (browser && cache) {
      try {
        await closeResources(browser, cache);
      } catch (cleanupErr) {
        console.error('Error during startup cleanup:', cleanupErr);
      }
    }
    throw err;
  }
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
