import { loginRequiredMessage, thaiMonthShort } from '../format.mjs';
import { t } from '../i18n/translate.mjs';
import { getLang } from '../i18n/current.mjs';

// ตรงกับ src/bills/validate.js ฝั่ง server เพื่อให้ยอดที่หน้าเว็บแบ่งผ่านการตรวจเสมอ
export function toSatang(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  const satang = Math.round(amount * 100) + 0;
  // ทศนิยมลอยตัวคลาดได้ไม่กี่ ulp ตามขนาดตัวเลข เกณฑ์คงที่จะยอมยอดอย่าง 1.0000000001 ได้
  const tolerance = Math.max(1, Math.abs(amount * 100)) * Number.EPSILON * 4;
  return Math.abs(satang - amount * 100) <= tolerance ? satang : null;
}

export function splitEvenly(totalSatang, count) {
  const base = Math.floor(totalSatang / count);
  return { base, remainder: totalSatang - base * count };
}

// เศษสตางค์ให้เจ้าของบิล ตามที่ตกลงไว้
export function buildEqualShares(total, memberCount) {
  const totalSatang = toSatang(total);
  if (!totalSatang || memberCount < 1) return null;
  const { base, remainder } = splitEvenly(totalSatang, memberCount + 1);
  return { ownerShare: (base + remainder) / 100, memberShare: base / 100 };
}

export function sumShortfall(total, ownerShare, shares) {
  const sum = [ownerShare, ...shares].reduce((acc, amount) => acc + (toSatang(amount) ?? 0), 0);
  return ((toSatang(total) ?? 0) - sum) / 100;
}

// บิลที่ยกเลิกแล้ว คนที่ยังไม่ตอบไม่ต้องจ่าย เหลือแค่คนที่ยืนยันไปแล้ว
export function outstandingAmount(bill) {
  const owing = bill.members.filter(
    (member) => !member.paid && (member.status === 'confirmed' || (member.status === 'pending' && bill.status === 'open'))
  );
  return owing.reduce((sum, member) => sum + Math.round(member.share * 100), 0) / 100;
}

// ตรงกับ BILL_LIST_LIMIT ใน src/db/domains/bills.js ครบเท่านี้แปลว่าอาจมีบิลเก่าที่ไม่ได้ส่งมา
export const BILL_LIST_LIMIT = 50;

// คนที่ต้องจ่าย: ไม่รวมคนที่ปฏิเสธ และคนที่ไม่ได้ตอบบิลที่ยกเลิกแล้ว
function payers(bill) {
  return bill.members.filter((member) => member.status === 'confirmed' || (member.status === 'pending' && bill.status === 'open'));
}

export function paidProgress(bill) {
  const list = payers(bill);
  return { paid: list.filter((member) => member.paid).length, count: list.length };
}

export function isOwnedBillFinished(bill) {
  return bill.status === 'cancelled' || outstandingAmount(bill) === 0;
}

// บิลถูกยกเลิกหลังยืนยัน รายจ่ายไม่ถูกลบตาม ผู้ใช้ต้องลบเอง ไม่มีค่าก็ถือว่ายังอยู่เพื่อไม่ให้ข้อความเตือนหาย
export function needsExpenseCleanup(bill) {
  return bill.status === 'cancelled' && bill.myStatus === 'confirmed' && bill.expenseRecorded !== false;
}

export function isIncomingBillFinished(bill) {
  if (needsExpenseCleanup(bill)) return false;
  return bill.status === 'cancelled' || bill.myStatus === 'declined' || (bill.myStatus === 'confirmed' && bill.paid);
}

export function ownedBillSummary(bill, lang = getLang()) {
  if (bill.status === 'cancelled') return t(lang, 'web.bills.state.cancelled');
  const { paid, count } = paidProgress(bill);
  if (count === 0) return t(lang, 'web.bills.state.allDeclined');
  if (paid === count) return t(lang, 'web.bills.state.allPaid');
  return t(lang, 'web.bills.state.owed', { paid, count });
}

