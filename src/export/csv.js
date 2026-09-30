const HEADER = ['วันที่', 'ประเภท', 'หมวด', 'จำนวนเงิน', 'โน้ต'];
const { TYPE_LABELS } = require('../utils/type-labels');
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

function buildTransactionsCsv(rows) {
  const lines = [
    HEADER,
    ...rows.map((row) => [row.occurredOn, TYPE_LABELS[row.type], row.categoryName, row.amount.toFixed(2), row.note || '']),
  ];
  return `${BOM}${lines.map((cells) => cells.map(escapeCell).join(',')).join('\r\n')}\r\n`;
}

function exportFileName(month) {
  return `transactions-${month}.csv`;
}

module.exports = { buildTransactionsCsv, exportFileName };
