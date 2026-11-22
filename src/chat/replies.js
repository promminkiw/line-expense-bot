const { buildSavedFlex } = require('../parser/saved-flex');
const { t } = require('../i18n');

// ค่าไทยคงไว้ให้โมดูลและเทสต์ที่ยังไม่ส่งภาษา handler ที่รู้ภาษาผู้ใช้ต้องเรียก t(lang, key) เอง
const SYSTEM_ERROR_REPLY = t('th', 'chat.systemError');
const SLOW_PROCESSING_REPLY = t('th', 'chat.slowProcessing');
const RATE_LIMITED_REPLY = t('th', 'chat.rateLimited');
const QUESTION_FAILED_REPLY = t('th', 'chat.questionFailed');
const UNDO_DONE_REPLY = t('th', 'chat.undo.done');
const UNDO_NOT_FOUND_REPLY = t('th', 'chat.undo.notFound');
const UNDO_SAVING_DONE_REPLY = t('th', 'chat.undoSaving.done');
const UNDO_SAVING_NOT_FOUND_REPLY = t('th', 'chat.undoSaving.notFound');
// สถานะจาก DB ใช้ snake_case ส่วน key ของชุดแปลเป็น camelCase
const BILL_STATUS_KEYS = {
  declined: 'chat.bill.declined',
  cancelled: 'chat.bill.cancelled',
  already_confirmed: 'chat.bill.alreadyConfirmed',
  already_declined: 'chat.bill.alreadyDeclined',
  not_found: 'chat.bill.notFound',
};
const BILL_REPLIES = Object.fromEntries(Object.entries(BILL_STATUS_KEYS).map(([status, key]) => [status, t('th', key)]));
const SUMMARY_MENU_REPLY = t('th', 'chat.summary.menu');
const SUMMARY_OTHER_PERIOD_HINT = t('th', 'chat.summary.otherPeriodHint');
const GREETING_REPLY = t('th', 'chat.greeting');
const NO_OPEN_GOAL_REPLY = t('th', 'chat.noOpenGoal');
// คำสั่งที่ยังไม่มีในแชต ตอบทางที่ทำได้จริง ไม่ทำเหมือนหารายการไม่เจอ
const UNSUPPORTED_KINDS = ['delete', 'edit', 'budget', 'other'];
const UNSUPPORTED_REPLIES = Object.fromEntries(UNSUPPORTED_KINDS.map((kind) => [kind, t('th', `chat.unsupported.${kind}`)]));
const SLIP_UNREADABLE_REPLY = t('th', 'chat.slip.unreadable');
const SLIP_TOO_LARGE_REPLY = t('th', 'chat.slip.tooLarge');
const SLIP_UNSUPPORTED_REPLY = t('th', 'chat.slip.unsupported');
const SLIP_EXPIRED_REPLY = t('th', 'chat.slip.expired');
const SLIP_CANCELLED_REPLY = t('th', 'chat.slip.cancelled');
const SLIP_SAVE_ACTION = 'slip_save';
const SLIP_CANCEL_ACTION = 'slip_cancel';
const SUMMARY_PERIODS = ['today', 'week', 'month'];
const UNDO_ACTION = 'undo';
const UNDO_SAVING_ACTION = 'undo_saving';

function billStatusReply(lang, status) {
  return t(lang, BILL_STATUS_KEYS[status] ?? BILL_STATUS_KEYS.not_found);
}

function withLink(text, url) {
  return url ? `${text}\n${url}` : text;
}

function postbackButton(label, data) {
  return { type: 'action', action: { type: 'postback', label, data: new URLSearchParams(data).toString(), displayText: label } };
}

function buildUndoQuickReply(webhookEventId, lang = 'th') {
  return [postbackButton(t(lang, 'chat.button.delete'), { action: UNDO_ACTION, event: webhookEventId })];
}

function buildUndoSavingQuickReply(webhookEventId, lang = 'th') {
  return [postbackButton(t(lang, 'chat.button.delete'), { action: UNDO_SAVING_ACTION, event: webhookEventId })];
}

function buildSavedReply(items, budget, webhookEventId, editUrls, { walletReadFailed = false, lang = 'th' } = {}) {
  return buildSavedFlex(items, {
    alerts: budget.alerts,
    budgetCheckFailed: budget.failed,
    walletReadFailed,
    buttons: buildUndoQuickReply(webhookEventId, lang),
    editUrls,
    lang,
  });
}

function buildSlipQuickReply(slipId, lang = 'th') {
  return [
    postbackButton(t(lang, 'chat.button.save'), { action: SLIP_SAVE_ACTION, slip: slipId }),
    postbackButton(t(lang, 'chat.button.cancel'), { action: SLIP_CANCEL_ACTION, slip: slipId }),
  ];
}

// ใช้ message action เพื่อให้กดปุ่มแล้วได้ผลเหมือนพิมพ์คำสั่งเอง (Rich Menu ขั้นที่ 5 ใช้ข้อความชุดเดียวกัน)
function buildSummaryQuickReply(lang = 'th') {
  return SUMMARY_PERIODS.map((period) => ({
    type: 'action',
    action: { type: 'message', label: t(lang, `summary.period.${period}`), text: t(lang, `summary.command.${period}`) },
  }));
}

module.exports = {
  SYSTEM_ERROR_REPLY,
  SLOW_PROCESSING_REPLY,
  RATE_LIMITED_REPLY,
  QUESTION_FAILED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  UNDO_SAVING_DONE_REPLY,
  UNDO_SAVING_NOT_FOUND_REPLY,
  BILL_REPLIES,
  SUMMARY_MENU_REPLY,
  SUMMARY_OTHER_PERIOD_HINT,
  GREETING_REPLY,
  NO_OPEN_GOAL_REPLY,
  UNSUPPORTED_REPLIES,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_SAVE_ACTION,
  SLIP_CANCEL_ACTION,
  UNDO_ACTION,
  UNDO_SAVING_ACTION,
  billStatusReply,
  buildUndoQuickReply,
  buildUndoSavingQuickReply,
  buildSavedReply,
  buildSlipQuickReply,
  buildSummaryQuickReply,
  withLink,
};
