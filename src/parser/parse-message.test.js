import { describe, it, expect, vi } from 'vitest';
import {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  DEFAULT_CLARIFY_QUESTION,
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
    const parse = createMessageParser({ client, model: 'claude-haiku-4-5', now: NOW });

    await parse('กินข้าว 60');

    const params = client.messages.create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params.messages).toEqual([{ role: 'user', content: 'กินข้าว 60' }]);
    expect(params.system).toContain('2026-09-29');
    expect(params.system).toContain('อาหาร');
    expect(params.output_config).toEqual({
      format: { type: 'json_schema', schema: PARSE_SCHEMA },
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
