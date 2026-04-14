import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '../src/rate-limiter/index.js';
import { RateLimitError } from '../src/errors.js';

function makeLimiter(
  overrides: {
    requestsPerSecond?: number;
    dailyCap?: number;
    backoffMultiplier?: number;
    maxBackoffMs?: number;
  } = {}
) {
  return new RateLimiter({
    requestsPerSecond: Infinity,
    dailyCap: 500,
    backoffMultiplier: 2,
    maxBackoffMs: 60000,
    ...overrides,
  });
}

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes a function and returns its result', async () => {
    const limiter = makeLimiter();
    await expect(limiter.execute(async () => 42)).resolves.toBe(42);
  });

  it('throws RateLimitError when daily cap is exceeded', async () => {
    const limiter = makeLimiter({ dailyCap: 1 });
    await limiter.execute(async () => 'ok');
    await expect(limiter.execute(async () => 'nope')).rejects.toBeInstanceOf(RateLimitError);
  });

  it('resets daily count after midnight UTC', async () => {
    const limiter = makeLimiter({ dailyCap: 1 });
    await limiter.execute(async () => 'ok');

    const tomorrow = new Date(Date.now());
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    vi.setSystemTime(tomorrow.getTime() + 1);

    await expect(limiter.execute(async () => 'after reset')).resolves.toBe('after reset');
  });

  it('uses Retry-After value when larger than computed backoff', async () => {
    const limiter = makeLimiter();

    await expect(
      limiter.execute(async () => {
        throw new RateLimitError('rate limited', 7000);
      })
    ).rejects.toBeInstanceOf(RateLimitError);

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const promise = limiter.execute(async () => 'ok');
    await vi.runAllTimersAsync();
    await promise;

    expect(setTimeoutSpy.mock.calls.find(([, ms]) => ms === 7000)).toBeDefined();
  });

  it('caps backoff at maxBackoffMs', async () => {
    const limiter = makeLimiter({ maxBackoffMs: 5000, backoffMultiplier: 100 });

    await expect(
      limiter.execute(async () => {
        throw new RateLimitError('limited', 5000);
      })
    ).rejects.toBeInstanceOf(RateLimitError);

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

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const promise = limiter.execute(async () => 'done');
    await vi.runAllTimersAsync();
    await promise;

    expect(setTimeoutSpy.mock.calls.find(([, ms]) => ms === 5000)).toBeDefined();
  });
});
