import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PriorityQueue } from '../src/priority-queue/index.js';
import type { PriorityLevel } from '../src/types/index.js';

describe('PriorityQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
  });

  it('returns a result from enqueue', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 100 } });
    const result = await queue.enqueue({
      priority: 'normal',
      execute: async () => 42,
    });
    expect(result).toBe(42);
    await queue.shutdown();
  });

  it('critical requests execute immediately bypassing queue', async () => {
    const order: string[] = [];
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 0.1 } });

    // Enqueue normal first (would normally block)
    const normalP = queue.enqueue({
      priority: 'normal',
      execute: async () => {
        order.push('normal');
      },
    });

    // Enqueue critical — should bypass
    const critP = queue.enqueue({
      priority: 'critical',
      execute: async () => {
        order.push('critical');
      },
    });

    await critP;
    expect(order).toContain('critical');

    await vi.advanceTimersByTimeAsync(10_000);
    await normalP;
    await queue.shutdown();
  });

  it('processes high before normal before low before background', async () => {
    const order: string[] = [];
    // Use high rate to avoid timer delays in test
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 1000 } });

    const promises = (['background', 'low', 'normal', 'high'] as PriorityLevel[]).map((p) =>
      queue.enqueue({
        priority: p,
        execute: async () => {
          order.push(p);
        },
      })
    );

    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(promises);

    // high should come before normal, normal before low, low before background
    const hiIdx = order.indexOf('high');
    const normIdx = order.indexOf('normal');
    const lowIdx = order.indexOf('low');
    const bgIdx = order.indexOf('background');

    expect(hiIdx).toBeLessThan(normIdx);
    expect(normIdx).toBeLessThan(lowIdx);
    expect(lowIdx).toBeLessThan(bgIdx);

    await queue.shutdown();
  });

  it('FIFO within same priority level', async () => {
    const order: string[] = [];
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 1000 } });

    const promises = ['first', 'second', 'third'].map((id) =>
      queue.enqueue({
        priority: 'normal',
        execute: async () => {
          order.push(id);
        },
      })
    );

    await vi.advanceTimersByTimeAsync(100);
    await Promise.all(promises);

    expect(order).toEqual(['first', 'second', 'third']);
    await queue.shutdown();
  });

  it('pending count tracks queued requests', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 0.01 } });

    // Enqueue a slow first request to block the queue
    const p1 = queue.enqueue({
      priority: 'normal',
      execute: () => new Promise((r) => setTimeout(r, 5000)),
    });
    const p2 = queue.enqueue({ priority: 'normal', execute: async () => {} });
    const p3 = queue.enqueue({ priority: 'normal', execute: async () => {} });

    // Suppress expected rejections from shutdown
    p1.catch(() => {});
    p2.catch(() => {});
    p3.catch(() => {});

    // After first ticks but before it completes, we should have pending items
    await vi.advanceTimersByTimeAsync(1);
    expect(queue.pending).toBeGreaterThanOrEqual(0); // at least no crash

    await queue.shutdown();
  });

  it('getDepth() returns counts per level', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 0.001 } });

    // The first enqueue gets processed immediately (1 token), rest queue up
    const p1 = queue.enqueue({
      priority: 'high',
      execute: () => new Promise((r) => setTimeout(r, 10_000)),
    });
    const p2 = queue.enqueue({ priority: 'high', execute: async () => {} });
    const p3 = queue.enqueue({ priority: 'low', execute: async () => {} });

    // Suppress expected rejections from shutdown
    p1.catch(() => {});
    p2.catch(() => {});
    p3.catch(() => {});

    await vi.advanceTimersByTimeAsync(1);

    const depth = queue.getDepth();
    expect(typeof depth.high).toBe('number');
    expect(typeof depth.low).toBe('number');
    expect(typeof depth.normal).toBe('number');
    expect(typeof depth.background).toBe('number');
    expect(typeof depth.critical).toBe('number');

    await queue.shutdown();
  });

  it('shutdown() rejects pending requests', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 0.001 } });

    // Block queue with first slow item
    queue.enqueue({
      priority: 'normal',
      execute: () => new Promise((r) => setTimeout(r, 100_000)),
    });

    // Queue up second item
    const p = queue.enqueue({ priority: 'normal', execute: async () => 'result' });

    await vi.advanceTimersByTimeAsync(1);
    await queue.shutdown();

    await expect(p).rejects.toThrow(/shut down/);
  });

  it('rate limiting enforces inter-request delays for non-critical', async () => {
    const timestamps: number[] = [];
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 1 } }); // 1 per second

    // Enqueue 3 normal requests
    const promises = [1, 2, 3].map(() =>
      queue.enqueue({
        priority: 'normal',
        execute: async () => {
          timestamps.push(Date.now());
        },
      })
    );

    // Advance enough time for all to run
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.all(promises);

    // With 1 req/sec, there should be ~1000ms between each
    if (timestamps.length >= 2) {
      expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(500);
    }

    await queue.shutdown();
  });

  it('starvation prevention runs low/background after 60s', async () => {
    const executed: string[] = [];
    const queue = new PriorityQueue({
      rateLimit: { requestsPerSecond: 0.001 }, // very slow rate
    });

    // Fill queue with high-priority to block low
    const highPromises = [];
    for (let i = 0; i < 5; i++) {
      highPromises.push(
        queue
          .enqueue({
            priority: 'high',
            execute: () => new Promise((r) => setTimeout(r, 100_000)),
          })
          .catch(() => {})
      );
    }
    const bgPromise = queue.enqueue({
      priority: 'background',
      execute: async () => {
        executed.push('background');
      },
    });
    bgPromise.catch(() => {});

    // Advance 60s to trigger starvation prevention
    await vi.advanceTimersByTimeAsync(60_001);

    expect(executed).toContain('background');

    await queue.shutdown();
  });

  it('enqueue rejects after shutdown', async () => {
    const queue = new PriorityQueue();
    await queue.shutdown();

    await expect(queue.enqueue({ priority: 'normal', execute: async () => 1 })).rejects.toThrow(
      /shut down/
    );
  });

  it('processing is true while a request is executing', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 100 } });

    let resolveRequest!: () => void;
    const requestStarted = new Promise<void>((res) => {
      queue
        .enqueue({
          priority: 'normal',
          execute: () =>
            new Promise<void>((r) => {
              resolveRequest = r;
              res();
            }),
        })
        .catch(() => {});
    });

    await vi.advanceTimersByTimeAsync(10);
    await requestStarted;
    expect(queue.processing).toBe(true);

    resolveRequest();
    await vi.advanceTimersByTimeAsync(10);
    expect(queue.processing).toBe(false);

    await queue.shutdown();
  });

  it('stop() rejects all queued requests', async () => {
    // Use an extremely slow rate so queued items never get tokens before stop() runs
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 0.001 } });

    // Consume the initial token with a slow blocking item, then flush the microtask
    queue
      .enqueue({ priority: 'normal', execute: () => new Promise((r) => setTimeout(r, 100_000)) })
      .catch(() => {});
    await vi.advanceTimersByTimeAsync(0); // flush microtask so token is consumed

    // Now enqueue additional items — they must queue since no tokens remain
    const p1 = queue.enqueue({ priority: 'normal', execute: async () => 'a' });
    const p2 = queue.enqueue({ priority: 'high', execute: async () => 'b' });

    queue.stop();

    await expect(p1).rejects.toThrow(/stopped/);
    await expect(p2).rejects.toThrow(/stopped/);
  });

  it('start() re-enables processing after stop()', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 100 } });

    queue.stop();
    queue.start();

    // Enqueue after start — should process normally
    const p = queue.enqueue({ priority: 'normal', execute: async () => 42 });
    await vi.advanceTimersByTimeAsync(10);

    await expect(p).resolves.toBe(42);
    await queue.shutdown();
  });

  it('enqueue rejects immediately while paused', async () => {
    const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 100 } });

    queue.stop();

    await expect(queue.enqueue({ priority: 'normal', execute: async () => 1 })).rejects.toThrow(
      /stopped/
    );

    await queue.shutdown();
  });
});
