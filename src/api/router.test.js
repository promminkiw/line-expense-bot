import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createApiRouter } from './router.js';
import { hashLinkToken } from '../export/link-token.js';
import { createRequire } from 'node:module';

// ต้องใช้ instance เดียวกับที่ router require ไม่งั้น instanceof AuthError ไม่ตรงกัน
const { AuthError } = createRequire(import.meta.url)('./verify-id-token.js');

const ID = '11111111-2222-3333-4444-555555555555';
const CATEGORIES = [
  { id: 'c-food', name: 'อาหาร', type: 'expense' },
  { id: 'c-salary', name: 'เงินเดือน', type: 'income' },
];
const WALLET_ID = '99999999-8888-7777-6666-aaaaaaaaaaaa';
const WALLETS = [
  { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true },
  { id: WALLET_ID, name: 'บัตรเครดิต', hidden: false, isDefault: false },
];

// กระเป๋าจำลองสำหรับทดสอบเพดาน: asDefault ทำตัวแรกเป็นกระเป๋าตั้งต้น
function walletList(count, prefix, hidden, asDefault = false) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index}`,
    name: `${prefix}${index}`,
    hidden,
    isDefault: asDefault && index === 0,
  }));
}

let server;

function setup(overrides = {}) {
  const deps = {
    verifyIdToken: vi.fn(async (token) => {
      if (token === 'good') return { lineUserId: 'U1', name: 'Aom' };
      throw new AuthError('bad token');
    }),
    users: { ensureUser: vi.fn().mockResolvedValue('user-1'), loadWallets: vi.fn().mockResolvedValue(WALLETS) },
    repository: {
      listCategories: vi.fn().mockResolvedValue(CATEGORIES),
      listTransactions: vi.fn().mockResolvedValue({
        transactions: [
          { id: ID, type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food' },
        ],
        totalCount: 1,
      }),
      summarizeTransactions: vi.fn().mockResolvedValue([
        { type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 },
      ]),
      updateTransaction: vi.fn().mockResolvedValue(true),
      deleteTransaction: vi.fn().mockResolvedValue(true),
      createExportLink: vi.fn().mockResolvedValue(),
      deleteExpiredExportLinks: vi.fn().mockResolvedValue(),
      getBudgetStatus: vi.fn().mockResolvedValue([
        { categoryId: 'c-food', category: 'อาหาร', budget: 5000, spent: 60 },
      ]),
      setBudget: vi.fn().mockResolvedValue(),
      listRecurringRules: vi.fn().mockResolvedValue([]),
      createRecurringRule: vi.fn().mockImplementation(async (fields) => ({
        id: ID,
        type: fields.type,
        categoryId: fields.categoryId,
        amount: fields.amount,
        note: fields.note,
        dayOfMonth: fields.dayOfMonth,
        active: fields.active,
        lastRunOn: fields.lastRunOn,
      })),
      updateRecurringRule: vi.fn().mockResolvedValue(true),
      deleteRecurringRule: vi.fn().mockResolvedValue(true),
      getMonthlyTotals: vi.fn().mockResolvedValue([
        { month: '2026-09', type: 'expense', total: 60 },
        { month: '2026-08', type: 'income', total: 25000 },
      ]),
      getLifetimeTotals: vi.fn().mockResolvedValue({ income: 25000.1, expense: 60.2, entryCount: 3, firstDate: '2026-08-03' }),
      getDisplayName: vi.fn().mockResolvedValue('สมชาย'),
      getWalletTotals: vi.fn().mockResolvedValue([
        { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000.1, expense: 60.2, entryCount: 3 },
        { id: WALLET_ID, name: 'บัตรเครดิต', hidden: false, isDefault: false, income: 0, expense: 300, entryCount: 1 },
      ]),
      createWallet: vi.fn().mockImplementation(async (userId, { name }) => ({
        status: 'ok',
        wallet: { id: 'w-new', name, hidden: false, isDefault: false },
      })),
      updateWallet: vi.fn().mockImplementation(async (userId, id, fields) => ({
        status: 'ok',
        wallet: { id, name: fields.name ?? 'บัตรเครดิต', hidden: fields.hidden ?? false, isDefault: false },
      })),
      getNotificationSettings: vi.fn().mockResolvedValue({ weeklySummary: false, dailyReminder: false }),
      updateNotificationSettings: vi
        .fn()
        .mockImplementation(async (userId, changes) => ({ weeklySummary: false, dailyReminder: false, ...changes })),
    },
    allowExport: vi.fn().mockReturnValue(true),
    authFailures: { isBlocked: vi.fn().mockReturnValue(false), recordFailure: vi.fn() },
    friendsRouter: express.Router(),
    billsRouter: express.Router(),
    goalsRouter: express.Router(),
    liffId: 'liff-123',
    logger: { error: vi.fn() },
    now: () => new Date('2026-09-30T03:00:00.000Z'),
    ...overrides,
  };
  return deps;
}

describe('createApiRouter', () => {
  it('refuses to build without an export limiter so the limit cannot vanish silently', () => {
    // ตั้งใจแยก allowExport ออกจาก deps เพื่อทดสอบกรณีไม่มี limiter
    // eslint-disable-next-line no-unused-vars
    const { allowExport, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('allowExport');
  });

  it('refuses to build without the auth failure limiter', () => {
    // eslint-disable-next-line no-unused-vars
    const { authFailures, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('authFailures');
  });

  it('refuses to build without the friends router', () => {
    // eslint-disable-next-line no-unused-vars
    const { friendsRouter, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('friendsRouter');
    expect(() => createApiRouter({ ...deps, friendsRouter: {} })).toThrow('friendsRouter');
  });

  it('refuses to build without the bills router', () => {
    // eslint-disable-next-line no-unused-vars
    const { billsRouter, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('billsRouter');
  });

  it('refuses to build without the goals router', () => {
    // eslint-disable-next-line no-unused-vars
    const { goalsRouter, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('goalsRouter');
  });
});

async function start(deps) {
  const app = express();
  app.use('/api', createApiRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/api`;
}

function call(base, path, { token = 'good', method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

afterEach(async () => {
  // บางเทสต์ไม่เปิด server
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
});

describe('GET /api/config', () => {
  it('returns the LIFF id without login', async () => {
    const base = await start(setup());

    const res = await call(base, '/config', { token: null });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ liffId: 'liff-123' });
  });
});

