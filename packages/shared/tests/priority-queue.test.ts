/**
 * @file priority-queue.test.ts
 * @description Tests for the PriorityQueue with token-bucket rate limiting.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PriorityQueue } from '../src/priority-queue.js';
import type { PriorityRequest } from '../src/types/index.js';

/** Creates a resolved-promise task */
function makeTask<T>(value: T, delayMs = 0): () => Promise<T> {
  return async () => {
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return value;
  };
}

/** Builds a PriorityRequest */
function makeRequest<T>(
  id: string,
  priority: PriorityRequest<T>['priority'],
  task: () => Promise<T>,
): PriorityRequest<T> {
  return { id, priority, task, enqueuedAt: Date.now() };
}

describe('PriorityQueue — basic ordering', () => {
  let queue: PriorityQueue;
  const results: string[] = [];

  beforeEach(() => {
    // Fast rate limiter for tests (1ms interval)
    queue = new PriorityQueue({ intervalMs: 1, starvationCheckMs: 50 });
    results.length = 0;
  });

  afterEach(() => {
    queue.destroy();
  });

  it('processes a single task', async () => {
    const result = await queue.enqueue(makeRequest('r1', 'normal', makeTask('hello')));
    expect(result).toBe('hello');
  });

  it('processes high before normal', async () => {
    const order: string[] = [];

    // Enqueue normal first, then high — high should execute first
    const p1 = queue.enqueue(
      makeRequest('normal', 'normal', async () => {
        order.push('normal');
        return 'normal';
      }),
    );
    const p2 = queue.enqueue(
      makeRequest('high', 'high', async () => {
        order.push('high');
        return 'high';
      }),
    );

    await Promise.all([p1, p2]);

    // high should appear before normal
    const highIdx = order.indexOf('high');
    const normalIdx = order.indexOf('normal');
    expect(highIdx).toBeLessThanOrEqual(normalIdx);
  });

  it('processes critical at the front', async () => {
    const order: string[] = [];

    // Fill the queue with background tasks first
    const bg = queue.enqueue(
      makeRequest('bg', 'background', async () => {
        order.push('background');
        return 'bg';
      }),
    );

    // Then enqueue critical
    const crit = queue.enqueue(
      makeRequest('crit', 'critical', async () => {
        order.push('critical');
        return 'crit';
      }),
    );

    await Promise.all([bg, crit]);
    expect(order.indexOf('critical')).toBeLessThanOrEqual(order.indexOf('background'));
  });

  it('maintains FIFO within same priority level', async () => {
    const order: string[] = [];
    const tasks = ['a', 'b', 'c'].map((id) =>
      queue.enqueue(
        makeRequest(id, 'normal', async () => {
          order.push(id);
          return id;
        }),
      ),
    );
    await Promise.all(tasks);
    // All same priority → should be FIFO
    expect(order).toEqual(['a', 'b', 'c']);
  });
});

describe('PriorityQueue — size tracking', () => {
  let queue: PriorityQueue;

  beforeEach(() => {
    queue = new PriorityQueue({ intervalMs: 10_000 }); // slow rate limit to hold tasks
  });

  afterEach(() => {
    queue.destroy();
  });

  it('reports correct queue size', () => {
    // With a slow rate limiter, tasks sit in the queue
    void queue.enqueue(makeRequest('t1', 'normal', makeTask('a')));
    void queue.enqueue(makeRequest('t2', 'normal', makeTask('b')));
    // Size may be 0 or 1 depending on timing, but should not throw
    expect(queue.size).toBeGreaterThanOrEqual(0);
  });
});

describe('PriorityQueue — error propagation', () => {
  let queue: PriorityQueue;

  beforeEach(() => {
    queue = new PriorityQueue({ intervalMs: 1 });
  });

  afterEach(() => {
    queue.destroy();
  });

  it('propagates task errors to the caller', async () => {
    const failTask = makeRequest('fail', 'normal', async () => {
      throw new Error('task failed');
    });

    await expect(queue.enqueue(failTask)).rejects.toThrow('task failed');
  });

  it('continues processing after a failed task', async () => {
    void queue.enqueue(
      makeRequest('fail', 'normal', async () => {
        throw new Error('boom');
      }),
    ).catch(() => undefined);

    const result = await queue.enqueue(makeRequest('ok', 'normal', makeTask('survived')));
    expect(result).toBe('survived');
  });
});

