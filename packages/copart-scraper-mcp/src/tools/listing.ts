/**
 * MCP tool: copart_get_listing
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

export const listingInputSchema = {
  lot_number: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/)
    .describe('Copart lot number'),
};

const listingSchema = z.object(listingInputSchema);
export { listingSchema };
export type ListingInput = z.infer<typeof listingSchema>;

export function createListingHandler(client: CopartClient) {
  return async (
    args: ListingInput
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    const parsed = listingSchema.safeParse(args);
    if (!parsed.success) {
      return createErrorResponse(parsed.error, 'copart_get_listing');
    }

    try {
      const result = await client.getListing(parsed.data.lot_number);
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
