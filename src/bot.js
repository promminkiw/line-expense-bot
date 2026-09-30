const { formatSavedReply } = require('./parser/format-reply');
const { toTransactionRows } = require('./db/transaction-rows');
const { parseSummaryCommand } = require('./summary/command');
const { getPeriodRange } = require('./summary/period');
const { buildSummary } = require('./summary/summary');
const { buildSummaryFlex } = require('./summary/flex');
const { getFixedReply } = require('./menu/fixed-replies');
const { budgetMonths, findBudgetAlerts, formatBudgetAlerts } = require('./budget/alerts');

const SYSTEM_ERROR_REPLY = 'ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง';
const RATE_LIMITED_REPLY = 'ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้ง';
const UNDO_DONE_REPLY = 'ยกเลิกรายการแล้ว';
const UNDO_NOT_FOUND_REPLY = 'ไม่พบรายการที่จะยกเลิก อาจถูกยกเลิกไปแล้ว';
const SUMMARY_MENU_REPLY = 'ต้องการสรุปช่วงไหน';
const NO_ENTRIES_COMMENT = 'ยังไม่มีรายการในช่วงนี้';
const SUMMARY_PERIOD_BUTTONS = [
  { label: 'วันนี้', text: 'สรุปวันนี้' },
  { label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' },
  { label: 'เดือนนี้', text: 'สรุปเดือนนี้' },
];
const UNDO_ACTION = 'undo';
// เกิน 10 นาทีถือว่าเป็นเรื่องใหม่ กันไม่ให้ข้อความใหม่ถูกรวมกับคำถามเก่าโดยไม่ตั้งใจ
const PENDING_TTL_MS = 10 * 60 * 1000;
// จำกัดความยาวบทสนทนาที่ส่งให้ Claude เพื่อคุมค่าใช้จ่ายเมื่อผู้ใช้ถูกถามซ้ำหลายรอบ
const MAX_HISTORY_MESSAGES = 6;

function isFromUser(event) {
  return Boolean(event.source && event.source.type === 'user' && event.source.userId);
}

function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function buildUndoQuickReply(webhookEventId) {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: 'ยกเลิก',
        data: new URLSearchParams({ action: UNDO_ACTION, event: webhookEventId }).toString(),
        displayText: 'ยกเลิก',
      },
    },
  ];
}

// ใช้ message action เพื่อให้กดปุ่มแล้วได้ผลเหมือนพิมพ์คำสั่งเอง (Rich Menu ขั้นที่ 5 ใช้ข้อความชุดเดียวกัน)
function buildSummaryQuickReply() {
  return SUMMARY_PERIOD_BUTTONS.map((button) => ({
    type: 'action',
    action: { type: 'message', label: button.label, text: button.text },
  }));
}

