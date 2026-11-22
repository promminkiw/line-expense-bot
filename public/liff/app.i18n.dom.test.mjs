// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot, byId, settle, clickTab, cleanupGlobals } from './dom-harness.mjs';
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

  it('keeps loading the page when the settings request hits a network error', async () => {
    localStorage.setItem('lang', 'en');

    await boot({ overrides: { '/api/settings': new Error('network down') } });

    expect(document.querySelectorAll('#list .row-button').length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en');
  });

  it('applies the detected language and boots normally when saving it fails', async () => {
    // overrides ผูกกับ path ไม่แยก method จึงให้ครั้งแรก (GET) ได้ null และครั้งต่อไป (PATCH) ล้มเหลว
    let reads = 0;
    const overrides = new Proxy({}, {
      has: (_target, path) => path === '/api/settings',
      get: (_target, path) => (path === '/api/settings' ? (reads++ === 0 ? settingsWith(null) : { status: 500 }) : undefined),
    });

    const liff = await boot({ overrides, liffExtras: { getAppLanguage: () => 'en-US' } });

    expect(languagePatches(liff)).toHaveLength(1);
    expect(document.documentElement.lang).toBe('en');
    expect(document.querySelectorAll('#list .row-button').length).toBeGreaterThan(0);
  });

  it('ignores an unsupported cached language', async () => {
    localStorage.setItem('lang', 'fr');

    await boot({ holdInit: true });

    expect(document.documentElement.lang).toBe('th');
    expect(document.title).toBe(th['web.page.title']);
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

  it('shows the placeholder headings in the cached language before the data arrives', async () => {
    localStorage.setItem('lang', 'en');

    await boot({ holdInit: true });

    expect(byId('status').textContent).toBe(en['web.common.loading']);
    expect(byId('profile-name').textContent).toBe(en['web.profile.defaultName']);
    expect(byId('goal-detail-title').textContent).toBe(en['web.goals.dialogTitle']);
    expect(byId('bill-dialog-title').textContent).toBe(en['web.bills.dialog.title']);
    expect(byId('category-seg-income').textContent).toBe(en['type.income']);
  });

  it('keeps the real profile name when the server language arrives later', async () => {
    await boot({ overrides: { '/api/settings': settingsWith('en') } });
    await settle();

    expect(byId('profile-name').textContent).toBe('สมชาย');
    expect(byId('status').textContent).not.toBe(en['web.common.loading']);
  });
});

const bootEnglish = () => {
  localStorage.setItem('lang', 'en');
  return boot({ overrides: { '/api/settings': settingsWith('en') } });
};
const texts = (selector) => [...document.querySelectorAll(selector)].map((el) => el.textContent);

describe('list tab in English', () => {
  it('labels the chrome, totals, filters and rows in English', async () => {
    await bootEnglish();

    expect(texts('#bottom-nav button')).toEqual(['List', 'Summary', 'Budget', 'Savings', 'Me']);
    expect(byId('page-title').textContent).toBe('My entries');
    expect(byId('month').getAttribute('aria-label')).toBe('Pick a month');
    expect(document.querySelector('#totals .stat.balance .stat-label').textContent).toBe('Balance');
    expect(byId('stat-balance').textContent).toBe('฿24,900');
    expect(byId('search').getAttribute('placeholder')).toBe('Search by category or note');
    expect([...byId('filter-category').options].map((option) => option.textContent)).toEqual(['All categories', 'Food', 'Travel', 'Salary']);
    expect(texts('#list .row-title')).toEqual(['Food', 'Travel', 'Salary']);
    expect(texts('#list .amount')).toEqual(['-฿60', '-฿40', '+฿25,000']);
    expect(document.querySelector('#list .row-delete').getAttribute('aria-label')).toBe('Delete Food entry');
    expect(document.querySelector('#list .row-delete').textContent).toBe('Delete');
  });

  it('searches by the English category name and reports the result in English', async () => {
    await bootEnglish();

    byId('search').value = 'food';
    byId('search').dispatchEvent(new Event('input'));

    expect(texts('#list .row-title')).toEqual(['Food']);
    expect(byId('filter-status').textContent).toBe('Found 1 of 3, net -฿60');
  });

  it('shows the editor and the delete confirmation in English', async () => {
    await bootEnglish();

    document.querySelector('#list .row-button').click();
    await settle();

    expect(byId('editor-title').textContent).toBe('Edit entry');
    expect(byId('edit-amount').closest('label').querySelector('span').textContent).toBe('Amount (baht)');
    expect(byId('edit-category').selectedOptions[0].textContent).toBe('Food');
    expect([...byId('edit-category').querySelectorAll('optgroup')].map((group) => group.label)).toEqual(['Expense', 'Income']);

    byId('delete-button').click();

    expect(byId('confirm-title').textContent).toBe('Delete this entry?');
    expect(byId('confirm-category').textContent).toBe('Food');
    expect(byId('confirm-amount').textContent).toBe('-฿60');
    expect(byId('confirm-ok').textContent).toBe('Delete');
  });

  it('names the viewed month with the Gregorian year', async () => {
    await bootEnglish();

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));
    await settle();

    expect(byId('month-context-text').textContent).toBe('Viewing Sep 2026');
    expect(byId('month-context-today').textContent).toBe('Back to this month');
  });

  it('redraws what was already drawn in Thai once the server says English', async () => {
    const liff = await boot({ overrides: { '/api/settings': settingsWith('en') } });
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/transactions')).toHaveLength(2);
    expect(texts('#list .row-title')).toEqual(['Food', 'Travel', 'Salary']);
    expect([...byId('filter-category').options].map((option) => option.textContent)[0]).toBe('All categories');
    expect(byId('page-title').textContent).toBe('My entries');
    expect(document.querySelector('#summary-empty .empty-title').textContent).toBe(en['web.empty.summary.title']);
  });
});

