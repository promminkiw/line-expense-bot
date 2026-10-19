import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { looksLikeQuestion, createQuestionParser, buildQuestionSchema, MAX_KEYWORD_LENGTH } = require('./parse-question.js');
const { ParseError } = require('../parser/parse-message.js');

// 2026-10-18 เวลาไทย (วันอาทิตย์)
const NOW = () => new Date('2026-10-18T05:00:00Z');
const NAMES = ['อาหาร', 'เดินทาง', 'อื่นๆ', 'เงินเดือน'];

function fakeClient(payload, { stopReason = 'end_turn', rawText } = {}) {
  const text = rawText !== undefined ? rawText : JSON.stringify(payload);
  return {
    messages: { create: vi.fn().mockResolvedValue({ stop_reason: stopReason, content: [{ type: 'text', text }] }) },
  };
}

function answer(overrides = {}) {
  return { is_question: true, type: 'expense', category: '', keyword: 'กาแฟ', from: '2026-10-01', to: '2026-10-18', ...overrides };
}

function parserFor(payload, options) {
  const client = fakeClient(payload, options);
  return { client, parseQuestion: createQuestionParser({ client, model: 'claude-haiku-5-5', now: NOW }) };
}

describe('looksLikeQuestion', () => {
  it.each(['เดือนนี้กินกาแฟไปเท่าไหร่', 'ค่าเดินทางเดือนที่แล้วเท่าไร', 'สัปดาห์นี้ใช้ไปกี่บาท', 'ใช้ไปเท่าไหร่แล้ว', 'รวมเท่าไหร่', '1-15 ต.ค. ใช้ไปเท่าไหร่'])(
    'lets %s through',
    (text) => {
      expect(looksLikeQuestion(text)).toBe(true);
    }
  );

  it.each(['กินข้าว 60', 'สรุปเดือนนี้', 'เงินเดือนเข้า 25000', ''])('stops %s', (text) => {
    expect(looksLikeQuestion(text)).toBe(false);
  });
});

