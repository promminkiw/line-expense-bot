const { formatAmount } = require('../parser/format-reply');
const { COLORS, CHART_COLORS, brandHeader, stackBar, actionRow, separator } = require('../utils/flex-style');

function baht(amount) {
  return `${formatAmount(amount)} บาท`;
}

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

function categoryShares(summary) {
  const entries = [...summary.topExpenses];
  if (summary.otherExpenseTotal > 0) entries.push({ category: 'หมวดอื่น', total: summary.otherExpenseTotal });
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

function balanceTitle(net) {
  return net < 0 ? `ติดลบ ${baht(-net)}` : `คงเหลือ ${baht(net)}`;
}

function buildSummaryFlex(summary, comment, { summaryUrl } = {}) {
  const title = `สรุป${summary.label}`;
  const body = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        totalColumn('รายรับ', summary.incomeTotal, COLORS.income, 'start'),
        totalColumn('รายจ่าย', summary.expenseTotal, COLORS.expense, 'end'),
      ],
    },
  ];
  if (summary.topExpenses.length > 0 && summary.expenseTotal > 0) {
    const shares = categoryShares(summary);
    body.push(
      separator(),
      { type: 'text', text: 'รายจ่ายตามหมวด', size: 'xs', weight: 'bold', margin: 'lg' },
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
        { type: 'text', text: 'เฮียว่า', size: 'xxs', weight: 'bold', color: COLORS.brand },
        { type: 'text', text: comment, size: 'xs', wrap: true },
      ],
    });
  }

  const bubble = {
    type: 'bubble',
    header: brandHeader(title, balanceTitle(summary.net)),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  if (summaryUrl) bubble.footer = actionRow({ type: 'uri', label: 'เปิดหน้าสรุป', uri: summaryUrl });

  return {
    type: 'flex',
    altText: `${title}: รายรับ ${baht(summary.incomeTotal)} รายจ่าย ${baht(summary.expenseTotal)}`,
    contents: bubble,
  };
}

module.exports = { buildSummaryFlex, baht };
