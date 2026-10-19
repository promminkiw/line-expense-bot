const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { formatSavingReply, goalPercent } = require('./chat');

const COLORS = { income: '#1D7A35', muted: '#707070', primary: '#0071E3', track: '#E5E5EA', reached: '#E8F5EC' };

// LINE ไม่รับ box ที่กว้าง 0% จึงใช้ filler เมื่อยังไม่ถึง 1%
function progressBar(percent) {
  const filled = Math.min(percent, 100);
  return {
    type: 'box',
    layout: 'horizontal',
    margin: 'md',
    height: '8px',
    cornerRadius: '4px',
    backgroundColor: COLORS.track,
    contents:
      filled > 0
        ? [{ type: 'box', layout: 'vertical', width: `${filled}%`, cornerRadius: '4px', backgroundColor: COLORS.primary, contents: [] }]
        : [{ type: 'filler' }],
  };
}

function footer(buttons, goalsUrl) {
  const actions = [];
  if (goalsUrl) actions.push({ type: 'uri', label: 'ดูเป้าในเว็บ', uri: goalsUrl });
  actions.push(...(buttons ?? []).map((item) => item.action));
  if (actions.length === 0) {
    return undefined;
  }
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: actions.map((action, index) => ({
      type: 'button',
      action,
      height: 'sm',
      flex: 1,
      style: actions.length > 1 && index === 0 ? 'primary' : 'secondary',
      ...(actions.length > 1 && index === 0 ? { color: COLORS.primary } : {}),
    })),
  };
}

function buildSavingFlex({ name, amount, saved, target }, { buttons, goalsUrl } = {}) {
  const percent = goalPercent(saved, target);
  const body = [
    { type: 'text', text: 'ออมเข้าเป้าแล้ว', size: 'xs', color: COLORS.muted },
    {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      margin: 'md',
      contents: [
        { type: 'text', text: name, weight: 'bold', size: 'md', wrap: true, flex: 1 },
        { type: 'text', text: `+${formatAmount(amount)} บาท`, weight: 'bold', size: 'md', align: 'end', flex: 0, color: COLORS.income },
      ],
    },
    progressBar(percent),
    {
      type: 'text',
      text: `ยอดสะสม ${formatAmount(saved)} / ${formatAmount(target)} บาท (${percent}%)`,
      size: 'xs',
      color: COLORS.muted,
      margin: 'sm',
      wrap: true,
    },
  ];
  if (percent >= 100) {
    body.push({
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      paddingAll: 'md',
      cornerRadius: 'md',
      backgroundColor: COLORS.reached,
      contents: [{ type: 'text', text: 'ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม', size: 'sm', wrap: true }],
    });
  }

  const bubble = { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: body } };
  const footerBox = footer(buttons, goalsUrl);
  if (footerBox) bubble.footer = footerBox;
  return {
    type: 'flex',
    altText: capAltText(formatSavingReply({ name, amount, saved, target })),
    contents: bubble,
  };
}

module.exports = { buildSavingFlex };
