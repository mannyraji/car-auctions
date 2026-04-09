import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../src/cache/memory.js';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns undefined for a missing key', () => {
    const cache = new MemoryCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves a value', () => {
    const cache = new MemoryCache<string>();
    cache.set('key', 'value');
    expect(cache.get('key')).toBe('value');
  });

  it('returns undefined for an expired entry', () => {
    const cache = new MemoryCache<string>(200, 15);
    cache.set('key', 'value');
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    expect(cache.get('key')).toBeUndefined();
  });

  it('respects configurable TTL', () => {
    const cache = new MemoryCache<string>(200, 5);
    cache.set('key', 'value');
    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    expect(cache.get('key')).toBe('value');
    vi.advanceTimersByTime(2);
    expect(cache.get('key')).toBeUndefined();
  });

  it('evicts LRU entry when max capacity is reached', () => {
    const cache = new MemoryCache<number>(3, 15);
    cache.set('a', 1);
    vi.advanceTimersByTime(1);
    cache.set('b', 2);
    vi.advanceTimersByTime(1);
    cache.set('c', 3);

    // Access 'a' to make 'b' the LRU
    cache.get('a');
    vi.advanceTimersByTime(1);

    // Adding 'd' should evict 'b' (least recently used)
    cache.set('d', 4);

    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
    expect(cache.get('d')).toBe(4);
  });

  it('delete removes a specific key', () => {
    const cache = new MemoryCache<string>();
    cache.set('key', 'value');
    cache.delete('key');
    expect(cache.get('key')).toBeUndefined();
  });

  it('clear removes all entries', () => {
    const cache = new MemoryCache<string>();
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('defaults to max 200 entries', () => {
    const cache = new MemoryCache<number>();
    for (let i = 0; i < 200; i++) {
      cache.set(`key-${i}`, i);
    }
    expect(cache.size).toBe(200);
    // Adding one more should evict LRU and keep size at 200
    cache.set('key-200', 200);
    expect(cache.size).toBe(200);
  });
});
