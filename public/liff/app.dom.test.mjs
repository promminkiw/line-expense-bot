// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { URL as NodeUrl } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TABS } from './tabs.mjs';
import { categoryStyle } from './categories.mjs';
import { createEmptyState } from './empty-state.mjs';

// jsdom replaces the global URL with one that rejects file: URLs, so use Node's
const html = readFileSync(new NodeUrl('./index.html', import.meta.url), 'utf8');

const CATEGORIES = [
  { id: 'c-food', name: 'อาหาร', type: 'expense' },
  { id: 'c-trip', name: 'เดินทาง', type: 'expense' },
  { id: 'c-salary', name: 'เงินเดือน', type: 'income' },
];

const TRANSACTIONS = [
  { id: 't1', type: 'expense', amount: 60, note: 'ข้าวมันไก่', occurredOn: '2026-10-02', categoryId: 'c-food', categoryName: 'อาหาร' },
  { id: 't2', type: 'expense', amount: 40, note: 'BTS', occurredOn: '2026-10-01', categoryId: 'c-trip', categoryName: 'เดินทาง' },
  { id: 't3', type: 'income', amount: 25000, note: '', occurredOn: '2026-10-01', categoryId: 'c-salary', categoryName: 'เงินเดือน' },
];

const RESPONSES = {
  '/api/config': { liffId: 'liff-1' },
  '/api/friends': { code: 'ABCD2345', friends: [{ id: 'f-1', displayName: 'บี' }] },
  '/api/friends/lookup': { friend: { id: 'f-2', displayName: 'ซี' } },
  '/api/friends/code': { code: 'WXYZ6789' },
  '/api/categories': { categories: CATEGORIES },
  '/api/transactions': {
    transactions: TRANSACTIONS,
    summary: [
      { type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 },
      { type: 'expense', category: 'เดินทาง', total: 40, entryCount: 1 },
      { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
    ],
    truncated: false,
  },
  '/api/budgets': {
    budgets: [
      { categoryId: 'c-food', category: 'อาหาร', budget: 1000, spent: 60 },
      { categoryId: 'c-trip', category: 'เดินทาง', budget: null, spent: 40 },
    ],
  },
  '/api/recurring': { rules: [] },
  '/api/trend': {
    months: [
      { month: '2026-05', income: 0, expense: 0 },
      { month: '2026-06', income: 0, expense: 0 },
      { month: '2026-07', income: 0, expense: 0 },
      { month: '2026-08', income: 0, expense: 0 },
      { month: '2026-09', income: 0, expense: 200 },
      { month: '2026-10', income: 25000, expense: 100 },
    ],
  },
  '/api/profile': { displayName: 'สมชาย', income: 25000, expense: 100, balance: 24900, entryCount: 3, firstDate: '2026-08-03' },
};

const EMPTY_MONTH = { transactions: [], summary: [], truncated: false };

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// the fake fetch resolves in microtasks only, so one macrotask drains the whole boot chain
const settle = flush;

const LOADING_ELEMENT_IDS = ['list-head-skeleton', 'summary-skeleton', 'trend-skeleton', 'budgets-skeleton', 'recurring-skeleton', 'profile-skeleton'];

// override: Error -> network failure, { status } -> HTTP error, anything else -> JSON body
function makeFetch(overrides) {
  return async (url) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = path in overrides ? overrides[path] : RESPONSES[path];
    if (body instanceof Error) throw body;
    if (body && typeof body === 'object' && 'status' in body && Object.keys(body).length === 1) {
      return { ok: false, status: body.status, json: async () => ({}) };
    }
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body };
  };
}

