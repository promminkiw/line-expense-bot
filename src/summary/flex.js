const { formatAmount } = require('../parser/format-reply');

const COLORS = { income: '#1DB446', expense: '#E53935', muted: '#888888' };

function baht(amount) {
  return `${formatAmount(amount)} บาท`;
}

function row(label, value, color) {
  const valueText = { type: 'text', text: value, size: 'sm', align: 'end', flex: 4 };
  if (color) {
    valueText.color = color;
  }
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [{ type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 3 }, valueText],
  };
}

function buildSummaryFlex(summary, comment) {
  const title = `สรุป${summary.label}`;
  const body = [
    row('รายรับ', baht(summary.incomeTotal), COLORS.income),
    row('รายจ่าย', baht(summary.expenseTotal), COLORS.expense),
    row('คงเหลือ', baht(summary.net)),
  ];
  if (summary.topExpenses.length > 0) {
    body.push(
      { type: 'separator', margin: 'md' },
      { type: 'text', text: 'รายจ่ายตามหมวด', size: 'sm', weight: 'bold', margin: 'md' }
    );
    for (const entry of summary.topExpenses) {
      body.push(row(entry.category, baht(entry.total)));
    }
    if (summary.otherExpenseTotal > 0) {
      body.push(row('หมวดอื่น', baht(summary.otherExpenseTotal)));
    }
  }
  if (comment) {
    body.push(
      { type: 'separator', margin: 'md' },
      { type: 'text', text: comment, size: 'sm', wrap: true, margin: 'md' }
    );
  }

  return {
    type: 'flex',
    altText: `${title}: รายรับ ${baht(summary.incomeTotal)} รายจ่าย ${baht(summary.expenseTotal)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: title, weight: 'bold', size: 'md' }],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    },
  };
}

module.exports = { buildSummaryFlex };
