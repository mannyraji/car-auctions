/**
 * Centralized MCP tool response builder
 *
 * All tool handlers should use these helpers to produce consistently-shaped
 * ToolResponse<T> payloads matching the @car-auctions/shared contract.
 */
import type { ToolError, ToolResponse } from '@car-auctions/shared';
import { ScraperError, CaptchaError, RateLimitError } from '@car-auctions/shared';
import { z } from 'zod';

export function buildToolResponse<T>(params: {
  success: boolean;
  data: T | null;
  error: ToolError | null;
  cached?: boolean;
  stale?: boolean;
  cachedAt?: string | null;
}): ToolResponse<T> {
  return {
    success: params.success,
    data: params.data,
    error: params.error,
    cached: params.cached ?? false,
    stale: params.stale ?? false,
    cachedAt: params.cachedAt ?? null,
    timestamp: new Date().toISOString(),
  };
}

export function toToolError(err: unknown, toolName?: string): ToolError {
  if (err instanceof CaptchaError || err instanceof RateLimitError || err instanceof ScraperError) {
    return err.toToolError();
  }

  if (err instanceof z.ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: `Invalid input${toolName ? ` provided to ${toolName}` : ''}`,
      retryable: false,
      retryAfterMs: null,
    };
  }

  if (err instanceof Error) {
    return {
      code: 'UNKNOWN_ERROR',
      message: 'An internal error occurred',
      retryable: false,
      retryAfterMs: null,
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    retryable: false,
    retryAfterMs: null,
  };
}

export function createTextResponse<T>(response: ToolResponse<T>): {
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
  };
}

/** Build a success MCP content response, optionally with cache metadata. */
export function createSuccessResponse<T>(
  data: T,
  meta?: { cached?: boolean; stale?: boolean; cachedAt?: string | null }
): { content: Array<{ type: 'text'; text: string }> } {
  return createTextResponse(
    buildToolResponse<T>({
      success: true,
      data,
      error: null,
      cached: meta?.cached,
      stale: meta?.stale,
      cachedAt: meta?.cachedAt,
    })
  );
}

/** Build an error MCP content response from any thrown value. */
export function createErrorResponse(
  err: unknown,
  toolName?: string
): { content: Array<{ type: 'text'; text: string }> } {
  return createTextResponse(
    buildToolResponse<null>({
      success: false,
      data: null,
      error: toToolError(err, toolName),
    })
  );
}
