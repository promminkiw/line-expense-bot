import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_TTL_MS,
  SLOW_PROCESSING_REPLY,
  REPLY_DEADLINE_MS,
  BILL_REPLIES,
  QUESTION_FAILED_REPLY,
  UNDO_SAVING_DONE_REPLY,
  UNDO_SAVING_NOT_FOUND_REPLY,
  GREETING_REPLY,
  NO_OPEN_GOAL_REPLY,
  SUMMARY_OTHER_PERIOD_HINT,
  UNSUPPORTED_REPLIES,
} from './bot.js';
import { HELP_MENU_REPLY, HELP_SECTIONS, WEB_COMING_SOON_REPLY, getHelpReply } from '../menu/fixed-replies.js';
import { TEXT_CATEGORIES } from '../parser/categories.js';
import { SAVING_AMOUNT_REPLY, GOAL_GONE_REPLY } from '../goals/chat.js';
import { DEFAULT_CLARIFY_QUESTION } from '../parser/parse-message.js';
import { t } from '../i18n/index.js';

const NOW_MS = Date.parse('2026-09-29T05:00:00Z');

const FOOD_ITEM = { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };
const USER_TEXT_CATEGORIES = { expense: ['อาหาร', 'อื่นๆ'], income: ['อื่นๆ'] };

const SLIP_ID = '7b1c9d5e-3f2a-4c8b-9a6d-1e2f3a4b5c6d';
const SLIP_ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };
const SLIP_EXTRA_ITEM = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };

function slipResult(overrides = {}) {
  return { status: 'ok', items: [SLIP_ITEM], dateAssumed: false, ...overrides };
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
    action: { type: 'postback', label: 'ลบ', data: 'action=undo&event=ev1', displayText: 'ลบ' },
  },
];
const SAVED_UNDO_FOOTER = [{ ...UNDO_QUICK_REPLY[0], action: { ...UNDO_QUICK_REPLY[0].action, label: 'ลบรายการนี้' } }];

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

// LINE ไม่ส่ง replyToken มากับ unfollow
function unfollowEvent() {
  return { type: 'unfollow', webhookEventId: 'ev4', source: { type: 'user', userId: 'U1' } };
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
    showLoading: vi.fn().mockResolvedValue(),
    parseMessage: vi.fn().mockResolvedValue({ status: 'ok', items: [FOOD_ITEM] }),
    parseQuestion: vi.fn().mockResolvedValue({ isQuestion: false }),
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
      listCategories: vi.fn().mockResolvedValue([
        { id: 'cat-food', name: 'อาหาร', type: 'expense', hidden: false },
        { id: 'cat-old', name: 'ค่าแมว', type: 'expense', hidden: true },
        { id: 'cat-other', name: 'อื่นๆ', type: 'expense', hidden: false },
        { id: 'cat-income-other', name: 'อื่นๆ', type: 'income', hidden: false },
      ]),
      queryTotals: vi.fn().mockResolvedValue([{ type: 'expense', total: 450, entryCount: 6 }]),
      listWallets: vi.fn().mockResolvedValue([{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true }]),
      listGoals: vi.fn().mockResolvedValue([
        { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: null, closed: false, saved: 5000, contributionCount: 1 },
        { id: 'g-2', name: 'มือถือ', targetAmount: 30000, targetDate: null, closed: true, saved: 30000, contributionCount: 3 },
      ]),
      addGoalContribution: vi.fn().mockResolvedValue({ status: 'ok', contributionId: 'gc-1', saved: 6000 }),
      deleteGoalContributionsByEvent: vi.fn().mockResolvedValue(1),
      savePendingSlip: vi.fn().mockResolvedValue(SLIP_ID),
      deleteExpiredPendingSlips: vi.fn().mockResolvedValue(),
      claimPendingSlip: vi.fn().mockResolvedValue({ webhookEventId: 'ev-img', items: [SLIP_ITEM] }),
      disableNotifications: vi.fn().mockResolvedValue(),
      resumeMonthlySummary: vi.fn().mockResolvedValue(),
      setUserLanguage: vi.fn().mockResolvedValue(),
    },
    now: () => NOW_MS,
    users: {
      resolveUser: vi.fn().mockResolvedValue({ userId: 'user-1', language: 'th' }),
      // handler ต้องใช้ userId ที่ bot หามาแล้ว ห้ามเรียก ensureUser ซ้ำ เทสต์ตรวจว่าไม่ถูกเรียก
      ensureUser: vi.fn(),
      loadTextCategories: vi.fn().mockResolvedValue(USER_TEXT_CATEGORIES),
      loadCategoryIds: vi.fn().mockResolvedValue(
        new Map([
          ['expense:อาหาร', 'cat-food'],
          ['expense:อื่นๆ', 'cat-other'],
        ])
      ),
      loadWallets: vi.fn().mockResolvedValue([{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true }]),
    },
    bills: { respond: vi.fn().mockResolvedValue({ status: 'confirmed', share: 300, categoryName: 'อาหาร' }) },
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

    expect(deps.users.resolveUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev1', 'user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', [], USER_TEXT_CATEGORIES, [], 'th');
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
      text: 'เฮียบันทึกแล้ว\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
      quickReply: SAVED_UNDO_FOOTER,
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
    expect(deps.parseMessage).toHaveBeenCalledWith('500000', history, USER_TEXT_CATEGORIES, [], 'th');
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

  it('treats a failed context load as no context and still saves', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', [], USER_TEXT_CATEGORIES, [], 'th');
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
    expect(deps.replyFlex).toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to load pending clarification',
      { userId: 'user-1' },
      expect.any(Error)
    );
  });

  it('clears the pending conversation after saving when the context load failed', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('ขนม 30'));

    expect(deps.repository.clearPendingClarification).toHaveBeenCalledWith('user-1');
    expect(deps.replyFlex).toHaveBeenCalled();
  });

  it('still replies system error when parsing fails after the context load failed', async () => {
    const parseMessage = vi.fn().mockRejectedValue(new Error('claude down'));
    const { deps, bot } = setup({ parseMessage });
    deps.repository.getPendingClarification.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
  });

  it('still asks back and remembers the question when the context load failed', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'ซื้ออะไรกี่บาท' });
    const { deps, bot } = setup({ parseMessage });
    deps.repository.getPendingClarification.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('ซื้อของ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'ซื้ออะไรกี่บาท', undefined);
    expect(deps.repository.savePendingClarification).toHaveBeenCalledWith('user-1', [
      { role: 'user', text: 'ซื้อของ' },
      { role: 'assistant', text: 'ซื้ออะไรกี่บาท' },
    ]);
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
      text: expect.stringContaining('เฮียบันทึกแล้ว'),
      quickReply: SAVED_UNDO_FOOTER,
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

    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', [], USER_TEXT_CATEGORIES, [], 'th');
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

    expect(deps.users.resolveUser).not.toHaveBeenCalled();
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

    expect(deps.users.resolveUser).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('uses the agreed wording for the system error message', () => {
    expect(SYSTEM_ERROR_REPLY).toBe('เฮียขออภัย ระบบมีปัญหา ถ้าจดรายการไว้ ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ขอสรุป หรือถามยอด ลองใหม่อีกครั้ง');
  });
});

describe('bot menu fixed replies', () => {
  it('asks which help topic to show without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ช่วยเหลือ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', HELP_MENU_REPLY, getHelpReply('ช่วยเหลือ').quickReply);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('replies only the chosen help section', async () => {
    const { deps, bot } = setup();
    const section = HELP_SECTIONS[2];

    await bot.handleEvent(textEvent(`ช่วยเหลือ ${section.label}`));

    expect(deps.replyText).toHaveBeenCalledWith('r1', section.text, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
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

    expect(deps.replyText).toHaveBeenCalledWith('r1', HELP_MENU_REPLY, getHelpReply('ช่วยเหลือ').quickReply);
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

  it('shows the period buttons even when the user is rate limited because it costs no Claude call', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SUMMARY_MENU_REPLY, SUMMARY_QUICK_REPLY);
    expect(deps.allowRequest).not.toHaveBeenCalled();
  });

  it('replies a summary card for today using SQL totals and the Claude comment', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-29', '2026-09-29');
    expect(deps.commentSummary).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'วันนี้ (29/09)', expenseTotal: 105, entryCount: 2 }),
      'th'
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
    expect(JSON.stringify(deps.replyFlex.mock.calls[0][1])).toContain(t('th', 'chat.noEntriesComment'));
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

    expect(deps.users.resolveUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.resumeMonthlySummary).toHaveBeenCalledWith('U1');
    expect(deps.users.resolveUser.mock.invocationCallOrder[0]).toBeLessThan(deps.repository.resumeMonthlySummary.mock.invocationCallOrder[0]);
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('logs but does not reply when resuming the monthly summary fails', async () => {
    const { deps, bot } = setup();
    deps.repository.resumeMonthlySummary.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(followEvent());

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'follow' },
      expect.any(Error)
    );
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });

  it('logs but does not reply when registration fails', async () => {
    const users = { resolveUser: vi.fn().mockRejectedValue(new Error('db down')), loadCategoryIds: vi.fn() };
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

describe('bot unfollow event', () => {
  it('turns off the notifications of that LINE user without replying or creating a user', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(unfollowEvent());

    expect(deps.repository.disableNotifications).toHaveBeenCalledWith('U1');
    expect(deps.users.resolveUser).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });

  it('logs but does not reply when turning off fails', async () => {
    const { deps, bot } = setup();
    deps.repository.disableNotifications.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(unfollowEvent());

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'unfollow' },
      expect.any(Error)
    );
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });
});

