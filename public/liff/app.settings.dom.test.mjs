// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { settle, boot, byId, routeFetch, clickTab, cleanupGlobals } from './dom-harness.mjs';
import en from './i18n/messages/en.mjs';
import th from './i18n/messages/th.mjs';

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanupGlobals();
  localStorage.clear();
});

describe('LIFF links between the main page and the bills page', () => {
  it('hides the home link on the main page and links the friends section to the bills page', async () => {
    await boot();

    expect(byId('bills-home').hidden).toBe(true);
    const link = byId('friends-bills-link');
    expect(link.hidden).toBe(false);
    expect(link.getAttribute('href')).toBe('./?tab=bills');
    expect(byId('friends').contains(link)).toBe(true);
  });

  it('shows the home link when a bill card opens the bills page', async () => {
    await boot({ search: '?bill=0b1c2d3e-4f50-4617-8899-aabbccddeeff' });

    expect(byId('bills-home').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(true);
  });
});

describe('LIFF notification settings', () => {
  // boot อ่าน settings หนึ่งครั้งเพื่อเอาภาษา แผงสวิตช์ใช้ผลนั้นต่อ ไม่อ่านซ้ำ
  it('does not load the switches before the profile tab opens', async () => {
    const liff = await boot();

    expect(liff.fetched.filter((path) => path === '/api/settings')).toHaveLength(1);
    expect(byId('notify').hidden).toBe(true);
  });

  it('loads the switches when the profile tab opens', async () => {
    const liff = await boot();

    clickTab('profile');
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/settings')).toHaveLength(1);
    expect(byId('notify').hidden).toBe(false);
    expect(byId('notify-body').hidden).toBe(false);
    expect(byId('notify-weekly-summary').checked).toBe(false);
  });

  it('loads the switches after boot when a link opens the profile tab', async () => {
    const liff = await boot({ search: '?tab=profile' });
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/settings')).toHaveLength(1);
    expect(byId('notify-body').hidden).toBe(false);
  });

  it('saves the weekly summary switch', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const calls = routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { weeklySummary: true } : undefined));
    const box = byId('notify-weekly-summary');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('PATCH /api/settings');
    expect(box.checked).toBe(true);
    expect(byId('notify-status').textContent).toBe('บันทึก ส่งสรุปทุกวันอาทิตย์ แล้ว');
  });

  it('puts the switch back when saving fails', async () => {
    await boot();
    clickTab('profile');
    await settle();
    routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { status: 500 } : undefined));
    const box = byId('notify-weekly-summary');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(box.checked).toBe(false);
    expect(byId('notify-status').textContent).toBe('บันทึก ส่งสรุปทุกวันอาทิตย์ ไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('shows a retry when the settings fail to load, and loads them from it', async () => {
    await boot({ overrides: { '/api/settings': { status: 500 } } });
    clickTab('profile');
    await settle();

    expect(byId('notify-error').hidden).toBe(false);
    expect(byId('notify-error-text').textContent).toBe('โหลดการตั้งค่าไม่สำเร็จ');

    routeFetch(() => undefined);
    byId('notify-retry').click();
    await settle();

    expect(byId('notify-error').hidden).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
  });

  it('shows each switch from its own field', async () => {
    await boot({ overrides: { '/api/settings': { weeklySummary: true, dailyReminder: false } } });
    clickTab('profile');
    await settle();

    expect(byId('notify-weekly-summary').checked).toBe(true);
    expect(byId('notify-daily-reminder').checked).toBe(false);
  });

  it('saves the daily reminder switch without touching the weekly one', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const calls = routeFetch((method, path) =>
      method === 'PATCH' && path === '/api/settings' ? { weeklySummary: false, dailyReminder: true } : undefined
    );
    const box = byId('notify-daily-reminder');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('PATCH /api/settings');
    expect(box.checked).toBe(true);
    expect(byId('notify-weekly-summary').checked).toBe(false);
    expect(byId('notify-status').textContent).toBe('บันทึก เตือนถ้าวันนี้ยังไม่ได้จด แล้ว');
  });
});

