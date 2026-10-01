import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createSlipParser, SLIP_SCHEMA } from './parse-slip.js';

// ต้องใช้ instance เดียวกับที่ parse-slip require ไม่งั้น instanceof ParseError ไม่ตรงกัน
const { ParseError, MAX_AMOUNT } = createRequire(import.meta.url)('../parser/parse-message.js');

const IMAGE = { data: 'QUJD', mediaType: 'image/jpeg' };
const NOW = new Date('2026-09-29T05:00:00Z');

function slipJson(overrides = {}) {
  return {
    is_slip: true,
    type: 'expense',
    category: 'อาหาร',
    amount: 120,
    date: '2026-09-28',
    note: 'โอนให้ ร้านข้าวแกง',
    ...overrides,
  };
}

function setup(data, responseOverrides = {}) {
  const create = vi.fn().mockResolvedValue({
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }],
    ...responseOverrides,
  });
  const parseSlip = createSlipParser({ client: { messages: { create } }, model: 'test-model', now: () => NOW });
  return { create, parseSlip };
}

describe('createSlipParser', () => {
  it('returns the normalized item read from the slip', async () => {
    const { parseSlip } = setup(slipJson());

    expect(await parseSlip(IMAGE)).toEqual({
      status: 'ok',
      item: { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' },
      dateAssumed: false,
    });
  });

  it('sends the image as a base64 block with the model, schema and today in the prompt', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    const [request, options] = create.mock.calls[0];
    expect(request.model).toBe('test-model');
    expect(request.system).toContain('2026-09-29');
    expect(request.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
          { type: 'text', text: 'อ่านสลิปนี้' },
        ],
      },
    ]);
    expect(request.output_config).toEqual({ format: { type: 'json_schema', schema: SLIP_SCHEMA } });
    expect(options).toEqual(expect.objectContaining({ timeout: 20000, maxRetries: 1, signal: expect.anything() }));
  });

  it('tells Claude to convert Buddhist era years and to leave the date empty when not visible', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    expect(create.mock.calls[0][0].system).toContain('543');
    expect(create.mock.calls[0][0].system).toContain('empty string');
  });

  it('uses today and says so when the date is empty or not a real date', async () => {
    for (const date of ['', '2026-02-31', 'เมื่อวาน']) {
      const result = await setup(slipJson({ date })).parseSlip(IMAGE);

      expect(result).toMatchObject({ status: 'ok', item: { date: '2026-09-29' }, dateAssumed: true });
    }
  });

  it('subtracts 543 when Claude leaves a Buddhist era year in the date', async () => {
    const result = await setup(slipJson({ date: '2569-09-28' })).parseSlip(IMAGE);

    expect(result).toMatchObject({ status: 'ok', item: { date: '2026-09-28' }, dateAssumed: false });
  });

  it('leaves a year up to next year alone and falls back to today when the fixed date is not real', async () => {
    const nextYear = await setup(slipJson({ date: '2027-01-05' })).parseSlip(IMAGE);
    const badBuddhist = await setup(slipJson({ date: '2569-02-31' })).parseSlip(IMAGE);

    expect(nextYear).toMatchObject({ item: { date: '2027-01-05' }, dateAssumed: false });
    expect(badBuddhist).toMatchObject({ item: { date: '2026-09-29' }, dateAssumed: true });
  });

  it('is unreadable when the image is not a slip', async () => {
    const { parseSlip } = setup(slipJson({ is_slip: false, amount: 0 }));

    expect(await parseSlip(IMAGE)).toEqual({ status: 'unreadable' });
  });

  it('is unreadable when the amount is missing, not positive, rounds to zero or is too large', async () => {
    for (const amount of [0, -5, 0.004, MAX_AMOUNT + 1, null]) {
      expect(await setup(slipJson({ amount })).parseSlip(IMAGE)).toEqual({ status: 'unreadable' });
    }
  });

  it('falls back to the other category when Claude returns one that does not match the type', async () => {
    const result = await setup(slipJson({ type: 'income', category: 'อาหาร' })).parseSlip(IMAGE);

    expect(result.item).toMatchObject({ type: 'income', category: 'อื่นๆ' });
  });

  it('keeps the note short', async () => {
    const result = await setup(slipJson({ note: 'ก'.repeat(300) })).parseSlip(IMAGE);

    expect(result.item.note).toHaveLength(100);
  });

  it('throws ParseError when the response is cut off or refused', async () => {
    for (const stop_reason of ['max_tokens', 'refusal']) {
      await expect(setup(slipJson(), { stop_reason }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    }
  });

  it('throws ParseError for a response with no text, bad JSON or the wrong shape', async () => {
    await expect(setup(slipJson(), { content: [] }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(setup('not json').parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(setup({ is_slip: 'yes' }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(setup(slipJson({ type: 'transfer' })).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
  });
});
