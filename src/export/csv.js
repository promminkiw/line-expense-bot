const { t } = require('../i18n');
const { typeLabel } = require('../utils/type-labels');
const { displayCategoryName } = require('../parser/categories');

const HEADER_KEYS = ['date', 'type', 'category', 'amount', 'note'];
// BOM ทำให้ Excel เปิดไฟล์เป็น UTF-8 และแสดงภาษาไทยถูก
const BOM = '\ufeff';
// ข้อความที่ขึ้นต้นด้วยอักขระเหล่านี้ spreadsheet อาจรันเป็นสูตร (CSV injection)
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(value) {
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ภาษาของผู้ export ใช้กับหัวคอลัมน์ ประเภท และชื่อหมวดตั้งต้น ส่วนหมวดที่ตั้งเองและโน้ตคงตามที่พิมพ์
function buildTransactionsCsv(rows, lang = 'th') {
  const lines = [
    HEADER_KEYS.map((key) => t(lang, `export.header.${key}`)),
    ...rows.map((row) => [
      row.occurredOn,
      typeLabel(lang, row.type),
      displayCategoryName(lang, row.type, row.categoryName),
      row.amount.toFixed(2),
      row.note || '',
    ]),
  ];
  return `${BOM}${lines.map((cells) => cells.map(escapeCell).join(',')).join('\r\n')}\r\n`;
}

function exportFileName(month) {
  return `transactions-${month}.csv`;
}

module.exports = { buildTransactionsCsv, exportFileName };
