import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, normalizeCategory } from './categories.js';

describe('DEFAULT_CATEGORIES', () => {
  it('includes fallback category in both types', () => {
    expect(DEFAULT_CATEGORIES.expense).toContain(FALLBACK_CATEGORY);
    expect(DEFAULT_CATEGORIES.income).toContain(FALLBACK_CATEGORY);
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

  it('falls back for unknown category', () => {
    expect(normalizeCategory('expense', 'ของเล่นแมว')).toBe('อื่นๆ');
  });
});
