import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const { monthsEndingAt, buildTrend } = createRequire(import.meta.url)('./trend.js');

describe('monthsEndingAt', () => {
  it('lists 6 months oldest first and crosses the year boundary', () => {
    expect(monthsEndingAt('2026-03')).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('ends at the given month when no year boundary is crossed', () => {
    expect(monthsEndingAt('2026-10')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });
});

describe('buildTrend', () => {
  it('fills missing months and types with zero', () => {
    const rows = [
      { month: '2026-09', type: 'expense', total: 500.25 },
      { month: '2026-10', type: 'income', total: 25000 },
    ];

    const trend = buildTrend('2026-10', rows);

    expect(trend).toHaveLength(6);
    expect(trend[0]).toEqual({ month: '2026-05', income: 0, expense: 0 });
    expect(trend[4]).toEqual({ month: '2026-09', income: 0, expense: 500.25 });
    expect(trend[5]).toEqual({ month: '2026-10', income: 25000, expense: 0 });
  });

  it('ignores rows outside the window and unknown types', () => {
    const rows = [
      { month: '2025-01', type: 'expense', total: 999 },
      { month: '2026-10', type: 'transfer', total: 5 },
    ];

    const trend = buildTrend('2026-10', rows);

    expect(trend.every((entry) => entry.income === 0 && entry.expense === 0)).toBe(true);
  });
});
