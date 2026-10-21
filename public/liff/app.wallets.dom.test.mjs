// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { TRANSACTIONS, RESPONSES, settle, makeFetch, boot, byId, clickTab, submitEditOfFirstRow, cleanupGlobals } from './dom-harness.mjs';

afterEach(cleanupGlobals);

describe('LIFF wallets section', () => {
  const TWO_WALLETS = {
    wallets: [
      { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 400, balance: 24600, entryCount: 2 },
      { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false, income: 0, expense: 300, balance: -300, entryCount: 1 },
    ],
  };

  // เก็บ method+path และ body ที่ส่ง แล้วตอบตาม route ถ้า route คืน undefined ใช้คำตอบตั้งต้นที่มีสองกระเป๋า
  function stubFetch(route = () => undefined) {
    const calls = [];
    const bodies = [];
    const fallback = makeFetch({ '/api/wallets': TWO_WALLETS });
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = options.method ?? 'GET';
      calls.push(`${method} ${path}`);
      if (options.body) bodies.push({ call: `${method} ${path}`, body: JSON.parse(options.body) });
      const override = route(method, path);
      return override === undefined ? fallback(url, options) : makeFetch({ [path]: override })(url, options);
    });
    return { calls, bodies };
  }

  const rowOf = (id) => document.querySelector(`.wallet-row[data-wallet-id="${id}"]`);
  const submit = (id) => byId(id).dispatchEvent(new Event('submit', { cancelable: true }));

  it('leaves only the profile card directly in the me tab panel', async () => {
    await boot();

    const ids = [...document.querySelectorAll('#panel-profile > section')].map((section) => section.id);
    expect(ids).toEqual(['profile-card']);
  });

  it('shows each wallet with its balance and lets only the extra wallets be edited', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    clickTab('profile');
    await settle();

    expect(byId('wallets').hidden).toBe(false);
    expect(rowOf('w-cash').querySelector('.wallet-label').textContent).toBe('ตั้งต้น');
    expect(rowOf('w-cash').querySelector('.wallet-balance').textContent).toBe('24,600 บาท');
    expect(rowOf('w-cash').querySelector('.wallet-rename')).toBeNull();
    expect(rowOf('w-card').querySelector('.wallet-balance').textContent).toBe('-300 บาท');
    expect(rowOf('w-card').querySelector('.wallet-balance').classList.contains('negative')).toBe(true);
    expect(rowOf('w-card').querySelector('.wallet-detail').textContent).toBe('รายรับ 0 บาท · รายจ่าย 300 บาท · 1 รายการ');
    expect(rowOf('w-card').querySelector('.wallet-toggle').textContent).toBe('ซ่อน');
  });

  it('adds a wallet and reloads the list', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    const { calls, bodies } = stubFetch((method, path) =>
      method === 'POST' && path === '/api/wallets' ? { wallet: { id: 'w-new', name: 'กสิกร', hidden: false, isDefault: false } } : undefined
    );
    byId('wallet-add-input').value = ' กสิกร ';

    submit('wallet-add-form');
    await settle();

    expect(bodies).toEqual([{ call: 'POST /api/wallets', body: { name: 'กสิกร' } }]);
    expect(calls).toContain('GET /api/wallets');
    expect(byId('wallet-status').textContent).toBe('เพิ่มกระเป๋า กสิกร แล้ว');
    expect(byId('wallet-add-input').value).toBe('');
  });

  it('asks for a name before adding', async () => {
    await boot();
    const { calls } = stubFetch();

    submit('wallet-add-form');
    await settle();

    expect(byId('wallet-add-error').textContent).toBe('ใส่ชื่อกระเป๋าก่อน');
    expect(calls).not.toContain('POST /api/wallets');
  });

  it('says why adding failed', async () => {
    await boot();
    stubFetch((method) => (method === 'POST' ? { status: 409, error: 'Duplicate name' } : undefined));
    byId('wallet-add-input').value = 'บัตรเครดิต';

    submit('wallet-add-form');
    await settle();

    expect(byId('wallet-add-error').textContent).toBe('มีกระเป๋าชื่อนี้อยู่แล้ว');
  });

  it('hides a wallet', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    const { bodies } = stubFetch((method) => (method === 'PATCH' ? { wallet: {} } : undefined));

    rowOf('w-card').querySelector('.wallet-toggle').click();
    await settle();

    expect(bodies).toEqual([{ call: 'PATCH /api/wallets/w-card', body: { hidden: true } }]);
    expect(byId('wallet-status').textContent).toBe('ซ่อนกระเป๋า บัตรเครดิต แล้ว');
  });

  it('renames a wallet in a dialog', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    const { bodies } = stubFetch((method) => (method === 'PATCH' ? { wallet: {} } : undefined));

    rowOf('w-card').querySelector('.wallet-rename').click();
    expect(byId('wallet-dialog').hasAttribute('open')).toBe(true);
    expect(byId('wallet-dialog-name').value).toBe('บัตรเครดิต');
    byId('wallet-dialog-name').value = 'บัตรกรุงศรี';
    submit('wallet-dialog-form');
    await settle();

    expect(bodies).toEqual([{ call: 'PATCH /api/wallets/w-card', body: { name: 'บัตรกรุงศรี' } }]);
    expect(byId('wallet-dialog').hasAttribute('open')).toBe(false);
    expect(byId('wallet-status').textContent).toBe('เปลี่ยนชื่อเป็น บัตรกรุงศรี แล้ว');
  });

  it('keeps the dialog open with the reason when a rename fails', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    stubFetch((method) => (method === 'PATCH' ? { status: 409, error: 'Duplicate name' } : undefined));

    rowOf('w-card').querySelector('.wallet-rename').click();
    submit('wallet-dialog-form');
    await settle();

    expect(byId('wallet-dialog').hasAttribute('open')).toBe(true);
    expect(byId('wallet-dialog-error').hidden).toBe(false);
    expect(byId('wallet-dialog-error').textContent).toBe('มีกระเป๋าชื่อนี้อยู่แล้ว');
  });

  it('keeps the page working when the wallets fail to load', async () => {
    await boot({ overrides: { '/api/wallets': { status: 500 } } });

    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('wallets-error').hidden).toBe(false);
    expect(byId('wallets-error-text').textContent).toBe('โหลดกระเป๋าไม่สำเร็จ');
    expect(byId('wallets-retry').hidden).toBe(false);
  });

  it('reloads the wallet totals after an edit and on entering the profile tab', async () => {
    await boot();
    const { calls } = stubFetch((method) => (method === 'PATCH' ? {} : undefined));

    await submitEditOfFirstRow();
    expect(calls.filter((call) => call === 'GET /api/wallets')).toHaveLength(1);

    clickTab('profile');
    await settle();
    expect(calls.filter((call) => call === 'GET /api/wallets')).toHaveLength(2);
  });

  it('keeps focus on the same wallet row after hiding it', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    stubFetch((method) => (method === 'PATCH' ? { wallet: {} } : undefined));

    rowOf('w-card').querySelector('.wallet-toggle').click();
    await settle();

    expect(document.activeElement).toBe(rowOf('w-card').querySelector('.wallet-toggle'));
  });

  it('keeps focus on the rename button after saving a new name', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    stubFetch((method) => (method === 'PATCH' ? { wallet: {} } : undefined));

    rowOf('w-card').querySelector('.wallet-rename').click();
    byId('wallet-dialog-name').value = 'บัตรกรุงศรี';
    submit('wallet-dialog-form');
    await settle();

    expect(document.activeElement).toBe(rowOf('w-card').querySelector('.wallet-rename'));
  });

  it('shows a visible loading message and disables adding while wallets first load', async () => {
    const liff = await boot({ holdInit: true });
    const loading = byId('wallets-loading');
    expect(loading.classList.contains('sr-only')).toBe(false);
    expect(byId('wallet-add-input').disabled).toBe(true);
    expect(byId('wallet-add-submit').disabled).toBe(true);
    liff.releaseInit?.();
    await settle();

    expect(byId('wallet-add-input').disabled).toBe(false);
    expect(byId('wallet-add-submit').disabled).toBe(false);
  });

  it('keeps the loading message visible and adding disabled until the wallets arrive', async () => {
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    await boot({ overrides: { '/api/wallets': pending } });

    expect(byId('wallets-loading').hidden).toBe(false);
    expect(byId('wallet-add-input').disabled).toBe(true);
    expect(byId('wallet-add-submit').disabled).toBe(true);

    release(TWO_WALLETS);
    await settle();

    expect(byId('wallets-loading').hidden).toBe(true);
    expect(byId('wallet-add-input').disabled).toBe(false);
    expect(byId('wallet-add-submit').disabled).toBe(false);
  });

  it('shows why hiding a wallet failed as an alert', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    stubFetch((method) => (method === 'PATCH' ? { status: 500 } : undefined));

    rowOf('w-card').querySelector('.wallet-toggle').click();
    await settle();

    expect(byId('wallet-add-error').textContent).toBe('บันทึกกระเป๋าไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('wallet-status').textContent).toBe('');
  });

  it('clears an old hide failure after a successful rename', async () => {
    await boot({ overrides: { '/api/wallets': TWO_WALLETS } });
    stubFetch((method) => (method === 'PATCH' ? { status: 500 } : undefined));
    rowOf('w-card').querySelector('.wallet-toggle').click();
    await settle();
    expect(byId('wallet-add-error').textContent).not.toBe('');
    stubFetch((method) => (method === 'PATCH' ? { wallet: {} } : undefined));

    rowOf('w-card').querySelector('.wallet-rename').click();
    byId('wallet-dialog-name').value = 'บัตรกรุงศรี';
    submit('wallet-dialog-form');
    await settle();

    expect(byId('wallet-add-error').textContent).toBe('');
  });

  it('separates the two sentences of the wallets hint', async () => {
    await boot();

    expect(document.querySelectorAll('.wallets-hint br')).toHaveLength(1);
  });
});

