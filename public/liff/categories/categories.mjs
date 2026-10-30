import { createSvgIcon } from '../ui/icons.mjs';
import { CATEGORY_ICON_KEYS } from './category-icons.mjs';

// ใช้ Map เพราะชื่อหมวดมาจากผู้ใช้ ชื่ออย่าง constructor ต้องไม่หลุดไปเจอ property ของ Object
const CATEGORY_KEYS = new Map([
  ['อาหาร', 'food'],
  ['เดินทาง', 'transport'],
  ['ช้อปปิ้ง', 'shopping'],
  ['บิล/ค่าบริการ', 'bill'],
  ['สุขภาพ', 'health'],
  ['บันเทิง', 'fun'],
  ['เงินเดือน', 'salary'],
  ['รายได้เสริม', 'side'],
  ['ใบเสร็จ/สลิปโอนเงิน', 'receipt'],
  ['อื่นๆ', 'other'],
]);
const TONES = new Set(['expense', 'income']);

export function categoryStyle(name) {
  const key = CATEGORY_KEYS.get(name) ?? 'other';
  return { key, symbol: `cat-${key}`, className: `cat-${key}` };
}

// ไอคอนที่ผู้ใช้เลือกมาก่อน ถ้ายังไม่เลือกหรือไม่รู้จักใช้ไอคอนตั้งต้นตามชื่อหมวด
export function iconKeyFor(name, icon) {
  return CATEGORY_ICON_KEYS.includes(icon) ? icon : categoryStyle(name).key;
}

export function effectiveIconKey(category) {
  return iconKeyFor(category.name, category.icon);
}

// ไอคอนที่เลือกเองไม่บอกว่าเป็นรายรับหรือรายจ่าย จึงให้สีตามประเภทของหมวดเมื่อรู้
export function createCategoryBadge(doc, name, { icon = null, type = null } = {}) {
  const key = iconKeyFor(name, icon);
  const badge = doc.createElement('span');
  badge.className = TONES.has(type) ? `cat-badge cat-${key} cat-tone-${type}` : `cat-badge cat-${key}`;
  badge.append(createSvgIcon(doc, `cat-${key}`));
  return badge;
}
