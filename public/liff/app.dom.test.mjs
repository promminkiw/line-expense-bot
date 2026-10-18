// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
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
  '/api/bills': {
    owned: [
      {
        id: 'b-own',
        title: 'เนื้อย่าง',
        total: 900,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerShare: 300,
        createdAt: '2026-10-08T10:00:00+00:00',
        members: [
          { userId: 'f-1', displayName: 'บี', share: 300, status: 'confirmed', paid: false, notified: true },
          { userId: 'f-2', displayName: 'ซี', share: 300, status: 'pending', paid: false, notified: false },
        ],
      },
    ],
    incoming: [
      {
        id: 'b-in',
        title: 'ชาบู',
        total: 600,
        occurredOn: '2026-10-07',
        categoryName: 'อาหาร',
        status: 'open',
        ownerName: 'ดี',
        myShare: 200,
        myStatus: 'pending',
        paid: false,
      },
    ],
  },
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
    // { status } หรือ { status, error } คือ HTTP error พร้อม body แบบที่ server ตอบ
    if (body && typeof body === 'object' && typeof body.status === 'number' && Object.keys(body).every((key) => key === 'status' || key === 'error')) {
      return { ok: false, status: body.status, json: async () => (body.error === undefined ? {} : { error: body.error }) };
    }
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body };
  };
}

