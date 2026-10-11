import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createBillsRouter } from './router.js';

const BILL = '55555555-5555-5555-5555-555555555555';
const F1 = '22222222-2222-2222-2222-222222222222';
let server;

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

function setup(overrides = {}) {
  const bills = {
    list: vi.fn().mockResolvedValue({ owned: [], incoming: [] }),
    create: vi.fn().mockResolvedValue({ status: 'ok', id: BILL, notNotified: [F1] }),
    cancel: vi.fn().mockResolvedValue(true),
    setPaid: vi.fn().mockResolvedValue(true),
    respond: vi.fn().mockResolvedValue({ status: 'confirmed', share: 300, categoryName: 'อาหาร' }),
    ...overrides,
  };
  return { bills, allowBillCreate: vi.fn().mockReturnValue(true) };
}

async function start(deps) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/bills', createBillsRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/bills`;
}

function call(url, { method = 'GET', body } = {}) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('createBillsRouter', () => {
  it('refuses to build without a create limiter', () => {
    expect(() => createBillsRouter({ bills: setup().bills })).toThrow('allowBillCreate');
  });

  it('lists the bills of this user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owned: [], incoming: [] });
    expect(deps.bills.list).toHaveBeenCalledWith('user-1');
  });

  it('creates a bill and answers 400 with the validation error', async () => {
    const deps = setup();
    const base = await start(deps);

    const created = await call(base, { method: 'POST', body: { title: 'x' } });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: BILL, notNotified: [F1] });
    expect(deps.bills.create).toHaveBeenCalledWith('user-1', { title: 'x' });

    deps.bills.create.mockResolvedValueOnce({ status: 'invalid', error: 'Not friends' });
    const rejected = await call(base, { method: 'POST', body: {} });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'Not friends' });
  });

  it('answers 429 when the user creates too many bills', async () => {
    const deps = setup();
    deps.allowBillCreate.mockReturnValue(false);
    const base = await start(deps);

    const res = await call(base, { method: 'POST', body: {} });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(deps.bills.create).not.toHaveBeenCalled();
  });

  it('cancels an owned bill and answers 404 otherwise', async () => {
    const deps = setup();
    const base = await start(deps);

    const ok = await call(`${base}/${BILL}/cancel`, { method: 'POST' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'cancelled' });
    expect(deps.bills.cancel).toHaveBeenCalledWith('user-1', BILL);
    deps.bills.cancel.mockResolvedValueOnce(false);
    expect((await call(`${base}/${BILL}/cancel`, { method: 'POST' })).status).toBe(404);
  });

  it('sets the paid flag and checks the body', async () => {
    const deps = setup();
    const base = await start(deps);

    const ok = await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: true } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ paid: true });
    expect(deps.bills.setPaid).toHaveBeenCalledWith('user-1', BILL, F1, true);
    expect((await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: 'yes' } })).status).toBe(400);
    deps.bills.setPaid.mockResolvedValueOnce(false);
    expect((await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: false } })).status).toBe(404);
  });

  it('confirms and declines a share, with 404 for a bill the user is not part of', async () => {
    const deps = setup();
    const base = await start(deps);

    const confirmed = await call(`${base}/${BILL}/confirm`, { method: 'POST' });
    expect(await confirmed.json()).toEqual({ status: 'confirmed' });
    expect(deps.bills.respond).toHaveBeenCalledWith('user-1', BILL, 'confirm');
    deps.bills.respond.mockResolvedValueOnce({ status: 'declined' });
    expect(await (await call(`${base}/${BILL}/decline`, { method: 'POST' })).json()).toEqual({ status: 'declined' });
    expect(deps.bills.respond).toHaveBeenLastCalledWith('user-1', BILL, 'decline');
    deps.bills.respond.mockResolvedValueOnce({ status: 'not_found' });
    expect((await call(`${base}/${BILL}/confirm`, { method: 'POST' })).status).toBe(404);
  });

  it('answers an earlier answer with its already status and no share', async () => {
    const deps = setup();
    const base = await start(deps);

    deps.bills.respond.mockResolvedValueOnce({ status: 'already_confirmed' });
    expect(await (await call(`${base}/${BILL}/confirm`, { method: 'POST' })).json()).toEqual({ status: 'already_confirmed' });
    deps.bills.respond.mockResolvedValueOnce({ status: 'already_declined' });
    expect(await (await call(`${base}/${BILL}/decline`, { method: 'POST' })).json()).toEqual({ status: 'already_declined' });
  });

  it('answers 404 for ids that are not UUIDs without touching the service', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const path of ['/x/cancel', `/${BILL}/members/x/paid`, '/x/confirm', '/x/decline']) {
      expect((await call(`${base}${path}`, { method: 'POST', body: { paid: true } })).status).toBe(404);
    }
    expect(deps.bills.cancel).not.toHaveBeenCalled();
    expect(deps.bills.setPaid).not.toHaveBeenCalled();
    expect(deps.bills.respond).not.toHaveBeenCalled();
  });
});
