const { MAX_AMOUNT } = require('../parser/parse-message');
const { isValidCalendarDate } = require('../utils/date');

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MAX_NOTE_LENGTH = 200;

function parseMonth(value) {
  const match = MONTH_PATTERN.exec(value || '');
  if (!match) {
    return null;
  }
  // วันที่ 0 ของเดือนถัดไปคือวันสุดท้ายของเดือนที่ต้องการ
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}` };
}

function isValidAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return false;
  }
  // คอลัมน์ numeric(12,2) เก็บได้แค่สตางค์ จึงไม่รับทศนิยมละเอียดกว่านั้น
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

function validateTransactionUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const { amount, categoryId, occurredOn, note } = body;
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'Invalid amount' };
  }
  if (typeof categoryId !== 'string' || categoryId.length === 0) {
    return { ok: false, error: 'Invalid category' };
  }
  if (!isValidCalendarDate(occurredOn)) {
    return { ok: false, error: 'Invalid date' };
  }
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'Invalid note' };
  }
  return { ok: true, value: { amount, categoryId, occurredOn, note: note.trim() } };
}

module.exports = { parseMonth, isValidAmount, validateTransactionUpdate };
