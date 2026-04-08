/**
 * Disk-based image cache for Copart lot images
 * Stores compressed JPEG files named by URL hash
 */
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '..', '..', 'data', 'images');

export class ImageCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;

  constructor(cacheDir?: string, ttlHours = 24) {
    this.cacheDir = cacheDir ?? DEFAULT_CACHE_DIR;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  private urlToFilename(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex') + '.jpg';
  }

  private filePath(url: string): string {
    return path.join(this.cacheDir, this.urlToFilename(url));
  }

  async has(url: string): Promise<boolean> {
    try {
      const stats = await fs.stat(this.filePath(url));
      const age = Date.now() - stats.mtimeMs;
      return age < this.ttlMs;
    } catch {
      return false;
    }
  }

  async get(url: string): Promise<Buffer | null> {
    if (!(await this.has(url))) return null;
    try {
      return await fs.readFile(this.filePath(url));
    } catch {
      return null;
    }
  }

  async set(url: string, buffer: Buffer): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.writeFile(this.filePath(url), buffer);
  }
}
