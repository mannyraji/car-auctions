/**
 * @file src/tracing.ts
 * @description OpenTelemetry tracing module. No-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset.
 *
 * Must be called once at application startup before MCP tool handlers are registered.
 */

import { createRequire } from 'node:module';
import type { SpanAttributes } from './types/index.js';

export type { SpanAttributes };

const require = createRequire(import.meta.url);

/** Module-level initialization guard — prevents double-initialization. */
let _tracingInitialized = false;

/**
 * Initializes OpenTelemetry tracing for the calling package.
 *
 * Behavior:
 * - If OTEL_EXPORTER_OTLP_ENDPOINT is NOT set: complete no-op, zero overhead
 * - If set: starts NodeSDK with OTLPTraceExporter + auto-instrumentations
 * - Idempotent — calling multiple times is safe
 * - OTLP endpoint unreachable: export errors are swallowed; app continues normally
 *
 * Must be called once at application startup, before any MCP tool handlers are registered.
 *
 * @param serviceName - Service name for span metadata (e.g. 'copart-scraper-mcp')
 * @example
 * // In packages/copart-scraper-mcp/src/index.ts:
 * initTracing('copart-scraper-mcp');
 * await createMcpServer({ name: 'copart-scraper', ... });
 */
export function initTracing(serviceName: string): void {
  if (!process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) return;
  if (_tracingInitialized) return;

  try {
    // Dynamic imports to avoid loading OTel modules when tracing is disabled
    const { NodeSDK } = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
    const { resourceFromAttributes } = require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');

    const exporter = new OTLPTraceExporter({
      url: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'],
    });

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        'service.name': serviceName,
      }),
      traceExporter: exporter,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    _tracingInitialized = true;

    // Graceful shutdown on process exit
    process.on('SIGTERM', () => {
      sdk.shutdown().catch(() => {
        // Swallow errors — fire and forget
      });
    });
  } catch {
    // If OTel SDK fails to start, continue silently — observability is optional
  }
}

/**
 * Wraps an async operation in an OpenTelemetry span.
 *
 * When tracing is disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set), this is a
 * pure pass-through with zero overhead — no span is created.
 *
 * When tracing is enabled:
 * - Creates an active span with the given name and initial attributes
 * - Sets tool.status='ok' and tool.duration_ms on success
 * - Sets span status ERROR and tool.status='error' on failure (no stack traces attached)
 * - Always calls span.end()
 *
 * Span naming convention: '{package}.{operation}' (e.g. 'copart.search', 'cache.read')
 *
 * @param name - Span name following '{package}.{operation}' convention
 * @param attributes - Initial span attributes
 * @param fn - Async operation to trace
 * @returns Promise resolving to the operation result
 * @example
 * export async function copartSearch(params: SearchParams) {
 *   return withSpan('copart.search', { 'tool.name': 'copart_search', 'tool.source': 'copart' }, async () => {
 *     const result = await scraper.search(params);
 *     return result;
 *   });
 * }
 */
export async function withSpan<T>(
  name: string,
  attributes: Partial<SpanAttributes>,
  fn: () => Promise<T>
): Promise<T> {
  // Fast path: no-op when tracing is not initialized
  if (!_tracingInitialized) {
    return fn();
  }

  try {
    const api = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
    const tracer = api.trace.getTracer('car-auctions');

    return await tracer.startActiveSpan(name, async (span) => {
      // Set initial attributes
      for (const [key, value] of Object.entries(attributes)) {
        if (value !== undefined) {
          span.setAttribute(key, value as string | number | boolean);
        }
      }

      const startTime = Date.now();

      try {
        const result = await fn();
        span.setAttribute('tool.status', 'ok');
        span.setAttribute('tool.duration_ms', Date.now() - startTime);
        span.setStatus({ code: api.SpanStatusCode.OK });
        return result;
      } catch (err) {
        span.setAttribute('tool.status', 'error');
        span.setAttribute('tool.duration_ms', Date.now() - startTime);
        // Per constitution: stack traces MUST NOT be attached to spans
        span.setStatus({
          code: api.SpanStatusCode.ERROR,
          message: err instanceof Error ? err.message : String(err),
        });
        throw err;
      } finally {
        span.end();
      }
    });
  } catch {
    // If OTel fails for any reason, fall through to direct fn execution
    return fn();
  }
}

/**
 * Resets the tracing initialization state.
 * FOR TESTING ONLY — allows re-initializing tracing in test environments.
 * @internal
 */
export function _resetTracingForTest(): void {
  _tracingInitialized = false;
}
