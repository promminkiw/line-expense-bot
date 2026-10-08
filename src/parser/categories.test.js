import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, SLIP_CATEGORY, TEXT_CATEGORIES, normalizeCategory } from './categories.js';

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