describe('authentication', () => {
  it('returns 401 without a bearer token', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/categories', { token: null });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(deps.users.ensureUser).not.toHaveBeenCalled();
  });

  it('logs the LINE rejection reason when the token is refused', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/categories', { token: 'bad' });

    expect(deps.logger.error).toHaveBeenCalledWith('API auth rejected', {
      path: '/categories',
      reason: 'bad token',
    });
    expect(JSON.stringify(deps.logger.error.mock.calls)).not.toContain('Bearer');
  });

  it('does not log when the token is missing', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/categories', { token: null });

    expect(deps.logger.error).not.toHaveBeenCalled();
  });

  it('returns 401 when LINE rejects the token', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/categories', { token: 'bad' });

    expect(res.status).toBe(401);
    expect(deps.repository.listCategories).not.toHaveBeenCalled();
  });
  it('records a failure against the client ip when LINE rejects the token', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/categories', { token: 'bad' });

    expect(deps.authFailures.recordFailure).toHaveBeenCalledWith(expect.stringContaining('127.0.0.1'));
  });

  it('does not record a failure for a valid token', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/categories');

    expect(deps.authFailures.recordFailure).not.toHaveBeenCalled();
  });

  it('returns 429 without calling LINE when the client ip has too many failures', async () => {
    const deps = setup({ authFailures: { isBlocked: vi.fn().mockReturnValue(true), recordFailure: vi.fn() } });
    const base = await start(deps);

    const res = await call(base, '/categories');

    expect(res.status).toBe(429);
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
  });

  it('still serves /config while the client ip is blocked', async () => {
    const deps = setup({ authFailures: { isBlocked: vi.fn().mockReturnValue(true), recordFailure: vi.fn() } });
    const base = await start(deps);

    const res = await call(base, '/config', { token: null });

    expect(res.status).toBe(200);
  });


  it('returns 500 and logs when verification fails for another reason', async () => {
    const deps = setup({ verifyIdToken: vi.fn().mockRejectedValue(new TypeError('fetch failed')) });
    const base = await start(deps);

    const res = await call(base, '/categories');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(deps.logger.error).toHaveBeenCalledWith('API request failed', { path: '/categories' }, expect.any(Error));
  });

  it('resolves the internal user id from the verified LINE user id', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/categories');

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1', { tokenName: 'Aom' });
    expect(deps.repository.listCategories).toHaveBeenCalledWith('user-1');
  });
});

describe('GET /api/categories', () => {
  it('returns the user categories with a system flag', async () => {
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue([
      { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false },
      { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false },
      { id: 'c-old', name: 'เก่า', type: 'income', hidden: true },
    ]);
    const base = await start(deps);

    const res = await call(base, '/categories');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [
        { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false, system: false },
        { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false, system: true },
        { id: 'c-old', name: 'เก่า', type: 'income', hidden: true, system: false },
      ],
    });
  });
});

