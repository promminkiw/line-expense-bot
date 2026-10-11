const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { shortDate } = require('../utils/date');

const BILL_CONFIRM_ACTION = 'bill_confirm';
const BILL_DECLINE_ACTION = 'bill_decline';
const MUTED = '#707070';
const PRIMARY = '#0071E3';

function postback(label, action, billId) {
  return { type: 'postback', label, data: new URLSearchParams({ action, bill: billId }).toString(), displayText: label };
}

function buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, liffUrl }) {
  const heading = `${ownerName} ขอให้ยืนยันส่วนแบ่งบิล`;
  const altText = `${heading} ${title} ${formatAmount(share)} บาท`;
  const url = new URL(liffUrl);
  url.searchParams.set('bill', billId);
  return {
    type: 'flex',
    altText: capAltText(altText),
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: heading, size: 'xs', color: MUTED, wrap: true },
          { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: shortDate(occurredOn), size: 'xs', color: MUTED },
          { type: 'text', text: `ส่วนของคุณ ${formatAmount(share)} บาท`, weight: 'bold', size: 'md', margin: 'md' },
          { type: 'text', text: 'ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ', size: 'xs', color: MUTED, wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: PRIMARY, height: 'sm', action: postback('ยืนยัน', BILL_CONFIRM_ACTION, billId) },
          { type: 'button', style: 'secondary', height: 'sm', action: postback('ปฏิเสธ', BILL_DECLINE_ACTION, billId) },
          { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ดูในเว็บ', uri: url.toString() } },
        ],
      },
    },
  };
}

module.exports = { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION };
