import { describe, expect, it } from 'vitest';
import {
  barGeometry,
  describeDiff,
  describeHero,
  filterBudgetRows,
  formatNumber,
  groupBudgetRows,
  levelOfPercent,
  pageBudgetRows,
  sectionsForTab,
  sortBudgetRows,
  summarizeBudgets,
} from './budgets-format.mjs';

const BUDGETS = [
  { categoryId: 'food', category: 'อาหาร', budget: 6000, spent: 4200 },
  { categoryId: 'shop', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 },
  { categoryId: 'move', category: 'เดินทาง', budget: 2000, spent: 1900 },
  { categoryId: 'fun', category: 'บันเทิง', budget: null, spent: 620 },
  { categoryId: 'other', category: 'อื่นๆ', budget: null, spent: 150 },
];

describe('levelOfPercent', () => {
  it('switches exactly at 80 and 100', () => {
    expect([79, 80, 99, 100].map(levelOfPercent)).toEqual(['ok', 'warn', 'warn', 'over']);
  });
});

describe('groupBudgetRows', () => {
  it('splits into risk, calm and unset with the most used first', () => {
    const groups = groupBudgetRows(BUDGETS);

    expect(groups.risk.map((row) => row.categoryId)).toEqual(['shop', 'move']);
    expect(groups.calm.map((row) => row.categoryId)).toEqual(['food']);
    expect(groups.unset.map((row) => row.categoryId)).toEqual(['fun', 'other']);
  });

  it('breaks percent ties by spent amount', () => {
    const groups = groupBudgetRows([
      { categoryId: 'a', category: 'ก', budget: 100, spent: 100 },
      { categoryId: 'b', category: 'ข', budget: 1000, spent: 1000 },
    ]);

    expect(groups.risk.map((row) => row.categoryId)).toEqual(['b', 'a']);
  });

  it('treats a zero budget as unset', () => {
    const groups = groupBudgetRows([{ categoryId: 'a', category: 'ก', budget: 0, spent: 5 }]);

    expect(groups.unset).toHaveLength(1);
    expect(groups.risk).toHaveLength(0);
  });
});

describe('summarizeBudgets', () => {
  it('sums only the categories that have a budget', () => {
    expect(summarizeBudgets(BUDGETS)).toEqual({
      hasBudgets: true,
      totalBudget: 11000,
      totalSpent: 9550,
      left: 1450,
      percent: 86,
      level: 'warn',
      counts: { over: 1, warn: 1, ok: 1 },
    });
  });

  it('reports no budgets when every category is unset', () => {
    const summary = summarizeBudgets([BUDGETS[3], BUDGETS[4]]);

    expect(summary.hasBudgets).toBe(false);
    expect(summary.counts).toEqual({ over: 0, warn: 0, ok: 0 });
  });

  it('goes negative and over when the total is exceeded', () => {
    const summary = summarizeBudgets([{ categoryId: 'a', category: 'ก', budget: 1000, spent: 1500 }]);

    expect(summary).toMatchObject({ left: -500, percent: 150, level: 'over' });
  });
});

describe('describeHero', () => {
  it('says how much is left', () => {
    expect(describeHero(summarizeBudgets(BUDGETS))).toEqual({ percentText: '86%', restText: 'เหลือ 1,450 บาท', level: 'warn' });
  });

  it('says how much the total is exceeded by', () => {
    const summary = summarizeBudgets([{ categoryId: 'a', category: 'ก', budget: 1000, spent: 1500 }]);

    expect(describeHero(summary).restText).toBe('เกินงบรวม 500 บาท');
  });
});

describe('describeDiff', () => {
  const row = (budget, spent) => groupBudgetRows([{ categoryId: 'a', category: 'ก', budget, spent }]);

  it('describes over, exact and remaining amounts', () => {
    expect(describeDiff(row(3000, 3450).risk[0])).toBe('เกิน 450');
    expect(describeDiff(row(900, 900).risk[0])).toBe('เต็มพอดี');
    expect(describeDiff(row(2000, 1900).risk[0])).toBe('เหลือ 100');
  });

  it('does not drift on decimals', () => {
    expect(describeDiff(row(100.1, 100.05).risk[0])).toBe('เหลือ 0.05');
  });
});

describe('barGeometry', () => {
  const rowAt = (percent) => ({ percent });

  it('fills partly and adds nothing above the line below 100 percent', () => {
    expect(barGeometry(rowAt(70), { h100: 130 })).toEqual({ fillH: 91, overH: 0, barH: 130, labelBottom: 134 });
  });

  it('adds a red cap above the 100 percent line', () => {
    expect(barGeometry(rowAt(115), { h100: 130 })).toEqual({ fillH: 130, overH: 19.5, barH: 149.5, labelBottom: 153.5 });
  });

  it('caps the red part at 30 percent so the label stays on screen', () => {
    expect(barGeometry(rowAt(300), { h100: 130 }).overH).toBe(39);
  });
});

describe('pageBudgetRows', () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({ categoryId: `c${index}` }));

  it('returns the first six and the page count', () => {
    const result = pageBudgetRows(rows, 0);

    expect(result.items).toHaveLength(6);
    expect(result.pageCount).toBe(2);
  });

  it('clamps an out of range page', () => {
    const result = pageBudgetRows(rows, 5);

    expect(result.page).toBe(1);
    expect(result.items).toHaveLength(2);
  });

  it('has one page for an empty list', () => {
    expect(pageBudgetRows([], 0)).toEqual({ items: [], page: 0, pageCount: 1 });
  });
});

describe('filterBudgetRows', () => {
  const rows = [{ category: 'อาหาร' }, { category: 'Gym' }];

  it('matches a trimmed query ignoring case', () => {
    expect(filterBudgetRows(rows, ' อาหาร ')).toEqual([rows[0]]);
    expect(filterBudgetRows(rows, 'GYM')).toEqual([rows[1]]);
  });

  it('returns everything for an empty query', () => {
    expect(filterBudgetRows(rows, '   ')).toEqual(rows);
  });
});

describe('sortBudgetRows', () => {
  it('sorts by usage with unset rows last', () => {
    const { risk, calm, unset } = groupBudgetRows(BUDGETS);
    const sorted = sortBudgetRows([...unset, ...calm, ...risk], 'usage');

    expect(sorted.map((row) => row.categoryId)).toEqual(['shop', 'move', 'food', 'fun', 'other']);
  });

  it('sorts by Thai name', () => {
    const sorted = sortBudgetRows([{ category: 'อาหาร' }, { category: 'กาแฟ' }], 'name');

    expect(sorted.map((row) => row.category)).toEqual(['กาแฟ', 'อาหาร']);
  });

  it('does not mutate the input', () => {
    const rows = [{ category: 'ข' }, { category: 'ก' }];
    sortBudgetRows(rows, 'name');

    expect(rows[0].category).toBe('ข');
  });
});

describe('sectionsForTab', () => {
  it('splits risk into over and warn and drops empty sections', () => {
    const { risk } = groupBudgetRows(BUDGETS);

    expect(sectionsForTab('risk', risk).map((section) => [section.title, section.rows.length])).toEqual([
      ['เต็มหรือเกินงบ', 1],
      ['ใกล้เต็ม', 1],
    ]);
    expect(sectionsForTab('risk', [risk[0]])).toHaveLength(1);
  });

  it('splits calm at 50 percent', () => {
    const rows = [{ percent: 70 }, { percent: 49 }];

    expect(sectionsForTab('calm', rows).map((section) => section.title)).toEqual(['ใช้ 50-79% ของงบ', 'ใช้ต่ำกว่า 50%']);
  });

  it('uses a single untitled section for unset', () => {
    expect(sectionsForTab('unset', [{ categoryId: 'a' }])).toEqual([{ title: null, rows: [{ categoryId: 'a' }] }]);
    expect(sectionsForTab('unset', [])).toEqual([]);
  });
});

describe('formatNumber', () => {
  it('groups thousands and keeps at most two decimals', () => {
    expect(formatNumber(10460)).toBe('10,460');
    expect(formatNumber(0.05)).toBe('0.05');
  });
});