describe('categories API', () => {
  const CAT_ID = '22222222-3333-4444-5555-666666666666';
  const OTHER_ID = '33333333-4444-5555-6666-777777777777';
  const CAT = { id: CAT_ID, name: 'ค่าแมว', type: 'expense', hidden: false };
  const OTHER = { id: OTHER_ID, name: 'อื่นๆ', type: 'expense', hidden: false };
  const visibleExpense = (count) =>
    Array.from({ length: count }, (_, index) => ({ id: `v-${index}`, name: `หมวด ${index}`, type: 'expense', hidden: false }));

  function withCategories(categories) {
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue(categories);
    deps.repository.createCategory = vi.fn().mockResolvedValue({ status: 'ok', category: CAT });
    deps.repository.updateCategory = vi.fn().mockResolvedValue({ status: 'ok', category: { ...CAT, name: 'แมว' } });
    deps.repository.countCategoryUsage = vi.fn().mockResolvedValue({ transactions: 3, recurring: 1, bills: 0 });
    deps.repository.deleteCategory = vi.fn().mockResolvedValue('deleted');
    return deps;
  }

  it('creates a category with a trimmed name', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: ' ค่าแมว ' } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ category: { ...CAT, system: false } });
    expect(deps.repository.createCategory).toHaveBeenCalledWith('user-1', { type: 'expense', name: 'ค่าแมว' });
  });

  it.each([
    [{ type: 'saving', name: 'x' }, 'Invalid type'],
    [{ type: 'expense', name: '' }, 'Invalid name'],
    [{ type: 'expense', name: 'อื่นๆ' }, 'Reserved name'],
  ])('refuses to create %j', async (body, error) => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
  });

  it('answers 409 for a duplicate name', async () => {
    const deps = withCategories([OTHER]);
    deps.repository.createCategory.mockResolvedValue({ status: 'duplicate' });
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'อาหาร' } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Duplicate name' });
  });

  it('refuses a 31st visible category of a type but not when the others are hidden', async () => {
    const full = withCategories(visibleExpense(30));
    const fullBase = await start(full);
    const refused = await call(fullBase, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'Too many categories' });
    expect(full.repository.createCategory).not.toHaveBeenCalled();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));

    const hidden = withCategories(visibleExpense(30).map((category) => ({ ...category, hidden: true })));
    const hiddenBase = await start(hidden);
    const allowed = await call(hiddenBase, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });
    expect(allowed.status).toBe(201);
  });

  it('allows a new expense category when only the income side is full', async () => {
    const incomeFull = Array.from({ length: 30 }, (_, index) => ({ id: `i-${index}`, name: `รายได้ ${index}`, type: 'income', hidden: false }));
    const deps = withCategories(incomeFull);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });

    expect(res.status).toBe(201);
    expect(deps.repository.createCategory).toHaveBeenCalledWith('user-1', { type: 'expense', name: 'ใหม่' });
  });

  it('counts system categories toward the limit', async () => {
    const deps = withCategories([...visibleExpense(29), OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many categories' });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
  });

  it('renames a category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'แมว' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ category: { ...CAT, name: 'แมว', system: false } });
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { name: 'แมว' });
  });

  it('hides a category', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.updateCategory.mockResolvedValue({ status: 'ok', category: { ...CAT, hidden: true } });
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: true } });

    expect(res.status).toBe(200);
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { hidden: true });
  });

  it('refuses to change a system category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${OTHER_ID}`, { method: 'PATCH', body: { hidden: true } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'System category' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('answers 404 for another user category and for an id that is not a uuid', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const unknown = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: true } });
    const bad = await call(base, '/categories/abc', { method: 'PATCH', body: { hidden: true } });

    expect(unknown.status).toBe(404);
    expect(bad.status).toBe(404);
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('refuses to unhide past the visible limit', async () => {
    const deps = withCategories([{ ...CAT, hidden: true }, ...visibleExpense(30)]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: false } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many categories' });
  });

  it('unhides a category when the type has room', async () => {
    const deps = withCategories([{ ...CAT, hidden: true }, ...visibleExpense(29)]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: false } });

    expect(res.status).toBe(200);
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { hidden: false });
  });

  it('unhide counts only the same type', async () => {
    const incomeFull = Array.from({ length: 30 }, (_, index) => ({ id: `i-${index}`, name: `รายได้ ${index}`, type: 'income', hidden: false }));
    const deps = withCategories([{ ...CAT, hidden: true }, ...incomeFull]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: false } });

    expect(res.status).toBe(200);
  });

  it('refuses to create past the total category cap even when the others are hidden', async () => {
    const allHidden = visibleExpense(100).map((category) => ({ ...category, hidden: true }));
    const deps = withCategories(allHidden);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many categories' });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
  });

  it('refuses to rename the slip system category', async () => {
    const slip = { id: OTHER_ID, name: 'ใบเสร็จ/สลิปโอนเงิน', type: 'expense', hidden: false };
    const deps = withCategories([slip]);
    const base = await start(deps);

    const res = await call(base, `/categories/${OTHER_ID}`, { method: 'PATCH', body: { name: 'x' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'System category' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('maps duplicate and not_found from the repository', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.updateCategory
      .mockResolvedValueOnce({ status: 'duplicate' })
      .mockResolvedValueOnce({ status: 'not_found' });
    const base = await start(deps);

    const duplicate = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'อาหาร' } });
    const gone = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'แมว' } });

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: 'Duplicate name' });
    expect(gone.status).toBe(404);
  });

  it('rejects a bad patch body', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const empty = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: {} });
    const badHidden = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: 'yes' } });

    expect(await empty.json()).toEqual({ error: 'Invalid body' });
    expect(await badHidden.json()).toEqual({ error: 'Invalid hidden' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('creates a category with the picked icon', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'กาแฟ', icon: 'coffee' } });

    expect(res.status).toBe(201);
    expect(deps.repository.createCategory).toHaveBeenCalledWith('user-1', { type: 'expense', name: 'กาแฟ', icon: 'coffee' });
  });

  it('refuses an unknown icon', async () => {
    const deps = withCategories([OTHER, CAT]);
    const base = await start(deps);

    const created = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'กาแฟ', icon: 'unicorn' } });
    const patched = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { icon: 'unicorn' } });

    expect(created.status).toBe(400);
    expect(await created.json()).toEqual({ error: 'Invalid icon' });
    expect(patched.status).toBe(400);
    expect(await patched.json()).toEqual({ error: 'Invalid icon' });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('changes only the icon of a category', async () => {
    const deps = withCategories([OTHER, CAT]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { icon: 'pet' } });

    expect(res.status).toBe(200);
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { icon: 'pet' });
  });

  it('refuses to change the icon of a system category', async () => {
    const deps = withCategories([OTHER, CAT]);
    const base = await start(deps);

    const res = await call(base, `/categories/${OTHER_ID}`, { method: 'PATCH', body: { icon: 'pet' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'System category' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('refuses to create or change a category without a valid token', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const created = await call(base, '/categories', { token: null, method: 'POST', body: { type: 'expense', name: 'ใหม่' } });
    const patched = await call(base, `/categories/${CAT_ID}`, { token: 'bad', method: 'PATCH', body: { name: 'แมว' } });

    expect(created.status).toBe(401);
    expect(patched.status).toBe(401);
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('answers 500 and logs when the repository fails', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.createCategory.mockRejectedValue(new Error('db down'));
    deps.repository.updateCategory.mockRejectedValue(new Error('db down'));
    const base = await start(deps);

    const created = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });
    const patched = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'แมว' } });

    expect(created.status).toBe(500);
    expect(await created.json()).toEqual({ error: 'Internal error' });
    expect(patched.status).toBe(500);
    expect(await patched.json()).toEqual({ error: 'Internal error' });
    expect(deps.logger.error).toHaveBeenCalledWith('API request failed', { path: '/categories' }, expect.any(Error));
  });

  it('refuses to rename a category to a reserved name', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'ใบเสร็จ/สลิปโอนเงิน' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Reserved name' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('refuses to create a category from a malformed body', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await fetch(`${base}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer good' },
      body: '{"type":"expense",',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid body' });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
  });

  it('finds the category when the id in the url is uppercase', async () => {
    const lettered = { ...CAT, id: 'abcdef12-3333-4444-5555-666666666666' };
    const deps = withCategories([lettered, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${lettered.id.toUpperCase()}`, { method: 'PATCH', body: { name: 'แมว' } });

    expect(res.status).toBe(200);
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', lettered.id, { name: 'แมว' });
  });

  it('counts what a category holds before deleting it', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}/usage`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ usage: { transactions: 3, recurring: 1, bills: 0 } });
    expect(deps.repository.countCategoryUsage).toHaveBeenCalledWith('user-1', CAT_ID);
  });

  it('deletes a category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteCategory).toHaveBeenCalledWith('user-1', CAT_ID);
  });

  it('refuses to count or delete a system category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const usage = await call(base, `/categories/${OTHER_ID}/usage`);
    const deleted = await call(base, `/categories/${OTHER_ID}`, { method: 'DELETE' });

    expect(usage.status).toBe(400);
    expect(await usage.json()).toEqual({ error: 'System category' });
    expect(deleted.status).toBe(400);
    expect(await deleted.json()).toEqual({ error: 'System category' });
    expect(deps.repository.deleteCategory).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown, a non-uuid or an already deleted category', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.deleteCategory.mockResolvedValue('not_found');
    const base = await start(deps);

    const unknownUsage = await call(base, '/categories/99999999-8888-7777-6666-555555555555/usage');
    const badDelete = await call(base, '/categories/abc', { method: 'DELETE' });
    const gone = await call(base, `/categories/${CAT_ID}`, { method: 'DELETE' });

    expect(unknownUsage.status).toBe(404);
    expect(badDelete.status).toBe(404);
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: 'Not found' });
  });

  it('deletes a category whose id in the url is uppercase', async () => {
    const lettered = { ...CAT, id: 'abcdef12-3333-4444-5555-666666666666' };
    const deps = withCategories([lettered, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${lettered.id.toUpperCase()}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteCategory).toHaveBeenCalledWith('user-1', lettered.id);
  });

  it('refuses to delete without a valid token', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { token: null, method: 'DELETE' });

    expect(res.status).toBe(401);
    expect(deps.repository.deleteCategory).not.toHaveBeenCalled();
  });
});

