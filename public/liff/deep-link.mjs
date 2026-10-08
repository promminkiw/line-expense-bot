import { normalizeFriendCodeInput } from './friends-format.mjs';

// id ของรายการเป็น UUID จึงรับเฉพาะตัวอักษรที่ UUID ใช้ ไม่ให้ค่าแปลกๆ จากลิงก์เข้าไปใน flow แก้ไข
const ID_PATTERN = /^[0-9A-Za-z-]{1,64}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function isRealDate(text) {
  const match = DATE_PATTERN.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// หลัง login LINE ห่อพารามิเตอร์เดิมไว้ใน liff.state
function readLinkParams(search) {
  const params = new URLSearchParams(search);
  const state = params.get('liff.state');
  if (!state) return params;
  return new URLSearchParams(state.includes('?') ? state.slice(state.indexOf('?') + 1) : state);
}

// ลิงก์จากการ์ดในแชตคือ ?tx=<id>&d=<วันที่>
export function parseEditLink(search) {
  const params = readLinkParams(search);
  const id = params.get('tx');
  if (!id || !ID_PATTERN.test(id)) return null;
  const date = params.get('d');
  return { id, date: date && isRealDate(date) ? date : null };
}

// ลิงก์ชวนเพื่อนคือ ?friend=<รหัส>
export function parseFriendLink(search) {
  return normalizeFriendCodeInput(readLinkParams(search).get('friend'));
}
