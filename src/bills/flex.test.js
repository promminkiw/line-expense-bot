import { describe, it, expect } from 'vitest';
import { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } from './flex.js';
import { COLORS } from '../utils/flex-style.js';

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
  it('names the owner and the bill in the header and the share in the body', () => {
    const flex = buildBillRequestFlex(ARGS);

    expect(flex.altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 1,250.5 บาท');
    expect(texts(flex.contents.header)).toEqual(['เอ ขอให้ยืนยันส่วนแบ่งบิล', 'เนื้อย่าง']);
    expect(texts(flex.contents.body)).toEqual(['08/10/2569 · อาหาร', 'ส่วนของคุณ', '1,250.5 บาท', 'ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ']);
  });

  it('leaves out the category when there is none', () => {
    expect(texts(buildBillRequestFlex({ ...ARGS, categoryName: '' }).contents.body)[0]).toBe('08/10/2569');
  });

  it('puts decline left, the yellow confirm right, and the web link below', () => {
    const footer = buildBillRequestFlex(ARGS).contents.footer;
    const [row, link] = footer.contents;

    expect(row.contents.map((node) => node.action)).toEqual([
      { type: 'postback', label: 'ปฏิเสธ', data: `action=${BILL_DECLINE_ACTION}&bill=${ARGS.billId}`, displayText: 'ปฏิเสธ' },
      { type: 'postback', label: 'ยืนยัน', data: `action=${BILL_CONFIRM_ACTION}&bill=${ARGS.billId}`, displayText: 'ยืนยัน' },
    ]);
    expect(row.contents[1].backgroundColor).toBe(COLORS.cta);
    expect(link.action).toEqual({ type: 'uri', label: 'ดูในเว็บ', uri: `https://liff.line.me/liff-1?bill=${ARGS.billId}` });
  });

  it('keeps the alt text within the LINE limit for a long title', () => {
    expect(buildBillRequestFlex({ ...ARGS, title: 'ก'.repeat(60), ownerName: 'ข'.repeat(400) }).altText.length).toBeLessThanOrEqual(400);
  });
});