describe('bot undo postback', () => {
  it('deletes the entries of that event for this user and confirms', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));

    expect(deps.users.resolveUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_DONE_REPLY, undefined);
  });

  it('resolves the owner from the event sender, not from postback data', async () => {
    const resolveUser = vi.fn(async (id) => ({ userId: id === 'U1' ? 'user-1' : 'user-other', language: 'th' }));
    const { deps, bot } = setup({ users: { resolveUser, loadCategoryIds: vi.fn() } });

    await bot.handleEvent(postbackEvent('action=undo&event=ev1&user=U2'));

    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(resolveUser).not.toHaveBeenCalledWith('U2');
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

describe('bot saving command', () => {
  const UNDO_SAVING_QUICK_REPLY = [
    {
      type: 'action',
      action: { type: 'postback', label: 'ลบ', data: 'action=undo_saving&event=ev1', displayText: 'ลบ' },
    },
  ];

  it('adds the amount to the open goal named in the message without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1,000'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalledWith('user-1', 'g-1', {
      amount: 1000,
      occurredOn: '2026-09-29',
      lineEventId: 'ev1',
    });
    const flex = deps.replyFlex.mock.calls[0][1];
    expect(deps.replyFlex.mock.calls[0][0]).toBe('r1');
    expect(flex.altText).toBe('เฮียจดออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000 / 50,000 บาท (12%)');
    expect(flex.contents.footer.contents.map((button) => button.action)).toEqual([UNDO_SAVING_QUICK_REPLY[0].action]);
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.parseQuestion).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('links the saving card to the goals tab when the LIFF URL is set', async () => {
    const { deps, bot } = setup({ liffUrl: 'https://liff.line.me/liff-1' });

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    const footer = deps.replyFlex.mock.calls[0][1].contents.footer;
    expect(footer.contents.at(-1).action).toEqual({ type: 'uri', label: 'ดูเป้าในเว็บ', uri: 'https://liff.line.me/liff-1?tab=goals' });
  });

  it('ignores a redelivered saving message', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('answers even when the user is rate limited because it costs no Claude call', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalled();
    expect(deps.allowRequest).not.toHaveBeenCalled();
  });

  it('lists the open goals when the name is not found, skipping closed goals', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม มือถือ 100'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'เฮียไม่พบเป้า "มือถือ"\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น\nพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000',
      undefined
    );
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
  });

  it('asks for the goal name instead of saving an expense when the name is missing', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม 1000'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'ใส่ชื่อเป้าให้เฮียด้วย เช่น ออม เที่ยวญี่ปุ่น 1000\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น', undefined);
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it('records "ออม 1000" as an entry for a user with no open goal', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('ออม 1000'));

    expect(deps.parseMessage).toHaveBeenCalled();
  });

  it('asks for a valid amount when the user has an open goal', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 0'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it.each(['60,50', '1,5', '1,50,000'])('replies with the amount rule and saves nothing for the amount %s', async (amount) => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent(`ออม เที่ยวญี่ปุ่น ${amount}`));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('still saves 1000 for a thousands-comma amount', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1,000'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalledWith('user-1', 'g-1', expect.objectContaining({ amount: 1000 }));
  });

  // ผู้ใช้ตัดสิน 2026-10-19: คนที่ไม่มีเป้าเปิดอยู่ ข้อความอย่าง "ออมสิน 1000" ต้องเป็นรายการตามเดิม
  it('records the message as an entry when the user has no open goal', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockResolvedValue([
      { id: 'g-2', name: 'มือถือ', targetAmount: 30000, targetDate: null, closed: true, saved: 30000, contributionCount: 3 },
    ]);

    await bot.handleEvent(textEvent('ออมสิน 1000'));

    expect(deps.repository.listGoals).toHaveBeenCalledWith('user-1');
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalledWith('ออมสิน 1000', [], USER_TEXT_CATEGORIES, [], 'th');
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  it('leaves even a bad saving amount to the normal flow when the user has no goals', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('ออม ทริป 0'));

    expect(deps.repository.listGoals).toHaveBeenCalledWith('user-1');
    expect(deps.replyText).not.toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
    expect(deps.parseMessage).toHaveBeenCalledWith('ออม ทริป 0', [], USER_TEXT_CATEGORIES, [], 'th');
  });

  it('counts the rate limit once the message falls through to the normal flow', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('ออมสิน 1000'));

    expect(deps.repository.listGoals).toHaveBeenCalledWith('user-1');
    expect(deps.allowRequest).toHaveBeenCalledWith('U1');
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  // เป้าอาจถูกปิดจากหน้าเว็บระหว่างอ่านรายชื่อกับตอนบันทึก
  it('says the goal is gone when SQL refuses the contribution', async () => {
    const { deps, bot } = setup();
    deps.repository.addGoalContribution.mockResolvedValue({ status: 'closed', contributionId: null, saved: null });

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', GOAL_GONE_REPLY, undefined);
  });

  it('replies with the system error and records nothing when the goals cannot be read', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('leaves other messages to the parser', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.repository.listGoals).not.toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalled();
  });
});

describe('bot undo saving postback', () => {
  it('deletes the contribution of that event for this user and confirms', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo_saving&event=ev1'));

    expect(deps.repository.deleteGoalContributionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(deps.repository.deleteTransactionsByEvent).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_SAVING_DONE_REPLY, undefined);
  });

  it('tells the user when nothing was deleted', async () => {
    const { deps, bot } = setup();
    deps.repository.deleteGoalContributionsByEvent.mockResolvedValue(0);

    await bot.handleEvent(postbackEvent('action=undo_saving&event=ev1'));

    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_SAVING_NOT_FOUND_REPLY, undefined);
  });

  it('ignores the postback without an event id', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo_saving'));

    expect(deps.repository.deleteGoalContributionsByEvent).not.toHaveBeenCalled();
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
  const SAVED = 'เฮียบันทึกแล้ว\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว';

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
      quickReply: SAVED_UNDO_FOOTER,
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
      quickReply: SAVED_UNDO_FOOTER,
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
    expect(replyFlexOf(deps)).toEqual({ replyToken: 'r1', text: SAVED, quickReply: SAVED_UNDO_FOOTER });
  });

  it('keeps the saved reply and adds the failure line and logs when the budget check fails', async () => {
    const { deps, bot } = setup();
    const error = new Error('db down');
    deps.repository.getBudgetStatus.mockRejectedValue(error);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r1',
      text: `${SAVED}\n\nเฮียเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ`,
      quickReply: SAVED_UNDO_FOOTER,
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
    expect(text.split('เฮียเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ')).toHaveLength(2);
    expect(text.startsWith('เฮียบันทึกแล้ว')).toBe(true);
    expect(text.endsWith('\n\nเฮียเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ')).toBe(true);
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
        resolveUser: vi.fn().mockResolvedValue({ userId: 'user-1', language: 'th' }),
        loadTextCategories: vi.fn().mockResolvedValue(USER_TEXT_CATEGORIES),
        loadCategoryIds: vi.fn().mockResolvedValue(new Map([['income:อื่นๆ', 'cat-income-other']])),
        loadWallets: vi.fn().mockResolvedValue([{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true }]),
      },
    });

    await bot.handleEvent(textEvent('ได้เงิน 500'));

    expect(deps.repository.getBudgetStatus).not.toHaveBeenCalled();
    expect(replyFlexOf(deps).text).not.toContain('เช็กงบไม่สำเร็จ');
  });
});

