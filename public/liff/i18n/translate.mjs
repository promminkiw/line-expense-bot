import th from './messages/th.mjs';
import en from './messages/en.mjs';

export const SUPPORTED_LANGUAGES = ['th', 'en'];
export const DEFAULT_LANGUAGE = 'th';

// export ไว้ให้เทสต์เติม key ชั่วคราวได้ ห้ามแก้จากโค้ดจริง
export const catalogs = { th, en };

const warnedKeys = new Set();

export function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;
}

// ภาษาแอป LINE เช่น en-US ขึ้นต้น en = อังกฤษ อย่างอื่นให้ไทยตามค่าเริ่มต้น
export function languageFromTag(tag) {
  return typeof tag === 'string' && /^en(-|$)/i.test(tag) ? 'en' : DEFAULT_LANGUAGE;
}

function fillParams(text, params) {
  return text.replaceAll(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

export function t(lang, key, params = {}) {
  const language = normalizeLanguage(lang);
  let text = catalogs[language][key];
  if (text === undefined && language !== DEFAULT_LANGUAGE) {
    text = catalogs[DEFAULT_LANGUAGE][key];
    // เตือนครั้งเดียวต่อ key กันล้น log แต่ยังแสดงข้อความไทยแทนที่จะพัง
    if (text !== undefined && !warnedKeys.has(key)) {
      warnedKeys.add(key);
      console.warn(`i18n: missing "${key}" in ${language}, falling back to ${DEFAULT_LANGUAGE}`);
    }
  }
  if (text === undefined) throw new Error(`i18n: missing key "${key}"`);
  return fillParams(text, params);
}

// รูปแบบเดิมของบอท: ตัวเลขแบบ en-US ทั้งสองภาษา ต่างกันที่ template ใน catalog
// ใส่เครื่องหมายลบไว้หน้าสุด ไม่งั้นแม่แบบ en '฿{amount}' จะได้ '฿-300'
export function formatAmount(lang, amount) {
  const text = t(lang, 'common.amount', {
    amount: Math.abs(amount).toLocaleString('en-US', { maximumFractionDigits: 2 }),
  });
  return amount < 0 ? `-${text}` : text;
}

const BUDDHIST_YEAR_OFFSET = 543;

function displayYear(lang, year) {
  return normalizeLanguage(lang) === 'th' ? year + BUDDHIST_YEAR_OFFSET : year;
}

function monthName(lang, month, short) {
  return t(lang, `common.month.${short ? 'short' : 'full'}.${month}`);
}

export function formatMonth(lang, yearMonth, { short = false } = {}) {
  const [year, month] = yearMonth.split('-').map(Number);
  return `${monthName(lang, month, short)} ${displayYear(lang, year)}`;
}

export function formatDate(lang, isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${day} ${monthName(lang, month, true)} ${displayYear(lang, year)}`;
}
