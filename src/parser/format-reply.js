const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

function formatAmount(amount) {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function formatItem(item) {
  const parts = [
    TYPE_LABELS[item.type],
    item.category,
    `${formatAmount(item.amount)} บาท`,
    formatDate(item.date),
  ];
  if (item.note) {
    parts.push(item.note);
  }
  return `- ${parts.join(' | ')}`;
}

function formatSavedReply(items) {
  return ['บันทึกแล้ว', ...items.map(formatItem)].join('\n');
}

module.exports = { formatSavedReply };
