import { t, SUPPORTED_LANGUAGES } from './translate.mjs';

// ชื่อใน DB (ไทย) -> id ของ key ใน catalog ต้องตรงกับ DEFAULT_CATEGORIES ใน src/parser/categories.js (มีเทสต์ผูกไว้)
// ใช้ null-prototype กันชื่อที่ผู้ใช้ตั้งเอง เช่น constructor ไปชนกับ prototype ของ Object
const CATEGORY_IDS = {
  expense: {
    อาหาร: 'food',
    เดินทาง: 'travel',
    ช้อปปิ้ง: 'shopping',
    'บิล/ค่าบริการ': 'bills',
    สุขภาพ: 'health',
    บันเทิง: 'entertainment',
    'ใบเสร็จ/สลิปโอนเงิน': 'slip',
    อื่นๆ: 'other',
  },
  income: {
    เงินเดือน: 'salary',
    รายได้เสริม: 'sideIncome',
    อื่นๆ: 'other',
  },
};
const WALLET_IDS = { เงินสด: 'cash' };

export const DEFAULT_CATEGORY_IDS = {
  expense: Object.freeze(Object.assign(Object.create(null), CATEGORY_IDS.expense)),
  income: Object.freeze(Object.assign(Object.create(null), CATEGORY_IDS.income)),
};
export const DEFAULT_WALLET_IDS = Object.freeze(Object.assign(Object.create(null), WALLET_IDS));

// ชื่อหมวด/กระเป๋าตั้งต้นแปลเฉพาะตอนแสดง ชื่อที่ผู้ใช้ตั้งหรือเปลี่ยนเองคืนตามเดิม
export function displayCategoryName(lang, type, name) {
  const id = DEFAULT_CATEGORY_IDS[type]?.[name];
  return id === undefined ? name : t(lang, `category.default.${id}`);
}

export function displayWalletName(lang, name) {
  const id = DEFAULT_WALLET_IDS[name];
  return id === undefined ? name : t(lang, `wallet.default.${id}`);
}

function sameName(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// แปลงชื่อที่ Claude/ผู้ใช้ส่งมา (ชื่อแสดงหรือชื่อ DB) กลับเป็นชื่อใน DB
// ไม่แปลถ้าหมวดตั้งต้นนั้นถูกเปลี่ยนชื่อไปแล้ว (ไม่มีชื่อไทยเดิมใน categories) เพราะชื่อแสดงเดิมไม่มีอยู่จริง
export function categoryNameFromDisplay(lang, type, displayName, categories = null) {
  const owned = categories === null ? null : categories.filter((category) => category.type === type);
  const exact = owned?.find((category) => category.name === displayName);
  if (exact) return exact.name;
  for (const dbName of Object.keys(DEFAULT_CATEGORY_IDS[type] ?? {})) {
    if (owned && !owned.some((category) => category.name === dbName)) continue;
    if (sameName(displayCategoryName(lang, type, dbName), displayName) || sameName(dbName, displayName)) {
      return dbName;
    }
  }
  return displayName;
}

// กัน 2 แถวแสดงชื่อเดียวกัน เช่น ผู้ใช้ตั้งหมวดชื่อ Other ทั้งที่ อื่นๆ แสดงเป็น Other
export function isDefaultDisplayName(name, languages = SUPPORTED_LANGUAGES) {
  const dbNames = [
    ...Object.keys(DEFAULT_CATEGORY_IDS.expense),
    ...Object.keys(DEFAULT_CATEGORY_IDS.income),
    ...Object.keys(DEFAULT_WALLET_IDS),
  ];
  return dbNames.some((dbName) =>
    languages.some((lang) => {
      const type = dbName in DEFAULT_CATEGORY_IDS.income && !(dbName in DEFAULT_CATEGORY_IDS.expense) ? 'income' : 'expense';
      const shown = dbName in DEFAULT_WALLET_IDS ? displayWalletName(lang, dbName) : displayCategoryName(lang, type, dbName);
      return sameName(shown, name);
    }),
  );
}
