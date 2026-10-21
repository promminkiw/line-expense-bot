// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { RESPONSES, settle, makeFetch, boot, byId, routeFetch, clickTab, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('LIFF friends section', () => {
  // boot() installs its own fetch stub, so the route must be applied after it and before the tab opens
  async function openProfile({ route = () => undefined, ...liffOverrides } = {}) {
    const liff = await boot();
    Object.assign(liff, liffOverrides);
    const calls = routeFetch(route);
    clickTab('profile');
    await settle();
    return calls;
  }

  it('loads my code and friends when the profile tab opens', async () => {
    await openProfile();

    expect(byId('friends').hidden).toBe(false);
    expect(byId('friend-code').textContent).toBe('ABCD-2345');
    expect([...document.querySelectorAll('#friend-rows .friend-name')].map((el) => el.textContent)).toEqual(['บี']);
    expect(byId('friends-empty').hidden).toBe(true);
  });

  it('shows the empty note when there are no friends yet', async () => {
    await openProfile({ route: (method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined) });

    expect(byId('friends-empty').hidden).toBe(false);
  });

  it('shows an error with retry when the friend list fails', async () => {
    await openProfile({ route: (method, path) => (path === '/api/friends' ? { status: 500 } : undefined) });

    expect(byId('friends-error').hidden).toBe(false);
    expect(byId('friends-error-text').textContent).toBe('โหลดรายชื่อเพื่อนไม่สำเร็จ');
    routeFetch(() => undefined);
    byId('friends-retry').click();
    await settle();
    expect(byId('friend-code').textContent).toBe('ABCD-2345');
  });

  it('rejects a malformed code and my own code before asking the server', async () => {
    const calls = await openProfile();

    for (const [text, message] of [
      ['1234', 'รหัสเพื่อนต้องเป็นตัวอักษรหรือตัวเลข 8 ตัว'],
      ['abcd-2345', 'นี่คือรหัสของคุณเอง ส่งรหัสนี้ให้เพื่อนแทน'],
    ]) {
      byId('friend-code-input').value = text;
      byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      expect(byId('friend-add-error').textContent).toBe(message);
    }
    expect(calls.filter((call) => call.includes('/lookup'))).toEqual([]);
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
  });

  it('looks up a code, confirms and adds the friend', async () => {
    const calls = await openProfile({
      route: (method, path) =>
        method === 'POST' && path === '/api/friends' ? { friend: { id: 'f-2', displayName: 'ซี' } } : undefined,
    });

    byId('friend-code-input').value = 'wxyz-2345';
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('friend-dialog-text').textContent).toBe('เพิ่ม ซี เป็นเพื่อน?');

    byId('friend-dialog-ok').click();
    await settle();
    expect(calls).toContain('POST /api/friends');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
    expect(byId('friend-status').textContent).toBe('เพิ่ม ซี เป็นเพื่อนแล้ว');
    expect(byId('friend-code-input').value).toBe('');
  });

  it('shows why a lookup failed', async () => {
    await openProfile({ route: (method, path) => (path === '/api/friends/lookup' ? { status: 404 } : undefined) });

    byId('friend-code-input').value = 'WXYZ2345';
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('friend-add-error').textContent).toBe('ไม่พบรหัสเพื่อนนี้ อาจพิมพ์ผิดหรือเพื่อนเปลี่ยนรหัสแล้ว');
  });

  it('removes a friend after confirming', async () => {
    const calls = await openProfile({ route: (method) => (method === 'DELETE' ? {} : undefined) });

    document.querySelector('#friend-rows .friend-remove').click();
    expect(byId('friend-dialog-text').textContent).toBe('ลบ บี ออกจากเพื่อน? เพิ่มกลับได้ด้วยรหัสเพื่อน');
    byId('friend-dialog-ok').click();
    await settle();

    expect(calls).toContain('DELETE /api/friends/f-1');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
  });

  it('renews the code after confirming', async () => {
    await openProfile();

    byId('friend-code-renew').click();
    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-code').textContent).toBe('WXYZ-6789');
    expect(byId('friend-status').textContent).toBe('เปลี่ยนรหัสแล้ว ลิงก์และ QR เดิมใช้ไม่ได้แล้ว');
  });

  it('toggles the QR code of the invite link', async () => {
    await openProfile();

    byId('friend-qr-toggle').click();
    expect(byId('friend-qr').hidden).toBe(false);
    expect(byId('friend-qr').querySelector('svg')).not.toBeNull();
    // SVG ใช้ <desc> เป็นคำอธิบาย ไม่ใช่ <description>
    expect(byId('friend-qr').querySelector('svg desc').textContent).toBe('QR code ลิงก์ชวนเพื่อน');
    expect(byId('friend-qr-toggle').getAttribute('aria-expanded')).toBe('true');
    expect(byId('friend-qr').querySelector('svg').getAttribute('role')).toBe('img');
    byId('friend-qr-toggle').click();
    expect(byId('friend-qr').hidden).toBe(true);
  });

  it('shares the invite link with the LINE share picker when it is available', async () => {
    const shareTargetPicker = vi.fn().mockResolvedValue({ status: 'success' });
    await openProfile({ isApiAvailable: (name) => name === 'shareTargetPicker', shareTargetPicker });

    byId('friend-share').click();
    await settle();

    const [[messages]] = shareTargetPicker.mock.calls;
    expect(messages[0].type).toBe('text');
    expect(messages[0].text).toContain('https://liff.line.me/liff-1?friend=ABCD2345');
    expect(byId('friend-status').textContent).toBe('ส่งลิงก์แล้ว');
  });

  it('copies the link when the share picker is not available', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await openProfile({ isApiAvailable: () => false });

    byId('friend-share').click();
    await settle();

    expect(writeText).toHaveBeenCalledWith('https://liff.line.me/liff-1?friend=ABCD2345');
    expect(byId('friend-status').textContent).toBe('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย');
  });
  it('opens the profile tab and asks to add the friend from an invite link', async () => {
    await boot({ search: '?friend=wxyz-2345' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('friend-dialog-text').textContent).toBe('เพิ่ม ซี เป็นเพื่อน?');
    expect(window.location.search).toBe('');
  });

  it('says it is my own code when I open my own invite link', async () => {
    await boot({ search: '?friend=ABCD2345' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(byId('friends-body').hidden).toBe(false);
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
    expect(byId('friend-add-error').textContent).toBe('นี่คือรหัสของคุณเอง ส่งรหัสนี้ให้เพื่อนแทน');
  });

  it('shows not-found for an unknown invite code', async () => {
    await boot({ search: '?friend=WXYZ2345', overrides: { '/api/friends/lookup': { status: 404 } } });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(byId('friends-body').hidden).toBe(false);
    expect(byId('friend-add-error').textContent).toBe('ไม่พบรหัสเพื่อนนี้ อาจพิมพ์ผิดหรือเพื่อนเปลี่ยนรหัสแล้ว');
  });

  it('puts the invite code in the box when the invite fails, so the user can try again', async () => {
    await boot({ search: '?friend=WXYZ2345', overrides: { '/api/friends/lookup': { status: 404 } } });
    await settle();

    expect(byId('friend-code-input').value).toBe('WXYZ-2345');
  });

  it('cleans an invite link with a broken code from the address', async () => {
    await boot({ search: '?friend=nope' });
    await settle();

    expect(window.location.search).toBe('');
  });

  it('shows the profile tab from the start for an invite link, without the list tab first', async () => {
    const liff = await boot({ search: '?friend=WXYZ2345', holdInit: true });

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    liff.releaseInit();
    await settle();
  });

  it('loads the profile once when opened from an invite link', async () => {
    const liff = await boot({ search: '?friend=WXYZ2345' });
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/profile')).toHaveLength(1);
  });

  it('shows the rate-limit message for an invite lookup', async () => {
    await boot({ search: '?friend=WXYZ2345', overrides: { '/api/friends/lookup': { status: 429 } } });
    await settle();

    expect(byId('friend-add-error').textContent).toBe('ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่');
  });

  it('reads the friend code from liff.state after login', async () => {
    await boot({ search: `?liff.state=${encodeURIComponent('?friend=WXYZ2345')}` });
    await settle();

    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('friend-dialog-text').textContent).toBe('เพิ่ม ซี เป็นเพื่อน?');
    expect(window.location.search).toBe('');
  });

  it('keeps the profile tab and cleans the url after the user closes the invite dialog', async () => {
    await boot({ search: '?friend=WXYZ2345' });
    await settle();
    byId('friend-dialog-cancel').click();

    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(window.location.search).toBe('');
  });

  it('resumes the invite after the friend list load is retried', async () => {
    await boot({ search: '?friend=WXYZ2345', overrides: { '/api/friends': { status: 500 } } });
    await settle();

    expect(byId('friends-error').hidden).toBe(false);
    expect(byId('friends-error-text').textContent).toBe('โหลดรายชื่อเพื่อนไม่สำเร็จ กดลองใหม่แล้วจะเพิ่มเพื่อนต่อให้');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);

    routeFetch(() => undefined);
    byId('friends-retry').click();
    await settle();

    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('friend-dialog-text').textContent).toBe('เพิ่ม ซี เป็นเพื่อน?');
  });

  it('keeps the invite when the first load fails', async () => {
    await boot({ search: '?friend=WXYZ2345', overrides: { '/api/categories': new Error('offline') } });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
  });

  it('stays on the list tab when the link has no friend code', async () => {
    await boot({ search: '?friend=bad' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('list');
  });
});

