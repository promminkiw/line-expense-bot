const { formatAmount, formatSavedReply, formatSlipConfirmReply } = require('./format-reply');
const { formatBudgetAlerts, describeBudgetGauge, BUDGET_CHECK_FAILED_NOTICE } = require('../budget/alerts');
const { WALLETS_UNREADABLE_NOTICE } = require('../wallets/wallets');
const { capAltText, ALT_TEXT_MAX } = require('../utils/alt-text');
const { shortDate } = require('../utils/date');
const { COLORS, brandHeader, progressBar, gaugeRow, actionRow, softButton, separator } = require('../utils/flex-style');

const GAUGE_BAR_COLORS = { warn: COLORS.warnBar, over: COLORS.expense };
const GAUGE_TEXT_COLORS = { warn: COLORS.warnText, over: COLORS.expense };

function toSatang(amount) {
  return Math.round(Number(amount) * 100);
}

// ยอดในหัวการ์ดคิดเป็นสตางค์กันทศนิยมเพี้ยน รายรับบวก รายจ่ายลบ
function signedTotal(items) {
  const satang = items.reduce((sum, item) => sum + (item.type === 'income' ? 1 : -1) * toSatang(item.amount), 0);
  const sign = satang > 0 ? '+' : satang < 0 ? '-' : '';
  return `${sign}${formatAmount(Math.abs(satang) / 100)} บาท`;
}

function sideText(text, color) {
  return { type: 'text', text, weight: 'bold', size: 'sm', align: 'end', gravity: 'center', flex: 0, color };
}

// editUrl ต้องเป็นสตริงเท่านั้น กันค่าอื่น (เช่น index จาก Array.map) หลุดเข้ามาเป็น uri
function itemRow(item, { editUrl, showAmount }) {
  const hasLink = typeof editUrl === 'string' && editUrl !== '';
  const sub = [item.note ? item.category : '', shortDate(item.date), item.wallet].filter(Boolean).join(' · ');
  const contents = [
    {
      type: 'box',
      layout: 'vertical',
      flex: 1,
      contents: [
        { type: 'text', text: item.note || item.category, weight: 'bold', size: 'md', wrap: true },
        { type: 'text', text: sub, size: 'xs', color: COLORS.muted, wrap: true },
      ],
    },
  ];
  if (showAmount) {
    const sign = item.type === 'income' ? '+' : '-';
    contents.push(sideText(`${sign}${formatAmount(item.amount)}`, item.type === 'income' ? COLORS.income : COLORS.expense));
  } else if (hasLink) {
    contents.push(sideText('แก้ไข', COLORS.brand));
  }
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    margin: 'md',
    ...(hasLink ? { action: { type: 'uri', label: 'แก้ไข', uri: editUrl } } : {}),
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

function budgetGauge(alert) {
  const gauge = describeBudgetGauge(alert);
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

function buildSavedFlex(items, { alerts = [], budgetCheckFailed = false, walletReadFailed = false, buttons, editUrls } = {}) {
  // ใช้ลิงก์เมื่อมีครบทุกแถวเท่านั้น กันลิงก์ไปผิดรายการเมื่อจำนวนไม่ตรงกัน
  const links = Array.isArray(editUrls) && editUrls.length === items.length ? editUrls : null;
  const many = items.length > 1;
  const body = items.map((item, index) => itemRow(item, { editUrl: links && links[index], showAmount: many }));
  if (many && links && links.some(Boolean)) body.push(hint('แตะรายการเพื่อแก้ไขในเว็บ'));
  if (alerts.length > 0) body.push(separator(), ...alerts.map(budgetGauge));
  if (budgetCheckFailed) body.push(noticeStrip(BUDGET_CHECK_FAILED_NOTICE));
  if (walletReadFailed) body.push(noticeStrip(WALLETS_UNREADABLE_NOTICE));

  const altParts = [formatSavedReply(items)];
  if (alerts.length > 0) altParts.push(formatBudgetAlerts(alerts));
  if (budgetCheckFailed) altParts.push(BUDGET_CHECK_FAILED_NOTICE);
  if (walletReadFailed) altParts.push(WALLETS_UNREADABLE_NOTICE);

  const cancelLabel = many ? 'ยกเลิกทั้งหมด' : 'ยกเลิกรายการนี้';
  const footer =
    buttons && buttons.length > 0
      ? {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          paddingAll: '10px',
          contents: buttons.map((item) => softButton(item.action.label === 'ยกเลิก' ? relabel(item.action, cancelLabel) : item.action)),
        }
      : undefined;

  return {
    type: 'flex',
    altText: capAltText(altParts.join('\n\n')),
    contents: bubble(brandHeader(many ? `เฮียบันทึกแล้ว ${items.length} รายการ` : 'เฮียบันทึกแล้ว', signedTotal(items)), body, footer),
  };
}

// การ์ดสรุปสลิปก่อนกดบันทึก: ข้อความ altText ยังเป็นข้อความเดิมจาก formatSlipConfirmReply
function buildSlipConfirmFlex(items, { dateAssumed = false, buttons } = {}) {
  const many = items.length > 1;
  const body = items.map((item) => itemRow(item, { showAmount: many }));
  if (dateAssumed) body.push(noticeStrip('อ่านวันที่ไม่ได้ จึงใช้วันนี้'));
  body.push(hint('กดบันทึกภายใน 10 นาที'));

  // ปุ่มแรกที่ส่งมาคือปุ่มหลัก (บันทึก) ที่เหลือเป็นปุ่มรอง
  const [first, ...rest] = (buttons ?? []).map((item) => item.action);
  const primary = first && many ? relabel(first, 'บันทึกทั้งหมด') : first;
  const eyebrow = `${many ? `เฮียอ่านสลิปได้ ${items.length} รายการ` : 'เฮียอ่านสลิปได้'} · ยังไม่บันทึก`;

  return {
    type: 'flex',
    altText: capAltText(formatSlipConfirmReply(items, { dateAssumed })),
    contents: bubble(brandHeader(eyebrow, signedTotal(items)), body, actionRow(primary, rest)),
  };
}

module.exports = { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX };
