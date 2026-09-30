import { describe, it, expect } from 'vitest';
import {
  formatBaht,
  formatThaiDate,
  currentMonth,
  groupByDate,
  totals,
  groupCategoryOptions,
  describeEditFailure,
  LOGIN_REQUIRED_MESSAGE,
} from './format.mjs';

describe('formatBaht', () => {
  it('adds separators and the currency word', () => {
    expect(formatBaht(25000)).toBe('25,000 บาท');
    expect(formatBaht(1250.5)).toBe('1,250.5 บาท');
  });
});

describe('formatThaiDate', () => {
  it('shows day and month', () => {
    expect(formatThaiDate('2026-09-05')).toBe('05/09');
  });
});

describe('currentMonth', () => {
  it('uses Bangkok time', () => {
    // 2026-09-30 18:00 UTC คือ 2026-10-01 01:00 เวลาไทย
    expect(currentMonth(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10');
    expect(currentMonth(new Date('2026-09-30T10:00:00Z'))).toBe('2026-09');
  });
});

describe('groupByDate', () => {
  it('groups consecutive entries of the same day and keeps order', () => {
    const items = [
      { id: 'a', occurredOn: '2026-09-29' },
      { id: 'b', occurredOn: '2026-09-29' },
      { id: 'c', occurredOn: '2026-09-28' },
    ];

    expect(groupByDate(items)).toEqual([
      { date: '2026-09-29', items: [items[0], items[1]] },
      { date: '2026-09-28', items: [items[2]] },
    ]);
  });
});

describe('totals', () => {
  it('sums income and expense in satang', () => {
    expect(
      totals([
        { type: 'expense', amount: 0.1 },
        { type: 'expense', amount: 0.2 },
        { type: 'income', amount: 25000 },
      ])
    ).toEqual({ income: 25000, expense: 0.3 });
  });
});

describe('groupCategoryOptions', () => {
  it('splits categories by type', () => {
    const food = { id: 'c1', name: 'อาหาร', type: 'expense' };
    const salary = { id: 'c2', name: 'เงินเดือน', type: 'income' };

    expect(groupCategoryOptions([food, salary])).toEqual({ expense: [food], income: [salary] });
  });
});

describe('describeEditFailure', () => {
  it('asks to reopen from LINE on 401 and keeps the dialog open', () => {
    expect(describeEditFailure(401, 'save')).toEqual({ message: LOGIN_REQUIRED_MESSAGE, closeAndReload: false });
  });

  it('closes and reloads on 404 with a not-found message', () => {
    expect(describeEditFailure(404, 'delete')).toEqual({ message: 'ไม่พบรายการนี้แล้ว', closeAndReload: true });
  });

  it('explains invalid input on 400 when saving', () => {
    expect(describeEditFailure(400, 'save').message).toBe('ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่อีกครั้ง');
  });

  it('names the action in the generic failure message', () => {
    expect(describeEditFailure(500, 'save')).toEqual({ message: 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง', closeAndReload: false });
    expect(describeEditFailure(undefined, 'delete').message).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeEditFailure(400, 'delete').message).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});
