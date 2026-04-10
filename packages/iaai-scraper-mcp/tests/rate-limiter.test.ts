import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/utils/rate-limiter.js';
import { RateLimitError } from '@car-auctions/shared';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a RateLimiter for unit tests.
 * Uses Infinity requestsPerSecond so Math.ceil(1000/Infinity) = 0,
 * meaning waitForSlot() never introduces a delay during tests.
 */
function makeLimiter(
  overrides: {
    requestsPerSecond?: number;
    dailyCap?: number;
    backoffMultiplier?: number;
    maxBackoffMs?: number;
  } = {}
) {
  return new RateLimiter({
    requestsPerSecond: Infinity, // Math.ceil(1000/Infinity) = 0 → no interval wait
    dailyCap: 500,
    backoffMultiplier: 2,
    maxBackoffMs: 60000,
    ...overrides,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes a function and returns its result', async () => {
    const limiter = makeLimiter();
    const result = await limiter.execute(async () => 42);
    expect(result).toBe(42);
  });

  it('throws RateLimitError when daily cap is exceeded', async () => {
    const limiter = makeLimiter({ dailyCap: 2 });
    await limiter.execute(async () => 'first');
    await limiter.execute(async () => 'second');
    await expect(limiter.execute(async () => 'third')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('resets daily count after midnight UTC', async () => {
    const limiter = makeLimiter({ dailyCap: 1 });

    // Use up the cap
    await limiter.execute(async () => 'ok');

    // Advance past midnight UTC
    const now = Date.now();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    vi.setSystemTime(tomorrow.getTime() + 1);

    // Should succeed again after reset
    const result = await limiter.execute(async () => 'after reset');
    expect(result).toBe('after reset');
  });

  it('applies initial 3s backoff on first RateLimitError from fn', async () => {
    const limiter = makeLimiter();
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    // First call throws RateLimitError to trigger backoff; currentBackoffMs becomes 3000
    await expect(
      limiter.execute(async () => {
        throw new RateLimitError('rate limited', 3000);
      })
    ).rejects.toBeInstanceOf(RateLimitError);

    // Second call should schedule the 3000ms backoff delay
    const promise = limiter.execute(async () => 'ok');
    await vi.runAllTimersAsync();
    await promise;

    // Find the backoff setTimeout call (3000ms)
    const backoffCall = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 3000);
    expect(backoffCall).toBeDefined();
  });

  it('doubles backoff on repeated RateLimitError from fn', async () => {
    const limiter = makeLimiter({ maxBackoffMs: 60000 });

    // First RateLimitError → currentBackoffMs becomes 3000
    await expect(
      limiter.execute(async () => {
        throw new RateLimitError('limited', 3000);
      })
    ).rejects.toBeInstanceOf(RateLimitError);

    // Advance first backoff timer and fire a second failing request → currentBackoffMs becomes 6000
    let p2Error: unknown;
    const p2 = limiter
      .execute(async () => {
        throw new RateLimitError('limited', 6000);
      })
      .catch((err) => {
        p2Error = err;
      });
    await vi.runAllTimersAsync();
    await p2;
    expect(p2Error).toBeInstanceOf(RateLimitError);

    // Now the next execute should apply the 6000ms backoff
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const promise = limiter.execute(async () => 'done');
    await vi.runAllTimersAsync();
    await promise;

    const backoffCall = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 6000);
    expect(backoffCall).toBeDefined();
  });

  it('caps backoff at maxBackoffMs', async () => {
    const limiter = makeLimiter({ maxBackoffMs: 5000, backoffMultiplier: 100 });

    // Trigger with a large multiplier → initial 3000, then 3000*100 = 300000, capped to 5000
    await expect(
      limiter.execute(async () => {
        throw new RateLimitError('limited', 5000);
      })
    ).rejects.toBeInstanceOf(RateLimitError);

    // Second error triggers the cap: 3000 * 100 = 300000 → capped at 5000
    let p2Error: unknown;
    const p2 = limiter
      .execute(async () => {
        throw new RateLimitError('limited', 5000);
      })
      .catch((err) => {
        p2Error = err;
      });
    await vi.runAllTimersAsync();
    await p2;
    expect(p2Error).toBeInstanceOf(RateLimitError);

    // Third execute should use capped backoff of 5000ms
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const promise = limiter.execute(async () => 'done');
    await vi.runAllTimersAsync();
    await promise;

    const backoffCall = setTimeoutSpy.mock.calls.find(([, ms]) => ms === 5000);
    expect(backoffCall).toBeDefined();
  });

  it('resets backoff to 0 on successful execute', async () => {
    const limiter = makeLimiter();

    // Trigger initial backoff
    await expect(
      limiter.execute(async () => {
        throw new RateLimitError('limited', 3000);
      })
    ).rejects.toBeInstanceOf(RateLimitError);

    // Succeed — should reset backoff
    let p = limiter.execute(async () => 'ok');
    await vi.runAllTimersAsync();
    await p;

    // Next call should have no backoff delay
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    p = limiter.execute(async () => 'no backoff');
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result).toBe('no backoff');

    // No backoff-sized setTimeout should have been scheduled
    const backoffCalls = setTimeoutSpy.mock.calls.filter(([, ms]) => (ms as number) >= 3000);
    expect(backoffCalls).toHaveLength(0);
  });

  it('re-throws non-RateLimitError without triggering backoff', async () => {
    const limiter = makeLimiter();
    const err = new Error('network error');
    await expect(
      limiter.execute(async () => {
        throw err;
      })
    ).rejects.toThrow('network error');

    // No backoff should be set — next call succeeds immediately
    const result = await limiter.execute(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('enforces token-bucket minimum interval between requests', async () => {
    vi.useRealTimers();
    // 2 req/s → minIntervalMs = 500ms
    const limiter = makeLimiter({ requestsPerSecond: 2 });
    const times: number[] = [];
    await limiter.execute(async () => {
      times.push(Date.now());
    });
    await limiter.execute(async () => {
      times.push(Date.now());
    });
    // Second request should have been delayed by at least ~500ms
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(450);
  });
});
