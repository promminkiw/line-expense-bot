import { describe, it, expect, vi } from 'vitest';
import {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
} from './bot.js';

const NOW_MS = Date.parse('2026-09-29T05:00:00Z');

const FOOD_ITEM ={ type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };

const UNDO_QUICK_REPLY = [
  {
    type: 'action',
    action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev1', displayText: 'ยกเลิก' },
  },
];

function textEvent(text, { replyToken = 'r1', eventId = 'ev1', source = { type: 'user', userId: 'U1' } } = {}) {
  return { type: 'message', webhookEventId: eventId, replyToken, source, message: { type: 'text', text } };
}

function postbackEvent(data) {
  return {
    type: 'postback',
    webhookEventId: 'ev2',
    replyToken: 'r2',
    source: { type: 'user', userId: 'U1' },
    postback: { data },
  };
}

function followEvent() {
  return { type: 'follow', webhookEventId: 'ev3', replyToken: 'r3', source: { type: 'user', userId: 'U1' } };
}

function setup(overrides = {}) {
  const deps = {
    replyText: vi.fn().mockResolvedValue(),
    parseMessage: vi.fn().mockResolvedValue({ status: 'ok', items: [FOOD_ITEM] }),
    repository: {
      claimEvent: vi.fn().mockResolvedValue(true),
      insertTransactions: vi.fn().mockResolvedValue(),
      deleteTransactionsByEvent: vi.fn().mockResolvedValue(2),
      getPendingClarification: vi.fn().mockResolvedValue(null),
      savePendingClarification: vi.fn().mockResolvedValue(),
      clearPendingClarification: vi.fn().mockResolvedValue(),
    },
    now: () => NOW_MS,
    users: {
      ensureUser: vi.fn().mockResolvedValue('user-1'),
      loadCategoryIds: vi.fn().mockResolvedValue(
        new Map([
          ['expense:อาหาร', 'cat-food'],
          ['expense:อื่นๆ', 'cat-other'],
        ])
      ),
    },
    allowRequest: vi.fn().mockReturnValue(true),
    logger: { error: vi.fn() },
    ...overrides,
  };
  return { deps, bot: createBot(deps) };
}

