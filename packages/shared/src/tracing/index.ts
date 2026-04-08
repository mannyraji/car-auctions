/**
 * OpenTelemetry tracing module
 *
 * Opt-in: configures OTLP HTTP export when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 * No-op when the env var is absent — zero overhead.
 */
import { createRequire } from 'module';
import type { SpanAttributes } from '../types/index.js';

const require = createRequire(import.meta.url);

export type { SpanAttributes };

// We import OTEL lazily to avoid startup cost when no-op
let tracerInitialized = false;
let activeTracer: OtelTracer | null = null;

interface OtelSpan {
  setAttributes(attrs: Record<string, string | number | boolean>): void;
  setStatus(status: { code: number; message?: string }): void;
  end(): void;
  recordException(err: Error): void;
}

interface OtelTracer {
  startActiveSpan<T>(name: string, fn: (span: OtelSpan) => T): T;
}

/**
 * Initialize OpenTelemetry tracing.
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set, configures a real NodeSDK with
 * OTLP HTTP export. Otherwise, registers a no-op provider.
 *
 * Idempotent — safe to call multiple times.
 *
 * @example
 * initTracing({ serviceName: 'copart-mcp' });
 */
export function initTracing(options: { serviceName: string }): void {
  if (tracerInitialized) return;
  tracerInitialized = true;

  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];

  if (endpoint) {
    try {
      // Dynamic import to keep cold-start cheap when no-op
      initRealTracing(options.serviceName, endpoint);
    } catch {
      // If SDK fails (e.g., unreachable endpoint), fall back to no-op
      registerNoOpProvider();
    }
  } else {
    registerNoOpProvider();
  }
}

function initRealTracing(serviceName: string, endpoint: string): void {
  try {
    const { NodeSDK } = require('@opentelemetry/sdk-node') as {
      NodeSDK: new (opts: { serviceName: string; traceExporter: unknown }) => { start(): void };
    };
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as {
      OTLPTraceExporter: new (opts: { url: string }) => unknown;
    };
    const api = require('@opentelemetry/api') as {
      trace: { getTracer(name: string): OtelTracer };
    };

    const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });
    const sdk = new NodeSDK({ serviceName, traceExporter: exporter });
    sdk.start();
    activeTracer = api.trace.getTracer(serviceName);
  } catch {
    registerNoOpProvider();
  }
}

function registerNoOpProvider(): void {
  // No-op tracer that executes the function but emits no spans
  activeTracer = {
    startActiveSpan<T>(_name: string, fn: (span: OtelSpan) => T): T {
      return fn(noOpSpan);
    },
  };
}

const noOpSpan: OtelSpan = {
  setAttributes: () => {},
  setStatus: () => {},
  end: () => {},
  recordException: () => {},
};

/**
 * Wrap an async operation in an OpenTelemetry span.
 *
 * Auto-records `tool.duration_ms`. Sets ERROR status on exception (no stack trace).
 * Re-throws the exception after recording.
 *
 * @example
 * const result = await withSpan('copart.search', { 'tool.name': 'search' }, async () => {
 *   return await scrape(...);
 * });
 */
export async function withSpan<T>(
  name: string,
  attrs: SpanAttributes,
  fn: () => Promise<T>
): Promise<T> {
  // Ensure tracer is initialized (no-op if not explicitly initialized)
  if (!tracerInitialized) {
    registerNoOpProvider();
    tracerInitialized = true;
  }

  const tracer = activeTracer!;
  const start = Date.now();

  // Use the span callback pattern
  return new Promise<T>((resolve, reject) => {
    let spanRef: OtelSpan | null = null;

    try {
      tracer.startActiveSpan(name, (span) => {
        spanRef = span;

        // Set initial custom attributes (excluding duration, which we set later)
        const spanAttrs: Record<string, string | number | boolean> = {};
        for (const [key, val] of Object.entries(attrs)) {
          if (val !== undefined) {
            spanAttrs[key] = val;
          }
        }
        span.setAttributes(spanAttrs);

        fn()
          .then((result) => {
            const durationMs = Date.now() - start;
            span.setAttributes({ 'tool.duration_ms': durationMs, 'tool.status': 'ok' });
            span.end();
            resolve(result);
          })
          .catch((err: unknown) => {
            const durationMs = Date.now() - start;
            const message = err instanceof Error ? err.message : String(err);
            span.setAttributes({ 'tool.duration_ms': durationMs, 'tool.status': 'error' });
            // SpanStatusCode.ERROR = 2
            span.setStatus({ code: 2, message });
            span.end();
            reject(err);
          });

        // Return undefined — promise handles resolution above
        return undefined;
      });
    } catch (setupErr) {
      // Span setup itself failed (shouldn't happen with no-op)
      if (spanRef) (spanRef as OtelSpan).end();
      reject(setupErr);
    }
  });
}

/** Reset tracing state (for testing only) */
export function _resetTracingState(): void {
  tracerInitialized = false;
  activeTracer = null;
}
