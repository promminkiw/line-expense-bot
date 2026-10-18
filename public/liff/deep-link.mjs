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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ลิงก์บิลจากการ์ดหรือที่เจ้าของส่งให้คือ ?bill=<id>
export function parseBillLink(search) {
  const id = readLinkParams(search).get('bill');
  return id && UUID_PATTERN.test(id) ? id : null;
}

// ลิงก์จาก Rich Menu คือ ?tab=<id> รับเฉพาะแท็บที่มีอยู่จริง
export function parseTabLink(search, tabIds) {
  const id = readLinkParams(search).get('tab');
  return id && tabIds.includes(id) ? id : null;
}

// หน้าหารบิลแยกเปิดจาก ?tab=bills ของ Rich Menu หรือลิงก์บิล ลิงก์ชวนเพื่อนยังไปเว็บหลัก
export function isBillsPageLink(search) {
  if (parseFriendLink(search)) return false;
  return Boolean(parseBillLink(search) || parseTabLink(search, ['bills']));
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEARCH_MAX_LENGTH = 50;

// ลิงก์จากการ์ดตอบยอดคือ ?tab=list&m=<เดือน>&q=<คำค้น>&type=<ประเภท> ค่าที่ไม่ถูกต้องถูกข้ามเป็นค่าว่าง
export function parseListLink(search) {
  const params = readLinkParams(search);
  const month = params.get('m');
  const type = params.get('type');
  const link = {
    month: month && MONTH_PATTERN.test(month) ? month : '',
    query: (params.get('q') || '').trim().slice(0, SEARCH_MAX_LENGTH),
    type: type === 'expense' || type === 'income' ? type : '',
  };
  return link.month || link.query || link.type ? link : null;
}
