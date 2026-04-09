/**
 * Disk-based image cache for IAAI lot images
 *
 * Stores compressed WebP files at data/images/, TTL 24 h.
 * Full implementation: T012.
 */
export class ImageCache {
  async has(_url: string): Promise<boolean> {
    return false;
  }
}
