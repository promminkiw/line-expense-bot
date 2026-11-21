import { describe, it, expect } from 'vitest';
import th from './messages/th.mjs';
import en from './messages/en.mjs';

// ยกเว้น U+0E3F (฿) เพราะเป็นสัญลักษณ์เงินที่ en ใช้ได้
const THAI_CHARS = /[฀-฾เ-๿]/;

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

describe('message catalogs', () => {
  it('have the same keys in th and en', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort());
  });

  it('use the same placeholders for every key', () => {
    for (const key of Object.keys(th)) {
      expect(placeholders(en[key]), key).toEqual(placeholders(th[key]));
    }
  });

  it('keep Thai characters out of en except language names', () => {
    for (const [key, text] of Object.entries(en)) {
      if (key.startsWith('common.language.')) continue;
      expect(THAI_CHARS.test(text), key).toBe(false);
    }
  });

  it('only hold non-empty strings', () => {
    for (const catalog of [th, en]) {
      for (const [key, text] of Object.entries(catalog)) {
        expect(typeof text, key).toBe('string');
        expect(text.length, key).toBeGreaterThan(0);
      }
    }
  });
});