describe('bot text categories', () => {
  it('passes the user categories to the parser', async () => {
    const { deps, bot } = setup();
    const categories = { expense: ['ค่าแมว', 'อื่นๆ'], income: ['อื่นๆ'] };
    deps.users.loadTextCategories.mockResolvedValue(categories);

    await bot.handleEvent(textEvent('อาหารแมว 300'));

    expect(deps.users.loadTextCategories).toHaveBeenCalledWith('user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('อาหารแมว 300', [], categories, [], 'th');
  });

  // อ่านหมวดและกระเป๋าไปพร้อมกับบริบทแชต ไม่ต้องรอทีละอย่างก่อนเรียก Claude
  it('starts loading the categories and wallets without waiting for the chat history', async () => {
    const { deps, bot } = setup();
    let releaseHistory;
    deps.repository.getPendingClarification.mockReturnValue(new Promise((resolve) => (releaseHistory = resolve)));

    const handled = bot.handleEvent(textEvent('อาหารแมว 300'));
    await vi.waitFor(() => expect(deps.repository.getPendingClarification).toHaveBeenCalled());

    expect(deps.users.loadTextCategories).toHaveBeenCalledWith('user-1');
    expect(deps.users.loadWallets).toHaveBeenCalledWith('user-1');
    releaseHistory(null);
    await handled;
    expect(deps.parseMessage).toHaveBeenCalled();
  });

  // หมวดเป็นตัวช่วยเลือก ถ้าโหลดไม่ได้ยังบันทึกด้วยหมวดเริ่มต้นได้ ดีกว่าตอบว่าระบบมีปัญหา
  it('falls back to the default categories and still saves when loading them fails', async () => {
    const { deps, bot } = setup();
    deps.users.loadTextCategories.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', [], TEXT_CATEGORIES, [], 'th');
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to load text categories',
      { userId: 'user-1' },
      expect.any(Error)
    );
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  // ตอนใช้หมวดเริ่มต้นแทน Claude อาจเลือกหมวดที่ผู้ใช้ซ่อนไว้ จึงต้องหา id จากหมวดที่ไม่ซ่อนเท่านั้น
  it('looks up only visible category ids when saving a text entry', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.users.loadCategoryIds).toHaveBeenCalledWith('user-1', { visibleOnly: true });
  });

  it('does not load categories for the summary menu', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.users.loadTextCategories).not.toHaveBeenCalled();
  });
});

describe('bot totals questions', () => {
  const QUESTION = { isQuestion: true, type: 'expense', category: '', keyword: 'กาแฟ', from: '2026-10-01', to: '2026-10-18' };

  it('answers a question with totals from SQL and does not record an entry', async () => {
    const { deps, bot } = setup();
    deps.parseQuestion.mockResolvedValue(QUESTION);

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    expect(deps.repository.queryTotals).toHaveBeenCalledWith('user-1', QUESTION);
    const [replyToken, flex] = deps.replyFlex.mock.calls[0];
    expect(replyToken).toBe('r1');
    expect(flex.altText).toBe('ช่วง 1-18 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)');
    expect(flex.contents.header.contents[0].text).toBe('ยอด 1-18 ต.ค. 2569');
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  describe('list link button', () => {
    const LIFF_URL = 'https://liff.line.me/liff-1';
    const buttonUri = (deps) => {
      const { footer } = deps.replyFlex.mock.calls[0][1].contents;
      return footer ? footer.contents[0].action.uri : undefined;
    };

    it('opens the list of the month of the end date filtered by keyword and type', async () => {
      const { deps, bot } = setup({ liffUrl: LIFF_URL });
      deps.parseQuestion.mockResolvedValue(QUESTION);

      await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

      const url = new URL(buttonUri(deps));
      expect(url.origin + url.pathname).toBe(LIFF_URL);
      expect(Object.fromEntries(url.searchParams)).toEqual({ tab: 'list', m: '2026-10', q: 'กาแฟ', type: 'expense' });
    });

    it('sends the category and the keyword as separate params', async () => {
      const { deps, bot } = setup({ liffUrl: LIFF_URL });
      deps.parseQuestion.mockResolvedValue({ ...QUESTION, category: 'อาหาร' });

      await bot.handleEvent(textEvent('กาแฟในหมวดอาหารเท่าไหร่'));

      expect(Object.fromEntries(new URL(buttonUri(deps)).searchParams)).toEqual({
        tab: 'list',
        m: '2026-10',
        q: 'กาแฟ',
        c: 'อาหาร',
        type: 'expense',
      });
    });

    it('sends only the category when there is no keyword and leaves the type out for both', async () => {
      const { deps, bot } = setup({ liffUrl: LIFF_URL });
      deps.parseQuestion.mockResolvedValue({ ...QUESTION, keyword: '', category: 'อาหาร', type: 'both', to: '2026-09-30' });

      await bot.handleEvent(textEvent('เดือนที่แล้วอาหารเท่าไหร่'));

      expect(Object.fromEntries(new URL(buttonUri(deps)).searchParams)).toEqual({ tab: 'list', m: '2026-09', c: 'อาหาร' });
    });

    it('sends the wallet name when the question names a wallet', async () => {
      const { deps, bot } = setup({ liffUrl: LIFF_URL });
      deps.parseQuestion.mockResolvedValue({ ...QUESTION, keyword: '', wallet: 'บัตรเครดิต' });

      await bot.handleEvent(textEvent('เดือนนี้รูดบัตรเครดิตไปเท่าไหร่'));

      expect(Object.fromEntries(new URL(buttonUri(deps)).searchParams)).toEqual({
        tab: 'list',
        m: '2026-10',
        w: 'บัตรเครดิต',
        type: 'expense',
      });
    });

    it('has no button without a LIFF url', async () => {
      const { deps, bot } = setup();
      deps.parseQuestion.mockResolvedValue(QUESTION);

      await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

      expect(buttonUri(deps)).toBeUndefined();
    });

    it('has no button when the link would exceed the URI limit', async () => {
      const { deps, bot } = setup({ liffUrl: LIFF_URL });
      deps.parseQuestion.mockResolvedValue({ ...QUESTION, keyword: 'ก'.repeat(200) });

      await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

      expect(deps.replyFlex).toHaveBeenCalled();
      expect(buttonUri(deps)).toBeUndefined();
    });

    it('has no button for a LIFF url that is not https', async () => {
      const { deps, bot } = setup({ liffUrl: 'http://liff.line.me/liff-1' });
      deps.parseQuestion.mockResolvedValue(QUESTION);

      await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

      expect(buttonUri(deps)).toBeUndefined();
    });
  });

  // ผู้ใช้ถามถึงรายการเก่าได้ จึงส่งทุกชื่อหมวดรวมที่ซ่อน ไม่ใช่เฉพาะหมวดที่ให้เลือกตอนบันทึก
  it('gives the parser every category name once, hidden ones included', async () => {
    const { deps, bot } = setup();
    deps.parseQuestion.mockResolvedValue(QUESTION);

    await bot.handleEvent(textEvent('ค่าแมวเท่าไหร่'));

    expect(deps.parseQuestion).toHaveBeenCalledWith('ค่าแมวเท่าไหร่', ['อาหาร', 'ค่าแมว', 'อื่นๆ'], [], 'th');
  });

  it('uses the default category names when loading them fails', async () => {
    const { deps, bot } = setup();
    deps.repository.listCategories.mockRejectedValue(new Error('db down'));
    deps.parseQuestion.mockResolvedValue(QUESTION);

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    const names = deps.parseQuestion.mock.calls[0][1];
    expect(names).toContain('อาหาร');
    expect(names).toContain('เงินเดือน');
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to load question categories', { userId: 'user-1' }, expect.any(Error));
    expect(deps.replyFlex.mock.calls[0][1].altText).toContain('รายจ่าย 450 บาท');
  });

  it('records the message as before when Claude says it is not a question', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ข้าวมันไก่ 50 แพงเท่าไหร่'));

    expect(deps.parseQuestion).toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalledWith('ข้าวมันไก่ 50 แพงเท่าไหร่', [], expect.anything(), [], 'th');
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  it('does not call the question parser without a question word', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseQuestion).not.toHaveBeenCalled();
  });

  // ระหว่างที่บอทถามกลับ ข้อความถัดไปคือคำตอบของรายการเดิม
  it('does not read a reply to a clarifying question as a totals question', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ซื้อรถ' },
        { role: 'assistant', text: 'ซื้อรถกี่บาท' },
      ],
      updatedAt: new Date(NOW_MS).toISOString(),
    });

    await bot.handleEvent(textEvent('ไม่แน่ใจว่าเท่าไหร่ ประมาณ 500000'));

    expect(deps.parseQuestion).not.toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalled();
  });

  it('counts a question against the rate limit', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    expect(deps.parseQuestion).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
  });

  // ไม่ส่งต่อไปบันทึกรายการ เพราะคำถามอย่าง "1-15 ต.ค. ใช้ไปเท่าไหร่" อาจกลายเป็นรายการ 15 บาท
  it.each([
    ['the question parser', (deps) => deps.parseQuestion.mockRejectedValue(new Error('timeout'))],
    ['the totals query', (deps) => {
      deps.parseQuestion.mockResolvedValue(QUESTION);
      deps.repository.queryTotals.mockRejectedValue(new Error('function query_totals does not exist'));
    }],
  ])('tells the user it cannot answer when %s fails', async (_, fail) => {
    const { deps, bot } = setup();
    fail(deps);

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', QUESTION_FAILED_REPLY, undefined);
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to answer totals question', { userId: 'user-1' }, expect.any(Error));
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });
});

