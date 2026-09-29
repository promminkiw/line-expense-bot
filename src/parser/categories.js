const FALLBACK_CATEGORY = 'อื่นๆ';

// ชุดชั่วคราวจนกว่าขั้นที่ 3 จะย้ายไปตาราง categories ต่อผู้ใช้
const DEFAULT_CATEGORIES = {
  expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', FALLBACK_CATEGORY],
  income: ['เงินเดือน', 'รายได้เสริม', FALLBACK_CATEGORY],
};

function normalizeCategory(type, name) {
  return DEFAULT_CATEGORIES[type].includes(name) ? name : FALLBACK_CATEGORY;
}

module.exports = { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, normalizeCategory };
