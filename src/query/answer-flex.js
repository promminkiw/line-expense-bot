const { baht } = require('../summary/flex');
const { formatAmount } = require('../parser/format-reply');
const { TYPE_LABELS } = require('../utils/type-labels');
const { capAltText } = require('../utils/alt-text');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow } = require('../utils/flex-style');
const { formatThaiRange, formatTotalsAnswer } = require('./format-answer');

const TYPE_COLORS = { income: COLORS.income, expense: COLORS.expense };

function totalsOf(type, rows) {
  const found = rows.find((item) => item.type === type);
  return { total: found ? found.total : 0, count: found ? found.entryCount : 0 };
}

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

function headerTitle(question, rows) {
  if (question.type === 'both') {
    const net = (toSatang(totalsOf('income', rows).total) - toSatang(totalsOf('expense', rows).total)) / 100;
    return net < 0 ? `ติดลบ ${baht(-net)}` : `เหลือ ${baht(net)}`;
  }
  const { total } = totalsOf(question.type, rows);
  return `${question.type === 'income' ? 'รับมา' : 'จ่ายไป'} ${baht(total)}`;
}

function chip(text) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 0,
    cornerRadius: '12px',
    backgroundColor: COLORS.brandSoft,
    paddingTop: '2px',
    paddingBottom: '2px',
    paddingStart: '10px',
    paddingEnd: '10px',
    contents: [{ type: 'text', text, size: 'xs', weight: 'bold', color: COLORS.brand, wrap: true }],
  };
}

// ผู้ใช้กระเป๋าเดียวได้ wallet ว่างเสมอ การ์ดจึงไม่มีป้ายกระเป๋า
function chipsRow(question) {
  const labels = [question.keyword ? `คำค้น ${question.keyword}` : '', question.category || 'ทุกหมวด', question.wallet ? `กระเป๋า ${question.wallet}` : ''];
  return { type: 'box', layout: 'horizontal', spacing: 'sm', contents: labels.filter(Boolean).map(chip) };
}

function infoRow(label, value) {
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    contents: [
      { type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 1 },
      { type: 'text', text: value, size: 'sm', weight: 'bold', align: 'end', flex: 0 },
    ],
  };
}

function singleTypeRows(type, rows) {
  const { total, count } = totalsOf(type, rows);
  const result = [infoRow('จำนวนรายการ', count > 0 ? `${count} รายการ` : 'ไม่มีรายการ')];
  if (count > 0) result.push(infoRow('เฉลี่ยรายการละ', baht(Math.round(total / count))));
  return result;
}

function compareRows(rows) {
  const totals = { income: totalsOf('income', rows), expense: totalsOf('expense', rows) };
  const max = Math.max(totals.income.total, totals.expense.total);
  return ['income', 'expense'].map((type) => {
    const { total, count } = totals[type];
    const label = `${TYPE_LABELS[type]} · ${count > 0 ? `${count} รายการ` : 'ไม่มีรายการ'}`;
    return {
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      contents: [
        gaugeRow(label, formatAmount(total), TYPE_COLORS[type]),
        progressBar(max > 0 ? Math.round((total / max) * 100) : 0, TYPE_COLORS[type]),
      ],
    };
  });
}

function buildTotalsFlex(question, rows, { listUrl } = {}) {
  const body = [chipsRow(question), ...(question.type === 'both' ? compareRows(rows) : singleTypeRows(question.type, rows))];
  const bubble = {
    type: 'bubble',
    header: brandHeader(`ยอด ${formatThaiRange(question.from, question.to)}`, headerTitle(question, rows)),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  if (listUrl) bubble.footer = actionRow({ type: 'uri', label: 'ดูรายการในเว็บ', uri: listUrl });
  return {
    type: 'flex',
    altText: capAltText(formatTotalsAnswer(question, rows)),
    contents: bubble,
  };
}

module.exports = { buildTotalsFlex };
