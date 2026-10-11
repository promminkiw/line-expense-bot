import { describe, it, expect, vi } from 'vitest';
import { createReceiptReader } from './receipt.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function okSlip(amount) {
  return { status: 'ok', items: [{ type: 'expense', category: 'อาหาร', amount, date: '2026-10-11', note: 'ร้านชาบู' }], dateAssumed: false };
}

function setup(parseSlip = vi.fn().mockResolvedValue(okSlip(600))) {
  const logger = { info: vi.fn() };
  return { parseSlip, logger, readReceipt: createReceiptReader({ parseSlip, logger }) };
}

describe('readReceipt', () => {
  it('reads only the total of a receipt photo and passes the detected media type', async () => {
    const { readReceipt, parseSlip } = setup();

    expect(await readReceipt(JPEG)).toEqual({ status: 'ok', amount: 600 });
    expect(parseSlip).toHaveBeenCalledWith({ data: JPEG.toString('base64'), mediaType: 'image/jpeg' });
  });

  it('detects the media type from the bytes, not from what the browser said', async () => {
    const { readReceipt, parseSlip } = setup();

    await readReceipt(PNG);

    expect(parseSlip.mock.calls[0][0].mediaType).toBe('image/png');
  });

  it('refuses a file that is not a supported image without calling Claude', async () => {
    const { readReceipt, parseSlip } = setup();

    for (const body of [Buffer.from('not an image'), Buffer.alloc(0), {}, undefined]) {
      expect(await readReceipt(body)).toEqual({ status: 'unsupported' });
    }
    expect(parseSlip).not.toHaveBeenCalled();
  });

  it('reports a picture without a readable total and logs only the reason', async () => {
    const { readReceipt, logger } = setup(
      vi.fn().mockResolvedValue({ status: 'unreadable', reason: 'not_slip', itemCount: 0, rejectedAmounts: [], rejectionKind: 'unreadable_image' })
    );

    expect(await readReceipt(JPEG)).toEqual({ status: 'unreadable' });
    expect(logger.info).toHaveBeenCalledWith('Receipt unreadable', { reason: 'not_slip', rejectionKind: 'unreadable_image' });
  });

  it('runs at most two reads at once to protect server memory', async () => {
    let running = 0;
    let peak = 0;
    const releases = [];
    const parseSlip = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => releases.push(resolve));
      running -= 1;
      return okSlip(100);
    });
    const { readReceipt } = setup(parseSlip);

    const reads = [readReceipt(JPEG), readReceipt(JPEG), readReceipt(JPEG)];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(parseSlip).toHaveBeenCalledTimes(2);
    while (releases.length > 0 || parseSlip.mock.calls.length < 3) {
      releases.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await Promise.all(reads);
    expect(peak).toBe(2);
  });
});
