import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createSlipParser, SLIP_SCHEMA } from './parse-slip.js';

// ต้องใช้ instance เดียวกับที่ parse-slip require ไม่งั้น instanceof ParseError ไม่ตรงกัน
const { ParseError, MAX_AMOUNT } = createRequire(import.meta.url)('../parser/parse-message.js');

const IMAGE = { data: 'QUJD', mediaType: 'image/jpeg' };
const NOW = new Date('2026-09-29T05:00:00Z');
const EMOJI = String.fromCodePoint(0x1f600);
const SLIP_CATEGORY = 'ใบเสร็จ/สลิปโอนเงิน';

function slipJson(overrides = {}) {
  return {
    is_slip: true,
    rejection_kind: 'none',
    direction: 'paid',
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
  it('returns the paid total as one expense in the slip category', async () => {
    const { parseSlip } = setup(slipJson());

    expect(await parseSlip(IMAGE)).toEqual({
      status: 'ok',
      items: [{ type: 'expense', category: SLIP_CATEGORY, amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' }],
      dateAssumed: false,
    });
  });

  it('returns money the user received as income in the other category', async () => {
    const { parseSlip } = setup(slipJson({ direction: 'received', amount: 500, note: 'รับโอนจาก สมชาย' }));

    expect((await parseSlip(IMAGE)).items).toEqual([
      { type: 'income', category: 'อื่นๆ', amount: 500, date: '2026-09-28', note: 'รับโอนจาก สมชาย' },
    ]);
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

  it('sends the image returned by the preprocessor instead of the original', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(slipJson()) }],
    });
    const preprocessImage = vi.fn().mockResolvedValue({ data: 'WFla', mediaType: 'image/png' });
    const parseSlip = createSlipParser({ client: { messages: { create } }, model: 'test-model', now: () => NOW, preprocessImage });

    await parseSlip(IMAGE);

    expect(preprocessImage).toHaveBeenCalledWith(IMAGE);
    expect(create.mock.calls[0][0].messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'WFla' },
    });
  });

  it('asks for one amount: the final total paid, not the product lines, subtotal, cash or change', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    const { system } = create.mock.calls[0][0];
    expect(system).toContain('final total');
    expect(system).toContain('after discounts');
    expect(system).toContain('subtotal');
    expect(system).toContain('change');
    expect(system).toContain('Do not list the products');
    expect(system).not.toContain('one item per product');
  });

  it('keeps the loose slip definition and asks for the rejection kind', async () => {
    const { create, parseSlip } = setup(slipJson());

    await parseSlip(IMAGE);

    const { system } = create.mock.calls[0][0];
    expect(system).toContain('convenience');
    expect(system).toContain('tax invoice');
    expect(system).toContain('screenshot');
    expect(system).toContain('rejection_kind');
  });

  it('declares one amount with a direction instead of items and categories', () => {
    expect(SLIP_SCHEMA.required).toEqual(['is_slip', 'rejection_kind', 'direction', 'amount', 'date', 'note']);
    expect(SLIP_SCHEMA.properties.direction.enum).toEqual(['paid', 'received']);
    expect(SLIP_SCHEMA.properties).not.toHaveProperty('items');
    expect(SLIP_SCHEMA.properties.rejection_kind.enum).toEqual([
      'none',
      'not_a_financial_document',
      'unreadable_image',
      'partial_or_cropped',
      'other',
    ]);
    expect(SLIP_SCHEMA.additionalProperties).toBe(false);
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

  it('strips control characters and cuts the note to 100 code points without a lone surrogate', async () => {
    const note = '\n\u0000' + 'ก'.repeat(98) + EMOJI;
    const result = await setup(slipJson({ note })).parseSlip(IMAGE);

    // eslint-disable-next-line no-control-regex -- ตั้งใจตรวจว่าไม่เหลืออักขระควบคุม
    expect(result.items[0].note).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(result.items[0].note).toBe('ก'.repeat(98) + EMOJI);
    expect(result.items[0].note.isWellFormed()).toBe(true);
  });

  it('drops a whole emoji that straddles the cut instead of leaving half of it', async () => {
    const result = await setup(slipJson({ note: 'ก'.repeat(100) + EMOJI })).parseSlip(IMAGE);

    expect(result.items[0].note).toBe('ก'.repeat(100));
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

  it('accepts any direction on a rejected image', async () => {
    const result = await setup(slipJson({ is_slip: false, rejection_kind: 'unreadable_image', direction: 'x' })).parseSlip(IMAGE);

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

  it('is unreadable when the amount is missing, not positive, rounds to zero or is too large', async () => {
    for (const amount of [0, -5, 0.004, MAX_AMOUNT + 1, null, 'x']) {
      expect(await setup(slipJson({ amount })).parseSlip(IMAGE)).toEqual({
        status: 'unreadable',
        reason: 'invalid_amount',
        itemCount: 1,
        rejectedAmounts: [typeof amount === 'number' ? amount : null],
      });
    }
  });

  it('keeps an amount of exactly MAX_AMOUNT', async () => {
    const result = await setup(slipJson({ amount: MAX_AMOUNT })).parseSlip(IMAGE);

    expect(result.items[0].amount).toBe(MAX_AMOUNT);
  });

  it('throws ParseError when the response is refused', async () => {
    await expect(setup(slipJson(), { stop_reason: 'refusal' }).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
  });

  it('is unreadable as too_long, not an error, when the response is cut off', async () => {
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
    await expect(setup(slipJson({ direction: 'transfer' })).parseSlip(IMAGE)).rejects.toBeInstanceOf(ParseError);
  });
});
