/**
 * MCP server registration for IAAI scraper tools
 *
 * Registers 6 tool stubs: iaai_search, iaai_get_listing, iaai_get_images,
 * iaai_decode_vin, iaai_watch_listing, iaai_sold_history.
 * Full implementation: T017.
 */
import { createMcpServer } from '@car-auctions/shared';
import type { McpServerOptions } from '@car-auctions/shared';
import type { IaaiClient } from './scraper/iaai-client.js';
import type { IaaiSqliteCache } from './cache/sqlite.js';
import type { ImageCache } from './cache/image-cache.js';

export interface IaaiServerDeps {
  client: IaaiClient;
  cache: IaaiSqliteCache;
  imageCache: ImageCache;
}

export async function createServer(
  _deps: IaaiServerDeps,
  transport?: McpServerOptions['transport']
): Promise<void> {
  await createMcpServer(
    {
      name: 'iaai-scraper-mcp',
      version: '0.1.0',
      transport,
    },
    (server) => {
      // Tool stubs — replaced by real handlers in Phases 3–8 (T021, T024, T026, T028, T030, T033)
      const notImplemented = (): { content: Array<{ type: 'text'; text: string }> } => ({
        content: [
          { type: 'text', text: JSON.stringify({ success: false, error: 'not implemented' }) },
        ],
      });

      server.tool('iaai_search', {}, notImplemented);
      server.tool('iaai_get_listing', {}, notImplemented);
      server.tool('iaai_get_images', {}, notImplemented);
      server.tool('iaai_decode_vin', {}, notImplemented);
      server.tool('iaai_watch_listing', {}, notImplemented);
      server.tool('iaai_sold_history', {}, notImplemented);
    }
  );
}
