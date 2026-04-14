import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../src/cache/memory-cache.js';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for missing keys', () => {
    const cache = new MemoryCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves values', () => {
    const cache = new MemoryCache<string>();
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('expires entries after TTL', () => {
    const cache = new MemoryCache<string>(200, 15);
    cache.set('key', 'value');
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(cache.get('key')).toBeUndefined();
  });

  it('evicts LRU entry when max capacity is reached', () => {
    const cache = new MemoryCache<number>(3, 15);
    cache.set('a', 1);
    vi.advanceTimersByTime(1);
    cache.set('b', 2);
    vi.advanceTimersByTime(1);
    cache.set('c', 3);
    cache.get('a');
    vi.advanceTimersByTime(1);
    cache.set('d', 4);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('does not evict other entries when updating an existing key at capacity', () => {
    const cache = new MemoryCache<number>(2, 15);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 99);

    expect(cache.get('a')).toBe(99);
    expect(cache.get('b')).toBe(2);
    expect(cache.size).toBe(2);
  });
});
