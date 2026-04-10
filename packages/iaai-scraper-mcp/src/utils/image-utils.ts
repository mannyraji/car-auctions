/**
 * Image utilities: resize and compress via sharp pipeline
 */

const MAX_WIDTH = 800;
const WEBP_QUALITY = 75;

/**
 * Resize an image to at most 800 px wide (preserving aspect ratio) and
 * convert it to WebP at 75% quality.
 *
 * Supports common input formats: JPEG, PNG, WebP, GIF, etc.
 */
export async function resizeAndCompress(
  inputBuffer: Buffer
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const sharp = (await import('sharp')).default;

  const { data, info } = await sharp(inputBuffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  return { buffer: data, width: info.width, height: info.height };
}