describe('LIFF friends section guards and failure paths', () => {
  // holds the first request matching method+path until release(body) so the in-flight state can be inspected
  function holdRequest(method, path) {
    const fallback = makeFetch({});
    const calls = [];
    let release;
    let held = false;
    const gate = new Promise((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const requestPath = new URL(url, 'http://localhost').pathname;
      const requestMethod = options.method ?? 'GET';
      calls.push(`${requestMethod} ${requestPath}`);
      if (requestMethod === method && requestPath === path && !held) {
        held = true;
        const body = await gate;
        return makeFetch({ [path]: body })(url, options);
      }
      return fallback(url, options);
    });
    return { calls, release: (body) => release(body) };
  }

  async function openProfileWith(route) {
    await boot();
    const calls = routeFetch(route ?? (() => undefined));
    clickTab('profile');
    await settle();
    return calls;
  }

  const submitCode = async (text) => {
    byId('friend-code-input').value = text;
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  };

  it('keeps the friend dialog open while the request is running', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const hold = holdRequest('DELETE', '/api/friends/f-1');

    document.querySelector('#friend-rows .friend-remove').click();
    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-dialog-cancel').disabled).toBe(true);
    const cancelEvent = new Event('cancel', { cancelable: true });
    byId('friend-dialog').dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);

    hold.release({});
    await settle();
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
    expect(byId('friend-dialog-cancel').disabled).toBe(false);
  });

  it('re-enables the dialog when the action throws', async () => {
    let removed = false;
    await openProfileWith((method, path) => {
      if (method === 'DELETE') {
        removed = true;
        return {};
      }
      // รายชื่อที่โหลดใหม่หลังลบไม่มี friends ทำให้ render พัง
      return removed && path === '/api/friends' ? { code: 'ABCD2345' } : undefined;
    });

    document.querySelector('#friend-rows .friend-remove').click();
    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-dialog-error').textContent).toBe('ลบเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('friend-dialog-ok').disabled).toBe(false);
    expect(byId('friend-dialog-cancel').disabled).toBe(false);
    expect(byId('friend-dialog-busy').hidden).toBe(true);
    const cancelEvent = new Event('cancel', { cancelable: true });
    byId('friend-dialog').dispatchEvent(cancelEvent);
    expect(cancelEvent.defaultPrevented).toBe(false);
  });

  it('shows a busy line in the dialog while the action runs', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const hold = holdRequest('DELETE', '/api/friends/f-1');

    document.querySelector('#friend-rows .friend-remove').click();
    expect(byId('friend-dialog-busy').hidden).toBe(true);
    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-dialog-busy').hidden).toBe(false);
    expect(byId('friend-dialog-busy').textContent).toBe('กำลังดำเนินการ...');
    hold.release({});
    await settle();
    expect(byId('friend-dialog-busy').hidden).toBe(true);
  });

  it('shows a searching label on the lookup button while it runs', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const hold = holdRequest('POST', '/api/friends/lookup');

    byId('friend-code-input').value = 'WXYZ2345';
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(byId('friend-add-submit').textContent).toBe('กำลังค้นหา...');

    hold.release({ friend: { id: 'f-2', displayName: 'ซี' } });
    await settle();
    expect(byId('friend-add-submit').textContent).toBe('ค้นหา');
  });

  // แถวเมนูที่กดไม่ได้ต้องบอกเหตุผล ไม่ใช่เทาเฉยๆ
  it('tells why the profile menu rows are disabled until login finishes', async () => {
    const liff = await boot({ holdInit: true });
    const rows = ['wallets-open', 'notify-open', 'friends-open'].map((id) => byId(id));

    for (const row of rows) {
      expect(row.disabled).toBe(true);
      expect(row.querySelector('.menu-row-sub').textContent).toBe('กำลังเตรียม...');
    }

    liff.releaseInit();
    await settle();

    expect(rows.map((row) => row.disabled)).toEqual([false, false, false]);
    expect(rows.map((row) => row.querySelector('.menu-row-sub').textContent)).toEqual([
      'จัดการกระเป๋าและดูยอดแยก',
      'สรุปรายสัปดาห์และเตือนลืมจด',
      'จัดการเพื่อนและไปหารบิล',
    ]);
  });

  it('tells the user to reopen the page when the menu rows can never be enabled', async () => {
    await boot({ overrides: { '/api/config': new TypeError('network down') } });

    for (const id of ['wallets-open', 'notify-open', 'friends-open']) {
      expect(byId(id).disabled).toBe(true);
      expect(byId(id).querySelector('.menu-row-sub').textContent).toBe('เปิดหน้านี้ใหม่อีกครั้ง');
    }
  });

  it('loads friends when the profile tab was opened before boot finished', async () => {
    const liff = await boot({ holdInit: true });
    clickTab('profile');
    await settle();
    expect(byId('friend-code').textContent).toBe('');

    liff.releaseInit();
    await settle();

    expect(byId('friend-code').textContent).toBe('ABCD-2345');
  });

  it('shows a visible loading state while friends load', async () => {
    await boot();
    const hold = holdRequest('GET', '/api/friends');
    clickTab('profile');
    await settle();

    expect(byId('friends-skeleton').hidden).toBe(false);
    expect(byId('friends-skeleton').children.length).toBeGreaterThan(0);

    hold.release({ code: 'ABCD2345', friends: [] });
    await settle();
    expect(byId('friends-skeleton').hidden).toBe(true);
  });

  it('ignores a second submit while a lookup is in flight', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const hold = holdRequest('POST', '/api/friends/lookup');
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal');

    byId('friend-code-input').value = 'WXYZ2345';
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('friend-add-submit').disabled).toBe(true);
    expect(byId('friend-add-form').getAttribute('aria-busy')).toBe('true');
    hold.release({ friend: { id: 'f-2', displayName: 'ซี' } });
    await settle();

    expect(hold.calls.filter((call) => call.endsWith('/lookup'))).toHaveLength(1);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(byId('friend-add-submit').disabled).toBe(false);
    expect(byId('friend-add-form').hasAttribute('aria-busy')).toBe(false);
  });

  it('keeps the dialog open with an error when adding the friend fails', async () => {
    await openProfileWith((method, path) => (method === 'POST' && path === '/api/friends' ? { status: 500 } : undefined));
    await submitCode('WXYZ2345');

    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-dialog-error').textContent).toBe('เพิ่มเพื่อนไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('friend-dialog-ok').disabled).toBe(false);
  });

  it('treats a 404 on removal as done and reloads the list', async () => {
    const calls = await openProfileWith((method) => (method === 'DELETE' ? { status: 404 } : undefined));
    const before = calls.filter((call) => call === 'GET /api/friends').length;

    document.querySelector('#friend-rows .friend-remove').click();
    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
    expect(calls.filter((call) => call === 'GET /api/friends').length).toBe(before + 1);
  });

  // lookup ช้าแล้วผู้ใช้ไปกดลบเพื่อนก่อน dialog เพิ่มเพื่อนต้องไม่เปิดทับ dialog ลบที่กำลังทำงาน
  it('does not open the add dialog over a dialog that is already open', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const hold = holdRequest('POST', '/api/friends/lookup');

    await submitCode('WXYZ2345');
    document.querySelector('#friend-rows .friend-remove').click();
    expect(byId('friend-dialog-title').textContent).toBe('ลบเพื่อน');
    hold.release({ friend: { id: 'f-2', displayName: 'ซี' } });
    await settle();

    expect(byId('friend-dialog-title').textContent).toBe('ลบเพื่อน');
    expect(byId('friend-add-error').textContent).toBe('ปิดหน้าต่างที่เปิดอยู่ก่อน แล้วกดค้นหาอีกครั้ง');
  });

  it('reopens the dialog when the browser closes it with a second Esc while busy', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const hold = holdRequest('DELETE', '/api/friends/f-1');
    document.querySelector('#friend-rows .friend-remove').click();
    byId('friend-dialog-ok').click();
    await settle();

    byId('friend-dialog').close();
    byId('friend-dialog').dispatchEvent(new Event('close'));

    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    hold.release({});
    await settle();
    expect(byId('friend-dialog').hasAttribute('open')).toBe(false);
  });

  it('ignores retry taps while the friend list is still loading', async () => {
    await openProfileWith((method, path) => (path === '/api/friends' ? { status: 500 } : undefined));
    const hold = holdRequest('GET', '/api/friends');

    byId('friends-retry').click();
    byId('friends-retry').click();
    await settle();

    expect(hold.calls.filter((call) => call === 'GET /api/friends')).toHaveLength(1);
    hold.release(RESPONSES['/api/friends']);
    await settle();
    expect(byId('friends-body').hidden).toBe(false);
  });

  it('keeps the list and the success message when reloading after an add fails', async () => {
    await boot();
    clickTab('profile');
    await settle();
    let friendLoads = 0;
    routeFetch((method, path) => {
      if (path !== '/api/friends' || method !== 'GET') return undefined;
      friendLoads += 1;
      return { status: 500 };
    });

    await submitCode('WXYZ2345');
    byId('friend-dialog-ok').click();
    await settle();

    expect(friendLoads).toBe(1);
    expect(byId('friends-body').hidden).toBe(false);
    expect(document.querySelectorAll('#friend-rows .friend-row')).toHaveLength(1);
    expect(byId('friend-status').textContent).toBe('เพิ่ม ซี เป็นเพื่อนแล้ว');
    expect(byId('friends-error').hidden).toBe(false);
  });

  it('hides the retry button when the friend list needs a new login', async () => {
    await openProfileWith((method, path) => (path === '/api/friends' ? { status: 401 } : undefined));

    expect(byId('friends-error').hidden).toBe(false);
    expect(byId('friends-retry').hidden).toBe(true);
  });

  it('moves focus to the friends heading after removing a friend', async () => {
    await openProfileWith();

    document.querySelector('#friend-rows .friend-remove').click();
    byId('friend-dialog-ok').click();
    await settle();

    expect(document.activeElement).toBe(byId('friends-title'));
  });

  it('reloads the friend list every time the profile tab opens again', async () => {
    const calls = await openProfileWith();
    clickTab('list');
    clickTab('profile');
    await settle();

    expect(calls.filter((call) => call === 'GET /api/friends')).toHaveLength(2);
  });

  it('scrolls to the add error so a message from an invite link is seen', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await openProfileWith();

    await submitCode('ABCD2345');

    expect(byId('friend-add-error').textContent).toBe('นี่คือรหัสของคุณเอง ส่งรหัสนี้ให้เพื่อนแทน');
    expect(scrollIntoView.mock.contexts).toContain(byId('friend-add-error'));
    delete Element.prototype.scrollIntoView;
  });

  it('ignores share taps while the share picker is open', async () => {
    let finish;
    const liff = await boot();
    Object.assign(liff, { isApiAvailable: () => true, shareTargetPicker: vi.fn(() => new Promise((resolve) => (finish = resolve))) });
    clickTab('profile');
    await settle();

    byId('friend-share').click();
    byId('friend-share').click();
    await settle();

    expect(liff.shareTargetPicker).toHaveBeenCalledTimes(1);
    expect(byId('friend-share').disabled).toBe(true);
    finish({ status: 'success' });
    await settle();
    expect(byId('friend-share').disabled).toBe(false);
  });

  it('shows the link in the status when the clipboard is missing', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const liff = await boot();
    Object.assign(liff, { isApiAvailable: () => false });
    clickTab('profile');
    await settle();

    byId('friend-share').click();
    await settle();

    expect(byId('friend-status').textContent).toBe('ส่งลิงก์นี้ให้เพื่อน: https://liff.line.me/liff-1?friend=ABCD2345');
  });

  it('stays silent when the user closes the share picker', async () => {
    const liff = await boot();
    Object.assign(liff, { isApiAvailable: () => true, shareTargetPicker: vi.fn().mockResolvedValue(undefined) });
    clickTab('profile');
    await settle();

    byId('friend-share').click();
    await settle();

    expect(byId('friend-status').textContent).toBe('');
  });

  it('asks the user to reopen from LINE when the friend list returns 401', async () => {
    await openProfileWith((method, path) => (path === '/api/friends' ? { status: 401 } : undefined));

    expect(byId('friends-error-text').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
  });

  it('redraws the open QR code after the code is renewed', async () => {
    await openProfileWith();
    byId('friend-qr-toggle').click();
    const before = byId('friend-qr').innerHTML;

    byId('friend-code-renew').click();
    byId('friend-dialog-ok').click();
    await settle();

    expect(byId('friend-qr').innerHTML).not.toBe(before);
  });
});
