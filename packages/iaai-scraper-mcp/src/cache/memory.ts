/**
 * In-memory LRU cache for IAAI search results
 *
 * Max 200 entries, configurable TTL (default 15 min).
 * Full implementation: T010.
 */
export class MemoryCache<T = unknown> {
  get(_key: string): T | undefined {
    return undefined;
  }

  set(_key: string, _value: T): void {}

  delete(_key: string): void {}

  clear(): void {}
}
