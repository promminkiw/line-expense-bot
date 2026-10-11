import { describe, it, expect } from 'vitest';
import { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } from './flex.js';

const ARGS = {
  billId: '11111111-1111-1111-1111-111111111111',
  title: 'เนื้อย่าง',
  ownerName: 'เอ',
  share: 1250.5,
  occurredOn: '2026-10-08',
  categoryName: 'อาหาร',
  liffUrl: 'https://liff.line.me/liff-1',
};

function texts(node) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === 'text' ? [node.text] : []), ...Object.values(node).flatMap((value) => (Array.isArray(value) ? value.flatMap(texts) : texts(value)))];
}

describe('buildBillRequestFlex', () => {
  it('names the owner, the bill, the date and the share', () => {
    const flex = buildBillRequestFlex(ARGS);

    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 1,250.5 บาท');
    expect(texts(flex)).toEqual(expect.arrayContaining(['เอ ขอให้ยืนยันส่วนแบ่งบิล', 'เนื้อย่าง', 'ส่วนของคุณ 1,250.5 บาท', '08/10/2569 · อาหาร']));
  });

  it('offers confirm and decline postbacks and a link to the bill on the web page', () => {
    const buttons = buildBillRequestFlex(ARGS).contents.footer.contents.map((button) => button.action);

    expect(buttons).toEqual([
      { type: 'postback', label: 'ยืนยัน', data: `action=${BILL_CONFIRM_ACTION}&bill=${ARGS.billId}`, displayText: 'ยืนยัน' },
      { type: 'postback', label: 'ปฏิเสธ', data: `action=${BILL_DECLINE_ACTION}&bill=${ARGS.billId}`, displayText: 'ปฏิเสธ' },
      { type: 'uri', label: 'ดูในเว็บ', uri: `https://liff.line.me/liff-1?bill=${ARGS.billId}` },
    ]);
  });

  it('keeps the alt text within the LINE limit for a long title', () => {
    expect(buildBillRequestFlex({ ...ARGS, title: 'ก'.repeat(60), ownerName: 'ข'.repeat(400) }).altText.length).toBeLessThanOrEqual(400);
  });
});
