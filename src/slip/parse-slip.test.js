import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createSlipParser, SLIP_SCHEMA, MAX_SLIP_ITEMS } from './parse-slip.js';

// ต้องใช้ instance เดียวกับที่ parse-slip require ไม่งั้น instanceof ParseError ไม่ตรงกัน
const { ParseError, MAX_AMOUNT } = createRequire(import.meta.url)('../parser/parse-message.js');

const IMAGE = { data: 'QUJD', mediaType: 'image/jpeg' };
const NOW = new Date('2026-09-29T05:00:00Z');
const EMOJI = String.fromCodePoint(0x1f600);

function slipJson({ is_slip = true, rejection_kind = 'none', date = '2026-09-28', slip_total = 0, extras_note = '', items, ...flat } = {}) {
  return {
    is_slip,
    rejection_kind,
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
      skippedCount: 0,
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
    const note = '\n\u0000' + 'ก'.repeat(48) + EMOJI;
    const result = await setup(slipJson({ note })).parseSlip(IMAGE);

    expect(result.items[0].note).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(Array.from(result.items[0].note).length).toBeLessThanOrEqual(50);
    expect(result.items[0].note.isWellFormed()).toBe(true);
    expect(result.items[0].note).toBe('ก'.repeat(48) + EMOJI);
  });

  it('drops a whole emoji that straddles the cut instead of leaving half of it', async () => {
    // ตัดตาม UTF-16 ที่ 50 จะเหลือครึ่ง emoji ส่วนตัดตาม code point เก็บ emoji ครบพอดี 50
    const result = await setup(slipJson({ note: 'ก'.repeat(49) + EMOJI + 'ข' })).parseSlip(IMAGE);

    expect(result.items[0].note).toBe('ก'.repeat(49) + EMOJI);
    expect(result.items[0].note.isWellFormed()).toBe(true);
    const longer = await setup(slipJson({ note: 'ก'.repeat(50) + EMOJI })).parseSlip(IMAGE);
    expect(longer.items[0].note).toBe('ก'.repeat(50));
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
    const { parseSlip } = setup(slipJson({ is_slip: false, rejection_kind: 'not_a_financial_document' }));

    expect(await parseSlip(IMAGE)).toEqual({
      status: 'unreadable',
      reason: 'not_slip',
      itemCount: 0,
      rejectedAmounts: [],
      rejectionKind: 'not_a_financial_document',
    });
  });

  it('passes the rejection kind through when the image is rejected', async () => {
    const result = await setup(slipJson({ is_slip: false, rejection_kind: 'unreadable_image' })).parseSlip(IMAGE);

    expect(result.reason).toBe('not_slip');
    expect(result.rejectionKind).toBe('unreadable_image');
  });

  it('reports other when the rejection kind is unknown or missing', async () => {
    const unknown = await setup(slipJson({ is_slip: false, rejection_kind: 'weird' })).parseSlip(IMAGE);
    const none = await setup(slipJson({ is_slip: false, rejection_kind: 'none' })).parseSlip(IMAGE);
    const withoutKind = slipJson({ is_slip: false });
    delete withoutKind.rejection_kind;
    const missing = await setup(withoutKind).parseSlip(IMAGE);

    expect(unknown.rejectionKind).toBe('other');
    expect(none.rejectionKind).toBe('other');
    expect(missing.reason).toBe('not_slip');
    expect(missing.rejectionKind).toBe('other');
  });

  it('does not add a rejection kind to other unreadable reasons', async () => {
    const result = await setup(slipJson({ items: [] })).parseSlip(IMAGE);

    expect(result.rejectionKind).toBeUndefined();
  });

  it('declares rejection_kind as a required enum in the schema', () => {
    expect(SLIP_SCHEMA.required).toContain('rejection_kind');
    expect(SLIP_SCHEMA.properties.rejection_kind.enum).toEqual([
      'none',
      'not_a_financial_document',
      'unreadable_image',
      'partial_or_cropped',
      'other',
    ]);
  });

  it('uses a loose slip definition and asks for the rejection kind in the prompt', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    const system = create.mock.calls[0][0].system;
    expect(system).toContain('convenience');
    expect(system).toContain('tax invoice');
    expect(system).toContain('screenshot');
    expect(system).toContain('one item per product or service line');
    expect(system).toContain('extras_note');
    expect(system).toContain('slip_total');
    expect(system).toContain('rejection_kind');
  });

  it('is unreadable when the only item has a missing, not positive, zero-rounded or too large amount', async () => {
    for (const amount of [0, -5, 0.004, MAX_AMOUNT + 1, null]) {
      expect(await setup(slipJson({ amount })).parseSlip(IMAGE)).toEqual({
        status: 'unreadable',
        reason: 'no_valid_items',
        itemCount: 1,
        rejectedAmounts: [typeof amount === 'number' ? amount : null],
      });
    }
  });

  it('falls back to the other category when Claude returns one that does not match the type', async () => {
    const result = await setup(slipJson({ type: 'income', category: 'อาหาร' })).parseSlip(IMAGE);

    expect(result.items[0]).toMatchObject({ type: 'income', category: 'อื่นๆ' });
  });

  it('keeps the note short', async () => {
    const result = await setup(slipJson({ note: 'ก'.repeat(300) })).parseSlip(IMAGE);

    expect(result.items[0].note).toHaveLength(50);
  });

  it('cuts extras_note to 100 code points', async () => {
    const result = await setup(slipJson({ extras_note: 'ก'.repeat(99) + EMOJI + 'ข' })).parseSlip(IMAGE);

    expect(result.extrasNote).toBe('ก'.repeat(99) + EMOJI);
  });

  it('throws ParseError when the response is refused', async () => {
    await expect(setup(slipJson(), { stop_reason: 'refusal' }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
  });

  it('is unreadable as too_long, not an error, when a very long receipt cuts the response off', async () => {
    const result = await setup(slipJson(), { stop_reason: 'max_tokens' }).parseSlip(IMAGE);

    expect(result).toEqual({
      status: 'unreadable',
      reason: 'too_long',
      itemCount: 0,
      rejectedAmounts: [],
      rejectionKind: 'other',
    });
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
      skippedCount: 0,
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

  it('keeps a slip total of exactly MAX_AMOUNT and zeroes anything above it', async () => {
    const totals = [];
    for (const slip_total of [MAX_AMOUNT, MAX_AMOUNT + 1, 1e21]) {
      totals.push((await setup(slipJson({ items: [MILK], slip_total })).parseSlip(IMAGE)).slipTotal);
    }

    expect(totals).toEqual([MAX_AMOUNT, 0, 0]);
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

  it('asks Claude to return only the first 21 product lines when there are more than 20', async () => {
    const { create, parseSlip } = setup(slipJson({ items: [MILK] }));

    await parseSlip(IMAGE);

    expect(create.mock.calls[0][0].system).toContain('more than 20 product lines');
    expect(create.mock.calls[0][0].system).toContain('first 21 items');
  });

  it('tells Claude a plain transfer slip has no extras note and a zero slip total', async () => {
    const { create, parseSlip } = setup(slipJson({ items: [MILK] }));

    await parseSlip(IMAGE);

    const { system } = create.mock.calls[0][0];
    expect(system).toContain('set extras_note to an empty string and slip_total to 0');
    expect(system).not.toContain('payment method');
  });

  it('cuts each item note to 50 code points', async () => {
    const result = await setup(slipJson({ items: [{ ...MILK, note: 'ก'.repeat(80) }] })).parseSlip(IMAGE);

    expect(Array.from(result.items[0].note)).toHaveLength(50);
  });

  it('is unreadable when there are no items', async () => {
    expect(await setup(slipJson({ items: [] })).parseSlip(IMAGE)).toEqual({
      status: 'unreadable',
      reason: 'no_items',
      itemCount: 0,
      rejectedAmounts: [],
    });
  });

  it('skips only the invalid item and keeps the others in order', async () => {
    const result = await setup(slipJson({ items: [MILK, { ...TOOTHPASTE, amount: -5 }, { ...MILK, note: 'ขนม' }] })).parseSlip(IMAGE);

    expect(result.status).toBe('ok');
    expect(result.items.map((item) => item.note)).toEqual(['นมสด', 'ขนม']);
    expect(result.skippedCount).toBe(1);
  });

  it('skips each kind of invalid amount while keeping a valid sibling', async () => {
    for (const amount of [0, -10, 0.004, MAX_AMOUNT + 1, null]) {
      const result = await setup(slipJson({ items: [MILK, { ...TOOTHPASTE, amount }] })).parseSlip(IMAGE);

      expect(result).toMatchObject({ status: 'ok', skippedCount: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].note).toBe('นมสด');
    }
  });

  it('is unreadable with the reason and rejected amounts when no item is valid', async () => {
    const result = await setup(slipJson({ items: [{ ...MILK, amount: -5 }, { ...TOOTHPASTE, amount: 0 }] })).parseSlip(IMAGE);

    expect(result).toEqual({ status: 'unreadable', reason: 'no_valid_items', itemCount: 2, rejectedAmounts: [-5, 0] });
  });

  it('reports zero skipped items on a clean receipt', async () => {
    const result = await setup(slipJson({ items: [MILK, TOOTHPASTE] })).parseSlip(IMAGE);

    expect(result.skippedCount).toBe(0);
  });

  it('counts skipped items only among the first 20 and still reports the cut', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS + 3 }, (_, index) => ({
      ...MILK,
      amount: index === 1 || index >= MAX_SLIP_ITEMS ? -1 : 35,
    }));
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.skippedCount).toBe(1);
    expect(result.items).toHaveLength(MAX_SLIP_ITEMS - 1);
    expect(result.truncatedTo).toBe(MAX_SLIP_ITEMS);
  });

  it('shows non-numbers as null in the rejected amounts', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS }, (_, index) => ({ ...MILK, amount: index === 0 ? 'x' : -1 }));
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.rejectedAmounts).toHaveLength(MAX_SLIP_ITEMS);
    expect(result.rejectedAmounts[0]).toBeNull();
  });

  it('reports rejected amounts only for the first 20 items when all 25 are invalid', async () => {
    const items = Array.from({ length: MAX_SLIP_ITEMS + 5 }, () => ({ ...MILK, amount: -1 }));
    const result = await setup(slipJson({ items })).parseSlip(IMAGE);

    expect(result.reason).toBe('no_valid_items');
    expect(result.itemCount).toBe(MAX_SLIP_ITEMS + 5);
    expect(result.rejectedAmounts).toHaveLength(MAX_SLIP_ITEMS);
  });

  it('tells Claude to leave discounts, negative prices and free items out of the items', async () => {
    const { create, parseSlip } = setup(slipJson({ items: [MILK] }));

    await parseSlip(IMAGE);

    const { system } = create.mock.calls[0][0];
    expect(system).toContain('negative');
    expect(system).toContain('free items');
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
    expect(create.mock.calls[0][0].max_tokens).toBeGreaterThanOrEqual(4096);
  });
});
