const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { formatSavingReply, goalPercent } = require('./chat');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow } = require('../utils/flex-style');

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

function buildSavingFlex({ name, amount, saved, target }, { buttons, goalsUrl } = {}) {
  const percent = goalPercent(saved, target);
  const reached = percent >= 100;
  const color = reached ? COLORS.income : COLORS.brand;
  const remaining = Math.max(toSatang(target) - toSatang(saved), 0) / 100;
  const body = [
    gaugeRow('ความคืบหน้า', reached ? `${percent}% · ถึงเป้าแล้ว` : `${percent}% · อีก ${formatAmount(remaining)}`, color),
    progressBar(percent, color),
    { type: 'text', text: `ยอดสะสม ${formatAmount(saved)} จาก ${formatAmount(target)} บาท`, size: 'xxs', color: COLORS.muted, margin: 'xs', wrap: true },
  ];
  if (reached) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: 'md',
      cornerRadius: 'md',
      backgroundColor: COLORS.incomeSoft,
      contents: [{ type: 'text', text: 'ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม', size: 'sm', color: COLORS.incomeText, wrap: true }],
    });
  }

  const primary = goalsUrl ? { type: 'uri', label: reached ? 'ปิดเป้าในเว็บ' : 'ดูเป้าในเว็บ', uri: goalsUrl } : undefined;
  const bubble = {
    type: 'bubble',
    header: brandHeader('ออมเข้าเป้าแล้ว', name, `+${formatAmount(amount)}`),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  const footer = actionRow(primary, (buttons ?? []).map((item) => item.action));
  if (footer) bubble.footer = footer;
  return {
    type: 'flex',
    altText: capAltText(formatSavingReply({ name, amount, saved, target })),
    contents: bubble,
  };
}

module.exports = { buildSavingFlex };
