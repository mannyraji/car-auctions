import { describe, it, expect } from 'vitest';
import { resizeAndCompress } from '../src/utils/image-utils.js';

describe('resizeAndCompress', () => {
  it('returns a WebP buffer with width and height', async () => {
    const sharp = (await import('sharp')).default;
    // Create a valid 100×60 JPEG via sharp for a reliable test input
    const input = await sharp({
      create: { width: 100, height: 60, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await resizeAndCompress(input);

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(60);

    // Confirm output is WebP (RIFF....WEBP magic bytes)
    const riff = result.buffer.subarray(0, 4).toString('ascii');
    const webp = result.buffer.subarray(8, 12).toString('ascii');
    expect(riff).toBe('RIFF');
    expect(webp).toBe('WEBP');
  });

  it('caps width at 800 px and preserves aspect ratio', async () => {
    const sharp = (await import('sharp')).default;
    // Create a 1600×400 image (4:1 aspect ratio)
    const input = await sharp({
      create: { width: 1600, height: 400, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await resizeAndCompress(input);

    expect(result.width).toBe(800);
    expect(result.height).toBe(200); // aspect ratio preserved (1600/2 × 400/2)
  });

  it('does not upscale images narrower than 800 px', async () => {
    const sharp = (await import('sharp')).default;
    // Create a 400×300 image
    const input = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .jpeg()
      .toBuffer();

    const result = await resizeAndCompress(input);

    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  it('accepts PNG input', async () => {
    const sharp = (await import('sharp')).default;
    const input = await sharp({
      create: { width: 200, height: 150, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    const result = await resizeAndCompress(input);

    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
    const webp = result.buffer.subarray(8, 12).toString('ascii');
    expect(webp).toBe('WEBP');
  });

  it('accepts WebP input', async () => {
    const sharp = (await import('sharp')).default;
    const input = await sharp({
      create: { width: 300, height: 200, channels: 3, background: { r: 255, g: 255, b: 0 } },
    })
      .webp()
      .toBuffer();

    const result = await resizeAndCompress(input);

    expect(result.width).toBe(300);
    expect(result.height).toBe(200);
    const webp = result.buffer.subarray(8, 12).toString('ascii');
    expect(webp).toBe('WEBP');
  });
});
