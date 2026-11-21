const { t } = require('../i18n');

// หน้าเว็บ (public/liff/app.mjs) มีชุดเดียวกันของตัวเอง เพราะเป็น ES module ที่ไม่มี build step แชร์กับ CommonJS ไม่ได้
// ค่าไทยคงไว้ให้ผู้เรียกที่ยังไม่ส่งภาษา เช่น CSV
const TYPE_LABELS = { expense: t('th', 'type.expense'), income: t('th', 'type.income') };

function typeLabel(lang, type) {
  return t(lang, `type.${type}`);
}

module.exports = { TYPE_LABELS, typeLabel };
