/**
 * Centralized MCP tool response builder for IAAI scraper
 *
 * All tool handlers should use these helpers to produce consistently-shaped
 * ToolResponse<T> payloads matching the @car-auctions/shared contract.
 */
import type { ToolError, ToolResponse } from '@car-auctions/shared';
import {
  ScraperError,
  CaptchaError,
  RateLimitError,
  CacheError,
  withSpan,
} from '@car-auctions/shared';

const TOOL_TIMEOUT_MS = 60_000;

type ContentResponse = { content: Array<{ type: 'text'; text: string }> };

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

export function toToolError(err: unknown): ToolError {
  if (
    err instanceof ScraperError ||
    err instanceof CaptchaError ||
    err instanceof RateLimitError ||
    err instanceof CacheError
  ) {
    return err.toToolError();
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

export function createTextResponse<T>(response: ToolResponse<T>): ContentResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(response) }],
  };
}

/** Build a success MCP content response, with optional cache metadata. */
export function createSuccessResponse<T>(
  data: T,
  cached = false,
  stale = false,
  cachedAt: string | null = null
): ContentResponse {
  return createTextResponse(
    buildToolResponse<T>({
      success: true,
      data,
      error: null,
      cached,
      stale,
      cachedAt,
    })
  );
}

/** Build an error MCP content response from any thrown value. */
export function createErrorResponse(err: unknown): ContentResponse {
  return createTextResponse(
    buildToolResponse<null>({
      success: false,
      data: null,
      error: toToolError(err),
    })
  );
}

/**
 * OTEL tracing wrapper for IAAI tool handlers.
 *
 * - Emits a span with `tool.name`, `tool.status` ("ok"|"error"), `tool.duration_ms`
 * - Sets span status to ERROR on failure without exporting raw stack traces
 * - Enforces a 60-second handler-level timeout → ScraperError with code TIMEOUT
 */
export async function withToolSpan(
  toolName: string,
  handler: () => Promise<ContentResponse>
): Promise<ContentResponse> {
  try {
    return await withSpan(`iaai.${toolName}`, { 'tool.name': toolName }, () => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new ScraperError(`Tool ${toolName} timed out after 60 seconds`, 'TIMEOUT'));
        }, TOOL_TIMEOUT_MS);
        timer.unref();
      });
      return Promise.race([handler(), timeoutPromise]);
    });
  } catch (err) {
    return createErrorResponse(err);
  }
}
