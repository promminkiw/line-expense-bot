import { describe, it, expect, vi } from 'vitest';
import {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  buildParseSchema,
  DEFAULT_CLARIFY_QUESTION,
  AMOUNT_TOO_LARGE_QUESTION,
  MAX_AMOUNT,
  INTENTS,
} from './parse-message.js';

const NOW = () => new Date('2026-09-29T05:00:00Z');

function fakeClient(payload, { stopReason = 'end_turn', rawText } = {}) {
  const text = rawText !== undefined ? rawText : JSON.stringify(payload);
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: stopReason,
        content: [{ type: 'text', text }],
      }),
    },
  };
}

function item(overrides = {}) {
  return {
    type: 'expense',
    category: 'อาหาร',
    amount: 60,
    date: '2026-09-29',
    note: 'กินข้าว',
    ...overrides,
  };
}

function okPayload(items) {
  return { needs_clarification: false, question: '', items };
}

describe('parseMessage request', () => {
  it('sends model, user text, today in system prompt and JSON schema output format', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'claude-haiku-5-5', now: NOW });

    await parse('กินข้าว 60');

    const params = client.messages.create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.messages).toEqual([{ role: 'user', content: 'กินข้าว 60' }]);
    expect(params.system).toContain('2026-09-29');
    expect(params.system).toContain('อาหาร');
    // Haiku 5.5 คิดเป็นค่าเริ่มต้นและการคิดนับรวมใน max_tokens จึงตั้ง effort ต่ำและเผื่อเพดานไว้
    expect(params.output_config).toEqual({
      format: { type: 'json_schema', schema: PARSE_SCHEMA },
      effort: 'low',
    });
    expect(params.max_tokens).toBe(2048);
    expect(params).not.toHaveProperty('thinking');
  });

  it('still works with Haiku 4.5 set in CLAUDE_MODEL by leaving effort out', async () => {
    const client = fakeClient(okPayload([item()]));
    await createMessageParser({ client, model: 'claude-haiku-4-5', now: NOW })('กินข้าว 60');

    expect(client.messages.create.mock.calls[0][0].output_config).toEqual({
      format: { type: 'json_schema', schema: PARSE_SCHEMA },
    });
  });

  // หมวดสลิปใช้เฉพาะตอนอ่านรูป ข้อความที่พิมพ์ต้องเลือกหมวดตามของที่ซื้อ
  it('does not offer the slip category for typed messages', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'claude-haiku-5-5', now: NOW });

    await parse('กินข้าว 60');

    const params = client.messages.create.mock.calls[0][0];
    expect(params.system).not.toContain('ใบเสร็จ/สลิปโอนเงิน');
    expect(PARSE_SCHEMA.properties.items.items.properties.category.enum).not.toContain('ใบเสร็จ/สลิปโอนเงิน');
  });

  it('sends earlier clarification turns before the new message', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('500000', [
      { role: 'user', text: 'ซื้อรถ' },
      { role: 'assistant', text: 'ซื้อรถกี่บาท' },
    ]);

    expect(client.messages.create.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'ซื้อรถ' },
      { role: 'assistant', content: 'ซื้อรถกี่บาท' },
      { role: 'user', content: '500000' },
    ]);
  });

  it('tells Claude to take entries only from the latest message', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กาแฟ 45');

    const { system } = client.messages.create.mock.calls[0][0];
    expect(system).toContain('Earlier turns are context only');
  });

  it('tells Claude never to ask about the date in a clarification question', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('ซื้อของ');

    const { system } = client.messages.create.mock.calls[0][0];
    expect(system).toContain('Never ask about the date');
  });

  it('asks Claude to write the clarification question as เฮีย', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('ซื้อของ');

    const { system } = client.messages.create.mock.calls[0][0];
    expect(system).toContain('"เฮีย"');
  });

  it('passes request timeout and retry limit so fallback reply fits the reply token window', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กินข้าว 60');

    expect(client.messages.create.mock.calls[0][1]).toEqual({
      timeout: 20000,
      maxRetries: 1,
      signal: expect.any(AbortSignal),
    });
  });
});

