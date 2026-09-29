const { formatSavedReply } = require('./parser/format-reply');
const { toTransactionRows } = require('./db/transaction-rows');

const SYSTEM_ERROR_REPLY = 'ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง';
const RATE_LIMITED_REPLY = 'ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้ง';
const UNDO_DONE_REPLY = 'ยกเลิกรายการแล้ว';
const UNDO_NOT_FOUND_REPLY = 'ไม่พบรายการที่จะยกเลิก อาจถูกยกเลิกไปแล้ว';
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

function createBot({
  replyText,
  parseMessage,
  repository,
  users,
  allowRequest,
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

  async function handleText(event, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ (redelivery) จึงจอง event ก่อนเพื่อไม่ให้บันทึกซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    if (!allowRequest(lineUserId)) {
      return { text: RATE_LIMITED_REPLY };
    }
    const history = await loadHistory(userId);
    const result = await parseMessage(event.message.text, history);
    if (result.status === 'clarify') {
      const messages = [
        ...history,
        { role: 'user', text: event.message.text },
        { role: 'assistant', text: result.question },
      ].slice(-MAX_HISTORY_MESSAGES);
      await repository.savePendingClarification(userId, messages);
      return { text: result.question };
    }
    if (history.length > 0) {
      await repository.clearPendingClarification(userId);
    }
    const categoryIds = await users.loadCategoryIds(userId);
    const rows = toTransactionRows({
      items: result.items,
      categoryIds,
      userId,
      webhookEventId: event.webhookEventId,
    });
    await repository.insertTransactions(rows);
    return {
      text: formatSavedReply(result.items),
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
        await replyText(event.replyToken, reply.text, reply.quickReply);
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
};
