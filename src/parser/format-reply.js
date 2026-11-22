const { typeLabel } = require('../utils/type-labels');
const { displayCategoryName } = require('./categories');
const { t, formatAmount: formatMoney } = require('../i18n');

function formatAmount(amount) {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function formatItem(item, lang = 'th') {
  const parts = [
    typeLabel(lang, item.type),
    displayCategoryName(lang, item.type, item.category),
    formatMoney(lang, item.amount),
    formatDate(item.date),
  ];
  if (item.note) {
    parts.push(item.note);
  }
  return `- ${parts.join(' | ')}`;
}

function formatSavedReply(items, lang = 'th') {
  return [t(lang, 'card.saved.title'), ...items.map((item) => formatItem(item, lang))].join('\n');
}

function formatSlipConfirmReply(items, { dateAssumed = false, lang = 'th' } = {}) {
  const header = items.length > 1 ? t(lang, 'card.slip.readMany', { count: items.length }) : t(lang, 'card.slip.readList');
  const lines = [header, ...items.map((item) => formatItem(item, lang))];
  if (dateAssumed) {
    lines.push(t(lang, 'card.slip.dateAssumed'));
  }
  lines.push(t(lang, 'card.slip.confirmHint'));
  return lines.join('\n');
}

module.exports = { formatSavedReply, formatSlipConfirmReply, formatAmount, formatItem };
