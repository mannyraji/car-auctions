/**
 * @file src/priority-queue.ts
 * @description Priority-aware request queue with token bucket rate limiting.
 *
 * Five priority tiers: critical > high > normal > low > background
 * critical requests bypass queue ordering but still consume a rate limit token.
 * Starvation prevention: low/background guaranteed 1 slot per starvationThresholdMs.
 */

import type { PriorityLevel, PriorityRequest } from './types/index.js';
import { ScraperError } from './errors.js';

// ============================================================
// Token Bucket
// ============================================================

/**
 * Simple token bucket implementation with lazy refill.
 * Max burst: 1 token. Refills 1 token per refillIntervalMs.
 */
class TokenBucket {
  private tokens: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private lastRefillTime: number;

  constructor(maxTokens: number, refillIntervalMs: number) {
    this.maxTokens = maxTokens;
    this.refillIntervalMs = refillIntervalMs;
    this.tokens = maxTokens;
    this.lastRefillTime = Date.now();
  }

  /**
   * Attempts to consume one token. Returns true if successful, false if no tokens.
   */
  tryConsume(): boolean {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /**
   * Time in ms until next token is available. Returns 0 if a token is already available.
   */
  msUntilNextToken(): number {
    this._refill();
    if (this.tokens >= 1) return 0;
    const elapsed = Date.now() - this.lastRefillTime;
    return Math.max(0, this.refillIntervalMs - elapsed);
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const tokensToAdd = Math.floor(elapsed / this.refillIntervalMs);
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
      // Advance lastRefillTime by whole intervals to maintain cadence
      this.lastRefillTime = this.lastRefillTime + tokensToAdd * this.refillIntervalMs;
    }
  }
}

// ============================================================
// PriorityQueue configuration
// ============================================================

/** Configuration for PriorityQueue. */
export interface PriorityQueueOptions {
  /**
   * Token bucket rate limit: one request per `rateLimitIntervalMs` ms.
   * Default: 3_000 (1 req per 3 seconds).
   */
  rateLimitIntervalMs?: number;
  /**
   * Starvation prevention threshold in ms.
   * Low/background tasks guaranteed execution at least once per this interval.
   * Default: 60_000 (60 seconds).
   */
  starvationThresholdMs?: number;
}

const PRIORITY_ORDER: PriorityLevel[] = ['high', 'normal', 'low', 'background'];

// ============================================================
// PriorityQueue
// ============================================================

/**
 * Priority-aware request queue with token bucket rate limiting.
 *
 * Design:
 * - Five priority tiers: critical > high > normal > low > background
 * - critical requests bypass queue ordering but still consume a rate limit token
 * - Starvation prevention: low/background tasks guaranteed 1 slot per 60s
 * - Rate limit: configurable token bucket (default 1 req/3s)
 * - FIFO within each priority tier
 * - Per-process singleton pattern recommended
 *
 * @example
 * const queue = new PriorityQueue({ rateLimitIntervalMs: 3_000 });
 *
 * // Normal-priority request
 * const result = await queue.enqueue('normal', async () => {
 *   return fetchCopartListing(lotId);
 * });
 *
 * // Critical bypass (still rate-limited)
 * const urgentResult = await queue.enqueue('critical', async () => {
 *   return fetchCopartListing(urgentLotId);
 * });
 */
export class PriorityQueue {
  private readonly _bucket: TokenBucket;
  private readonly _queues: Map<PriorityLevel, PriorityRequest[]>;
  private readonly _lastServedAt: Map<PriorityLevel, number>;
  private readonly _starvationThresholdMs: number;
  private readonly _rateLimitIntervalMs: number;

