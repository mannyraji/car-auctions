import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { ImageCache } from '../src/cache/image-cache.js';

function sha256Hex(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex');
}

describe('ImageCache', () => {
  let tmpDir: string;
  let cache: ImageCache;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iaai-image-cache-test-'));
    cache = new ImageCache(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('get()', () => {
    it('returns null when file does not exist', async () => {
      const result = await cache.get('https://example.com/image.jpg');
      expect(result).toBeNull();
    });

    it('returns the buffer for a valid cached entry', async () => {
      const url = 'https://example.com/image.jpg';
      const data = Buffer.from('fake-webp-data');
      await cache.set(url, data);

      const result = await cache.get(url);
      expect(result).not.toBeNull();
      expect(result!.equals(data)).toBe(true);
    });

    it('returns null for entries older than 24 hours', async () => {
      const url = 'https://example.com/old-image.jpg';
      const data = Buffer.from('old-data');
      await cache.set(url, data);

      // Backdate the file mtime by 25 hours
      const filePath = path.join(tmpDir, sha256Hex(url) + '.webp');
      const pastTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await fs.utimes(filePath, pastTime, pastTime);

      const result = await cache.get(url);
      expect(result).toBeNull();
    });
  });

  describe('has()', () => {
    it('returns false when file does not exist', async () => {
      expect(await cache.has('https://example.com/missing.jpg')).toBe(false);
    });

    it('returns true for a fresh cached entry', async () => {
      const url = 'https://example.com/fresh.jpg';
      await cache.set(url, Buffer.from('data'));
      expect(await cache.has(url)).toBe(true);
    });

    it('returns false for expired entries', async () => {
      const url = 'https://example.com/expired.jpg';
      await cache.set(url, Buffer.from('data'));

      const filePath = path.join(tmpDir, sha256Hex(url) + '.webp');
      const pastTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await fs.utimes(filePath, pastTime, pastTime);

      expect(await cache.has(url)).toBe(false);
    });
  });

  describe('set()', () => {
    it('writes to data/images/<sha256(url)>.webp', async () => {
      const url = 'https://example.com/photo.jpg';
      const data = Buffer.from('webp-bytes');
      await cache.set(url, data);

      const expectedPath = path.join(tmpDir, sha256Hex(url) + '.webp');
      const written = await fs.readFile(expectedPath);
      expect(written.equals(data)).toBe(true);
    });

    it('creates the cache directory if it does not exist', async () => {
      const nestedDir = path.join(tmpDir, 'sub', 'images');
      const nestedCache = new ImageCache(nestedDir);
      const url = 'https://example.com/new.jpg';

      await nestedCache.set(url, Buffer.from('data'));

      const stats = await fs.stat(nestedDir);
      expect(stats.isDirectory()).toBe(true);
    });
  });
});