// returns the fake liff; liff.fetched lists requested paths and liff.loadingSnapshot is the DOM state when transactions were requested
async function boot({ inClient = true, loggedIn = true, overrides = {}, search = '', holdInit = false, decodedToken } = {}) {
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
      if (holdInit) await new Promise((resolve) => (liff.releaseInit = resolve));
    },
    isLoggedIn: () => loggedIn,
    login: vi.fn(),
    getIDToken: () => 'token',
    // ไม่ส่ง decodedToken = SDK ที่ไม่มี function นี้
    ...(decodedToken === undefined ? {} : { getDecodedIDToken: () => decodedToken }),
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

  // ผู้ใช้ให้แถวปุ่มล่างเหลือแค่ ลบ/ไม่ตั้งงบ กับ บันทึก ส่วนปิดเป็นปุ่ม X มุมขวาบน
  it.each([
    ['edit-form', 'cancel-button', 'delete-button'],
    ['budget-form', 'budget-cancel', 'budget-remove'],
    ['recurring-form', 'recurring-cancel', 'recurring-delete'],
  ])('moves the close button of %s to a labelled X outside the action row', (formId, closeId, removeId) => {
    const close = doc.getElementById(closeId);
    const actions = doc.getElementById(formId).querySelector('.actions');

    expect(close.closest('.actions')).toBeNull();
    expect(close.classList.contains('dialog-close')).toBe(true);
    expect(close.getAttribute('aria-label')).toBe('ปิด');
    expect(close.querySelector('use').getAttribute('href')).toBe('#icon-close');
    expect([...actions.querySelectorAll('button')].map((button) => button.id || button.className)).toEqual([removeId, 'primary']);
  });

  it('defines the close icon symbol', () => {
    expect(symbolIds.has('icon-close')).toBe(true);
  });

  // ผู้ใช้อยากให้ลิงก์อ่านใบเสร็จอยู่ในกรอบขาวเดียวกับช่องยอดรวม แต่ปุ่มต้องไม่อยู่ใน label
  it('puts the receipt link in the same card as the total, outside its label', () => {
    const card = doc.getElementById('bill-form-total').closest('.bill-form-card');

    expect(card).not.toBeNull();
    expect(card.parentElement.id).toBe('bill-form');
    expect(card.contains(doc.getElementById('bill-form-receipt-button'))).toBe(true);
    expect(doc.getElementById('bill-form-receipt-button').closest('label')).toBeNull();
  });

  it('announces friend errors and offers search on the code keyboard', () => {
    expect(doc.getElementById('friends-error-text').getAttribute('role')).toBe('alert');
    expect(doc.getElementById('friend-code-input').getAttribute('enterkeyhint')).toBe('search');
    expect(doc.getElementById('friends-title').getAttribute('tabindex')).toBe('-1');
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

  it('sets the brand theme color and ships the mascot it references', () => {
    expect(doc.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#1157c5');
    for (const img of doc.querySelectorAll('img[src^="assets/"]')) {
      expect(img.getAttribute('alt')).toBe('');
      expect(existsSync(new NodeUrl(img.getAttribute('src'), import.meta.url)), img.getAttribute('src')).toBe(true);
    }
    expect(doc.querySelector('.bar > .bar-mascot + #page-title')).not.toBeNull();
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
      'bill-form-no-friends',
      'bill-form-friends-loading',
      'bill-form-friends-error',
      'bill-form-categories-error',
      'bill-form-go-profile',
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
      'categories-manager',
      'friend-qr',
      'friends-skeleton',
      'friend-dialog-busy',
      'bills-error',
      'bills-skeleton',
      'bill-dialog-busy',
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
    for (const id of ['summary', 'budgets', 'recurring', 'bills', 'profile']) {
      expect(byId(`panel-${id}`).hidden).toBe(true);
    }
    expect(byId('bottom-nav').hidden).toBe(false);
    expect(byId('panel-profile').contains(byId('friends'))).toBe(true);
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
    expect(byId('stat-balance').classList.contains('negative')).toBe(false);
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

  // สรุปตามหมวดแบบ S5: แถบเดียวแบ่งสีตามหมวด สีของแต่ละแถวตรงกับช่วงในแถบ
  it('draws the segmented category bar with matching row colors', () => {
    const segments = [...byId('chart-stack').children];
    const rows = [...document.querySelectorAll('#chart-rows .chart-row')];

    expect(byId('chart-stack').getAttribute('aria-hidden')).toBe('true');
    expect(segments.map((segment) => segment.style.width)).toEqual(['60%', '40%']);
    expect(segments.map((segment) => segment.style.background)).toEqual(['var(--chart-1)', 'var(--chart-2)']);
    expect(rows.map((row) => row.style.getPropertyValue('--dot'))).toEqual(['var(--chart-1)', 'var(--chart-2)']);

    document.querySelector('#chart .tabs [data-type="income"]').click();
    expect([...byId('chart-stack').children].map((segment) => segment.style.width)).toEqual(['100%']);
    document.querySelector('#chart .tabs [data-type="expense"]').click();
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

  // ใช้เกินรายรับต้องเห็นเป็นสีแดงเหมือนยอดสะสมในหน้าโปรไฟล์
  it('marks a negative month balance so it shows in red', async () => {
    const overspent = { ...RESPONSES['/api/transactions'], summary: [{ type: 'expense', category: 'อาหาร', total: 500, entryCount: 1 }] };
    await boot({ overrides: { '/api/transactions': overspent } });

    expect(byId('stat-balance').textContent).toBe('-500 บาท');
    expect(byId('stat-balance').classList.contains('negative')).toBe(true);
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

  // กั้นการโหลดรายการของเดือนถัดไปไว้ เพื่อดู skeleton ระหว่างรอ
  function holdTransactions() {
    const fallback = makeFetch({});
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (url, ...rest) => {
      if (new URL(url, 'http://localhost').pathname === '/api/transactions') await gate;
      return fallback(url, ...rest);
    });
    return release;
  }

  // การ์ดสรุปสูงตามจำนวนหมวด skeleton ที่สูงเท่าการ์ดเดือนก่อนจึงใกล้ของจริงกว่าค่าคงที่
  it('sizes the summary skeleton like the last drawn chart while the next month loads', async () => {
    await boot();
    byId('chart').getBoundingClientRect = () => ({ height: 397 });
    const release = holdTransactions();

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));

    expect(byId('summary-skeleton').hidden).toBe(false);
    expect(byId('summary-skeleton').querySelector('.skeleton').style.height).toBe('397px');
    release();
    await settle();
  });

  it('keeps the default summary skeleton height when no chart was drawn yet', async () => {
    await boot({ overrides: { '/api/transactions': EMPTY_MONTH } });
    const release = holdTransactions();

    byId('month').value = '2026-09';
    byId('month').dispatchEvent(new Event('change'));

    expect(byId('summary-skeleton').querySelector('.skeleton').style.height).toBe('');
    release();
    await settle();
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
  it('opens only the friend dialog when the link has both an entry and a friend code', async () => {
    await boot({ search: '?tx=t2&d=2026-10-01&friend=WXYZ2345' });
    await settle();

    expect(byId('friend-dialog').hasAttribute('open')).toBe(true);
    expect(byId('editor').hasAttribute('open')).toBe(false);
  });

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

// หน้ารอบเดือนแบบ R2 ที่ผู้ใช้เลือก: คำอธิบายบรรทัดเดียว เงื่อนไขพับไว้ แถวแยกวันที่ ชื่อ ยอดเป็นชิ้น
describe('recurring tab style r2', () => {
  const RULES = {
    rules: [
      { id: 'r-1', type: 'income', categoryId: 'c-salary', amount: 25000, dayOfMonth: 1, note: 'บริษัท', active: true },
      { id: 'r-2', type: 'expense', categoryId: 'c-trip', amount: 1200, dayOfMonth: 31, note: '', active: false },
    ],
  };

  it('keeps the hint to one line and folds the timing rules into a details element', async () => {
    await boot({ overrides: { '/api/recurring': RULES } });

    expect(document.querySelector('.recurring-hint').textContent).toBe('บอทจดให้อัตโนมัติเดือนละครั้ง และแจ้งใน LINE');
    expect(document.querySelector('.recurring-more summary').textContent).toBe('เริ่มจดเมื่อไร');
    expect(document.querySelector('.recurring-more').textContent).toContain('จะเริ่มเดือนหน้า');
    expect(document.querySelector('.recurring-more').textContent).toContain('กดยกเลิกได้');
  });

  it('renders each rule as a calendar day, a name, a signed amount and a paused tag', async () => {
    await boot({ overrides: { '/api/recurring': RULES } });
    const rows = [...document.querySelectorAll('#recurring-rows .recurring-row')];

    expect(rows.map((row) => row.querySelector('.recurring-cal b').textContent)).toEqual(['1', '31']);
    expect(rows.map((row) => row.querySelector('.recurring-name').textContent)).toEqual(['บริษัท', 'เดินทาง']);
    expect(rows.map((row) => row.querySelector('.recurring-amount').textContent)).toEqual(['+25,000 บาท', '-1,200 บาท']);
    expect(rows[0].querySelector('.recurring-sub').textContent).toBe('เงินเดือน');
    expect(rows[1].querySelector('.recurring-paused').textContent).toBe('หยุดไว้');
    expect(rows[0].classList.contains('income')).toBe(true);
    expect(rows[1].classList.contains('paused')).toBe(true);
    expect(rows[0].querySelector('.recurring-cal').getAttribute('aria-hidden')).toBe('true');
    // screen reader ยังได้ข้อความเต็ม รวมเงื่อนไขวันที่ 29-31 ที่ย้ายไปพับไว้
    expect(rows[1].querySelector('button').getAttribute('aria-label')).toBe('เดินทาง รายจ่าย 1,200 บาท · ทุกวันที่ 31 (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย) · หยุดไว้');
  });
});

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

describe('LIFF bills tab', () => {
  // หยุด boot ไว้ที่ liff.init เพื่อให้ route ใช้กับการโหลดบิลครั้งแรกของหน้าหารบิลด้วย
  async function openBills({ route } = {}) {
    const liff = await boot({ search: '?tab=bills', holdInit: true });
    const calls = route ? routeFetch(route) : routeFetch(() => undefined);
    liff.releaseInit();
    await settle();
    return calls;
  }

  const incomingCard = () => document.querySelector('#bills-incoming .bill-card');
  const ownedCard = () => document.querySelector('#bills-owned .bill-card');
  // บิลที่จบแล้วย้ายไปอยู่ในส่วนที่พับไว้ จึงหาด้วย id ทั้งหน้า
  const cardOf = (id) => document.querySelector(`#panel-bills .bill-card[data-id="${id}"]`);

  const withBills = (bills) => (method, path) => (path === '/api/bills' && method === 'GET' ? bills : undefined);
  const BASE = RESPONSES['/api/bills'];

  it('names the bill or the friend on every card button for screen readers', async () => {
    await openBills();

    expect(incomingCard().querySelector('.bill-confirm').getAttribute('aria-label')).toBe('ยืนยันบิล ชาบู');
    expect(incomingCard().querySelector('.bill-decline').getAttribute('aria-label')).toBe('ปฏิเสธบิล ชาบู');
    expect(ownedCard().querySelector('.bill-cancel').getAttribute('aria-label')).toBe('ยกเลิกบิล เนื้อย่าง');
    const paidBoxes = [...ownedCard().querySelectorAll('.bill-member-paid input')];
    expect(paidBoxes.map((box) => box.getAttribute('aria-label'))).toEqual(['บี คืนแล้ว', 'ซี คืนแล้ว']);
    expect(ownedCard().querySelector('.bill-share-link').getAttribute('aria-label')).toBe('ส่งลิงก์บิล เนื้อย่าง');
  });

  it('puts decline on the left of confirm', async () => {
    await openBills();

    const actions = [...incomingCard().querySelectorAll('.bill-actions button')];
    expect(actions.map((node) => node.className)).toEqual(['bill-decline', 'bill-confirm']);
  });

  it('opens the friends page first when a bill waits for an answer', async () => {
    await openBills();

    expect(byId('bills-show-incoming').getAttribute('aria-pressed')).toBe('true');
    expect(byId('bills-show-owned').getAttribute('aria-pressed')).toBe('false');
    expect(byId('bills-incoming-section').hidden).toBe(false);
    expect(byId('bills-owned-section').hidden).toBe(true);
    expect(byId('bills-awaiting').textContent).toBe('1');
    expect(byId('bills-show-incoming').getAttribute('aria-label')).toBe('เพื่อนส่งมา รอคุณตอบ 1 บิล');
  });

  it('opens my bills first when nothing waits for an answer, and switches between the two pages', async () => {
    const incoming = [{ ...BASE.incoming[0], myStatus: 'confirmed' }];
    await openBills({ route: withBills({ owned: BASE.owned, incoming }) });

    expect(byId('bills-owned-section').hidden).toBe(false);
    expect(byId('bills-incoming-section').hidden).toBe(true);
    expect(byId('bills-awaiting').hidden).toBe(true);
    expect(byId('bills-show-incoming').hasAttribute('aria-label')).toBe(false);
    byId('bills-show-incoming').click();
    expect(byId('bills-incoming-section').hidden).toBe(false);
    expect(byId('bills-owned-section').hidden).toBe(true);
    expect(byId('bills-show-incoming').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the chosen page when the list reloads', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    byId('bills-show-owned').click();
    await settle();

    expect(byId('bills-owned-section').hidden).toBe(false);
  });

  it('shows a short card that opens to the members when tapped', async () => {
    await openBills();
    const row = ownedCard().querySelector('.bill-row');
    const detail = ownedCard().querySelector('.bill-detail');

    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(row.getAttribute('aria-controls')).toBe(detail.id);
    expect(detail.hidden).toBe(true);
    row.click();
    expect(ownedCard().querySelector('.bill-row').getAttribute('aria-expanded')).toBe('true');
    expect(ownedCard().querySelector('.bill-detail').hidden).toBe(false);
    ownedCard().querySelector('.bill-row').click();
    expect(ownedCard().querySelector('.bill-detail').hidden).toBe(true);
  });

  it('keeps an opened card open and focused after ticking paid', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { paid: true } : undefined) });
    ownedCard().querySelector('.bill-row').click();

    const box = ownedCard().querySelector('.bill-member-paid input');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(ownedCard().querySelector('.bill-detail').hidden).toBe(false);
    expect(document.activeElement).toBe(ownedCard().querySelector('.bill-member-paid input'));
  });

  it('keeps answer buttons outside the folded part so they work without opening the card', async () => {
    await openBills();

    expect(incomingCard().querySelector('.bill-row .bill-confirm')).toBeNull();
    expect(incomingCard().querySelector('.bill-detail .bill-confirm')).toBeNull();
    expect(incomingCard().querySelector('.bill-confirm')).not.toBeNull();
  });

  it('moves finished bills into a folded section with a count', async () => {
    const owned = [
      BASE.owned[0],
      { ...BASE.owned[0], id: 'b-done', title: 'ตั๋วหนัง', status: 'cancelled' },
      { ...BASE.owned[0], id: 'b-paid', title: 'แท็กซี่', members: [{ ...BASE.owned[0].members[0], paid: true }] },
    ];
    await openBills({ route: withBills({ owned, incoming: [] }) });

    expect([...document.querySelectorAll('#bills-owned .bill-card')].map((card) => card.dataset.id)).toEqual(['b-own']);
    expect(byId('bills-owned-done').hidden).toBe(false);
    expect(byId('bills-owned-done').open).toBe(false);
    expect(byId('bills-owned-done-count').textContent).toBe('2');
    const done = [...byId('bills-owned-done-list').querySelectorAll('.bill-card')];
    expect(done.map((card) => card.querySelector('.bill-summary').textContent)).toEqual(['ยกเลิกแล้ว', 'คืนครบแล้ว']);
    expect(cardOf('b-paid').querySelector('.bill-amount').textContent).toBe('900 บาท');
    expect(byId('bills-incoming-done').hidden).toBe(true);
  });

  it('says there is nothing left to handle when every bill is finished', async () => {
    const owned = [{ ...BASE.owned[0], status: 'cancelled' }];
    await openBills({ route: withBills({ owned, incoming: [] }) });

    expect(byId('bills-owned-empty').hidden).toBe(false);
    expect(byId('bills-owned-empty').textContent).toBe('ไม่มีบิลที่เพื่อนยังค้าง');
  });

  it('notes when a list may be cut at the server limit', async () => {
    const owned = Array.from({ length: 50 }, (_, i) => ({ ...BASE.owned[0], id: `b-${i}` }));
    await openBills({ route: withBills({ owned, incoming: BASE.incoming }) });

    expect(byId('bills-owned-limit').hidden).toBe(false);
    expect(byId('bills-owned-limit').textContent).toBe('แสดง 50 บิลล่าสุด');
    expect(byId('bills-incoming-limit').hidden).toBe(true);
  });

  it('opens a linked finished bill on its page, unfolds it and focuses the card', async () => {
    const linkedId = '77777777-7777-7777-7777-777777777777';
    const bills = { owned: [{ ...BASE.owned[0], id: linkedId, status: 'cancelled' }], incoming: BASE.incoming };
    await boot({ search: `?bill=${linkedId}`, overrides: { '/api/bills': bills } });
    await settle();

    expect(byId('bills-owned-section').hidden).toBe(false);
    expect(byId('bills-owned-done').open).toBe(true);
    expect(cardOf(linkedId).querySelector('.bill-detail').hidden).toBe(false);
    expect(document.activeElement).toBe(cardOf(linkedId));
  });

  it('focuses the folded section when an answered bill moves out of sight', async () => {
    const declined = { ...BASE.incoming[0], myStatus: 'declined' };
    let listCalls = 0;
    await openBills({
      route: (method, path) => {
        if (path === '/api/bills/b-in/decline') return { status: 'declined' };
        if (path !== '/api/bills') return undefined;
        listCalls += 1;
        return listCalls > 1 ? { owned: BASE.owned, incoming: [declined] } : undefined;
      },
    });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(document.activeElement).toBe(byId('bills-incoming-done').querySelector('summary'));
  });

  it('keeps focus on the bill after answering it, instead of losing it to the page', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').focus();
    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(document.activeElement).toBe(incomingCard());
  });

  it('keeps focus on the paid box after ticking it', async () => {
    await openBills({ route: (method, path) => (path.endsWith('/paid') ? { paid: true } : undefined) });
    const box = ownedCard().querySelector('.bill-member-paid input');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(document.activeElement).toBe(ownedCard().querySelector('.bill-member-paid input'));
  });

  it('labels the dialog close button so it is not confused with cancelling the bill', async () => {
    await openBills();

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-cancel').textContent).toBe('กลับ');
    byId('bill-dialog-cancel').click();
    incomingCard().querySelector('.bill-decline').click();
    expect(byId('bill-dialog-cancel').textContent).toBe('ยกเลิก');
  });

  it('offers no paid box for a member who never answered a cancelled bill', async () => {
    const owned = [{ ...BASE.owned[0], status: 'cancelled' }];
    await openBills({ route: withBills({ owned, incoming: [] }) });

    const rows = [...cardOf('b-own').querySelectorAll('.bill-member')];
    expect(rows.map((row) => Boolean(row.querySelector('.bill-member-paid')))).toEqual([true, false]);
  });

  it('disables retry while the bills are loading again', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { status: 500 } : undefined) });
    const release = holdRequest('/api/bills');

    byId('bills-retry').click();
    expect(byId('bills-retry').disabled).toBe(true);
    release();
    await settle();
    expect(byId('bills-retry').disabled).toBe(false);
  });

  it('shows a failed decline only in the dialog, not twice', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? new Error('offline') : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(byId('bill-dialog-error').textContent).toBe('ตอบบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('bills-status').textContent).toBe('');
  });

  it('keeps the buttons of a bill that is still sending disabled when another card redraws the list', async () => {
    const incoming = [BASE.incoming[0], { ...BASE.incoming[0], id: 'b-in2', title: 'หมูกระทะ' }];
    await openBills({
      route: (method, path) => {
        if (path === '/api/bills' && method === 'GET') return { owned: [], incoming };
        if (path === '/api/bills/b-in2/confirm') return { status: 'confirmed' };
        return undefined;
      },
    });
    const release = holdRequest('/api/bills/b-in/confirm', 'POST');
    const cards = () => [...document.querySelectorAll('#bills-incoming .bill-card')];

    cards()[0].querySelector('.bill-confirm').click();
    cards()[1].querySelector('.bill-confirm').click();
    await settle();

    expect(cards()[0].querySelector('.bill-confirm').disabled).toBe(true);
    release();
    await settle();
  });

  it('disables creating a bill until the page is signed in', async () => {
    const liff = await boot({ search: '?tab=bills', holdInit: true });

    expect(byId('bill-new').disabled).toBe(true);
    liff.releaseInit();
    await settle();
    expect(byId('bill-new').disabled).toBe(false);
  });

  it('uses the same decline wording as the bot', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? { status: 'declined' } : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('ปฏิเสธบิลนี้แล้ว');
  });

  it('tells a friend who confirmed a cancelled bill that the expense is still recorded', async () => {
    const incoming = [{ ...BASE.incoming[0], status: 'cancelled', myStatus: 'confirmed', expenseRecorded: true }];
    await openBills({ route: withBills({ owned: [], incoming }) });

    // ยังต้องไปลบรายจ่าย จึงอยู่กับบิลที่ต้องจัดการ ไม่ใช่ในส่วนที่พับไว้
    expect(incomingCard().dataset.id).toBe('b-in');

    // ต้องเห็นได้โดยไม่ต้องกางการ์ด เพราะผู้ใช้ต้องไปลบรายจ่ายเอง
    expect(cardOf('b-in').querySelector('.bill-detail .bill-note')).toBeNull();
    expect(cardOf('b-in').querySelector('.bill-note').textContent).toBe('บิลถูกยกเลิก แต่รายจ่ายส่วนของคุณยังบันทึกอยู่ ลบเองได้ในหน้าเว็บหลัก');
  });

  it('moves a cancelled bill to the finished part once its expense was deleted', async () => {
    const incoming = [{ ...BASE.incoming[0], status: 'cancelled', myStatus: 'confirmed', expenseRecorded: false }];
    await openBills({ route: withBills({ owned: [], incoming }) });

    expect(byId('bills-incoming-done').contains(cardOf('b-in'))).toBe(true);
    expect(cardOf('b-in').querySelector('.bill-note')).toBeNull();
  });

  it('loads the bills when the tab opens and shows both lists', async () => {
    await openBills();

    expect(byId('bills-incoming-title').textContent).toBe('บิลที่เพื่อนส่งมา');
    expect(incomingCard().querySelector('.bill-title').textContent).toBe('ชาบู');
    expect(incomingCard().querySelector('.bill-summary').textContent).toBe('ดี · รอคุณตอบ');
    expect(incomingCard().querySelector('.bill-amount').textContent).toBe('200 บาท');
    expect(incomingCard().querySelector('.bill-cal').textContent).toBe('ต.ค.7');
    expect(ownedCard().querySelector('.bill-title').textContent).toBe('เนื้อย่าง');
    expect(ownedCard().querySelector('.bill-summary').textContent).toBe('ค้างรับ · คืนแล้ว 0/2 คน');
    expect(ownedCard().querySelector('.bill-amount').textContent).toBe('600 บาท');
    expect(ownedCard().querySelector('.bill-meta').textContent).toBe('อาหาร · รวม 900 บาท');
    const members = [...ownedCard().querySelectorAll('.bill-member')];
    expect(members.map((row) => row.querySelector('.bill-member-name').textContent)).toEqual(['บี', 'ซี']);
    expect(members.map((row) => row.querySelector('.bill-member-status').textContent)).toEqual(['ยืนยันแล้ว', 'รอตอบ']);
  });

  it('shows the empty notes when there are no bills', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { owned: [], incoming: [] } : undefined) });

    expect(byId('bills-incoming-empty').hidden).toBe(false);
    expect(byId('bills-incoming-empty').textContent).toBe('ยังไม่มีบิลที่เพื่อนส่งมา');
    expect(byId('bills-owned-empty').hidden).toBe(false);
    expect(byId('bills-owned-empty').textContent).toBe('ยังไม่มีบิลที่คุณสร้าง');
  });

  it('shows an error with retry when the bills fail to load', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { status: 500 } : undefined) });

    expect(byId('bills-error').hidden).toBe(false);
    expect(byId('bills-error-text').textContent).toBe('โหลดบิลไม่สำเร็จ');
    routeFetch(() => undefined);
    byId('bills-retry').click();
    await settle();
    expect(byId('bills-error').hidden).toBe(true);
    expect(incomingCard()).not.toBeNull();
  });

  it('confirms an incoming bill and reloads', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
    expect(byId('bills-status').textContent).toBe('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
  });

  it('declines an incoming bill after confirming in the dialog', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? { status: 'declined' } : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    expect(byId('bill-dialog-text').textContent).toBe('ปฏิเสธบิล ชาบู ของ ดี?');
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/decline');
    expect(byId('bill-dialog').hasAttribute('open')).toBe(false);
  });

  it('shows why answering failed', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้แล้ว');
  });

  it('marks a member as paid back and lowers the outstanding amount', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { paid: true } : undefined) });

    const paidBox = ownedCard().querySelector('.bill-member input[type="checkbox"]');
    paidBox.checked = true;
    paidBox.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/members/f-1/paid');
    expect(ownedCard().querySelector('.bill-amount').textContent).toBe('300 บาท');
    expect(ownedCard().querySelector('.bill-summary').textContent).toBe('ค้างรับ · คืนแล้ว 1/2 คน');
  });

  it('puts the checkbox back when marking paid fails', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { status: 500 } : undefined) });

    const paidBox = ownedCard().querySelector('.bill-member input[type="checkbox"]');
    paidBox.checked = true;
    paidBox.dispatchEvent(new Event('change'));
    await settle();

    expect(ownedCard().querySelector('.bill-member input[type="checkbox"]').checked).toBe(false);
    expect(byId('bills-status').textContent).toBe('บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('cancels an owned bill after confirming in the dialog', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-own/cancel' ? { status: 'cancelled' } : undefined) });

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-text').textContent).toBe(
      'ยกเลิกบิล เนื้อย่าง? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ รายจ่ายส่วนของคุณจะถูกลบ ส่วนที่เพื่อนยืนยันแล้วยังอยู่'
    );
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/cancel');
    expect(calls).not.toContain('GET /api/transactions');
    expect(calls).not.toContain('GET /api/profile');
  });

  it('does not mention the owner share when cancelling a bill without one', async () => {
    const bill = { ...RESPONSES['/api/bills'].owned[0], ownerShare: 0 };
    const calls = await openBills({
      route: (method, path) => {
        if (path === '/api/bills') return { owned: [bill], incoming: [] };
        return path === '/api/bills/b-own/cancel' ? { status: 'cancelled' } : undefined;
      },
    });

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-text').textContent).toBe('ยกเลิกบิล เนื้อย่าง? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ ส่วนที่เพื่อนยืนยันแล้วยังอยู่');
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/cancel');
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('flags members the push did not reach and shares the bill link with them', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await openBills();

    const unreached = [...ownedCard().querySelectorAll('.bill-member')][1];
    expect(unreached.querySelector('.bill-member-note').textContent).toBe('แจ้งเตือนไม่ถึง ส่งลิงก์บิลให้เพื่อนแทน');
    // ปุ่มเดียวต่อบิล อยู่แถวเดียวกับยกเลิกบิล ยกเลิกอยู่ซ้าย
    const actions = [...ownedCard().querySelectorAll('.bill-actions button')];
    expect(actions.map((node) => node.className)).toEqual(['bill-cancel', 'bill-share-link']);
    actions[1].click();
    await settle();

    expect(writeText).toHaveBeenCalledWith('https://liff.line.me/liff-1?bill=b-own');
    expect(byId('bills-status').textContent).toBe('คัดลอกลิงก์บิลแล้ว ส่งให้เพื่อนได้เลย');
  });

  it('shows a cancelled bill without actions', async () => {
    await openBills({
      route: (method, path) =>
        path === '/api/bills'
          ? {
              owned: [],
              incoming: [{ ...RESPONSES['/api/bills'].incoming[0], status: 'cancelled' }],
            }
          : undefined,
    });

    expect(cardOf('b-in').querySelector('.bill-summary').textContent).toBe('ดี · ยกเลิกแล้ว');
    expect(cardOf('b-in').querySelector('.bill-confirm')).toBeNull();
  });

  it('opens the bills tab at the linked bill and focuses its card', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const linkedId = '66666666-6666-6666-6666-666666666666';
    const bills = { owned: [], incoming: [{ ...RESPONSES['/api/bills'].incoming[0], id: linkedId }] };
    await boot({ search: `?bill=${linkedId}`, overrides: { '/api/bills': bills } });
    await settle();

    expect(byId('panel-bills').hidden).toBe(false);
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(window.location.search).toBe('');
    expect(document.activeElement).toBe(incomingCard());
    expect(scrollIntoView).toHaveBeenCalled();
    delete Element.prototype.scrollIntoView;
  });

  it('opens the bills page on its own, without the main tabs, from the rich menu link', async () => {
    const liff = await boot({ search: '?tab=bills' });
    await settle();

    expect(window.location.search).toBe('');
    expect(byId('bottom-nav').hidden).toBe(true);
    expect(byId('page-title').textContent).toBe('หารบิล');
    expect(byId('month').hidden).toBe(true);
    expect(byId('panel-bills').hidden).toBe(false);
    for (const id of ['list', 'summary', 'budgets', 'recurring', 'profile']) {
      expect(byId(`panel-${id}`).hidden, id).toBe(true);
    }
    expect(byId('panel-bills').contains(byId('friends'))).toBe(true);
    expect(byId('friends').hidden).toBe(false);
    expect(document.querySelectorAll('#bills-owned .bill-card').length).toBe(1);
    expect(liff.fetched).toContain('/api/friends');
    for (const path of ['/api/transactions', '/api/profile', '/api/recurring', '/api/trend']) {
      expect(liff.fetched, path).not.toContain(path);
    }
  });

  it('still opens a main tab named in the link', async () => {
    await boot({ search: '?tab=profile' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('profile');
    expect(byId('bottom-nav').hidden).toBe(false);
  });

  it('says so when the linked bill is not in the lists', async () => {
    await boot({ search: '?bill=55555555-5555-5555-5555-555555555555' });
    await settle();

    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้ในรายการ อาจเป็นบิลเก่าหรือไม่ได้ส่งถึงคุณ');
  });

  it('says the bill was cancelled when confirming a bill the owner already cancelled', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'cancelled' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(byId('bills-status').textContent).toBe('บิลนี้ถูกยกเลิกแล้ว');
  });

  it('ignores a second confirm tap while the first is in flight', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });
    const confirmButton = incomingCard().querySelector('.bill-confirm');

    confirmButton.click();
    confirmButton.click();
    await settle();

    expect(calls.filter((call) => call === 'POST /api/bills/b-in/confirm')).toHaveLength(1);
  });

  it('reloads the list when confirming a bill that no longer exists', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้แล้ว');
  });

  it('does not load the main web data after confirming on the bills page', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(calls).not.toContain('GET /api/transactions');
    expect(calls).not.toContain('GET /api/profile');
  });

  // reload ที่พังทำให้การ์ดยังเป็นสถานะที่แก้ในหน่วยความจำ จึงตรวจการ map สถานะได้
  function answerRoute(answerPath, answerBody) {
    let listCalls = 0;
    return (method, path) => {
      if (path === answerPath) return answerBody;
      if (path !== '/api/bills') return undefined;
      listCalls += 1;
      return listCalls > 1 ? { status: 500 } : undefined;
    };
  }

  it('says already confirmed, not saved, when the bill was confirmed before', async () => {
    const calls = await openBills({ route: answerRoute('/api/bills/b-in/confirm', { status: 'already_confirmed' }) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('คุณยืนยันบิลนี้ไปแล้ว (โหลดบิลไม่สำเร็จ)');
    expect(incomingCard().querySelector('.bill-summary').textContent).toBe('ดี · ยังไม่คืน');
    expect(incomingCard().querySelector('.bill-confirm')).toBeNull();
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('says already declined when declining a bill declined before', async () => {
    const calls = await openBills({ route: answerRoute('/api/bills/b-in/decline', { status: 'already_declined' }) });

    incomingCard().querySelector('.bill-decline').click();
    byId('bill-dialog-ok').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('คุณปฏิเสธบิลนี้ไปแล้ว (โหลดบิลไม่สำเร็จ)');
    expect(cardOf('b-in').querySelector('.bill-summary').textContent).toBe('ดี · ปฏิเสธแล้ว');
    expect(byId('bills-incoming-done').contains(cardOf('b-in'))).toBe(true);
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('keeps the confirmed message when the reload after confirm fails', async () => {
    let listCalls = 0;
    await openBills({
      route: (method, path) => {
        if (path === '/api/bills/b-in/confirm') return { status: 'confirmed' };
        if (path === '/api/bills') {
          listCalls += 1;
          return listCalls > 1 ? { status: 500 } : undefined;
        }
        return undefined;
      },
    });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toContain('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
    expect(incomingCard().querySelector('.bill-confirm')).toBeNull();
  });

  it('scrolls the status line into view when a message is set', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });
    const scrollIntoView = vi.fn();
    byId('bills-status').scrollIntoView = scrollIntoView;

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  async function openForm(route) {
    const calls = await openBills({ route });
    byId('bill-new').click();
    await settle();
    return calls;
  }

  const shareInputs = () => [...document.querySelectorAll('#bill-form-members input[type="number"]')];

  it('opens the form with today, the food category and the friends to pick', async () => {
    await openForm();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-date').value).toBe('2026-10-15');
    expect(byId('bill-form-category').selectedOptions[0].textContent).toBe('อาหาร');
    expect([...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent)).toEqual(['บี']);
  });

  it('splits evenly with the leftover on the owner when friends are picked', async () => {
    await openForm();

    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    expect(byId('bill-form-owner-share').value).toBe('500');
    expect(shareInputs().map((input) => input.value)).toEqual(['500']);
  });

  it('blocks submit and says how far off the shares are', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    shareInputs()[0].value = '600';
    shareInputs()[0].dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ยอดรวมของทุกคนเกินยอดบิล 100 บาท');
    expect(byId('bill-form-submit').disabled).toBe(true);
    byId('bill-form-even').click();
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('asks to pick at least one friend', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('เลือกเพื่อนอย่างน้อย 1 คน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('creates the bill, closes the form and reloads the list', async () => {
    let posted;
    const calls = await openForm((method, path) => {
      if (method === 'POST' && path === '/api/bills') return { id: 'b-new', notNotified: [] };
      return undefined;
    });
    vi.stubGlobal('fetch', ((original) => async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'POST' && new URL(url, 'http://localhost').pathname === '/api/bills') posted = JSON.parse(options.body);
      return original(url, options);
    })(globalThis.fetch));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(posted).toEqual({
      title: 'เนื้อย่าง',
      total: 1000,
      occurredOn: '2026-10-15',
      categoryId: 'c-food',
      ownerShare: 500,
      members: [{ userId: 'f-1', share: 500 }],
    });
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(false);
    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว');
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
  });

  it('does not load the main web data after creating a bill', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('POST /api/bills');
    expect(calls).not.toContain('GET /api/transactions');
    expect(calls).not.toContain('GET /api/profile');
  });

  it('does not reload transactions after creating a bill without an owner share', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    fillValidForm();
    byId('bill-form-owner-share').value = '0';
    byId('bill-form-owner-share').dispatchEvent(new Event('input'));
    shareInputs()[0].value = '1000';
    shareInputs()[0].dispatchEvent(new Event('input'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('POST /api/bills');
    expect(calls).not.toContain('GET /api/transactions');
  });

  it('tells the owner when some friends were not notified', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: ['f-1'] } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว แจ้งเตือนเพื่อนไม่ถึง 1 คน ส่งลิงก์บิลให้เขาได้ในรายการด้านล่าง');
  });

  it('keeps the form open and shows the server error', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { status: 429 } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่');
  });

  it('points to the friends section below when there are no friends yet', async () => {
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined));

    expect(byId('bill-form-no-friends').hidden).toBe(false);
    expect(byId('bill-form-no-friends').textContent).toBe('ยังไม่มีเพื่อน เพิ่มเพื่อนในส่วนเพื่อนด้านล่างก่อน');
  });

  it('blocks submit when a picked friend share is empty', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    shareInputs()[0].value = '';
    shareInputs()[0].dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ใส่ยอดของเพื่อนทุกคนที่เลือก');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('blocks submit when the owner share is empty', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form-owner-share').value = '';
    byId('bill-form-owner-share').dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ใส่ส่วนของฉัน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  function holdRequest(pathname, method = 'GET') {
    let release;
    const hold = new Promise((resolve) => {
      release = resolve;
    });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if ((options.method ?? 'GET') === method && new URL(url, 'http://localhost').pathname === pathname) await hold;
      return original(url, options);
    });
    return release;
  }

  function fillValidForm() {
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));
  }

  // jsdom เลือกไฟล์จริงไม่ได้ จึงใส่ files เองแล้วยิง change เหมือนผู้ใช้เลือกรูป
  function pickReceipt() {
    const input = byId('bill-form-receipt');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['jpeg'], 'r.jpg', { type: 'image/jpeg' })] });
    input.dispatchEvent(new Event('change'));
  }

  it('opens the picker from the read receipt button', async () => {
    await openForm();
    const click = vi.spyOn(byId('bill-form-receipt'), 'click').mockImplementation(() => {});

    byId('bill-form-receipt-button').click();

    expect(click).toHaveBeenCalledTimes(1);
    expect(byId('bill-form-receipt').accept).toBe('image/*');
  });

  it('fills the total from the receipt photo, splits it again and asks to check it', async () => {
    const calls = await openForm((method, path) => (path === '/api/bills/read-receipt' ? { amount: 1234.5 } : undefined));
    fillValidForm();
    const release = holdRequest('/api/bills/read-receipt', 'POST');

    pickReceipt();
    await settle();
    expect(byId('bill-form-receipt-status').textContent).toBe('กำลังอ่านยอดจากรูป...');
    expect(byId('bill-form-receipt-button').disabled).toBe(true);
    expect(byId('bill-form-submit').disabled).toBe(true);

    release();
    await settle();
    expect(calls).toContain('POST /api/bills/read-receipt');
    expect(byId('bill-form-total').value).toBe('1234.5');
    expect(byId('bill-form-owner-share').value).toBe('617.25');
    expect(shareInputs().map((input) => input.value)).toEqual(['617.25']);
    expect(byId('bill-form-receipt-status').textContent).toBe('อ่านยอดได้ 1,234.5 บาท ตรวจให้ตรงกับใบเสร็จก่อนหารบิล');
    expect(byId('bill-form-receipt-button').disabled).toBe(false);
    expect(byId('bill-form-submit').disabled).toBe(false);
    expect(byId('bill-form-receipt').value).toBe('');
  });

  it('keeps the typed total and says why when the photo cannot be read', async () => {
    await openForm((method, path) => (path === '/api/bills/read-receipt' ? { status: 422 } : undefined));
    byId('bill-form-total').value = '500';

    pickReceipt();
    await settle();

    expect(byId('bill-form-total').value).toBe('500');
    expect(byId('bill-form-receipt-status').textContent).toBe('อ่านยอดจากรูปนี้ไม่ได้ ลองรูปที่ชัดขึ้น หรือพิมพ์ยอดเอง');
    expect(byId('bill-form-receipt-button').disabled).toBe(false);
  });

  it('drops a read that finishes after the form was closed and opened again', async () => {
    await openForm((method, path) => (path === '/api/bills/read-receipt' ? { amount: 999 } : undefined));
    const release = holdRequest('/api/bills/read-receipt', 'POST');
    pickReceipt();
    await settle();

    byId('bill-form-cancel').click();
    byId('bill-new').click();
    await settle();
    expect(byId('bill-form-receipt-status').textContent).toBe('');
    expect(byId('bill-form-receipt-button').disabled).toBe(false);

    release();
    await settle();
    expect(byId('bill-form-total').value).toBe('');
    expect(byId('bill-form-receipt-status').textContent).toBe('');
  });

  const typeInto = (id, value) => {
    byId(id).value = value;
    byId(id).dispatchEvent(new Event('input'));
  };

  it('says which field is missing once the user starts filling the form, not before', async () => {
    await openForm();
    expect(byId('bill-form-error').textContent).toBe('');

    typeInto('bill-form-total', '1000');
    expect(byId('bill-form-error').textContent).toBe('ใส่ชื่อบิล');
    typeInto('bill-form-title', 'เนื้อย่าง');
    typeInto('bill-form-total', '');
    expect(byId('bill-form-error').textContent).toBe('ใส่ยอดรวม');
  });

  it('accepts a total typed with thousands separators', async () => {
    await openForm();
    typeInto('bill-form-title', 'เนื้อย่าง');

    typeInto('bill-form-total', '1,000');
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    expect(byId('bill-form-owner-share').value).toBe('500');
    expect(byId('bill-form-error').textContent).toBe('');
  });

  it.each([
    ['abc', 'ใส่ยอดเป็นตัวเลข เช่น 1000'],
    ['1.005', 'ใส่ยอดไม่เกินทศนิยม 2 ตำแหน่ง'],
    ['10000000.01', 'ยอดรวมต้องไม่เกิน 10,000,000 บาท'],
  ])('explains a total of %s and marks the field invalid', async (total, message) => {
    await openForm();
    typeInto('bill-form-title', 'เนื้อย่าง');

    typeInto('bill-form-total', total);

    expect(byId('bill-form-error').textContent).toBe(message);
    expect(byId('bill-form-total').getAttribute('aria-invalid')).toBe('true');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('points the fields at the form message and announces it politely', async () => {
    await openForm();

    expect(byId('bill-form-total').getAttribute('aria-describedby')).toBe('bill-form-error');
    expect(byId('bill-form-title').getAttribute('aria-describedby')).toBe('bill-form-error');
    expect(byId('bill-form-error').getAttribute('role')).toBe('status');
    expect(byId('bill-form-total').hasAttribute('aria-invalid')).toBe(false);
  });

  it('asks for a date when the date is cleared', async () => {
    await openForm();
    fillValidForm();

    typeInto('bill-form-date', '');

    expect(byId('bill-form-error').textContent).toBe('เลือกวันที่');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  // server นับความยาวชื่อตามอักขระ maxlength ของ browser นับตาม UTF-16 ทำให้ emoji กินสองช่อง
  it('counts the title by characters, so 60 emoji fit and 61 letters do not', async () => {
    await openForm();
    fillValidForm();

    typeInto('bill-form-title', '🍖'.repeat(60));
    expect(byId('bill-form-error').textContent).toBe('');
    typeInto('bill-form-title', 'ก'.repeat(61));
    expect(byId('bill-form-error').textContent).toBe('ชื่อบิลยาวเกิน 60 ตัวอักษร');
    expect(byId('bill-form-title').hasAttribute('maxlength')).toBe(false);
  });

  it('allows at most 20 friends on one bill, like the server', async () => {
    const many = Array.from({ length: 21 }, (_, index) => ({ id: `f-${index}`, displayName: `เพื่อน ${index}` }));
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: many } : undefined));
    typeInto('bill-form-title', 'เนื้อย่าง');
    typeInto('bill-form-total', '2100');

    for (const box of document.querySelectorAll('#bill-form-members input[type="checkbox"]')) {
      box.checked = true;
      box.dispatchEvent(new Event('change'));
    }

    expect(byId('bill-form-error').textContent).toBe('เลือกเพื่อนได้ไม่เกิน 20 คน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('focuses the heading on open so the keyboard does not pop up at once', async () => {
    await openForm();

    expect(document.activeElement).toBe(byId('bill-form-heading'));
  });

  it('says what to pick in the split', async () => {
    await openForm();

    expect(document.querySelector('.bill-form-split legend').textContent).toBe('หารกับเพื่อน');
  });

  it('drops a friend list from an earlier opening of the form', async () => {
    let releaseFirst;
    let friendCalls = 0;
    await openBills();
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (path === '/api/friends') {
        friendCalls += 1;
        if (friendCalls === 1) {
          const body = await new Promise((resolve) => (releaseFirst = resolve));
          return makeFetch({ [path]: body })(url, options);
        }
        return makeFetch({ [path]: { code: 'ABCD2345', friends: [{ id: 'f-9', displayName: 'ใหม่' }] } })(url, options);
      }
      return makeFetch({})(url, options);
    });

    byId('bill-new').click();
    await settle();
    byId('bill-form-cancel').click();
    byId('bill-new').click();
    await settle();
    releaseFirst({ code: 'ABCD2345', friends: [{ id: 'f-1', displayName: 'เก่า' }] });
    await settle();

    expect([...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent)).toEqual(['ใหม่']);
  });

  it('shows the error the server gives for shares that do not add up', async () => {
    await openForm();
    vi.stubGlobal('fetch', async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'POST' && new URL(url, 'http://localhost').pathname === '/api/bills') {
        return { ok: false, status: 400, json: async () => ({ error: 'Shares do not add up' }) };
      }
      return makeFetch({})(url, options);
    });
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-error').textContent).toBe('ยอดของทุกคนรวมกันไม่เท่ากับยอดบิล');
  });

  it('scrolls the created message into view', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว');
    expect(scrollIntoView.mock.contexts).toContain(byId('bills-status'));
    delete Element.prototype.scrollIntoView;
  });

  it('keeps cancel disabled while the bill is being created', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: [] } : undefined));
    const release = holdRequest('/api/bills', 'POST');
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(byId('bill-form-cancel').disabled).toBe(true);

    release();
    await settle();
    expect(byId('bill-form-cancel').disabled).toBe(false);
  });

  it('keeps the created message when reloading the list fails', async () => {
    let created = false;
    await openForm((method, path) => {
      if (method === 'POST' && path === '/api/bills') {
        created = true;
        return { id: 'b-new', notNotified: [] };
      }
      return created && path === '/api/bills' ? { status: 500 } : undefined;
    });
    fillValidForm();

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว (โหลดบิลไม่สำเร็จ)');
  });

  it('shows a loading line while friends load', async () => {
    await openBills();
    const release = holdRequest('/api/friends');
    byId('bill-new').click();
    await settle();

    expect(byId('bill-form-friends-loading').hidden).toBe(false);
    expect(byId('bill-form-friends-loading').textContent).toBe('กำลังโหลดรายชื่อเพื่อน...');
    release();
    await settle();
    expect(byId('bill-form-friends-loading').hidden).toBe(true);
  });

  it('shows a friends error with retry that survives typing', async () => {
    let friendCalls = 0;
    await openForm((method, path) => {
      if (path !== '/api/friends') return undefined;
      friendCalls += 1;
      // ครั้งแรกเป็นของส่วนเพื่อนในหน้าหารบิล ครั้งที่สองเป็นของฟอร์ม
      return friendCalls === 2 ? { status: 500 } : undefined;
    });

    expect(byId('bill-form-friends-error').hidden).toBe(false);
    expect(byId('bill-form-friends-error-text').textContent).toBe('โหลดรายชื่อเพื่อนไม่สำเร็จ');
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-title').dispatchEvent(new Event('input'));
    expect(byId('bill-form-friends-error').hidden).toBe(false);
    expect(byId('bill-form-submit').disabled).toBe(true);

    byId('bill-form-friends-retry').click();
    await settle();
    expect(byId('bill-form-friends-error').hidden).toBe(true);
    expect(document.querySelectorAll('#bill-form-members .bill-form-name').length).toBe(1);
  });

  it('no friends: hides the split controls and offers a button to the friends section', async () => {
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));

    expect(byId('bill-form-split-controls').hidden).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-go-profile').hidden).toBe(false);

    expect(byId('bill-form-go-profile').textContent).toBe('ไปเพิ่มเพื่อน');

    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    byId('bill-form-go-profile').click();
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(false);
    expect(byId('panel-profile').hidden).toBe(true);
    expect(byId('panel-bills').hidden).toBe(false);
    expect(scrollIntoView.mock.contexts[0]).toBe(byId('friends'));
    delete Element.prototype.scrollIntoView;
  });

  it('after a network failure it warns to check the list and reloads bills', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? new Error('network down') : undefined));
    fillValidForm();
    const before = calls.filter((call) => call === 'GET /api/bills').length;

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-error').textContent).toBe('ไม่ทราบผล ตรวจรายการบิลก่อนสร้างใหม่');
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBe(before + 1);
  });

  it('after a server error on create it warns to check the list and reloads bills', async () => {
    const calls = await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { status: 500 } : undefined));
    fillValidForm();
    const before = calls.filter((call) => call === 'GET /api/bills').length;

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-error').textContent).toBe('ไม่ทราบผล ตรวจรายการบิลก่อนสร้างใหม่');
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBe(before + 1);
  });

  it('Not friends error refreshes the friend list and keeps the typed fields', async () => {
    await openForm();
    fillValidForm();
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      if (options.method === 'POST' && path === '/api/bills') {
        return { ok: false, status: 400, json: async () => ({ error: 'Not friends' }) };
      }
      if (path === '/api/friends') {
        return { ok: true, status: 200, json: async () => ({ code: 'ABCD2345', friends: [{ id: 'f-2', displayName: 'ซี' }] }) };
      }
      return original(url, options);
    });

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    const names = [...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent);
    expect(names).toEqual(['ซี']);
    expect(document.querySelector('#bill-form-members input[type="checkbox"]').checked).toBe(false);
    expect(byId('bill-form-title').value).toBe('เนื้อย่าง');
    expect(byId('bill-form-total').value).toBe('1000');
    expect(byId('bill-form-error').textContent).toBe('มีคนที่ไม่ได้เป็นเพื่อนกันแล้ว โหลดรายชื่อใหม่แล้วลองอีกครั้ง');
  });

  it('keeps submit disabled while categories are still loading', async () => {
    await openBills();
    const release = holdRequest('/api/categories');
    byId('bill-new').click();
    await settle();
    fillValidForm();

    expect(byId('bill-form-submit').disabled).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('');

    release();
    await settle();
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('shows a category load failure, not no expense category, when categories fail to load', async () => {
    let categoryCalls = 0;
    await openBills({
      route: (method, path) => {
        if (path !== '/api/categories') return undefined;
        categoryCalls += 1;
        return categoryCalls === 1 ? { status: 500 } : undefined;
      },
    });
    byId('bill-new').click();
    await settle();
    fillValidForm();

    expect(byId('bill-form-categories-error').hidden).toBe(false);
    expect(byId('bill-form-categories-error-text').textContent).toBe('โหลดหมวดไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-submit').disabled).toBe(true);

    byId('bill-form-categories-retry').click();
    await settle();
    expect(byId('bill-form-categories-error').hidden).toBe(true);
    expect(byId('bill-form-category').selectedOptions[0].textContent).toBe('อาหาร');
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('blocks submit when no expense category is available', async () => {
    const incomeOnly = { categories: CATEGORIES.filter((category) => category.type === 'income') };
    await openBills({ route: (method, path) => (path === '/api/categories' ? incomeOnly : undefined) });
    byId('bill-new').click();
    await settle();
    fillValidForm();

    expect(byId('bill-form-error').textContent).toBe('ไม่มีหมวดรายจ่ายให้เลือก');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('clicking the friend name toggles the checkbox', async () => {
    await openForm();

    document.querySelector('#bill-form-members label.bill-form-name').click();

    expect(document.querySelector('#bill-form-members input[type="checkbox"]').checked).toBe(true);
  });
});

describe('LIFF category manager', () => {
  const MANAGED = [
    { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false, system: false },
    { id: 'c-trip', name: 'เดินทาง', type: 'expense', hidden: true, system: false },
    { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false, system: true },
    { id: 'c-salary', name: 'เงินเดือน', type: 'income', hidden: false, system: false },
  ];

  // หยุด boot ที่ liff.init เพื่อให้ route ใช้กับการโหลดหมวดครั้งแรกด้วย
  async function openManager(route = () => undefined) {
    const liff = await boot({ holdInit: true });
    const calls = routeFetch((method, path) => {
      const override = route(method, path);
      if (override !== undefined) return override;
      return method === 'GET' && path === '/api/categories' ? { categories: MANAGED } : undefined;
    });
    liff.releaseInit();
    await settle();
    clickTab('profile');
    return calls;
  }

  const namesIn = (id) => [...byId(id).querySelectorAll('.category-row-name')].map((el) => el.textContent);
  const optionsOf = (id) => [...byId(id).options].map((option) => option.textContent);
  const rowOf = (id) => document.querySelector(`[data-category-id="${id}"]`);

  it('lists the categories by type and marks hidden and system ones', async () => {
    await openManager();

    expect(byId('categories-manager').hidden).toBe(false);
    expect(namesIn('category-rows-expense')).toEqual(['อาหาร', 'เดินทาง', 'อื่นๆ']);
    expect(namesIn('category-rows-income')).toEqual(['เงินเดือน']);
    expect(rowOf('c-trip').querySelector('.category-hidden-tag').textContent).toBe('ซ่อนอยู่');
    expect(rowOf('c-trip').querySelector('[data-action="toggle-hidden"]').textContent).toBe('เลิกซ่อน');
    expect(rowOf('c-other').querySelector('.category-system-note').textContent).toBe('หมวดของระบบ');
    expect(rowOf('c-other').querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps hidden categories out of the pickers but in the list filter', async () => {
    await openManager();

    expect(optionsOf('edit-category')).toEqual(['อาหาร', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('recurring-category')).toEqual(['อาหาร', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('filter-category')).toEqual(['ทุกหมวด', 'อาหาร', 'เดินทาง', 'อื่นๆ', 'เงินเดือน']);
  });

  it('keeps the hidden category selected when editing an old entry in it', async () => {
    await openManager();
    clickTab('list');

    [...document.querySelectorAll('#list .row-button')].find((button) => button.textContent.includes('BTS')).click();
    await settle();

    expect(byId('edit-category').value).toBe('c-trip');
  });

  it('adds a category and offers it in the pickers', async () => {
    const created = { id: 'c-cat', name: 'ค่าแมว', type: 'expense', hidden: false, system: false };
    const calls = await openManager((method, path) => (method === 'POST' && path === '/api/categories' ? { category: created } : undefined));

    byId('category-add-type').value = 'expense';
    byId('category-add-name').value = '  ค่าแมว ';
    byId('category-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('POST /api/categories');
    expect(namesIn('category-rows-expense')).toContain('ค่าแมว');
    expect(optionsOf('edit-category')).toContain('ค่าแมว');
    expect(byId('category-add-name').value).toBe('');
    expect(byId('category-status').textContent).toBe('เพิ่มหมวด ค่าแมว แล้ว');
  });

  it('shows the server reason when adding fails', async () => {
    await openManager((method, path) =>
      method === 'POST' && path === '/api/categories' ? { status: 409, error: 'Duplicate name' } : undefined
    );

    byId('category-add-name').value = 'อาหาร';
    byId('category-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('category-add-error').textContent).toBe('มีหมวดชื่อนี้อยู่แล้ว');
    expect(namesIn('category-rows-expense')).toEqual(['อาหาร', 'เดินทาง', 'อื่นๆ']);
  });

  it('hides a category and drops it from the edit picker', async () => {
    const calls = await openManager((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], hidden: true } } : undefined
    );

    rowOf('c-food').querySelector('[data-action="toggle-hidden"]').click();
    await settle();

    expect(calls).toContain('PATCH /api/categories/c-food');
    expect(rowOf('c-food').querySelector('[data-action="toggle-hidden"]').textContent).toBe('เลิกซ่อน');
    expect(optionsOf('edit-category')).not.toContain('อาหาร');
    expect(byId('category-status').textContent).toBe('ซ่อนหมวด อาหาร แล้ว');
  });

  it('renames a category through the dialog', async () => {
    await openManager((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], name: 'ข้าว' } } : undefined
    );

    rowOf('c-food').querySelector('[data-action="rename"]').click();
    expect(byId('category-dialog').hasAttribute('open')).toBe(true);
    expect(byId('category-dialog-name').value).toBe('อาหาร');
    byId('category-dialog-name').value = 'ข้าว';
    byId('category-dialog-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('category-dialog').hasAttribute('open')).toBe(false);
    expect(namesIn('category-rows-expense')).toContain('ข้าว');
    expect(optionsOf('edit-category')).toContain('ข้าว');
  });

  it('keeps the rename dialog open with the reason when it fails', async () => {
    await openManager((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { status: 400, error: 'Invalid name' } : undefined
    );

    rowOf('c-food').querySelector('[data-action="rename"]').click();
    byId('category-dialog-name').value = 'a,b';
    byId('category-dialog-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('category-dialog').hasAttribute('open')).toBe(true);
    expect(byId('category-dialog-error').textContent).toBe('ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)');
  });
});

describe('LIFF bill form with a hidden category', () => {
  it('does not offer a hidden expense category', async () => {
    const liff = await boot({ search: '?tab=bills', holdInit: true });
    routeFetch((method, path) =>
      method === 'GET' && path === '/api/categories'
        ? { categories: [...CATEGORIES, { id: 'c-old', name: 'เก่า', type: 'expense', hidden: true }] }
        : undefined
    );
    liff.releaseInit();
    await settle();

    byId('bill-new').click();
    await settle();

    expect([...byId('bill-form-category').options].map((option) => option.textContent)).toEqual(['อาหาร', 'เดินทาง']);
  });
});