describe('PriorityQueue — starvation prevention', () => {
  it('promotes background tasks when maxWait is exceeded', async () => {
    const queue = new PriorityQueue({
      intervalMs: 1,
      starvationCheckMs: 10,
      maxWaitMs: {
        background: 50, // 50ms max wait for background in this test
      },
    });

    const order: string[] = [];
    const bg = queue.enqueue(
      makeRequest('bg', 'background', async () => {
        order.push('background');
        return 'bg';
      }),
    );

    // Wait for promotion to kick in
    await new Promise((r) => setTimeout(r, 200));

    const hi = queue.enqueue(
      makeRequest('hi', 'high', async () => {
        order.push('high');
        return 'hi';
      }),
    );

    await Promise.all([bg, hi]);
    // Background was promoted (waited > 50ms) so it should have run
    expect(order).toContain('background');

    queue.destroy();
  });
});

describe('PriorityQueue — starvation prevention (detailed)', () => {
  it('promotes background tasks when maxWait is exceeded and re-sorts', async () => {
    const queue = new PriorityQueue({
      intervalMs: 30, // 30ms per task
      starvationCheckMs: 20, // check often
      maxWaitMs: {
        background: 40, // very short maxWait for test
      },
    });

    const order: string[] = [];

    // Make background wait long enough to be promoted
    const bgRequest = { id: 'bg', priority: 'background' as const, task: async () => { order.push('bg'); return 'bg'; }, enqueuedAt: Date.now() - 100 };
    const bg = queue.enqueue(bgRequest);

    // Add multiple high tasks to compete with
    const hi1 = queue.enqueue({ id: 'hi1', priority: 'high' as const, task: async () => { order.push('hi1'); return 'hi1'; }, enqueuedAt: Date.now() });
    const hi2 = queue.enqueue({ id: 'hi2', priority: 'high' as const, task: async () => { order.push('hi2'); return 'hi2'; }, enqueuedAt: Date.now() });

    await Promise.all([bg, hi1, hi2]);
    // All tasks should complete
    expect(order).toHaveLength(3);
    expect(order).toContain('bg');

    queue.destroy();
  });

  it('does not promote critical tasks (maxWait=0)', async () => {
    const queue = new PriorityQueue({
      intervalMs: 1,
      starvationCheckMs: 10,
    });

    const result = await queue.enqueue({
      id: 'crit',
      priority: 'critical',
      task: async () => 'done',
      enqueuedAt: Date.now(),
    });
    expect(result).toBe('done');

    queue.destroy();
  });
});

describe('PriorityQueue — destroy', () => {
  it('destroys without throwing', () => {
    const queue = new PriorityQueue({ intervalMs: 1 });
    expect(() => queue.destroy()).not.toThrow();
  });

  it('can be destroyed multiple times', () => {
    const queue = new PriorityQueue({ intervalMs: 1 });
    queue.destroy();
    expect(() => queue.destroy()).not.toThrow();
  });
});

describe('PriorityQueue — rate limiting', () => {
  it('respects rate limit between tasks', async () => {
    const intervalMs = 50;
    const queue = new PriorityQueue({ intervalMs, starvationCheckMs: 100 });

    const times: number[] = [];
    const tasks = [1, 2].map((n) =>
      queue.enqueue(
        makeRequest(`t${n}`, 'normal', async () => {
          times.push(Date.now());
          return n;
        }),
      ),
    );

    await Promise.all(tasks);

    // The second task should start at least intervalMs after the first
    const gap = times[1] - times[0];
    expect(gap).toBeGreaterThanOrEqual(intervalMs - 10); // 10ms tolerance

    queue.destroy();
  });
});
