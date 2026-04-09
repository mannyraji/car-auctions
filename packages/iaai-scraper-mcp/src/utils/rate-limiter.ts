/**
 * Rate limiter for IAAI requests
 *
 * Enforces 1 req/3 s, exponential backoff on 403/429, daily cap 500.
 * Full implementation: T007.
 */
import type { RateLimitConfig } from './config.js';

export class RateLimiter {
  constructor(_config?: Partial<RateLimitConfig>) {}

  async acquire(): Promise<void> {}

  recordSuccess(): void {}

  recordFailure(_statusCode?: number): void {}
}