describe('LIFF profile picture', () => {
  const PICTURE = 'https://profile.line-scdn.net/abc';

  async function openProfile(options) {
    await boot(options);
    await settle();
    document.querySelector('#bottom-nav button[data-tab="profile"]').click();
    await settle();
  }

  it('shows the LINE picture over the initial', async () => {
    await openProfile({ decodedToken: { sub: 'U1', picture: PICTURE } });

    const img = byId('profile-avatar').querySelector('img');
    expect(img.getAttribute('src')).toBe(PICTURE);
    // ชื่ออยู่ข้างรูปแล้ว รูปจึงเป็นแค่ภาพประกอบ
    expect(img.getAttribute('alt')).toBe('');
    expect(byId('profile-avatar').textContent).toBe('ส');
  });

  it('falls back to the initial when the picture fails to load', async () => {
    await openProfile({ decodedToken: { picture: PICTURE } });

    byId('profile-avatar').querySelector('img').dispatchEvent(new Event('error'));

    expect(byId('profile-avatar').querySelector('img')).toBeNull();
    expect(byId('profile-avatar').textContent).toBe('ส');
  });

  it('keeps the initial when the token has no picture or the SDK cannot decode it', async () => {
    await openProfile({ decodedToken: { sub: 'U1' } });
    expect(byId('profile-avatar').querySelector('img')).toBeNull();

    await openProfile({ decodedToken: null });
    expect(byId('profile-avatar').querySelector('img')).toBeNull();

    await openProfile();
    expect(byId('profile-avatar').querySelector('img')).toBeNull();
    expect(byId('profile-avatar').textContent).toBe('ส');
  });
});

describe('LIFF language picker', () => {
  const patches = (calls) => calls.filter((call) => call === 'PATCH /api/settings');
  const openPicker = async (options) => {
    const liff = await boot(options);
    clickTab('profile');
    await settle();
    byId('language-open').click();
    await settle();
    return liff;
  };
  const choose = async (language) => {
    byId(`language-${language}`).checked = true;
    byId(`language-${language}`).dispatchEvent(new Event('change'));
    await settle();
  };

  it('shows the current language as the row hint and opens a page with it checked', async () => {
    await openPicker();

    expect(byId('language-open').querySelector('.menu-row-sub').textContent).toBe(th['common.language.th']);
    expect(byId('panel-language').hidden).toBe(false);
    expect(byId('page-title').textContent).toBe(th['web.settings.language.title']);
    expect(byId('language-th').checked).toBe(true);
    expect(byId('language-en').checked).toBe(false);
    expect(byId('language-th-label').textContent).toBe(th['common.language.th']);
    expect(byId('language-en-label').textContent).toBe(th['common.language.en']);
    expect(byId('language-group').getAttribute('aria-labelledby')).toBe('language-title');
  });

  it('shows the English labels and checks English when the language is English', async () => {
    await openPicker({ overrides: { '/api/settings': { weeklySummary: false, dailyReminder: false, language: 'en' } } });

    expect(byId('language-open').querySelector('.menu-row-sub').textContent).toBe(en['common.language.en']);
    expect(byId('page-title').textContent).toBe(en['web.settings.language.title']);
    expect(byId('language-title').textContent).toBe(en['web.settings.language.title']);
    expect(byId('language-en').checked).toBe(true);
  });

  it('saves, remembers the language and reloads the page', async () => {
    await openPicker();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    const calls = routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { language: 'en' } : undefined));

    await choose('en');

    expect(patches(calls)).toHaveLength(1);
    expect(localStorage.getItem('lang')).toBe('en');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('keeps the old choice and shows an error when saving fails', async () => {
    await openPicker();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { status: 500 } : undefined));

    await choose('en');

    expect(byId('language-th').checked).toBe(true);
    expect(byId('language-en').checked).toBe(false);
    expect(byId('language-status').textContent).toBe(th['web.settings.language.saveFailed']);
    expect(localStorage.getItem('lang')).toBe('th');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('LIFF language picker gating and reload target', () => {
  it('keeps the row disabled until the api is ready', async () => {
    await boot({ holdInit: true });

    expect(byId('language-open').disabled).toBe(true);
    expect(byId('language-open-sub').textContent).toBe(th['common.language.th']);
  });

  it('reloads onto the profile tab and leaves no sub-page history entry', async () => {
    await boot();
    clickTab('profile');
    await settle();
    byId('language-open').click();
    await settle();
    expect(window.history.state).toEqual({ subPage: true });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { language: 'en' } : undefined));

    byId('language-en').checked = true;
    byId('language-en').dispatchEvent(new Event('change'));
    await settle();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.history.state).toBeNull();
    // location ถูก stub จึงอ่านจาก document ซึ่งเป็นของ jsdom จริง
    expect(document.location.search).toBe('?tab=profile');
  });
});

