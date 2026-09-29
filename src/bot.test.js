import { describe, it, expect, vi } from 'vitest';
import { createBot, PARSE_FAILED_REPLY } from './bot.js';

function textEvent(text, replyToken = 'r1') {
  return { type: 'message', replyToken, message: { type: 'text', text } };
}

function setup({ parseMessage, replyText } = {}) {
  const deps = {
    replyText: replyText || vi.fn().mockResolvedValue(),
    parseMessage: parseMessage || vi.fn(),
    logger: { error: vi.fn() },
  };
  return { deps, bot: createBot(deps) };
}

describe('bot.handleEvent', () => {
  it('replies with formatted items when parse succeeds', async () => {
    const parseMessage = vi.fn().mockResolvedValue({
      status: 'ok',
      items: [{ type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' }],
    });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(parseMessage).toHaveBeenCalledWith('กินข้าว 60');
    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'แยกรายการได้ดังนี้ (ยังไม่บันทึก)\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว'
    );
  });

  it('replies with the clarification question', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'กี่บาท?' });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('ซื้อของ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'กี่บาท?');
  });

  it('replies with fallback message and logs when parse fails', async () => {
    const parseMessage = vi.fn().mockRejectedValue(new Error('overloaded'));
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', PARSE_FAILED_REPLY);
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to parse message', expect.any(Error));
  });

  it('uses the agreed wording for the fallback message', () => {
    expect(PARSE_FAILED_REPLY).toBe('ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง');
  });

  it('ignores sticker messages without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({ type: 'message', replyToken: 'r1', message: { type: 'sticker' } });

    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('ignores non-message events such as follow', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({ type: 'follow', replyToken: 'r1' });

    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot.handleEvents', () => {
  it('keeps processing other events when one reply fails and logs the failure', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'q' });
    const replyText = vi
      .fn()
      .mockRejectedValueOnce(new Error('reply failed'))
      .mockResolvedValueOnce();
    const { deps, bot } = setup({ parseMessage, replyText });

    await bot.handleEvents([textEvent('a', 'r1'), textEvent('b', 'r2')]);

    expect(replyText).toHaveBeenCalledWith('r2', 'q');
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to handle event', expect.any(Error));
  });
});