// returns the fake liff; liff.fetched lists requested paths and liff.loadingSnapshot is the DOM state when transactions were requested
async function boot({ inClient = true, loggedIn = true, overrides = {}, search = '' } = {}) {
  vi.resetModules();
  window.history.replaceState(null, '', `/liff/${search}`);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T05:00:00Z'));
  document.documentElement.innerHTML = html;
  const initOptions = [];
  const fetched = [];
  const liff = {
    init: async (options) => {
      initOptions.push(options);
    },
    isLoggedIn: () => loggedIn,
    login: vi.fn(),
    getIDToken: () => 'token',
    isInClient: () => inClient,
    closeWindow: vi.fn(),
    openWindow: vi.fn(),
    initOptions,
    fetched,
    loadingSnapshot: null,
  };
  const innerFetch = makeFetch(overrides);
  const fetchStub = async (url, ...rest) => {
    const path = new URL(url, 'http://localhost').pathname;
    fetched.push(path);
    if (path === '/api/transactions' && !liff.loadingSnapshot) {
      liff.loadingSnapshot = {
        listSkeletons: document.querySelectorAll('#list .skeleton').length,
        visibleLoaders: LOADING_ELEMENT_IDS.filter((id) => !document.getElementById(id).hidden),
      };
    }
    return innerFetch(url, ...rest);
  };
  vi.stubGlobal('liff', liff);
  vi.stubGlobal('fetch', fetchStub);
  // reduced motion resolves count-up and bar growth at once; animated paths are covered in motion.test.mjs
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  vi.stubGlobal('scrollTo', () => {});
  // jsdom has no modal dialog support; mirror the open attribute so the edit flow can run
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
  await import('./app.mjs');
  await settle();
  return liff;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const byId = (id) => document.getElementById(id);

// route(method, path) returns an override (same shape as makeFetch) or undefined for the default response
function routeFetch(route) {
  const calls = [];
  const fallback = makeFetch({});
  vi.stubGlobal('fetch', async (url, options = {}) => {
    const path = new URL(url, 'http://localhost').pathname;
    const method = options.method ?? 'GET';
    calls.push(`${method} ${path}`);
    const override = route(method, path);
    return override === undefined ? fallback(url, options) : makeFetch({ [path]: override })(url, options);
  });
  return calls;
}

const clickTab = (id) => document.querySelector(`#bottom-nav button[data-tab="${id}"]`).click();

async function submitEditOfFirstRow() {
  document.querySelector('#list .row-button').click();
  await settle();
  byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
}

async function deleteFirstRow() {
  document.querySelector('#list .row-button').click();
  await settle();
  byId('delete-button').click();
  byId('confirm-ok').click();
  await settle();
}

describe('index.html static invariants', () => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const symbolIds = new Set([...doc.querySelectorAll('symbol[id]')].map((symbol) => symbol.id));

  it('defines a sprite symbol for every category icon', () => {
    const names = ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', 'เงินเดือน', 'รายได้เสริม', 'ใบเสร็จ/สลิปโอนเงิน', 'อื่นๆ', 'ไม่รู้จัก'];
    const missing = names.map((name) => categoryStyle(name).symbol).filter((id) => !symbolIds.has(id));

    expect(missing).toEqual([]);
    expect(symbolIds.has('cat-food')).toBe(true);
    expect(symbolIds.has('cat-other')).toBe(true);
  });

  it('defines a sprite symbol for every bottom tab icon', () => {
    expect(TABS.map((tab) => tab.icon).filter((id) => !symbolIds.has(id))).toEqual([]);
    expect(symbolIds.has('tab-list')).toBe(true);
    expect(symbolIds.has('tab-user')).toBe(true);
  });

  it('defines a sprite symbol for every empty state illustration', () => {
    const used = ['list', 'search', 'summary', 'recurring'].map((kind) =>
      createEmptyState(document, kind).querySelector('use').getAttribute('href').slice(1)
    );

    expect(used.filter((id) => !symbolIds.has(id))).toEqual([]);
    expect(used.sort()).toEqual(['empty-chart', 'empty-list', 'empty-recurring', 'empty-search']);
  });

  it('keeps the banner inside the sticky header so an error stays visible while scrolling', () => {
    expect(doc.querySelector('.top-sticky .bar')).not.toBeNull();
    expect(doc.querySelector('.top-sticky #banner')).not.toBeNull();
    expect(doc.querySelector('.top-sticky #banner-retry')).not.toBeNull();
  });

  it('labels the editor dialog with its heading', () => {
    const editor = doc.getElementById('editor');
    const heading = doc.getElementById(editor.getAttribute('aria-labelledby'));

    expect(heading.textContent).toBe('แก้ไขรายการ');
  });

  it('starts every JS-controlled loading and error element hidden', () => {
    const ids = [
      'banner',
      'banner-retry',
      'filters',
      'filter-clear',
      'list-head-skeleton',
      'summary-skeleton',
      'trend-loading',
      'trend-skeleton',
      'trend-error',
      'budgets-loading',
      'budgets-skeleton',
      'budgets-error',
      'recurring-loading',
      'recurring-skeleton',
      'recurring-error',
      'recurring-empty',
      'profile-loading',
      'profile-skeleton',
      'profile-error',
      'profile-card',
      'profile-stale',
      'profile-close',
      'trend-empty',
      'edit-busy',
      'friends',
      'friend-qr',
    ];

    const visible = ids.filter((id) => !doc.getElementById(id).hasAttribute('hidden'));
    expect(visible).toEqual([]);
  });
});

