import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createGoalsRouter } from './router.js';

const GOAL = '11111111-2222-3333-4444-555555555555';
const OTHER_GOAL = '66666666-7777-8888-9999-000000000000';
const ENTRY = '22222222-3333-4444-5555-666666666666';
let server;

function goal(overrides = {}) {
  return { id: GOAL, name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: null, closed: false, saved: 6000, contributionCount: 2, ...overrides };
}

function openGoals(count) {
  return Array.from({ length: count }, (_, index) => goal({ id: `${index}`, name: `เป้า ${index}` }));
}

function setup(overrides = {}) {
  return {
    listGoals: vi.fn().mockResolvedValue([goal()]),
    createGoal: vi.fn().mockImplementation(async (userId, fields) => ({ status: 'ok', goal: { id: OTHER_GOAL, ...fields, closed: false } })),
    updateGoal: vi.fn().mockImplementation(async (userId, id, fields) => ({ status: 'ok', goal: { ...goal(), ...fields } })),
    addGoalContribution: vi.fn().mockResolvedValue({ status: 'ok', contributionId: ENTRY, saved: 6500 }),
    listGoalContributions: vi.fn().mockResolvedValue([{ id: ENTRY, amount: 500, occurredOn: '2026-10-19' }]),
    deleteGoalContribution: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

async function start(repository) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/goals', createGoalsRouter({ repository }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/goals`;
}

function call(url, { method = 'GET', body } = {}) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

describe('GET /goals', () => {
  it('lists the goals of this user with their progress', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ goals: [goal()] });
    expect(repository.listGoals).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /goals', () => {
  it('creates a goal with a trimmed name and no date', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(base, { method: 'POST', body: { name: ' คอนโด ', targetAmount: 1500000 } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ goal: { id: OTHER_GOAL, name: 'คอนโด', targetAmount: 1500000, targetDate: null, closed: false } });
    expect(repository.createGoal).toHaveBeenCalledWith('user-1', { name: 'คอนโด', targetAmount: 1500000, targetDate: null });
  });

  it('refuses an invalid body without writing', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(base, { method: 'POST', body: { name: '', targetAmount: 1 } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid name' });
    expect(repository.createGoal).not.toHaveBeenCalled();
  });

  // แชตแสดงรายชื่อเป้าที่เปิดอยู่ทั้งหมดเมื่อหาไม่เจอ จึงจำกัดจำนวน แต่เป้าที่ปิดไม่นับ
  it('refuses a 21st open goal but does not count closed goals', async () => {
    const full = setup({ listGoals: vi.fn().mockResolvedValue(openGoals(20)) });
    const base = await start(full);

    const res = await call(base, { method: 'POST', body: { name: 'ใหม่', targetAmount: 1 } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many goals' });
    expect(full.createGoal).not.toHaveBeenCalled();

    full.listGoals.mockResolvedValue([...openGoals(19), goal({ id: 'c1', name: 'ปิด', closed: true })]);
    expect((await call(base, { method: 'POST', body: { name: 'ใหม่', targetAmount: 1 } })).status).toBe(201);
  });

  it('answers 409 for a name already used', async () => {
    const base = await start(setup({ createGoal: vi.fn().mockResolvedValue({ status: 'duplicate' }) }));

    const res = await call(base, { method: 'POST', body: { name: 'เที่ยวญี่ปุ่น', targetAmount: 1 } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Duplicate name' });
  });
});

describe('PATCH /goals/:id', () => {
  it('closes a goal of this user', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}`, { method: 'PATCH', body: { closed: true } });

    expect(res.status).toBe(200);
    expect((await res.json()).goal.closed).toBe(true);
    expect(repository.updateGoal).toHaveBeenCalledWith('user-1', GOAL, { closed: true });
  });

  // Postgres คืน uuid ตัวพิมพ์เล็กเสมอ แต่ลิงก์อาจมีตัวพิมพ์ใหญ่
  it('accepts an upper-case id', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL.toUpperCase()}`, { method: 'PATCH', body: { name: 'ทริป' } });

    expect(res.status).toBe(200);
    expect(repository.updateGoal).toHaveBeenCalledWith('user-1', GOAL, { name: 'ทริป' });
  });

  it('answers 404 for a malformed id or a goal that is not this user', async () => {
    const repository = setup();
    const base = await start(repository);

    expect((await call(`${base}/not-a-uuid`, { method: 'PATCH', body: { closed: true } })).status).toBe(404);
    expect((await call(`${base}/${OTHER_GOAL}`, { method: 'PATCH', body: { closed: true } })).status).toBe(404);
    expect(repository.updateGoal).not.toHaveBeenCalled();
  });

  it('refuses an empty change', async () => {
    const base = await start(setup());

    const res = await call(`${base}/${GOAL}`, { method: 'PATCH', body: {} });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid body' });
  });

  it('refuses to reopen a goal when 20 goals are already open', async () => {
    const repository = setup({ listGoals: vi.fn().mockResolvedValue([...openGoals(20), goal({ closed: true })]) });
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}`, { method: 'PATCH', body: { closed: false } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many goals' });
    expect(repository.updateGoal).not.toHaveBeenCalled();
  });

  it('answers 409 for a duplicate name and 404 when the row is gone', async () => {
    const repository = setup({ updateGoal: vi.fn().mockResolvedValue({ status: 'duplicate' }) });
    const base = await start(repository);

    expect((await call(`${base}/${GOAL}`, { method: 'PATCH', body: { name: 'ซ้ำ' } })).status).toBe(409);
    repository.updateGoal.mockResolvedValue({ status: 'not_found' });
    expect((await call(`${base}/${GOAL}`, { method: 'PATCH', body: { name: 'หาย' } })).status).toBe(404);
  });
});

describe('/goals/:id/contributions', () => {
  it('lists the contributions of a goal of this user', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}/contributions`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contributions: [{ id: ENTRY, amount: 500, occurredOn: '2026-10-19' }] });
    expect(repository.listGoalContributions).toHaveBeenCalledWith('user-1', GOAL);
  });

  it('answers 404 for the history of a goal that is not this user', async () => {
    const repository = setup();
    const base = await start(repository);

    expect((await call(`${base}/${OTHER_GOAL}/contributions`)).status).toBe(404);
    expect(repository.listGoalContributions).not.toHaveBeenCalled();
  });

  it('adds a contribution and returns the new saved total from SQL', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}/contributions`, { method: 'POST', body: { amount: 500, occurredOn: '2026-10-19' } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ contribution: { id: ENTRY }, saved: 6500 });
    expect(repository.addGoalContribution).toHaveBeenCalledWith('user-1', GOAL, { amount: 500, occurredOn: '2026-10-19' });
  });

  it('refuses a bad amount, a missing goal and a closed goal', async () => {
    const repository = setup();
    const base = await start(repository);
    const add = (id = GOAL, body = { amount: 500, occurredOn: '2026-10-19' }) => call(`${base}/${id}/contributions`, { method: 'POST', body });

    const bad = await add(GOAL, { amount: 0, occurredOn: '2026-10-19' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid amount' });
    expect((await add('nope')).status).toBe(404);
    repository.addGoalContribution.mockResolvedValue({ status: 'not_found', contributionId: null, saved: null });
    expect((await add()).status).toBe(404);
    repository.addGoalContribution.mockResolvedValue({ status: 'closed', contributionId: null, saved: null });
    const closed = await add();
    expect(closed.status).toBe(409);
    expect(await closed.json()).toEqual({ error: 'Goal closed' });
  });

  it('deletes one contribution of this user goal', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}/contributions/${ENTRY}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(repository.deleteGoalContribution).toHaveBeenCalledWith('user-1', GOAL, ENTRY);
  });

  it('answers 404 when there is nothing to delete or the id is malformed', async () => {
    const repository = setup({ deleteGoalContribution: vi.fn().mockResolvedValue(false) });
    const base = await start(repository);

    expect((await call(`${base}/${GOAL}/contributions/${ENTRY}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(`${base}/${GOAL}/contributions/x`, { method: 'DELETE' })).status).toBe(404);
    expect(repository.deleteGoalContribution).toHaveBeenCalledTimes(1);
  });
});
