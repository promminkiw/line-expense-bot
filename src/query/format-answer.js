const { typeLabel } = require('../utils/type-labels');
const { displayCategoryName } = require('../parser/categories');
const { displayWalletName } = require('../wallets/wallets');
const { t, formatAmount, formatDate } = require('../i18n');

// ใช้ formatDate ของชุดแปลเพื่อให้ชื่อเดือนและปี (พ.ศ./ค.ศ.) ตรงกับที่อื่น ชื่อเดือนย่อไม่มีช่องว่างจึงแยกด้วยช่องว่างได้
function splitDate(lang, isoDate) {
  const [day, month, year] = formatDate(lang, isoDate).split(' ');
  return { day, month, year };
}

// ตัดเดือนและปีที่ซ้ำออก ให้อ่านง่ายเหมือนที่คนเขียนช่วงวันที่
function formatDateRange(lang, from, to) {
  const start = splitDate(lang, from);
  const end = splitDate(lang, to);
  const endText = `${end.day} ${end.month} ${end.year}`;
  if (from === to) return endText;
  if (start.year !== end.year) return `${start.day} ${start.month} ${start.year} - ${endText}`;
  if (start.month !== end.month) return `${start.day} ${start.month} - ${endText}`;
  return `${start.day}-${endText}`;
}

// คำถามแบบ both ไม่บอกชนิดของหมวด จึงลองแปลแบบรายจ่ายก่อนแล้วค่อยรายรับ
function displayQuestionCategory(lang, question) {
  if (question.type !== 'both') return displayCategoryName(lang, question.type, question.category);
  const asExpense = displayCategoryName(lang, 'expense', question.category);
  return asExpense !== question.category ? asExpense : displayCategoryName(lang, 'income', question.category);
}

function formatEntryCount(lang, count) {
  if (count === 0) return t(lang, 'query.noEntries');
  return t(lang, count === 1 ? 'query.entries.one' : 'query.entries.other', { count });
}

function describeTotal(type, rows, lang) {
  const row = rows.find((item) => item.type === type);
  const total = row ? row.total : 0;
  const count = row ? row.entryCount : 0;
  return t(lang, 'query.answer.total', { type: typeLabel(lang, type), amount: formatAmount(lang, total), entries: formatEntryCount(lang, count) });
}

function formatTotalsAnswer(question, rows, lang = 'th') {
  const scope = [t(lang, 'query.answer.range', { range: formatDateRange(lang, question.from, question.to) })];
  if (question.category) scope.push(t(lang, 'query.answer.category', { category: displayQuestionCategory(lang, question) }));
  if (question.wallet) scope.push(t(lang, 'query.answer.wallet', { wallet: displayWalletName(lang, question.wallet) }));
  if (question.keyword) scope.push(t(lang, 'query.answer.keyword', { keyword: question.keyword }));
  const types = question.type === 'both' ? ['income', 'expense'] : [question.type];
  return `${scope.join(' ')}: ${types.map((type) => describeTotal(type, rows, lang)).join(', ')}`;
}

module.exports = { formatDateRange, formatTotalsAnswer, formatEntryCount, displayQuestionCategory };
