const { COLORS, row, baht } = require('../summary/flex');
const { TYPE_LABELS } = require('../utils/type-labels');
const { formatThaiRange, formatTotalsAnswer } = require('./format-answer');

const ALT_TEXT_MAX_LENGTH = 400;

function typeRows(type, rows) {
  const found = rows.find((item) => item.type === type);
  const count = found ? found.entryCount : 0;
  return [
    row(TYPE_LABELS[type], baht(found ? found.total : 0), COLORS[type]),
    row('จำนวนรายการ', count > 0 ? `${count} รายการ` : 'ไม่มีรายการ'),
  ];
}

function buildTotalsFlex(question, rows, { listUrl } = {}) {
  const body = [];
  if (question.keyword) body.push(row('คำค้น', `"${question.keyword}"`));
  body.push(row('หมวด', question.category || 'ทุกหมวด'), { type: 'separator', margin: 'md' });
  const types = question.type === 'both' ? ['income', 'expense'] : [question.type];
  types.forEach((type, index) => {
    if (index > 0) body.push({ type: 'separator', margin: 'md' });
    body.push(...typeRows(type, rows));
  });

  const bubble = {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'text', text: `ยอด ${formatThaiRange(question.from, question.to)}`, weight: 'bold', size: 'md' }],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
  };
  if (listUrl) {
    bubble.footer = {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ดูรายการในเว็บ', uri: listUrl } }],
    };
  }
  return {
    type: 'flex',
    // LINE จำกัด altText ที่ 400 ตัวอักษร ชื่อหมวดหรือคำค้นที่ยาวต้องไม่ทำให้ส่งไม่ผ่าน
    altText: formatTotalsAnswer(question, rows).slice(0, ALT_TEXT_MAX_LENGTH),
    contents: bubble,
  };
}

module.exports = { buildTotalsFlex };
