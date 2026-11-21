const { capAltText } = require('../utils/alt-text');
const { thaiDateWithYear } = require('../utils/date');
const { displayCategoryName } = require('../parser/categories');
const { t, formatAmount, formatDate, normalizeLanguage } = require('../i18n');
const { COLORS, brandHeader, actionRow, linkButton } = require('../utils/flex-style');

const BILL_CONFIRM_ACTION = 'bill_confirm';
const BILL_DECLINE_ACTION = 'bill_decline';

function postback(label, action, billId) {
  return { type: 'postback', label, data: new URLSearchParams({ action, bill: billId }).toString(), displayText: label };
}

// ไทยคงรูปแบบ วว/ดด/พ.ศ. เดิม ภาษาอื่นใช้ชื่อเดือนเพราะ วว/ดด สลับกันได้ในแต่ละประเทศ
function billDate(lang, isoDate) {
  return normalizeLanguage(lang) === 'th' ? thaiDateWithYear(isoDate) : formatDate(lang, isoDate);
}

function buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, categoryName, liffUrl, lang = 'th' }) {
  const heading = t(lang, 'bill.card.heading', { owner: ownerName });
  const amount = formatAmount(lang, share);
  const altText = `${heading} ${title} ${amount}`;
  const url = new URL(liffUrl);
  url.searchParams.set('bill', billId);
  const date = billDate(lang, occurredOn);
  const confirmLabel = t(lang, 'bill.card.confirm');
  const declineLabel = t(lang, 'bill.card.decline');
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
          {
            type: 'text',
            text: categoryName ? `${date} · ${displayCategoryName(lang, 'expense', categoryName)}` : date,
            size: 'xs',
            color: COLORS.muted,
            wrap: true,
          },
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            margin: 'md',
            paddingAll: 'md',
            cornerRadius: 'md',
            backgroundColor: COLORS.brandSoft,
            contents: [
              { type: 'text', text: t(lang, 'bill.card.yourShare'), size: 'sm', color: COLORS.brandDark, flex: 1 },
              { type: 'text', text: amount, size: 'lg', weight: 'bold', color: COLORS.brandDark, align: 'end', flex: 0 },
            ],
          },
          { type: 'text', text: t(lang, 'bill.card.note'), size: 'xs', color: COLORS.muted, wrap: true, margin: 'sm' },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '0px',
        contents: [
          actionRow(postback(confirmLabel, BILL_CONFIRM_ACTION, billId), [postback(declineLabel, BILL_DECLINE_ACTION, billId)]),
          linkButton({ type: 'uri', label: t(lang, 'bill.card.view'), uri: url.toString() }),
        ],
      },
    },
  };
}

module.exports = { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION };
