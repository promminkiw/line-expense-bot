// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { categoryStyle, createCategoryBadge } from './categories.mjs';

describe('categoryStyle', () => {
  it.each([
    ['อาหาร', 'food'],
    ['เดินทาง', 'transport'],
    ['ช้อปปิ้ง', 'shopping'],
    ['บิล/ค่าบริการ', 'bill'],
    ['สุขภาพ', 'health'],
    ['บันเทิง', 'fun'],
    ['เงินเดือน', 'salary'],
    ['รายได้เสริม', 'side'],
    ['อื่นๆ', 'other'],
  ])('maps %s to %s', (name, key) => {
    expect(categoryStyle(name)).toEqual({ key, symbol: `cat-${key}`, className: `cat-${key}` });
  });

  it('falls back to other for unknown names, including names that look like object keys', () => {
    expect(categoryStyle('หมวดที่ผู้ใช้ตั้งเอง').key).toBe('other');
    expect(categoryStyle('constructor').key).toBe('other');
    expect(categoryStyle('').key).toBe('other');
    expect(categoryStyle(undefined).key).toBe('other');
  });
});

describe('createCategoryBadge', () => {
  it('wraps the category icon in a colored badge', () => {
    const badge = createCategoryBadge(document, 'อาหาร');

    expect(badge.className).toBe('cat-badge cat-food');
    expect(badge.querySelector('use').getAttribute('href')).toBe('#cat-food');
  });
});
