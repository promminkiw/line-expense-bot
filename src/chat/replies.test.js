import { describe, it, expect } from 'vitest';
import { t } from '../i18n/index.js';
import {
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  BILL_REPLIES,
  UNSUPPORTED_REPLIES,
  billStatusReply,
  buildUndoQuickReply,
  buildUndoSavingQuickReply,
  buildSlipQuickReply,
  buildSummaryQuickReply,
} from './replies.js';

// ข้อความไทยต้องเหมือนค่าเดิมก่อนย้ายเข้าชุดแปลทุกตัวอักษร
const REPLIES = [
  [
    'chat.systemError',
    'เฮียขออภัย ระบบมีปัญหา ถ้าจดรายการไว้ ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ขอสรุป หรือถามยอด ลองใหม่อีกครั้ง',
    "Sorry, something broke on my end. If you recorded something, check the web app before sending it again. If you sent a slip photo, asked for a summary or asked about totals, try again.",
  ],
  [
    'chat.slowProcessing',
    'เฮียตอบช้ากว่าปกติ ถ้าจดรายการหรือกดบันทึกไว้ รายการอาจถูกบันทึกแล้ว ตรวจในหน้าเว็บก่อนส่งซ้ำ ถ้าส่งรูปสลิป ลองส่งใหม่อีกครั้ง',
    "I'm slower than usual right now. If you recorded something or tapped save, it may already be saved, so check the web app before sending it again. If you sent a slip photo, try sending it again.",
  ],
  ['chat.rateLimited', 'ส่งข้อความถี่เกินไป เฮียตามไม่ทัน รอสักครู่แล้วลองใหม่อีกครั้ง', "You're sending messages too fast for me to keep up. Wait a moment and try again."],
  [
    'chat.questionFailed',
    'ตอนนี้เฮียตอบคำถามยอดไม่ได้ ลองใหม่ภายหลัง หรือดูยอดในหน้าเว็บ ถ้าตั้งใจจดรายการ ลองพิมพ์ใหม่โดยไม่มีคำว่า เท่าไหร่',
    "I can't answer questions about totals right now. Try again later or check your totals in the web app. If you meant to record something, type it again without \"how much\".",
  ],
  ['chat.undo.done', 'เฮียลบรายการให้แล้ว', 'Deleted it for you.'],
  ['chat.undo.notFound', 'เฮียไม่พบรายการที่จะลบ อาจถูกลบไปแล้ว', "I can't find anything to delete. It may already be gone."],
  ['chat.undoSaving.done', 'เฮียลบรายการออมให้แล้ว', 'Deleted the saving entry for you.'],
  ['chat.undoSaving.notFound', 'เฮียไม่พบรายการออมที่จะลบ อาจถูกลบไปแล้ว', "I can't find a saving entry to delete. It may already be gone."],
  ['chat.bill.declined', 'เฮียบันทึกว่าคุณปฏิเสธบิลนี้แล้ว', 'Got it, I noted that you declined this bill.'],
  ['chat.bill.cancelled', 'บิลนี้ถูกยกเลิกแล้ว', 'This bill was cancelled.'],
  ['chat.bill.alreadyConfirmed', 'คุณยืนยันบิลนี้ไปแล้ว', 'You already confirmed this bill.'],
  ['chat.bill.alreadyDeclined', 'คุณปฏิเสธบิลนี้ไปแล้ว', 'You already declined this bill.'],
  ['chat.bill.notFound', 'เฮียไม่พบบิลนี้', "I can't find this bill."],
  ['chat.summary.menu', 'อยากให้เฮียสรุปช่วงไหน', 'Which period should I sum up?'],
  [
    'chat.summary.otherPeriodHint',
    'ในแชตเฮียสรุปได้แค่ วันนี้ สัปดาห์นี้ เดือนนี้ ช่วงอื่นดูได้ในหน้าเว็บ แท็บ สรุป',
    'In chat I can only sum up today, this week or this month. For other periods, check the Summary tab in the web app.',
  ],
  [
    'chat.greeting',
    'เฮียพร้อมจดให้ พิมพ์รายการได้เลย เช่น "กินข้าว 60" หรือพิมพ์ ช่วยเหลือ เพื่อดูวิธีใช้',
    'Ready when you are. Just type an entry, like "lunch 60", or type help to see how I work.',
  ],
  ['chat.noOpenGoal', 'ยังไม่มีเป้าออมที่เปิดอยู่ สร้างเป้าได้ในหน้าเว็บ แท็บ ออม', "You don't have an open saving goal yet. Create one in the Savings tab of the web app."],
  [
    'chat.unsupported.delete',
    'ลบรายการได้จากปุ่ม ลบรายการนี้ บนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ',
    'You can delete an entry with the delete button on the card I sent you, or in the List tab of the web app.',
  ],
  [
    'chat.unsupported.edit',
    'แก้รายการได้โดยแตะรายการบนการ์ดที่เฮียส่งให้ หรือในหน้าเว็บ แท็บ รายการ',
    'You can edit an entry by tapping it on the card I sent you, or in the List tab of the web app.',
  ],
  ['chat.unsupported.budget', 'ดูงบคงเหลือได้ในหน้าเว็บ แท็บ งบ', 'Check what is left of your budget in the Budget tab of the web app.'],
  ['chat.unsupported.other', 'เรื่องนี้เฮียยังทำในแชตไม่ได้ พิมพ์ ช่วยเหลือ เพื่อดูสิ่งที่เฮียทำได้', "I can't do that in chat yet. Type help to see what I can do."],
  ['chat.noEntriesComment', 'ช่วงนี้เฮียยังไม่เห็นรายการเลย', "I haven't seen any entries for this period yet."],
  [
    'chat.slip.unreadable',
    'เฮียอ่านยอดจากรูปนี้ไม่ได้ ลองส่งรูปสลิปที่ชัดขึ้น หรือพิมพ์เองก็ได้ เช่น "กินข้าว 60"',
    `I can't read an amount from this image. Try a clearer slip photo, or just type it, like "lunch 60".`,
  ],
  ['chat.slip.tooLarge', 'รูปใหญ่เกินไปสำหรับเฮีย (ไม่เกิน 3.5 MB) ลองส่งใหม่หรือย่อรูปก่อน', 'This image is too big for me (3.5 MB max). Try sending it again or shrink it first.'],
  ['chat.slip.unsupported', 'ไฟล์นี้ไม่ใช่รูปที่เฮียอ่านได้ (รองรับ JPEG, PNG, GIF, WebP)', "This file isn't an image I can read (JPEG, PNG, GIF and WebP work)."],
  [
    'chat.slip.expired',
    'รายการนี้ถูกบันทึกหรือยกเลิกไปแล้ว หรือหมดเวลายืนยัน (10 นาที) ส่งสลิปให้เฮียใหม่ได้เลย',
    'This one was already saved or cancelled, or the confirm window (10 minutes) ran out. Just send me the slip again.',
  ],
  ['chat.slip.cancelled', 'เฮียยกเลิกสลิปให้แล้ว ไม่ได้บันทึกรายการ', 'Cancelled the slip. Nothing was saved.'],
];

