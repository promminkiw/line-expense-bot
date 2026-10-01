// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createEmptyState } from './empty-state.mjs';

describe('createEmptyState', () => {
  it.each([
    ['list', 'empty-list', 'ยังไม่มีรายการในเดือนนี้'],
    ['search', 'empty-search', 'ไม่พบรายการที่ค้นหา'],
    ['summary', 'empty-chart', 'ยังไม่มีข้อมูลสรุปในเดือนนี้'],
    ['recurring', 'empty-recurring', 'ยังไม่มีรายการประจำ'],
  ])('builds the %s state with its illustration and title', (kind, symbol, title) => {
    const el = createEmptyState(document, kind);

    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('empty-state');
    expect(el.querySelector('use').getAttribute('href')).toBe(`#${symbol}`);
    expect(el.querySelector('.empty-title').textContent).toBe(title);
    expect(el.querySelector('.empty-hint').textContent.length).toBeGreaterThan(0);
  });

  it('can use another tag so it can live inside a list', () => {
    expect(createEmptyState(document, 'list', 'li').tagName).toBe('LI');
  });

  it('throws for an unknown kind so a typo is caught early', () => {
    expect(() => createEmptyState(document, 'nope')).toThrow('Unknown empty state: nope');
  });
});
