import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initTracing, withSpan, _resetTracingState } from '../src/tracing/index.js';

describe('initTracing', () => {
  beforeEach(() => {
    _resetTracingState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetTracingState();
  });

  it('initializes without throwing when OTEL_EXPORTER_OTLP_ENDPOINT is not set', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    expect(() => initTracing({ serviceName: 'test-service' })).not.toThrow();
  });

  it('is idempotent — calling multiple times does not throw', () => {
    expect(() => {
      initTracing({ serviceName: 'svc' });
      initTracing({ serviceName: 'svc' });
      initTracing({ serviceName: 'svc' });
    }).not.toThrow();
  });

  it('initializes without throwing when OTEL_EXPORTER_OTLP_ENDPOINT points to unreachable URL', () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:1');
    expect(() => initTracing({ serviceName: 'test-service' })).not.toThrow();
  });
});

describe('withSpan', () => {
  beforeEach(() => {
    _resetTracingState();
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    initTracing({ serviceName: 'test-service' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    _resetTracingState();
  });

  it('executes wrapped function and returns result', async () => {
    const result = await withSpan('test.op', {}, async () => 42);
    expect(result).toBe(42);
  });

  it('accepts SpanAttributes including all standard keys', async () => {
    const result = await withSpan(
      'copart.search',
      {
        'tool.name': 'search',
        'tool.source': 'copart',
        'cache.hit': false,
        'queue.priority': 'high',
        'queue.wait_ms': 100,
      },
      async () => 'done'
    );
    expect(result).toBe('done');
  });

  it('re-throws exceptions from wrapped function', async () => {
    await expect(
      withSpan('failing.op', {}, async () => {
        throw new Error('operation failed');
      })
    ).rejects.toThrow('operation failed');
  });

  it('measures tool.duration_ms (runs without crashing)', async () => {
    // Just verify it doesn't throw and returns the result
    const result = await withSpan('timed.op', {}, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  it('no-op provider: withSpan still executes function when OTEL endpoint not set', async () => {
    _resetTracingState();
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', '');
    // Don't call initTracing — should auto-initialize as no-op

    const executed = { value: false };
    const result = await withSpan('noop.test', {}, async () => {
      executed.value = true;
      return 'noop';
    });

    expect(result).toBe('noop');
    expect(executed.value).toBe(true);
  });

  it('overhead smoke test: 100x no-op withSpan completes in reasonable time', async () => {
    const start = Date.now();
    const ops = Array.from({ length: 100 }, (_, i) => withSpan(`op.${i}`, {}, async () => i));
    const results = await Promise.all(ops);
    const elapsed = Date.now() - start;

    expect(results).toHaveLength(100);
    // Very loose bound: 100 no-op async operations should complete in <5s
    expect(elapsed).toBeLessThan(5000);
  });
});
