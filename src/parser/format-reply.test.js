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

describe('formatAmount', () => {
  it('adds thousands separators and keeps up to two decimals', () => {
    expect(formatAmount(25000)).toBe('25,000');
    expect(formatAmount(1250.5)).toBe('1,250.5');
  });
});

describe('formatSlipConfirmReply', () => {
  const ITEM = { type: 'expense', category: 'อาหาร', amount: 120, date: '2026-09-28', note: 'โอนให้ ร้านข้าวแกง' };

  it('shows the item and asks the user to confirm', () => {
    expect(formatSlipConfirmReply(ITEM)).toBe(
      'อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)'
    );
  });

  it('tells the user when the date was not readable and today is used', () => {
    expect(formatSlipConfirmReply(ITEM, { dateAssumed: true })).toBe(
      'อ่านสลิปได้ดังนี้\n- รายจ่าย | อาหาร | 120 บาท | 28/09 | โอนให้ ร้านข้าวแกง\nอ่านวันที่ไม่ได้ จึงใช้วันนี้\nกดบันทึกเพื่อยืนยัน (หมดเวลาใน 10 นาที)'
    );
  });
});