describe('chat replies', () => {
  it.each(REPLIES)('%s keeps the Thai text and has the English one', (key, th, en) => {
    expect(t('th', key)).toBe(th);
    expect(t('en', key)).toBe(en);
  });

  it('keeps the Thai constants for callers not yet translated', () => {
    expect(SYSTEM_ERROR_REPLY).toBe(REPLIES[0][1]);
    expect(RATE_LIMITED_REPLY).toBe(REPLIES[2][1]);
    expect(BILL_REPLIES.not_found).toBe('เฮียไม่พบบิลนี้');
    expect(UNSUPPORTED_REPLIES.budget).toBe('ดูงบคงเหลือได้ในหน้าเว็บ แท็บ งบ');
  });

  it('answers each bill status in the user language and falls back to not found', () => {
    expect(billStatusReply('th', 'already_declined')).toBe('คุณปฏิเสธบิลนี้ไปแล้ว');
    expect(billStatusReply('en', 'already_confirmed')).toBe('You already confirmed this bill.');
    expect(billStatusReply('en', 'cancelled')).toBe('This bill was cancelled.');
    expect(billStatusReply('en', 'weird')).toBe("I can't find this bill.");
  });

  it('bill confirmations show the amount and category in the user language', () => {
    expect(t('th', 'chat.bill.confirmed', { amount: '300 บาท', category: 'อาหาร' })).toBe('เฮียบันทึกส่วนของคุณ 300 บาท ในหมวด อาหาร แล้ว');
    expect(t('en', 'chat.bill.confirmed', { amount: '฿300', category: 'Food' })).toBe('Recorded your share of ฿300 under Food.');
    expect(t('th', 'chat.bill.alreadyConfirmedTitled', { title: 'หมูกระทะ', amount: '300 บาท' })).toBe(
      'คุณยืนยันบิล หมูกระทะ ไปแล้ว (ส่วนของคุณ 300 บาท) ไม่ต้องกดอีก'
    );
    expect(t('en', 'chat.bill.alreadyConfirmedTitled', { title: 'BBQ', amount: '฿300' })).toBe(
      'You already confirmed the bill BBQ (your share is ฿300). No need to tap again.'
    );
    expect(t('th', 'chat.bill.alreadyDeclinedTitled', { title: 'หมูกระทะ' })).toBe('คุณปฏิเสธบิล หมูกระทะ ไปแล้ว ไม่ต้องกดอีก');
    expect(t('en', 'chat.bill.alreadyDeclinedTitled', { title: 'BBQ' })).toBe('You already declined the bill BBQ. No need to tap again.');
  });
});

