// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { settle, boot, byId, routeFetch, clickTab, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

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
  it('does not ask for the settings before the profile tab opens', async () => {
    const liff = await boot();

    expect(liff.fetched).not.toContain('/api/settings');
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
