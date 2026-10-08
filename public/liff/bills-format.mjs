import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

// ตรงกับ src/bills/validate.js ฝั่ง server เพื่อให้ยอดที่หน้าเว็บแบ่งผ่านการตรวจเสมอ
export function toSatang(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  const satang = Math.round(amount * 100);
  return Math.abs(satang - amount * 100) < 1e-6 ? satang : null;
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

// null เมื่อผลจาก server ตรงกับที่กด ไม่ใช่ก็ใช้ข้อความเดียวกับที่บอทตอบใน postback
export function describeBillAnswer(requested, resultStatus) {
  if (resultStatus === 'cancelled') return 'บิลนี้ถูกยกเลิกแล้ว';
  if (requested === 'decline' && resultStatus === 'confirmed') return 'คุณยืนยันบิลนี้ไปแล้ว';
  if (requested === 'confirm' && resultStatus === 'declined') return 'คุณปฏิเสธบิลนี้ไปแล้ว';
  return null;
}

export function buildBillUrl(liffId, billId) {
  return `https://liff.line.me/${liffId}?bill=${billId}`;
}
