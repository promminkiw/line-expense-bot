const { BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } = require('../bills/flex');
const { formatAmount } = require('../parser/format-reply');
const { UUID_PATTERN } = require('../utils/uuid');
const {
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  UNDO_SAVING_DONE_REPLY,
  UNDO_SAVING_NOT_FOUND_REPLY,
  BILL_REPLIES,
  SLIP_SAVE_ACTION,
  SLIP_CANCEL_ACTION,
  UNDO_ACTION,
  UNDO_SAVING_ACTION,
} = require('./replies');

function createPostbackHandlers({ repository, users, bills, slip }) {
  const { handleSlipSave, handleSlipCancel } = slip;

  async function handleUndo(params, lineUserId) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteTransactionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_DONE_REPLY : UNDO_NOT_FOUND_REPLY };
  }

  async function handleUndoSaving(params, lineUserId) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteGoalContributionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_SAVING_DONE_REPLY : UNDO_SAVING_NOT_FOUND_REPLY };
  }

  // การ์ดบิลอาจถูกกดซ้ำหรือกดอีกปุ่มทีหลัง จึงตอบตามสถานะที่ DB คืนมาเสมอ
  async function handleBillAnswer(params, lineUserId, answer) {
    const userId = await users.ensureUser(lineUserId);
    const result = await bills.respond(userId, params.get('bill'), answer);
    if (result.status === 'confirmed') {
      return { text: `เฮียบันทึกส่วนของคุณ ${formatAmount(result.share)} บาท ในหมวด ${result.categoryName} แล้ว` };
    }
    // การ์ดเก่าแก้ไม่ได้ เมื่อตอบไปแล้ว (เช่นในเว็บ) จึงบอกชื่อบิลให้รู้ว่าไม่ต้องกดอีก
    if (result.status === 'already_confirmed' && result.title) {
      return { text: `คุณยืนยันบิล ${result.title} ไปแล้ว (ส่วนของคุณ ${formatAmount(result.share)} บาท) ไม่ต้องกดอีก` };
    }
    if (result.status === 'already_declined' && result.title) {
      return { text: `คุณปฏิเสธบิล ${result.title} ไปแล้ว ไม่ต้องกดอีก` };
    }
    return { text: BILL_REPLIES[result.status] || BILL_REPLIES.not_found };
  }

  async function handlePostback(event, lineUserId) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    if (action === UNDO_ACTION) {
      return handleUndo(params, lineUserId);
    }
    if (action === UNDO_SAVING_ACTION) {
      return handleUndoSaving(params, lineUserId);
    }
    if (action === SLIP_SAVE_ACTION || action === SLIP_CANCEL_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('slip') || '')) {
        return null;
      }
      return action === SLIP_SAVE_ACTION
        ? handleSlipSave(event, params, lineUserId)
        : handleSlipCancel(event, params, lineUserId);
    }
    if (action === BILL_CONFIRM_ACTION || action === BILL_DECLINE_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงตอบว่าไม่พบโดยไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('bill') || '')) {
        return { text: BILL_REPLIES.not_found };
      }
      return handleBillAnswer(params, lineUserId, action === BILL_CONFIRM_ACTION ? 'confirm' : 'decline');
    }
    return null;
  }

  return { handlePostback };
}

module.exports = { createPostbackHandlers };