describe('bot wallets', () => {
  const CASH = { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true };
  const CARD = { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false };
  const OLD = { id: 'w-old', name: 'บัญชีเก่า', hidden: true, isDefault: false };

  it('offers the visible wallets to the parser when the user has several', async () => {
    const { deps, bot } = setup();
    deps.users.loadWallets.mockResolvedValue([CASH, CARD, OLD]);

    await bot.handleEvent(textEvent('กาแฟ 60 บัตรเครดิต'));

    expect(deps.users.loadWallets).toHaveBeenCalledWith('user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('กาแฟ 60 บัตรเครดิต', [], USER_TEXT_CATEGORIES, ['เงินสด', 'บัตรเครดิต'], 'th');
  });

  it('saves the chosen wallet id, cash as null, and shows the wallet on the card', async () => {
    const { deps, bot } = setup();
    deps.users.loadWallets.mockResolvedValue([CASH, CARD]);
    deps.parseMessage.mockResolvedValue({
      status: 'ok',
      items: [
        { ...FOOD_ITEM, wallet: 'บัตรเครดิต' },
        { ...FOOD_ITEM, amount: 45, note: 'กาแฟ', wallet: '' },
      ],
    });

    await bot.handleEvent(textEvent('กินข้าว 60 บัตรเครดิต กาแฟ 45'));

    const rows = deps.repository.insertTransactions.mock.calls[0][0];
    expect(rows.map((row) => row.wallet_id)).toEqual(['w-card', null]);
    const card = JSON.stringify(deps.replyFlex.mock.calls[0][1].contents.body);
    expect(card).toContain('อาหาร · 29/09 · บัตรเครดิต');
    expect(card).toContain('อาหาร · 29/09 · เงินสด');
  });

  // ผู้ใช้กระเป๋าเดียวไม่ส่ง wallet_id เลย จึงบันทึกได้แม้ DB ยังไม่มีคอลัมน์ หรืออ่านกระเป๋าไม่ได้
  it('leaves wallet_id out and the card unchanged for a single wallet', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.repository.insertTransactions.mock.calls[0][0][0]).not.toHaveProperty('wallet_id');
    expect(JSON.stringify(deps.replyFlex.mock.calls[0][1].contents.body)).not.toContain('เงินสด');
  });

  it('still saves to the default wallet when the wallets cannot be loaded', async () => {
    const { deps, bot } = setup();
    deps.users.loadWallets.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.logger.error).toHaveBeenCalledWith('Failed to load wallets', { userId: 'user-1' }, expect.any(Error));
    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', [], USER_TEXT_CATEGORIES, [], 'th');
    expect(deps.repository.insertTransactions.mock.calls[0][0][0]).not.toHaveProperty('wallet_id');
    expect(JSON.stringify(deps.replyFlex.mock.calls[0][1].contents.body)).toContain('เฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ');
    expect(deps.replyFlex.mock.calls[0][1].altText).toContain('เฮียอ่านกระเป๋าไม่ได้ รายการนี้อยู่ในเงินสด แก้ได้ในเว็บ');
  });

  it('adds no wallet notice when the wallets load', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(JSON.stringify(deps.replyFlex.mock.calls[0][1])).not.toContain('อ่านกระเป๋าไม่ได้');
  });

  it('gives the question parser every wallet name, hidden ones included', async () => {
    const { deps, bot } = setup();
    deps.repository.listWallets.mockResolvedValue([CASH, OLD]);

    await bot.handleEvent(textEvent('บัญชีเก่าใช้ไปเท่าไหร่'));

    expect(deps.repository.listWallets).toHaveBeenCalledWith('user-1');
    expect(deps.parseQuestion).toHaveBeenCalledWith('บัญชีเก่าใช้ไปเท่าไหร่', ['อาหาร', 'ค่าแมว', 'อื่นๆ'], ['เงินสด', 'บัญชีเก่า'], 'th');
  });

  it('asks without wallets when they cannot be loaded for a question', async () => {
    const { deps, bot } = setup();
    deps.repository.listWallets.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('เดือนนี้ใช้ไปเท่าไหร่'));

    expect(deps.logger.error).toHaveBeenCalledWith('Failed to load question wallets', { userId: 'user-1' }, expect.any(Error));
    expect(deps.parseQuestion.mock.calls[0][2]).toEqual([]);
  });
});

describe('bot slip image', () => {
  const SLIP_CONFIRM_TEXT =
    'เฮียอ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)';

  it('reads the slip, keeps the item pending and asks for confirmation without saving', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.users.resolveUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev-img', 'user-1');
    expect(deps.downloadImage).toHaveBeenCalledWith('m1');
    expect(deps.parseSlip).toHaveBeenCalledWith({ data: 'QUJD', mediaType: 'image/jpeg' }, 'th');
    expect(deps.repository.savePendingSlip).toHaveBeenCalledWith('user-1', 'ev-img', [SLIP_ITEM]);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(replyFlexOf(deps)).toEqual({ replyToken: 'r-img', text: SLIP_CONFIRM_TEXT, quickReply: [SLIP_QUICK_REPLY[1], SLIP_QUICK_REPLY[0]] });
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
    expect(replyFlexOf(deps)).toEqual({ replyToken: 'r-img', text: SLIP_CONFIRM_TEXT, quickReply: [SLIP_QUICK_REPLY[1], SLIP_QUICK_REPLY[0]] });
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

  it('tells the user the image limit is 3.5 MB', () => {
    expect(SLIP_TOO_LARGE_REPLY).toBe('รูปใหญ่เกินไปสำหรับเฮีย (ไม่เกิน 3.5 MB) ลองส่งใหม่หรือย่อรูปก่อน');
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
      text: 'เฮียบันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง',
      quickReply: [
        {
          type: 'action',
          action: { type: 'postback', label: 'ลบรายการนี้', data: 'action=undo&event=ev-img', displayText: 'ลบ' },
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
      'เฮียบันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n\nใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 135 จาก 150 บาท (90%)'
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
      deps.users.resolveUser.mockImplementation(async (id) => ({ userId: { U1: 'user-1', U2: 'user-2' }[id], language: 'th' }));
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
      text: 'เฮียบันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n\nเฮียเช็กงบไม่สำเร็จ ดูสถานะงบได้ในหน้าเว็บ',
      quickReply: [
        {
          type: 'action',
          action: { type: 'postback', label: 'ลบรายการนี้', data: 'action=undo&event=ev-img', displayText: 'ลบ' },
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

// สลิปที่รอยืนยันก่อนเปลี่ยนเป็นอ่านยอดเดียวอาจมีหลายรายการ ยังต้องบันทึกได้ครบ
describe('bot slip with several items', () => {
  const SAVE = `action=slip_save&slip=${SLIP_ID}`;
  const CATEGORY_IDS = new Map([
    ['expense:อาหาร', 'cat-food'],
    ['expense:สุขภาพ', 'cat-health'],
    ['expense:อื่นๆ', 'cat-other'],
    ['expense:ใบเสร็จ/สลิปโอนเงิน', 'cat-slip'],
  ]);

  it('saves a slip total under the slip category', async () => {
    const { deps, bot } = setup();
    deps.users.loadCategoryIds.mockResolvedValue(CATEGORY_IDS);
    deps.repository.claimPendingSlip.mockResolvedValue({
      webhookEventId: 'ev-img',
      items: [{ ...SLIP_ITEM, category: 'ใบเสร็จ/สลิปโอนเงิน' }],
    });

    await bot.handleEvent(postbackEvent(SAVE));

    expect(deps.repository.insertTransactions).toHaveBeenCalledWith([
      expect.objectContaining({ category_id: 'cat-slip', amount: 120, source: 'slip' }),
    ]);
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
      'เฮียบันทึกแล้ว\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน'
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

describe('bot reply deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it('keeps the slow reply text and the 50 second deadline', () => {
    expect(SLOW_PROCESSING_REPLY).toBe(
      'เฮียตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง'
    );
    expect(REPLY_DEADLINE_MS).toBe(50000);
  });

  it('replies the slow message at the deadline and drops the late reply', async () => {
    vi.useFakeTimers();
    const parse = deferred();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => parse.promise), replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('กินข้าว 60'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.replyText).toHaveBeenCalledWith('r1', SLOW_PROCESSING_REPLY, undefined);
    expect(deps.logger.error).toHaveBeenCalledWith('Event passed the reply deadline', { lineUserId: 'U1', eventType: 'message' });

    parse.resolve({ status: 'ok', items: [FOOD_ITEM] });
    await vi.advanceTimersByTimeAsync(0);

    // งานที่ค้างยังบันทึกต่อ จึงต้องบอกผู้ใช้ให้ตรวจก่อนส่งซ้ำ
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledTimes(1);
    expect(deps.logger.info).toHaveBeenCalledWith('Dropped a reply that finished after the deadline', {
      lineUserId: 'U1',
      eventType: 'message',
    });
  });

  it('does not keep a clarify question that finished after the deadline', async () => {
    vi.useFakeTimers();
    const parse = deferred();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => parse.promise), replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('ข้าวเที่ยง'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;
    parse.resolve({ status: 'clarify', question: 'ข้าวเที่ยงกี่บาท' });
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.repository.savePendingClarification).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledTimes(1);
    expect(deps.replyText).toHaveBeenCalledWith('r1', SLOW_PROCESSING_REPLY, undefined);
  });

  it('logs a failure that happens after the deadline without replying again', async () => {
    vi.useFakeTimers();
    const parse = deferred();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => parse.promise), replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('กินข้าว 60'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;
    parse.reject(new Error('overloaded'));
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.replyText).toHaveBeenCalledTimes(1);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event after the reply deadline',
      { lineUserId: 'U1', eventType: 'message' },
      expect.any(Error)
    );
  });

  it('uses a 50 second deadline by default', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ parseMessage: vi.fn(() => new Promise(() => {})) });

    const handled = bot.handleEvent(textEvent('กินข้าว 60'));
    await vi.advanceTimersByTimeAsync(49999);
    expect(deps.replyText).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await handled;

    expect(deps.replyText).toHaveBeenCalledWith('r1', SLOW_PROCESSING_REPLY, undefined);
  });

  it('still replies system error when processing fails before the deadline', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ parseMessage: vi.fn().mockRejectedValue(new Error('overloaded')), replyDeadlineMs: 1000 });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the deadline timer on the normal path', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ replyDeadlineMs: 1000 });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyFlex).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends nothing for a follow event that passes the deadline', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ replyDeadlineMs: 1000 });
    deps.users.resolveUser.mockImplementation(() => new Promise(() => {}));

    const handled = bot.handleEvent(followEvent());
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });

  it('sends nothing for an unfollow event that passes the deadline', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setup({ replyDeadlineMs: 1000 });
    deps.repository.disableNotifications.mockImplementation(() => new Promise(() => {}));

    const handled = bot.handleEvent(unfollowEvent());
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.logger.error).toHaveBeenCalledWith('Event passed the reply deadline', { lineUserId: 'U1', eventType: 'unfollow' });
    expect(deps.replyText).not.toHaveBeenCalled();
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });
});

