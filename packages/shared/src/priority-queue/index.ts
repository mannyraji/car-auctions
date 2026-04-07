/**
 * Priority-aware request queue with token bucket rate limiting
 *
 * 5 priority levels: critical > high > normal > low > background
 * - Critical: bypasses queue and rate limit (immediate execution)
 * - Others: token bucket (default 1 req/3s), starvation prevention for low/background
 */
import type { PriorityLevel, PriorityRequest, PriorityQueueOptions } from '../types/index.js';

interface QueueEntry<T> {
  request: PriorityRequest<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
}

const PRIORITY_ORDER: PriorityLevel[] = ['critical', 'high', 'normal', 'low', 'background'];
const DEFAULT_RATE = 1 / 3; // 1 request per 3 seconds

/**
 * Priority-aware request queue with token bucket rate limiting.
 *
 * @example
 * const queue = new PriorityQueue({ rateLimit: { requestsPerSecond: 2 } });
 * const result = await queue.enqueue({ priority: 'high', execute: async () => fetch(...) });
 * await queue.shutdown();
 */
export class PriorityQueue {
  private readonly queues: Map<PriorityLevel, Array<QueueEntry<unknown>>>;
  private readonly ratePerMs: number;
  private readonly maxQueueDepth: number;

  // Token bucket state
  private tokens: number;
  private lastRefill: number;

  // Internal processing state
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  private starvationTimer: ReturnType<typeof setInterval> | null = null;
  private isShutdown = false;
  private activeCount = 0;

  constructor(options?: PriorityQueueOptions) {
    const rps = options?.rateLimit?.requestsPerSecond ?? DEFAULT_RATE;
    this.ratePerMs = rps / 1000;
    this.maxQueueDepth = options?.maxQueueDepth ?? Infinity;

    this.queues = new Map();
    for (const level of PRIORITY_ORDER) {
      this.queues.set(level, []);
    }

    // Start with one token
    this.tokens = 1;
    this.lastRefill = Date.now();

    // Starvation prevention: guarantee ≥1 slot per 60s for low/background
    this.starvationTimer = setInterval(() => this.runStarvationSlot(), 60_000);

    // Start processing loop
    this.scheduleNext();
  }

  /**
   * Enqueue a request. Returns a promise that resolves with the result.
   * `id` and `enqueuedAt` are auto-assigned.
   */
  enqueue<T>(request: Omit<PriorityRequest<T>, 'id' | 'enqueuedAt'>): Promise<T> {
    if (this.isShutdown) {
      return Promise.reject(new Error('PriorityQueue has been shut down'));
    }

    return new Promise<T>((resolve, reject) => {
      const full: PriorityRequest<T> = {
        ...request,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        enqueuedAt: Date.now(),
      };

      // Critical: bypass queue — execute immediately
      if (full.priority === 'critical') {
        this.activeCount++;
        full.execute()
          .then((v) => { this.activeCount--; resolve(v as T); })
          .catch((e) => { this.activeCount--; reject(e); });
        return;
      }

      const queue = this.queues.get(full.priority)!;
      queue.push({ request: full as unknown as PriorityRequest<unknown>, resolve: resolve as (v: unknown) => void, reject });
      this.scheduleNext();
    });
  }

  /**
   * Drain all queues and stop processing.
   */
  async shutdown(): Promise<void> {
    this.isShutdown = true;
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
    if (this.starvationTimer) {
      clearInterval(this.starvationTimer);
      this.starvationTimer = null;
    }
    // Reject all pending entries
    for (const queue of this.queues.values()) {
      for (const entry of queue) {
        entry.reject(new Error('PriorityQueue shut down'));
      }
      queue.length = 0;
    }
  }

  /**
   * Get the depth (queue length) per priority level.
   */
  getDepth(): Record<PriorityLevel, number> {
    const result = {} as Record<PriorityLevel, number>;
    for (const level of PRIORITY_ORDER) {
      result[level] = this.queues.get(level)!.length;
    }
    return result;
  }

  /**
   * Total number of pending (enqueued but not yet started) requests.
   */
  get pending(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  // ─── Private ─────────────────────────────────────────────────────────────────

  private scheduleNext(): void {
    if (this.processingTimer !== null || this.isShutdown) return;

    const entry = this.peekNext();
    if (!entry) return;

    this.refillTokens();

    if (this.tokens >= 1) {
      // Defer via microtask so all synchronous enqueue() calls complete before
      // we pick the highest-priority item. Microtasks are NOT blocked by fake timers.
      this.processingTimer = -1 as unknown as ReturnType<typeof setTimeout>; // sentinel
      queueMicrotask(() => {
        this.processingTimer = null;
        if (!this.isShutdown) this.processNext();
      });
    } else {
      // Wait until next token arrives (affected by fake timers in tests)
      const msUntilToken = (1 - this.tokens) / this.ratePerMs;
      this.processingTimer = setTimeout(() => {
        this.processingTimer = null;
        this.processNext();
      }, msUntilToken);
    }
  }

  private processNext(): void {
    if (this.isShutdown) return;

    this.refillTokens();
    if (this.tokens < 1) {
      this.scheduleNext();
      return;
    }

    const entry = this.dequeueNext();
    if (!entry) return;

    this.tokens -= 1;
    this.activeCount++;

    entry.request
      .execute()
      .then((v) => {
        this.activeCount--;
        entry.resolve(v);
        this.scheduleNext();
      })
      .catch((e) => {
        this.activeCount--;
        entry.reject(e);
        this.scheduleNext();
      });

    // If more entries, keep scheduling
    if (this.pending > 0) {
      this.scheduleNext();
    }
  }

  private peekNext(): QueueEntry<unknown> | null {
    for (const level of PRIORITY_ORDER.slice(1)) { // skip 'critical' — handled inline
      const queue = this.queues.get(level)!;
      if (queue.length > 0) return queue[0];
    }
    return null;
  }

  private dequeueNext(): QueueEntry<unknown> | null {
    for (const level of PRIORITY_ORDER.slice(1)) { // skip 'critical'
      const queue = this.queues.get(level)!;
      if (queue.length > 0) return queue.shift()!;
    }
    return null;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(1, this.tokens + elapsed * this.ratePerMs);
    this.lastRefill = now;
  }

  /** Starvation prevention: force ≥1 low/background task per 60s */
  private runStarvationSlot(): void {
    if (this.isShutdown) return;

    for (const level of ['low', 'background'] as PriorityLevel[]) {
      const queue = this.queues.get(level)!;
      if (queue.length > 0) {
        const entry = queue.shift()!;
        this.activeCount++;
        entry.request
          .execute()
          .then((v) => { this.activeCount--; entry.resolve(v); })
          .catch((e) => { this.activeCount--; entry.reject(e); });
        return; // one slot per interval
      }
    }
  }
}
