import { describe, it, expect } from 'vitest';
import { formatParseReply, formatSavedReply } from './format-reply.js';

describe('formatParseReply', () => {
  it('returns the question for clarify result', () => {
    expect(formatParseReply({ status: 'clarify', question: 'ซื้ออะไร กี่บาท?' })).toBe(
      'ซื้ออะไร กี่บาท?'
    );
  });

  it('lists every item with type, category, amount, date and note', () => {
    const reply = formatParseReply({
      status: 'ok',
      items: [
        { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' },
        { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: 'เงินเดือน' },
      ],
    });

    expect(reply).toBe(
      [
        'แยกรายการได้ดังนี้ (ยังไม่บันทึก)',
        '- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
        '- รายรับ | เงินเดือน | 25,000 บาท | 01/09 | เงินเดือน',
      ].join('\n')
    );
  });

  it('keeps up to two decimal places', () => {
    const reply = formatParseReply({
      status: 'ok',
      items: [{ type: 'expense', category: 'อาหาร', amount: 1250.5, date: '2026-09-29', note: 'x' }],
    });

    expect(reply).toContain('1,250.5 บาท');
  });

  it('omits note separator when note is empty', () => {
    const reply = formatParseReply({
      status: 'ok',
      items: [{ type: 'expense', category: 'อื่นๆ', amount: 10, date: '2026-09-29', note: '' }],
    });

    expect(reply.split('\n')[1]).toBe('- รายจ่าย | อื่นๆ | 10 บาท | 29/09');
  });
});

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
});
