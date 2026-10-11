import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

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
