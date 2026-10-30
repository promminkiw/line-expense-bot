import { describe, it, expect } from 'vitest';
import { CATEGORY_ICONS, CATEGORY_ICON_KEYS } from './category-icons.mjs';
import { CATEGORY_ICONS as SERVER_ICONS } from '../../../src/parser/categories.js';

describe('CATEGORY_ICONS', () => {
  it('matches the list the server accepts, in the same order', () => {
    expect(CATEGORY_ICON_KEYS).toEqual(SERVER_ICONS);
  });

  it('gives every icon a Thai label for screen readers', () => {
    expect(CATEGORY_ICONS.map((icon) => icon.key)).toEqual(CATEGORY_ICON_KEYS);
    for (const icon of CATEGORY_ICONS) expect(icon.label.length).toBeGreaterThan(0);
    expect(CATEGORY_ICONS.find((icon) => icon.key === 'pet').label).toBe('สัตว์เลี้ยง');
  });
});