function createBot({
  replyText,
  replyFlex,
  parseMessage,
  commentSummary,
  repository,
  users,
  allowRequest,
  liffUrl,
  now = () => Date.now(),
  logger = console,
}) {
  async function loadHistory(userId) {
    const pending = await repository.getPendingClarification(userId);
    if (!pending || now() - Date.parse(pending.updatedAt) > PENDING_TTL_MS) {
      return [];
    }
    return pending.messages;
  }

  // การจำบริบทเป็นตัวช่วย ถ้า DB พังตรงนี้ยังตอบผู้ใช้ตามปกติได้
  async function rememberConversation(userId, messages) {
    try {
      await repository.savePendingClarification(userId, messages);
    } catch (err) {
      logger.error('Failed to save pending clarification', { userId }, err);
    }
  }

  async function forgetConversation(userId) {
    try {
      await repository.clearPendingClarification(userId);
    } catch (err) {
      logger.error('Failed to clear pending clarification', { userId }, err);
    }
  }

  // การเตือนงบเป็นส่วนเสริม ถ้าเช็กไม่ได้ยังตอบว่าบันทึกแล้วตามปกติ
  async function checkBudgets(userId, rows) {
    const months = budgetMonths(rows);
    if (months.length === 0) {
      return '';
    }
    try {
      const statuses = await Promise.all(months.map((month) => repository.getBudgetStatus(userId, month)));
      const statusByMonth = new Map(months.map((month, index) => [month, statuses[index]]));
      return formatBudgetAlerts(findBudgetAlerts(rows, statusByMonth));
    } catch (err) {
      logger.error('Failed to check budgets', { userId }, err);
      return '';
    }
  }

  async function commentOn(summary, userId) {
    if (summary.entryCount === 0) {
      return NO_ENTRIES_COMMENT;
    }
    try {
      return await commentSummary(summary);
    } catch (err) {
      // คำอธิบายเป็นส่วนเสริม ยอดจาก SQL ยังส่งได้แม้ Claude ตอบไม่สำเร็จ
      logger.error('Failed to comment summary', { userId }, err);
      return '';
    }
  }

  async function handleSummary(command, userId) {
    if (command === 'menu') {
      return { text: SUMMARY_MENU_REPLY, quickReply: buildSummaryQuickReply() };
    }
    const range = getPeriodRange(command, new Date(now()));
    const rows = await repository.summarizeTransactions(userId, range.from, range.to);
    const summary = buildSummary(rows, range.label);
    const comment = await commentOn(summary, userId);
    return { flex: buildSummaryFlex(summary, comment) };
  }

  async function handleText(event, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ (redelivery) จึงจอง event ก่อนเพื่อไม่ให้บันทึกซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    // ปุ่มเมนูตอบข้อความคงที่ ไม่เรียก Claude จึงไม่ต้องนับ rate limit
    const fixedReply = getFixedReply(event.message.text, { liffUrl });
    if (fixedReply) {
      return { text: fixedReply };
    }
    if (!allowRequest(lineUserId)) {
      return { text: RATE_LIMITED_REPLY };
    }
    const summaryCommand = parseSummaryCommand(event.message.text);
    if (summaryCommand) {
      return handleSummary(summaryCommand, userId);
    }
    const history = await loadHistory(userId);
    const result = await parseMessage(event.message.text, history);
    if (result.status === 'clarify') {
      const messages = [
        ...history,
        { role: 'user', text: event.message.text },
        { role: 'assistant', text: result.question },
      ].slice(-MAX_HISTORY_MESSAGES);
      await rememberConversation(userId, messages);
      return { text: result.question };
    }
    const categoryIds = await users.loadCategoryIds(userId);
    const rows = toTransactionRows({
      items: result.items,
      categoryIds,
      userId,
      webhookEventId: event.webhookEventId,
    });
    await repository.insertTransactions(rows);
    // ล้างหลังบันทึกสำเร็จ ถ้าบันทึกพังผู้ใช้ส่งคำตอบซ้ำได้โดยบริบทยังอยู่
    if (history.length > 0) {
      await forgetConversation(userId);
    }
    const saved = formatSavedReply(result.items);
    const alerts = await checkBudgets(userId, rows);
    return {
      text: alerts ? `${saved}\n\n${alerts}` : saved,
      quickReply: buildUndoQuickReply(event.webhookEventId),
    };
  }

  async function handleUndo(event, lineUserId) {
    const params = new URLSearchParams(event.postback.data);
    const webhookEventId = params.get('event');
    if (params.get('action') !== UNDO_ACTION || !webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteTransactionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_DONE_REPLY : UNDO_NOT_FOUND_REPLY };
  }

  async function buildReply(event, lineUserId) {
    if (event.type === 'follow') {
      await users.ensureUser(lineUserId);
      return null;
    }
    if (isTextMessage(event)) {
      return handleText(event, lineUserId);
    }
    if (event.type === 'postback') {
      return handleUndo(event, lineUserId);
    }
    return null;
  }

  async function handleEvent(event) {
    // ข้อมูลการเงินเป็นเรื่องส่วนตัว ห้ามตอบลงกลุ่มหรือห้องแชต
    if (!isFromUser(event)) {
      return;
    }
    const lineUserId = event.source.userId;
    let reply;
    try {
      reply = await buildReply(event, lineUserId);
    } catch (err) {
      logger.error('Failed to process event', { lineUserId, eventType: event.type }, err);
      reply = event.type === 'follow' ? null : { text: SYSTEM_ERROR_REPLY };
    }
    if (reply) {
      try {
        if (reply.flex) {
          await replyFlex(event.replyToken, reply.flex);
        } else {
          await replyText(event.replyToken, reply.text, reply.quickReply);
        }
      } catch (err) {
        logger.error('Failed to send reply', { lineUserId, eventType: event.type }, err);
      }
    }
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อ log error ของทุก event ที่พัง (Promise.all จะเก็บแค่ error แรก)
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
};
