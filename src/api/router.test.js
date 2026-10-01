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

let server;

function setup(overrides = {}) {
  const deps = {
    verifyIdToken: vi.fn(async (token) => {
      if (token === 'good') return 'U1';
      throw new AuthError('bad token');
    }),
    users: { ensureUser: vi.fn().mockResolvedValue('user-1') },
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
    },
    allowExport: vi.fn().mockReturnValue(true),
    liffId: 'liff-123',
    logger: { error: vi.fn() },
    now: () => new Date('2026-09-30T03:00:00.000Z'),
    ...overrides,
  };
  return deps;
}

describe('createApiRouter', () => {
  it('refuses to build without an export limiter so the limit cannot vanish silently', () => {
    const { allowExport, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('allowExport');
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

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.listCategories).toHaveBeenCalledWith('user-1');
  });
});

describe('GET /api/categories', () => {
  it('returns the user categories', async () => {
    const base = await start(setup());

    const res = await call(base, '/categories');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ categories: CATEGORIES });
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
        { id: ID, type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food', categoryName: 'อาหาร' },
      ],
      summary: [{ type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 }],
      truncated: false,
    });
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
