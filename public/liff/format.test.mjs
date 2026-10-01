import { describe, it, expect } from 'vitest';
import {
  formatBaht,
  formatThaiDate,
  currentMonth,
  groupByDate,
  groupCategoryOptions,
  describeEditFailure,
  describeDeleteTarget,
  summaryTotals,
  chartRows,
  hasChartData,
  describeExportFailure,
  budgetRows,
  createLatestGuard,
  formatMonthLabel,
  describeBudgetFailure,
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

describe('describeDeleteTarget', () => {
  it('describes an expense with a minus sign', () => {
    const item = { type: 'expense', amount: 60, categoryName: 'อาหาร', occurredOn: '2026-09-05', note: 'ข้าวมันไก่' };

    expect(describeDeleteTarget(item)).toEqual({
      title: 'ลบรายการนี้?',
      category: 'อาหาร',
      amount: '-60 บาท',
      date: '05/09',
      note: 'ข้าวมันไก่',
    });
  });

  it('describes an income with a plus sign and no note', () => {
    const item = { type: 'income', amount: 75, categoryName: 'เงินเดือน', occurredOn: '2026-09-30' };

    const result = describeDeleteTarget(item);

    expect(result.amount).toBe('+75 บาท');
    expect(result.note).toBe('');
  });
});

describe('summaryTotals', () => {
  it('sums the SQL summary by type in satang', () => {
    expect(
      summaryTotals([
        { type: 'expense', category: 'อาหาร', total: 0.1, entryCount: 1 },
        { type: 'expense', category: 'เดินทาง', total: 0.2, entryCount: 1 },
        { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
      ])
    ).toEqual({ income: 25000, expense: 0.3 });
  });

  it('returns zero for an empty month', () => {
    expect(summaryTotals([])).toEqual({ income: 0, expense: 0 });
  });
});

describe('chartRows', () => {
  const summary = [
    { type: 'expense', category: 'เดินทาง', total: 1500, entryCount: 3 },
    { type: 'expense', category: 'อาหาร', total: 3000, entryCount: 9 },
    { type: 'expense', category: 'ช้อปปิ้ง', total: 500, entryCount: 1 },
    { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
  ];

  it('keeps one type, sorts by total and gives share and bar width', () => {
    expect(chartRows(summary, 'expense')).toEqual([
      { category: 'อาหาร', total: 3000, share: 60, shareText: '60%', width: 100 },
      { category: 'เดินทาง', total: 1500, share: 30, shareText: '30%', width: 50 },
      { category: 'ช้อปปิ้ง', total: 500, share: 10, shareText: '10%', width: (500 / 3000) * 100 },
    ]);
  });

  it('returns the other type on its own', () => {
    expect(chartRows(summary, 'income')).toEqual([
      { category: 'เงินเดือน', total: 25000, share: 100, shareText: '100%', width: 100 },
    ]);
  });

  it('shows less than one percent instead of 0% for a tiny category', () => {
    const rows = chartRows(
      [
        { type: 'expense', category: 'อาหาร', total: 1000, entryCount: 1 },
        { type: 'expense', category: 'ขนม', total: 4, entryCount: 1 },
      ],
      'expense'
    );

    expect(rows[1].shareText).toBe('<1%');
  });

  it('drops rows whose total is 0', () => {
    const rows = chartRows(
      [
        { type: 'expense', category: 'อาหาร', total: 100, entryCount: 1 },
        { type: 'expense', category: 'เดินทาง', total: 0, entryCount: 0 },
      ],
      'expense'
    );

    expect(rows.map((row) => row.category)).toEqual(['อาหาร']);
  });

  it('orders equal totals by Thai category name', () => {
    const rows = chartRows(
      [
        { type: 'expense', category: 'ข้าว', total: 100, entryCount: 1 },
        { type: 'expense', category: 'กาแฟ', total: 100, entryCount: 1 },
      ],
      'expense'
    );

    expect(rows.map((row) => row.category)).toEqual(['กาแฟ', 'ข้าว']);
  });

  it('returns an empty list when the type has no entries', () => {
    expect(chartRows([], 'expense')).toEqual([]);
  });
});

describe('hasChartData', () => {
  it('is false for a month without entries', () => {
    expect(hasChartData([])).toBe(false);
    expect(hasChartData([{ type: 'expense', category: 'อาหาร', total: 0, entryCount: 0 }])).toBe(false);
  });

  it('is true when either type has an amount', () => {
    expect(hasChartData([{ type: 'income', category: 'เงินเดือน', total: 100, entryCount: 1 }])).toBe(true);
  });
});

describe('describeExportFailure', () => {
  it('asks to reopen from LINE on 401', () => {
    expect(describeExportFailure(401)).toBe(LOGIN_REQUIRED_MESSAGE);
  });

  it('asks to wait on 429', () => {
    expect(describeExportFailure(429)).toBe('กด Export ถี่เกินไป รอสักครู่แล้วลองใหม่');
  });

  it('asks to try again otherwise', () => {
    expect(describeExportFailure(500)).toBe('Export ไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeExportFailure(undefined)).toBe('Export ไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});

describe('budgetRows', () => {
  it('treats a zero budget as not set instead of showing NaN percent', () => {
    const [row] = budgetRows([{ categoryId: 'c1', category: 'อาหาร', budget: 0, spent: 0 }]);

    expect(row).toMatchObject({ budget: null, level: 'none', percent: null, width: 0 });
    expect(row.text).toBe('ใช้ไป 0 บาท · ยังไม่ตั้งงบ');
  });

  it('describes spending against the budget with a level and a capped bar', () => {
    const rows = budgetRows([
      { categoryId: 'c1', category: 'อาหาร', budget: 5000, spent: 4030 },
      { categoryId: 'c2', category: 'ช้อปปิ้ง', budget: 1000, spent: 1500 },
      { categoryId: 'c3', category: 'เดินทาง', budget: 2000, spent: 100 },
    ]);

    expect(rows).toEqual([
      { categoryId: 'c1', category: 'อาหาร', budget: 5000, spent: 4030, level: 'warn', percent: 80, width: 80, text: 'ใช้ไป 4,030 บาท จาก 5,000 บาท (80%)' },
      { categoryId: 'c2', category: 'ช้อปปิ้ง', budget: 1000, spent: 1500, level: 'over', percent: 150, width: 100, text: 'ใช้ไป 1,500 บาท จาก 1,000 บาท (150%)' },
      { categoryId: 'c3', category: 'เดินทาง', budget: 2000, spent: 100, level: 'ok', percent: 5, width: 5, text: 'ใช้ไป 100 บาท จาก 2,000 บาท (5%)' },
    ]);
  });

  it('puts categories without a budget last', () => {
    const rows = budgetRows([
      { categoryId: 'c1', category: 'กาแฟ', budget: null, spent: 45 },
      { categoryId: 'c2', category: 'อาหาร', budget: 5000, spent: 0 },
    ]);

    expect(rows.map((row) => row.categoryId)).toEqual(['c2', 'c1']);
    expect(rows[1]).toEqual({
      categoryId: 'c1',
      category: 'กาแฟ',
      budget: null,
      spent: 45,
      level: 'none',
      percent: null,
      width: 0,
      text: 'ใช้ไป 45 บาท · ยังไม่ตั้งงบ',
    });
  });

  it('switches level exactly at 80 and 100 percent', () => {
    const levelOf = (spent) => {
      const { level, percent } = budgetRows([{ categoryId: 'c1', category: 'อาหาร', budget: 5000, spent }])[0];
      return { level, percent };
    };

    expect(levelOf(3999.99)).toEqual({ level: 'ok', percent: 79 });
    expect(levelOf(4000)).toEqual({ level: 'warn', percent: 80 });
    expect(levelOf(4999.99)).toEqual({ level: 'warn', percent: 99 });
    expect(levelOf(5000)).toEqual({ level: 'over', percent: 100 });
  });

  it('rounds the percent down so 79.99 is not shown as 80', () => {
    expect(budgetRows([{ categoryId: 'c1', category: 'อาหาร', budget: 5000, spent: 3999.5 }])[0]).toMatchObject({
      level: 'ok',
      percent: 79,
    });
  });
});

describe('formatMonthLabel', () => {
  it('shows month then year', () => {
    expect(formatMonthLabel('2026-09')).toBe('09/2026');
  });
});

describe('describeBudgetFailure', () => {
  it('explains each failure', () => {
    expect(describeBudgetFailure(401)).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(describeBudgetFailure(400)).toBe('จำนวนเงินไม่ถูกต้อง ใส่ได้ไม่เกิน 10,000,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง');
    expect(describeBudgetFailure(404)).toBe('ไม่พบหมวดนี้แล้ว');
    expect(describeBudgetFailure(500)).toBe('บันทึกงบไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBudgetFailure(undefined)).toBe('บันทึกงบไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});

describe('createLatestGuard', () => {
  it('treats only the newest started request as current', () => {
    const guard = createLatestGuard();

    const first = guard.start();
    expect(guard.isCurrent(first)).toBe(true);

    const second = guard.start();
    expect(guard.isCurrent(first)).toBe(false);
    expect(guard.isCurrent(second)).toBe(true);
  });
});
