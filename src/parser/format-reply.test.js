import { describe, it, expect } from 'vitest';
import { formatSavedReply, formatSlipConfirmReply, formatAmount } from './format-reply.js';

describe('formatSavedReply', () => {
  it('starts with saved header and lists every item', () => {
    const reply = formatSavedReply([
      { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' },
      { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: '' },
    ]);

    expect(reply).toBe(
      [
        'บันทึกแล้ว',
        '- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
        '- รายรับ | เงินเดือน | 25,000 บาท | 01/09',
      ].join('\n')
    );
  });

  it('keeps up to two decimal places', () => {
    const reply = formatSavedReply([
      { type: 'expense', category: 'อาหาร', amount: 1250.5, date: '2026-09-29', note: 'x' },
    ]);

    expect(reply).toContain('1,250.5 บาท');
  });
});

describe('reply length with the longest receipt', () => {
  const EMOJI = String.fromCodePoint(0x1f600);
  const items = Array.from({ length: 20 }, () => ({
    type: 'expense',
    category: 'บิล/ค่าบริการ',
    amount: 9999999.99,
    date: '2026-09-28',
    note: EMOJI.repeat(50),
  }));

  it('keeps a 20 item card with 50 code point emoji notes under 5000 UTF-16 units', () => {
    const reply = formatSlipConfirmReply(items, { dateAssumed: true });

    expect(reply.length).toBeLessThan(5000);
  });

  it('keeps a saved reply plus budget alert room under 5000 UTF-16 units', () => {
    expect(formatSavedReply(items).length + 700).toBeLessThan(5000);
  });
});

describe('formatAmount', () => {
  it('adds thousands separators and keeps up to two decimals', () => {
    expect(formatAmount(25000)).toBe('25,000');
    expect(formatAmount(1250.5)).toBe('1,250.5');
  });
});

describe('formatSlipConfirmReply', () => {
  const ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };
  const MILK = { type: 'expense', category: 'อาหาร', amount: 35, date: '2026-09-28', note: 'นมสด' };
  const TOOTHPASTE = { type: 'expense', category: 'สุขภาพ', amount: 59, date: '2026-09-28', note: 'ยาสีฟัน' };
  const CONFIRM = 'กดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)';

  it('shows a single item exactly as before', () => {
    expect(formatSlipConfirmReply([ITEM])).toBe(
      `อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\n${CONFIRM}`
    );
  });

  it('tells the user when the date was not readable and today is used', () => {
    expect(formatSlipConfirmReply([ITEM], { dateAssumed: true })).toBe(
      `อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nอ่านวันที่ไม่ได้ จึงใช้วันนี้\n${CONFIRM}`
    );
  });

  it('lists every item with its own price and the count in the header, without a total', () => {
    expect(formatSlipConfirmReply([MILK, TOOTHPASTE])).toBe(
      `อ่านสลิปได้ 2 รายการ\n- รายจ่าย | อาหาร | 35 บาท | 28/09 | นมสด\n- รายจ่าย | สุขภาพ | 59 บาท | 28/09 | ยาสีฟัน\n${CONFIRM}`
    );
  });

});