  private _running = false;
  private _shutdownResolve: (() => void) | null = null;
  private _shutdownPromise: Promise<void> | null = null;
  private _dispatchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PriorityQueueOptions = {}) {
    this._rateLimitIntervalMs = options.rateLimitIntervalMs ?? 3_000;
    this._starvationThresholdMs = options.starvationThresholdMs ?? 60_000;

    this._bucket = new TokenBucket(1, this._rateLimitIntervalMs);

    this._queues = new Map([
      ['critical', []],
      ['high', []],
      ['normal', []],
      ['low', []],
      ['background', []],
    ]);

    this._lastServedAt = new Map([
      ['critical', 0],
      ['high', 0],
      ['normal', 0],
      ['low', 0],
      ['background', 0],
    ]);
  }

  /**
   * Enqueues an operation at the given priority level.
   *
   * For 'critical': bypasses queue ordering; executes as soon as a rate limit
   * token is available.
   *
   * For all other levels: waits for queue position and token availability.
   *
   * @param priority - Priority level for this request
   * @param fn - Async operation to execute
   * @returns Promise resolving to the operation result
   */
  enqueue<T>(priority: PriorityLevel, fn: () => Promise<T>): Promise<T> {
    if (this._shutdownPromise) {
      return Promise.reject(
        new ScraperError('PriorityQueue is shut down', {
          code: 'RATE_LIMITED',
          retryable: false,
        })
      );
    }

    return new Promise<T>((resolve, reject) => {
      const request: PriorityRequest<T> = {
        id: crypto.randomUUID(),
        priority,
        enqueuedAt: Date.now(),
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      };

      const tierQueue = this._queues.get(priority)!;
      tierQueue.push(request as PriorityRequest);

      if (!this._running) {
        this._startDispatch();
      }
    });
  }

  /**
   * Returns the current queue depth by priority level.
   */
  getQueueDepth(): Record<PriorityLevel, number> {
    return {
      critical: this._queues.get('critical')!.length,
      high: this._queues.get('high')!.length,
      normal: this._queues.get('normal')!.length,
      low: this._queues.get('low')!.length,
      background: this._queues.get('background')!.length,
    };
  }

  /**
   * Drains the queue and stops the dispatch loop.
   * In-flight requests complete; pending requests are rejected.
   */
  async shutdown(): Promise<void> {
    if (this._shutdownPromise) return this._shutdownPromise;

    this._shutdownPromise = new Promise<void>((resolve) => {
      this._shutdownResolve = resolve;
    });

    // Reject all pending requests
    for (const tier of this._queues.values()) {
      for (const req of tier) {
        req.reject(
          new ScraperError('PriorityQueue is shutting down', {
            code: 'RATE_LIMITED',
            retryable: false,
          })
        );
      }
      tier.length = 0;
    }

    if (this._dispatchTimer) {
      clearTimeout(this._dispatchTimer);
      this._dispatchTimer = null;
    }

    this._running = false;
    this._shutdownResolve?.();
    return this._shutdownPromise;
  }

  private _startDispatch(): void {
    this._running = true;
    this._scheduleDispatch(0);
  }

  private _scheduleDispatch(delayMs: number): void {
    if (this._shutdownPromise) return;
    this._dispatchTimer = setTimeout(() => {
      void this._dispatch();
    }, delayMs);
  }

  private async _dispatch(): Promise<void> {
    if (this._shutdownPromise) return;

    const next = this._selectNext();

    if (!next) {
      // Queue is empty — stop the loop
      this._running = false;
      return;
    }

    // Wait for a token
    const waitMs = this._bucket.msUntilNextToken();
    if (waitMs > 0) {
      this._scheduleDispatch(waitMs);
      return;
    }

    // Consume token and execute
    this._bucket.tryConsume();
    this._lastServedAt.set(next.priority, Date.now());

    // Remove from queue
    const tierQueue = this._queues.get(next.priority)!;
    const idx = tierQueue.indexOf(next);
    if (idx !== -1) tierQueue.splice(idx, 1);

    // Execute the request
    try {
      const result = await next.fn();
      next.resolve(result);
    } catch (err) {
      next.reject(err);
    }

    // Schedule next dispatch
    if (this._hasQueuedRequests()) {
      const nextWait = this._bucket.msUntilNextToken();
      this._scheduleDispatch(nextWait);
    } else {
      this._running = false;
    }
  }

  /**
   * Selects the next request to execute based on priority and starvation prevention.
   * Returns null if all queues are empty.
   */
  private _selectNext(): PriorityRequest | null {
    const now = Date.now();

    // Check starvation prevention for low/background tiers
    for (const tier of ['low', 'background'] as PriorityLevel[]) {
      const tierQueue = this._queues.get(tier)!;
      if (tierQueue.length === 0) continue;
      const lastServed = this._lastServedAt.get(tier) ?? 0;
      if (now - lastServed > this._starvationThresholdMs) {
        return tierQueue[0]!;
      }
    }

    // Normal priority selection: critical first, then FIFO order
    const critical = this._queues.get('critical')!;
    if (critical.length > 0) return critical[0]!;

    for (const tier of PRIORITY_ORDER) {
      const tierQueue = this._queues.get(tier)!;
      if (tierQueue.length > 0) return tierQueue[0]!;
    }

    return null;
  }

  private _hasQueuedRequests(): boolean {
    for (const queue of this._queues.values()) {
      if (queue.length > 0) return true;
    }
    return false;
  }
}
