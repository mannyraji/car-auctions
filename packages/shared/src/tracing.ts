/**
 * @file tracing.ts
 * @description OpenTelemetry tracing module for the car-auctions monorepo.
 *
 * Initializes OTLP HTTP export when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
 * Becomes a complete no-op when the variable is unset.
 *
 * Span naming convention: `{package}.{operation}` (e.g., `copart.search`, `cache.read`)
 *
 * @since 001-shared-utilities-lib
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Tracer } from '@opentelemetry/api';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Custom span attributes for car-auctions tools.
 *
 * @example
 * const attrs: SpanAttributes = {
 *   'tool.name': 'copart.search',
 *   'cache.hit': false,
 *   'queue.priority': 'normal',
 *   'queue.wait_ms': 150,
 * };
 */
export interface SpanAttributes {
  /** Name of the tool being called (e.g., `'copart.search'`) */
  'tool.name'?: string;
  /** Source of the data (e.g., `'copart'`, `'iaai'`, `'nhtsa'`) */
  'tool.source'?: string;
  /** Whether the result was served from cache */
  'cache.hit'?: boolean;
  /** Priority level of the queued request */
  'queue.priority'?: string;
  /** Milliseconds the request waited in the queue */
  'queue.wait_ms'?: number;
  /** Any additional string/number/boolean attributes */
  [key: string]: string | number | boolean | undefined;
}

// ─── Module state ─────────────────────────────────────────────────────────────

let tracer: Tracer | null = null;
let initialized = false;

// ─── initTracing ──────────────────────────────────────────────────────────────

/**
 * Initialises OpenTelemetry tracing for the current service.
 *
 * When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, creates a `NodeSDK` with an
 * OTLP HTTP exporter and registers it globally. When the variable is unset,
 * this function is a complete no-op.
 *
 * Should be called once at process startup, before any spans are created.
 *
 * @param serviceName — The service name to attach to all spans
 *
 * @example
 * // OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 * initTracing('copart-mcp');
 *
 * @example
 * // No-op when endpoint is unset
 * initTracing('copart-mcp'); // does nothing
 */
export function initTracing(serviceName: string): void {
  if (initialized) return;
  initialized = true;

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (!endpoint) {
    // No-op path — tracer remains null, withSpan falls back to direct execution
    return;
  }

  // Dynamically import to avoid loading OTEL packages when not needed
  void (async () => {
    try {
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { OTLPTraceExporter } = await import(
        '@opentelemetry/exporter-trace-otlp-http'
      );

      const exporter = new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
      });

      const sdk = new NodeSDK({
        serviceName,
        traceExporter: exporter,
      });

      sdk.start();
      tracer = trace.getTracer(serviceName);
    } catch {
      // Tracing initialisation failure is non-fatal — fail silently
      tracer = null;
    }
  })();
}

// ─── withSpan ─────────────────────────────────────────────────────────────────

/**
 * Wraps an async operation in an OpenTelemetry span.
 *
 * If tracing is not initialised (no OTEL endpoint), executes `fn` directly
 * with no overhead.
 *
 * Error status is recorded on the span (without stack trace, per constitution
 * Pillar VI Rule 2), then the error is re-thrown.
 *
 * @example
 * const result = await withSpan(
 *   'copart.search',
 *   { 'tool.name': 'copart.search', 'queue.priority': 'high' },
 *   async () => searchCopart(query),
 * );
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttributes,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tracer) {
    // No-op — execute directly
    return fn();
  }

  const span = tracer.startSpan(name);

  // Set attributes
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) {
      span.setAttribute(key, value);
    }
  }

  try {
    const result = await fn();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (err) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      // Only record message — no stack trace (constitution Pillar VI Rule 2)
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    span.end();
  }
}

// ─── Internal reset (for tests only) ─────────────────────────────────────────

/**
 * Resets tracing module state. Used in tests to allow re-initialisation.
 * @internal
 */
export function _resetTracingForTests(): void {
  tracer = null;
  initialized = false;
}

/**
 * Injects a mock tracer for unit testing the active-tracer code paths.
 * @internal
 */
export function _setTracerForTests(mockTracer: Tracer | null): void {
  tracer = mockTracer;
  initialized = true;
}
