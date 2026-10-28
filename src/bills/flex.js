const { formatAmount } = require('../parser/format-reply');
const { capAltText } = require('../utils/alt-text');
const { thaiDateWithYear } = require('../utils/date');
const { COLORS, brandHeader, actionRow, linkButton } = require('../utils/flex-style');

const BILL_CONFIRM_ACTION = 'bill_confirm';
const BILL_DECLINE_ACTION = 'bill_decline';

function postback(label, action, billId) {
  return { type: 'postback', label, data: new URLSearchParams({ action, bill: billId }).toString(), displayText: label };
}

function buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, categoryName, liffUrl }) {
  const heading = `${ownerName} ขอให้ยืนยันส่วนแบ่งบิล`;
  const altText = `${heading} ${title} ${formatAmount(share)} บาท`;
  const url = new URL(liffUrl);
  url.searchParams.set('bill', billId);
  const date = thaiDateWithYear(occurredOn);
  return {
    type: 'flex',
    altText: capAltText(altText),
    contents: {
      type: 'bubble',
      header: brandHeader(heading, title),
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: categoryName ? `${date} · ${categoryName}` : date, size: 'xs', color: COLORS.muted, wrap: true },
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            margin: 'md',
            paddingAll: 'md',
            cornerRadius: 'md',
            backgroundColor: COLORS.brandSoft,
            contents: [
              { type: 'text', text: 'ส่วนของคุณ', size: 'sm', color: COLORS.brandDark, flex: 1 },
              { type: 'text', text: `${formatAmount(share)} บาท`, size: 'lg', weight: 'bold', color: COLORS.brandDark, align: 'end', flex: 0 },
            ],
          },
          { type: 'text', text: 'ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ', size: 'xs', color: COLORS.muted, wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '0px',
        contents: [
          actionRow(postback('ยืนยัน', BILL_CONFIRM_ACTION, billId), [postback('ปฏิเสธ', BILL_DECLINE_ACTION, billId)]),
          linkButton({ type: 'uri', label: 'ดูในเว็บ', uri: url.toString() }),
        ],
      },
    },
  };
}

module.exports = { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION };
