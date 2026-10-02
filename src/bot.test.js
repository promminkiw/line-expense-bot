import { describe, it, expect, vi } from 'vitest';
import {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_TTL_MS,
} from './bot.js';
import { HELP_REPLY, WEB_COMING_SOON_REPLY } from './menu/fixed-replies.js';

const NOW_MS = Date.parse('2026-09-29T05:00:00Z');

const FOOD_ITEM = { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };

const SLIP_ID = '7b1c9d5e-3f2a-4c8b-9a6d-1e2f3a4b5c6d';
const SLIP_ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };
const SLIP_EXTRA_ITEM = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };

function slipResult(overrides = {}) {
  return { status: 'ok', items: [SLIP_ITEM], dateAssumed: false, extrasNote: '', slipTotal: 0, truncatedTo: 0, ...overrides };
}

const SLIP_QUICK_REPLY = [
  {
    type: 'action',
    action: { type: 'postback', label: 'บันทึก', data: `action=slip_save&slip=${SLIP_ID}`, displayText: 'บันทึก' },
  },
  {
    type: 'action',
    action: { type: 'postback', label: 'ยกเลิก', data: `action=slip_cancel&slip=${SLIP_ID}`, displayText: 'ยกเลิก' },
  },
];

const UNDO_QUICK_REPLY = [
  {
    type: 'action',
    action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev1', displayText: 'ยกเลิก' },
  },
];

const SUMMARY_QUICK_REPLY = [
  { type: 'action', action: { type: 'message', label: 'วันนี้', text: 'สรุปวันนี้' } },
  { type: 'action', action: { type: 'message', label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' } },
  { type: 'action', action: { type: 'message', label: 'เดือนนี้', text: 'สรุปเดือนนี้' } },
];

function textEvent(text, { replyToken = 'r1', eventId = 'ev1', source = { type: 'user', userId: 'U1' } } = {}) {
  return { type: 'message', webhookEventId: eventId, replyToken, source, message: { type: 'text', text } };
}

function postbackEvent(data, userId = 'U1') {
  return {
    type: 'postback',
    webhookEventId: 'ev2',
    replyToken: 'r2',
    source: { type: 'user', userId },
    postback: { data },
  };
}

function followEvent() {
  return { type: 'follow', webhookEventId: 'ev3', replyToken: 'r3', source: { type: 'user', userId: 'U1' } };
}

function imageEvent({ eventId = 'ev-img', replyToken = 'r-img', messageId = 'm1', source = { type: 'user', userId: 'U1' } } = {}) {
  return { type: 'message', webhookEventId: eventId, replyToken, source, message: { type: 'image', id: messageId } };
}

function replyFlexOf(deps, index = 0) {
  const [replyToken, flex] = deps.replyFlex.mock.calls[index];
  expect(flex.quickReply).toBeUndefined();
  const buttons = flex.contents.footer.contents.map((button) => ({ type: 'action', action: button.action }));
  return { replyToken, text: flex.altText, quickReply: buttons };
}

function setup(overrides = {}) {
  const deps = {
    replyText: vi.fn().mockResolvedValue(),
    replyFlex: vi.fn().mockResolvedValue(),
    parseMessage: vi.fn().mockResolvedValue({ status: 'ok', items: [FOOD_ITEM] }),
    commentSummary: vi.fn().mockResolvedValue('วันนี้ใช้กับอาหารเป็นหลัก'),
    downloadImage: vi.fn().mockResolvedValue({ status: 'ok', mediaType: 'image/jpeg', data: 'QUJD' }),
    parseSlip: vi.fn().mockResolvedValue(slipResult()),
    repository: {
      claimEvent: vi.fn().mockResolvedValue(true),
      insertTransactions: vi.fn().mockResolvedValue(),
      deleteTransactionsByEvent: vi.fn().mockResolvedValue(2),
      getPendingClarification: vi.fn().mockResolvedValue(null),
      savePendingClarification: vi.fn().mockResolvedValue(),
      clearPendingClarification: vi.fn().mockResolvedValue(),
      summarizeTransactions: vi
        .fn()
        .mockResolvedValue([{ type: 'expense', category: 'อาหาร', total: 105, entryCount: 2 }]),
      getBudgetStatus: vi.fn().mockResolvedValue([]),
      savePendingSlip: vi.fn().mockResolvedValue(SLIP_ID),
      deleteExpiredPendingSlips: vi.fn().mockResolvedValue(),
      claimPendingSlip: vi.fn().mockResolvedValue({ webhookEventId: 'ev-img', items: [SLIP_ITEM] }),
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
    logger: { error: vi.fn(), info: vi.fn() },
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
    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r1',
      text: 'บันทึกแล้ว\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
      quickReply: UNDO_QUICK_REPLY,
    });
    expect(deps.replyText).not.toHaveBeenCalled();
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

  it('keeps the pending conversation when saving the entries fails', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ซื้อรถ' },
        { role: 'assistant', text: 'ซื้อรถกี่บาท' },
      ],
      updatedAt: new Date(NOW_MS).toISOString(),
    });
    deps.repository.insertTransactions.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('500000'));

    expect(deps.repository.clearPendingClarification).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
  });

  it('still replies saved and logs when forgetting the pending conversation fails', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ซื้อรถ' },
        { role: 'assistant', text: 'ซื้อรถกี่บาท' },
      ],
      updatedAt: new Date(NOW_MS).toISOString(),
    });
    deps.repository.clearPendingClarification.mockRejectedValue(new Error('timeout'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.repository.insertTransactions).toHaveBeenCalled();
    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r1',
      text: expect.stringContaining('บันทึกแล้ว'),
      quickReply: UNDO_QUICK_REPLY,
    });
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to clear pending clarification',
      { userId: 'user-1' },
      expect.any(Error)
    );
  });

  it('still asks the question and logs when remembering the conversation fails', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'ซื้อรถกี่บาท' });
    const { deps, bot } = setup({ parseMessage });
    deps.repository.savePendingClarification.mockRejectedValue(new Error('timeout'));

    await bot.handleEvent(textEvent('ซื้อรถ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'ซื้อรถกี่บาท', undefined);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to save pending clarification',
      { userId: 'user-1' },
      expect.any(Error)
    );
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

describe('bot menu fixed replies', () => {
  it('replies the help text without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ช่วยเหลือ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', HELP_REPLY, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('replies the LIFF link for the web button when configured', async () => {
    const { deps, bot } = setup({ liffUrl: 'https://liff.line.me/liff-1' });

    await bot.handleEvent(textEvent('เปิดเว็บ'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'เปิดหน้าเว็บดูและแก้ไขรายการ: https://liff.line.me/liff-1',
      undefined
    );
  });

  it('replies the coming soon text for the web button', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('เปิดเว็บ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', WEB_COMING_SOON_REPLY, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it('answers even when the user is rate limited because it costs no Claude call', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('ช่วยเหลือ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', HELP_REPLY, undefined);
    expect(deps.allowRequest).not.toHaveBeenCalled();
  });

  it('does not read or change the pending clarification', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ช่วยเหลือ'));

    expect(deps.repository.getPendingClarification).not.toHaveBeenCalled();
    expect(deps.repository.savePendingClarification).not.toHaveBeenCalled();
    expect(deps.repository.clearPendingClarification).not.toHaveBeenCalled();
  });

  it('ignores a redelivered menu event', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(textEvent('ช่วยเหลือ'));

    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot summary command', () => {
  it('shows the period buttons for a plain summary request without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SUMMARY_MENU_REPLY, SUMMARY_QUICK_REPLY);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.summarizeTransactions).not.toHaveBeenCalled();
  });

  it('replies a summary card for today using SQL totals and the Claude comment', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-29', '2026-09-29');
    expect(deps.commentSummary).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'วันนี้ (29/09)', expenseTotal: 105, entryCount: 2 })
    );
    const [replyToken, flex] = deps.replyFlex.mock.calls[0];
    expect(replyToken).toBe('r1');
    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe('สรุปวันนี้ (29/09): รายรับ 0 บาท รายจ่าย 105 บาท');
    expect(JSON.stringify(flex)).toContain('วันนี้ใช้กับอาหารเป็นหลัก');
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('uses Monday to today for this week even with spaces in the command', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป สัปดาห์นี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-28', '2026-09-29');
  });

  it('uses the first of the month to today for this month', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปเดือนนี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-29');
  });

  it('skips Claude and says there are no entries when the period is empty', async () => {
    const { deps, bot } = setup();
    deps.repository.summarizeTransactions.mockResolvedValue([]);

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.commentSummary).not.toHaveBeenCalled();
    expect(JSON.stringify(deps.replyFlex.mock.calls[0][1])).toContain(NO_ENTRIES_COMMENT);
  });

  it('still replies the card without a comment when Claude fails', async () => {
    const { deps, bot } = setup({ commentSummary: vi.fn().mockRejectedValue(new Error('overloaded')) });

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.replyFlex).toHaveBeenCalled();
    const flex = deps.replyFlex.mock.calls[0][1];
    expect(JSON.stringify(flex)).not.toContain('overloaded');
    expect(flex.altText).toBe('สรุปวันนี้ (29/09): รายรับ 0 บาท รายจ่าย 105 บาท');
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to comment summary',
      { userId: 'user-1' },
      expect.any(Error)
    );
  });

  it('replies system error when the summary query fails', async () => {
    const { deps, bot } = setup();
    deps.repository.summarizeTransactions.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });

  it('does not read or change the pending clarification', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.getPendingClarification).not.toHaveBeenCalled();
    expect(deps.repository.savePendingClarification).not.toHaveBeenCalled();
    expect(deps.repository.clearPendingClarification).not.toHaveBeenCalled();
  });

  it('still applies the rate limit before summarizing', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.summarizeTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
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

describe('bot budget alerts', () => {
  const SAVED = 'บันทึกแล้ว\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว';

  it('adds the alert under the saved reply when the entry crosses 80 percent', async () => {
    const { deps, bot } = setup();
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'cat-food', category: 'อาหาร', budget: 5000, spent: 4030 },
    ]);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.repository.getBudgetStatus).toHaveBeenCalledWith('user-1', '2026-09');
    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r1',
      text: `${SAVED}\n\nใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 4,030 จาก 5,000 บาท (80%)`,
      quickReply: UNDO_QUICK_REPLY,
    });
  });

  it('alerts again on the next save while still above 80 percent', async () => {
    const { deps, bot } = setup();
    deps.repository.getBudgetStatus
      .mockResolvedValueOnce([{ categoryId: 'cat-food', category: 'อาหาร', budget: 5000, spent: 4030 }])
      .mockResolvedValueOnce([{ categoryId: 'cat-food', category: 'อาหาร', budget: 5000, spent: 4090 }]);

    await bot.handleEvent(textEvent('กินข้าว 60', { replyToken: 'r1', eventId: 'ev1' }));
    await bot.handleEvent(textEvent('กินข้าว 60', { replyToken: 'r2', eventId: 'ev2' }));

    expect(replyFlexOf(deps, 0)).toEqual({
      replyToken: 'r1',
      text: `${SAVED}\n\nใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 4,030 จาก 5,000 บาท (80%)`,
      quickReply: UNDO_QUICK_REPLY,
    });
    expect(replyFlexOf(deps, 1)).toEqual({
      replyToken: 'r2',
      text: `${SAVED}\n\nใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 4,090 จาก 5,000 บาท (81%)`,
      quickReply: expect.anything(),
    });
  });

  it('checks the budget after saving so the new entry is counted', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.repository.insertTransactions.mock.invocationCallOrder[0]).toBeLessThan(
      deps.repository.getBudgetStatus.mock.invocationCallOrder[0]
    );
    expect(replyFlexOf(deps)).toEqual({ replyToken: 'r1', text: SAVED, quickReply: UNDO_QUICK_REPLY });
  });

  it('keeps the saved reply and adds the failure line and logs when the budget check fails', async () => {
    const { deps, bot } = setup();
    const error = new Error('db down');
    deps.repository.getBudgetStatus.mockRejectedValue(error);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r1',
      text: `${SAVED}\n\nเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ`,
      quickReply: UNDO_QUICK_REPLY,
    });
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to check budgets', { userId: 'user-1' }, error);
  });

  it('reports the budget check failure once when one of two months fails', async () => {
    const parseMessage = vi.fn().mockResolvedValue({
      status: 'ok',
      items: [
        { ...FOOD_ITEM, date: '2026-08-31' },
        { ...FOOD_ITEM, date: '2026-09-01' },
      ],
    });
    const { deps, bot } = setup({ parseMessage });
    const error = new Error('db down');
    deps.repository.getBudgetStatus.mockImplementation(async (userId, month) => {
      if (month === '2026-08') {
        throw error;
      }
      return [];
    });

    await bot.handleEvent(textEvent('กินข้าว 60 สองวัน'));

    const { text } = replyFlexOf(deps);
    expect(text.split('เช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ')).toHaveLength(2);
    expect(text.startsWith('บันทึกแล้ว')).toBe(true);
    expect(text.endsWith('\n\nเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ')).toBe(true);
    expect(deps.logger.error).toHaveBeenCalledTimes(1);
  });

  it('does not check budgets for income', async () => {
    const parseMessage = vi.fn().mockResolvedValue({
      status: 'ok',
      items: [{ type: 'income', category: 'อื่นๆ', amount: 500, date: '2026-09-29', note: '' }],
    });
    const { deps, bot } = setup({
      parseMessage,
      users: {
        ensureUser: vi.fn().mockResolvedValue('user-1'),
        loadCategoryIds: vi.fn().mockResolvedValue(new Map([['income:อื่นๆ', 'cat-income-other']])),
      },
    });

    await bot.handleEvent(textEvent('ได้เงิน 500'));

    expect(deps.repository.getBudgetStatus).not.toHaveBeenCalled();
    expect(replyFlexOf(deps).text).not.toContain('เช็กงบไม่สำเร็จ');
  });
});

describe('bot slip image', () => {
  const SLIP_CONFIRM_TEXT =
    'อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)';

  it('reads the slip, keeps the item pending and asks for confirmation without saving', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev-img', 'user-1');
    expect(deps.downloadImage).toHaveBeenCalledWith('m1');
    expect(deps.parseSlip).toHaveBeenCalledWith({ data: 'QUJD', mediaType: 'image/jpeg' });
    expect(deps.repository.savePendingSlip).toHaveBeenCalledWith('user-1', 'ev-img', [SLIP_ITEM]);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(replyFlexOf(deps)).toEqual({ replyToken: 'r-img', text: SLIP_CONFIRM_TEXT, quickReply: SLIP_QUICK_REPLY });
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('says so when the date was not readable', async () => {
    const parseSlip = vi.fn().mockResolvedValue(slipResult({ dateAssumed: true }));
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(replyFlexOf(deps).text).toContain('อ่านวันที่ไม่ได้ จึงใช้วันนี้');
  });

  it('clears this user expired pending slips before keeping a new one', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.repository.deleteExpiredPendingSlips).toHaveBeenCalledWith(
      'user-1',
      new Date(NOW_MS - 10 * 60 * 1000).toISOString()
    );
  });

  it('still asks for confirmation when clearing expired slips fails', async () => {
    const { deps, bot } = setup();
    const error = new Error('boom');
    deps.repository.deleteExpiredPendingSlips.mockRejectedValue(error);

    await bot.handleEvent(imageEvent());

    expect(deps.logger.error).toHaveBeenCalledWith('Failed to delete expired pending slips', { userId: 'user-1' }, error);
    expect(replyFlexOf(deps)).toEqual({ replyToken: 'r-img', text: SLIP_CONFIRM_TEXT, quickReply: SLIP_QUICK_REPLY });
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('asks the user to resend when the amount cannot be read', async () => {
    const parseSlip = vi.fn().mockResolvedValue({ status: 'unreadable' });
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.repository.savePendingSlip).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SLIP_UNREADABLE_REPLY, undefined);
  });

  it('logs only the reason, item count and rejected amounts when the slip is unreadable', async () => {
    const parseSlip = vi.fn().mockResolvedValue({
      status: 'unreadable',
      reason: 'no_valid_items',
      itemCount: 2,
      rejectedAmounts: [-5, 0],
      note: 'secret',
    });
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.logger.info).toHaveBeenCalledWith('Slip unreadable', {
      userId: 'user-1',
      reason: 'no_valid_items',
      itemCount: 2,
      rejectedAmounts: [-5, 0],
      rejectionKind: undefined,
    });
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SLIP_UNREADABLE_REPLY, undefined);
  });

  it('logs the rejection kind when Claude says the image is not a slip', async () => {
    const parseSlip = vi.fn().mockResolvedValue({
      status: 'unreadable',
      reason: 'not_slip',
      itemCount: 0,
      rejectedAmounts: [],
      rejectionKind: 'partial_or_cropped',
    });
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.logger.info).toHaveBeenCalledWith('Slip unreadable', {
      userId: 'user-1',
      reason: 'not_slip',
      itemCount: 0,
      rejectedAmounts: [],
      rejectionKind: 'partial_or_cropped',
    });
  });

  it('shows how many items were skipped on the confirm card without changing the saved reply', async () => {
    const parseSlip = vi.fn().mockResolvedValue(slipResult({ skippedCount: 1 }));
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(replyFlexOf(deps).text).toContain('ข้าม 1 รายการที่อ่านราคาไม่ได้');
    await bot.handleEvent(postbackEvent(`action=slip_save&slip=${SLIP_ID}`));
    expect(replyFlexOf(deps, 1).text).toBe(
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง'
    );
  });

  it('tells the user the image limit is 3.5 MB', () => {
    expect(SLIP_TOO_LARGE_REPLY).toBe('รูปใหญ่เกินไป (ไม่เกิน 3.5 MB) ลองส่งใหม่หรือย่อรูปก่อน');
  });

  it('exports the pending slip lifetime as 10 minutes', () => {
    expect(SLIP_TTL_MS).toBe(10 * 60 * 1000);
  });

  it('explains when the image is too large or not a supported image, without calling Claude', async () => {
    for (const [status, reply] of [
      ['too_large', SLIP_TOO_LARGE_REPLY],
      ['unsupported', SLIP_UNSUPPORTED_REPLY],
    ]) {
      const downloadImage = vi.fn().mockResolvedValue({ status });
      const { deps, bot } = setup({ downloadImage });

      await bot.handleEvent(imageEvent());

      expect(deps.parseSlip).not.toHaveBeenCalled();
      expect(deps.replyText).toHaveBeenCalledWith('r-img', reply, undefined);
    }
  });

  it('does nothing for a redelivered image event', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(imageEvent());

    expect(deps.downloadImage).not.toHaveBeenCalled();
    expect(deps.allowRequest).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('counts the image against the rate limit and stops before downloading', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(imageEvent());

    expect(deps.allowRequest).toHaveBeenCalledWith('U1');
    expect(deps.downloadImage).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', RATE_LIMITED_REPLY, undefined);
  });

  it('answers with the system error and logs when the download or Claude fails', async () => {
    const error = new Error('LINE down');
    const { deps, bot } = setup({ downloadImage: vi.fn().mockRejectedValue(error) });

    await bot.handleEvent(imageEvent());

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'message' },
      error
    );
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SYSTEM_ERROR_REPLY, undefined);
    expect(JSON.stringify(deps.logger.error.mock.calls)).not.toContain('QUJD');
  });

  it('answers the system error when Claude fails to read the slip, without saving a pending slip', async () => {
    const { deps, bot } = setup({ parseSlip: vi.fn().mockRejectedValue(new Error('claude down')) });

    await bot.handleEvent(imageEvent());

    expect(deps.repository.savePendingSlip).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SYSTEM_ERROR_REPLY, undefined);
  });

  it('answers the system error when the pending slip cannot be stored, without confirm text', async () => {
    const { deps, bot } = setup();
    deps.repository.savePendingSlip.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(imageEvent());

    expect(deps.replyText).toHaveBeenCalledTimes(1);
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SYSTEM_ERROR_REPLY, undefined);
  });

  it('treats an unknown download status as unsupported without calling Claude', async () => {
    const { deps, bot } = setup({ downloadImage: vi.fn().mockResolvedValue({ status: 'weird' }) });

    await bot.handleEvent(imageEvent());

    expect(deps.parseSlip).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r-img', SLIP_UNSUPPORTED_REPLY, undefined);
  });

  it('reads at most 3 slips at once when many images arrive together', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const downloadImage = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return { status: 'ok', mediaType: 'image/jpeg', data: 'QUJD' };
    });
    const { deps, bot } = setup({ downloadImage });
    const events = Array.from({ length: 10 }, (_, i) =>
      imageEvent({ eventId: `ev-${i}`, replyToken: `r-${i}`, messageId: `m${i}` })
    );

    await bot.handleEvents(events);

    expect(maxInFlight).toBeGreaterThan(0);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(deps.replyFlex).toHaveBeenCalledTimes(10);
  });

  it('ignores an image sent in a group', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent({ source: { type: 'group', groupId: 'G1', userId: 'U1' } }));

    expect(deps.downloadImage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot slip confirmation', () => {
  const SINCE = new Date(NOW_MS - 10 * 60 * 1000).toISOString();
  const SAVE = `action=slip_save&slip=${SLIP_ID}`;
  const CANCEL = `action=slip_cancel&slip=${SLIP_ID}`;

  it('claims the pending slip, saves it as a slip transaction and offers undo', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.claimPendingSlip).toHaveBeenCalledWith('user-1', SLIP_ID, SINCE);
    expect(deps.repository.insertTransactions).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 120,
        note: 'โอนให้ ร้านข้าวแกง',
        occurred_on: '2026-09-28',
        source: 'slip',
        line_event_id: 'ev-img',
      },
    ]);
    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r2',
      text: 'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง',
      quickReply: [
        {
          type: 'action',
          action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev-img', displayText: 'ยกเลิก' },
        },
      ],
    });
  });

  it('appends the budget alert after saving a slip', async () => {
    const { deps, bot } = setup();
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'cat-food', category: 'อาหาร', budget: 150, spent: 135 },
    ]);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.getBudgetStatus).toHaveBeenCalledWith('user-1', '2026-09');
    expect(replyFlexOf(deps).text).toBe(
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n\nใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)'
    );
  });

  it('does not save twice: a second tap finds nothing to claim', async () => {
    const { deps, bot } = setup();
    deps.repository.claimPendingSlip.mockResolvedValue(null);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_EXPIRED_REPLY, undefined);
  });

  it('claims the postback event first and stays silent on a redelivery of the same save or cancel', async () => {
    for (const data of [SAVE, CANCEL]) {
      const { deps, bot } = setup();
      deps.repository.claimEvent.mockResolvedValue(false);

      await bot.handleEvent(postbackEvent(data));

      expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev2', 'user-1');
      expect(deps.repository.claimPendingSlip).not.toHaveBeenCalled();
      expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
      expect(deps.replyText).not.toHaveBeenCalled();
    }
  });

  it('ignores a slip id that is not a UUID without touching the database', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=slip_save&slip=not-a-uuid'));
    await bot.handleEvent(postbackEvent('action=slip_save'));

    expect(deps.repository.claimPendingSlip).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('answers the system error when saving fails after the claim', async () => {
    const { deps, bot } = setup();
    const error = new Error('insert failed');
    deps.repository.insertTransactions.mockRejectedValue(error);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'postback' },
      error
    );
    expect(deps.replyText).toHaveBeenCalledWith('r2', SYSTEM_ERROR_REPLY, undefined);
  });

  it('cancels by discarding the pending slip without saving', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(CANCEL));

    expect(deps.repository.claimPendingSlip).toHaveBeenCalledWith('user-1', SLIP_ID, SINCE);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_CANCELLED_REPLY, undefined);
  });

  it('tells the user when the slip to cancel is already gone', async () => {
    const { deps, bot } = setup();
    deps.repository.claimPendingSlip.mockResolvedValue(null);

    await bot.handleEvent(postbackEvent(CANCEL));

    expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_EXPIRED_REPLY, undefined);
  });

  it("slip save and cancel claim with the pressing user's id, never the slip owner's", async () => {
    for (const data of [SAVE, CANCEL]) {
      const { deps, bot } = setup();
      deps.users.ensureUser.mockImplementation((id) => ({ U1: 'user-1', U2: 'user-2' })[id]);
      deps.repository.claimPendingSlip.mockImplementation(async (userId) =>
        userId === 'user-2' ? null : { webhookEventId: 'ev-img', items: [SLIP_ITEM] }
      );

      await bot.handleEvent(postbackEvent(data, 'U2'));

      expect(deps.repository.claimPendingSlip).toHaveBeenCalledWith('user-2', SLIP_ID, SINCE);
      expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
      expect(deps.replyText).toHaveBeenCalledWith('r2', SLIP_EXPIRED_REPLY, undefined);
    }
  });

  it('keeps the pending slip and answers the system error when loading categories fails', async () => {
    const { deps, bot } = setup();
    const error = new Error('categories failed');
    deps.users.loadCategoryIds.mockRejectedValue(error);

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.claimPendingSlip).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'postback' },
      error
    );
    expect(deps.replyText).toHaveBeenCalledWith('r2', SYSTEM_ERROR_REPLY, undefined);
  });

  it('does not save and answers the system error when the category cannot be resolved', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(new Map());

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'postback' },
      expect.any(Error)
    );
    expect(deps.replyText).toHaveBeenCalledWith('r2', SYSTEM_ERROR_REPLY, undefined);
  });

  it('still confirms the saved slip with a budget failure notice when the budget check fails', async () => {
    const { deps, bot } = setup();
    deps.repository.getBudgetStatus.mockRejectedValue(new Error('budget failed'));

    await bot.handleEvent(postbackEvent(SAVE));

    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r2',
      text: 'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n\nเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ',
      quickReply: [
        {
          type: 'action',
          action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev-img', displayText: 'ยกเลิก' },
        },
      ],
    });
  });

  it('ignores an undo postback without an event id', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo'));

    expect(deps.repository.deleteTransactionsByEvent).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('keeps the undo postback working', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev-img'));

    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev-img');
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_DONE_REPLY, undefined);
  });
});

describe('bot slip with several items', () => {
  const SAVE = `action=slip_save&slip=${SLIP_ID}`;
  const CATEGORY_IDS = new Map([
    ['expense:อาหาร', 'cat-food'],
    ['expense:สุขภาพ', 'cat-health'],
    ['expense:อื่นๆ', 'cat-other'],
  ]);

  it('keeps every item pending and shows them one by one with the extras note', async () => {
    const parseSlip = vi.fn().mockResolvedValue(
      slipResult({
        items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
        extrasNote: 'ส่วนลด 10 บาท',
        slipTotal: 169,
      })
    );
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(deps.repository.savePendingSlip).toHaveBeenCalledWith('user-1', 'ev-img', [SLIP_ITEM, SLIP_EXTRA_ITEM]);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(replyFlexOf(deps).text).toBe(
      'อ่านสลิปได้ 2 รายการ\n' +
        '- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n' +
        '- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน\n' +
        'หมายเหตุ: ส่วนลด 10 บาท (ไม่ได้บันทึก)\n' +
        'ยอดสุทธิบนสลิป 169 บาท\n' +
        'กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)'
    );
  });

  it('saves all items as separate rows in one insert tied to the image event, then offers undo', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(CATEGORY_IDS);
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
    });

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.insertTransactions).toHaveBeenCalledTimes(1);
    expect(deps.repository.insertTransactions).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 120,
        note: 'โอนให้ ร้านข้าวแกง',
        occurred_on: '2026-09-28',
        source: 'slip',
        line_event_id: 'ev-img',
      },
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-health',
        amount: 59,
        note: 'ยาสีฟัน',
        occurred_on: '2026-09-28',
        source: 'slip',
        line_event_id: 'ev-img',
      },
    ]);
    expect(replyFlexOf(deps).text).toBe(
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน'
    );
    expect(replyFlexOf(deps).quickReply[0].action.data).toBe('action=undo&event=ev-img');
  });

  it('emits one budget alert when two items of the receipt are in the same category', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(CATEGORY_IDS);
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [SLIP_ITEM, { ...SLIP_ITEM, amount: 30, note: 'น้ำเปล่า' }],
    });
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'cat-food', category: 'อาหาร', budget: 200, spent: 170 },
    ]);

    await bot.handleEvent(postbackEvent(SAVE));

    const { text } = replyFlexOf(deps);
    expect(text.split('ใกล้เต็มงบ')).toHaveLength(2);
    expect(text).toContain('ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 170 จาก 200 บาท (85%)');
  });

  it('checks the budget of every category the receipt touched', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(CATEGORY_IDS);
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
    });
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'cat-food', category: 'อาหาร', budget: 150, spent: 135 },
      { categoryId: 'cat-health', category: 'สุขภาพ', budget: 100, spent: 100 },
    ]);

    await bot.handleEvent(postbackEvent(SAVE));

    const { text } = replyFlexOf(deps);
    expect(text).toContain('ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)');
    expect(text).toContain('เกินงบ สุขภาพ เดือน 09/2026: ใช้ไป 100 จาก 100 บาท (100%)');
  });

  it('tells the user when the receipt was cut to the first items', async () => {
    const parseSlip = vi.fn().mockResolvedValue(slipResult({ truncatedTo: 20 }));
    const { deps, bot } = setup({ parseSlip });

    await bot.handleEvent(imageEvent());

    expect(replyFlexOf(deps).text).toContain('มีสินค้ามากกว่า 20 รายการ บันทึกเฉพาะ 20 รายการแรก');
  });
});

