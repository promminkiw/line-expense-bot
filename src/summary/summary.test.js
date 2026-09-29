import { describe, it, expect } from 'vitest';
import { buildSummary } from './summary.js';

function expense(category, total, entryCount = 1) {
  return { type: 'expense', category, total, entryCount };
}

describe('buildSummary', () => {
  it('totals income, expense and net', () => {
    const summary = buildSummary(
      [
        { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
        expense('อาหาร', 105, 2),
      ],
      'วันนี้ (29/09)'
    );

    expect(summary).toEqual({
      label: 'วันนี้ (29/09)',
      incomeTotal: 25000,
      expenseTotal: 105,
      net: 24895,
      topExpenses: [{ category: 'อาหาร', total: 105 }],
      otherExpenseTotal: 0,
      entryCount: 3,
    });
  });

  it('adds satang exactly without floating point drift', () => {
    const summary = buildSummary([expense('อาหาร', 0.1), expense('เดินทาง', 0.2)], 'x');

    expect(summary.expenseTotal).toBe(0.3);
    expect(summary.net).toBe(-0.3);
  });

  it('keeps the top 5 expense categories and groups the rest', () => {
    const summary = buildSummary(
      [
        expense('อาหาร', 500),
        expense('เดินทาง', 400),
        expense('ช้อปปิ้ง', 300),
        expense('บิล/ค่าบริการ', 200),
        expense('สุขภาพ', 100),
        expense('บันเทิง', 50),
        expense('อื่นๆ', 25),
      ],
      'x'
    );

    expect(summary.topExpenses.map((entry) => entry.category)).toEqual([
      'อาหาร',
      'เดินทาง',
      'ช้อปปิ้ง',
      'บิล/ค่าบริการ',
      'สุขภาพ',
    ]);
    expect(summary.otherExpenseTotal).toBe(75);
  });

  it('orders expense categories by total even if rows arrive unsorted', () => {
    const summary = buildSummary([expense('อาหาร', 10), expense('เดินทาง', 90)], 'x');

    expect(summary.topExpenses[0]).toEqual({ category: 'เดินทาง', total: 90 });
  });

  it('returns zeros for no rows', () => {
    expect(buildSummary([], 'x')).toMatchObject({
      incomeTotal: 0,
      expenseTotal: 0,
      net: 0,
      topExpenses: [],
      otherExpenseTotal: 0,
      entryCount: 0,
    });
  });
});
