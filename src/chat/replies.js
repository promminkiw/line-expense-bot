const { buildSavedFlex } = require('../parser/saved-flex');

const SYSTEM_ERROR_REPLY = 'เฮียขออภัย ระบบมีปัญหา ถ้าจดรายการไว้ ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ขอสรุป หรือถามยอด ลองใหม่อีกครั้ง';
const SLOW_PROCESSING_REPLY =
  'เฮียตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง';
const RATE_LIMITED_REPLY = 'ส่งข้อความถี่เกินไป เฮียตามไม่ทัน รอสักครู่แล้วลองใหม่อีกครั้ง';
const QUESTION_FAILED_REPLY = 'ตอนนี้เฮียตอบคำถามยอดไม่ได้ ลองใหม่ภายหลัง หรือดูยอดในหน้าเว็บ ถ้าตั้งใจจดรายการ ลองพิมพ์ใหม่โดยไม่มีคำว่า เท่าไหร่';
const UNDO_DONE_REPLY = 'เฮียลบรายการให้แล้ว';
const UNDO_NOT_FOUND_REPLY = 'เฮียไม่พบรายการที่จะลบ อาจถูกลบไปแล้ว';
const UNDO_SAVING_DONE_REPLY = 'เฮียลบรายการออมให้แล้ว';
const UNDO_SAVING_NOT_FOUND_REPLY = 'เฮียไม่พบรายการออมที่จะลบ อาจถูกลบไปแล้ว';
const BILL_REPLIES = {
  declined: 'เฮียบันทึกว่าคุณปฏิเสธบิลนี้แล้ว',
  cancelled: 'บิลนี้ถูกยกเลิกแล้ว',
  already_confirmed: 'คุณยืนยันบิลนี้ไปแล้ว',
  already_declined: 'คุณปฏิเสธบิลนี้ไปแล้ว',
  not_found: 'เฮียไม่พบบิลนี้',
};
const SUMMARY_MENU_REPLY = 'อยากให้เฮียสรุปช่วงไหน';
const SUMMARY_OTHER_PERIOD_HINT = 'ในแชตเฮียสรุปได้แค่ วันนี้ สัปดาห์นี้ เดือนนี้ ช่วงอื่นดูได้ในหน้าเว็บ แท็บ สรุป';
const GREETING_REPLY = 'เฮียพร้อมจดให้ พิมพ์รายการได้เลย เช่น "กินข้าว 60" หรือพิมพ์ ช่วยเหลือ เพื่อดูวิธีใช้';
const NO_OPEN_GOAL_REPLY = 'ยังไม่มีเป้าออมที่เปิดอยู่ สร้างเป้าได้ในหน้าเว็บ แท็บ ออม';
// คำสั่งที่ยังไม่มีในแชต ตอบทางที่ทำได้จริง ไม่ทำเหมือนหารายการไม่เจอ
const UNSUPPORTED_REPLIES = {
  delete: 'ลบรายการได้จากปุ่ม ลบรายการนี้ บนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ',
  edit: 'แก้รายการได้โดยแตะรายการบนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ',
  budget: 'ดูงบคงเหลือได้ในหน้าเว็บ แท็บ งบ',
  other: 'เรื่องนี้เฮียยังทำในแชตไม่ได้ พิมพ์ ช่วยเหลือ เพื่อดูสิ่งที่เฮียทำได้',
};
const NO_ENTRIES_COMMENT = 'ช่วงนี้เฮียยังไม่เห็นรายการเลย';
const SLIP_UNREADABLE_REPLY = 'เฮียอ่านยอดจากรูปนี้ไม่ได้ ลองส่งรูปสลิปที่ชัดขึ้น หรือพิมพ์เองก็ได้ เช่น "กินข้าว 60"';
const SLIP_TOO_LARGE_REPLY = 'รูปใหญ่เกินไปสำหรับเฮีย (ไม่เกิน 3.5 MB) ลองส่งใหม่หรือย่อรูปก่อน';
const SLIP_UNSUPPORTED_REPLY = 'ไฟล์นี้ไม่ใช่รูปที่เฮียอ่านได้ (รองรับ JPEG, PNG, GIF, WebP)';
const SLIP_EXPIRED_REPLY = 'รายการนี้ถูกบันทึกหรือยกเลิกไปแล้ว หรือหมดเวลายืนยัน (10 นาที) ส่งสลิปให้เฮียใหม่ได้เลย';
const SLIP_CANCELLED_REPLY = 'เฮียยกเลิกสลิปให้แล้ว ไม่ได้บันทึกรายการ';
const SLIP_SAVE_ACTION = 'slip_save';
const SLIP_CANCEL_ACTION = 'slip_cancel';
const SUMMARY_PERIOD_BUTTONS = [
  { label: 'วันนี้', text: 'สรุปวันนี้' },
  { label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' },
  { label: 'เดือนนี้', text: 'สรุปเดือนนี้' },
];
const UNDO_ACTION = 'undo';
const UNDO_SAVING_ACTION = 'undo_saving';

function withLink(text, url) {
  return url ? `${text}\n${url}` : text;
}

function buildUndoQuickReply(webhookEventId) {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: 'ลบ',
        data: new URLSearchParams({ action: UNDO_ACTION, event: webhookEventId }).toString(),
        displayText: 'ลบ',
      },
    },
  ];
}

function buildUndoSavingQuickReply(webhookEventId) {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: 'ลบ',
        data: new URLSearchParams({ action: UNDO_SAVING_ACTION, event: webhookEventId }).toString(),
        displayText: 'ลบ',
      },
    },
  ];
}

function buildSavedReply(items, budget, webhookEventId, editUrls, { walletReadFailed = false } = {}) {
  return buildSavedFlex(items, {
    alerts: budget.alerts,
    budgetCheckFailed: budget.failed,
    walletReadFailed,
    buttons: buildUndoQuickReply(webhookEventId),
    editUrls,
  });
}

function buildSlipQuickReply(slipId) {
  const button = (label, action) => ({
    type: 'action',
    action: {
      type: 'postback',
      label,
      data: new URLSearchParams({ action, slip: slipId }).toString(),
      displayText: label,
    },
  });
  return [button('บันทึก', SLIP_SAVE_ACTION), button('ยกเลิก', SLIP_CANCEL_ACTION)];
}

// ใช้ message action เพื่อให้กดปุ่มแล้วได้ผลเหมือนพิมพ์คำสั่งเอง (Rich Menu ขั้นที่ 5 ใช้ข้อความชุดเดียวกัน)
function buildSummaryQuickReply() {
  return SUMMARY_PERIOD_BUTTONS.map((button) => ({
    type: 'action',
    action: { type: 'message', label: button.label, text: button.text },
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
  NO_ENTRIES_COMMENT,
  SLIP_UNREADABLE_REPLY,
  SLIP_TOO_LARGE_REPLY,
  SLIP_UNSUPPORTED_REPLY,
  SLIP_EXPIRED_REPLY,
  SLIP_CANCELLED_REPLY,
  SLIP_SAVE_ACTION,
  SLIP_CANCEL_ACTION,
  UNDO_ACTION,
  UNDO_SAVING_ACTION,
  buildUndoQuickReply,
  buildUndoSavingQuickReply,
  buildSavedReply,
  buildSlipQuickReply,
  buildSummaryQuickReply,
  withLink,
};