describe('bot bill card buttons', () => {
  const BILL = '55555555-5555-5555-5555-555555555555';

  it('confirms the share from the card and says where it was saved', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}`));

    expect(deps.bills.respond).toHaveBeenCalledWith('user-1', BILL, 'confirm');
    expect(deps.replyText).toHaveBeenCalledWith('r2', 'เฮียบันทึกส่วนของคุณ 300 บาท ในหมวด อาหาร แล้ว', undefined);
  });

  it('answers every other outcome with its own message', async () => {
    for (const [action, status, reply] of [
      ['bill_decline', 'declined', BILL_REPLIES.declined],
      ['bill_confirm', 'cancelled', BILL_REPLIES.cancelled],
      ['bill_confirm', 'not_found', BILL_REPLIES.not_found],
    ]) {
      const { deps, bot } = setup();
      deps.bills.respond.mockResolvedValue({ status });

      await bot.handleEvent(postbackEvent(`action=${action}&bill=${BILL}`));

      expect(deps.replyText).toHaveBeenCalledWith('r2', reply, undefined);
    }
  });

  // การ์ดเก่าแก้ไม่ได้ คำตอบจึงต้องบอกชื่อบิลและว่าไม่ต้องกดอีก เช่นตอนยืนยันในเว็บไปแล้ว
  it('answers a tap on a bill already confirmed, also on the web, with its title and share', async () => {
    const { deps, bot } = setup();
    deps.bills.respond.mockResolvedValue({ status: 'already_confirmed', title: 'ชาบู', share: 200 });

    await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}`));

    expect(deps.replyText).toHaveBeenCalledWith('r2', 'คุณยืนยันบิล ชาบู ไปแล้ว (ส่วนของคุณ 200 บาท) ไม่ต้องกดอีก', undefined);
  });

  it('answers a tap on a bill already declined with its title', async () => {
    const { deps, bot } = setup();
    deps.bills.respond.mockResolvedValue({ status: 'already_declined', title: 'ชาบู', share: 200 });

    await bot.handleEvent(postbackEvent(`action=bill_decline&bill=${BILL}`));

    expect(deps.replyText).toHaveBeenCalledWith('r2', 'คุณปฏิเสธบิล ชาบู ไปแล้ว ไม่ต้องกดอีก', undefined);
  });

  it('falls back to the plain already answers without a title', async () => {
    for (const status of ['already_confirmed', 'already_declined']) {
      const { deps, bot } = setup();
      deps.bills.respond.mockResolvedValue({ status });

      await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}`));

      expect(deps.replyText).toHaveBeenCalledWith('r2', BILL_REPLIES[status], undefined);
    }
  });

  it('says the earlier answer when the user taps the other button', async () => {
    for (const [action, status, reply] of [
      ['bill_decline', 'already_confirmed', BILL_REPLIES.already_confirmed],
      ['bill_confirm', 'already_declined', BILL_REPLIES.already_declined],
    ]) {
      const { deps, bot } = setup();
      deps.bills.respond.mockResolvedValue({ status });

      await bot.handleEvent(postbackEvent(`action=${action}&bill=${BILL}`));

      expect(deps.replyText).toHaveBeenCalledWith('r2', reply, undefined);
    }
  });

  it('only ever passes confirm or decline to the service', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}&answer=anything`));
    await bot.handleEvent(postbackEvent(`action=bill_decline&bill=${BILL}`));
    await bot.handleEvent(postbackEvent(`action=bill_other&bill=${BILL}`));

    expect(deps.bills.respond.mock.calls.map((call) => call[2])).toEqual(['confirm', 'decline']);
  });

  // ไม่ส่งไปถึง DB แต่ยังตอบ ผู้ใช้จะได้ไม่เห็นปุ่มที่กดแล้วเงียบ
  it('answers not found for a bill id that is not a UUID without asking the service', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=bill_confirm&bill=x'));

    expect(deps.bills.respond).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', BILL_REPLIES.not_found, undefined);
  });
});

describe('delete wording on saved entries', () => {
  it('says the entry was deleted', () => {
    expect(UNDO_DONE_REPLY).toBe('เฮียลบรายการให้แล้ว');
    expect(UNDO_NOT_FOUND_REPLY).toBe('เฮียไม่พบรายการที่จะลบ อาจถูกลบไปแล้ว');
    expect(UNDO_SAVING_DONE_REPLY).toBe('เฮียลบรายการออมให้แล้ว');
    expect(UNDO_SAVING_NOT_FOUND_REPLY).toBe('เฮียไม่พบรายการออมที่จะลบ อาจถูกลบไปแล้ว');
  });
});

describe('BILL_REPLIES', () => {
  it('uses the agreed wording', () => {
    expect(BILL_REPLIES).toEqual({
      declined: 'เฮียบันทึกว่าคุณปฏิเสธบิลนี้แล้ว',
      cancelled: 'บิลนี้ถูกยกเลิกแล้ว',
      already_confirmed: 'คุณยืนยันบิลนี้ไปแล้ว',
      already_declined: 'คุณปฏิเสธบิลนี้ไปแล้ว',
      not_found: 'เฮียไม่พบบิลนี้',
    });
  });
});