describe('bot edit links on the saved card', () => {
  const LIFF_URL = 'https://liff.line.me/liff-1';
  const rowActions = (deps, index = 0) =>
    deps.replyFlex.mock.calls[index][1].contents.body.contents
      .filter((node) => node.type === 'box' && node.layout === 'horizontal')
      .map((row) => row.action);

  it('links the saved row to its transaction and date in the web page', async () => {
    const { deps, bot } = setup({ liffUrl: LIFF_URL });
    deps.repository.insertTransactions.mockResolvedValue(['tx-1']);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(rowActions(deps)).toEqual([{ type: 'uri', label: 'แก้ไข', uri: `${LIFF_URL}?tx=tx-1&d=2026-09-29` }]);
  });

  it('links every row of a receipt to its own transaction', async () => {
    const { deps, bot } = setup({ liffUrl: LIFF_URL });
    deps.users.loadCategoryIds.mockResolvedValue(
      new Map([
        ['expense:อาหาร', 'cat-food'],
        ['expense:สุขภาพ', 'cat-health'],
      ])
    );
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [SLIP_ITEM, SLIP_EXTRA_ITEM],
    });
    deps.repository.insertTransactions.mockResolvedValue(['tx-a', 'tx-b']);

    await bot.handleEvent(postbackEvent(`action=slip_save&slip=${SLIP_ID}`));

    expect(rowActions(deps).map((action) => action.uri)).toEqual([
      `${LIFF_URL}?tx=tx-a&d=2026-09-28`,
      `${LIFF_URL}?tx=tx-b&d=2026-09-28`,
    ]);
  });

  it('adds no links when the insert returns no ids or no web page is configured', async () => {
    const withoutIds = setup({ liffUrl: LIFF_URL });
    await withoutIds.bot.handleEvent(textEvent('กินข้าว 60'));
    const withoutUrl = setup();
    withoutUrl.deps.repository.insertTransactions.mockResolvedValue(['tx-1']);
    await withoutUrl.bot.handleEvent(textEvent('กินข้าว 60'));

    expect(rowActions(withoutIds.deps)).toEqual([undefined]);
    expect(rowActions(withoutUrl.deps)).toEqual([undefined]);
  });
});