describe('bot text message', () => {
  it('saves parsed items and replies with saved summary and undo button', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev1', 'user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', []);
    expect(deps.repository.insertTransactions).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 60,
        note: 'กินข้าว',
        occurred_on: '2026-09-29',
        source: 'text',
        line_event_id: 'ev1',
      },
    ]);
    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
      UNDO_QUICK_REPLY
    );
  });

  it('replies with the clarification question without saving', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'กี่บาท?' });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('ซื้อของ'));

    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', 'กี่บาท?', undefined);
  });

  it('remembers the message and the question while waiting for an answer', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'ซื้อรถกี่บาท' });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('ซื้อรถ'));

    expect(deps.repository.savePendingClarification).toHaveBeenCalledWith('user-1', [
      { role: 'user', text: 'ซื้อรถ' },
      { role: 'assistant', text: 'ซื้อรถกี่บาท' },
    ]);
  });

  it('sends the pending conversation with the answer, then forgets it after saving', async () => {
    const history = [
      { role: 'user', text: 'ซื้อรถ' },
      { role: 'assistant', text: 'ซื้อรถกี่บาท' },
    ];
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: history,
      updatedAt: new Date(NOW_MS - 60 * 1000).toISOString(),
    });

    await bot.handleEvent(textEvent('500000'));

    expect(deps.repository.getPendingClarification).toHaveBeenCalledWith('user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('500000', history);
    expect(deps.repository.clearPendingClarification).toHaveBeenCalledWith('user-1');
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  it('ignores a pending conversation older than 10 minutes', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ซื้อรถ' },
        { role: 'assistant', text: 'ซื้อรถกี่บาท' },
      ],
      updatedAt: new Date(NOW_MS - 10 * 60 * 1000 - 1).toISOString(),
    });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', []);
  });

  it('keeps only the last 6 turns while the user keeps being asked', async () => {
    const history = [1, 2, 3].flatMap((n) => [
      { role: 'user', text: `u${n}` },
      { role: 'assistant', text: `a${n}` },
    ]);
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'a4' });
    const { deps, bot } = setup({ parseMessage });
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: history,
      updatedAt: new Date(NOW_MS).toISOString(),
    });

    await bot.handleEvent(textEvent('u4'));

    expect(deps.repository.savePendingClarification).toHaveBeenCalledWith('user-1', [
      { role: 'user', text: 'u2' },
      { role: 'assistant', text: 'a2' },
      { role: 'user', text: 'u3' },
      { role: 'assistant', text: 'a3' },
      { role: 'user', text: 'u4' },
      { role: 'assistant', text: 'a4' },
    ]);
  });

  it('ignores a redelivered event that was already claimed', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('replies rate limited message without calling Claude', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.allowRequest).toHaveBeenCalledWith('U1');
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
  });

  it('replies system error and logs user id when parse fails', async () => {
    const parseMessage = vi.fn().mockRejectedValue(new Error('overloaded'));
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'message' },
      expect.any(Error)
    );
  });

  it('replies system error when saving fails', async () => {
    const { deps, bot } = setup();
    deps.repository.insertTransactions.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
  });

  it('ignores messages from a group', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60', { source: { type: 'group', groupId: 'G1', userId: 'U1' } }));

    expect(deps.users.ensureUser).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('ignores sticker messages without touching the database', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({
      type: 'message',
      webhookEventId: 'ev1',
      replyToken: 'r1',
      source: { type: 'user', userId: 'U1' },
      message: { type: 'sticker' },
    });

    expect(deps.users.ensureUser).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('uses the agreed wording for the system error message', () => {
    expect(SYSTEM_ERROR_REPLY).toBe('ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง');
  });
});

describe('bot follow event', () => {
  it('registers the user without replying', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(followEvent());

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('logs but does not reply when registration fails', async () => {
    const users = { ensureUser: vi.fn().mockRejectedValue(new Error('db down')), loadCategoryIds: vi.fn() };
    const { deps, bot } = setup({ users });

    await bot.handleEvent(followEvent());

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'follow' },
      expect.any(Error)
    );
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot undo postback', () => {
  it('deletes the entries of that event for this user and confirms', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_DONE_REPLY, undefined);
  });

  it('resolves the owner from the event sender, not from postback data', async () => {
    const ensureUser = vi.fn(async (id) => (id === 'U1' ? 'user-1' : 'user-other'));
    const { deps, bot } = setup({ users: { ensureUser, loadCategoryIds: vi.fn() } });

    await bot.handleEvent(postbackEvent('action=undo&event=ev1&user=U2'));

    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(ensureUser).not.toHaveBeenCalledWith('U2');
  });

  it('tells the user when nothing was deleted', async () => {
    const { deps, bot } = setup();
    deps.repository.deleteTransactionsByEvent.mockResolvedValue(0);

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));

    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_NOT_FOUND_REPLY, undefined);
  });

  it('ignores postback data it does not know', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=other'));

    expect(deps.repository.deleteTransactionsByEvent).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot.handleEvents', () => {
  it('keeps processing other events when one reply fails and logs the failure', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'q' });
    const replyText = vi.fn((replyToken) =>
      replyToken === 'r1' ? Promise.reject(new Error('reply failed')) : Promise.resolve()
    );
    const { deps, bot } = setup({ parseMessage, replyText });

    await bot.handleEvents([
      textEvent('a', { replyToken: 'r1', eventId: 'e1' }),
      textEvent('b', { replyToken: 'r2', eventId: 'e2' }),
    ]);

    expect(replyText).toHaveBeenCalledWith('r2', 'q', undefined);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to send reply',
      { lineUserId: 'U1', eventType: 'message' },
      expect.any(Error)
    );
  });
});