export function incomingBillState(bill, lang = getLang()) {
  if (bill.status === 'cancelled') return t(lang, 'web.bills.state.cancelled');
  if (bill.myStatus === 'declined') return t(lang, 'web.bills.state.declined');
  if (bill.myStatus === 'confirmed') return t(lang, bill.paid ? 'web.bills.state.paid' : 'web.bills.state.unpaid');
  return t(lang, 'web.bills.state.awaiting');
}

export function countAwaitingAnswer(incoming) {
  return incoming.filter((bill) => bill.status === 'open' && bill.myStatus === 'pending').length;
}

// ผู้ใช้เลือก: มีบิลรอตอบเปิดหน้าเพื่อนส่งมา ไม่มีก็หน้าฉันสร้าง ยกเว้นยังไม่เคยสร้างบิลแต่มีบิลจากเพื่อน
export function pickInitialBillsView({ incoming, owned }) {
  if (countAwaitingAnswer(incoming) > 0) return 'incoming';
  return owned.length === 0 && incoming.length > 0 ? 'incoming' : 'owned';
}

export function calendarParts(isoDate, lang = getLang()) {
  return { month: thaiMonthShort(isoDate.slice(0, 7), lang), day: String(Number(isoDate.slice(8, 10))) };
}

export function needsShareLink(bill) {
  return bill.status === 'open' && bill.members.some((member) => !member.notified && member.status === 'pending');
}

const MEMBER_STATUSES = ['pending', 'confirmed', 'declined'];

export function memberStatusLabel(status, lang = getLang()) {
  return t(lang, `web.bills.member.${status}`);
}

// ค่าไทยตั้งต้นคงไว้ให้ผู้ใช้เดิมของ export นี้ หน้าเว็บใช้ memberStatusLabel ตามภาษาที่เปิดอยู่
export const MEMBER_STATUS_LABELS = Object.fromEntries(MEMBER_STATUSES.map((status) => [status, memberStatusLabel(status, 'th')]));

const CREATE_ERRORS = { 'Not friends': 'web.bills.error.notFriends', 'Shares do not add up': 'web.bills.error.sharesMismatch' };

function billErrorKey(status, action, error) {
  if (action === 'create') {
    if (status === 400) return CREATE_ERRORS[error] ?? 'web.bills.error.invalid';
    return status === 429 ? 'web.bills.error.createTooFast' : 'web.bills.error.createFailed';
  }
  if (action === 'respond') return status === 404 ? 'web.bills.error.gone' : 'web.bills.error.respondFailed';
  if (action === 'cancel') return 'web.bills.error.cancelFailed';
  if (action === 'paid') return 'web.bills.error.paidFailed';
  return 'web.bills.error.loadFailed';
}

export function describeBillError(status, action, error, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  return t(lang, billErrorKey(status, action, error));
}

const RECEIPT_ERRORS = {
  413: 'web.bills.receipt.tooLarge',
  415: 'web.bills.receipt.unsupported',
  422: 'web.bills.receipt.unreadable',
  429: 'web.bills.receipt.tooFast',
};

export function describeReceiptError(status, lang = getLang()) {
  if (status === 401) return loginRequiredMessage(lang);
  return t(lang, RECEIPT_ERRORS[status] || 'web.bills.receipt.failed');
}

// key เดียวกับที่บอทตอบใน postback ข้อความในเว็บกับในแชตจึงตรงกันทุกภาษา
const EARLIER_ANSWER_KEYS = {
  cancelled: 'chat.bill.cancelled',
  already_confirmed: 'chat.bill.alreadyConfirmed',
  already_declined: 'chat.bill.alreadyDeclined',
};

// null เมื่อเป็นคำตอบใหม่
export function describeBillAnswer(resultStatus, lang = getLang()) {
  const key = EARLIER_ANSWER_KEYS[resultStatus];
  return key ? t(lang, key) : null;
}

export function buildBillUrl(liffId, billId) {
  return `https://liff.line.me/${liffId}?bill=${billId}`;
}