describe('summary tab in English', () => {
  it('labels the chart, the trend and the comparison in English', async () => {
    await bootEnglish();

    clickTab('summary');

    expect(byId('page-title').textContent).toBe('Monthly summary');
    expect(byId('chart-title').textContent).toBe('By category');
    expect(texts('#chart .tabs button')).toEqual(['Expense', 'Income']);
    expect(texts('#chart-rows .chart-label')).toEqual(['Food', 'Travel']);
    expect(texts('#chart-rows .chart-value')).toEqual(['฿60 · 60%', '฿40 · 40%']);
    expect(byId('trend-title').textContent).toBe('Last 6 months');
    expect(texts('#trend-bars .trend-label')).toEqual(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(document.querySelector('#trend-bars .trend-col.current .sr-only').textContent).toBe('Oct income ฿25,000 expenses ฿100');
    expect(byId('trend-comparison').textContent).toBe('You spent 50% less than last month (-฿100)');
    expect(byId('export-button').textContent).toBe('Export CSV');
  });

  it('shows income categories and the no-income note in English', async () => {
    await bootEnglish();
    clickTab('summary');

    document.querySelector('#chart .tabs [data-type="income"]').click();

    expect(texts('#chart-rows .chart-label')).toEqual(['Salary']);
  });

  it('says there is no income yet in English', async () => {
    localStorage.setItem('lang', 'en');
    const expenseOnly = { transactions: [], summary: [{ type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 }], truncated: false };
    await boot({ overrides: { '/api/settings': settingsWith('en'), '/api/transactions': expenseOnly } });
    clickTab('summary');

    document.querySelector('#chart .tabs [data-type="income"]').click();

    expect(byId('chart-empty').textContent).toBe('No income this month yet');
  });
});

describe('late server language', () => {
  // json() คืน promise ที่ค้างไว้ คำตอบ settings จึงมาถึงเมื่อเทสต์สั่ง
  function deferredSettings() {
    let resolve;
    const pending = new Promise((done) => (resolve = done));
    return { pending, resolve };
  }
  const transactionReads = (liff) => liff.fetched.filter((path) => path === '/api/transactions').length;

  it("keeps the editor's category when the server language arrives while the editor is open", async () => {
    const settings = deferredSettings();
    const liff = await boot({ overrides: { '/api/settings': settings.pending } });
    document.querySelectorAll('#list .row-button')[1].click();
    await settle();
    expect(byId('edit-category').value).toBe('c-trip');

    settings.resolve(settingsWith('en'));
    await settle();

    expect(byId('edit-category').value).toBe('c-trip');
    expect(transactionReads(liff)).toBe(1);
    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    const patch = liff.requests.find((request) => request.method === 'PATCH' && request.path === '/api/transactions/t2');
    expect(JSON.parse(patch.body).categoryId).toBe('c-trip');

    // stub ของ harness ไม่ยิง close เอง จึงยิงแทน browser แล้วการโหลดใหม่ที่รอไว้ต้องเกิดตอนนี้
    byId('editor').dispatchEvent(new Event('close'));
    await settle();
    expect(transactionReads(liff)).toBeGreaterThan(2);
    expect(texts('#list .row-title')).toEqual(['Food', 'Travel', 'Salary']);
  });

  it('shows the load error when the reload after a language change fails', async () => {
    const settings = deferredSettings();
    const overrides = { '/api/settings': settings.pending };
    await boot({ overrides });
    overrides['/api/categories'] = { status: 500 };

    settings.resolve(settingsWith('en'));
    await settle();

    expect(byId('banner').textContent).toBe(en['web.error.loadFailed']);
    expect(byId('banner-retry').hidden).toBe(false);
  });

  it('translates a boot load error once the server language arrives', async () => {
    const settings = deferredSettings();
    await boot({ overrides: { '/api/settings': settings.pending, '/api/categories': { status: 500 } } });
    expect(byId('banner').textContent).toBe(th['web.error.loadFailed']);

    settings.resolve(settingsWith('en'));
    await settle();

    expect(byId('banner').textContent).toBe(en['web.error.loadFailed']);
    expect(byId('status').hidden).toBe(true);
    expect(byId('status').textContent).toBe('');
  });

  const reads = (liff, path) => liff.requests.filter((request) => request.method === 'GET' && request.path === path).length;

  it('keeps the searching label when the server language arrives during a friend lookup', async () => {
    const settings = deferredSettings();
    const lookup = deferredSettings();
    const overrides = { '/api/settings': settings.pending };
    await boot({ overrides });
    clickTab('profile');
    await settle();
    overrides['/api/friends/lookup'] = lookup.pending;
    byId('friend-code-input').value = 'WXYZ2345';
    byId('friend-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    settings.resolve(settingsWith('en'));
    await settle();
    expect(byId('friend-add-submit').textContent).toBe(en['web.friends.searching']);

    lookup.resolve({ friend: { id: 'f-2', displayName: 'ซี' } });
    await settle();
    expect(byId('friend-add-submit').textContent).toBe(en['web.friends.search']);
  });

  it('relabels the idle lookup button once the server language arrives', async () => {
    const settings = deferredSettings();
    await boot({ overrides: { '/api/settings': settings.pending } });
    expect(byId('friend-add-submit').textContent).toBe(th['web.friends.search']);

    settings.resolve(settingsWith('en'));
    await settle();

    expect(byId('friend-add-submit').textContent).toBe(en['web.friends.search']);
  });

  function fillBillForm() {
    byId('bill-form-title').value = 'BBQ';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));
  }

  it('keeps the creating label when the server language arrives while a bill is being created', async () => {
    const settings = deferredSettings();
    const created = deferredSettings();
    const overrides = { '/api/settings': settings.pending };
    await boot({ search: '?tab=bills', overrides });
    byId('bill-new').click();
    await settle();
    fillBillForm();
    overrides['/api/bills'] = created.pending;
    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(byId('bill-form-submit').textContent).toBe(th['web.bills.form.submitting']);

    settings.resolve(settingsWith('en'));
    await settle();
    expect(byId('bill-form-submit').textContent).toBe(en['web.bills.form.submitting']);

    // GET รายการบิลหลังสร้างต้องได้คำตอบปกติ ไม่ใช่คำตอบของ POST
    delete overrides['/api/bills'];
    created.resolve({ id: 'b-new', notNotified: [] });
    await settle();
    expect(byId('bill-form-submit').textContent).toBe(en['web.bills.form.submit']);
  });

  it('relabels the idle bill form button once the server language arrives', async () => {
    const settings = deferredSettings();
    await boot({ search: '?tab=bills', overrides: { '/api/settings': settings.pending } });
    expect(byId('bill-form-submit').textContent).toBe(th['web.bills.form.submit']);

    settings.resolve(settingsWith('en'));
    await settle();

    expect(byId('bill-form-submit').textContent).toBe(en['web.bills.form.submit']);
  });

  it('redraws the bill cards in English from the loaded data once the server language arrives', async () => {
    const settings = deferredSettings();
    const liff = await boot({ search: '?tab=bills', overrides: { '/api/settings': settings.pending } });
    const incomingCard = () => document.querySelector('#bills-incoming .bill-card');
    expect(incomingCard().querySelector('.bill-confirm').textContent).toBe(th['web.bills.confirm']);
    const billReads = reads(liff, '/api/bills');
    const friendReads = reads(liff, '/api/friends');

    settings.resolve(settingsWith('en'));
    await settle();

    expect(incomingCard().querySelector('.bill-confirm').textContent).toBe('Confirm');
    expect(incomingCard().querySelector('.bill-meta').textContent).toBe('Food · Total ฿600');
    expect(reads(liff, '/api/bills')).toBe(billReads);
    expect(reads(liff, '/api/friends')).toBe(friendReads);
  });

  it('redraws the goal cards in English from the loaded data once the server language arrives', async () => {
    const settings = deferredSettings();
    const liff = await boot({ overrides: { '/api/settings': settings.pending } });
    clickTab('goals');
    await settle();
    expect(texts('#goal-rows .goal-date')).toEqual(['ถึงเป้า 31 ธ.ค. 2569']);
    const goalReads = reads(liff, '/api/goals');

    settings.resolve(settingsWith('en'));
    await settle();

    expect(texts('#goal-rows .goal-date')[0]).toMatch(/^Target date /);
    expect(texts('#goal-rows .goal-done')).toEqual([en['web.goals.done']]);
    expect(byId('goals-closed-count').textContent).toBe('1 closed goal');
    expect(byId('goals-hero-count').textContent).toBe('Saved across 2 goals');
    expect(reads(liff, '/api/goals')).toBe(goalReads);
  });

  it('waits for the goal detail to close before redrawing the goal cards', async () => {
    const settings = deferredSettings();
    await boot({ overrides: { '/api/settings': settings.pending } });
    clickTab('goals');
    await settle();
    document.querySelector('#goal-rows .goal-card').click();
    await settle();

    settings.resolve(settingsWith('en'));
    await settle();
    expect(texts('#goal-rows .goal-date')).toEqual(['ถึงเป้า 31 ธ.ค. 2569']);

    byId('goal-detail').close();
    byId('goal-detail').dispatchEvent(new Event('close'));
    await settle();
    expect(texts('#goal-rows .goal-date')[0]).toMatch(/^Target date /);
  });
});