describe('bot edit links stay safe', () => {
  const LIFF_URL = 'https://liff.line.me/liff-1';
  const linkOf = (deps) =>
    deps.replyFlex.mock.calls[0][1].contents.body.contents.find((node) => node.action).action.uri;

  it('leaves the date out of the link when it is not a plain YYYY-MM-DD date', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'ok', items: [{ ...FOOD_ITEM, date: '2026-09-29 \n' }] });
    const { deps, bot } = setup({ liffUrl: LIFF_URL, parseMessage });
    deps.repository.insertTransactions.mockResolvedValue(['tx-1']);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(linkOf(deps)).toBe(`${LIFF_URL}?tx=tx-1`);
  });

  it('encodes the transaction id so the link never contains spaces or brackets', async () => {
    const { deps, bot } = setup({ liffUrl: LIFF_URL });
    deps.repository.insertTransactions.mockResolvedValue(['a b[1]']);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(linkOf(deps)).not.toMatch(/[\s[\]]/);
    expect(linkOf(deps)).toMatch(/^https:\/\/liff\.line\.me\/liff-1\?tx=/);
  });

  it('still sends the card without links when the web address is not a usable https url', async () => {
    const { deps, bot } = setup({ liffUrl: 'liff.line.me/no-scheme' });
    deps.repository.insertTransactions.mockResolvedValue(['tx-1']);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyFlex).toHaveBeenCalledTimes(1);
    const rows = deps.replyFlex.mock.calls[0][1].contents.body.contents.filter((node) => node.action);
    expect(rows).toEqual([]);
  });
});