describe('bot loading animation', () => {
  it('shows it for a text message before replying', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.showLoading).toHaveBeenCalledWith('U1');
    expect(deps.showLoading.mock.invocationCallOrder[0]).toBeLessThan(deps.replyText.mock.invocationCallOrder[0]);
  });

  it('shows it for an image message', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(imageEvent());

    expect(deps.showLoading).toHaveBeenCalledWith('U1');
  });

  it('does not show it for a postback or follow event', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));
    await bot.handleEvent(followEvent());

    expect(deps.showLoading).not.toHaveBeenCalled();
  });

  it('does not show it for a group message', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป', { source: { type: 'group', groupId: 'G1' } }));

    expect(deps.showLoading).not.toHaveBeenCalled();
  });

  it('does not show it for a redelivered event that was already claimed', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent({ ...textEvent('กินข้าว 60'), deliveryContext: { isRedelivery: true } });
    await bot.handleEvent({ ...imageEvent(), deliveryContext: { isRedelivery: true } });

    expect(deps.showLoading).not.toHaveBeenCalled();
  });

  it('still replies to an unclaimed redelivered event without the animation', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({ ...textEvent('สรุป'), deliveryContext: { isRedelivery: true } });

    expect(deps.replyText).toHaveBeenCalled();
    expect(deps.showLoading).not.toHaveBeenCalled();
  });

  it('still replies when the animation never settles', async () => {
    const { deps, bot } = setup();
    deps.showLoading.mockReturnValue(new Promise(() => {}));

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.replyText).toHaveBeenCalled();
  });

  it('still replies and logs when the animation fails', async () => {
    const { deps, bot } = setup();
    const failure = new Error('line down');
    deps.showLoading.mockRejectedValue(failure);

    await bot.handleEvent(textEvent('สรุป'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(deps.replyText).toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to show loading animation', { lineUserId: 'U1' }, failure);
  });
});

