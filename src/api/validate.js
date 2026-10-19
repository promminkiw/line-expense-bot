const { MAX_AMOUNT } = require('../parser/parse-message');
const { isValidCalendarDate } = require('../utils/date');
const { MAX_CATEGORY_NAME_LENGTH, CATEGORY_ICONS, isReservedCategoryName } = require('../parser/categories');
const { DEFAULT_WALLET_NAME, MAX_WALLET_NAME_LENGTH } = require('../wallets/wallets');
const { NOTIFICATION_SETTINGS } = require('../notifications/settings');

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MAX_NOTE_LENGTH = 200;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function parseMonth(value) {
  const match = MONTH_PATTERN.exec(value || '');
  // จำกัดปีเพราะปีนอกช่วงนี้ทำให้ DB ตอบ 500
  if (!match || Number(match[1]) < MIN_YEAR || Number(match[1]) > MAX_YEAR) {
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
  const value = { amount, categoryId, occurredOn, note: note.trim() };
  // ไม่ส่ง walletId คือไม่เปลี่ยนกระเป๋า หน้าเว็บรุ่นเก่าที่ยังไม่รู้จักกระเป๋าจะได้ไม่ล้างค่าเดิม
  if (body.walletId !== undefined) {
    if (typeof body.walletId !== 'string' || body.walletId.length === 0) {
      return { ok: false, error: 'Invalid wallet' };
    }
    value.walletId = body.walletId;
  }
  return { ok: true, value };
}

function validateRecurringRule(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const { amount, categoryId, dayOfMonth, note, active } = body;
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'Invalid amount' };
  }
  if (typeof categoryId !== 'string' || categoryId.length === 0) {
    return { ok: false, error: 'Invalid category' };
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, error: 'Invalid day' };
  }
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'Invalid note' };
  }
  if (typeof active !== 'boolean') {
    return { ok: false, error: 'Invalid active' };
  }
  return { ok: true, value: { amount, categoryId, dayOfMonth, note: note.trim(), active } };
}

// prompt ของ Claude คั่นชื่อหมวดด้วยจุลภาค และตัวควบคุมทำให้ prompt เพี้ยน จึงไม่รับทั้งสองแบบ
function hasForbiddenNameCharacter(name) {
  return [...name].some((char) => char === ',' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function validateCategoryName(value) {
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid name' };
  }
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_CATEGORY_NAME_LENGTH || hasForbiddenNameCharacter(name)) {
    return { ok: false, error: 'Invalid name' };
  }
  if (isReservedCategoryName(name)) {
    return { ok: false, error: 'Reserved name' };
  }
  return { ok: true, value: name };
}

// null แปลว่ากลับไปใช้ไอคอนตั้งต้นตามชื่อหมวด
function isValidIcon(value) {
  return value === null || CATEGORY_ICONS.includes(value);
}

function validateCategoryCreate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  if (body.type !== 'expense' && body.type !== 'income') {
    return { ok: false, error: 'Invalid type' };
  }
  const name = validateCategoryName(body.name);
  if (!name.ok) return name;
  const value = { type: body.type, name: name.value };
  if (body.icon !== undefined) {
    if (!isValidIcon(body.icon)) {
      return { ok: false, error: 'Invalid icon' };
    }
    value.icon = body.icon;
  }
  return { ok: true, value };
}

function validateCategoryUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const value = {};
  if (body.name !== undefined) {
    const name = validateCategoryName(body.name);
    if (!name.ok) return name;
    value.name = name.value;
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') {
      return { ok: false, error: 'Invalid hidden' };
    }
    value.hidden = body.hidden;
  }
  if (body.icon !== undefined) {
    if (!isValidIcon(body.icon)) {
      return { ok: false, error: 'Invalid icon' };
    }
    value.icon = body.icon;
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'Invalid body' };
  }
  return { ok: true, value };
}

// ชื่อกระเป๋าถูกส่งให้ Claude คั่นด้วยจุลภาคเหมือนชื่อหมวด จึงใช้กฎตัวอักษรเดียวกัน
function validateWalletName(value) {
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid name' };
  }
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_WALLET_NAME_LENGTH || hasForbiddenNameCharacter(name)) {
    return { ok: false, error: 'Invalid name' };
  }
  if (name === DEFAULT_WALLET_NAME) {
    return { ok: false, error: 'Reserved name' };
  }
  return { ok: true, value: name };
}

function validateWalletCreate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const name = validateWalletName(body.name);
  if (!name.ok) return name;
  return { ok: true, value: { name: name.value } };
}

function validateWalletUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const value = {};
  if (body.name !== undefined) {
    const name = validateWalletName(body.name);
    if (!name.ok) return name;
    value.name = name.value;
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') {
      return { ok: false, error: 'Invalid hidden' };
    }
    value.hidden = body.hidden;
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'Invalid body' };
  }
  return { ok: true, value };
}

// รับเฉพาะสวิตช์ที่รู้จัก field อื่นตัดทิ้ง เพื่อไม่ให้ client เขียนคอลัมน์อื่นของ users ได้
function validateSettingsUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const value = {};
  for (const field of Object.keys(NOTIFICATION_SETTINGS)) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') {
      return { ok: false, error: `Invalid ${field}` };
    }
    value[field] = body[field];
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'Invalid body' };
  }
  return { ok: true, value };
}

module.exports = {
  parseMonth,
  isValidAmount,
  validateTransactionUpdate,
  validateRecurringRule,
  validateCategoryCreate,
  validateCategoryUpdate,
  validateWalletCreate,
  validateWalletUpdate,
  validateSettingsUpdate,
};
