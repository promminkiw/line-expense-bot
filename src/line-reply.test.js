import { describe, it, expect, vi } from 'vitest';
import { createReplyText } from './line-reply.js';

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

  it('propagates LINE API errors', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue(new Error('Invalid reply token')) };
    const replyText = createReplyText(client);

    await expect(replyText('bad', 'hi')).rejects.toThrow('Invalid reply token');
  });
});
