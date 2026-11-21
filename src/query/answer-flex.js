const { formatAmount } = require('../parser/format-reply');
const { typeLabel } = require('../utils/type-labels');
const { displayWalletName } = require('../wallets/wallets');
const { capAltText } = require('../utils/alt-text');
const { t, formatAmount: formatMoney } = require('../i18n');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow } = require('../utils/flex-style');
const { formatDateRange, formatTotalsAnswer, formatEntryCount, displayQuestionCategory } = require('./format-answer');

const TYPE_COLORS = { income: COLORS.income, expense: COLORS.expense };

function totalsOf(type, rows) {
  const found = rows.find((item) => item.type === type);
  return { total: found ? found.total : 0, count: found ? found.entryCount : 0 };
}

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

function headerTitle(question, rows, lang) {
  if (question.type === 'both') {
    const net = (toSatang(totalsOf('income', rows).total) - toSatang(totalsOf('expense', rows).total)) / 100;
    return net < 0
      ? t(lang, 'query.header.negative', { amount: formatMoney(lang, -net) })
      : t(lang, 'query.header.left', { amount: formatMoney(lang, net) });
  }
  const { total } = totalsOf(question.type, rows);
  return t(lang, question.type === 'income' ? 'query.header.received' : 'query.header.spent', { amount: formatMoney(lang, total) });
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
function chipsRow(question, lang) {
  const labels = [
    question.keyword ? t(lang, 'query.chip.keyword', { keyword: question.keyword }) : '',
    question.category ? displayQuestionCategory(lang, question) : t(lang, 'query.chip.allCategories'),
    question.wallet ? t(lang, 'query.chip.wallet', { wallet: displayWalletName(lang, question.wallet) }) : '',
  ];
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

function singleTypeRows(type, rows, lang) {
  const { total, count } = totalsOf(type, rows);
  const result = [infoRow(t(lang, 'query.entryCountLabel'), formatEntryCount(lang, count))];
  if (count > 0) result.push(infoRow(t(lang, 'query.average'), formatMoney(lang, Math.round(total / count))));
  return result;
}

function compareRows(rows, lang) {
  const totals = { income: totalsOf('income', rows), expense: totalsOf('expense', rows) };
  const max = Math.max(totals.income.total, totals.expense.total);
  return ['income', 'expense'].map((type) => {
    const { total, count } = totals[type];
    const label = `${typeLabel(lang, type)} · ${formatEntryCount(lang, count)}`;
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

function buildTotalsFlex(question, rows, { listUrl, lang = 'th' } = {}) {
  const body = [chipsRow(question, lang), ...(question.type === 'both' ? compareRows(rows, lang) : singleTypeRows(question.type, rows, lang))];
  const bubble = {
    type: 'bubble',
    header: brandHeader(t(lang, 'query.header.range', { range: formatDateRange(lang, question.from, question.to) }), headerTitle(question, rows, lang)),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  if (listUrl) bubble.footer = actionRow({ type: 'uri', label: t(lang, 'query.openList'), uri: listUrl });
  return {
    type: 'flex',
    altText: capAltText(formatTotalsAnswer(question, rows, lang)),
    contents: bubble,
  };
}

module.exports = { buildTotalsFlex };
