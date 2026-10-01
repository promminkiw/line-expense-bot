import { createSvgIcon } from './icons.mjs';

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
  ['อื่นๆ', 'other'],
]);

export function categoryStyle(name) {
  const key = CATEGORY_KEYS.get(name) ?? 'other';
  return { key, symbol: `cat-${key}`, className: `cat-${key}` };
}

export function createCategoryBadge(doc, name) {
  const { symbol, className } = categoryStyle(name);
  const badge = doc.createElement('span');
  badge.className = `cat-badge ${className}`;
  badge.append(createSvgIcon(doc, symbol));
  return badge;
}
