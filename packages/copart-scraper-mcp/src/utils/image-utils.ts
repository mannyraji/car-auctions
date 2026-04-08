/**
 * Image utilities: fetch, resize, compress → base64
 */
import type { ImageCache } from '../cache/image-cache.js';

const MAX_DIMENSION = 800;
const JPEG_QUALITY = 80;

// Realistic browser UA — consistent with Playwright stealth sessions
const FETCH_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Fetch an image URL, compress it, and return a base64 data URI.
 * Returns null if the fetch or encoding fails.
 */
export async function fetchImageAsBase64(url: string, cache?: ImageCache): Promise<string | null> {
  // Cache stores the already-compressed JPEG — return directly without recompressing
  if (cache) {
    const cached = await cache.get(url);
    if (cached) {
      return `data:image/jpeg;base64,${cached.toString('base64')}`;
    }
  }

  let buffer: Buffer;
  let sourceMimeType: string | null = null;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': FETCH_USER_AGENT },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    sourceMimeType = getResponseImageMimeType(response.headers.get('content-type'));
    const arrayBuffer = await response.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return null;
  }

  const { compressed, mimeType } = await compressImage(buffer, sourceMimeType);

  if (cache) await cache.set(url, compressed);

  return `data:${mimeType};base64,${compressed.toString('base64')}`;
}

const COMPRESS_TIMEOUT_MS = 30_000;

async function compressImage(
  buffer: Buffer,
  sourceMimeType?: string | null
): Promise<{ compressed: Buffer; mimeType: string }> {
  try {
    const sharp = (await import('sharp')).default;
    const compressed = await Promise.race([
      sharp(buffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Image compression timed out')), COMPRESS_TIMEOUT_MS)
      ),
    ]);
    return { compressed, mimeType: 'image/jpeg' };
  } catch {
    return {
      compressed: buffer,
      mimeType: detectImageMimeType(buffer) ?? sourceMimeType ?? 'application/octet-stream',
    };
  }
}

function getResponseImageMimeType(contentType: string | null): string | null {
  if (!contentType) return null;

  const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase();
  return mimeType?.startsWith('image/') ? mimeType : null;
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= 6 &&
    (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      buffer.subarray(0, 6).toString('ascii') === 'GIF89a')
  ) {
    return 'image/gif';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}
