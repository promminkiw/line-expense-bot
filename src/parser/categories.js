const FALLBACK_CATEGORY = 'อื่นๆ';
// บอทใส่หมวดนี้ให้รายจ่ายที่อ่านจากรูปสลิปเอง Claude ไม่ได้เลือก
const SLIP_CATEGORY = 'ใบเสร็จ/สลิปโอนเงิน';

// หมวดที่สร้างให้ผู้ใช้ทุกคน
const DEFAULT_CATEGORIES = {
  expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', SLIP_CATEGORY, FALLBACK_CATEGORY],
  income: ['เงินเดือน', 'รายได้เสริม', FALLBACK_CATEGORY],
};

// หมวดที่ให้ Claude เลือกสำหรับข้อความที่พิมพ์
const TEXT_CATEGORIES = {
  expense: DEFAULT_CATEGORIES.expense.filter((name) => name !== SLIP_CATEGORY),
  income: DEFAULT_CATEGORIES.income,
};

function normalizeCategory(type, name) {
  return TEXT_CATEGORIES[type].includes(name) ? name : FALLBACK_CATEGORY;
}

module.exports = { DEFAULT_CATEGORIES, TEXT_CATEGORIES, FALLBACK_CATEGORY, SLIP_CATEGORY, normalizeCategory };
