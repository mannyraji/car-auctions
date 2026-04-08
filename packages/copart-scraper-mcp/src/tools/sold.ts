/**
 * MCP tool: copart_sold_history
 */
import { z } from 'zod';
import type { CopartClient } from '../scraper/copart-client.js';
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';
import {
  buildToolResponse,
  toToolError,
  createTextResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../utils/tool-response.js';

export const soldInputSchema = {
  make: z.string().min(1).describe('Vehicle make'),
  model: z.string().min(1).describe('Vehicle model'),
  year_min: z.number().int().min(1900).max(2100).optional(),
  year_max: z.number().int().min(1900).max(2100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};

const soldSchema = z.object(soldInputSchema);
export { soldSchema };
export type SoldInput = z.infer<typeof soldSchema>;

export function createSoldHandler(client: CopartClient) {
  return async (args: SoldInput): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    const parsed = soldSchema.safeParse(args);
    if (!parsed.success) {
      return createErrorResponse(parsed.error, 'copart_sold_history');
    }

    try {
      const result = await client.getSoldHistory(parsed.data);
      return createSuccessResponse(result.data, {
        cached: result.cached,
        stale: result.stale,
        cachedAt: result.cachedAt,
      });
    } catch (err) {
      if (
        err instanceof CaptchaError ||
        err instanceof RateLimitError ||
        err instanceof ScraperError
      ) {
        return createTextResponse(
          buildToolResponse<null>({ success: false, data: null, error: toToolError(err) })
        );
      }
      throw err;
    }
  };
}
