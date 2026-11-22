const { BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } = require('../bills/flex');
const { t, formatAmount } = require('../i18n');
const { displayCategoryName } = require('../parser/categories');
const { UUID_PATTERN } = require('../utils/uuid');
const { LANGUAGE_ACTION } = require('./language');
const {
  billStatusReply,
  SLIP_SAVE_ACTION,
  SLIP_CANCEL_ACTION,
  UNDO_ACTION,
  UNDO_SAVING_ACTION,
} = require('./replies');

function createPostbackHandlers({ repository, bills, slip, language }) {
  const { handleSlipSave, handleSlipCancel } = slip;

  async function handleUndo(params, { userId, lang }) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const deleted = await repository.deleteTransactionsByEvent(userId, webhookEventId);
    return { text: t(lang, deleted > 0 ? 'chat.undo.done' : 'chat.undo.notFound') };
  }

  async function handleUndoSaving(params, { userId, lang }) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const deleted = await repository.deleteGoalContributionsByEvent(userId, webhookEventId);
    return { text: t(lang, deleted > 0 ? 'chat.undoSaving.done' : 'chat.undoSaving.notFound') };
  }

  // การ์ดบิลอาจถูกกดซ้ำหรือกดอีกปุ่มทีหลัง จึงตอบตามสถานะที่ DB คืนมาเสมอ
  async function handleBillAnswer(params, { userId, lang }, answer) {
    const result = await bills.respond(userId, params.get('bill'), answer);
    if (result.status === 'confirmed') {
      // ส่วนแบ่งบิลบันทึกเป็นรายจ่ายเสมอ
      const category = displayCategoryName(lang, 'expense', result.categoryName);
      return { text: t(lang, 'chat.bill.confirmed', { amount: formatAmount(lang, result.share), category }) };
    }
    // การ์ดเก่าแก้ไม่ได้ เมื่อตอบไปแล้ว (เช่นในเว็บ) จึงบอกชื่อบิลให้รู้ว่าไม่ต้องกดอีก
    if (result.status === 'already_confirmed' && result.title) {
      return { text: t(lang, 'chat.bill.alreadyConfirmedTitled', { title: result.title, amount: formatAmount(lang, result.share) }) };
    }
    if (result.status === 'already_declined' && result.title) {
      return { text: t(lang, 'chat.bill.alreadyDeclinedTitled', { title: result.title }) };
    }
    return { text: billStatusReply(lang, result.status) };
  }

  async function handlePostback(event, user) {
    const params = new URLSearchParams(event.postback.data);
    const action = params.get('action');
    if (action === LANGUAGE_ACTION) {
      return language.handlePostback(params, user);
    }
    if (action === UNDO_ACTION) {
      return handleUndo(params, user);
    }
    if (action === UNDO_SAVING_ACTION) {
      return handleUndoSaving(params, user);
    }
    if (action === SLIP_SAVE_ACTION || action === SLIP_CANCEL_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('slip') || '')) {
        return null;
      }
      return action === SLIP_SAVE_ACTION
        ? handleSlipSave(event, params, user)
        : handleSlipCancel(event, params, user);
    }
    if (action === BILL_CONFIRM_ACTION || action === BILL_DECLINE_ACTION) {
      // id ที่ไม่ใช่ UUID ทำให้ Postgres error จึงตอบว่าไม่พบโดยไม่ส่งไปถึง DB
      if (!UUID_PATTERN.test(params.get('bill') || '')) {
        return { text: billStatusReply(user.lang, 'not_found') };
      }
      return handleBillAnswer(params, user, action === BILL_CONFIRM_ACTION ? 'confirm' : 'decline');
    }
    return null;
  }

  return { handlePostback };
}

module.exports = { createPostbackHandlers };