describe('parseMessage result', () => {
  it('returns every item when text has multiple entries', async () => {
    const items = [item(), item({ amount: 45, note: 'กาแฟ' })];
    const parse = createMessageParser({ client: fakeClient(okPayload(items)), model: 'm', now: NOW });

    const result = await parse('กินข้าว 60 กาแฟ 45');

    expect(result).toEqual({ status: 'ok', items });
  });

  it('returns clarify with Claude question when message is ambiguous', async () => {
    const payload = { needs_clarification: true, question: 'ซื้ออะไร กี่บาท?', items: [] };
    const parse = createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW });

    expect(await parse('ซื้อของ')).toEqual({ status: 'clarify', question: 'ซื้ออะไร กี่บาท?' });
  });

  it('uses default question when clarification question is empty', async () => {
    const payload = { needs_clarification: true, question: '', items: [] };
    const parse = createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW });

    expect(await parse('อืม')).toEqual({ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION });
  });

  it('asks to clarify when Claude returns no items', async () => {
    const parse = createMessageParser({ client: fakeClient(okPayload([])), model: 'm', now: NOW });

    expect(await parse('สวัสดี')).toEqual({ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION });
  });

  it('asks to clarify when any amount is not positive', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item(), item({ amount: 0 })])),
      model: 'm',
      now: NOW,
    });

    expect(await parse('กินข้าว 60 กาแฟ')).toEqual({
      status: 'clarify',
      question: DEFAULT_CLARIFY_QUESTION,
    });
  });

  it('tells the user the limit when any amount is above the maximum', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item(), item({ amount: MAX_AMOUNT + 1 })])),
      model: 'm',
      now: NOW,
    });

    expect(await parse('กินข้าว 60 ซื้อบ้าน 10000001')).toEqual({
      status: 'clarify',
      question: AMOUNT_TOO_LARGE_QUESTION,
    });
  });

  it('uses the agreed wording for the amount limit message', () => {
    expect(AMOUNT_TOO_LARGE_QUESTION).toBe(
      'จำนวนเงินเกินเพดานที่เฮียจดได้ (ไม่เกิน 10,000,000 บาทต่อรายการ)'
    );
  });

  it('asks to clarify when an amount rounds to zero satang', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ amount: 0.004 })])),
      model: 'm',
      now: NOW,
    });

    expect(await parse('ลูกอม 0.004')).toEqual({
      status: 'clarify',
      question: DEFAULT_CLARIFY_QUESTION,
    });
  });

  it('accepts the smallest storable amount', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ amount: 0.01 })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('ลูกอม 0.01');

    expect(result.status).toBe('ok');
  });

  it('accepts amount equal to the maximum', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ amount: MAX_AMOUNT })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('ซื้อบ้าน 10000000');

    expect(result.status).toBe('ok');
    expect(MAX_AMOUNT).toBe(10000000);
  });

  it('replaces category that does not match the item type with fallback', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ type: 'income', category: 'อาหาร' })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('ได้เงิน 500');

    expect(result.items[0].category).toBe('อื่นๆ');
  });

  it('replaces malformed date with today in Bangkok', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ date: 'yesterday' })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('กินข้าว 60');

    expect(result.items[0].date).toBe('2026-09-29');
  });

  it('replaces impossible calendar date with today in Bangkok', async () => {
    for (const badDate of ['2026-02-29', '2026-13-01']) {
      const parse = createMessageParser({
        client: fakeClient(okPayload([item({ date: badDate })])),
        model: 'm',
        now: NOW,
      });

      const result = await parse('กินข้าว 60');

      expect(result.items[0].date).toBe('2026-09-29');
    }
  });
});