describe('bot intents', () => {
  const LIFF_URL = 'https://liff.line.me/liff-1';

  function setupIntent(result, overrides = {}) {
    return setup({ parseMessage: vi.fn().mockResolvedValue({ status: 'intent', ...result }), ...overrides });
  }

  it('shows the summary menu for a loose summary request', async () => {
    const { deps, bot } = setupIntent({ intent: 'summary', period: 'menu' });

    await bot.handleEvent(textEvent('สรุปหน่อย'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SUMMARY_MENU_REPLY, SUMMARY_QUICK_REPLY);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('replies the summary card for a named period', async () => {
    const { deps, bot } = setupIntent({ intent: 'summary', period: 'week' });

    await bot.handleEvent(textEvent('สรุปอาทิตย์นี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-28', '2026-09-29');
    expect(deps.replyFlex.mock.calls[0][1].altText).toMatch(/^สรุปสัปดาห์นี้/);
  });

  it('shows the summary menu with a web hint for a period the chat cannot summarize', async () => {
    const { deps, bot } = setupIntent({ intent: 'summary', period: 'other' }, { liffUrl: LIFF_URL });

    await bot.handleEvent(textEvent('สรุปเดือนที่แล้ว'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      `${SUMMARY_MENU_REPLY}\n${SUMMARY_OTHER_PERIOD_HINT}\n${LIFF_URL}?tab=summary`,
      SUMMARY_QUICK_REPLY
    );
  });

  it('shows the help menu', async () => {
    const { deps, bot } = setupIntent({ intent: 'help' });

    await bot.handleEvent(textEvent('ใช้ยังไง'));

    const help = getHelpReply('ช่วยเหลือ');
    expect(deps.replyText).toHaveBeenCalledWith('r1', help.text, help.quickReply);
  });

  it('greets without saving', async () => {
    const { deps, bot } = setupIntent({ intent: 'greeting' });

    await bot.handleEvent(textEvent('สวัสดี'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', GREETING_REPLY, undefined);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('adds a loose saving message to the named open goal', async () => {
    const { deps, bot } = setupIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });

    await bot.handleEvent(textEvent('เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalledWith('user-1', 'g-1', {
      amount: 500,
      occurredOn: '2026-09-29',
      lineEventId: 'ev1',
    });
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('asks for the amount when a loose saving has no valid amount', async () => {
    const { deps, bot } = setupIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: null });

    await bot.handleEvent(textEvent('ออมเข้าเที่ยวญี่ปุ่นหน่อย'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
  });

  it('says there is no open goal for a loose saving', async () => {
    const { deps, bot } = setupIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('เก็บเงินเข้าเป้า เที่ยวญี่ปุ่น 500'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', NO_OPEN_GOAL_REPLY, undefined);
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
  });

  it.each([
    ['delete', 'ลบรายการล่าสุด', `${UNSUPPORTED_REPLIES.delete}\n${LIFF_URL}?tab=list`],
    ['edit', 'แก้เป็น 80', `${UNSUPPORTED_REPLIES.edit}\n${LIFF_URL}?tab=list`],
    ['budget', 'งบเหลือเท่าไหร่', `${UNSUPPORTED_REPLIES.budget}\n${LIFF_URL}?tab=budgets`],
    ['other', 'จองตั๋วให้หน่อย', UNSUPPORTED_REPLIES.other],
    ['web', 'เว็บ', `เปิดหน้าเว็บดูและแก้ไขรายการ: ${LIFF_URL}`],
  ])('points %s requests to what the user can do', async (kind, text, reply) => {
    const { deps, bot } = setupIntent({ intent: 'unsupported', kind }, { liffUrl: LIFF_URL });

    await bot.handleEvent(textEvent(text));

    expect(deps.replyText).toHaveBeenCalledWith('r1', reply, undefined);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('leaves out the link when the LIFF URL is not set', async () => {
    const { deps, bot } = setupIntent({ intent: 'unsupported', kind: 'budget' });

    await bot.handleEvent(textEvent('งบเหลือเท่าไหร่'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', UNSUPPORTED_REPLIES.budget, undefined);
  });

  it('answers a totals question that has no question word', async () => {
    const question = { isQuestion: true, type: 'expense', category: '', keyword: '', from: '2026-09-01', to: '2026-09-29' };
    const { deps, bot } = setupIntent({ intent: 'question' });
    deps.parseQuestion.mockResolvedValue(question);

    await bot.handleEvent(textEvent('ยอดเดือนนี้'));

    expect(deps.parseQuestion).toHaveBeenCalledTimes(1);
    expect(deps.repository.queryTotals).toHaveBeenCalledWith('user-1', question);
    expect(deps.replyFlex).toHaveBeenCalled();
  });

  it('does not ask the question parser twice', async () => {
    const { deps, bot } = setupIntent({ intent: 'question' });

    await bot.handleEvent(textEvent('อะไรเท่าไหร่'));

    expect(deps.parseQuestion).toHaveBeenCalledTimes(1);
    expect(deps.replyText).toHaveBeenCalledWith('r1', DEFAULT_CLARIFY_QUESTION, undefined);
  });

  it('forgets a pending clarification when the user changes the subject', async () => {
    const { deps, bot } = setupIntent({ intent: 'greeting' });
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ข้าว' },
        { role: 'assistant', text: 'ข้าวราคาเท่าไหร่' },
      ],
      updatedAt: new Date(NOW_MS).toISOString(),
    });

    await bot.handleEvent(textEvent('ขอบคุณ'));

    expect(deps.repository.clearPendingClarification).toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', GREETING_REPLY, undefined);
  });
});

describe('bot language switch', () => {
  const MENU_QUICK_REPLY = [
    { type: 'action', action: { type: 'postback', label: 'ภาษาไทย', data: 'action=language&lang=th', displayText: 'ภาษาไทย' } },
    { type: 'action', action: { type: 'postback', label: 'English', data: 'action=language&lang=en', displayText: 'English' } },
  ];
  const usersFor = (resolveUser) => ({ users: { ...setup().deps.users, resolveUser } });
  const withLanguage = (language) => usersFor(vi.fn().mockResolvedValue({ userId: 'user-1', language }));

  it.each(['ภาษา', 'language', 'เปลี่ยนภาษา', 'change language', ' Change  Language '])(
    'answers %j with two language buttons without calling Claude or the rate limiter',
    async (text) => {
      const { deps, bot } = setup();

      await bot.handleEvent(textEvent(text));

      expect(deps.replyText).toHaveBeenCalledWith('r1', 'เลือกภาษาที่อยากให้เฮียใช้', MENU_QUICK_REPLY);
      expect(deps.allowRequest).not.toHaveBeenCalled();
      expect(deps.parseMessage).not.toHaveBeenCalled();
      expect(deps.parseQuestion).not.toHaveBeenCalled();
    }
  );

  it('asks in English for an English user', async () => {
    const { deps, bot } = setup(withLanguage('en'));

    await bot.handleEvent(textEvent('language'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'Pick the language you want me to use', MENU_QUICK_REPLY);
  });

  it('keeps answering the menu when the rate limit is exhausted', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('ภาษา'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'เลือกภาษาที่อยากให้เฮียใช้', MENU_QUICK_REPLY);
  });

  it('switches directly when the user types English', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('english'));

    expect(deps.repository.setUserLanguage).toHaveBeenCalledWith('user-1', 'en');
    expect(deps.replyText).toHaveBeenCalledWith('r1', 'Switched to English. The web app uses English too.', undefined);
    expect(deps.allowRequest).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it('switches directly back to Thai when the user types ภาษาไทย', async () => {
    const { deps, bot } = setup(withLanguage('en'));

    await bot.handleEvent(textEvent('ภาษาไทย'));

    expect(deps.repository.setUserLanguage).toHaveBeenCalledWith('user-1', 'th');
    expect(deps.replyText).toHaveBeenCalledWith('r1', 'เฮียเปลี่ยนเป็นภาษาไทยแล้ว หน้าเว็บก็ใช้ภาษาไทยด้วย', undefined);
  });

  it('does not act on a redelivered language command', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(textEvent('English'));

    expect(deps.repository.setUserLanguage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('switches from the postback button and confirms in the new language', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=language&lang=en'));

    expect(deps.repository.setUserLanguage).toHaveBeenCalledWith('user-1', 'en');
    expect(deps.replyText).toHaveBeenCalledWith('r2', 'Switched to English. The web app uses English too.', undefined);
  });

  it('ignores a language postback with an unknown language', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=language&lang=fr'));
    await bot.handleEvent(postbackEvent('action=language'));

    expect(deps.repository.setUserLanguage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('replies with a failure in the current language and logs when saving fails', async () => {
    const { deps, bot } = setup();
    deps.repository.setUserLanguage.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('English'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'เฮียเปลี่ยนภาษาไม่สำเร็จ ลองใหม่อีกครั้ง', undefined);
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to change language', { userId: 'user-1', language: 'en' }, expect.any(Error));
  });

  it('uses the language resolved for the next message', async () => {
    const resolveUser = vi
      .fn()
      .mockResolvedValueOnce({ userId: 'user-1', language: 'th' })
      .mockResolvedValue({ userId: 'user-1', language: 'en' });
    const { deps, bot } = setup(usersFor(resolveUser));

    await bot.handleEvent(textEvent('English'));
    await bot.handleEvent(textEvent('language', { replyToken: 'r2', eventId: 'ev2' }));

    expect(deps.replyText).toHaveBeenLastCalledWith('r2', 'Pick the language you want me to use', MENU_QUICK_REPLY);
  });

  it.each([
    ['text', () => textEvent('กินข้าว 60')],
    ['language text', () => textEvent('English')],
    ['image', () => imageEvent()],
    ['undo postback', () => postbackEvent('action=undo&event=ev1')],
    ['undo saving postback', () => postbackEvent('action=undo_saving&event=ev1')],
    ['slip save postback', () => postbackEvent(`action=slip_save&slip=${SLIP_ID}`)],
    ['slip cancel postback', () => postbackEvent(`action=slip_cancel&slip=${SLIP_ID}`)],
    ['bill postback', () => postbackEvent('action=bill_confirm&bill=7b1c9d5e-3f2a-4c8b-9a6d-1e2f3a4b5c6d')],
    ['language postback', () => postbackEvent('action=language&lang=en')],
    ['follow', () => followEvent()],
  ])('resolves the user once and never calls ensureUser for a %s event', async (_name, makeEvent) => {
    const { deps, bot } = setup();

    await bot.handleEvent(makeEvent());

    expect(deps.users.resolveUser).toHaveBeenCalledTimes(1);
    expect(deps.users.resolveUser).toHaveBeenCalledWith('U1');
    expect(deps.users.ensureUser).not.toHaveBeenCalled();
  });
});

describe('bot replies in English', () => {
  const LIFF_URL = 'https://liff.line.me/liff-1';
  const BILL = '55555555-5555-5555-5555-555555555555';
  const english = () => vi.fn().mockResolvedValue({ userId: 'user-1', language: 'en' });

  afterEach(() => {
    vi.useRealTimers();
  });

  function deferred() {
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  function setupEn(overrides = {}) {
    const base = setup().deps;
    return setup({ ...overrides, users: { ...base.users, resolveUser: english(), ...overrides.users } });
  }

  function setupEnIntent(result, overrides = {}) {
    return setupEn({ parseMessage: vi.fn().mockResolvedValue({ status: 'intent', ...result }), ...overrides });
  }

  it('says the rate limit in English', async () => {
    const { deps, bot } = setupEn({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('lunch 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', t('en', 'chat.rateLimited'), undefined);
  });

  it('says the system error in English once the user is known', async () => {
    const { deps, bot } = setupEn({ parseMessage: vi.fn().mockRejectedValue(new Error('boom')) });

    await bot.handleEvent(textEvent('lunch 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', t('en', 'chat.systemError'), undefined);
  });

  it('falls back to Thai for the system error when the user cannot be resolved', async () => {
    const { deps, bot } = setupEn({ users: { resolveUser: vi.fn().mockRejectedValue(new Error('db down')) } });

    await bot.handleEvent(textEvent('lunch 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
  });

  it('says the slow message in English at the deadline', async () => {
    vi.useFakeTimers();
    const parse = deferred();
    const { deps, bot } = setupEn({ parseMessage: vi.fn(() => parse.promise), replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('lunch 60'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.replyText).toHaveBeenCalledWith('r1', t('en', 'chat.slowProcessing'), undefined);
    parse.resolve({ status: 'ok', items: [FOOD_ITEM] });
    await vi.advanceTimersByTimeAsync(0);
  });

  it('says the slow message in Thai when the user lookup itself hangs', async () => {
    vi.useFakeTimers();
    const { deps, bot } = setupEn({ users: { resolveUser: vi.fn(() => new Promise(() => {})) }, replyDeadlineMs: 1000 });

    const handled = bot.handleEvent(textEvent('lunch 60'));
    await vi.advanceTimersByTimeAsync(1000);
    await handled;

    expect(deps.replyText).toHaveBeenCalledWith('r1', SLOW_PROCESSING_REPLY, undefined);
  });

  it('answers the undo buttons in English', async () => {
    const { deps, bot } = setupEn();
    deps.repository.deleteGoalContributionsByEvent.mockResolvedValue(0);

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));
    await bot.handleEvent(postbackEvent('action=undo_saving&event=ev1'));

    expect(deps.replyText).toHaveBeenNthCalledWith(1, 'r2', 'Deleted it for you.', undefined);
    expect(deps.replyText).toHaveBeenNthCalledWith(2, 'r2', t('en', 'chat.undoSaving.notFound'), undefined);
  });

  it('confirms a bill share in English with the default category name translated', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}`));

    expect(deps.replyText).toHaveBeenCalledWith('r2', 'Recorded your share of ฿300 under Food.', undefined);
  });

  it('answers the other bill outcomes in English', async () => {
    const { deps, bot } = setupEn();
    deps.bills.respond.mockResolvedValueOnce({ status: 'already_confirmed', title: 'BBQ', share: 200 });
    deps.bills.respond.mockResolvedValueOnce({ status: 'declined' });

    await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}`));
    await bot.handleEvent(postbackEvent(`action=bill_decline&bill=${BILL}`));
    await bot.handleEvent(postbackEvent('action=bill_confirm&bill=nope'));

    expect(deps.replyText).toHaveBeenNthCalledWith(1, 'r2', 'You already confirmed the bill BBQ (your share is ฿200). No need to tap again.', undefined);
    expect(deps.replyText).toHaveBeenNthCalledWith(2, 'r2', t('en', 'chat.bill.declined'), undefined);
    expect(deps.replyText).toHaveBeenNthCalledWith(3, 'r2', "I can't find this bill.", undefined);
  });

  it('answers slip problems in English', async () => {
    const { deps, bot } = setupEn();
    deps.downloadImage.mockResolvedValueOnce({ status: 'too_large' }).mockResolvedValueOnce({ status: 'unsupported' });
    deps.parseSlip.mockResolvedValueOnce({ status: 'unreadable', reason: 'blurry' });

    await bot.handleEvent(imageEvent({ eventId: 'a' }));
    await bot.handleEvent(imageEvent({ eventId: 'b' }));
    await bot.handleEvent(imageEvent({ eventId: 'c' }));

    expect(deps.replyText.mock.calls.map((call) => call[1])).toEqual([
      t('en', 'chat.slip.tooLarge'),
      t('en', 'chat.slip.unsupported'),
      t('en', 'chat.slip.unreadable'),
    ]);
  });

  it('labels the slip buttons in English', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(imageEvent());

    expect(replyFlexOf(deps).quickReply.map((button) => button.action.displayText).sort()).toEqual(['Cancel', 'Save']);
  });

  it('answers slip cancel and expired slips in English', async () => {
    const { deps, bot } = setupEn();
    deps.repository.claimPendingSlip.mockResolvedValueOnce({ webhookEventId: 'ev-img', items: [SLIP_ITEM] }).mockResolvedValueOnce(null);

    await bot.handleEvent(postbackEvent(`action=slip_cancel&slip=${SLIP_ID}`));
    await bot.handleEvent(postbackEvent(`action=slip_save&slip=${SLIP_ID}`));

    expect(deps.replyText).toHaveBeenNthCalledWith(1, 'r2', 'Cancelled the slip. Nothing was saved.', undefined);
    expect(deps.replyText).toHaveBeenNthCalledWith(2, 'r2', t('en', 'chat.slip.expired'), undefined);
  });

  it('shows the summary menu in English with English command buttons', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(textEvent('summary'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'Which period should I sum up?', [
      { type: 'action', action: { type: 'message', label: 'Today', text: 'summary today' } },
      { type: 'action', action: { type: 'message', label: 'This week', text: 'summary this week' } },
      { type: 'action', action: { type: 'message', label: 'This month', text: 'summary this month' } },
    ]);
  });

  it.each(['summary this week', 'สรุปสัปดาห์นี้'])('sums up the week for %j without asking Claude to parse it', async (text) => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(textEvent(text));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-28', '2026-09-29');
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it('takes the English summary command from a Thai user too', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('Summary Today'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-29', '2026-09-29');
  });

  it('answers help with the English help menu', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(textEvent('help'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', t('en', 'help.menu'), expect.any(Array));
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it('saves to a goal with the English save command', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(textEvent('save เที่ยวญี่ปุ่น 1000'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalledWith('user-1', 'g-1', { amount: 1000, occurredOn: '2026-09-29', lineEventId: 'ev1' });
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  it('answers saving problems in English', async () => {
    const { deps, bot } = setupEn();
    deps.repository.addGoalContribution.mockResolvedValueOnce({ status: 'closed' });

    await bot.handleEvent(textEvent('save Condo 1000', { eventId: 'a' }));
    await bot.handleEvent(textEvent('save 1000', { eventId: 'b' }));
    await bot.handleEvent(textEvent('save เที่ยวญี่ปุ่น 0', { eventId: 'c' }));
    await bot.handleEvent(textEvent('save เที่ยวญี่ปุ่น 10', { eventId: 'd' }));

    expect(deps.replyText.mock.calls.map((call) => call[1])).toEqual([
      'I can\'t find the goal "Condo".\nOpen goals: เที่ยวญี่ปุ่น\nType something like: save เที่ยวญี่ปุ่น 1000',
      'Tell me the goal name too, like: save เที่ยวญี่ปุ่น 1000\nOpen goals: เที่ยวญี่ปุ่น',
      t('en', 'goals.savingAmountInvalid'),
      t('en', 'goals.gone'),
    ]);
  });

  it.each([
    [{ intent: 'greeting' }, () => t('en', 'chat.greeting')],
    [{ intent: 'unsupported', kind: 'other' }, () => t('en', 'chat.unsupported.other')],
    [{ intent: 'unsupported', kind: 'budget' }, () => `${t('en', 'chat.unsupported.budget')}\n${LIFF_URL}?tab=budgets`],
    [{ intent: 'unsupported', kind: 'edit' }, () => `${t('en', 'chat.unsupported.edit')}\n${LIFF_URL}?tab=list`],
    [{ intent: 'unsupported', kind: 'web' }, () => t('en', 'menu.webLink', { url: LIFF_URL })],
  ])('answers the intent %j in English', async (result, expected) => {
    const { deps, bot } = setupEnIntent(result, { liffUrl: LIFF_URL });

    await bot.handleEvent(textEvent('something'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', expected(), undefined);
  });

  it('says there is no open goal in English', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'saving', name: 'Trip', amount: 500 });
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('put 500 in my trip goal'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', t('en', 'chat.noOpenGoal'), undefined);
  });

  it('points other summary periods to the web in English', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'summary', period: 'other' }, { liffUrl: LIFF_URL });

    await bot.handleEvent(textEvent('summary for last year'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      `Which period should I sum up?\n${t('en', 'chat.summary.otherPeriodHint')}\n${LIFF_URL}?tab=summary`,
      expect.any(Array)
    );
  });

  it('asks again in English when a question intent cannot be answered', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'question' });

    await bot.handleEvent(textEvent('hmm'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'Tell me again what you want to record and how much, like "lunch 60".', undefined);
  });

  it('says a failed totals question in English', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'question' });
    deps.repository.queryTotals.mockRejectedValue(new Error('db down'));
    deps.parseQuestion.mockResolvedValue({ isQuestion: true, type: 'expense', category: '', keyword: '', from: '2026-09-01', to: '2026-09-29' });

    await bot.handleEvent(textEvent('spending this month'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', t('en', 'chat.questionFailed'), undefined);
  });

  const headerTexts = (flex) => [flex.contents.header.contents[0].text, flex.contents.header.contents[1].text];

  it('replies the saved card in English', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(textEvent('lunch 60'));

    expect(replyFlexOf(deps)).toEqual({
      replyToken: 'r1',
      text: 'Saved it\n- Expense | Food | ฿60 | 29/09 | กินข้าว',
      quickReply: [{ type: 'action', action: { type: 'postback', label: 'Delete this', data: 'action=undo&event=ev1', displayText: 'Delete' } }],
    });
  });

  it('replies the slip card and the saved slip card in English', async () => {
    const { deps, bot } = setupEn();

    await bot.handleEvent(imageEvent());
    await bot.handleEvent(postbackEvent(`action=slip_save&slip=${SLIP_ID}`));

    expect(headerTexts(deps.replyFlex.mock.calls[0][1])).toEqual(['I read the slip · not saved yet', '-฿120']);
    expect(deps.replyFlex.mock.calls[0][1].altText).toMatch(/^Here is what I read from the slip\n- Expense \| Food \| ฿120/);
    expect(deps.replyFlex.mock.calls[1][1].altText).toBe('Saved it\n- Expense | Food | ฿120 | 28/09 | โอนให้ ร้านข้าวแกง');
  });

  it('replies the summary card in English with the no entries comment', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'summary', period: 'today' });
    deps.repository.summarizeTransactions.mockResolvedValue([]);

    await bot.handleEvent(textEvent('summary today'));

    const flex = deps.replyFlex.mock.calls[0][1];
    expect(flex.altText).toBe('Summary: Today (29/09): income ฿0, expense ฿0');
    expect(JSON.stringify(flex.contents.body)).toContain(t('en', 'chat.noEntriesComment'));
  });

  it('replies the totals card in English', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'question' });
    deps.parseQuestion.mockResolvedValue({ isQuestion: true, type: 'expense', category: '', keyword: '', from: '2026-09-01', to: '2026-09-29' });

    await bot.handleEvent(textEvent('spending this month'));

    expect(headerTexts(deps.replyFlex.mock.calls[0][1])).toEqual(['Totals 1-29 Sep 2026', 'Spent ฿450']);
  });

  it('replies the saving card in English', async () => {
    const { deps, bot } = setupEnIntent({ intent: 'saving', name: 'เที่ยวญี่ปุ่น', amount: 500 });

    await bot.handleEvent(textEvent('put 500 into my trip fund'));

    const flex = deps.replyFlex.mock.calls[0][1];
    expect(flex.altText).toBe('Saved ฿500 toward เที่ยวญี่ปุ่น.\nSaved so far: ฿6,000 / ฿50,000 (12%)');
    expect(flex.contents.header.contents[0].text).toBe('Saved toward goal');
  });
});

describe('bot passes the user language to Claude', () => {
  const english = () => ({ users: { ...setup().deps.users, resolveUser: vi.fn().mockResolvedValue({ userId: 'user-1', language: 'en' }) } });

  it('parses a record with the English prompt', async () => {
    const { deps, bot } = setup(english());

    await bot.handleEvent(textEvent('lunch 60'));

    expect(deps.parseMessage).toHaveBeenCalledWith('lunch 60', [], USER_TEXT_CATEGORIES, [], 'en');
  });

  it('reads an English totals question with the English prompt', async () => {
    const { deps, bot } = setup(english());

    await bot.handleEvent(textEvent('how much did I spend this month'));

    expect(deps.parseQuestion).toHaveBeenCalledWith('how much did I spend this month', expect.any(Array), [], 'en');
  });

  it('comments on a summary in English', async () => {
    const { deps, bot } = setup(english());

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.commentSummary).toHaveBeenCalledWith(expect.objectContaining({ expenseTotal: 105 }), 'en');
  });

  it('reads a slip with the English prompt', async () => {
    const { deps, bot } = setup(english());

    await bot.handleEvent(imageEvent());

    expect(deps.parseSlip).toHaveBeenCalledWith({ data: 'QUJD', mediaType: 'image/jpeg' }, 'en');
  });
});
