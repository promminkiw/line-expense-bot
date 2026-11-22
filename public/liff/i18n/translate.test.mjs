import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  normalizeLanguage,
  languageFromTag,
  t,
  formatAmount,
  formatMonth,
  formatDate,
  catalogs,
} from './translate.mjs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('language helpers', () => {
  it('exposes th and en with th as default', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(['th', 'en']);
    expect(DEFAULT_LANGUAGE).toBe('th');
  });

  it.each([
    ['th', 'th'],
    ['en', 'en'],
    ['fr', 'th'],
    [null, 'th'],
    [undefined, 'th'],
    ['', 'th'],
  ])('normalizeLanguage(%s) -> %s', (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  it.each([
    ['en-US', 'en'],
    ['en', 'en'],
    ['EN-gb', 'en'],
    ['th', 'th'],
    ['th-TH', 'th'],
    ['ja', 'th'],
    ['', 'th'],
    [null, 'th'],
    [undefined, 'th'],
  ])('languageFromTag(%s) -> %s', (input, expected) => {
    expect(languageFromTag(input)).toBe(expected);
  });
});

describe('t', () => {
  it('returns the message for the language', () => {
    expect(t('th', 'common.baht')).toBe('บาท');
    expect(t('en', 'common.language.en')).toBe('English');
  });

  it('replaces {name} placeholders', () => {
    catalogs.th['test.hello'] = 'สวัสดี {name} {name}';
    catalogs.en['test.hello'] = 'Hi {name} {name}';
    expect(t('th', 'test.hello', { name: 'A' })).toBe('สวัสดี A A');
    expect(t('en', 'test.hello', { name: 'B' })).toBe('Hi B B');
    delete catalogs.th['test.hello'];
    delete catalogs.en['test.hello'];
  });

  it('keeps unknown placeholders untouched', () => {
    catalogs.th['test.keep'] = 'x {a} {b}';
    expect(t('th', 'test.keep', { a: 1 })).toBe('x 1 {b}');
    delete catalogs.th['test.keep'];
  });

  it('falls back to th and warns once per key when en is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    catalogs.th['test.onlyTh'] = 'เฉพาะไทย {n}';

    expect(t('en', 'test.onlyTh', { n: 1 })).toBe('เฉพาะไทย 1');
    expect(t('en', 'test.onlyTh', { n: 2 })).toBe('เฉพาะไทย 2');

    expect(warn).toHaveBeenCalledTimes(1);
    delete catalogs.th['test.onlyTh'];
  });

  it('throws when the key is missing in every language', () => {
    expect(() => t('th', 'no.such.key')).toThrow(/no\.such\.key/);
    expect(() => t('en', 'no.such.key')).toThrow(/no\.such\.key/);
  });

  it('treats an unknown language as th', () => {
    expect(t('xx', 'common.baht')).toBe('บาท');
  });
});

describe('formatAmount', () => {
  it('formats Thai like the existing bot style', () => {
    expect(formatAmount('th', 1234.5)).toBe('1,234.5 บาท');
    expect(formatAmount('th', 0)).toBe('0 บาท');
    expect(formatAmount('th', 1.239)).toBe('1.24 บาท');
  });

  it('formats English with the baht sign', () => {
    expect(formatAmount('en', 1234.5)).toBe('฿1,234.5');
    expect(formatAmount('en', 50)).toBe('฿50');
  });

  it('puts the minus sign in front of the baht sign in English', () => {
    expect(formatAmount('en', -300)).toBe('-฿300');
    expect(formatAmount('en', -1234.5)).toBe('-฿1,234.5');
    expect(formatAmount('th', -300)).toBe('-300 บาท');
  });
});

describe('formatMonth', () => {
  it('uses the Buddhist year in Thai', () => {
    expect(formatMonth('th', '2026-11', { short: true })).toBe('พ.ย. 2569');
    expect(formatMonth('th', '2026-11')).toBe('พฤศจิกายน 2569');
    expect(formatMonth('th', '2026-01', { short: true })).toBe('ม.ค. 2569');
  });

  it('uses the Gregorian year in English', () => {
    expect(formatMonth('en', '2026-11', { short: true })).toBe('Nov 2026');
    expect(formatMonth('en', '2026-11')).toBe('November 2026');
    expect(formatMonth('en', '2026-12')).toBe('December 2026');
  });
});

describe('formatDate', () => {
  it('formats a date in each language', () => {
    expect(formatDate('th', '2026-11-21')).toBe('21 พ.ย. 2569');
    expect(formatDate('en', '2026-11-21')).toBe('21 Nov 2026');
  });

  it('drops the leading zero of the day', () => {
    expect(formatDate('en', '2026-03-05')).toBe('5 Mar 2026');
  });
});