describe('LIFF page after a normal boot', () => {
  let liff;

  beforeEach(async () => {
    liff = await boot();
  });

  it('renders the five bottom tabs with the list tab selected', () => {
    const buttons = [...document.querySelectorAll('#bottom-nav button')];

    expect(buttons.map((button) => button.textContent)).toEqual(['รายการ', 'สรุป', 'จัดการงบ', 'รอบเดือน', 'โปรไฟล์']);
    expect(document.querySelectorAll('#bottom-nav [aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector('#bottom-nav [aria-current="page"]').textContent).toBe('รายการ');
    expect(byId('page-title').textContent).toBe('รายการของฉัน');
    expect(byId('month').hidden).toBe(false);
    expect(byId('month').value).toBe('2026-10');
    expect(byId('panel-list').hidden).toBe(false);
    for (const id of ['summary', 'budgets', 'recurring', 'profile']) {
      expect(byId(`panel-${id}`).hidden).toBe(true);
    }
  });

  it('initialised liff and left the shared banner hidden', () => {
    expect(liff.initOptions).toEqual([{ liffId: 'liff-1' }]);
    expect(byId('banner').hidden).toBe(true);
    expect(byId('banner').textContent).toBe('');
  });

  it('shows the transactions with category badges, names and notes in place of the skeleton', () => {
    const rows = document.querySelectorAll('#list .row');

    expect(rows).toHaveLength(3);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('list-head-skeleton').hidden).toBe(true);
    expect(byId('summary-skeleton').hidden).toBe(true);
    expect([...document.querySelectorAll('#list .day .day-date')].map((day) => day.textContent)).toEqual(['02/10', '01/10']);
    expect([...document.querySelectorAll('#list .day .day-net')].map((net) => net.textContent)).toEqual(['-60', '+24,960']);
    expect(rows[0].querySelector('.row-title').textContent).toBe('อาหาร');
    expect(rows[0].querySelector('.row-note').textContent).toBe('ข้าวมันไก่');
    expect(rows[0].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-food');
    expect(rows[0].querySelector('.amount').textContent).toBe('-60 บาท');
    expect(rows[1].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-transport');
    expect(rows[1].querySelector('.row-title').textContent).toBe('เดินทาง');
    expect(rows[2].classList.contains('cat-salary')).toBe(true);
    expect(rows[2].classList.contains('income')).toBe(true);
    expect(rows[2].querySelector('.row-title').textContent).toBe('เงินเดือน');
    expect(rows[2].querySelector('.row-note')).toBeNull();
    expect(rows[2].querySelector('.amount').textContent).toBe('+25,000 บาท');
    expect(byId('status').hidden).toBe(true);
  });

  it('shows the three month stat cards', () => {
    expect(byId('totals').hidden).toBe(false);
    // คงเหลือเป็นตัวหลักอยู่บนสุด รายรับ/รายจ่ายอยู่แถวรองข้างใต้
    expect(byId('totals').firstElementChild.classList.contains('balance')).toBe(true);
    expect(byId('totals').querySelector('.stat-sub').children).toHaveLength(2);
    expect(byId('stat-income').textContent).toBe('25,000 บาท');
    expect(byId('stat-expense').textContent).toBe('100 บาท');
    expect(byId('stat-balance').textContent).toBe('24,900 บาท');
  });

  it('shows the filter bar with the category options and no active filter', () => {
    const options = [...byId('filter-category').options].map((option) => option.textContent);

    expect(byId('filters').hidden).toBe(false);
    expect(byId('filter-clear').hidden).toBe(true);
    expect(byId('filter-status').textContent).toBe('');
    expect(options).toEqual(['ทุกหมวด', 'อาหาร', 'เดินทาง', 'เงินเดือน']);
  });

  it('filters the list by the search box, shows the search empty state, and clear restores', () => {
    const search = byId('search');

    search.value = 'bts';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(1);
    expect(document.querySelector('#list .row .row-note').textContent).toBe('BTS');
    expect(byId('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ');
    expect(byId('filter-clear').hidden).toBe(false);

    search.value = 'ไม่มีแน่นอน';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
    expect(document.querySelector('#list .empty-title').textContent).toBe('ไม่พบรายการที่ค้นหา');
    expect(document.querySelector('#list .empty-state use').getAttribute('href')).toBe('#empty-search');
    expect(byId('filter-status').textContent).toBe('พบ 0 จาก 3 รายการ');
    expect(byId('filters').hidden).toBe(false);

    byId('filter-clear').click();
    expect(search.value).toBe('');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('filter-status').textContent).toBe('');
    expect(byId('filter-clear').hidden).toBe(true);
  });

  it('filters by type', () => {
    const type = byId('filter-type');

    type.value = 'income';
    type.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(1);
    expect(byId('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ');

    byId('filter-clear').click();
    expect(type.value).toBe('');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('renders the six-month trend and the comparison text', () => {
    const columns = document.querySelectorAll('#trend-bars .trend-col');
    const current = document.querySelectorAll('#trend-bars .trend-col.current');

    expect(columns).toHaveLength(6);
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(columns[5]);
    expect(current[0].querySelector('.trend-label').textContent).toBe('ต.ค.');
    expect(byId('trend-bars').hidden).toBe(false);
    expect(byId('trend-legend').hidden).toBe(false);
    expect(byId('trend-error').hidden).toBe(true);
    expect(byId('trend-loading').hidden).toBe(true);
    expect(byId('trend-skeleton').hidden).toBe(true);
    expect(byId('trend-comparison').hidden).toBe(false);
    expect(byId('trend-comparison').textContent).toBe('รายจ่ายน้อยกว่าเดือนก่อน 50% (-100 บาท)');
    expect(byId('trend-comparison').classList.contains('down')).toBe(true);
  });

  it('gives every trend bar a data-width and data-property for the replay animation', () => {
    const bars = [...document.querySelectorAll('#trend-bars .trend-bar')];
    const currentBars = document.querySelectorAll('#trend-bars .trend-col.current .trend-bar');

    expect(bars).toHaveLength(12);
    for (const bar of bars) {
      expect(bar.dataset.property).toBe('height');
      expect(Number.isFinite(Number(bar.dataset.width))).toBe(true);
    }
    expect(currentBars[0].classList.contains('income')).toBe(true);
    expect(currentBars[0].dataset.width).toBe('100');
    expect(currentBars[0].style.height).toBe('100%');
    expect(currentBars[1].dataset.width).toBe('2');
  });

  it('renders the budget rows with category badges and hides the loading state', () => {
    const rows = document.querySelectorAll('#budget-rows .budget-row');

    expect(byId('budgets').hidden).toBe(false);
    expect(byId('budgets-loading').hidden).toBe(true);
    expect(byId('budgets-skeleton').hidden).toBe(true);
    expect(byId('budgets-error').hidden).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-food');
    expect(rows[0].querySelector('.budget-label').textContent).toBe('อาหาร');
    expect(rows[0].querySelector('.budget-fill').dataset.width).toBe('6');
    expect(rows[1].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-transport');
    expect(rows[1].querySelector('.budget-fill')).toBeNull();
  });

  it('shows the recurring empty state when there are no rules', () => {
    expect(byId('recurring').hidden).toBe(false);
    expect(byId('recurring-empty').hidden).toBe(false);
    expect(document.querySelector('#recurring-empty .empty-title').textContent).toBe('ยังไม่มีรายการประจำ');
    expect(document.querySelectorAll('#recurring-rows .recurring-row')).toHaveLength(0);
    expect(byId('recurring-loading').hidden).toBe(true);
    expect(byId('recurring-skeleton').hidden).toBe(true);
    expect(byId('recurring-error').hidden).toBe(true);
    expect(byId('recurring-add').disabled).toBe(false);
  });

  it('shows the in-LINE close button only when liff reports it is in the client', () => {
    expect(byId('profile-close').hidden).toBe(false);

    byId('profile-close').click();
    expect(liff.closeWindow).toHaveBeenCalledTimes(1);
  });

  it('switches through every tab updating selection, panels, title, and month picker', () => {
    const expected = {
      list: { title: 'รายการของฉัน', month: false },
      summary: { title: 'สรุปรายเดือน', month: false },
      budgets: { title: 'จัดการงบประมาณ', month: false },
      recurring: { title: 'รายการประจำ', month: true },
      profile: { title: 'โปรไฟล์', month: true },
    };

    for (const [id, { title, month }] of Object.entries(expected)) {
      document.querySelector(`#bottom-nav button[data-tab="${id}"]`).click();
      expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe(id);
      expect(byId('page-title').textContent).toBe(title);
      expect(byId('month').hidden).toBe(month);
      for (const other of Object.keys(expected)) {
        expect(byId(`panel-${other}`).hidden).toBe(other !== id);
      }
    }
  });

  it('shows the profile with name, avatar initial, balance and since text', () => {
    document.querySelector('#bottom-nav button[data-tab="profile"]').click();

    expect(byId('profile-card').hidden).toBe(false);
    expect(byId('profile-name').textContent).toBe('สมชาย');
    expect(byId('profile-avatar').textContent).toBe('ส');
    expect(byId('profile-balance').textContent).toBe('24,900 บาท');
    expect(byId('profile-balance').classList.contains('negative')).toBe(false);
    expect(byId('profile-since').textContent).toBe('เริ่มบันทึกตั้งแต่ 3 ส.ค. 2569');
    expect(byId('profile-income').textContent).toBe('25,000 บาท');
    expect(byId('profile-expense').textContent).toBe('100 บาท');
    expect(byId('profile-count').textContent).toBe('3 รายการ');
    expect(byId('profile-loading').hidden).toBe(true);
    expect(byId('profile-skeleton').hidden).toBe(true);
    expect(byId('profile-error').hidden).toBe(true);
    expect(byId('profile-stale').hidden).toBe(true);
  });

  it('clears a transient banner message when the tab changes', async () => {
    routeFetch((method) => (method === 'PATCH' ? { status: 404 } : undefined));
    await submitEditOfFirstRow();
    expect(byId('banner').textContent).toBe('ไม่พบรายการนี้แล้ว');
    expect(byId('banner').hidden).toBe(false);

    clickTab('summary');

    expect(byId('banner').hidden).toBe(true);
    expect(byId('banner').textContent).toBe('');
    expect(byId('banner-retry').hidden).toBe(true);
  });

  // skeleton แต่ละชิ้นต้องเป็นรูปเดียวกับของจริงที่จะมาแทน ไม่งั้นเนื้อหาด้านล่างกระโดดตอนโหลดเสร็จ
  it('shapes each skeleton like the content that replaces it', () => {
    const variants = (id) => [...byId(id).children].map((item) => item.className.replace('skeleton skeleton-', ''));

    expect(variants('list-head-skeleton')).toEqual(['totals', 'filters']);
    expect(variants('summary-skeleton')).toEqual(['chart']);
    expect(variants('trend-skeleton')).toEqual(['trend']);
    expect(variants('budgets-skeleton')).toEqual(['budget', 'budget', 'budget', 'budget']);
    expect(variants('recurring-skeleton')).toEqual(['recurring', 'recurring', 'recurring']);
    expect(variants('profile-skeleton')).toEqual(['profile-head', 'balance', 'stats', 'tips']);
  });

  it('puts the list head skeleton where the totals card will appear', () => {
    const panel = byId('panel-list');
    const order = (id) => [...panel.children].indexOf(byId(id));

    expect(order('list-head-skeleton')).toBe(0);
    expect(order('list-head-skeleton')).toBeLessThan(order('totals'));
  });

  it('keeps the summary skeleton and empty state above the trend card', () => {
    const panel = byId('panel-summary');
    const order = (id) => [...panel.children].indexOf(byId(id));

    expect(order('summary-empty')).toBeLessThan(order('trend'));
    expect(order('summary-skeleton')).toBeLessThan(order('trend'));
    expect(order('chart')).toBeLessThan(order('trend'));
  });
});

describe('LIFF profile freshness after edits', () => {
  const profileCalls = (calls) => calls.filter((call) => call === 'GET /api/profile').length;

  it('reloads the profile after an edit and after a delete', async () => {
    await boot();
    const calls = routeFetch((method) => (method === 'PATCH' || method === 'DELETE' ? {} : undefined));

    await submitEditOfFirstRow();
    expect(profileCalls(calls)).toBe(1);
    expect(byId('editor').open).toBe(false);

    await deleteFirstRow();
    expect(profileCalls(calls)).toBe(2);
    expect(byId('confirm-delete').open).toBe(false);
  });

  it('shows the stale notice when the reload fails, then reloads on profile tab entry', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'PATCH') return {};
      return path === '/api/profile' ? { status: 500 } : undefined;
    });
    await submitEditOfFirstRow();

    expect(byId('profile-stale').hidden).toBe(false);
    expect(byId('profile-card').hidden).toBe(false);
    expect(byId('profile-error').hidden).toBe(true);

    const calls = routeFetch(() => undefined);
    clickTab('profile');
    await settle();

    expect(profileCalls(calls)).toBe(1);
    expect(byId('profile-stale').hidden).toBe(true);
    expect(byId('profile-balance').textContent).toBe('24,900 บาท');
  });

  it('does not reload a fresh profile on tab entry', async () => {
    await boot();
    const calls = routeFetch(() => undefined);

    clickTab('profile');
    await settle();

    expect(profileCalls(calls)).toBe(0);
  });
});

describe('LIFF page outside the LINE client', () => {
  it('keeps the profile close button hidden', async () => {
    const liff = await boot({ inClient: false });

    expect(byId('profile-close').hidden).toBe(true);
    byId('profile-close').click();
    expect(liff.closeWindow).not.toHaveBeenCalled();
  });
});

describe('LIFF page for an empty month', () => {
  it('hides the filter bar and shows the list and summary empty states', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });

    expect(byId('filters').hidden).toBe(true);
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(document.querySelector('#list .empty-title').textContent).toBe('ยังไม่มีรายการในเดือนนี้');
    expect(byId('status').textContent).toBe('ยังไม่มีรายการในเดือนนี้');
    expect(byId('summary-empty').hidden).toBe(false);
    expect(byId('summary-empty').querySelector('.empty-title').textContent).toBe('ยังไม่มีข้อมูลสรุปในเดือนนี้');
    expect(byId('chart').hidden).toBe(true);
    expect(byId('stat-balance').textContent).toBe('0 บาท');
  });

  it('shows the filter bar again when the month changes to one with data', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });
    expect(byId('filters').hidden).toBe(true);
    vi.stubGlobal('fetch', makeFetch({}));

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));
    await settle();

    expect(byId('filters').hidden).toBe(false);
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });
});

