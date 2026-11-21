// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot, byId, settle, cleanupGlobals } from './dom-harness.mjs';
import en from './i18n/messages/en.mjs';
import th from './i18n/messages/th.mjs';

const settingsWith = (language) => ({ weeklySummary: false, dailyReminder: false, language });
const languagePatches = (liff) =>
  liff.requests.filter((request) => request.method === 'PATCH' && request.path === '/api/settings');

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanupGlobals();
  localStorage.clear();
});

describe('LIFF page language', () => {
  it('applies the cached language before LIFF and the network answer', async () => {
    localStorage.setItem('lang', 'en');

    const liff = await boot({ holdInit: true });

    expect(document.title).toBe(en['web.page.title']);
    expect(document.documentElement.lang).toBe('en');
    expect(liff.fetched).toEqual(['/api/config']);
  });

  it('stays Thai without a cached language', async () => {
    await boot({ holdInit: true });

    expect(document.title).toBe(th['web.page.title']);
    expect(document.documentElement.lang).toBe('th');
  });

  it('switches to the server language and remembers it', async () => {
    const liff = await boot({ overrides: { '/api/settings': settingsWith('en') } });

    expect(byId('bottom-nav').getAttribute('aria-label')).toBe(en['web.nav.label']);
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
    expect(languagePatches(liff)).toEqual([]);
  });

  it('goes back to Thai when the server disagrees with the cache', async () => {
    localStorage.setItem('lang', 'en');

    await boot({ overrides: { '/api/settings': settingsWith('th') } });

    expect(document.title).toBe(th['web.page.title']);
    expect(document.documentElement.lang).toBe('th');
    expect(localStorage.getItem('lang')).toBe('th');
  });

  it('saves the LINE app language once when none is stored', async () => {
    const liff = await boot({
      overrides: { '/api/settings': settingsWith(null) },
      liffExtras: { getAppLanguage: () => 'en-US', getLanguage: () => 'th-TH' },
    });
    await settle();

    expect(languagePatches(liff).map((request) => request.body)).toEqual([JSON.stringify({ language: 'en' })]);
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('lang')).toBe('en');
  });

  it('falls back to the LIFF browser language on an older SDK', async () => {
    const liff = await boot({
      overrides: { '/api/settings': settingsWith(null) },
      liffExtras: { getLanguage: () => 'en' },
    });

    expect(languagePatches(liff).map((request) => request.body)).toEqual([JSON.stringify({ language: 'en' })]);
  });

  it('saves Thai when the SDK reports no language at all', async () => {
    const liff = await boot({ overrides: { '/api/settings': settingsWith(null) } });

    expect(languagePatches(liff).map((request) => request.body)).toEqual([JSON.stringify({ language: 'th' })]);
    expect(document.documentElement.lang).toBe('th');
  });

  it('keeps loading the page when the settings request fails', async () => {
    localStorage.setItem('lang', 'en');

    await boot({ overrides: { '/api/settings': { status: 500 } } });

    expect(document.querySelectorAll('#list .row-button').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en');
  });

  it('still boots when localStorage throws', async () => {
    const broken = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(() => {
        throw new Error('blocked');
      }),
    };
    // ตั้งก่อน boot เพราะ app.mjs อ่าน storage ตั้งแต่ตอน import
    vi.stubGlobal('localStorage', broken);

    await boot({ overrides: { '/api/settings': settingsWith('en') } });

    expect(broken.getItem).toHaveBeenCalled();
    expect(document.querySelectorAll('#list .row-button').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en');
  });
});
