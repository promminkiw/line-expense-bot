// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createEmptyState } from './empty-state.mjs';
import { setLang } from '../i18n/current.mjs';

describe('createEmptyState', () => {
  it.each([
    ['list', 'empty-list', 'ยังไม่มีรายการในเดือนที่เลือก'],
    ['search', 'empty-search', 'ไม่พบรายการที่ค้นหา'],
    ['summary', 'empty-chart', 'ยังไม่มีข้อมูลสรุปในเดือนที่เลือก'],
    ['recurring', 'empty-recurring', 'ยังไม่มีรายการประจำ'],
  ])('builds the %s state with its illustration and title', (kind, symbol, title) => {
    const el = createEmptyState(document, kind);

    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('empty-state');
    expect(el.querySelector('use').getAttribute('href')).toBe(`#${symbol}`);
    expect(el.querySelector('.empty-title').textContent).toBe(title);
    expect(el.querySelector('.empty-hint').textContent.length).toBeGreaterThan(0);
  });

  it('says the recurring hint covers income and expenses', () => {
    const hint = createEmptyState(document, 'recurring').querySelector('.empty-hint').textContent;

    expect(hint).toBe('เพิ่มรายรับรายจ่ายที่เกิดทุกเดือน เช่น ค่าเน็ต เงินเดือน แล้วเฮียจะบันทึกให้เอง');
  });

  it('can use another tag so it can live inside a list', () => {
    expect(createEmptyState(document, 'list', 'li').tagName).toBe('LI');
  });

  it('throws for an unknown kind so a typo is caught early', () => {
    expect(() => createEmptyState(document, 'nope')).toThrow('Unknown empty state: nope');
  });
});

describe('createEmptyState in English', () => {
  afterEach(() => setLang('th'));

  it('uses the current language', () => {
    setLang('en');
    const el = createEmptyState(document, 'list');

    expect(el.querySelector('.empty-title').textContent).toBe('No entries this month yet');
    expect(el.querySelector('.empty-hint').textContent).toBe('Just type in the chat, like "lunch 60", and I\'ll log it for you');
  });
});
