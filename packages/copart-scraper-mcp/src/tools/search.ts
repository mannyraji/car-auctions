/**
 * MCP tool: copart_search
 */
import { z } from 'zod';
import type { CopartClient } from '../scraper/copart-client.js';
import { CaptchaError, RateLimitError, ScraperError } from '@car-auctions/shared';
import {
  buildToolResponse,
  toToolError,
  createTextResponse,
  createSuccessResponse,
} from '../utils/tool-response.js';

export const searchInputSchema = {
  query: z.string().min(1).describe('Search query (make, model, year, etc.)'),
  year_min: z.number().int().min(1900).max(2100).optional(),
  year_max: z.number().int().min(1900).max(2100).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  zip: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  radius: z.number().positive().optional(),
  limit: z.number().int().min(1).max(50).optional(),
};

const searchSchema = z.object(searchInputSchema);
export { searchSchema };
export type SearchInput = z.infer<typeof searchSchema>;

export function createSearchHandler(client: CopartClient) {
  return async (args: SearchInput): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    const parsedArgs = searchSchema.safeParse(args);
    if (!parsedArgs.success) {
      return createTextResponse(
        buildToolResponse<null>({
          success: false,
          data: null,
          error: toToolError(parsedArgs.error, 'copart_search'),
        })
      );
    }

    try {
      const result = await client.search(parsedArgs.data);
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
