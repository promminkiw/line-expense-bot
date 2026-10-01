import { describe, it, expect, vi, afterEach } from 'vitest';
import { Readable } from 'node:stream';
import { createImageDownloader, MAX_IMAGE_BYTES } from './download-image.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const GIF = Buffer.from('GIF89a-rest', 'latin1');
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 ', 'latin1')]);

function setup(chunks) {
  const blobClient = { getMessageContent: vi.fn().mockResolvedValue(Readable.from(chunks)) };
  return { blobClient, downloadImage: createImageDownloader({ blobClient }) };
}

describe('createImageDownloader', () => {
  it('downloads the message content and returns it as base64 with the detected type', async () => {
    const { blobClient, downloadImage } = setup([JPEG.subarray(0, 3), JPEG.subarray(3)]);

    const result = await downloadImage('m1');

    expect(blobClient.getMessageContent).toHaveBeenCalledWith('m1');
    expect(result).toEqual({ status: 'ok', mediaType: 'image/jpeg', data: JPEG.toString('base64') });
  });

  it('detects png, gif and webp from the first bytes', async () => {
    const types = [];
    for (const bytes of [PNG, GIF, WEBP]) {
      types.push((await setup([bytes]).downloadImage('m1')).mediaType);
    }

    expect(types).toEqual(['image/png', 'image/gif', 'image/webp']);
  });

  it('rejects a file that is not a supported image whatever its name says', async () => {
    const { downloadImage } = setup([Buffer.from('%PDF-1.4 not an image')]);

    expect(await downloadImage('m1')).toEqual({ status: 'unsupported' });
  });

  it('stops with too_large once the content passes the limit', async () => {
    const big = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES)]);
    const { downloadImage } = setup([big.subarray(0, 1000), big.subarray(1000)]);

    expect(await downloadImage('m1')).toEqual({ status: 'too_large' });
  });

  it('accepts content of exactly the limit', async () => {
    const exact = Buffer.concat([JPEG, Buffer.alloc(MAX_IMAGE_BYTES - JPEG.length)]);
    const { downloadImage } = setup([exact]);

    expect((await downloadImage('m1')).status).toBe('ok');
  });

  it('keeps the limit at 3.75 MB so the base64 payload stays under 5 MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(3932160);
  });

  it('lets a download error propagate so the bot can log and apologise', async () => {
    const blobClient = { getMessageContent: vi.fn().mockRejectedValue(new Error('LINE down')) };

    await expect(createImageDownloader({ blobClient })('m1')).rejects.toThrow('LINE down');
  });

  describe('download timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('rejects when getMessageContent never resolves', async () => {
      vi.useFakeTimers();
      const blobClient = { getMessageContent: vi.fn(() => new Promise(() => {})) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000 })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);

      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    });

    it('rejects and destroys the stream when it stalls mid-way', async () => {
      vi.useFakeTimers();
      const stream = new Readable({ read() {} });
      stream.push(JPEG);
      const blobClient = { getMessageContent: vi.fn().mockResolvedValue(stream) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000 })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);

      await assertion;
      expect(stream.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('destroys a stream that arrives after the timeout already fired', async () => {
      vi.useFakeTimers();
      const stream = new Readable({ read() {} });
      let deliver;
      const blobClient = { getMessageContent: vi.fn(() => new Promise((resolve) => { deliver = resolve; })) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000 })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);
      await assertion;
      deliver(stream);
      await vi.advanceTimersByTimeAsync(0);

      expect(stream.destroyed).toBe(true);
    });

    it('clears the timer on the normal path and on a download error', async () => {
      vi.useFakeTimers();
      const { downloadImage } = setup([JPEG]);
      await downloadImage('m1');
      expect(vi.getTimerCount()).toBe(0);

      const blobClient = { getMessageContent: vi.fn().mockRejectedValue(new Error('LINE down')) };
      await expect(createImageDownloader({ blobClient })('m1')).rejects.toThrow('LINE down');
      expect(vi.getTimerCount()).toBe(0);
    });

    it('uses a 15 second timeout by default', async () => {
      vi.useFakeTimers();
      const blobClient = { getMessageContent: vi.fn(() => new Promise(() => {})) };
      const pending = createImageDownloader({ blobClient })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(14999);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);

      await assertion;
    });
  });
});
