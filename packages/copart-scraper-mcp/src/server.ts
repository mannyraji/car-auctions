/**
 * MCP server registration for Copart scraper tools
 */
import { createMcpServer } from '@car-auctions/shared';
import type { CopartClient } from './scraper/copart-client.js';
import type { CopartSqliteCache } from './cache/sqlite.js';
import type { ImageCache, VinCache } from '@car-auctions/shared';
import { createSearchHandler, searchSchema } from './tools/search.js';
import { createListingHandler, listingSchema } from './tools/listing.js';
import { createImagesHandler, imagesSchema } from './tools/images.js';
import { createVinHandler, vinSchema } from './tools/vin.js';
import { createWatchlistHandler, watchlistSchema } from './tools/watchlist.js';
import { createSoldHandler, soldSchema } from './tools/sold.js';

export async function createCopartServer(
  client: CopartClient,
  cache: CopartSqliteCache,
  imageCache: ImageCache,
  vinCache: VinCache
): Promise<void> {
  await createMcpServer(
    {
      name: 'copart-scraper-mcp',
      version: '0.1.0',
    },
    (server) => {
      server.tool('copart_search', searchSchema, createSearchHandler(client));
      server.tool('copart_get_listing', listingSchema, createListingHandler(client));
      server.tool('copart_get_images', imagesSchema, createImagesHandler(client, imageCache));
      server.tool('copart_decode_vin', vinSchema, createVinHandler(vinCache));
      server.tool('copart_watch_listing', watchlistSchema, createWatchlistHandler(cache));
      server.tool('copart_sold_history', soldSchema, createSoldHandler(client));
    }
  );
}