describe('LIFF page when loading fails', () => {
  it('shows the load error in the shared banner when /api/config rejects', async () => {
    const liff = await boot({ overrides: { '/api/config': new TypeError('network down') } });

    // loading never started, so there is no skeleton to clear
    expect(liff.fetched).toEqual(['/api/config']);
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('summary-skeleton').hidden).toBe(true);
    expect(byId('status').hidden).toBe(true);
  });

  it('shows the load error in the shared banner when /api/categories rejects', async () => {
    const liff = await boot({ overrides: { '/api/categories': new TypeError('network down') } });

    // loading never started, so there is no skeleton to clear
    expect(liff.fetched).not.toContain('/api/transactions');
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner').hidden).toBe(false);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('summary-skeleton').hidden).toBe(true);
  });

  it('removes the skeletons and shows the banner when /api/transactions fails after loading started', async () => {
    const liff = await boot({ overrides: { '/api/transactions': { status: 500 } } });

    // skeletons were really shown when the request went out
    expect(liff.loadingSnapshot.listSkeletons).toBe(6);
    expect(liff.loadingSnapshot.visibleLoaders).toEqual(LOADING_ELEMENT_IDS);
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(byId('list-head-skeleton').hidden).toBe(true);
    expect(byId('summary-skeleton').hidden).toBe(true);
    expect(byId('filters').hidden).toBe(true);
    expect(byId('status').hidden).toBe(true);
    // the other sections load independently and still render
    expect(document.querySelectorAll('#budget-rows .budget-row')).toHaveLength(2);
    expect(document.querySelectorAll('#trend-bars .trend-col')).toHaveLength(6);
  });

  it('asks the user to reopen from LINE on a 401', async () => {
    await boot({ overrides: { '/api/transactions': { status: 401 } } });

    expect(byId('banner').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
  });

  it('shows the profile error with a retry button when only /api/profile fails', async () => {
    await boot({ overrides: { '/api/profile': { status: 500 } } });
    // entering the tab retries a profile that never loaded
    document.querySelector('#bottom-nav button[data-tab="profile"]').click();
    await settle();

    expect(byId('profile-error').hidden).toBe(false);
    expect(byId('profile-error-text').textContent).toBe('โหลดโปรไฟล์ไม่สำเร็จ');
    expect(byId('profile-retry').hidden).toBe(false);
    expect(byId('profile-card').hidden).toBe(true);
    expect(byId('profile-skeleton').hidden).toBe(true);

    vi.stubGlobal('fetch', makeFetch({}));
    byId('profile-retry').click();
    await settle();

    expect(byId('profile-error').hidden).toBe(true);
    expect(byId('profile-card').hidden).toBe(false);
    expect(byId('profile-name').textContent).toBe('สมชาย');
  });

  it('keeps the load error visible after switching tabs and back when /api/transactions fails', async () => {
    await boot({ overrides: { '/api/transactions': { status: 500 } } });

    clickTab('summary');
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner').hidden).toBe(false);
    clickTab('list');

    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner-retry').hidden).toBe(false);
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
  });

  it('shows the boot load error on every tab after a boot failure', async () => {
    await boot({ overrides: { '/api/categories': new TypeError('network down') } });

    for (const id of ['list', 'summary', 'budgets', 'recurring', 'profile', 'list']) {
      clickTab(id);
      expect(byId('banner').hidden, id).toBe(false);
      expect(byId('banner').textContent, id).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
      expect(byId('banner-retry').hidden, id).toBe(false);
    }
  });

  it('offers no retry for the login-required message', async () => {
    await boot({ overrides: { '/api/transactions': { status: 401 } } });

    clickTab('summary');

    expect(byId('banner').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
    expect(byId('banner-retry').hidden).toBe(true);
  });

  it('reloads the month and clears the error when the retry button is clicked', async () => {
    await boot({ overrides: { '/api/transactions': { status: 500 } } });
    expect(byId('banner-retry').hidden).toBe(false);
    const calls = routeFetch(() => undefined);

    byId('banner-retry').click();
    await settle();

    expect(calls).toContain('GET /api/transactions');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('banner').hidden).toBe(true);
    expect(byId('banner-retry').hidden).toBe(true);
    clickTab('summary');
    clickTab('list');
    expect(byId('banner').hidden).toBe(true);
  });

  it('keeps the stale list and the filter bar when a non-reset reload fails', async () => {
    await boot();
    routeFetch((method, path) => {
      if (method === 'PATCH') return {};
      return path === '/api/transactions' ? { status: 500 } : undefined;
    });

    await submitEditOfFirstRow();

    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('filters').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('banner-retry').hidden).toBe(false);
  });

  it('redirects to LINE login instead of loading data when not logged in', async () => {
    const liff = await boot({ loggedIn: false });

    expect(liff.login).toHaveBeenCalledTimes(1);
    expect(byId('banner').hidden).toBe(true);
    expect(liff.fetched).toEqual(['/api/config']);
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
  });
});


