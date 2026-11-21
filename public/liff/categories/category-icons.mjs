import { t } from '../i18n/translate.mjs';

// ลำดับคือลำดับในตารางเลือกไอคอน ต้องตรงกับ CATEGORY_ICONS ใน src/parser/categories.js (มีเทสต์ผูกไว้)
const ICON_KEYS = [
  'food',
  'coffee',
  'shopping',
  'grocery',
  'clothes',
  'beauty',
  'pet',
  'gift',
  'bill',
  'home',
  'electric',
  'water',
  'internet',
  'phone',
  'insurance',
  'tax',
  'transport',
  'car',
  'fuel',
  'travel',
  'health',
  'medicine',
  'fitness',
  'family',
  'fun',
  'game',
  'music',
  'education',
  'donation',
  'receipt',
  'other',
  'salary',
  'side',
  'savings',
  'bonus',
  'sale',
];

export function categoryIconLabel(lang, key) {
  return t(lang, `web.categories.icon.${key}`);
}

// label ไทยคงไว้ให้ที่เดิมที่อ่าน CATEGORY_ICONS ส่วนหน้าเว็บอ่านตามภาษาด้วย categoryIconLabel
export const CATEGORY_ICONS = ICON_KEYS.map((key) => ({ key, label: categoryIconLabel('th', key) }));

export const CATEGORY_ICON_KEYS = CATEGORY_ICONS.map((icon) => icon.key);
