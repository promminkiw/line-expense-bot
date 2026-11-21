const { formatAmount, formatSavedReply, formatSlipConfirmReply } = require('./format-reply');
const { displayCategoryName } = require('./categories');
const { formatBudgetAlerts, describeBudgetGauge, budgetCheckFailedNotice } = require('../budgets/alerts');
const { walletsUnreadableNotice, displayWalletName } = require('../wallets/wallets');
const { capAltText, ALT_TEXT_MAX } = require('../utils/alt-text');
const { shortDate } = require('../utils/date');
const { t, formatAmount: formatMoney } = require('../i18n');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow, softButton, separator } = require('../utils/flex-style');

const GAUGE_BAR_COLORS = { warn: COLORS.warnBar, over: COLORS.expense };
const GAUGE_TEXT_COLORS = { warn: COLORS.warnText, over: COLORS.expense };

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

// ยอดในหัวการ์ดคิดเป็นสตางค์กันทศนิยมเพี้ยน รายรับบวก รายจ่ายลบ
function signedTotal(items, lang) {
  const satang = items.reduce((sum, item) => sum + (item.type === 'income' ? 1 : -1) * toSatang(item.amount), 0);
  const sign = satang > 0 ? '+' : satang < 0 ? '-' : '';
  return `${sign}${formatMoney(lang, Math.abs(satang) / 100)}`;
}

function sideText(text, color) {
  return { type: 'text', text, weight: 'bold', size: 'sm', align: 'end', gravity: 'center', flex: 0, color };
}

// editUrl ต้องเป็นสตริงเท่านั้น กันค่าอื่น (เช่น index จาก Array.map) หลุดเข้ามาเป็น uri
function itemRow(item, { editUrl, showAmount, lang }) {
  const hasLink = typeof editUrl === 'string' && editUrl !== '';
  const category = displayCategoryName(lang, item.type, item.category);
  const wallet = item.wallet ? displayWalletName(lang, item.wallet) : '';
  const sub = [item.note ? category : '', shortDate(item.date), wallet].filter(Boolean).join(' · ');
  const editLabel = t(lang, 'card.saved.edit');
  const contents = [
    {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        { type: 'text', text: item.note || category, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: sub, size: 'xs', color: COLORS.muted, wrap: true },
      ],
    },
  ];
  if (showAmount) {
    const sign = item.type === 'income' ? '+' : '-';
    contents.push(sideText(`${sign}${formatAmount(item.amount)}`, item.type === 'income' ? COLORS.income : COLORS.expense));
  } else if (hasLink) {
    contents.push(sideText(editLabel, COLORS.brand));
  }
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    margin: 'md',
    ...(hasLink ? { action: { type: 'uri', label: editLabel, uri: editUrl } } : {}),
    contents,
  };
}

function hint(text) {
  return { type: 'text', text, size: 'xs', color: COLORS.muted, wrap: true, margin: 'md' };
}

function noticeStrip(text) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    paddingAll: 'md',
    cornerRadius: 'md',
    backgroundColor: COLORS.noticeBg,
    contents: [{ type: 'text', text, size: 'sm', color: COLORS.noticeText, wrap: true }],
  };
}

function budgetGauge(alert, lang) {
  const gauge = describeBudgetGauge(alert, lang);
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'lg',
    contents: [
      gaugeRow(gauge.label, gauge.value, GAUGE_TEXT_COLORS[gauge.level]),
      progressBar(gauge.percent, GAUGE_BAR_COLORS[gauge.level]),
      { type: 'text', text: gauge.detail, size: 'xxs', color: COLORS.muted, wrap: true, margin: 'xs' },
    ],
  };
}

// เปลี่ยนแค่ข้อความบนปุ่ม postback data และ displayText เดิมยังใช้ได้
function relabel(action, label) {
  return { ...action, label };
}

function bubble(header, body, footer) {
  const contents = { type: 'bubble', header, body: { type: 'box', layout: 'vertical', contents: body } };
  if (footer) contents.footer = footer;
  return contents;
}

function buildSavedFlex(items, { alerts = [], budgetCheckFailed = false, walletReadFailed = false, buttons, editUrls, lang = 'th' } = {}) {
  // ใช้ลิงก์เมื่อมีครบทุกแถวเท่านั้น กันลิงก์ไปผิดรายการเมื่อจำนวนไม่ตรงกัน
  const links = Array.isArray(editUrls) && editUrls.length === items.length ? editUrls : null;
  const many = items.length > 1;
  const body = items.map((item, index) => itemRow(item, { editUrl: links && links[index], showAmount: many, lang }));
  if (many && links && links.some(Boolean)) body.push(hint(t(lang, 'card.saved.editHint')));
  if (alerts.length > 0) body.push(separator(), ...alerts.map((alert) => budgetGauge(alert, lang)));
  if (budgetCheckFailed) body.push(noticeStrip(budgetCheckFailedNotice(lang)));
  if (walletReadFailed) body.push(noticeStrip(walletsUnreadableNotice(lang)));

  const altParts = [formatSavedReply(items, lang)];
  if (alerts.length > 0) altParts.push(formatBudgetAlerts(alerts, lang));
  if (budgetCheckFailed) altParts.push(budgetCheckFailedNotice(lang));
  if (walletReadFailed) altParts.push(walletsUnreadableNotice(lang));

  const deleteLabel = t(lang, many ? 'card.saved.deleteAll' : 'card.saved.deleteOne');
  // ปุ่มลบมาจาก quick reply ที่ตั้งชื่อตามภาษาเดียวกัน จึงเทียบกับป้ายของภาษานั้น
  const plainDeleteLabel = t(lang, 'chat.button.delete');
  const footer =
    buttons && buttons.length > 0
      ? {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          paddingAll: '10px',
          contents: buttons.map((item) => softButton(item.action.label === plainDeleteLabel ? relabel(item.action, deleteLabel) : item.action)),
        }
      : undefined;

  const title = many ? t(lang, 'card.saved.titleMany', { count: items.length }) : t(lang, 'card.saved.title');
  return {
    type: 'flex',
    altText: capAltText(altParts.join('\n\n')),
    contents: bubble(brandHeader(title, signedTotal(items, lang)), body, footer),
  };
}

// การ์ดสรุปสลิปก่อนกดบันทึก: ข้อความ altText ยังเป็นข้อความเดิมจาก formatSlipConfirmReply
function buildSlipConfirmFlex(items, { dateAssumed = false, buttons, lang = 'th' } = {}) {
  const many = items.length > 1;
  const body = items.map((item) => itemRow(item, { showAmount: many, lang }));
  if (dateAssumed) body.push(noticeStrip(t(lang, 'card.slip.dateAssumed')));
  body.push(hint(t(lang, 'card.slip.saveHint')));

  // ปุ่มแรกที่ส่งมาคือปุ่มหลัก (บันทึก) ที่เหลือเป็นปุ่มรอง
  const [first, ...rest] = (buttons ?? []).map((item) => item.action);
  const primary = first && many ? relabel(first, t(lang, 'card.slip.saveAll')) : first;
  const read = many ? t(lang, 'card.slip.readMany', { count: items.length }) : t(lang, 'card.slip.read');
  const eyebrow = `${read} · ${t(lang, 'card.slip.notSaved')}`;

  return {
    type: 'flex',
    altText: capAltText(formatSlipConfirmReply(items, { dateAssumed, lang })),
    contents: bubble(brandHeader(eyebrow, signedTotal(items, lang)), body, actionRow(primary, rest)),
  };
}

module.exports = { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX };
