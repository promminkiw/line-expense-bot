import { readFileSync } from 'node:fs';
import { URL as NodeUrl } from 'node:url';
import { vi } from 'vitest';
export const html = readFileSync(new NodeUrl('./index.html', import.meta.url), 'utf8');

export const CATEGORIES = [
  { id: 'c-food', name: 'อาหาร', type: 'expense' },
  { id: 'c-trip', name: 'เดินทาง', type: 'expense' },
  { id: 'c-salary', name: 'เงินเดือน', type: 'income' },
];

export const TRANSACTIONS = [
  { id: 't1', type: 'expense', amount: 60, note: 'ข้าวมันไก่', occurredOn: '2026-10-02', categoryId: 'c-food', categoryName: 'อาหาร' },
  { id: 't2', type: 'expense', amount: 40, note: 'BTS', occurredOn: '2026-10-01', categoryId: 'c-trip', categoryName: 'เดินทาง' },
  { id: 't3', type: 'income', amount: 25000, note: '', occurredOn: '2026-10-01', categoryId: 'c-salary', categoryName: 'เงินเดือน' },
];

export const RESPONSES = {
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
  '/api/goals': {
    goals: [
      { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000, contributionCount: 2 },
      { id: 'g-2', name: 'กองทุนฉุกเฉิน', targetAmount: 10000, targetDate: null, closed: false, saved: 12000, contributionCount: 3 },
      { id: 'g-3', name: 'มือถือใหม่', targetAmount: 30000, targetDate: null, closed: true, saved: 30000, contributionCount: 5 },
    ],
  },
  '/api/goals/g-1/contributions': {
    contributions: [
      { id: 'gc-2', amount: 1000, occurredOn: '2026-10-14' },
      { id: 'gc-1', amount: 5000, occurredOn: '2026-10-01' },
    ],
  },
  '/api/goals/g-3/contributions': { contributions: [] },
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
  '/api/wallets': {
    wallets: [{ id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000, expense: 100, balance: 24900, entryCount: 3 }],
  },
  '/api/settings': { weeklySummary: false, dailyReminder: false },
};

export const EMPTY_MONTH = { transactions: [], summary: [], truncated: false };

export function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// the fake fetch resolves in microtasks only, so one macrotask drains the whole boot chain
export const settle = flush;

export const LOADING_ELEMENT_IDS = ['list-head-skeleton', 'summary-skeleton', 'trend-skeleton', 'budgets-skeleton', 'recurring-skeleton', 'profile-skeleton'];

// override: Error -> network failure, { status } -> HTTP error, anything else -> JSON body
export function makeFetch(overrides) {
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
export async function boot({ inClient = true, loggedIn = true, overrides = {}, search = '', holdInit = false, decodedToken } = {}) {
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
  // jsdom ย้อน history จริงแล้วยิง popstate ข้ามเทสต์ ใช้ stub แล้วเทสต์ยิง popstate เอง
  window.history.back = vi.fn();
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

export const byId = (id) => document.getElementById(id);

// route(method, path) returns an override (same shape as makeFetch) or undefined for the default response
export function routeFetch(route) {
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

export const clickTab = (id) => document.querySelector(`#bottom-nav button[data-tab="${id}"]`).click();

export async function submitEditOfFirstRow() {
  document.querySelector('#list .row-button').click();
  await settle();
  byId('edit-form').dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
}

export async function deleteFirstRow() {
  document.querySelector('#list .row-button').click();
  await settle();
  byId('delete-button').click();
  byId('confirm-ok').click();
  await settle();
}

// คืน global ที่ boot() ตั้งไว้ ให้เรียกใน afterEach ของทุกไฟล์
export function cleanupGlobals() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
}