describe('parseQuestion request', () => {
  it('sends the user text, today, the category list and the JSON schema', async () => {
    const { client, parseQuestion } = parserFor(answer());

    await parseQuestion('เดือนนี้กินกาแฟไปเท่าไหร่', NAMES);

    const params = client.messages.create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.messages).toEqual([{ role: 'user', content: 'เดือนนี้กินกาแฟไปเท่าไหร่' }]);
    expect(params.system).toContain('2026-10-18');
    expect(params.system).toContain('อาหาร, เดินทาง, อื่นๆ, เงินเดือน');
    expect(params.output_config).toEqual({ format: { type: 'json_schema', schema: buildQuestionSchema(NAMES) }, effort: 'low' });
    const options = client.messages.create.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('builds a schema whose category enum is the names plus an empty string', () => {
    const schema = buildQuestionSchema(['อื่นๆ', 'อาหาร', 'อื่นๆ']);

    expect(schema.properties.category.enum).toEqual(['อื่นๆ', 'อาหาร', '']);
    expect(schema.required).toEqual(['is_question', 'type', 'category', 'keyword', 'from', 'to']);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe('parseQuestion result', () => {
  it('returns the question criteria', async () => {
    const { parseQuestion } = parserFor(answer());

    expect(await parseQuestion('เดือนนี้กินกาแฟไปเท่าไหร่', NAMES)).toEqual({
      isQuestion: true,
      type: 'expense',
      category: '',
      keyword: 'กาแฟ',
      from: '2026-10-01',
      to: '2026-10-18',
      wallet: '',
    });
  });

  it('returns only isQuestion false when Claude says it is not a question', async () => {
    const { parseQuestion } = parserFor(answer({ is_question: false }));

    expect(await parseQuestion('ข้าวมันไก่ 50 แพงเท่าไหร่', NAMES)).toEqual({ isQuestion: false });
  });

  it('drops a category that is not in the list', async () => {
    const { parseQuestion } = parserFor(answer({ category: 'ค่าแมว' }));

    expect((await parseQuestion('ค่าแมวเท่าไหร่', NAMES)).category).toBe('');
  });

  it('trims the keyword and cuts it to the maximum length', async () => {
    const { parseQuestion } = parserFor(answer({ keyword: `  ${'ก'.repeat(80)}  ` }));

    expect((await parseQuestion('เท่าไหร่', NAMES)).keyword).toBe('ก'.repeat(MAX_KEYWORD_LENGTH));
  });

  it.each([
    ['an invalid date', { from: '2026-02-30', to: '2026-10-18' }],
    ['an empty date', { from: '', to: '' }],
    ['a reversed range', { from: '2026-10-18', to: '2026-10-01' }],
    ['a range over 366 days', { from: '2024-01-01', to: '2026-10-18' }],
  ])('uses this month so far for %s', async (_, range) => {
    const { parseQuestion } = parserFor(answer(range));

    const question = await parseQuestion('เท่าไหร่', NAMES);

    expect([question.from, question.to]).toEqual(['2026-10-01', '2026-10-18']);
  });

  it('keeps a full leap-year range of 366 days', async () => {
    const { parseQuestion } = parserFor(answer({ from: '2024-01-01', to: '2024-12-31' }));

    const question = await parseQuestion('ปี 2024 ใช้ไปเท่าไหร่', NAMES);

    expect([question.from, question.to]).toEqual(['2024-01-01', '2024-12-31']);
  });

  it('falls back to both for an unknown type', async () => {
    const { parseQuestion } = parserFor(answer({ type: 'transfer' }));

    expect((await parseQuestion('เท่าไหร่', NAMES)).type).toBe('both');
  });

  it.each([
    ['truncated', { stopReason: 'max_tokens' }],
    ['refused', { stopReason: 'refusal' }],
    ['not JSON', { rawText: 'not json' }],
    ['missing is_question', { rawText: JSON.stringify({ type: 'expense' }) }],
  ])('throws ParseError when the response is %s', async (_, options) => {
    const { parseQuestion } = parserFor(answer(), options);

    await expect(parseQuestion('เท่าไหร่', NAMES)).rejects.toBeInstanceOf(ParseError);
  });
});

describe('parseQuestion with wallets', () => {
  const WALLETS = ['เงินสด', 'บัตรเครดิต'];

  it('builds a schema with a wallet enum only when wallet names are given', () => {
    expect(buildQuestionSchema(NAMES).properties.wallet).toBeUndefined();

    const schema = buildQuestionSchema(NAMES, WALLETS);
    expect(schema.properties.wallet.enum).toEqual(['เงินสด', 'บัตรเครดิต', '']);
    expect(schema.required).toEqual(['is_question', 'type', 'category', 'keyword', 'from', 'to', 'wallet']);
  });

  it('sends the wallet names in the prompt and the schema', async () => {
    const { client, parseQuestion } = parserFor(answer({ wallet: 'บัตรเครดิต' }));

    await parseQuestion('เดือนนี้รูดบัตรไปเท่าไหร่', NAMES, WALLETS);

    const params = client.messages.create.mock.calls[0][0];
    expect(params.system).toContain('- Wallets: เงินสด, บัตรเครดิต');
    expect(params.output_config.format.schema).toEqual(buildQuestionSchema(NAMES, WALLETS));
  });

  it('does not mention wallets without wallet names', async () => {
    const { client, parseQuestion } = parserFor(answer());

    await parseQuestion('เดือนนี้กินกาแฟไปเท่าไหร่', NAMES);

    expect(client.messages.create.mock.calls[0][0].system).not.toContain('Wallets');
  });

  it('returns a wallet from the list and drops an unknown one', async () => {
    const known = parserFor(answer({ wallet: 'บัตรเครดิต' }));
    const unknown = parserFor(answer({ wallet: 'กสิกร' }));

    expect((await known.parseQuestion('เท่าไหร่', NAMES, WALLETS)).wallet).toBe('บัตรเครดิต');
    expect((await unknown.parseQuestion('เท่าไหร่', NAMES, WALLETS)).wallet).toBe('');
  });
});
