/**
 * Image utilities: fetch, resize, compress to WebP → base64
 */
import type { ImageCache } from '../cache/image-cache.js';

const MAX_DIMENSION = 800;
const WEBP_QUALITY = 80;

// Realistic browser UA — consistent with Playwright stealth sessions
const FETCH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch an image URL, compress it to WebP, and return a base64 data URI.
 * Returns null if the fetch or encoding fails.
 */
export async function fetchImageAsBase64(url: string, cache?: ImageCache): Promise<string | null> {
  // Cache stores the already-compressed WebP — return directly without recompressing
  if (cache) {
    const cached = await cache.get(url);
    if (cached) {
      return `data:image/webp;base64,${cached.toString('base64')}`;
    }
  }

  let buffer: Buffer;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return null;
  }

  const compressed = await compressImageToWebP(buffer);

  if (cache && compressed) await cache.set(url, compressed);

  if (compressed) {
    return `data:image/webp;base64,${compressed.toString('base64')}`;
  }
  return `data:image/octet-stream;base64,${buffer.toString('base64')}`;
}

const COMPRESS_TIMEOUT_MS = 30_000;

async function compressImageToWebP(buffer: Buffer): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default;
    return await Promise.race([
      sharp(buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Image compression timed out')), COMPRESS_TIMEOUT_MS)
      ),
    ]);
  } catch {
    return null;
  }
}