describe('wallets API', () => {
  it('lists the wallets with totals and a balance in satang after repairing the cash wallet', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/wallets');

    expect(res.status).toBe(200);
    expect(deps.users.loadWallets).toHaveBeenCalledWith('user-1');
    expect(deps.repository.getWalletTotals).toHaveBeenCalledWith('user-1');
    expect(await res.json()).toEqual({
      wallets: [
        { id: 'w-cash', name: 'เงินสด', hidden: false, isDefault: true, income: 25000.1, expense: 60.2, balance: 24939.9, entryCount: 3 },
        { id: WALLET_ID, name: 'บัตรเครดิต', hidden: false, isDefault: false, income: 0, expense: 300, balance: -300, entryCount: 1 },
      ],
    });
  });

  it('creates a wallet with a trimmed name', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/wallets', { method: 'POST', body: { name: ' กสิกร ' } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ wallet: { id: 'w-new', name: 'กสิกร', hidden: false, isDefault: false } });
    expect(deps.repository.createWallet).toHaveBeenCalledWith('user-1', { name: 'กสิกร' });
  });

  it('refuses a reserved, invalid or duplicate name', async () => {
    const deps = setup();
    deps.repository.createWallet.mockResolvedValue({ status: 'duplicate' });
    const base = await start(deps);

    const reserved = await call(base, '/wallets', { method: 'POST', body: { name: 'เงินสด' } });
    const invalid = await call(base, '/wallets', { method: 'POST', body: { name: '' } });
    const duplicate = await call(base, '/wallets', { method: 'POST', body: { name: 'บัตรเครดิต' } });

    expect([reserved.status, await reserved.json()]).toEqual([400, { error: 'Reserved name' }]);
    expect([invalid.status, await invalid.json()]).toEqual([400, { error: 'Invalid name' }]);
    expect([duplicate.status, await duplicate.json()]).toEqual([409, { error: 'Duplicate name' }]);
  });

  it('refuses a new wallet over the visible or total limit', async () => {
    const visible = Array.from({ length: 10 }, (_, index) => ({ id: `w${index}`, name: `ก${index}`, hidden: false, isDefault: index === 0 }));
    const hidden = Array.from({ length: 10 }, (_, index) => ({ id: `h${index}`, name: `ข${index}`, hidden: true, isDefault: false }));
    const deps = setup();
    deps.users.loadWallets.mockResolvedValueOnce(visible).mockResolvedValueOnce([...visible.slice(0, 2), ...hidden, ...hidden.map((w) => ({ ...w, id: `x${w.id}` }))]);
    const base = await start(deps);

    const tooManyVisible = await call(base, '/wallets', { method: 'POST', body: { name: 'ใหม่' } });
    const tooManyTotal = await call(base, '/wallets', { method: 'POST', body: { name: 'ใหม่' } });

    expect([tooManyVisible.status, await tooManyVisible.json()]).toEqual([409, { error: 'Too many wallets' }]);
    expect([tooManyTotal.status, await tooManyTotal.json()]).toEqual([409, { error: 'Too many wallets' }]);
    expect(deps.repository.createWallet).not.toHaveBeenCalled();
  });

  it('creates a wallet while below the visible and total limits', async () => {
    const nineVisibleTenHidden = [...walletList(9, 'ก', false, true), ...walletList(10, 'ข', true)];
    const deps = setup();
    deps.users.loadWallets.mockResolvedValue(nineVisibleTenHidden);
    const base = await start(deps);

    const res = await call(base, '/wallets', { method: 'POST', body: { name: 'ใหม่' } });

    expect(nineVisibleTenHidden).toHaveLength(19);
    expect(res.status).toBe(201);
  });

  it('refuses a new wallet at exactly twenty wallets', async () => {
    const deps = setup();
    deps.users.loadWallets.mockResolvedValue([...walletList(9, 'ก', false, true), ...walletList(11, 'ข', true)]);
    const base = await start(deps);

    const res = await call(base, '/wallets', { method: 'POST', body: { name: 'ใหม่' } });

    expect([res.status, await res.json()]).toEqual([409, { error: 'Too many wallets' }]);
  });

  it("checks the wallet limit against the verified caller's wallets", async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/wallets', { method: 'POST', body: { name: 'ใหม่' } });

    expect(deps.users.loadWallets).toHaveBeenCalledWith('user-1');
  });

  it('renames or hides a wallet of this user, given in any letter case', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/wallets/${WALLET_ID.toUpperCase()}`, { method: 'PATCH', body: { hidden: true } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ wallet: { id: WALLET_ID, name: 'บัตรเครดิต', hidden: true, isDefault: false } });
    expect(deps.repository.updateWallet).toHaveBeenCalledWith('user-1', WALLET_ID, { hidden: true });
  });

  it('refuses to change the default wallet', async () => {
    const deps = setup();
    const base = await start(deps);
    deps.users.loadWallets.mockResolvedValue([{ id: ID, name: 'เงินสด', hidden: false, isDefault: true }]);

    const res = await call(base, `/wallets/${ID}`, { method: 'PATCH', body: { hidden: true } });

    expect([res.status, await res.json()]).toEqual([400, { error: 'Default wallet' }]);
    expect(deps.repository.updateWallet).not.toHaveBeenCalled();
  });

  it('answers 404 for a non-uuid id or a wallet of someone else', async () => {
    const deps = setup();
    const base = await start(deps);

    const notUuid = await call(base, '/wallets/abc', { method: 'PATCH', body: { hidden: true } });
    const stranger = await call(base, `/wallets/${ID}`, { method: 'PATCH', body: { hidden: true } });

    expect([notUuid.status, stranger.status]).toEqual([404, 404]);
    expect(deps.repository.updateWallet).not.toHaveBeenCalled();
  });

  it('refuses to unhide a wallet over the visible limit', async () => {
    const visible = Array.from({ length: 10 }, (_, index) => ({ id: `w${index}`, name: `ก${index}`, hidden: false, isDefault: index === 0 }));
    const deps = setup();
    deps.users.loadWallets.mockResolvedValue([...visible, { id: WALLET_ID, name: 'บัตรเครดิต', hidden: true, isDefault: false }]);
    const base = await start(deps);

    const res = await call(base, `/wallets/${WALLET_ID}`, { method: 'PATCH', body: { hidden: false } });

    expect([res.status, await res.json()]).toEqual([409, { error: 'Too many wallets' }]);
  });

  it('hides or renames a visible wallet while ten wallets are visible', async () => {
    const deps = setup();
    deps.users.loadWallets.mockResolvedValue([...walletList(9, 'ก', false, true), { id: WALLET_ID, name: 'บัตรเครดิต', hidden: false, isDefault: false }]);
    const base = await start(deps);

    const hide = await call(base, `/wallets/${WALLET_ID}`, { method: 'PATCH', body: { hidden: true } });
    const rename = await call(base, `/wallets/${WALLET_ID}`, { method: 'PATCH', body: { name: 'กสิกร' } });

    expect([hide.status, rename.status]).toEqual([200, 200]);
  });

  it('unhides a wallet while nine are visible even with several hidden', async () => {
    const deps = setup();
    deps.users.loadWallets.mockResolvedValue([
      ...walletList(9, 'ก', false, true),
      { id: WALLET_ID, name: 'บัตรเครดิต', hidden: true, isDefault: false },
      ...walletList(4, 'ข', true),
    ]);
    const base = await start(deps);

    const res = await call(base, `/wallets/${WALLET_ID}`, { method: 'PATCH', body: { hidden: false } });

    expect(res.status).toBe(200);
  });

  it('answers 409 for a duplicate rename', async () => {
    const deps = setup();
    deps.repository.updateWallet.mockResolvedValue({ status: 'duplicate' });
    const base = await start(deps);

    const res = await call(base, `/wallets/${WALLET_ID}`, { method: 'PATCH', body: { name: 'กสิกร' } });

    expect([res.status, await res.json()]).toEqual([409, { error: 'Duplicate name' }]);
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/wallets', { token: null })).status).toBe(401);
  });
});

describe('GET /api/transactions', () => {
  it('returns the month entries with category names, the SQL summary and truncated false', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-09');

    expect(res.status).toBe(200);
    expect(deps.repository.listTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(await res.json()).toEqual({
      transactions: [
        {
          id: ID,
          type: 'expense',
          amount: 60,
          note: 'กินข้าว',
          occurredOn: '2026-09-29',
          categoryId: 'c-food',
          categoryName: 'อาหาร',
          walletId: 'w-cash',
          walletName: 'เงินสด',
        },
      ],
      summary: [{ type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 }],
      truncated: false,
    });
  });

  it('names the wallet of each entry, an entry without a wallet being cash', async () => {
    const deps = setup();
    deps.repository.listTransactions.mockResolvedValue({
      transactions: [
        { id: ID, type: 'expense', amount: 300, note: '', occurredOn: '2026-09-29', categoryId: 'c-food', walletId: WALLET_ID },
        { id: 't2', type: 'expense', amount: 60, note: '', occurredOn: '2026-09-28', categoryId: 'c-food', walletId: null },
      ],
      totalCount: 2,
    });
    const base = await start(deps);

    const body = await (await call(base, '/transactions?month=2026-09')).json();

    expect(deps.users.loadWallets).toHaveBeenCalledWith('user-1');
    expect(body.transactions.map((item) => [item.walletId, item.walletName])).toEqual([
      [WALLET_ID, 'บัตรเครดิต'],
      ['w-cash', 'เงินสด'],
    ]);
  });

  it('flags truncated when the month has more rows than were returned', async () => {
    const deps = setup();
    deps.repository.listTransactions.mockResolvedValue({ transactions: [], totalCount: 1500 });
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-09');

    expect((await res.json()).truncated).toBe(true);
  });

  it('returns 400 for an invalid month', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-13');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid month' });
    expect(deps.repository.listTransactions).not.toHaveBeenCalled();
    expect(deps.repository.summarizeTransactions).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/transactions/:id', () => {
  const body = { amount: 25000, categoryId: 'c-salary', occurredOn: '2026-09-01', note: 'เงินเดือน' };

  it('updates the entry with the type of the chosen category', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body });

    expect(res.status).toBe(204);
    expect(deps.repository.updateTransaction).toHaveBeenCalledWith('user-1', ID, { ...body, type: 'income' });
  });

  it('returns 400 for invalid data without updating', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, amount: -1 } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid amount' });
    expect(deps.repository.updateTransaction).not.toHaveBeenCalled();
  });

  it('returns 400 when the category belongs to someone else', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, categoryId: 'c-other-user' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid category' });
    expect(deps.repository.updateTransaction).not.toHaveBeenCalled();
  });

  it('returns 404 when the entry is not this user', async () => {
    const deps = setup();
    deps.repository.updateTransaction.mockResolvedValue(false);
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 404 for an id that is not a uuid without touching the database', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions/abc', { method: 'PATCH', body });

    expect(res.status).toBe(404);
    expect(deps.repository.updateTransaction).not.toHaveBeenCalled();
    expect(deps.repository.listCategories).not.toHaveBeenCalled();
  });

  it('does not load wallets or touch the wallet when walletId is not sent', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, `/transactions/${ID}`, { method: 'PATCH', body });

    expect(deps.users.loadWallets).not.toHaveBeenCalled();
    expect(deps.repository.updateTransaction.mock.calls[0][2]).not.toHaveProperty('walletId');
  });

  it('moves the entry to a wallet of this user, given in any letter case', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, walletId: WALLET_ID.toUpperCase() } });

    expect(res.status).toBe(204);
    expect(deps.repository.updateTransaction).toHaveBeenCalledWith('user-1', ID, { ...body, type: 'income', walletId: WALLET_ID });
  });

  it("checks the new wallet of an entry against the verified caller's wallets", async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, walletId: WALLET_ID } });

    expect(deps.users.loadWallets).toHaveBeenCalledWith('user-1');
  });

  it('stores the default wallet as null', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, walletId: 'w-cash' } });

    expect(deps.repository.updateTransaction).toHaveBeenCalledWith('user-1', ID, { ...body, type: 'income', walletId: null });
  });

  it('returns 400 for a wallet that is not this user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, walletId: 'w-other' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid wallet' });
    expect(deps.repository.updateTransaction).not.toHaveBeenCalled();
  });

  it("checks the category against the verified caller's categories", async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'PATCH', body: { ...body, userId: 'someone-else' } });

    expect(res.status).toBe(204);
    expect(deps.repository.listCategories).toHaveBeenCalledWith('user-1');
    expect(deps.repository.updateTransaction).toHaveBeenCalledWith('user-1', ID, { ...body, type: 'income' });
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('returns 404 for a non-uuid id without touching the database', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions/abc', { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(deps.repository.deleteTransaction).not.toHaveBeenCalled();
  });

  it('deletes this user entry', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteTransaction).toHaveBeenCalledWith('user-1', ID);
  });

  it('returns 404 when nothing was deleted', async () => {
    const deps = setup();
    deps.repository.deleteTransaction.mockResolvedValue(false);
    const base = await start(deps);

    const res = await call(base, `/transactions/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(404);
  });
});