describe('LIFF page opened from a card link', () => {
  it('opens the editor of the linked transaction and cleans the address', async () => {
    await boot({ search: '?tx=t2&d=2026-10-01' });

    expect(byId('editor').open).toBe(true);
    expect(byId('edit-amount').value).toBe('40');
    expect(byId('edit-date').value).toBe('2026-10-01');
    expect(window.location.search).toBe('');
  });

  it('switches to the month of the linked date before looking for the transaction', async () => {
    await boot({ search: '?tx=t1&d=2026-09-29' });

    expect(byId('month').value).toBe('2026-09');
    expect(byId('editor').open).toBe(true);
  });

  it('says so when the linked transaction is no longer there', async () => {
    await boot({ search: '?tx=gone&d=2026-10-02' });

    expect(byId('editor').open).toBe(false);
    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('ไม่พบรายการนี้ อาจถูกลบหรือยกเลิกไปแล้ว');
  });

  it('ignores a link with a malformed id and shows the normal list', async () => {
    await boot({ search: '?tx=%3Cscript%3E&d=2026-09-29' });

    expect(byId('editor').open).toBe(false);
    expect(byId('month').value).toBe('2026-10');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('does not open an editor on a normal visit', async () => {
    await boot();

    expect(byId('editor').open).toBe(false);
  });
});

function pointer(element, type, x, y) {
  element.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
}

// dx คือระยะที่ปัดไปทางซ้าย (ค่าบวก = ซ้าย)
function swipeRow(row, dx) {
  pointer(row, 'pointerdown', 300, 100);
  pointer(row, 'pointermove', 300 - dx / 2, 101);
  pointer(row, 'pointermove', 300 - dx, 101);
  pointer(row, 'pointerup', 300 - dx, 101);
}

const firstRows = () => [...document.querySelectorAll('#list .row')];

describe('LIFF list swipe to delete', () => {
  it('gives every row a delete button labelled with its category, hidden until swiped', async () => {
    await boot();
    const [row] = firstRows();
    const button = row.querySelector('.row-delete');

    expect(button.getAttribute('aria-label')).toBe('ลบรายการ อาหาร');
    expect(button.textContent).toBe('ลบ');
    expect(row.classList.contains('swiped')).toBe(false);
  });

  it('reveals the delete button when swiped left past half of its width', async () => {
    await boot();
    const [row] = firstRows();

    swipeRow(row, 60);

    expect(row.classList.contains('swiped')).toBe(true);
    expect(row.style.getPropertyValue('--swipe')).toBe('88px');
  });

  it('snaps back after a short swipe and does not open the editor from the click that follows', async () => {
    await boot();
    const [row] = firstRows();

    swipeRow(row, 20);
    row.querySelector('.row-button').click();
    await settle();

    expect(row.classList.contains('swiped')).toBe(false);
    expect(row.style.getPropertyValue('--swipe')).toBe('0px');
    expect(byId('editor').open).toBe(false);
  });

  it('leaves vertical scrolling alone', async () => {
    await boot();
    const [row] = firstRows();

    pointer(row, 'pointerdown', 300, 100);
    pointer(row, 'pointermove', 297, 140);
    pointer(row, 'pointermove', 230, 150);
    pointer(row, 'pointerup', 230, 150);

    expect(row.classList.contains('swiped')).toBe(false);
  });

  it('does nothing when swiped to the right', async () => {
    await boot();
    const [row] = firstRows();

    swipeRow(row, -60);

    expect(row.classList.contains('swiped')).toBe(false);
    expect(row.style.getPropertyValue('--swipe')).toBe('0px');
  });

  it('deletes the transaction when the revealed button is tapped, without a confirm dialog, and reloads', async () => {
    await boot();
    const calls = routeFetch((method) => (method === 'DELETE' ? {} : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(calls).toContain('DELETE /api/transactions/t1');
    expect(calls.indexOf('GET /api/transactions')).toBeGreaterThan(calls.indexOf('DELETE /api/transactions/t1'));
    expect(byId('confirm-delete').open).toBe(false);
    expect(byId('editor').open).toBe(false);
  });

  it('shows the failure in the banner and keeps the list when the delete fails', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? { status: 500 } : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(byId('banner').hidden).toBe(false);
    expect(byId('banner').textContent).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('closes a revealed row when its content is tapped instead of opening the editor', async () => {
    await boot();
    const [row] = firstRows();
    swipeRow(row, 60);
    vi.setSystemTime(new Date(Date.now() + 1000));

    row.querySelector('.row-button').click();
    await settle();

    expect(row.classList.contains('swiped')).toBe(false);
    expect(byId('editor').open).toBe(false);
  });

  it('keeps only one row open at a time', async () => {
    await boot();
    const [first, second] = firstRows();

    swipeRow(first, 60);
    swipeRow(second, 60);

    expect(first.classList.contains('swiped')).toBe(false);
    expect(second.classList.contains('swiped')).toBe(true);
  });

  it('still opens the editor on a plain tap', async () => {
    await boot();
    const [row] = firstRows();

    row.querySelector('.row-button').click();
    await settle();

    expect(byId('editor').open).toBe(true);
  });
});


const ZERO_TREND = {
  months: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((month) => ({ month, income: 0, expense: 0 })),
};

describe('LIFF small tickets', () => {
  it('(C) says so when the six month trend has no entries at all', async () => {
    await boot({ overrides: { '/api/trend': ZERO_TREND } });

    expect(byId('trend-empty').hidden).toBe(false);
    expect(byId('trend-empty').textContent).toBe('ยังไม่มีรายการใน 6 เดือนล่าสุด');
    expect(byId('trend-bars').hidden).toBe(true);
    expect(byId('trend-legend').hidden).toBe(true);
    expect(byId('trend-comparison').hidden).toBe(true);
  });

  it('(C) keeps the chart and hides the empty note when there is data', async () => {
    await boot();

    expect(byId('trend-empty').hidden).toBe(true);
    expect(byId('trend-bars').hidden).toBe(false);
  });

  it('(B) shows saving progress in its own status line, not in the alert line', async () => {
    await boot();
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', (url, options = {}) =>
      (options.method ?? 'GET') === 'PATCH' ? new Promise(() => {}) : fallback(url, options)
    );
    document.querySelector('#list .row-button').click();
    await settle();

    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));

    expect(byId('edit-busy').hidden).toBe(false);
    expect(byId('edit-busy').textContent).toBe('กำลังบันทึก...');
    expect(byId('edit-error').hidden).toBe(true);
  });

  it('(B) shows a failed save in the alert line and clears the progress line', async () => {
    await boot();
    routeFetch((method) => (method === 'PATCH' ? { status: 500 } : undefined));

    await submitEditOfFirstRow();

    expect(byId('edit-busy').hidden).toBe(true);
    expect(byId('edit-error').hidden).toBe(false);
    expect(byId('edit-error').textContent).toBe('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('(E) does not ask for the profile again on every tab entry after a login required answer', async () => {
    const liff = await boot({ overrides: { '/api/profile': { status: 401 } } });
    const profileCalls = () => liff.fetched.filter((path) => path === '/api/profile').length;

    clickTab('profile');
    clickTab('list');
    clickTab('profile');
    await settle();

    expect(profileCalls()).toBe(1);
    expect(byId('profile-error').hidden).toBe(false);
  });

  it('(E) still retries a profile that failed for another reason when the tab is entered', async () => {
    const liff = await boot({ overrides: { '/api/profile': { status: 500 } } });

    clickTab('profile');
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/profile').length).toBe(2);
  });

  it('(I) the banner retry after a boot failure loads the categories, the list and the recurring tab', async () => {
    await boot({ overrides: { '/api/categories': { status: 500 } } });
    expect(byId('banner-retry').hidden).toBe(false);
    expect(byId('recurring-empty').hidden).toBe(true);

    routeFetch(() => undefined);
    byId('banner-retry').click();
    await settle();

    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
    expect(byId('recurring-empty').hidden).toBe(false);
    expect(byId('recurring-loading').hidden).toBe(true);
    expect(byId('banner').hidden).toBe(true);
  });

  it('(D) does not show a delete failure that arrives after the user moved to another tab', async () => {
    await boot();
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'DELETE') {
        await pending;
        return { ok: false, status: 500, json: async () => ({}) };
      }
      return fallback(url, options);
    });
    const [row] = firstRows();
    swipeRow(row, 60);
    row.querySelector('.row-delete').click();

    clickTab('summary');
    release();
    await settle();

    expect(byId('banner').hidden).toBe(true);
  });

  it('(D) still shows a delete failure on the tab where it started', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? { status: 500 } : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(byId('banner').textContent).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('(A) returns focus to the edited row after saving', async () => {
    await boot();
    routeFetch((method) => (method === 'PATCH' ? {} : undefined));
    const buttons = document.querySelectorAll('#list .row-button');
    buttons[1].click();
    await settle();

    byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(document.activeElement.classList.contains('row-button')).toBe(true);
    expect(document.activeElement.closest('.row').dataset.id).toBe('t2');
  });

  it('(A) moves focus to the next row after deleting from the editor', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? {} : undefined));

    await deleteFirstRow();

    expect(document.activeElement.closest('.row').dataset.id).toBe('t2');
  });

  it('(A) moves focus to the next row after deleting by swipe', async () => {
    await boot();
    routeFetch((method) => (method === 'DELETE' ? {} : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(document.activeElement.closest('.row').dataset.id).toBe('t2');
  });

  it('(A) falls back to the month field when the deleted row had no neighbour', async () => {
    await boot({
      overrides: {
        '/api/transactions': { transactions: [TRANSACTIONS[0]], summary: [], truncated: false },
      },
    });
    routeFetch((method) => (method === 'DELETE' ? {} : undefined));
    const [row] = firstRows();
    swipeRow(row, 60);

    row.querySelector('.row-delete').click();
    await settle();

    expect(document.activeElement).toBe(byId('month'));
  });
});

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
    expect(byId('friend-qr-toggle').getAttribute('aria-expanded')).toBe('true');
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
});