describe('chat quick replies', () => {
  it('label the undo buttons in the user language but keep the postback data', () => {
    expect(buildUndoQuickReply('ev1')[0].action).toEqual({ type: 'postback', label: 'ลบ', data: 'action=undo&event=ev1', displayText: 'ลบ' });
    expect(buildUndoQuickReply('ev1', 'en')[0].action).toEqual({ type: 'postback', label: 'Delete', data: 'action=undo&event=ev1', displayText: 'Delete' });
    expect(buildUndoSavingQuickReply('ev1', 'en')[0].action).toEqual({
      type: 'postback',
      label: 'Delete',
      data: 'action=undo_saving&event=ev1',
      displayText: 'Delete',
    });
  });

  it('label the slip buttons in the user language', () => {
    expect(buildSlipQuickReply('s1').map((button) => button.action.label)).toEqual(['บันทึก', 'ยกเลิก']);
    expect(buildSlipQuickReply('s1', 'en').map((button) => button.action)).toEqual([
      { type: 'postback', label: 'Save', data: 'action=slip_save&slip=s1', displayText: 'Save' },
      { type: 'postback', label: 'Cancel', data: 'action=slip_cancel&slip=s1', displayText: 'Cancel' },
    ]);
  });

  it('send the summary command in the user language', () => {
    expect(buildSummaryQuickReply().map((button) => button.action)).toEqual([
      { type: 'message', label: 'วันนี้', text: 'สรุปวันนี้' },
      { type: 'message', label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' },
      { type: 'message', label: 'เดือนนี้', text: 'สรุปเดือนนี้' },
    ]);
    expect(buildSummaryQuickReply('en').map((button) => button.action)).toEqual([
      { type: 'message', label: 'Today', text: 'summary today' },
      { type: 'message', label: 'This week', text: 'summary this week' },
      { type: 'message', label: 'This month', text: 'summary this month' },
    ]);
  });
});
