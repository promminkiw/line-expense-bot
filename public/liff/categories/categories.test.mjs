// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { categoryStyle, createCategoryBadge, iconKeyFor, effectiveIconKey } from './categories.mjs';

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
    ['ใบเสร็จ/สลิปโอนเงิน', 'receipt'],
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
  it('wraps the default icon of the category name in a badge', () => {
    const badge = createCategoryBadge(document, 'อาหาร');

    expect(badge.className).toBe('cat-badge cat-food');
    expect(badge.querySelector('use').getAttribute('href')).toBe('#cat-food');
  });

  it('uses the icon the user picked and the tone of the category type', () => {
    const badge = createCategoryBadge(document, 'ค่าแมว', { icon: 'pet', type: 'expense' });

    expect(badge.className).toBe('cat-badge cat-pet cat-tone-expense');
    expect(badge.querySelector('use').getAttribute('href')).toBe('#cat-pet');
    expect(createCategoryBadge(document, 'โบนัส', { icon: 'bonus', type: 'income' }).className).toBe('cat-badge cat-bonus cat-tone-income');
  });

  it('ignores an unknown icon or type', () => {
    expect(createCategoryBadge(document, 'อาหาร', { icon: 'unicorn', type: 'saving' }).className).toBe('cat-badge cat-food');
  });
});

describe('iconKeyFor and effectiveIconKey', () => {
  it('prefers a known picked icon, then the default of the name, then other', () => {
    expect(iconKeyFor('อาหาร', 'coffee')).toBe('coffee');
    expect(iconKeyFor('อาหาร', null)).toBe('food');
    expect(iconKeyFor('ค่าแมว', undefined)).toBe('other');
    expect(iconKeyFor('constructor', 'toString')).toBe('other');
    expect(effectiveIconKey({ name: 'เงินเดือน', icon: null })).toBe('salary');
    expect(effectiveIconKey({ name: 'เงินเดือน', icon: 'bonus' })).toBe('bonus');
  });
});
