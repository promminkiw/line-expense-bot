import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createSlipParser, SLIP_SCHEMA, MAX_SLIP_ITEMS } from './parse-slip.js';

// ต้องใช้ instance เดียวกับที่ parse-slip require ไม่งั้น instanceof ParseError ไม่ตรงกัน
const { ParseError, MAX_AMOUNT } = createRequire(import.meta.url)('../parser/parse-message.js');

const IMAGE = { data: 'QUJD', mediaType: 'image/jpeg' };
const NOW = new Date('2026-09-29T05:00:00Z');

function slipJson({ is_slip = true, date = '2026-09-28', slip_total = 0, extras_note = '', items, ...flat } = {}) {
  return {
    is_slip,
    date,
    slip_total,
    extras_note,
    items: items || [
      { type: 'expense', category: 'อาหาร', amount: 120, note: 'โอนให้ ร้านข้าวแกง', ...flat },
    ],
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
      items: [{ type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' }],
      dateAssumed: false,
      extrasNote: '',
      slipTotal: 0,
      truncatedTo: 0,
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

      expect(result).toMatchObject({ status: 'ok', items: [expect.objectContaining({ date: '2026-09-29' })], dateAssumed: true });
    }
  });

  it('subtracts 543 when Claude leaves a Buddhist era year in the date', async () => {
    const result = await setup(slipJson({ date: '2569-09-28' })).parseSlip(IMAGE);

    expect(result).toMatchObject({ status: 'ok', items: [expect.objectContaining({ date: '2026-09-28' })], dateAssumed: false });
  });

  it('leaves a year up to next year alone and falls back to today when the fixed date is not real', async () => {
    const nextYear = await setup(slipJson({ date: '2027-01-05' })).parseSlip(IMAGE);
    const badBuddhist = await setup(slipJson({ date: '2569-02-31' })).parseSlip(IMAGE);

    expect(nextYear).toMatchObject({ items: [expect.objectContaining({ date: '2027-01-05' })], dateAssumed: false });
    expect(badBuddhist).toMatchObject({ items: [expect.objectContaining({ date: '2026-09-29' })], dateAssumed: true });
  });

  it('keeps dates inside the window of last year to next year', async () => {
    for (const date of ['2025-12-31', '2027-01-05']) {
      const result = await setup(slipJson({ date })).parseSlip(IMAGE);

      expect(result).toMatchObject({ items: [expect.objectContaining({ date })], dateAssumed: false });
    }
  });

  it('uses today and says so when the year is outside the window after the Buddhist era fix', async () => {
    for (const date of ['2069-09-28', '1969-09-28', '2028-01-05', '2024-12-31']) {
      const result = await setup(slipJson({ date })).parseSlip(IMAGE);

      expect(result).toMatchObject({ status: 'ok', items: [expect.objectContaining({ date: '2026-09-29' })], dateAssumed: true });
    }
  });

  it('strips control characters and cuts the note by code point without a lone surrogate', async () => {
    const note = '\n\u0000' + 'ก'.repeat(98) + '😀';
    const result = await setup(slipJson({ note })).parseSlip(IMAGE);

    expect(result.items[0].note).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(Array.from(result.items[0].note).length).toBeLessThanOrEqual(100);
    expect(result.items[0].note.isWellFormed()).toBe(true);
    expect(result.items[0].note).toBe('ก'.repeat(98) + '😀');
  });

  it('drops a whole emoji that straddles the cut instead of leaving half of it', async () => {
    // ตัดตาม UTF-16 ที่ 100 จะเหลือครึ่ง emoji ส่วนตัดตาม code point เก็บ emoji ครบพอดี 100
    const result = await setup(slipJson({ note: 'ก'.repeat(99) + '😀' + 'ข' })).parseSlip(IMAGE);

    expect(result.items[0].note).toBe('ก'.repeat(99) + '😀');
    expect(result.items[0].note.isWellFormed()).toBe(true);
    const longer = await setup(slipJson({ note: 'ก'.repeat(100) + '😀' })).parseSlip(IMAGE);
    expect(longer.items[0].note).toBe('ก'.repeat(100));
  });

  it('replaces a lone surrogate sent by the model so the jsonb write cannot fail', async () => {
    const result = await setup(slipJson({ note: 'โอนให้ \ud83d ร้านค้า' })).parseSlip(IMAGE);

    expect(result.items[0].note.isWellFormed()).toBe(true);
    expect(result.items[0].note).toContain('ร้านค้า');
  });

  it('turns newlines inside the note into spaces so it stays on one line', async () => {
    const result = await setup(slipJson({ note: 'โอนให้ A\n- รายจ่าย | อาหาร' })).parseSlip(IMAGE);

    expect(result.items[0].note).toBe('โอนให้ A - รายจ่าย | อาหาร');
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

    expect(result.items[0]).toMatchObject({ type: 'income', category: 'อื่นๆ' });
  });

  it('keeps the note short', async () => {
    const result = await setup(slipJson({ note: 'ก'.repeat(300) })).parseSlip(IMAGE);

    expect(result.items[0].note).toHaveLength(100);
  });

  it('cuts extras_note to 100 code points', async () => {
    const result = await setup(slipJson({ extras_note: 'ก'.repeat(99) + '😀' + 'ข' })).parseSlip(IMAGE);

    expect(result.extrasNote).toBe('ก'.repeat(99) + '😀');
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

describe('createSlipParser with several items', () => {
  const MILK = { type: 'expense', category: 'อาหาร', amount: 35, note: 'นมสด' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, note: 'ยาสีฟัน' };

  it('returns one item per product line with the shared date and its own category', async () => {
    const result = await setup(slipJson({ items: [MILK, TOOTHPASTE] })).parseSlip(IMAGE);

    expect(result).toEqual({
      status: 'ok',
      items: [
        { type: 'expense', category: 'อาหาร', amount: 35, date: '2026-09-28', note: 'นมสด' },
        { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' },
      ],
      dateAssumed: false,
      extrasNote: '',
      slipTotal: 0,
      truncatedTo: 0,
    });
  });

  it('returns the extras note and the slip net total, sanitized', async () => {
    const result = await setup(
      slipJson({ items: [MILK, TOOTHPASTE], extras_note: 'ส่วนลด 10 บาท,\nVAT 7%', slip_total: 84 })
    ).parseSlip(IMAGE);

    expect(result.extrasNote).toBe('ส่วนลด 10 บาท, VAT 7%');
    expect(result.slipTotal).toBe(84);
  });

  it('treats an unreadable slip total as zero', async () => {
    for (const slip_total of [0, -5, null, 'x']) {
      const result = await setup(slipJson({ items: [MILK], slip_total })).parseSlip(IMAGE);

      expect(result.slipTotal).toBe(0);
    }
  });

  it('keeps the first items and reports the cut when there are too many', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS + 5 }, (_, index) => ({ ...MILK, note: `สินค้า ${index + 1}` }));
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.items).toHaveLength(MAX_SLIP_ITEMS);
    expect(result.items[0].note).toBe('สินค้า 1');
    expect(result.truncatedTo).toBe(MAX_SLIP_ITEMS);
  });

  it('does not report a cut for exactly the maximum', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS }, () => MILK);
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.truncatedTo).toBe(0);
  });

  it('is unreadable when there are no items', async () => {
    expect(await setup(slipJson({ items: [] })).parseSlip(IMAGE)).toEqual({ status: 'unreadable' });
  });

  it('is unreadable when any item has an invalid amount', async () => {
    for (const amount of [0, -10, 0.004, MAX_AMOUNT + 1, null]) {
      const result = await setup(slipJson({ items: [MILK, { ...TOOTHPASTE, amount }] })).parseSlip(IMAGE);

      expect(result).toEqual({ status: 'unreadable' });
    }
  });

  it('falls back to the other category per item and sanitizes each note', async () => {
    const result = await setup(
      slipJson({ items: [{ ...MILK, category: 'ไม่มีหมวดนี้', note: 'นม\u0000สด' }, TOOTHPASTE] })
    ).parseSlip(IMAGE);

    expect(result.items[0]).toMatchObject({ category: 'อื่นๆ', note: 'นม สด' });
  });

  it('throws ParseError when items is not an array or an item has an unknown type', async () => {
    await expect(setup({ ...slipJson(), items: 'x' }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
    await expect(
      setup(slipJson({ items: [MILK, { ...TOOTHPASTE, type: 'transfer' }] })).parseSlip(IMAGE)
    ).rejects.toBeInstanceOf(ParseError);
  });

  it('asks Claude for one item per product line and for extras and the net total separately', async () => {
    const { create, parseSlip } = setup(slipJson({ items: [MILK] }));

    await parseSlip(IMAGE);

    const system = create.mock.calls[0][0].system;
    expect(system).toContain('one item per product');
    expect(system).toContain('extras_note');
    expect(system).toContain('slip_total');
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(2048);
  });
});
