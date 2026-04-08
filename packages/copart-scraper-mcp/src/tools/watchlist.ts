/**
 * MCP tool: copart_watch_listing
 */
import { z } from 'zod';
import type { CopartSqliteCache } from '../cache/sqlite.js';
import {
  buildToolResponse,
  toToolError,
  createTextResponse,
  createSuccessResponse,
} from '../utils/tool-response.js';

const lotNumberSchema = z.string().regex(/^[a-zA-Z0-9]+$/);

export const watchlistInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add').describe('Watchlist operation'),
    lot_number: lotNumberSchema,
    bid_threshold: z.number().positive().optional(),
    notes: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('remove').describe('Watchlist operation'),
    lot_number: lotNumberSchema,
  }),
  z.object({
    action: z.literal('list').describe('Watchlist operation'),
  }),
]);

const watchlistSchema = watchlistInputSchema;
export { watchlistSchema };
export type WatchlistInput = z.infer<typeof watchlistSchema>;

export function createWatchlistHandler(cache: CopartSqliteCache) {
  return async (args: unknown): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    const parsed = watchlistSchema.safeParse(args);
    if (!parsed.success) {
      return createTextResponse(
        buildToolResponse<null>({
          success: false,
          data: null,
          error: toToolError(parsed.error, 'copart_watch_listing'),
        })
      );
    }

    switch (parsed.data.action) {
      case 'add': {
        cache.watchlistAdd({
          lot_number: parsed.data.lot_number,
          bid_threshold: parsed.data.bid_threshold,
          notes: parsed.data.notes,
        });
        const entry = cache.watchlistGet(parsed.data.lot_number);
        return createSuccessResponse(entry);
      }
      case 'remove': {
        const removed = cache.watchlistRemove(parsed.data.lot_number);
        if (!removed) {
          return createTextResponse(
            buildToolResponse<null>({
              success: false,
              data: null,
              error: {
                code: 'NOT_FOUND',
                message: `Lot ${parsed.data.lot_number} not in watchlist`,
                retryable: false,
                retryAfterMs: null,
              },
            })
          );
        }
        return createSuccessResponse(null);
      }
      case 'list': {
        const entries = cache.watchlistList();
        return createSuccessResponse(entries);
      }
    }
  };
}
