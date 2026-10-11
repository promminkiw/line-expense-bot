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
    respondFromWeb: vi.fn().mockResolvedValue({ status: 'confirmed', title: 'เนื้อย่าง', share: 300, categoryName: 'อาหาร' }),
    ...overrides,
  };
  return {
    bills,
    allowBillCreate: vi.fn().mockReturnValue(true),
    allowReceiptRead: vi.fn().mockReturnValue(true),
    readReceipt: vi.fn().mockResolvedValue({ status: 'ok', amount: 600 }),
  };
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

function postImage(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body });
}

describe('createBillsRouter', () => {
  it('refuses to build without a create limiter', () => {
    expect(() => createBillsRouter({ bills: setup().bills })).toThrow('allowBillCreate');
  });

  it('refuses to build without the receipt reader and its limiter', () => {
    const { bills, allowBillCreate, readReceipt, allowReceiptRead } = setup();

    expect(() => createBillsRouter({ bills, allowBillCreate, readReceipt })).toThrow('allowReceiptRead');
    expect(() => createBillsRouter({ bills, allowBillCreate, allowReceiptRead })).toThrow('readReceipt');
  });

  it('reads the total from a receipt image sent as the raw body', async () => {
    const deps = setup();
    const base = await start(deps);
    const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

    const res = await postImage(`${base}/read-receipt`, image);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ amount: 600 });
    expect(deps.allowReceiptRead).toHaveBeenCalledWith('user-1');
    expect(Buffer.compare(deps.readReceipt.mock.calls[0][0], image)).toBe(0);
  });

  it('reads the body whatever content type the browser sent', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await fetch(`${base}/read-receipt`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: Buffer.from([1, 2]) });

    expect(res.status).toBe(200);
    expect(Buffer.isBuffer(deps.readReceipt.mock.calls[0][0])).toBe(true);
  });

  it('answers 415 for an unsupported file and 422 for an unreadable picture', async () => {
    const deps = setup();
    const base = await start(deps);

    deps.readReceipt.mockResolvedValueOnce({ status: 'unsupported' });
    const unsupported = await postImage(`${base}/read-receipt`, Buffer.from('x'));
    expect(unsupported.status).toBe(415);
    expect(await unsupported.json()).toEqual({ error: 'Unsupported image' });

    deps.readReceipt.mockResolvedValueOnce({ status: 'unreadable' });
    const unreadable = await postImage(`${base}/read-receipt`, Buffer.from('x'));
    expect(unreadable.status).toBe(422);
    expect(await unreadable.json()).toEqual({ error: 'Unreadable' });
  });

  it('checks the limit before reading the upload or calling Claude', async () => {
    const deps = setup();
    deps.allowReceiptRead.mockReturnValue(false);
    const base = await start(deps);

    const res = await postImage(`${base}/read-receipt`, Buffer.from('x'));

    expect(res.status).toBe(429);
    expect(deps.readReceipt).not.toHaveBeenCalled();
  });

  it('refuses an upload over 10 MB without reading it', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await postImage(`${base}/read-receipt`, Buffer.alloc(10 * 1024 * 1024 + 1));

    expect(res.status).toBe(413);
    expect(deps.readReceipt).not.toHaveBeenCalled();
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
    expect(deps.bills.create).toHaveBeenCalledWith('user-1', { title: 'x' }, { allowCreate: expect.any(Function) });

    deps.bills.create.mockResolvedValueOnce({ status: 'invalid', error: 'Not friends' });
    const rejected = await call(base, { method: 'POST', body: {} });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'Not friends' });
  });

  // service เรียก allowCreate หลังตรวจข้อมูลผ่าน บิลที่กรอกผิดจึงไม่ถูกนับ
  it('answers 429 when the service says the user created too many bills, counting this user', async () => {
    const deps = setup();
    deps.allowBillCreate.mockReturnValue(false);
    deps.bills.create.mockImplementation(async (userId, body, { allowCreate }) => (allowCreate() ? { status: 'ok' } : { status: 'limited' }));
    const base = await start(deps);

    const res = await call(base, { method: 'POST', body: {} });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(deps.allowBillCreate).toHaveBeenCalledWith('user-1');
  });

  it('uses the create limit only for creating a bill', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base);
    await call(`${base}/${BILL}/cancel`, { method: 'POST' });
    await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: true } });
    await call(`${base}/${BILL}/confirm`, { method: 'POST' });

    expect(deps.allowBillCreate).not.toHaveBeenCalled();
  });

  it('answers 400 when marking paid without a JSON body', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid body' });
    expect(deps.bills.setPaid).not.toHaveBeenCalled();
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
    expect(deps.bills.respondFromWeb).toHaveBeenCalledWith('user-1', BILL, 'confirm');
    deps.bills.respondFromWeb.mockResolvedValueOnce({ status: 'declined' });
    expect(await (await call(`${base}/${BILL}/decline`, { method: 'POST' })).json()).toEqual({ status: 'declined' });
    expect(deps.bills.respondFromWeb).toHaveBeenLastCalledWith('user-1', BILL, 'decline');
    deps.bills.respondFromWeb.mockResolvedValueOnce({ status: 'not_found' });
    expect((await call(`${base}/${BILL}/confirm`, { method: 'POST' })).status).toBe(404);
  });

  it('answers an earlier answer with its already status and no share', async () => {
    const deps = setup();
    const base = await start(deps);

    deps.bills.respondFromWeb.mockResolvedValueOnce({ status: 'already_confirmed', title: 'เนื้อย่าง', share: 300 });
    expect(await (await call(`${base}/${BILL}/confirm`, { method: 'POST' })).json()).toEqual({ status: 'already_confirmed' });
    deps.bills.respondFromWeb.mockResolvedValueOnce({ status: 'already_declined' });
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
    expect(deps.bills.respondFromWeb).not.toHaveBeenCalled();
  });
});