describe('POST /api/exports', () => {
  it('stores a hashed one-time link for this user that expires in five minutes', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-09' } });

    expect(res.status).toBe(201);
    const { path } = await res.json();
    expect(path).toMatch(/^\/exports\/[A-Za-z0-9_-]{43}$/);
    const token = path.slice('/exports/'.length);
    expect(deps.repository.createExportLink).toHaveBeenCalledWith({
      tokenHash: hashLinkToken(token),
      userId: 'user-1',
      month: '2026-09',
      expiresAt: '2026-09-30T03:05:00.000Z',
    });
  });

  it('returns 400 for an invalid month without storing a link', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-13' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid month' });
    expect(deps.repository.createExportLink).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-string month without storing a link', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: ['2026-09'] } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid month' });
    expect(deps.repository.createExportLink).not.toHaveBeenCalled();
  });

  it('requires a verified token', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-09' }, token: null });

    expect(res.status).toBe(401);
    expect(deps.repository.createExportLink).not.toHaveBeenCalled();
  });

  it('returns 429 without storing a link when this user exports too often', async () => {
    const deps = setup({ allowExport: vi.fn().mockReturnValue(false) });
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-09' } });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(deps.allowExport).toHaveBeenCalledWith('user-1');
    expect(deps.repository.deleteExpiredExportLinks).not.toHaveBeenCalled();
    expect(deps.repository.createExportLink).not.toHaveBeenCalled();
  });

  it('does not count an invalid month against the export limit', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/exports', { method: 'POST', body: { month: '2026-13' } });

    expect(deps.allowExport).not.toHaveBeenCalled();
  });

  it('removes this user expired links before storing the new one', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/exports', { method: 'POST', body: { month: '2026-09' } });

    expect(deps.repository.deleteExpiredExportLinks).toHaveBeenCalledWith('user-1', '2026-09-30T03:00:00.000Z');
  });

  it('still issues the link and logs when removing old links fails', async () => {
    const deps = setup();
    deps.repository.deleteExpiredExportLinks.mockRejectedValue(new Error('boom'));
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-09' } });

    expect(res.status).toBe(201);
    expect(deps.repository.createExportLink).toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith('Export link cleanup failed', expect.any(Error));
  });
});

