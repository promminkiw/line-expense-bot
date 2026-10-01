import { describe, it, expect, vi } from 'vitest';
import { createReplyText, createReplyFlex } from './line-reply.js';

describe('createReplyText', () => {
  it('sends one text message with the reply token', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}) };
    const replyText = createReplyText(client);

    await replyText('token-1', 'hello');

    expect(client.replyMessage).toHaveBeenCalledWith({
      replyToken: 'token-1',
      messages: [{ type: 'text', text: 'hello' }],
    });
  });

  it('attaches quick reply items when given', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}) };
    const replyText = createReplyText(client);
    const items = [
      { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=e1' } },
    ];

    await replyText('token-1', 'saved', items);

    expect(client.replyMessage).toHaveBeenCalledWith({
      replyToken: 'token-1',
      messages: [{ type: 'text', text: 'saved', quickReply: { items } }],
    });
  });

  describe('length cap', () => {
    const sentText = (client) => client.replyMessage.mock.calls[0][0].messages[0].text;
    const makeClient = () => ({ replyMessage: vi.fn().mockResolvedValue({}) });

    it('sends a text of exactly 5000 units unchanged', async () => {
      const client = makeClient();
      const text = 'a'.repeat(5000);

      await createReplyText(client)('t', text);

      expect(sentText(client)).toBe(text);
    });

    it('cuts a text of 5001 units to at most 5000 and ends with three dots', async () => {
      const client = makeClient();

      await createReplyText(client)('t', 'a'.repeat(5001));

      expect(sentText(client).length).toBeLessThanOrEqual(5000);
      expect(sentText(client).endsWith('...')).toBe(true);
    });

    it('cuts astral characters on a code point boundary', async () => {
      const client = makeClient();

      await createReplyText(client)('t', String.fromCodePoint(0x1f600).repeat(3000));

      expect(sentText(client).length).toBeLessThanOrEqual(5000);
      expect(sentText(client).isWellFormed()).toBe(true);
      expect(sentText(client).endsWith('...')).toBe(true);
    });

    it('steps back when the cut would split a surrogate pair', async () => {
      const client = makeClient();

      await createReplyText(client)('t', 'a' + String.fromCodePoint(0x1f600).repeat(3000));

      const text = sentText(client);
      expect(text.isWellFormed()).toBe(true);
      expect(text.endsWith('...')).toBe(true);
      expect(text.length).toBe(4989 + 3);
    });

    it('keeps quick reply items on a cut text', async () => {
      const client = makeClient();
      const items = [{ type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'x' } }];

      await createReplyText(client)('t', 'a'.repeat(6000), items);

      expect(client.replyMessage.mock.calls[0][0].messages[0].quickReply).toEqual({ items });
    });
  });

  it('propagates LINE API errors', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue(new Error('Invalid reply token')) };
    const replyText = createReplyText(client);

    await expect(replyText('bad', 'hi')).rejects.toThrow('Invalid reply token');
  });
});

describe('createReplyFlex', () => {
  it('sends the flex message with the reply token', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}) };
    const flex = { type: 'flex', altText: 'สรุป', contents: { type: 'bubble' } };

    await createReplyFlex(client)('token-1', flex);

    expect(client.replyMessage).toHaveBeenCalledWith({ replyToken: 'token-1', messages: [flex] });
  });

  it('propagates LINE API errors', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue(new Error('Invalid reply token')) };

    await expect(createReplyFlex(client)('bad', {})).rejects.toThrow('Invalid reply token');
  });
});
