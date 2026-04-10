/**
 * MCP server registration for IAAI scraper tools
 */
import { z } from 'zod';
import { createMcpServer } from '@car-auctions/shared';

// ─── Injectable dependencies ───────────────────────────────────────────────────

/**
 * Dependencies injected into createServer. Each field will be populated by a
 * concrete implementation as Phases 3–8 land; stubs ignore all deps.
 */
export interface ServerDeps {
  // Populated in Phase 3: scraper client
  client?: unknown;
  // Populated in Phase 4: SQLite cache
  cache?: unknown;
  // Populated in Phase 5: disk image cache
  imageCache?: unknown;
  // Populated in Phase 6: VIN decode cache (shared)
  vinCache?: unknown;
}

// ─── Input schemas ─────────────────────────────────────────────────────────────

export const searchSchema = {
  query: z.string().max(200).describe('Free-text search term'),
  make: z.string().optional().describe('Vehicle make (e.g., "Toyota")'),
  model: z.string().optional().describe('Vehicle model (e.g., "Camry")'),
  year_min: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe('Minimum model year (1900–2100)'),
  year_max: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe('Maximum model year (1900–2100)'),
  zip: z
    .string()
    .regex(/^\d{5}$/)
    .optional()
    .describe('5-digit ZIP code (leading zeros preserved)'),
  radius: z.number().int().positive().optional().describe('Search radius in miles'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results to return (1–100, default 50)'),
};

export const listingSchema = {
  stock_number: z
    .string()
    .regex(/^[A-Za-z0-9]+$/)
    .describe('IAAI stock/lot number (alphanumeric only)'),
};

export const imagesSchema = {
  stock_number: z
    .string()
    .regex(/^[A-Za-z0-9]+$/)
    .describe('IAAI stock/lot number (alphanumeric only)'),
  max_images: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of images to return (1–50, default 20)'),
  image_types: z
    .array(z.enum(['exterior', 'interior', 'damage', 'engine', 'undercarriage']))
    .optional()
    .describe('Filter by image category'),
};

export const vinSchema = {
  vin: z
    .string()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i)
    .describe('17-character VIN — characters I, O, and Q are not allowed'),
};

export const watchlistSchema = {
  action: z.enum(['add', 'remove', 'list']).describe('Watchlist operation to perform'),
  stock_number: z
    .string()
    .regex(/^[A-Za-z0-9]+$/)
    .optional()
    .describe('IAAI stock number (required for "add" and "remove"; alphanumeric only)'),
  bid_threshold: z
    .number()
    .positive()
    .optional()
    .describe('Alert threshold in USD (positive, unbounded above)'),
  notes: z.string().optional().describe('Optional notes for the watchlist entry'),
};

export const soldSchema = {
  make: z.string().describe('Vehicle make (e.g., "Honda")'),
  model: z.string().describe('Vehicle model (e.g., "Civic")'),
  year_min: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe('Minimum model year (1900–2100)'),
  year_max: z
    .number()
    .int()
    .min(1900)
    .max(2100)
    .optional()
    .describe('Maximum model year (1900–2100)'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Maximum results to return (1–100, default 50)'),
};

// ─── Stub handler ──────────────────────────────────────────────────────────────

/** Shared stub — returned by every tool until real handlers replace it in Phases 3–8. */
function notImplemented(): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  return Promise.resolve({
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ success: false, error: 'not implemented' }),
      },
    ],
  });
}

// ─── Server factory ────────────────────────────────────────────────────────────

/**
 * Instantiate the IAAI scraper MCP server and register all 6 tool slots.
 *
 * The MCP server is created via `createMcpServer` from `@car-auctions/shared`,
 * which uses the `createRequire(import.meta.url)` pattern internally to satisfy
 * the ESM interop requirement for `@modelcontextprotocol/sdk`.
 *
 * All tools are registered as stubs that return `{ success: false, error: "not
 * implemented" }`. Real handlers are wired in during Phases 3–8.
 *
 * @param deps - Injectable dependencies (client, caches) for testability.
 */
export async function createServer(_deps: ServerDeps): Promise<void> {
  const server = await createMcpServer({
    name: 'iaai-scraper-mcp',
    version: '0.1.0',
  });

  server.tool('iaai_search', searchSchema, notImplemented);
  server.tool('iaai_get_listing', listingSchema, notImplemented);
  server.tool('iaai_get_images', imagesSchema, notImplemented);
  server.tool('iaai_decode_vin', vinSchema, notImplemented);
  server.tool('iaai_sold_history', soldSchema, notImplemented);
  server.tool('iaai_watch_listing', watchlistSchema, notImplemented);
}