describe('budgets', () => {
  it('returns the budget status of one month for this user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/budgets?month=2026-09');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 5000, spent: 60 }],
    });
    expect(deps.repository.getBudgetStatus).toHaveBeenCalledWith('user-1', '2026-09');
  });

  // หมวดที่ซ่อนแต่ยังมีงบหรือยอดต้องเห็นอยู่ ผู้ใช้จะได้ยกเลิกงบที่ค้างได้
  it('drops a hidden category only when the month has no budget and no spending', async () => {
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue([
      ...CATEGORIES,
      { id: 'c-old', name: 'เก่า', type: 'expense', hidden: true },
      { id: 'c-old2', name: 'เก่า2', type: 'expense', hidden: true },
      { id: 'c-old3', name: 'เก่า3', type: 'expense', hidden: true },
    ]);
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'c-food', category: 'อาหาร', budget: null, spent: 0 },
      { categoryId: 'c-old', category: 'เก่า', budget: null, spent: 0 },
      { categoryId: 'c-old2', category: 'เก่า2', budget: 1000, spent: 0 },
      { categoryId: 'c-old3', category: 'เก่า3', budget: null, spent: 15 },
    ]);
    const base = await start(deps);

    const res = await call(base, '/budgets?month=2026-09');

    expect((await res.json()).budgets.map((row) => row.categoryId)).toEqual(['c-food', 'c-old2', 'c-old3']);
  });

  it('rejects a bad month when reading budgets', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/budgets?month=2026-13');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid month' });
    expect(deps.repository.getBudgetStatus).not.toHaveBeenCalled();
  });

  it('sets the budget of an expense category from the chosen month', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/budgets/c-food', { method: 'PUT', body: { month: '2026-09', amount: 5000 } });

    expect(res.status).toBe(204);
    expect(deps.repository.setBudget).toHaveBeenCalledWith({
      userId: 'user-1',
      categoryId: 'c-food',
      month: '2026-09',
      amount: 5000,
    });
  });

  it('sets the budget when the category id in the url is uppercase', async () => {
    const lettered = { id: 'abcdef12-3333-4444-5555-666666666666', name: 'ค่าแมว', type: 'expense', hidden: false };
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue([lettered]);
    const base = await start(deps);

    const res = await call(base, `/budgets/${lettered.id.toUpperCase()}`, {
      method: 'PUT',
      body: { month: '2026-09', amount: 5000 },
    });

    expect(res.status).toBe(204);
    expect(deps.repository.setBudget).toHaveBeenCalledWith(expect.objectContaining({ categoryId: lettered.id }));
  });

  it('stores null to stop the budget', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/budgets/c-food', { method: 'PUT', body: { month: '2026-09', amount: null } });

    expect(res.status).toBe(204);
    expect(deps.repository.setBudget).toHaveBeenCalledWith(expect.objectContaining({ amount: null }));
  });

  it('rejects amounts outside the entry rules', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const amount of [0, -1, 10000001, 1.234, '5000', undefined]) {
      const res = await call(base, '/budgets/c-food', { method: 'PUT', body: { month: '2026-09', amount } });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid amount' });
    }
    expect(deps.repository.setBudget).not.toHaveBeenCalled();
  });

  it('rejects a bad or missing month when setting', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const month of ['2026-13', ['2026-09'], undefined]) {
      const res = await call(base, '/budgets/c-food', { method: 'PUT', body: { month, amount: 5000 } });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid month' });
    }
    expect(deps.repository.setBudget).not.toHaveBeenCalled();
  });

  it('rejects an empty or array body when setting', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const body of [{}, [], [{ month: '2026-09', amount: 5000 }]]) {
      const res = await call(base, '/budgets/c-food', { method: 'PUT', body });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid month' });
    }
    const noBody = await call(base, '/budgets/c-food', { method: 'PUT' });
    expect(noBody.status).toBe(400);
    expect(deps.repository.setBudget).not.toHaveBeenCalled();
  });

  it('returns 404 for an income category or a category of someone else', async () => {
    const deps = setup();
    const base = await start(deps);

    // id ที่ไม่ใช่ UUID ต้องไม่ถูกส่งต่อไปถึง DB ผ่าน setBudget
    for (const id of ['c-salary', 'c-not-mine', 'not-a-uuid%27']) {
      const res = await call(base, `/budgets/${id}`, { method: 'PUT', body: { month: '2026-09', amount: 5000 } });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Not found' });
    }
    expect(deps.repository.setBudget).not.toHaveBeenCalled();
  });

  it('requires a verified token for both routes', async () => {
    const deps = setup();
    const base = await start(deps);

    const read = await call(base, '/budgets?month=2026-09', { token: null });
    const write = await call(base, '/budgets/c-food', {
      method: 'PUT',
      body: { month: '2026-09', amount: 5000 },
      token: null,
    });

    expect(read.status).toBe(401);
    expect(write.status).toBe(401);
    expect(deps.repository.getBudgetStatus).not.toHaveBeenCalled();
    expect(deps.repository.setBudget).not.toHaveBeenCalled();
  });
});

