const { formatAmount, formatSavedReply, formatSlipConfirmReply } = require('./format-reply');
const { formatBudgetAlerts, describeBudgetAlert, BUDGET_CHECK_FAILED_NOTICE } = require('../budget/alerts');

// LINE จำกัด altText ที่ 400 ตัวอักษร
const ALT_TEXT_MAX = 400;
const COLORS = { income: '#1D7A35', expense: '#D70015', muted: '#707070', primary: '#0071E3' };
const STRIP_COLORS = { warn: '#FFF4D6', over: '#FDECEA', notice: '#F2F2F2' };

function formatDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

// editUrl ต้องเป็นสตริงเท่านั้น กันค่าอื่น (เช่น index จาก Array.map) หลุดเข้ามาเป็น uri
function itemRow(item, editUrl) {
  const sub = item.note ? `${formatDate(item.date)} · ${item.note}` : formatDate(item.date);
  const sign = item.type === 'income' ? '+' : '-';
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'md',
    margin: 'md',
    ...(typeof editUrl === 'string' && editUrl ? { action: { type: 'uri', label: 'แก้ไข', uri: editUrl } } : {}),
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        contents: [
          { type: 'text', text: item.category, weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: sub, size: 'xs', color: COLORS.muted, wrap: true },
        ],
      },
      {
        type: 'text',
        text: `${sign}${formatAmount(item.amount)} บาท`,
        weight: 'bold',
        size: 'md',
        align: 'end',
        gravity: 'center',
        flex: 0,
        color: COLORS[item.type] ?? COLORS.expense,
      },
    ],
  };
}

function strip(background, contents) {
  return {
    type: 'box',
    layout: 'vertical',
    margin: 'md',
    paddingAll: 'md',
    cornerRadius: 'md',
    backgroundColor: background,
    contents,
  };
}

function alertStrip(alert) {
  const { level, title, detail } = describeBudgetAlert(alert);
  return strip(STRIP_COLORS[level], [
    { type: 'text', text: title, weight: 'bold', size: 'sm', wrap: true },
    { type: 'text', text: detail, size: 'xs', color: COLORS.muted, wrap: true },
  ]);
}

function capAltText(text) {
  return text.length <= ALT_TEXT_MAX ? text : `${text.slice(0, ALT_TEXT_MAX - 3)}...`;
}

// ปุ่มอยู่ท้ายการ์ด (footer) ไม่ใช้ quick reply เพราะ quick reply หายเมื่อมีข้อความถัดไป
// รับรูปแบบ { type: 'action', action } เดียวกับ quick reply เพื่อใช้ postback data ชุดเดิม
function withFooterButtons(message, buttons) {
  if (!buttons || buttons.length === 0) {
    return message;
  }
  message.contents.footer = {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: buttons.map((item, index) => ({
      type: 'button',
      action: item.action,
      height: 'sm',
      flex: 1,
      style: buttons.length > 1 && index === 0 ? 'primary' : 'secondary',
      ...(buttons.length > 1 && index === 0 ? { color: COLORS.primary } : {}),
    })),
  };
  return message;
}

function buildSavedFlex(items, { alerts = [], budgetCheckFailed = false, buttons, editUrls } = {}) {
  // ใช้ลิงก์เมื่อมีครบทุกแถวเท่านั้น กันลิงก์ไปผิดรายการเมื่อจำนวนไม่ตรงกัน
  const links = Array.isArray(editUrls) && editUrls.length === items.length ? editUrls : null;
  const body = [
    { type: 'text', text: 'บันทึกแล้ว', size: 'xs', color: COLORS.muted },
    ...items.map((item, index) => itemRow(item, links && links[index])),
  ];
  if (links && links.some(Boolean)) body.push({ ...smallText('แตะรายการเพื่อแก้ไขในเว็บ', COLORS.muted), margin: 'md' });
  body.push(...alerts.map(alertStrip));
  if (budgetCheckFailed) {
    body.push(strip(STRIP_COLORS.notice, [{ type: 'text', text: BUDGET_CHECK_FAILED_NOTICE, size: 'sm', wrap: true }]));
  }
  const altParts = [formatSavedReply(items)];
  if (alerts.length > 0) altParts.push(formatBudgetAlerts(alerts));
  if (budgetCheckFailed) altParts.push(BUDGET_CHECK_FAILED_NOTICE);

  return withFooterButtons(
    {
      type: 'flex',
      altText: capAltText(altParts.join('\n\n')),
      contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: body } },
    },
    buttons
  );
}

function smallText(text, color) {
  return { type: 'text', text, size: 'xs', color, wrap: true };
}

// การ์ดสรุปสลิปก่อนกดบันทึก: ข้อความ altText ยังเป็นข้อความเดิมจาก formatSlipConfirmReply
function buildSlipConfirmFlex(items, { dateAssumed = false, buttons } = {}) {
  const title = items.length > 1 ? `อ่านสลิปได้ ${items.length} รายการ` : 'อ่านสลิปได้';
  const body = [{ type: 'text', text: title, size: 'xs', color: COLORS.muted }, ...items.map((item) => itemRow(item))];
  if (dateAssumed) {
    body.push(strip(STRIP_COLORS.warn, [{ type: 'text', text: 'อ่านวันที่ไม่ได้ จึงใช้วันนี้', size: 'sm', wrap: true }]));
  }
  body.push({ ...smallText('กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)', COLORS.muted), margin: 'md' });

  return withFooterButtons(
    {
      type: 'flex',
      altText: capAltText(formatSlipConfirmReply(items, { dateAssumed })),
      contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: body } },
    },
    buttons
  );
}

module.exports = { buildSavedFlex, buildSlipConfirmFlex, ALT_TEXT_MAX };
