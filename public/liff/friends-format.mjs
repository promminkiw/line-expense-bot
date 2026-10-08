import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

// ตรงกับ FRIEND_CODE_PATTERN ฝั่ง server ตรวจซ้ำที่นี่เพื่อบอกผู้ใช้ได้ทันทีโดยไม่ต้องยิง request
const FRIEND_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{8}$/;

export const INVALID_CODE_MESSAGE = 'รหัสเพื่อนต้องเป็นตัวอักษรหรือตัวเลข 8 ตัว';
export const OWN_CODE_MESSAGE = 'นี่คือรหัสของคุณเอง ส่งรหัสนี้ให้เพื่อนแทน';

export function normalizeFriendCodeInput(text) {
  if (typeof text !== 'string') return null;
  const code = text.replace(/[\s-]/g, '').toUpperCase();
  return FRIEND_CODE_PATTERN.test(code) ? code : null;
}

export function formatFriendCode(code) {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function buildInviteUrl(liffId, code) {
  return `https://liff.line.me/${liffId}?friend=${code}`;
}

export function buildInviteMessage(url) {
  return `มาเป็นเพื่อนกันในบอทบันทึกรายรับรายจ่าย จะได้หารบิลกันง่ายๆ กดลิงก์นี้ได้เลย ${url}`;
}

export function describeFriendError(status, action) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (action === 'add') {
    if (status === 400) return INVALID_CODE_MESSAGE;
    if (status === 404) return 'ไม่พบรหัสเพื่อนนี้ อาจพิมพ์ผิดหรือเพื่อนเปลี่ยนรหัสแล้ว';
    if (status === 429) return 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่';
    return 'เพิ่มเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
  if (action === 'remove') return 'ลบเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง';
  if (action === 'renew') return 'เปลี่ยนรหัสไม่สำเร็จ ลองใหม่อีกครั้ง';
  return 'โหลดรายชื่อเพื่อนไม่สำเร็จ';
}
