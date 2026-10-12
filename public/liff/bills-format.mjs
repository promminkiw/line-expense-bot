import { LOGIN_REQUIRED_MESSAGE, thaiMonthShort } from './format.mjs';

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

// ตรงกับ BILL_LIST_LIMIT ใน src/db/repository.js ครบเท่านี้แปลว่าอาจมีบิลเก่าที่ไม่ได้ส่งมา
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

export function ownedBillSummary(bill) {
  if (bill.status === 'cancelled') return 'ยกเลิกแล้ว';
  const { paid, count } = paidProgress(bill);
  if (count === 0) return 'เพื่อนปฏิเสธทั้งหมด';
  if (paid === count) return 'คืนครบแล้ว';
  return `ค้างรับ · คืนแล้ว ${paid}/${count} คน`;
}

export function incomingBillState(bill) {
  if (bill.status === 'cancelled') return 'ยกเลิกแล้ว';
  if (bill.myStatus === 'declined') return 'ปฏิเสธแล้ว';
  if (bill.myStatus === 'confirmed') return bill.paid ? 'คืนแล้ว' : 'ยังไม่คืน';
  return 'รอคุณตอบ';
}

export function countAwaitingAnswer(incoming) {
  return incoming.filter((bill) => bill.status === 'open' && bill.myStatus === 'pending').length;
}

// ผู้ใช้เลือก: มีบิลรอตอบเปิดหน้าเพื่อนส่งมา ไม่มีก็หน้าฉันสร้าง ยกเว้นยังไม่เคยสร้างบิลแต่มีบิลจากเพื่อน
export function pickInitialBillsView({ incoming, owned }) {
  if (countAwaitingAnswer(incoming) > 0) return 'incoming';
  return owned.length === 0 && incoming.length > 0 ? 'incoming' : 'owned';
}

export function calendarParts(isoDate) {
  return { month: thaiMonthShort(isoDate.slice(0, 7)), day: String(Number(isoDate.slice(8, 10))) };
}

export function needsShareLink(bill) {
  return bill.status === 'open' && bill.members.some((member) => !member.notified && member.status === 'pending');
}

export const MEMBER_STATUS_LABELS = { pending: 'รอตอบ', confirmed: 'ยืนยันแล้ว', declined: 'ปฏิเสธ' };

export function describeBillError(status, action, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (action === 'create') {
    if (status === 400 && error === 'Not friends') return 'มีคนที่ไม่ได้เป็นเพื่อนกันแล้ว โหลดรายชื่อใหม่แล้วลองอีกครั้ง';
    if (status === 400 && error === 'Shares do not add up') return 'ยอดของทุกคนรวมกันไม่เท่ากับยอดบิล';
    if (status === 400) return 'ข้อมูลบิลไม่ถูกต้อง ตรวจชื่อบิล ยอด และวันที่อีกครั้ง';
    if (status === 429) return 'สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่';
    return 'สร้างบิลไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
  if (action === 'respond') return status === 404 ? 'ไม่พบบิลนี้แล้ว' : 'ตอบบิลไม่สำเร็จ ลองใหม่อีกครั้ง';
  if (action === 'cancel') return 'ยกเลิกบิลไม่สำเร็จ ลองใหม่อีกครั้ง';
  if (action === 'paid') return 'บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง';
  return 'โหลดบิลไม่สำเร็จ';
}

const RECEIPT_ERRORS = {
  413: 'รูปใหญ่เกินไป (ไม่เกิน 10 MB)',
  415: 'ไฟล์นี้ไม่ใช่รูปที่อ่านได้ (รองรับ JPEG, PNG, GIF, WebP)',
  422: 'อ่านยอดจากรูปนี้ไม่ได้ ลองรูปที่ชัดขึ้น หรือพิมพ์ยอดเอง',
  429: 'อ่านรูปบ่อยเกินไป รอสักครู่แล้วลองใหม่',
};

export function describeReceiptError(status) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  return RECEIPT_ERRORS[status] || 'อ่านรูปไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์ยอดเอง';
}

const EARLIER_ANSWER_TEXT = {
  cancelled: 'บิลนี้ถูกยกเลิกแล้ว',
  already_confirmed: 'คุณยืนยันบิลนี้ไปแล้ว',
  already_declined: 'คุณปฏิเสธบิลนี้ไปแล้ว',
};

// null เมื่อเป็นคำตอบใหม่ ไม่ใช่ก็ใช้ข้อความเดียวกับที่บอทตอบใน postback
export function describeBillAnswer(resultStatus) {
  return EARLIER_ANSWER_TEXT[resultStatus] || null;
}

export function buildBillUrl(liffId, billId) {
  return `https://liff.line.me/${liffId}?bill=${billId}`;
}
