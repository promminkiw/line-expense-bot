const FALLBACK_CATEGORY = 'อื่นๆ';
// บอทใส่หมวดนี้ให้รายจ่ายที่อ่านจากรูปสลิปเอง Claude ไม่ได้เลือก
const SLIP_CATEGORY = 'ใบเสร็จ/สลิปโอนเงิน';

// หมวดที่สร้างให้ผู้ใช้ทุกคน
const DEFAULT_CATEGORIES = {
  expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', SLIP_CATEGORY, FALLBACK_CATEGORY],
  income: ['เงินเดือน', 'รายได้เสริม', FALLBACK_CATEGORY],
};

// หมวดที่ให้ Claude เลือกสำหรับข้อความที่พิมพ์ เมื่อไม่รู้หมวดของผู้ใช้
const TEXT_CATEGORIES = {
  expense: DEFAULT_CATEGORIES.expense.filter((name) => name !== SLIP_CATEGORY),
  income: DEFAULT_CATEGORIES.income,
};

// โค้ดอ้างหมวดเหล่านี้ด้วยชื่อ จึงห้ามผู้ใช้เปลี่ยนชื่อหรือซ่อน
const SYSTEM_CATEGORIES = {
  expense: [SLIP_CATEGORY, FALLBACK_CATEGORY],
  income: [FALLBACK_CATEGORY],
};

// ทุกหมวดที่ไม่ซ่อนถูกส่งให้ Claude ในทุกข้อความ จึงจำกัดความยาวชื่อและจำนวน
const MAX_CATEGORY_NAME_LENGTH = 30;
const MAX_VISIBLE_CATEGORIES = 30;
// หมวดที่ซ่อนก็ยังถูกอ่านทุกครั้ง และแถวที่ไม่จำกัดจะชนเพดาน max rows ของ PostgREST
const MAX_TOTAL_CATEGORIES = 100;

// ไอคอนที่ผู้ใช้เลือกให้หมวดได้ ต้องตรงกับ public/liff/category-icons.mjs (มีเทสต์ผูกไว้)
const CATEGORY_ICONS = [
  'food', 'coffee', 'shopping', 'grocery', 'clothes', 'beauty', 'pet', 'gift',
  'bill', 'home', 'electric', 'water', 'internet', 'phone', 'insurance', 'tax',
  'transport', 'car', 'fuel', 'travel', 'health', 'medicine', 'fitness', 'family',
  'fun', 'game', 'music', 'education', 'donation', 'receipt', 'other',
  'salary', 'side', 'savings', 'bonus', 'sale',
];

function isSystemCategory(type, name) {
  return Object.hasOwn(SYSTEM_CATEGORIES, type) && SYSTEM_CATEGORIES[type].includes(name);
}

function isReservedCategoryName(name) {
  return name === FALLBACK_CATEGORY || name === SLIP_CATEGORY;
}

function toTextCategories(categories) {
  const pick = (type) => {
    const names = categories
      .filter((category) => category.type === type && !category.hidden && category.name !== SLIP_CATEGORY)
      .map((category) => category.name);
    // อื่นๆ ต้องมีเสมอ เพราะเป็นหมวดสำรองเมื่อไม่มีหมวดไหนตรง
    return names.includes(FALLBACK_CATEGORY) ? names : [...names, FALLBACK_CATEGORY];
  };
  return { expense: pick('expense'), income: pick('income') };
}

// ชื่อหมวดที่ผู้ใช้ตั้งเองอาจเป็นเรื่องส่วนตัว จึงให้คนอื่นเห็นเฉพาะชื่อมาตรฐาน
function shareableCategoryName(name) {
  return DEFAULT_CATEGORIES.expense.includes(name) ? name : '';
}

function normalizeCategory(type, name, categories = TEXT_CATEGORIES) {
  return categories[type].includes(name) ? name : FALLBACK_CATEGORY;
}

module.exports = {
  DEFAULT_CATEGORIES,
  TEXT_CATEGORIES,
  SYSTEM_CATEGORIES,
  FALLBACK_CATEGORY,
  SLIP_CATEGORY,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_VISIBLE_CATEGORIES,
  MAX_TOTAL_CATEGORIES,
  CATEGORY_ICONS,
  isSystemCategory,
  isReservedCategoryName,
  shareableCategoryName,
  toTextCategories,
  normalizeCategory,
};
