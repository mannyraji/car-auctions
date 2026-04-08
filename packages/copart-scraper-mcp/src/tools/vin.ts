/**
 * MCP tool: copart_decode_vin
 */
import { z } from 'zod';
import { decodeVin } from '@car-auctions/shared';
import type { VinCache } from '@car-auctions/shared';
import {
  buildToolResponse,
  toToolError,
  createTextResponse,
  createSuccessResponse,
} from '../utils/tool-response.js';

export const vinInputSchema = {
  vin: z
    .string()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i, 'VIN must be 17 alphanumeric chars, no I, O, or Q'),
};

const vinSchema = z.object(vinInputSchema);
export { vinSchema };
export type VinInput = z.infer<typeof vinSchema>;

export function createVinHandler(vinCache: VinCache) {
  return async (args: VinInput): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
    // Re-validate here so the handler is safe even when called directly (e.g., in tests)
    const parsed = vinSchema.safeParse(args);
    if (!parsed.success) {
      return createTextResponse(
        buildToolResponse<null>({
          success: false,
          data: null,
          error: toToolError(parsed.error, 'copart_decode_vin'),
        })
      );
    }

    try {
      const result = await decodeVin(parsed.data.vin, { cache: vinCache });
      return createSuccessResponse(result);
    } catch (err) {
      return createTextResponse(
        buildToolResponse<null>({
          success: false,
          data: null,
          error: {
            code: 'VIN_DECODE_ERROR',
            message: err instanceof Error ? err.message : 'VIN decode failed',
            retryable: false,
            retryAfterMs: null,
          },
        })
      );
    }
  };
}
