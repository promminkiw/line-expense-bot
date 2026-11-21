const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { t } = require('../i18n');
const { formatSavingReply, goalPercent } = require('./chat');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow } = require('../utils/flex-style');

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

function buildSavingFlex({ name, amount, saved, target }, { buttons, goalsUrl, lang = 'th' } = {}) {
  const percent = goalPercent(saved, target);
  const reached = percent >= 100;
  const color = reached ? COLORS.income : COLORS.brand;
  const remaining = Math.max(toSatang(target) - toSatang(saved), 0) / 100;
  const progress = reached
    ? t(lang, 'goals.card.reached', { percent })
    : t(lang, 'goals.card.remaining', { percent, remaining: formatAmount(remaining) });
  const body = [
    gaugeRow(t(lang, 'goals.card.progress'), progress, color),
    progressBar(percent, color),
    {
      type: 'text',
      text: t(lang, 'goals.card.total', { saved: formatAmount(saved), target: formatAmount(target) }),
      size: 'xxs',
      color: COLORS.muted,
      margin: 'xs',
      wrap: true,
    },
  ];
  if (reached) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: 'md',
      cornerRadius: 'md',
      backgroundColor: COLORS.incomeSoft,
      contents: [{ type: 'text', text: t(lang, 'goals.reached'), size: 'sm', color: COLORS.incomeText, wrap: true }],
    });
  }

  const primary = goalsUrl
    ? { type: 'uri', label: t(lang, reached ? 'goals.card.closeGoal' : 'goals.card.viewGoal'), uri: goalsUrl }
    : undefined;
  const bubble = {
    type: 'bubble',
    header: brandHeader(t(lang, 'goals.card.eyebrow'), name, `+${formatAmount(amount)}`),
    body: { type: 'box', layout: 'vertical', contents: body },
  };
  const footer = actionRow(primary, (buttons ?? []).map((item) => item.action));
  if (footer) bubble.footer = footer;
  return {
    type: 'flex',
    altText: capAltText(formatSavingReply({ name, amount, saved, target }, lang)),
    contents: bubble,
  };
}

module.exports = { buildSavingFlex };