describe('LIFF me tab in English', () => {
  afterEach(() => localStorage.clear());
  const ENGLISH_SETTINGS = { weeklySummary: false, dailyReminder: false, language: 'en' };
  const squash = (el) => el.textContent.replace(/\s+/g, ' ').trim();

  async function openMeEnglish() {
    localStorage.setItem('lang', 'en');
    await boot({ overrides: { '/api/settings': ENGLISH_SETTINGS } });
    clickTab('profile');
    await settle();
  }

  it('shows the profile card, the menu groups and the close button in English', async () => {
    await openMeEnglish();

    expect(byId('page-title').textContent).toBe('Me');
    expect(document.querySelector('.balance-card .stat-label').textContent).toBe('All-time balance');
    expect(squash(document.querySelector('.balance-card .balance-note'))).toBe(
      "Income minus expenses for everything you've logged with me since the start. Not your real bank balance."
    );
    expect([...document.querySelectorAll('.profile-stats .stat-label')].map((el) => el.textContent)).toEqual(['Total income', 'Total expenses', 'Entries']);
    expect([...document.querySelectorAll('.menu-group h2')].map((el) => el.textContent)).toEqual(['Your data', 'Automation & settings', 'Help & sharing']);
    expect(squash(byId('recurring-open'))).toBe('Recurring Monthly income and expenses I log for you');
    expect(squash(byId('notify-open'))).toBe('Notifications Weekly summary and reminders to log');
    expect(squash(byId('friends-open'))).toBe('Friends & split bills Manage friends and split bills');
    expect(squash(byId('tips-open'))).toBe('How to use How I work and what to type in the chat');
    expect(byId('profile-close').textContent).toBe('Back to chat');
  });

  it('opens the how-to page in English', async () => {
    await openMeEnglish();
    byId('tips-open').click();
    await settle();

    expect(byId('page-title').textContent).toBe('How to use');
    expect(byId('tips-title').textContent).toBe('How I work');
    const tips = [...document.querySelectorAll('#panel-tips .profile-tips li')].map(squash);
    expect(tips).toEqual([
      'Type entries in the chat, like "lunch 60 coffee 45", and I log them right away',
      'Type "summary" to see today, this week or this month',
      'Send a photo of a slip or receipt and I read the amount, then ask you to confirm before saving',
      'Ask things like "how much did I spend on coffee this month" and I answer with the total',
      'Logged something wrong? Just tap delete on the card I sent back',
      'On the List tab, tap a row to edit it, or swipe it left to delete',
      'Type "help" or tap the help button in the chat menu to see everything I can do',
    ]);
  });

  it('shows the notification switches and their save result in English', async () => {
    await openMeEnglish();
    byId('notify-open').click();
    await settle();
    routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { weeklySummary: true, dailyReminder: false } : undefined));

    expect(byId('notify-title').textContent).toBe('Notifications');
    expect(document.querySelector('#notify .notify-hint').textContent).toBe('I message you on a schedule. Turn on only the ones you want.');
    const names = [...document.querySelectorAll('#notify-body .notify-switch-text > span')].map(squash);
    const hints = [...document.querySelectorAll('#notify-body .notify-switch-text small')].map(squash);
    expect(names).toEqual(['Weekly summary on Sundays', "Remind me if I haven't logged anything today"]);
    expect(hints).toEqual([
      'A Monday-Sunday summary card at 19:00. I skip weeks with no entries.',
      "I message you at 21:00 if you haven't typed an entry, sent a slip or split a bill that day. Recurring entries don't count.",
    ]);

    const box = byId('notify-weekly-summary');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();
    expect(byId('notify-status').textContent).toBe('Saved: Weekly summary on Sundays');
  });

  it('shows the recurring page and its editor in English', async () => {
    await openMeEnglish();
    byId('recurring-open').click();
    await settle();

    expect(byId('recurring-title').textContent).toBe('Recurring entries');
    expect(squash(document.querySelector('.recurring-hint'))).toBe('I log these for you once a month and let you know in LINE');
    expect(document.querySelector('.recurring-more summary').textContent).toBe('When does it start?');
    expect(byId('recurring-add').textContent).toBe('Add recurring entry');
    byId('recurring-add').click();
    await settle();
    expect(byId('recurring-day').closest('label').querySelector('span').textContent).toBe('Day of the month (1-31)');
    expect(squash(byId('recurring-active').closest('label'))).toBe('Active');
    expect(byId('recurring-cancel').getAttribute('aria-label')).toBe('Close');
  });
});
