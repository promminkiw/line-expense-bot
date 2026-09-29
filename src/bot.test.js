import { describe, it, expect, vi } from 'vitest';
import { createBot } from './bot.js';

function textEvent(text, replyToken = 'r1') {
  return { type: 'message', replyToken, message: { type: 'text', text } };
}

describe('bot.handleEvent', () => {
  it('echoes text messages back', async () => {
    const replyText = vi.fn().mockResolvedValue();
    const bot = createBot({ replyText });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(replyText).toHaveBeenCalledWith('r1', 'กินข้าว 60');
  });

  it('ignores sticker messages', async () => {
    const replyText = vi.fn();
    const bot = createBot({ replyText });

    await bot.handleEvent({ type: 'message', replyToken: 'r1', message: { type: 'sticker' } });

    expect(replyText).not.toHaveBeenCalled();
  });

  it('ignores non-message events such as follow', async () => {
    const replyText = vi.fn();
    const bot = createBot({ replyText });

    await bot.handleEvent({ type: 'follow', replyToken: 'r1' });

    expect(replyText).not.toHaveBeenCalled();
  });
});

describe('bot.handleEvents', () => {
  it('keeps processing other events when one fails and logs the failure', async () => {
    const replyText = vi
      .fn()
      .mockRejectedValueOnce(new Error('reply failed'))
      .mockResolvedValueOnce();
    const logger = { error: vi.fn() };
    const bot = createBot({ replyText, logger });

    await bot.handleEvents([textEvent('a', 'r1'), textEvent('b', 'r2')]);

    expect(replyText).toHaveBeenCalledWith('r2', 'b');
    expect(logger.error).toHaveBeenCalledWith('Failed to handle event', expect.any(Error));
  });
});
