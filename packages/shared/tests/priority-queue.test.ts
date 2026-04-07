/**
 * @file tests/priority-queue.test.ts
 * @description Tests for PriorityQueue: preemption, starvation prevention, token bucket.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PriorityQueue } from '../src/priority-queue.js';

describe('PriorityQueue', () => {
  let queue: PriorityQueue;

  beforeEach(() => {
    vi.useFakeTimers();
    queue = new PriorityQueue({ rateLimitIntervalMs: 100 });
  });

  afterEach(async () => {
    await queue.shutdown();
    vi.useRealTimers();
  });

  it('resolves with the return value of the enqueued fn', async () => {
    const promise = queue.enqueue('background', async () => 'hello');
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result).toBe('hello');
  });

  it('critical requests execute before normal requests enqueued earlier', async () => {
    const order: string[] = [];

    // Consume the initial token with a blocker
    const blocker = queue.enqueue('normal', async () => {
      order.push('blocker');
    });
    await vi.advanceTimersByTimeAsync(10);

    const normalPromise = queue.enqueue('normal', async () => {
      order.push('normal');
    });

    const criticalPromise = queue.enqueue('critical', async () => {
      order.push('critical');
    });

    // Advance time for blocker to complete
    await vi.advanceTimersByTimeAsync(200);
    await blocker;

    // Critical should be served next
    await vi.advanceTimersByTimeAsync(200);
    await criticalPromise;

    // Then normal
    await vi.advanceTimersByTimeAsync(200);
    await normalPromise;

    // critical should appear before normal in the order
    const critIdx = order.indexOf('critical');
    const normIdx = order.indexOf('normal');
    expect(critIdx).toBeLessThan(normIdx);
  });

  it('token bucket limits throughput to configured rate', async () => {
    // With rateLimitIntervalMs=100, we should process at most 1 req per 100ms
    const timestamps: number[] = [];

    const p1 = queue.enqueue('normal', async () => { timestamps.push(Date.now()); });
    const p2 = queue.enqueue('normal', async () => { timestamps.push(Date.now()); });
    const p3 = queue.enqueue('normal', async () => { timestamps.push(Date.now()); });

    // Advance time enough for all to execute (3 requests x 100ms each + buffer)
    await vi.advanceTimersByTimeAsync(600);

    await Promise.all([p1, p2, p3]);

    expect(timestamps).toHaveLength(3);
    // Each subsequent request should be at least 90ms after the previous
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(90);
    expect(timestamps[2]! - timestamps[1]!).toBeGreaterThanOrEqual(90);
  });

  it('FIFO ordering within the same priority tier', async () => {
    const order: number[] = [];

    const p1 = queue.enqueue('normal', async () => { order.push(1); });
    const p2 = queue.enqueue('normal', async () => { order.push(2); });
    const p3 = queue.enqueue('normal', async () => { order.push(3); });

    await vi.advanceTimersByTimeAsync(1000);

    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('starvation prevention: low-priority request executes within starvationThresholdMs', async () => {
    const queue2 = new PriorityQueue({
      rateLimitIntervalMs: 50,
      starvationThresholdMs: 500,
    });

    const lowExecuted = { value: false };
    const highPromises: Promise<void>[] = [];

    // Continuously enqueue high-priority requests
    for (let i = 0; i < 5; i++) {
      highPromises.push(queue2.enqueue('high', async () => {
        // no-op
      }));
    }

    // Enqueue one low-priority request
    const lowPromise = queue2.enqueue('low', async () => {
      lowExecuted.value = true;
    });

    // Advance past the starvation threshold
    await vi.advanceTimersByTimeAsync(2000);

    await Promise.all([...highPromises, lowPromise]);

    expect(lowExecuted.value).toBe(true);

    await queue2.shutdown();
  });

  it('getQueueDepth returns depth by priority level', () => {
    const depth = queue.getQueueDepth();
    expect(depth).toHaveProperty('critical');
    expect(depth).toHaveProperty('high');
    expect(depth).toHaveProperty('normal');
    expect(depth).toHaveProperty('low');
    expect(depth).toHaveProperty('background');
    expect(depth.normal).toBe(0);
  });

  it('enqueue background resolves with fn return value', async () => {
    const promise = queue.enqueue('background', async () => 42);
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(result).toBe(42);
  });

  it('shutdown rejects pending requests', async () => {
    const q = new PriorityQueue({ rateLimitIntervalMs: 10_000 }); // very slow rate

    // First request will consume the initial token
    const first = q.enqueue('normal', async () => 'first');
    await vi.advanceTimersByTimeAsync(100);
    await first;

    // Second will be stuck waiting for next token (10s away)
    // Attach a catch handler immediately to prevent unhandled rejection warning
    const second = q.enqueue('normal', async () => 'second');
    const secondCaught = second.catch(() => 'caught');

    // Shut down before second can execute
    const shutdownPromise = q.shutdown();
    await vi.advanceTimersByTimeAsync(100);

    await expect(second).rejects.toThrow();
    await secondCaught;
    await shutdownPromise;
  });
});