describe('LIFF wallets on entries', () => {
  const CASH = { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 60, balance: 24940, entryCount: 2 };
  const CARD = { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false, income: 0, expense: 40, balance: -40, entryCount: 1 };
  const WALLET_MONTH = {
    ...RESPONSES['/api/transactions'],
    transactions: TRANSACTIONS.map((item) =>
      item.id === 't2' ? { ...item, walletId: 'w-card', walletName: 'บัตรเครดิต' } : { ...item, walletId: 'w-cash', walletName: 'เงินสด' }
    ),
  };

  // คืน body ของ request ที่ส่ง แก้รายการตอบ 204 ส่วนอื่นใช้คำตอบตาม overrides
  function stubFetch(overrides) {
    const bodies = [];
    const fallback = makeFetch(overrides);
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = options.method ?? 'GET';
      if (options.body) bodies.push({ call: `${method} ${path}`, body: JSON.parse(options.body) });
      return method === 'PATCH' ? { ok: true, status: 204, json: async () => null } : fallback(url, options);
    });
    return bodies;
  }

  async function bootWith(walletList) {
    const overrides = { '/api/wallets': { wallets: walletList }, '/api/transactions': WALLET_MONTH };
    await boot({ overrides });
    return stubFetch(overrides);
  }

  const visibleIds = () => [...document.querySelectorAll('#list .row')].map((row) => row.dataset.id);
  const openRow = async (id) => {
    document.querySelector(`#list .row[data-id="${id}"] .row-button`).click();
    await settle();
  };
  const submitEdit = async () => {
    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  };

  it('hides every wallet control for a single wallet and sends no walletId', async () => {
    const bodies = await bootWith([CASH]);

    expect(byId('filter-wallet').hidden).toBe(true);
    expect(document.querySelector('.row-wallet')).toBeNull();
    await openRow('t1');
    expect(byId('edit-wallet-row').hidden).toBe(true);
    await submitEdit();
    expect(bodies[0].body).not.toHaveProperty('walletId');
  });

  it('filters the list by wallet and clears the filter', async () => {
    await bootWith([CASH, CARD]);

    expect(byId('filter-wallet').hidden).toBe(false);
    expect([...byId('filter-wallet').options].map((option) => option.textContent)).toEqual(['ทุกกระเป๋า', 'เงินสด', 'บัตรเครดิต']);
    byId('filter-wallet').value = 'w-card';
    byId('filter-wallet').dispatchEvent(new Event('input'));
    expect(visibleIds()).toEqual(['t2']);
    expect(byId('filter-clear').hidden).toBe(false);

    byId('filter-clear').click();
    expect(byId('filter-wallet').value).toBe('');
    expect(visibleIds()).toHaveLength(3);
  });

  it('shows the wallet name on each row', async () => {
    await bootWith([CASH, CARD]);

    expect(document.querySelector('#list .row[data-id="t2"] .row-wallet').textContent).toBe('บัตรเครดิต');
    expect(document.querySelector('#list .row[data-id="t1"] .row-wallet').textContent).toBe('เงินสด');
  });

  it('moves an entry to another wallet from the editor', async () => {
    const bodies = await bootWith([CASH, CARD]);

    await openRow('t2');
    expect(byId('edit-wallet-row').hidden).toBe(false);
    expect(byId('edit-wallet').value).toBe('w-card');
    byId('edit-wallet').value = 'w-cash';
    await submitEdit();

    expect(bodies[0]).toMatchObject({ call: 'PATCH /api/transactions/t2', body: { walletId: 'w-cash' } });
  });

  it('shows the new wallet name on rows after a rename', async () => {
    await bootWith([CASH, CARD]);
    const renamedCard = { ...CARD, name: 'บัตร KBank' };
    const renamedMonth = {
      ...WALLET_MONTH,
      transactions: WALLET_MONTH.transactions.map((item) => (item.walletId === 'w-card' ? { ...item, walletName: 'บัตร KBank' } : item)),
    };
    const fallback = makeFetch({ '/api/wallets': { wallets: [CASH, renamedCard] }, '/api/transactions': renamedMonth });
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (options.method === 'PATCH') return makeFetch({ [path]: { wallet: {} } })(url, options);
      return fallback(url, options);
    });

    clickTab('profile');
    await settle();
    document.querySelector('.wallet-row[data-wallet-id="w-card"] .wallet-rename').click();
    byId('wallet-dialog-name').value = 'บัตร KBank';
    byId('wallet-dialog-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(document.querySelector('#list .row[data-id="t2"] .row-wallet').textContent).toBe('บัตร KBank');
  });

  it('keeps a hidden wallet only for the entry that uses it', async () => {
    await bootWith([CASH, { ...CARD, hidden: true }]);

    await openRow('t2');
    expect([...byId('edit-wallet').options].map((option) => option.value)).toEqual(['w-cash', 'w-card']);
    byId('cancel-button').click();

    await openRow('t1');
    expect(byId('edit-wallet-row').hidden).toBe(true);
  });

  it('says the wallets could not load in the editor and on a linked wallet', async () => {
    const failing = { '/api/wallets': { status: 500 }, '/api/transactions': WALLET_MONTH };
    await boot({ overrides: failing });
    const bodies = stubFetch(failing);

    await openRow('t2');
    expect(byId('edit-error').hidden).toBe(false);
    expect(byId('edit-error').textContent).toBe('โหลดกระเป๋าไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('edit-wallet-row').hidden).toBe(true);
    await submitEdit();
    expect(bodies[0]).toMatchObject({ call: 'PATCH /api/transactions/t2' });
    expect(bodies[0].body).not.toHaveProperty('walletId');

    await boot({ overrides: failing, search: `?tab=list&m=2026-10&w=${encodeURIComponent('บัตรเครดิต')}&type=expense` });
    await settle();
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toContain('โหลดกระเป๋าไม่สำเร็จ รายการที่เห็นยังไม่ได้กรองตามกระเป๋า');
  });

  it('selects the linked wallet and clears the notice once the wallets load later', async () => {
    const failing = { '/api/wallets': { status: 500 }, '/api/transactions': WALLET_MONTH };
    await boot({ overrides: failing, search: `?tab=list&m=2026-10&w=${encodeURIComponent('บัตรเครดิต')}&type=expense` });
    await settle();
    stubFetch({ '/api/wallets': { wallets: [CASH, CARD] }, '/api/transactions': WALLET_MONTH });

    byId('wallets-retry').click();
    await settle();

    expect(byId('filter-wallet').value).toBe('w-card');
    expect(byId('banner').hidden).toBe(true);
  });

  it('keeps the load error and its retry button when a linked wallet page fails to load at all', async () => {
    const failing = { '/api/wallets': { status: 500 }, '/api/transactions': { status: 500 } };
    await boot({ overrides: failing, search: `?tab=list&m=2026-10&w=${encodeURIComponent('บัตรเครดิต')}&type=expense` });
    await settle();

    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner-retry').hidden).toBe(false);
  });

  it('retries loading the wallets when the editor opens', async () => {
    await boot({ overrides: { '/api/wallets': { status: 500 }, '/api/transactions': WALLET_MONTH } });
    stubFetch({ '/api/wallets': { wallets: [CASH, CARD] }, '/api/transactions': WALLET_MONTH });

    await openRow('t2');

    expect(byId('edit-error').hidden).toBe(true);
    expect(byId('edit-wallet-row').hidden).toBe(false);
    expect(byId('edit-wallet').value).toBe('w-card');
  });
});

