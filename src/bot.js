const { formatSavedReply } = require('./parser/format-reply');
const { toTransactionRows } = require('./db/transaction-rows');

const SYSTEM_ERROR_REPLY = 'ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง';
const RATE_LIMITED_REPLY = 'ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้ง';
const UNDO_DONE_REPLY = 'ยกเลิกรายการแล้ว';
const UNDO_NOT_FOUND_REPLY = 'ไม่พบรายการที่จะยกเลิก อาจถูกยกเลิกไปแล้ว';
const UNDO_ACTION = 'undo';

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

function createBot({ replyText, parseMessage, repository, users, allowRequest, logger = console }) {
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
    const result = await parseMessage(event.message.text);
    if (result.status === 'clarify') {
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
    // รับเฉพาะแชต 1:1 เพราะต้องรู้ว่าบันทึกให้ผู้ใช้คนไหน
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
      await replyText(event.replyToken, reply.text, reply.quickReply);
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
