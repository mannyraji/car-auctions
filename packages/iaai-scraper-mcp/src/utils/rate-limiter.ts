/**
 * Rate limiter for IAAI requests
 * Enforces 1 req/3s, exponential backoff on 403/429, daily cap 500
 */
import { RateLimitError } from '@car-auctions/shared';
import { config } from './config.js';

interface RateLimiterConfig {
  requestsPerSecond?: number;
  dailyCap?: number;
  backoffMultiplier?: number;
  maxBackoffMs?: number;
}

export class RateLimiter {
  private readonly minIntervalMs: number;
  private lastRequestAt = 0;
  private dailyCount = 0;
  private dailyResetAt: number;
  private readonly dailyCap: number;
  private readonly backoffMultiplier: number;
  private readonly maxBackoffMs: number;
  private currentBackoffMs = 0;

  constructor(cfg: RateLimiterConfig = {}) {
    const rps = cfg.requestsPerSecond ?? config.rateLimit.requestsPerSecond;
    this.minIntervalMs = Math.ceil(1000 / rps);
    this.dailyCap = cfg.dailyCap ?? config.rateLimit.dailyCap;
    this.backoffMultiplier = cfg.backoffMultiplier ?? config.rateLimit.backoffMultiplier;
    this.maxBackoffMs = cfg.maxBackoffMs ?? config.rateLimit.maxBackoffMs;
    this.dailyResetAt = this.nextMidnight();
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (Date.now() >= this.dailyResetAt) {
      this.dailyCount = 0;
      this.dailyResetAt = this.nextMidnight();
    }

    if (this.dailyCount >= this.dailyCap) {
      throw new RateLimitError('Daily request cap reached', this.dailyResetAt - Date.now());
    }

    await this.waitForSlot();

    if (this.currentBackoffMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.currentBackoffMs));
    }

    try {
      this.dailyCount++;
      const result = await fn();
      this.currentBackoffMs = 0;
      return result;
    } catch (err) {
      if (err instanceof RateLimitError) {
        const computedBackoffMs = this.currentBackoffMs
          ? this.currentBackoffMs * this.backoffMultiplier
          : 3000;
        const retryAfterMs = err.retryAfterMs ?? 0;
        this.currentBackoffMs = Math.min(
          Math.max(computedBackoffMs, retryAfterMs),
          this.maxBackoffMs
        );
      }
      throw err;
    }
  }

  private async waitForSlot(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, this.minIntervalMs - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  private nextMidnight(): number {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.getTime();
  }
}
