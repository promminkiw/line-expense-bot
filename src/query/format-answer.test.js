import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatThaiRange, formatTotalsAnswer } = require('./format-answer.js');

describe('formatThaiRange', () => {
  it.each([
    ['2026-10-18', '2026-10-18', '18 ต.ค. 2569'],
    ['2026-10-01', '2026-10-18', '1-18 ต.ค. 2569'],
    ['2026-09-25', '2026-10-05', '25 ก.ย. - 5 ต.ค. 2569'],
    ['2025-12-25', '2026-01-05', '25 ธ.ค. 2568 - 5 ม.ค. 2569'],
  ])('formats %s to %s', (from, to, expected) => {
    expect(formatThaiRange(from, to)).toBe(expected);
  });
});

describe('formatTotalsAnswer', () => {
  const base = { type: 'expense', category: '', keyword: '', from: '2026-10-01', to: '2026-10-18' };

  it('answers the expense total with the keyword', () => {
    const text = formatTotalsAnswer({ ...base, keyword: 'กาแฟ' }, [{ type: 'expense', total: 450, entryCount: 6 }]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)');
  });

  it('names the category and keeps satang', () => {
    const text = formatTotalsAnswer({ ...base, category: 'อาหาร' }, [{ type: 'expense', total: 1234.5, entryCount: 3 }]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569 หมวด อาหาร: รายจ่าย 1,234.5 บาท (3 รายการ)');
  });

  it('names the wallet between the category and the keyword', () => {
    const text = formatTotalsAnswer({ ...base, category: 'อาหาร', wallet: 'บัตรเครดิต', keyword: 'กาแฟ' }, [
      { type: 'expense', total: 300, entryCount: 2 },
    ]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569 หมวด อาหาร กระเป๋า บัตรเครดิต คำว่า "กาแฟ": รายจ่าย 300 บาท (2 รายการ)');
  });

  it('answers income then expense when asked for both', () => {
    const text = formatTotalsAnswer({ ...base, type: 'both' }, [
      { type: 'expense', total: 100, entryCount: 2 },
      { type: 'income', total: 25000, entryCount: 1 },
    ]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569: รายรับ 25,000 บาท (1 รายการ), รายจ่าย 100 บาท (2 รายการ)');
  });

  it('says there are no entries when nothing matches', () => {
    expect(formatTotalsAnswer({ ...base, type: 'income' }, [])).toBe('ช่วง 1-18 ต.ค. 2569: รายรับ 0 บาท (ไม่มีรายการ)');
  });
});
