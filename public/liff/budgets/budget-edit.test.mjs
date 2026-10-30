import { describe, expect, it } from 'vitest';
import { BUDGET_STEP, MAX_BUDGET, parseBudgetAmount, previewBudget, quickChips, stepBudget } from './budget-edit.mjs';

describe('parseBudgetAmount', () => {
  it('accepts plain numbers, commas and two decimals', () => {
    expect(parseBudgetAmount('3500')).toBe(3500);
    expect(parseBudgetAmount('3,500')).toBe(3500);
    expect(parseBudgetAmount(' 1,234.5 ')).toBe(1234.5);
    expect(parseBudgetAmount('0.01')).toBe(0.01);
  });

  it('rejects empty, zero, negative, text and too many decimals', () => {
    for (const bad of ['', '   ', '0', '0.00', '-5', 'abc', '12abc', '1.234', '1.', '.5']) {
      expect(parseBudgetAmount(bad), bad).toBeNull();
    }
  });

  it('rejects amounts above the limit and accepts the limit itself', () => {
    expect(parseBudgetAmount('10000000')).toBe(MAX_BUDGET);
    expect(parseBudgetAmount('10000000.01')).toBeNull();
  });
});

describe('stepBudget', () => {
  it('adds and removes 500', () => {
    expect(stepBudget(3000, 1)).toBe(3500);
    expect(stepBudget(3000, -1)).toBe(2500);
  });

  it('starts from the step when the field is empty', () => {
    expect(stepBudget(null, 1)).toBe(BUDGET_STEP);
  });

  it('does not go below the smallest budget', () => {
    expect(stepBudget(500, -1)).toBe(500);
    expect(stepBudget(300, -1)).toBe(300);
    expect(stepBudget(null, -1)).toBeNull();
  });

  it('caps at the limit', () => {
    expect(stepBudget(9999800, 1)).toBe(MAX_BUDGET);
  });

  it('keeps decimals exact', () => {
    expect(stepBudget(1000.1, 1)).toBe(1500.1);
  });
});

describe('previewBudget', () => {
  const row = { categoryId: 'a', category: 'ช้อปปิ้ง', budget: 3000, spent: 3450 };

  it('shows before and after for a changed amount', () => {
    expect(previewBudget(row, 3500)).toEqual({
      before: { percent: 115, level: 'over', diffText: 'เกิน 450' },
      after: { percent: 98, level: 'warn', diffText: 'เหลือ 50' },
    });
  });

  it('has no before for a category without a budget', () => {
    const unset = { categoryId: 'b', category: 'บันเทิง', budget: null, spent: 620 };

    expect(previewBudget(unset, 1000)).toEqual({
      before: null,
      after: { percent: 62, level: 'ok', diffText: 'เหลือ 380' },
    });
  });

  it('has no after while the amount is not valid', () => {
    expect(previewBudget(row, null).after).toBeNull();
  });
});

describe('quickChips', () => {
  it('offers spent, plus 10 percent and plus 20 percent for a category with a budget', () => {
    const chips = quickChips({ budget: 3000, spent: 3450 });

    expect(chips).toEqual([
      { label: 'เท่าที่ใช้จริง', value: 3450 },
      { label: 'เพิ่ม 10%', value: 3300 },
      { label: 'เพิ่ม 20%', value: 3600 },
    ]);
  });

  it('offers spent and rounded-up values for a category without a budget', () => {
    expect(quickChips({ budget: null, spent: 620 })).toEqual([
      { label: 'เท่าที่ใช้จริง', value: 620 },
      { label: 'ปัดขึ้น', value: 700 },
      { label: 'ปัดขึ้น', value: 1000 },
    ]);
  });

  it('drops duplicates and values equal to the current budget', () => {
    expect(quickChips({ budget: null, spent: 1000 })).toEqual([{ label: 'เท่าที่ใช้จริง', value: 1000 }]);
    expect(quickChips({ budget: 3450, spent: 3450 }).map((chip) => chip.label)).toEqual(['เพิ่ม 10%', 'เพิ่ม 20%']);
  });

  it('offers nothing when nothing has been spent', () => {
    expect(quickChips({ budget: null, spent: 0 })).toEqual([]);
  });

  it('keeps the percent chips for a category with a budget even when nothing has been spent', () => {
    expect(quickChips({ budget: 3000, spent: 0 }).map((chip) => chip.label)).toEqual(['เพิ่ม 10%', 'เพิ่ม 20%']);
  });

  it('rounds the spent amount up to a whole baht', () => {
    expect(quickChips({ budget: null, spent: 620.5 })[0].value).toBe(621);
  });
});
