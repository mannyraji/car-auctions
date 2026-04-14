/**
 * MCP tool: copart_get_images
 */
import { z } from 'zod';
import type { CopartClient } from '../scraper/copart-client.js';
import { fetchImageAsBase64 } from '../utils/image-utils.js';
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';
import type { ImageCache } from '@car-auctions/shared';
import {
  buildToolResponse,
  toToolError,
  createTextResponse,
  createSuccessResponse,
  createErrorResponse,
} from '../utils/tool-response.js';

export const imagesInputSchema = {
  lot_number: z
    .string()
    .regex(/^[a-zA-Z0-9]+$/)
    .describe('Copart lot number'),
};

const imagesSchema = z.object(imagesInputSchema);
export { imagesSchema };
export type ImagesInput = z.infer<typeof imagesSchema>;

export function createImagesHandler(client: CopartClient, imageCache: ImageCache) {
  return async (args: ImagesInput): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    const parsed = imagesSchema.safeParse(args);
    if (!parsed.success) {
      return createErrorResponse(parsed.error, 'copart_get_images');
    }

    try {
      const result = await client.getImages(parsed.data.lot_number);
      const images = await Promise.all(
        result.data.map(async (url, i) => ({
          url,
          category: i === 0 ? 'primary' : `view_${i}`,
          base64: await fetchImageAsBase64(url, imageCache),
        }))
      );
      return createSuccessResponse(
        { lot_number: parsed.data.lot_number, images },
        { cached: result.cached, stale: result.stale, cachedAt: result.cachedAt }
      );
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
