/**
 * @file tracing.test.ts
 * @description Tests for the OpenTelemetry tracing module.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initTracing, withSpan, _resetTracingForTests, _setTracerForTests } from '../src/tracing.js';
import type { Tracer, Span } from '@opentelemetry/api';
import { SpanStatusCode } from '@opentelemetry/api';

// ─── Mock tracer factory ──────────────────────────────────────────────────────

function createMockSpan(): Span & {
  _status: { code: number; message?: string } | null;
  _attrs: Record<string, unknown>;
  _ended: boolean;
} {
  const span = {
    _status: null as { code: number; message?: string } | null,
    _attrs: {} as Record<string, unknown>,
    _ended: false,
    setAttribute: vi.fn().mockImplementation(function (key: string, value: unknown) {
      span._attrs[key] = value;
    }),
    setStatus: vi.fn().mockImplementation(function (status: { code: number; message?: string }) {
      span._status = status;
    }),
    end: vi.fn().mockImplementation(function () {
      span._ended = true;
    }),
    // Unused Span interface methods
    addEvent: vi.fn(),
    addLink: vi.fn(),
    isRecording: vi.fn().mockReturnValue(true),
    recordException: vi.fn(),
    updateName: vi.fn(),
    spanContext: vi.fn().mockReturnValue({ traceId: 'mock', spanId: 'mock', traceFlags: 1 }),
  };
  return span as unknown as ReturnType<typeof createMockSpan>;
}

function createMockTracer(span: Span): Tracer {
  return {
    startSpan: vi.fn().mockReturnValue(span),
    startActiveSpan: vi.fn(),
  } as unknown as Tracer;
}

// ─── initTracing — no-op path ─────────────────────────────────────────────────

describe('initTracing — no-op path', () => {
  beforeEach(() => {
    _resetTracingForTests();
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  });

  afterEach(() => {
    _resetTracingForTests();
    vi.restoreAllMocks();
  });

  it('does not throw when OTLP endpoint is unset', () => {
    expect(() => initTracing('test-service')).not.toThrow();
  });

  it('is safe to call multiple times (idempotent)', () => {
    expect(() => {
      initTracing('service-a');
      initTracing('service-b');
    }).not.toThrow();
  });
});

describe('withSpan — no-op path (no OTLP endpoint)', () => {
  beforeEach(() => {
    _resetTracingForTests();
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    initTracing('test-service');
  });

  afterEach(() => {
    _resetTracingForTests();
    vi.restoreAllMocks();
  });

  it('executes the wrapped function and returns its result', async () => {
    const result = await withSpan('test.op', { 'tool.name': 'test' }, async () => 42);
    expect(result).toBe(42);
  });

  it('passes through complex return values', async () => {
    const obj = { foo: 'bar', count: 3 };
    const result = await withSpan('test.op', {}, async () => obj);
    expect(result).toEqual(obj);
  });

  it('re-throws errors from the wrapped function', async () => {
    await expect(
      withSpan('test.op', {}, async () => {
        throw new Error('inner error');
      }),
    ).rejects.toThrow('inner error');
  });

  it('accepts all defined SpanAttribute fields without throwing', async () => {
    const attrs = {
      'tool.name': 'copart.search',
      'tool.source': 'copart',
      'cache.hit': false,
      'queue.priority': 'normal',
      'queue.wait_ms': 100,
    };
    await expect(withSpan('copart.search', attrs, async () => 'ok')).resolves.toBe('ok');
  });

  it('works with empty attributes', async () => {
    await expect(withSpan('test.noop', {}, async () => 'empty')).resolves.toBe('empty');
  });
});

describe('withSpan — active tracer paths (mocked)', () => {
  let mockSpan: ReturnType<typeof createMockSpan>;
  let mockTracer: Tracer;

  beforeEach(() => {
    _resetTracingForTests();
    mockSpan = createMockSpan();
    mockTracer = createMockTracer(mockSpan);
    _setTracerForTests(mockTracer);
  });

  afterEach(() => {
    _resetTracingForTests();
    vi.restoreAllMocks();
  });

  it('starts a span with the provided name', async () => {
    await withSpan('test.operation', {}, async () => 'result');
    expect(mockTracer.startSpan).toHaveBeenCalledWith('test.operation');
  });

  it('sets span attributes from attrs argument', async () => {
    await withSpan('test.op', {
      'tool.name': 'my-tool',
      'cache.hit': true,
      'queue.wait_ms': 250,
    }, async () => 'ok');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('tool.name', 'my-tool');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('cache.hit', true);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('queue.wait_ms', 250);
  });

  it('skips undefined attribute values', async () => {
    await withSpan('test.op', { 'tool.name': undefined }, async () => 'ok');
    expect(mockSpan.setAttribute).not.toHaveBeenCalled();
  });

  it('sets OK status on successful execution', async () => {
    await withSpan('test.op', {}, async () => 'done');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
  });

  it('ends the span after successful execution', async () => {
    await withSpan('test.op', {}, async () => 'done');
    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('sets ERROR status when function throws', async () => {
    await expect(
      withSpan('test.op', {}, async () => {
        throw new Error('something went wrong');
      }),
    ).rejects.toThrow('something went wrong');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'something went wrong',
    });
  });

  it('ends the span even when function throws', async () => {
    await expect(
      withSpan('test.op', {}, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow();

    expect(mockSpan.end).toHaveBeenCalled();
  });

  it('handles non-Error thrown values', async () => {
    await expect(
      withSpan('test.op', {}, async () => {
        throw 'string error';
      }),
    ).rejects.toBe('string error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'string error',
    });
  });

  it('returns the function result correctly', async () => {
    const result = await withSpan('test.op', {}, async () => ({ nested: { value: 42 } }));
    expect(result).toEqual({ nested: { value: 42 } });
  });
});

describe('withSpan — timing and async behaviour', () => {
  beforeEach(() => {
    _resetTracingForTests();
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    initTracing('timing-service');
  });

  afterEach(() => {
    _resetTracingForTests();
  });

  it('awaits async operations correctly', async () => {
    const result = await withSpan('async.op', {}, async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'delayed';
    });
    expect(result).toBe('delayed');
  });

  it('handles concurrent spans', async () => {
    const [a, b, c] = await Promise.all([
      withSpan('op.a', {}, async () => 'a'),
      withSpan('op.b', {}, async () => 'b'),
      withSpan('op.c', {}, async () => 'c'),
    ]);
    expect(a).toBe('a');
    expect(b).toBe('b');
    expect(c).toBe('c');
  });
});

describe('withSpan — OTLP enabled path', () => {
  beforeEach(() => {
    _resetTracingForTests();
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] = 'http://localhost:4318';
  });

  afterEach(() => {
    _resetTracingForTests();
    delete process.env['OTEL_EXPORTER_OTLP_ENDPOINT'];
    vi.restoreAllMocks();
  });

  it('still executes function correctly when OTLP endpoint is set', async () => {
    initTracing('otel-service');
    const result = await withSpan('otel.op', { 'tool.name': 'test' }, async () => 99);
    expect(result).toBe(99);
  });

  it('re-throws errors even with OTLP endpoint set', async () => {
    initTracing('otel-service');
    await expect(
      withSpan('otel.error', {}, async () => {
        throw new Error('otel error');
      }),
    ).rejects.toThrow('otel error');
  });
});
