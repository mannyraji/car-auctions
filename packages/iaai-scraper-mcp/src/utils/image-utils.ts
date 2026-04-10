/**
 * Image utilities: resize and compress via sharp pipeline
 */

const MAX_WIDTH = 800;
const WEBP_QUALITY = 75;
const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB guard

/**
 * Resize an image to at most 800 px wide (preserving aspect ratio) and
 * convert it to WebP at 75% quality.
 *
 * Supports common input formats: JPEG, PNG, WebP, GIF, etc.
 * Rejects inputs larger than 25 MB to prevent memory exhaustion.
 */
export async function resizeAndCompress(
  inputBuffer: Buffer
): Promise<{ buffer: Buffer; width: number; height: number }> {
  if (inputBuffer.length > MAX_INPUT_BYTES) {
    throw new Error(
      `Image too large (${(inputBuffer.length / 1024 / 1024).toFixed(1)} MB). Max ${MAX_INPUT_BYTES / 1024 / 1024} MB.`
    );
  }

  const sharp = (await import('sharp')).default;

  const { data, info } = await sharp(inputBuffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height };
}
