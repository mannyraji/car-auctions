/**
 * Disk-based image cache for auction lot images.
 *
 * Stores compressed image files named by URL hash.
 * The file extension is configurable (e.g. '.jpg' for Copart, '.webp' for IAAI).
 */
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

export class ImageCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly fileExtension: string;

  constructor(cacheDir: string, fileExtension = '.jpg', ttlHours = 24) {
    this.cacheDir = cacheDir;
    this.fileExtension = fileExtension;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  private urlToFilename(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex') + this.fileExtension;
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