describe('error handling', () => {
  it('returns 400 JSON for a malformed body without leaking the stack', async () => {
    const base = await start(setup());

    const res = await fetch(`${base}/transactions/${ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"amount":',
    });
    const text = await res.text();

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(JSON.parse(text)).toEqual({ error: 'Invalid body' });
    expect(text).not.toContain('at JSON.parse');
  });

  it('returns 413 JSON for a body over 10kb', async () => {
    const base = await start(setup());

    const res = await fetch(`${base}/transactions/${ID}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'x'.repeat(11 * 1024) }),
    });

    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: 'Invalid body' });
  });

  it('returns 404 JSON for an unknown api path', async () => {
    const base = await start(setup());

    const res = await call(base, '/nothing-here');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });

  it('returns 500 and logs when the repository fails', async () => {
    const deps = setup();
    deps.repository.listCategories.mockRejectedValue(new Error('db down'));
    const base = await start(deps);

    const res = await call(base, '/categories');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(deps.logger.error).toHaveBeenCalledWith('API request failed', { path: '/categories' }, expect.any(Error));
  });
});

describe('recurring rules API', () => {
  const BODY = { categoryId: 'c-food', amount: 590, dayOfMonth: 5, note: 'ค่าเน็ต', active: true };
  const EXISTING = {
    id: ID,
    type: 'expense',
    categoryId: 'c-food',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: '2026-08-05',
  };

  it('lists the rules of the signed in user', async () => {
    const deps = setup();
    deps.repository.listRecurringRules.mockResolvedValue([EXISTING]);
    const base = await start(deps);

    const res = await call(base, '/recurring');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rules: [EXISTING] });
    expect(deps.repository.listRecurringRules).toHaveBeenCalledWith('user-1');
  });

  it('creates a rule, takes the type from the category and skips this month when the day has passed', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/recurring', { method: 'POST', body: BODY });

    expect(res.status).toBe(201);
    expect(deps.repository.createRecurringRule).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'expense',
      categoryId: 'c-food',
      amount: 590,
      note: 'ค่าเน็ต',
      dayOfMonth: 5,
      active: true,
      lastRunOn: '2026-09-05',
    });
    expect((await res.json()).rule.id).toBe(ID);
  });

  it('leaves lastRunOn empty when the due day is still ahead this month', async () => {
    const deps = setup({ now: () => new Date('2026-09-10T03:00:00.000Z') });
    const base = await start(deps);

    await call(base, '/recurring', { method: 'POST', body: { ...BODY, dayOfMonth: 31 } });

    expect(deps.repository.createRecurringRule.mock.calls[0][0].lastRunOn).toBeNull();
  });

  it('rejects a bad body, a category that is not the user and the 51st rule', async () => {
    const deps = setup();
    const base = await start(deps);

    expect((await call(base, '/recurring', { method: 'POST', body: { ...BODY, amount: -1 } })).status).toBe(400);
    expect((await call(base, '/recurring', { method: 'POST', body: { ...BODY, categoryId: 'other' } })).status).toBe(400);
    expect(deps.repository.createRecurringRule).not.toHaveBeenCalled();

    deps.repository.listRecurringRules.mockResolvedValue(Array.from({ length: 50 }, () => EXISTING));
    const full = await call(base, '/recurring', { method: 'POST', body: BODY });
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: 'Too many rules' });
  });

  it('updates a rule and recomputes lastRunOn from the existing value', async () => {
    const deps = setup({ now: () => new Date('2026-09-10T03:00:00.000Z') });
    deps.repository.listRecurringRules.mockResolvedValue([EXISTING]);
    const base = await start(deps);

    const res = await call(base, `/recurring/${ID}`, { method: 'PUT', body: { ...BODY, amount: 600, dayOfMonth: 31 } });

    expect(res.status).toBe(204);
    expect(deps.repository.updateRecurringRule).toHaveBeenCalledWith('user-1', ID, {
      type: 'expense',
      categoryId: 'c-food',
      amount: 600,
      note: 'ค่าเน็ต',
      dayOfMonth: 31,
      active: true,
      lastRunOn: '2026-08-05',
    });
  });

  it('keeps this month due when only the amount or note is edited', async () => {
    const deps = setup({ now: () => new Date('2026-10-15T03:00:00.000Z') });
    deps.repository.listRecurringRules.mockResolvedValue([{ ...EXISTING, dayOfMonth: 15, lastRunOn: '2026-09-15' }]);
    const base = await start(deps);

    const res = await call(base, `/recurring/${ID}`, { method: 'PUT', body: { ...BODY, dayOfMonth: 15, amount: 700 } });

    expect(res.status).toBe(204);
    expect(deps.repository.updateRecurringRule.mock.calls[0][2].lastRunOn).toBe('2026-09-15');
  });

  it('resumes a paused rule after its due day without recording this month', async () => {
    const deps = setup({ now: () => new Date('2026-09-10T03:00:00.000Z') });
    deps.repository.listRecurringRules.mockResolvedValue([
      { ...EXISTING, dayOfMonth: 5, active: false, lastRunOn: '2026-08-05' },
    ]);
    const base = await start(deps);

    await call(base, `/recurring/${ID}`, { method: 'PUT', body: { ...BODY, dayOfMonth: 5, active: true } });

    expect(deps.repository.updateRecurringRule.mock.calls[0][2].lastRunOn).toBe('2026-09-05');
  });

  it('skips this month when the day is changed to one that has already passed', async () => {
    const deps = setup({ now: () => new Date('2026-09-10T03:00:00.000Z') });
    deps.repository.listRecurringRules.mockResolvedValue([
      { ...EXISTING, dayOfMonth: 20, active: true, lastRunOn: '2026-08-20' },
    ]);
    const base = await start(deps);

    await call(base, `/recurring/${ID}`, { method: 'PUT', body: { ...BODY, dayOfMonth: 5 } });

    expect(deps.repository.updateRecurringRule.mock.calls[0][2].lastRunOn).toBe('2026-09-05');
  });

  it('returns 404 when updating or deleting a rule that is missing or has a bad id', async () => {
    const deps = setup();
    const base = await start(deps);
    deps.repository.deleteRecurringRule.mockResolvedValue(false);

    expect((await call(base, `/recurring/${ID}`, { method: 'PUT', body: BODY })).status).toBe(404);
    expect((await call(base, '/recurring/not-a-uuid', { method: 'PUT', body: BODY })).status).toBe(404);
    expect((await call(base, `/recurring/${ID}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(base, '/recurring/not-a-uuid', { method: 'DELETE' })).status).toBe(404);
    expect(deps.repository.updateRecurringRule).not.toHaveBeenCalled();
  });

  it('deletes a rule', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/recurring/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteRecurringRule).toHaveBeenCalledWith('user-1', ID);
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/recurring', { token: null })).status).toBe(401);
  });
});

describe('GET /api/trend', () => {
  it('returns 6 months ending at the requested month, filled with zeros', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/trend?month=2026-09');

    expect(res.status).toBe(200);
    expect(deps.repository.getMonthlyTotals).toHaveBeenCalledWith('user-1', '2026-04-01', '2026-09-30');
    const { months } = await res.json();
    expect(months.map((entry) => entry.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(months[4]).toEqual({ month: '2026-08', income: 25000, expense: 0 });
    expect(months[5]).toEqual({ month: '2026-09', income: 0, expense: 60 });
  });

  it('rejects a missing, malformed or non-string month', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const query of ['', '?month=2026-13', '?month=abc', '?month=2026-09&month=2026-08']) {
      const res = await call(base, `/trend${query}`);
      expect(res.status).toBe(400);
    }
    expect(deps.repository.getMonthlyTotals).not.toHaveBeenCalled();
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/trend?month=2026-09', { token: null })).status).toBe(401);
  });
});

describe('GET /api/profile', () => {
  it('returns the name, lifetime totals and a balance computed in satang', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/profile');

    expect(res.status).toBe(200);
    expect(deps.repository.getLifetimeTotals).toHaveBeenCalledWith('user-1');
    expect(deps.repository.getDisplayName).toHaveBeenCalledWith('user-1');
    // 25000.10 - 60.20 ต้องได้ 24939.9 พอดี ไม่ใช่ 24939.899999999998
    expect(await res.json()).toEqual({
      displayName: 'สมชาย',
      income: 25000.1,
      expense: 60.2,
      balance: 24939.9,
      entryCount: 3,
      firstDate: '2026-08-03',
    });
  });

  it('allows a negative balance and a missing name', async () => {
    const deps = setup();
    deps.repository.getLifetimeTotals.mockResolvedValue({ income: 100, expense: 250.5, entryCount: 2, firstDate: '2026-09-01' });
    deps.repository.getDisplayName.mockResolvedValue(null);
    const base = await start(deps);

    const body = await (await call(base, '/profile')).json();

    expect(body.balance).toBe(-150.5);
    expect(body.displayName).toBeNull();
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/profile', { token: null })).status).toBe(401);
  });
});

describe('notification settings API', () => {
  it('returns the switches of the logged in user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklySummary: false, dailyReminder: false });
    expect(deps.repository.getNotificationSettings).toHaveBeenCalledWith('user-1');
  });

  it('saves a known switch and returns the saved values', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings', { method: 'PATCH', body: { weeklySummary: true, isAdmin: true } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklySummary: true, dailyReminder: false });
    expect(deps.repository.updateNotificationSettings).toHaveBeenCalledWith('user-1', { weeklySummary: true });
  });

  it('saves the daily reminder switch', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings', { method: 'PATCH', body: { dailyReminder: true } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklySummary: false, dailyReminder: true });
    expect(deps.repository.updateNotificationSettings).toHaveBeenCalledWith('user-1', { dailyReminder: true });
  });

  it.each([
    [{}, 'Invalid body'],
    [{ isAdmin: true }, 'Invalid body'],
    [{ weeklySummary: 'yes' }, 'Invalid weeklySummary'],
  ])('refuses %j with 400', async (body, error) => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings', { method: 'PATCH', body });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(deps.repository.updateNotificationSettings).not.toHaveBeenCalled();
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/settings', { token: null })).status).toBe(401);
    expect((await call(base, '/settings', { token: null, method: 'PATCH', body: { weeklySummary: true } })).status).toBe(401);
  });
});

describe('/api/friends', () => {
  it('reaches the friends router only after the ID token check, with the user id set', async () => {
    const friendsRouter = express.Router();
    friendsRouter.get('/', (req, res) => res.json({ userId: req.userId }));
    const base = await start(setup({ friendsRouter }));

    expect((await call(base, '/friends', { token: null })).status).toBe(401);
    const res = await call(base, '/friends');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-1' });
  });

  it('answers a failure inside the friends router as a JSON 500', async () => {
    const friendsRouter = express.Router();
    friendsRouter.get('/', async () => {
      throw new Error('db down');
    });
    const deps = setup({ friendsRouter });
    const base = await start(deps);

    const res = await call(base, '/friends');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
  });
});

describe('/api/bills', () => {
  it('reaches the bills router only after the ID token check, with the user id set', async () => {
    const billsRouter = express.Router();
    billsRouter.get('/', (req, res) => res.json({ userId: req.userId }));
    const base = await start(setup({ billsRouter }));

    expect((await call(base, '/bills', { token: null })).status).toBe(401);
    expect(await (await call(base, '/bills')).json()).toEqual({ userId: 'user-1' });
  });
});

describe('/api/goals', () => {
  it('reaches the goals router only after the ID token check, with the user id set', async () => {
    const goalsRouter = express.Router();
    goalsRouter.get('/', (req, res) => res.json({ userId: req.userId }));
    const base = await start(setup({ goalsRouter }));

    expect((await call(base, '/goals', { token: null })).status).toBe(401);
    expect(await (await call(base, '/goals')).json()).toEqual({ userId: 'user-1' });
  });
});
