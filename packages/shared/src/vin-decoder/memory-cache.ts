/**
 * In-memory VIN cache with LRU eviction
 *
 * Max 200 entries. TTL-aware on get.
 */
import type { VINDecodeResult, VinCache } from '../types/index.js';

interface CacheEntry {
  result: VINDecodeResult;
  expiresAt: number;
}

/**
 * LRU in-memory VIN cache.
 * Useful for testing and short-lived processes.
 *
 * @example
 * const cache = new InMemoryVinCache();
 * await cache.set(vin, result, 90 * 24 * 60 * 60 * 1000);
 * const cached = await cache.get(vin); // VINDecodeResult or null
 */
export class InMemoryVinCache implements VinCache {
  private readonly maxEntries: number;
  private readonly store: Map<string, CacheEntry>;

  constructor(maxEntries = 200) {
    this.maxEntries = maxEntries;
    this.store = new Map();
  }

  async get(vin: string): Promise<VINDecodeResult | null> {
    const entry = this.store.get(vin);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(vin);
      return null;
    }
    // LRU: refresh position by re-inserting
    this.store.delete(vin);
    this.store.set(vin, entry);
    return entry.result;
  }

  async set(vin: string, result: VINDecodeResult, ttlMs: number): Promise<void> {
    // Evict oldest entry if at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(vin)) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
    this.store.set(vin, {
      result,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /** Number of entries currently in cache (including expired) */
  get size(): number {
    return this.store.size;
  }

  /** Clear all entries */
  clear(): void {
    this.store.clear();
  }
}
