const { formatAmount } = require('../parser/format-reply');
const { displayCategoryName } = require('../parser/categories');
const { typeLabel } = require('../utils/type-labels');
const { t, formatAmount: formatMoney } = require('../i18n');
const { COLORS, CHART_COLORS, brandHeader, stackBar, actionRow, separator } = require('../utils/flex-style');

function totalColumn(label, amount, color, align) {
  return {
    type: 'box',
    layout: 'vertical',
    flex: 1,
    contents: [
      { type: 'text', text: label, size: 'xxs', color: COLORS.muted, align },
      { type: 'text', text: formatAmount(amount), size: 'md', weight: 'bold', color, align },
    ],
  };
}

function categoryShares(summary, lang) {
  const entries = summary.topExpenses.map((entry) => ({ ...entry, category: displayCategoryName(lang, 'expense', entry.category) }));
  if (summary.otherExpenseTotal > 0) entries.push({ category: t(lang, 'summary.card.otherCategories'), total: summary.otherExpenseTotal });
  return entries.map((entry, index) => ({
    ...entry,
    percent: Math.round((entry.total / summary.expenseTotal) * 100),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

function legendRow(share) {
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    margin: 'sm',
    alignItems: 'center',
    contents: [
      { type: 'box', layout: 'vertical', flex: 0, width: '12px', height: '12px', cornerRadius: '4px', backgroundColor: share.color, contents: [] },
      { type: 'text', text: share.category, size: 'xs', flex: 1, wrap: true },
      { type: 'text', text: `${formatAmount(share.total)} · ${share.percent}%`, size: 'xs', align: 'end', flex: 0 },
    ],
  };
}

function balanceTitle(net, lang) {
  return net < 0
    ? t(lang, 'summary.card.negative', { amount: formatMoney(lang, -net) })
    : t(lang, 'summary.card.left', { amount: formatMoney(lang, net) });
}

function buildSummaryFlex(summary, comment, { summaryUrl, lang = 'th' } = {}) {
  const title = t(lang, 'summary.card.title', { label: summary.label });
  const body = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        totalColumn(typeLabel(lang, 'income'), summary.incomeTotal, COLORS.income, 'start'),
        totalColumn(typeLabel(lang, 'expense'), summary.expenseTotal, COLORS.expense, 'end'),
      ],
    },
  ];
  if (summary.topExpenses.length > 0 && summary.expenseTotal > 0) {
    const shares = categoryShares(summary, lang);
    body.push(
      separator(),
      { type: 'text', text: t(lang, 'summary.card.byCategory'), size: 'xs', weight: 'bold', margin: 'lg' },
      // ขั้นต่ำ 1 ให้หมวดเล็กยังเห็นในแถบ และ flex ของ LINE ต้องเป็นจำนวนเต็ม
      stackBar(shares.map((share) => ({ weight: Math.max(1, share.percent), color: share.color }))),
      ...shares.map(legendRow)
    );
  }
  if (comment) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'lg',
      paddingAll: 'md',
      cornerRadius: 'md',
      backgroundColor: COLORS.brandSoft,
      contents: [
        { type: 'text', text: t(lang, 'summary.card.commentLabel'), size: 'xxs', weight: 'bold', color: COLORS.brand },
        { type: 'text', text: comment, size: 'xs', wrap: true },
      ],
    });
  }

  const bubble = {
    type: 'bubble',
    header: brandHeader(title, balanceTitle(summary.net, lang)),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  if (summaryUrl) bubble.footer = actionRow({ type: 'uri', label: t(lang, 'summary.card.open'), uri: summaryUrl });

  return {
    type: 'flex',
    altText: t(lang, 'summary.card.altText', {
      title,
      income: formatMoney(lang, summary.incomeTotal),
      expense: formatMoney(lang, summary.expenseTotal),
    }),
    contents: bubble,
  };
}

module.exports = { buildSummaryFlex };