describe('LIFF page opened from a totals card that names a wallet', () => {
  const CASH = { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 60, balance: 24940, entryCount: 2 };
  const CARD = { id: 'w-card', name: 'บัตรเครดิต', hidden: false, isDefault: false, income: 0, expense: 40, balance: -40, entryCount: 1 };
  const transactions = TRANSACTIONS.map((item) =>
    item.id === 't2' ? { ...item, walletId: 'w-card', walletName: 'บัตรเครดิต' } : { ...item, walletId: 'w-cash', walletName: 'เงินสด' }
  );
  const month = { ...RESPONSES['/api/transactions'], transactions };
  const ids = () => [...document.querySelectorAll('#list .row')].map((el) => el.dataset.id);
  const link = (wallet) => `?tab=list&m=2026-10&w=${encodeURIComponent(wallet)}&type=expense`;

  // การ์ดนับรายจ่ายของบัตรเครดิตเดือน ต.ค. ได้ 1 รายการ (t2) หน้าเว็บต้องแสดงจำนวนเดียวกัน
  it('selects the linked wallet so the list shows the entries the card counted', async () => {
    await boot({ overrides: { '/api/wallets': { wallets: [CASH, CARD] }, '/api/transactions': month }, search: link('บัตรเครดิต') });
    await settle();

    expect(byId('filter-wallet').value).toBe('w-card');
    expect(ids()).toEqual(['t2']);
    expect(byId('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ');
    expect(byId('filter-clear').hidden).toBe(false);
  });

  // โหลดรอบแรกพังแล้วกดลองใหม่ ต้องยังกรองตามลิงก์ ไม่งั้นจำนวนรายการไม่ตรงกับการ์ด
  it('applies the linked wallet after a retry when the first load failed', async () => {
    const failing = { '/api/wallets': { status: 500 }, '/api/transactions': { status: 500 } };
    await boot({ overrides: failing, search: link('บัตรเครดิต') });
    await settle();
    vi.stubGlobal('fetch', makeFetch({ '/api/wallets': { wallets: [CASH, CARD] }, '/api/transactions': month }));

    byId('banner-retry').click();
    await settle();

    expect(byId('filter-wallet').value).toBe('w-card');
    expect(ids()).toEqual(['t2']);
  });

  it('ignores a wallet name the user does not have', async () => {
    await boot({ overrides: { '/api/wallets': { wallets: [CASH, CARD] }, '/api/transactions': month }, search: link('ไม่มีกระเป๋านี้') });
    await settle();

    expect(byId('filter-wallet').value).toBe('');
    expect(ids()).toEqual(['t1', 't2']);
    // ชื่อในลิงก์อาจเป็นชื่อเก่าก่อนเปลี่ยนชื่อ จำนวนรายการจึงไม่ตรงกับการ์ด ต้องบอกผู้ใช้
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('ไม่พบกระเป๋า ไม่มีกระเป๋านี้ (อาจเปลี่ยนชื่อแล้ว) รายการที่เห็นยังไม่ได้กรองตามกระเป๋า');
  });

  it('ignores the wallet for a user with a single wallet', async () => {
    await boot({ overrides: { '/api/wallets': { wallets: [CASH] }, '/api/transactions': month }, search: link('เงินสด') });
    await settle();

    expect(byId('filter-wallet').hidden).toBe(true);
    expect(byId('filter-wallet').value).toBe('');
    expect(ids()).toEqual(['t1', 't2']);
  });
});

// ปุ่มย้อนกลับของเครื่อง (Android) และท่าปัดย้อนกลับ (iOS) ต้องพากลับจากหน้าย่อยไปแท็บเจ้าของหน้า ไม่ใช่ออกจาก LIFF
