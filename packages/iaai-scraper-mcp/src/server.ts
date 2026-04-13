/**
 * MCP server registration for IAAI scraper tools
 *
 * Registers 6 tool stubs with validated input schemas: iaai_search,
 * iaai_get_listing, iaai_get_images, iaai_decode_vin, iaai_watch_listing,
 * iaai_sold_history.  Full handler implementations: T021–T033.
 */
import { z } from 'zod';
import { createMcpServer } from '@car-auctions/shared';
import type { McpServerOptions } from '@car-auctions/shared';
import type { IaaiClient } from './scraper/iaai-client.js';
import type { IaaiSqliteCache } from './cache/sqlite.js';
import type { ImageCache } from './cache/image-cache.js';

// ─── Input schemas ────────────────────────────────────────────────────────────

const lotNumberSchema = z.string().regex(/^[a-zA-Z0-9]+$/, 'Lot number must be alphanumeric');

const vinSchema = z
  .string()
  .length(17)
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, 'VIN must be 17 alphanumeric chars, no I, O, or Q');

export const searchSchema = z.object({
  query: z.string().min(1).describe('Search query (make, model, year, etc.)'),
  year_min: z.number().int().min(1900).max(2100).optional(),
  year_max: z.number().int().min(1900).max(2100).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  zip: z
    .string()
    .regex(/^\d{5}$/, 'Zip code must be 5 digits')
    .optional(),
  radius: z.number().positive().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listingSchema = z.object({
  lot_number: lotNumberSchema.describe('IAAI stock number'),
});

export const imagesSchema = z.object({
  stock_number: lotNumberSchema.describe('IAAI stock number'),
});

export const decodeVinSchema = z.object({
  vin: vinSchema.describe('17-character VIN'),
});

export const watchListingSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add').describe('Watchlist action'),
    lot_number: lotNumberSchema,
    bid_threshold: z.number().positive().optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('remove').describe('Watchlist action'),
    lot_number: lotNumberSchema,
  }),
  z.object({
    action: z.literal('list').describe('Watchlist action'),
  }),
]);

export const soldHistorySchema = z.object({
  make: z.string().min(1).describe('Vehicle make'),
  model: z.string().min(1).describe('Vehicle model'),
  year_min: z.number().int().min(1900).max(2100).optional(),
  year_max: z.number().int().min(1900).max(2100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// ─── Server deps ──────────────────────────────────────────────────────────────

export interface IaaiServerDeps {
  client: IaaiClient;
  cache: IaaiSqliteCache;
  imageCache: ImageCache;
}

// ─── Server factory ───────────────────────────────────────────────────────────

export async function createServer(
  _deps: IaaiServerDeps,
  transport?: McpServerOptions['transport']
): Promise<void> {
  // Tool stubs — replaced by real handlers in Phases 3–8 (T021, T024, T026, T028, T030, T033)
  const notImplemented = (): { content: Array<{ type: 'text'; text: string }> } => ({
    content: [{ type: 'text', text: JSON.stringify({ success: false, error: 'not implemented' }) }],
  });

  await createMcpServer(
    {
      name: 'iaai-scraper-mcp',
      version: '0.1.0',
      transport,
    },
    (server) => {
      server.tool('iaai_search', searchSchema, notImplemented);
      server.tool('iaai_get_listing', listingSchema, notImplemented);
      server.tool('iaai_get_images', imagesSchema, notImplemented);
      server.tool('iaai_decode_vin', decodeVinSchema, notImplemented);
      server.tool('iaai_watch_listing', watchListingSchema, notImplemented);
      server.tool('iaai_sold_history', soldHistorySchema, notImplemented);
    }
  );
}
