const { formatAmount } = require('../parser/format-reply');
const { TYPE_LABELS } = require('../utils/type-labels');

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function splitDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { day, month: THAI_MONTHS[month - 1], year: year + 543 };
}

// ตัดเดือนและปีที่ซ้ำออก ให้อ่านง่ายเหมือนที่คนไทยเขียนช่วงวันที่
function formatThaiRange(from, to) {
  const start = splitDate(from);
  const end = splitDate(to);
  const endText = `${end.day} ${end.month} ${end.year}`;
  if (from === to) return endText;
  if (start.year !== end.year) return `${start.day} ${start.month} ${start.year} - ${endText}`;
  if (start.month !== end.month) return `${start.day} ${start.month} - ${endText}`;
  return `${start.day}-${endText}`;
}

function describeTotal(type, rows) {
  const row = rows.find((item) => item.type === type);
  const total = row ? row.total : 0;
  const count = row ? row.entryCount : 0;
  return `${TYPE_LABELS[type]} ${formatAmount(total)} บาท (${count > 0 ? `${count} รายการ` : 'ไม่มีรายการ'})`;
}

function formatTotalsAnswer(question, rows) {
  const scope = [`ช่วง ${formatThaiRange(question.from, question.to)}`];
  if (question.category) scope.push(`หมวด ${question.category}`);
  if (question.keyword) scope.push(`คำว่า "${question.keyword}"`);
  const types = question.type === 'both' ? ['income', 'expense'] : [question.type];
  return `${scope.join(' ')}: ${types.map((type) => describeTotal(type, rows)).join(', ')}`;
}

module.exports = { formatThaiRange, formatTotalsAnswer };
