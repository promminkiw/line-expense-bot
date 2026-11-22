import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('src/i18n (CommonJS wrapper)', () => {
  it('can be required from CommonJS and exposes the translate API', () => {
    const i18n = require('./index.js');

    expect(i18n.SUPPORTED_LANGUAGES).toEqual(['th', 'en']);
    expect(i18n.DEFAULT_LANGUAGE).toBe('th');
    expect(i18n.normalizeLanguage('en')).toBe('en');
    expect(i18n.languageFromTag('en-US')).toBe('en');
    expect(i18n.t('en', 'common.language.en')).toBe('English');
    expect(i18n.formatAmount('th', 1234.5)).toBe('1,234.5 บาท');
    expect(i18n.formatMonth('en', '2026-11', { short: true })).toBe('Nov 2026');
    expect(i18n.formatDate('th', '2026-11-21')).toBe('21 พ.ย. 2569');
  });
});
