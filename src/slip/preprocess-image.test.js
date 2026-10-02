import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { preprocessImage, MAX_LONG_EDGE } from './preprocess-image.js';

const sharp = createRequire(import.meta.url)('sharp');

const toInput = (buffer, mediaType) => ({ data: buffer.toString('base64'), mediaType });
const decode = (result) => Buffer.from(result.data, 'base64');

function solid(width, height, background = { r: 200, g: 200, b: 200 }) {
  return sharp({ create: { width, height, channels: 3, background } });
}

describe('preprocessImage', () => {
  it('shrinks an image whose long edge is above the limit and keeps the aspect ratio', async () => {
    const input = toInput(await solid(3136, 2000).jpeg().toBuffer(), 'image/jpeg');

    const meta = await sharp(decode(await preprocessImage(input))).metadata();

    expect(meta.width).toBe(MAX_LONG_EDGE);
    expect(meta.height).toBe(1000);
  });

  it('does not enlarge a small image', async () => {
    const input = toInput(await solid(400, 300).jpeg().toBuffer(), 'image/jpeg');

    const meta = await sharp(decode(await preprocessImage(input))).metadata();

    expect([meta.width, meta.height]).toEqual([400, 300]);
  });

  it('rotates a photo according to its EXIF orientation', async () => {
    // orientation 6 = ถ่ายแนวนอนแล้วต้องหมุน 90 องศาจึงตั้งตรง
    const input = toInput(await solid(300, 100).jpeg().withMetadata({ orientation: 6 }).toBuffer(), 'image/jpeg');

    const meta = await sharp(decode(await preprocessImage(input))).metadata();

    expect([meta.width, meta.height]).toEqual([100, 300]);
    expect(meta.orientation).toBeUndefined();
  });

  it('stretches the contrast of a faded image', async () => {
    const width = 100;
    const height = 100;
    const pixels = Buffer.alloc(width * height);
    pixels.fill(150);
    pixels.fill(100, 0, pixels.length / 2);
    const input = toInput(await sharp(pixels, { raw: { width, height, channels: 1 } }).jpeg({ quality: 100 }).toBuffer(), 'image/jpeg');

    const stats = await sharp(decode(await preprocessImage(input))).stats();

    expect(stats.channels[0].min).toBeLessThan(30);
    expect(stats.channels[0].max).toBeGreaterThan(225);
  });

  it('keeps a PNG as a PNG and converts other formats to JPEG', async () => {
    const png = await preprocessImage(toInput(await solid(200, 100).png().toBuffer(), 'image/png'));
    const webp = await preprocessImage(toInput(await solid(200, 100).webp().toBuffer(), 'image/webp'));

    expect(png.mediaType).toBe('image/png');
    expect((await sharp(decode(png)).metadata()).format).toBe('png');
    expect(webp.mediaType).toBe('image/jpeg');
    expect((await sharp(decode(webp)).metadata()).format).toBe('jpeg');
  });

  it('returns the original image untouched when it cannot be decoded', async () => {
    const input = { data: 'QUJD', mediaType: 'image/jpeg' };
    const logger = { error: vi.fn() };

    expect(await preprocessImage(input, { logger })).toBe(input);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
