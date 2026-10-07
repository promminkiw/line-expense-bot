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

function quietLogger() {
  return { info: vi.fn() };
}

function fetchFailed() {
  return Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } });
}

function httpError(status) {
  return Object.assign(new Error(`Request failed with status code: ${status}`), { name: 'HTTPFetchError', status });
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

  describe('retry', () => {
    it('retries once after a connection failure and returns the image', async () => {
      const blobClient = {
        getMessageContent: vi.fn().mockRejectedValueOnce(fetchFailed()).mockResolvedValueOnce(Readable.from([JPEG])),
      };
      const logger = quietLogger();

      const result = await createImageDownloader({ blobClient, retryDelayMs: 0, logger })('m1');

      expect(result).toEqual({ status: 'ok', mediaType: 'image/jpeg', data: JPEG.toString('base64') });
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
      expect(logger.info).toHaveBeenCalledWith('Retrying LINE image download', { reason: 'TypeError', status: null });
      expect(JSON.stringify(logger.info.mock.calls)).not.toContain('m1');
    });

    it('retries once when LINE answers 5xx', async () => {
      const blobClient = {
        getMessageContent: vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce(Readable.from([PNG])),
      };
      const logger = quietLogger();

      const result = await createImageDownloader({ blobClient, retryDelayMs: 0, logger })('m1');

      expect(result.status).toBe('ok');
      expect(logger.info).toHaveBeenCalledWith('Retrying LINE image download', { reason: 'HTTPFetchError', status: 503 });
    });

    it('does not retry when LINE answers 4xx', async () => {
      const blobClient = { getMessageContent: vi.fn().mockRejectedValue(httpError(404)) };

      await expect(createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).rejects.toThrow(
        'status code: 404'
      );
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
    });

    it('does not retry a plain error', async () => {
      const blobClient = { getMessageContent: vi.fn().mockRejectedValue(new Error('LINE down')) };

      await expect(createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).rejects.toThrow(
        'LINE down'
      );
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
    });

    it('does not retry a too large image', async () => {
      const blobClient = { getMessageContent: vi.fn().mockResolvedValue(Readable.from([Buffer.alloc(MAX_IMAGE_BYTES + 1)])) };

      expect(await createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).toEqual({
        status: 'too_large',
      });
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
    });

    it('rejects with the second error when the retry also fails', async () => {
      const blobClient = {
        getMessageContent: vi.fn().mockRejectedValueOnce(fetchFailed()).mockRejectedValueOnce(httpError(502)),
      };

      await expect(createImageDownloader({ blobClient, retryDelayMs: 0, logger: quietLogger() })('m1')).rejects.toThrow(
        'status code: 502'
      );
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('download timeout', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('retries once after a timeout and rejects when the retry also times out', async () => {
      vi.useFakeTimers();
      const blobClient = { getMessageContent: vi.fn(() => new Promise(() => {})) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1000);

      await assertion;
      expect(vi.getTimerCount()).toBe(0);
    });

    it('destroys both streams when each attempt stalls mid-way', async () => {
      vi.useFakeTimers();
      const first = new Readable({ read() {} });
      const second = new Readable({ read() {} });
      first.push(JPEG);
      second.push(JPEG);
      const blobClient = { getMessageContent: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second) };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(2500);

      await assertion;
      expect(first.destroyed).toBe(true);
      expect(second.destroyed).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    });

    it('destroys a stream that arrives after its attempt already timed out', async () => {
      vi.useFakeTimers();
      const late = new Readable({ read() {} });
      let deliver;
      const blobClient = {
        getMessageContent: vi
          .fn()
          .mockImplementationOnce(() => new Promise((resolve) => { deliver = resolve; }))
          .mockImplementationOnce(() => new Promise(() => {})),
      };
      const pending = createImageDownloader({ blobClient, timeoutMs: 1000, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(1000);
      deliver(late);
      await vi.advanceTimersByTimeAsync(0);
      expect(late.destroyed).toBe(true);
      await vi.advanceTimersByTimeAsync(1500);

      await assertion;
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

    it('uses a 15 second timeout per attempt and waits 500 ms before the retry by default', async () => {
      vi.useFakeTimers();
      const blobClient = { getMessageContent: vi.fn(() => new Promise(() => {})) };
      const pending = createImageDownloader({ blobClient, logger: quietLogger() })('m1');
      const assertion = expect(pending).rejects.toThrow('LINE image download timed out');

      await vi.advanceTimersByTimeAsync(14999);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(499);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(blobClient.getMessageContent).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(15000);

      await assertion;
    });
  });
});
