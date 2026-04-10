/**
 * In-memory LRU cache for search results
 * Max 200 entries, 15-minute TTL
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export class MemoryCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 200, ttlMinutes = 15) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMinutes * 60 * 1000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    entry.lastAccessed = Date.now();
    return entry.value;
  }

  set(key: string, value: T): void {
    this.evictExpired();
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      this.evictLru();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
      lastAccessed: Date.now(),
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  private evictLru(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.lastAccessed < oldestAccess) {
        oldestAccess = entry.lastAccessed;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}
