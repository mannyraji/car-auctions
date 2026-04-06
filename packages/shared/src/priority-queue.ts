/**
 * @file priority-queue.ts
 * @description Five-level priority queue with token-bucket rate limiting and starvation prevention.
 *
 * Priority levels (highest → lowest):
 *  - critical   — immediate dispatch, bypasses ordering; still rate-limited
 *  - high        — max 2 000 ms wait
 *  - normal      — max 5 000 ms wait
 *  - low         — max 10 000 ms wait
 *  - background  — max 30 000 ms wait; guaranteed ≥ 1 slot per 60 s
 *
 * @since 001-shared-utilities-lib
 */

import type { PriorityLevel, PriorityRequest } from './types/index.js';

// Re-export the types defined in types/index.ts
export type { PriorityLevel, PriorityRequest };

/** Options for constructing a PriorityQueue */
export interface PriorityQueueOptions {
  /** Token bucket refill interval in ms (default: 3 000 — 1 req/3 s) */
  intervalMs?: number;
  /** Starvation-check interval in ms (default: 500) */
  starvationCheckMs?: number;
  /** Maximum wait time before a low/background task is promoted (ms per level). */
  maxWaitMs?: Partial<Record<PriorityLevel, number>>;
}

// ─── Internal constants ────────────────────────────────────────────────────────

const PRIORITY_ORDER: PriorityLevel[] = [
  'critical',
  'high',
  'normal',
  'low',
  'background',
];

const DEFAULT_MAX_WAIT_MS: Record<PriorityLevel, number> = {
  critical: 0,
  high: 2_000,
  normal: 5_000,
  low: 10_000,
  background: 30_000,
};

// ─── TokenBucket ─────────────────────────────────────────────────────────────

/**
 * Continuous-refill token bucket rate limiter.
 * Internal to priority-queue.ts — NOT exported from the public API.
 */
class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;
  private readonly capacity: number;
  private readonly intervalMs: number;
  private readonly waiters: Array<() => void> = [];

  constructor(intervalMs: number, capacity = 1) {
    this.capacity = capacity;
    this.intervalMs = intervalMs;
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const newTokens = (elapsed / this.intervalMs) * this.capacity;
    this.tokens = Math.min(this.capacity, this.tokens + newTokens);
    this.lastRefillTime = now;
  }

  /**
   * Consumes one token. If none are available, waits until the next refill.
   */
  async consume(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait time until next token
    const tokensNeeded = 1 - this.tokens;
    const waitMs = Math.ceil(tokensNeeded * this.intervalMs);

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.indexOf(resolve);
        if (idx !== -1) this.waiters.splice(idx, 1);
        resolve();
      }, waitMs);
      // Prevent the timer from keeping the process alive
      if (timer.unref) timer.unref();
      this.waiters.push(resolve);
    });

    // Re-attempt after waiting
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

// ─── PriorityQueue ────────────────────────────────────────────────────────────

interface InternalEntry<T = unknown> {
  request: PriorityRequest<T>;
  effectivePriority: PriorityLevel;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * Five-level priority queue with token-bucket rate limiting and starvation prevention.
 *
 * @example
 * const queue = new PriorityQueue({ intervalMs: 3000 });
 *
 * const result = await queue.enqueue({
 *   id: 'req-1',
 *   priority: 'high',
 *   task: async () => fetchCopartLot('12345'),
 *   enqueuedAt: Date.now(),
 * });
 */
export class PriorityQueue {
  private readonly rateLimiter: TokenBucket;
  private readonly pending: InternalEntry[] = [];
  private processing = false;
  private readonly maxWaitMs: Record<PriorityLevel, number>;
  private starvationTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: PriorityQueueOptions) {
    this.rateLimiter = new TokenBucket(options?.intervalMs ?? 3_000);
    this.maxWaitMs = {
      ...DEFAULT_MAX_WAIT_MS,
      ...options?.maxWaitMs,
    };

    const checkInterval = options?.starvationCheckMs ?? 500;
    this.starvationTimer = setInterval(() => {
      this.promoteStarvedTasks();
    }, checkInterval);

    // Don't block process exit
    if (this.starvationTimer.unref) {
      this.starvationTimer.unref();
    }
  }

  /**
   * Enqueues a request and returns a promise that resolves with the task result.
   *
   * Critical tasks bypass the queue ordering and are placed at the front.
   *
   * @example
   * const result = await queue.enqueue({
   *   id: 'bid-001',
   *   priority: 'critical',
   *   task: async () => submitBid(lotId, amount),
   *   enqueuedAt: Date.now(),
   * });
   */
  enqueue<T>(request: PriorityRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: InternalEntry<T> = {
        request,
        effectivePriority: request.priority,
        resolve,
        reject,
      };

      if (request.priority === 'critical') {
        // Critical tasks go to the front of the queue
        this.pending.unshift(entry as InternalEntry);
      } else {
        this.pending.push(entry as InternalEntry);
        this.sortQueue();
      }

      this.scheduleProcessing();
    });
  }

  /**
   * Number of tasks currently waiting in the queue.
   */
  get size(): number {
    return this.pending.length;
  }

  /**
   * Stop the starvation-prevention background timer.
   * Call this when you are done with the queue to avoid keeping the process alive.
   */
  destroy(): void {
    if (this.starvationTimer !== null) {
      clearInterval(this.starvationTimer);
      this.starvationTimer = null;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private scheduleProcessing(): void {
    if (!this.processing) {
      this.processing = true;
      // Defer to a microtask so all synchronously-enqueued tasks can
      // accumulate before the first one is dispatched. This ensures that
      // tasks enqueued in the same synchronous block are sorted by priority
      // before any of them start executing.
      void Promise.resolve().then(() => this.processNext());
    }
  }

  private async processNext(): Promise<void> {
    if (this.pending.length === 0) {
      this.processing = false;
      return;
    }

    const entry = this.pending.shift()!;

    try {
      // Respect rate limit (applies to all priorities including critical)
      await this.rateLimiter.consume();
      const result = await entry.request.task();
      entry.resolve(result);
    } catch (err) {
      entry.reject(err);
    } finally {
      void this.processNext();
    }
  }

  private sortQueue(): void {
    this.pending.sort((a, b) => {
      const pa = PRIORITY_ORDER.indexOf(a.effectivePriority);
      const pb = PRIORITY_ORDER.indexOf(b.effectivePriority);
      if (pa !== pb) return pa - pb;
      // FIFO within same priority level
      return a.request.enqueuedAt - b.request.enqueuedAt;
    });
  }

  /**
   * Age-based starvation prevention: promotes tasks that have been waiting
   * longer than their level's `maxWaitMs` to a higher effective priority.
   */
  private promoteStarvedTasks(): void {
    const now = Date.now();
    let promoted = false;

    for (const entry of this.pending) {
      const waitMs = now - entry.request.enqueuedAt;
      const currentIdx = PRIORITY_ORDER.indexOf(entry.effectivePriority);
      const maxWait = this.maxWaitMs[entry.request.priority];

      if (maxWait > 0 && waitMs > maxWait && currentIdx > 0) {
        entry.effectivePriority = PRIORITY_ORDER[currentIdx - 1];
        promoted = true;
      }
    }

    if (promoted) {
      this.sortQueue();
    }
  }
}