describe('parseMessage errors', () => {
  it('throws ParseError when stop_reason is refusal', async () => {
    const parse = createMessageParser({
      client: fakeClient({ needs_clarification: false }, { stopReason: 'refusal' }),
      model: 'm',
      now: NOW,
    });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('throws ParseError when JSON does not match schema shape', async () => {
    for (const payload of [null, [], { needs_clarification: false }, { needs_clarification: false, items: [null] }]) {
      const parse = createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW });

      await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
    }
  });

  it('throws ParseError when item type is unknown', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ type: 'transfer' })])),
      model: 'm',
      now: NOW,
    });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('throws ParseError when response has no text block', async () => {
    const client = {
      messages: { create: vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [] }) },
    };
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('throws ParseError when Claude text is not JSON', async () => {
    const parse = createMessageParser({
      client: fakeClient(null, { rawText: 'not json' }),
      model: 'm',
      now: NOW,
    });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('throws ParseError when output was cut by max_tokens', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item()]), { stopReason: 'max_tokens' }),
      model: 'm',
      now: NOW,
    });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('propagates API errors from the client', async () => {
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error('overloaded')) } };
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await expect(parse('x')).rejects.toThrow('overloaded');
  });
});

describe('parseMessage with the user categories', () => {
  const USER_CATEGORIES = { expense: ['ค่าแมว', 'อาหาร', 'อื่นๆ'], income: ['โบนัส', 'อื่นๆ'] };

  it('offers only the user categories in the prompt and the schema', async () => {
    const client = fakeClient(okPayload([item({ category: 'ค่าแมว' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('อาหารแมว 300', [], USER_CATEGORIES);

    const params = client.messages.create.mock.calls[0][0];
    expect(params.system).toContain('- Expense categories: ค่าแมว, อาหาร, อื่นๆ');
    expect(params.system).toContain('- Income categories: โบนัส, อื่นๆ');
    expect(params.output_config.format.schema).toEqual(buildParseSchema(USER_CATEGORIES));
    expect(params.output_config.format.schema.properties.items.items.properties.category.enum).toEqual([
      'ค่าแมว',
      'อาหาร',
      'อื่นๆ',
      'โบนัส',
    ]);
  });

  it('keeps a user category that Claude picked', async () => {
    const client = fakeClient(okPayload([item({ category: 'ค่าแมว', note: 'อาหารแมว', amount: 300 })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('อาหารแมว 300', [], USER_CATEGORIES);

    expect(result).toEqual({
      status: 'ok',
      items: [{ type: 'expense', category: 'ค่าแมว', amount: 300, date: '2026-09-29', note: 'อาหารแมว' }],
    });
  });

  it('falls back to อื่นๆ for a category outside the user list', async () => {
    const client = fakeClient(okPayload([item({ category: 'เดินทาง' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('BTS 40', [], USER_CATEGORIES);

    expect(result.items[0].category).toBe('อื่นๆ');
  });

  it('uses the default schema object when no categories are given', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กินข้าว 60');

    expect(client.messages.create.mock.calls[0][0].output_config.format.schema).toBe(PARSE_SCHEMA);
  });
});

describe('parseMessage with wallets', () => {
  const CATEGORIES = { expense: ['อาหาร', 'อื่นๆ'], income: ['อื่นๆ'] };
  const WALLETS = ['เงินสด', 'บัตรเครดิต'];

  it('offers the wallets in the prompt and the schema', async () => {
    const client = fakeClient(okPayload([item({ wallet: 'บัตรเครดิต' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กาแฟ 60 รูดบัตร', [], CATEGORIES, WALLETS);

    const params = client.messages.create.mock.calls[0][0];
    const itemSchema = params.output_config.format.schema.properties.items.items;
    expect(params.system).toContain('- Wallets: เงินสด, บัตรเครดิต');
    expect(params.output_config.format.schema).toEqual(buildParseSchema(CATEGORIES, WALLETS));
    expect(itemSchema.properties.wallet.enum).toEqual(['เงินสด', 'บัตรเครดิต', '']);
    expect(itemSchema.required).toEqual(['type', 'category', 'amount', 'amount_expression', 'date', 'note', 'wallet']);
  });

  // ลองกับ Claude จริง "กาแฟ 60 รูดบัตรเครดิต" ได้หมวด อื่นๆ บางครั้งเมื่อมีกระเป๋าในข้อความ
  it('tells Claude to pick the category from what was bought, not from the wallet words', async () => {
    const client = fakeClient(okPayload([item({ wallet: 'บัตรเครดิต' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กาแฟ 60 รูดบัตรเครดิต', [], CATEGORIES, WALLETS);

    expect(client.messages.create.mock.calls[0][0].system).toContain(
      '- Wallet words never change the category. Pick the category from what was bought or received, e.g. "กาแฟ 60 รูดบัตรเครดิต" is อาหาร.'
    );
  });

  it('leaves the wallet category rule out for a user with one wallet', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กาแฟ 60', [], CATEGORIES, []);

    expect(client.messages.create.mock.calls[0][0].system).not.toContain('Wallet words');
  });

  it('keeps a wallet Claude picked from the list', async () => {
    const client = fakeClient(okPayload([item({ wallet: 'บัตรเครดิต' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('กินข้าว 60 บัตรเครดิต', [], CATEGORIES, WALLETS);

    expect(result.items[0].wallet).toBe('บัตรเครดิต');
  });

  it('uses an empty wallet for a name outside the list or a missing one', async () => {
    const client = fakeClient(okPayload([item({ wallet: 'กสิกร' }), item({ amount: 45 })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('กินข้าว 60 กาแฟ 45', [], CATEGORIES, WALLETS);

    expect(result.items.map((entry) => entry.wallet)).toEqual(['', '']);
  });

  // ผู้ใช้กระเป๋าเดียวต้องได้ request เดิมทุกตัวอักษร ค่า prompt จะได้ไม่เพิ่ม
  it('leaves the request and the items unchanged without wallets', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('กินข้าว 60', [], undefined, []);

    const params = client.messages.create.mock.calls[0][0];
    expect(params.output_config.format.schema).toBe(PARSE_SCHEMA);
    expect(params.system).not.toContain('Wallets');
    expect(result).toEqual({ status: 'ok', items: [item()] });
  });
});

describe('parseMessage intents', () => {
  function intentPayload(fields) {
    return {
      needs_clarification: false,
      question: '',
      items: [],
      summary_period: '',
      goal_name: '',
      saving_amount: 0,
      unsupported_kind: '',
      ...fields,
    };
  }

  async function parseWith(payload, text = 'ข้อความ') {
    return createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW })(text);
  }

  it('offers every intent in the schema and requires the intent fields', () => {
    expect(PARSE_SCHEMA.properties.intent.enum).toEqual(INTENTS);
    expect(INTENTS).toEqual(['record', 'question', 'summary', 'help', 'saving', 'greeting', 'unsupported']);
    expect(PARSE_SCHEMA.required).toEqual([
      'needs_clarification',
      'question',
      'items',
      'intent',
      'summary_period',
      'goal_name',
      'saving_amount',
      'unsupported_kind',
    ]);
    expect(PARSE_SCHEMA.properties.items.items.required).toContain('amount_expression');
  });

  it('describes the intents in the system prompt', async () => {
    const client = fakeClient(okPayload([item()]));
    await createMessageParser({ client, model: 'm', now: NOW })('สรุปหน่อย');

    const { system } = client.messages.create.mock.calls[0][0];
    expect(system).toContain('intent');
    expect(system).toContain('สรุปหน่อย');
    expect(system).toContain('เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500');
    expect(system).toContain('amount_expression');
    expect(system).toContain('กินข้าว 40+10+20');
    expect(system).toContain('"ออมสิน 1000" or paying at ออมสิน is "record", not "saving"');
    expect(system).toContain('"ออมสิน 1000" is a complete expense entry and needs no clarification');
    expect(system).not.toContain('Never add amounts together.');
    expect(system).toContain('When the saving amount is written as arithmetic');
    expect(system).toContain('When intent is "record" and no entry needs clarification');
    expect(system).not.toContain('- Otherwise set needs_clarification to false');
  });

  it.each(['question', 'help', 'greeting'])('returns the %s intent', async (intent) => {
    expect(await parseWith(intentPayload({ intent }))).toEqual({ status: 'intent', intent });
  });

  it.each([
    ['today', 'today'],
    ['week', 'week'],
    ['month', 'month'],
    ['other', 'other'],
    ['', 'menu'],
    ['year', 'menu'],
  ])('maps summary period %j to %j', async (summaryPeriod, period) => {
    expect(await parseWith(intentPayload({ intent: 'summary', summary_period: summaryPeriod }))).toEqual({
      status: 'intent',
      intent: 'summary',
      period,
    });
  });

  it('returns the goal name and amount for a saving', async () => {
    const payload = intentPayload({ intent: 'saving', goal_name: ' เที่ยวญี่ปุ่น ', saving_amount: 500 });
    expect(await parseWith(payload)).toEqual({ status: 'intent', intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });
  });

  it.each([0, -5, MAX_AMOUNT + 1, 10.555, Number.NaN])('returns a null saving amount for %s', async (amount) => {
    const payload = intentPayload({ intent: 'saving', goal_name: 'เที่ยวญี่ปุ่น', saving_amount: amount });
    expect((await parseWith(payload)).amount).toBeNull();
  });

  it.each([
    ['delete', 'delete'],
    ['edit', 'edit'],
    ['budget', 'budget'],
    ['web', 'web'],
    ['other', 'other'],
    ['', 'other'],
  ])('maps unsupported kind %j to %j', async (unsupportedKind, kind) => {
    expect(await parseWith(intentPayload({ intent: 'unsupported', unsupported_kind: unsupportedKind }))).toEqual({
      status: 'intent',
      intent: 'unsupported',
      kind,
    });
  });

  // mock เดิมและคำตอบที่ไม่มี intent ต้องบันทึกรายการเหมือนเดิม
  it.each([undefined, 'record', 'dance'])('records entries when intent is %j', async (intent) => {
    const result = await parseWith({ ...okPayload([item()]), intent });
    expect(result.status).toBe('ok');
  });
});

describe('parseMessage amount expressions', () => {
  async function parseItems(items) {
    return createMessageParser({ client: fakeClient(okPayload(items)), model: 'm', now: NOW })('ข้อความ');
  }

  it('computes the amount from the expression instead of trusting Claude', async () => {
    const result = await parseItems([item({ amount: 250, amount_expression: 'sqrt(25)*10' })]);
    expect(result).toEqual({ status: 'ok', items: [{ ...item(), amount: 50 }] });
  });

  it('computes quantity times unit price', async () => {
    const result = await parseItems([item({ note: 'ชานม', amount: 0, amount_expression: '2*35' })]);
    expect(result.items[0].amount).toBe(70);
  });

  it('keeps the amount when the expression is empty', async () => {
    const result = await parseItems([item({ amount: 60, amount_expression: '' })]);
    expect(result.items[0].amount).toBe(60);
  });

  it('asks back when the expression cannot be computed', async () => {
    const result = await parseItems([item({ amount: 0, amount_expression: '5/0' })]);
    expect(result).toEqual({ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION });
  });

  it('applies the amount limit to a computed amount', async () => {
    const result = await parseItems([item({ amount: 0, amount_expression: '5000000*3' })]);
    expect(result).toEqual({ status: 'clarify', question: AMOUNT_TOO_LARGE_QUESTION });
  });

  it('does not put amount_expression on saved items', async () => {
    const result = await parseItems([item({ amount_expression: '30*2' })]);
    expect(result.items[0]).not.toHaveProperty('amount_expression');
  });
});
