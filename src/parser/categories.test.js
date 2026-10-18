import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  SLIP_CATEGORY,
  TEXT_CATEGORIES,
  SYSTEM_CATEGORIES,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_VISIBLE_CATEGORIES,
  MAX_TOTAL_CATEGORIES,
  normalizeCategory,
  isSystemCategory,
  isReservedCategoryName,
  toTextCategories,
} from './categories.js';

describe('DEFAULT_CATEGORIES', () => {
  it('includes fallback category in both types', () => {
    expect(DEFAULT_CATEGORIES.expense).toContain(FALLBACK_CATEGORY);
    expect(DEFAULT_CATEGORIES.income).toContain(FALLBACK_CATEGORY);
  });

  // หมวดสลิปต้องถูกสร้างให้ผู้ใช้ทุกคน จึงอยู่ในชุดเริ่มต้นของรายจ่าย
  it('includes the slip category as an expense category', () => {
    expect(SLIP_CATEGORY).toBe('ใบเสร็จ/สลิปโอนเงิน');
    expect(DEFAULT_CATEGORIES.expense).toContain(SLIP_CATEGORY);
    expect(DEFAULT_CATEGORIES.income).not.toContain(SLIP_CATEGORY);
  });
});

describe('TEXT_CATEGORIES', () => {
  it('offers every default category except the slip category to typed messages', () => {
    expect(TEXT_CATEGORIES.expense).toEqual(DEFAULT_CATEGORIES.expense.filter((name) => name !== SLIP_CATEGORY));
    expect(TEXT_CATEGORIES.income).toEqual(DEFAULT_CATEGORIES.income);
  });
});

describe('normalizeCategory', () => {
  it('keeps a known expense category', () => {
    expect(normalizeCategory('expense', 'อาหาร')).toBe('อาหาร');
  });

  it('keeps a known income category', () => {
    expect(normalizeCategory('income', 'เงินเดือน')).toBe('เงินเดือน');
  });

  it('falls back when category belongs to the other type', () => {
    expect(normalizeCategory('income', 'อาหาร')).toBe('อื่นๆ');
  });

  it('falls back when a typed message gets the slip category', () => {
    expect(normalizeCategory('expense', SLIP_CATEGORY)).toBe('อื่นๆ');
  });

  it('falls back for unknown category', () => {
    expect(normalizeCategory('expense', 'ของเล่นแมว')).toBe('อื่นๆ');
  });
});

describe('normalizeCategory with the user categories', () => {
  const USER = { expense: ['ค่าแมว', 'อื่นๆ'], income: ['อื่นๆ'] };

  it('keeps a category from the given list', () => {
    expect(normalizeCategory('expense', 'ค่าแมว', USER)).toBe('ค่าแมว');
  });

  it('falls back to อื่นๆ for a default category the user does not have', () => {
    expect(normalizeCategory('expense', 'อาหาร', USER)).toBe('อื่นๆ');
  });
});

describe('SYSTEM_CATEGORIES', () => {
  it('lists the categories the code refers to by name', () => {
    expect(SYSTEM_CATEGORIES).toEqual({ expense: [SLIP_CATEGORY, FALLBACK_CATEGORY], income: [FALLBACK_CATEGORY] });
  });

  it('caps names and visible categories at 30', () => {
    expect(MAX_CATEGORY_NAME_LENGTH).toBe(30);
    expect(MAX_VISIBLE_CATEGORIES).toBe(30);
    expect(MAX_TOTAL_CATEGORIES).toBe(100);
  });
});

describe('isSystemCategory', () => {
  it.each([
    ['expense', 'อื่นๆ', true],
    ['income', 'อื่นๆ', true],
    ['expense', 'ใบเสร็จ/สลิปโอนเงิน', true],
    ['income', 'ใบเสร็จ/สลิปโอนเงิน', false],
    ['expense', 'อาหาร', false],
    ['other', 'อื่นๆ', false],
  ])('%s %s -> %s', (type, name, expected) => {
    expect(isSystemCategory(type, name)).toBe(expected);
  });
});

describe('isReservedCategoryName', () => {
  it('reserves the system names for any type', () => {
    expect(isReservedCategoryName('อื่นๆ')).toBe(true);
    expect(isReservedCategoryName('ใบเสร็จ/สลิปโอนเงิน')).toBe(true);
    expect(isReservedCategoryName('อาหาร')).toBe(false);
  });
});

describe('toTextCategories', () => {
  it('keeps visible names by type and drops hidden ones and the slip category', () => {
    const categories = [
      { type: 'expense', name: 'อาหาร', hidden: false },
      { type: 'expense', name: 'ค่าแมว', hidden: false },
      { type: 'expense', name: 'บันเทิง', hidden: true },
      { type: 'expense', name: SLIP_CATEGORY, hidden: false },
      { type: 'expense', name: 'อื่นๆ', hidden: false },
      { type: 'income', name: 'เงินเดือน', hidden: false },
      { type: 'income', name: 'อื่นๆ', hidden: false },
    ];

    expect(toTextCategories(categories)).toEqual({
      expense: ['อาหาร', 'ค่าแมว', 'อื่นๆ'],
      income: ['เงินเดือน', 'อื่นๆ'],
    });
  });

  it('always offers อื่นๆ even when the row is missing', () => {
    expect(toTextCategories([{ type: 'expense', name: 'อาหาร', hidden: false }])).toEqual({
      expense: ['อาหาร', 'อื่นๆ'],
      income: ['อื่นๆ'],
    });
  });

  it('treats a row without the hidden field as visible', () => {
    expect(toTextCategories([{ type: 'income', name: 'โบนัส' }]).income).toEqual(['โบนัส', 'อื่นๆ']);
  });
});
