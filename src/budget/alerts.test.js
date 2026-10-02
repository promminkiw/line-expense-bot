import { describe, it, expect } from 'vitest';
import { budgetMonths, findBudgetAlerts, formatBudgetAlerts, describeBudgetAlert } from './alerts.js';

function row({ type = 'expense', categoryId = 'c-food', amount = 60, date = '2026-09-29' } = {}) {
  return { type, category_id: categoryId, amount, occurred_on: date };
}

function status({ categoryId = 'c-food', category = 'อาหาร', budget = 5000, spent } = {}) {
  return { categoryId, category, budget, spent };
}

function byMonth(month, rows) {
  return new Map([[month, rows]]);
}

describe('budgetMonths', () => {
  it('lists each month of the expense rows once', () => {
    expect(
      budgetMonths([row({ date: '2026-09-29' }), row({ date: '2026-09-01' }), row({ date: '2026-08-31' })])
    ).toEqual(['2026-09', '2026-08']);
  });

  it('ignores income rows', () => {
    expect(budgetMonths([row({ type: 'income' })])).toEqual([]);
  });
});

describe('findBudgetAlerts', () => {
  it('warns when the category total is at least 80 percent after the save', () => {
    const alerts = findBudgetAlerts([row({ amount: 60 })], byMonth('2026-09', [status({ spent: 4030 })]));

    expect(alerts).toEqual([{ level: 'warn', month: '2026-09', category: 'อาหาร', spent: 4030, budget: 5000 }]);
  });

  it('warns at exactly 80 percent', () => {
    const alerts = findBudgetAlerts([row({ amount: 100 })], byMonth('2026-09', [status({ spent: 4000 })]));

    expect(alerts.map((alert) => alert.level)).toEqual(['warn']);
  });

  it('gives no alert for a zero budget instead of showing NaN percent', () => {
    expect(findBudgetAlerts([row()], byMonth('2026-09', [status({ budget: 0, spent: 0 })]))).toEqual([]);
    expect(findBudgetAlerts([row()], byMonth('2026-09', [status({ budget: 0, spent: 60 })]))).toEqual([]);
  });

  it('gives no alert below 80 percent', () => {
    expect(findBudgetAlerts([row({ amount: 60 })], byMonth('2026-09', [status({ spent: 3999.99 })]))).toEqual([]);
  });

  it('warns again on every save while above 80 percent', () => {
    const alerts = findBudgetAlerts([row({ amount: 60 })], byMonth('2026-09', [status({ spent: 4100 })]));

    expect(alerts.map((alert) => alert.level)).toEqual(['warn']);
  });

  it('says over budget when the total is above 100 percent', () => {
    const alerts = findBudgetAlerts([row({ amount: 60 })], byMonth('2026-09', [status({ spent: 5010 })]));

    expect(alerts).toEqual([{ level: 'over', month: '2026-09', category: 'อาหาร', spent: 5010, budget: 5000 }]);
  });

  it('says over budget at exactly 100 percent', () => {
    const alerts = findBudgetAlerts([row({ amount: 100 })], byMonth('2026-09', [status({ spent: 5000 })]));

    expect(alerts).toEqual([{ level: 'over', month: '2026-09', category: 'อาหาร', spent: 5000, budget: 5000 }]);
  });

  it('says over budget on every save while at or above 100 percent', () => {
    const alerts = findBudgetAlerts([row({ amount: 60 })], byMonth('2026-09', [status({ spent: 5200 })]));

    expect(alerts.map((alert) => alert.level)).toEqual(['over']);
  });

  it('alerts on the total even when the entry itself is tiny', () => {
    const alerts = findBudgetAlerts([row({ amount: 0.01 })], byMonth('2026-09', [status({ spent: 4500 })]));

    expect(alerts.map((alert) => alert.level)).toEqual(['warn']);
  });

  it('compares in satang so 80 percent of a decimal budget is not missed', () => {
    // 0.08 >= 0.1 * 0.8 เป็น false ใน float แต่ 8 * 5 >= 10 * 4 เป็น true ในสตางค์
    const alerts = findBudgetAlerts([row({ amount: 0.01 })], byMonth('2026-09', [status({ budget: 0.1, spent: 0.08 })]));

    expect(alerts.map((alert) => alert.level)).toEqual(['warn']);
  });

  it('reports only over budget when one message crosses both lines', () => {
    const alerts = findBudgetAlerts([row({ amount: 2000 })], byMonth('2026-09', [status({ spent: 5100 })]));

    expect(alerts.map((alert) => alert.level)).toEqual(['over']);
  });

  it('gives one alert for several entries of the same category in one message', () => {
    const alerts = findBudgetAlerts(
      [row({ amount: 30 }), row({ amount: 30 })],
      byMonth('2026-09', [status({ spent: 4030 })])
    );

    expect(alerts).toHaveLength(1);
  });

  it('uses the budget of the month the entry happened in', () => {
    const alerts = findBudgetAlerts(
      [row({ amount: 60, date: '2026-08-31' })],
      new Map([
        ['2026-08', [status({ spent: 4030 })]],
        ['2026-09', [status({ spent: 0 })]],
      ])
    );

    expect(alerts).toEqual([{ level: 'warn', month: '2026-08', category: 'อาหาร', spent: 4030, budget: 5000 }]);
  });

  it('skips categories without a budget, unknown categories and income', () => {
    const statuses = byMonth('2026-09', [status({ budget: null, spent: 9000 })]);

    expect(findBudgetAlerts([row({ amount: 9000 })], statuses)).toEqual([]);
    expect(findBudgetAlerts([row({ categoryId: 'c-other', amount: 9000 })], statuses)).toEqual([]);
    expect(findBudgetAlerts([row({ type: 'income', amount: 9000 })], statuses)).toEqual([]);
  });
});

describe('formatBudgetAlerts', () => {
  it('writes one line per alert with month, amounts and the rounded down percent', () => {
    expect(
      formatBudgetAlerts([
        { level: 'warn', month: '2026-09', category: 'อาหาร', spent: 4030, budget: 5000 },
        { level: 'over', month: '2026-09', category: 'เดินทาง', spent: 1234.5, budget: 1000 },
      ])
    ).toBe(
      'ใกล้เต็มงบ อาหาร เดือน 09/2026: ใช้ไป 4,030 จาก 5,000 บาท (80%)\n' +
        'เกินงบ เดินทาง เดือน 09/2026: ใช้ไป 1,234.5 จาก 1,000 บาท (123%)'
    );
  });

  it('returns an empty string when there is nothing to say', () => {
    expect(formatBudgetAlerts([])).toBe('');
  });
});

describe('describeBudgetAlert', () => {
  it('splits an alert into a short title and a detail line', () => {
    expect(describeBudgetAlert({ level: 'warn', month: '2026-09', category: 'อาหาร', spent: 135, budget: 150 })).toEqual({
      level: 'warn',
      title: 'ใกล้เต็มงบ อาหาร 90%',
      detail: 'ใช้ไป 135 จาก 150 บาท (เดือน 09/2026)',
    });
  });

  it('labels an over-budget alert and rounds the percent down', () => {
    const described = describeBudgetAlert({ level: 'over', month: '2026-09', category: 'เดินทาง', spent: 1234.5, budget: 1000 });

    expect(described.level).toBe('over');
    expect(described.title).toBe('เกินงบ เดินทาง 123%');
  });
});
