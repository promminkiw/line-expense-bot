import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createFriendsRouter } from './router.js';

const FRIEND_ID = '22222222-3333-4444-5555-666666666666';
let server;

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

function setup(overrides = {}) {
  const friends = {
    getOverview: vi.fn().mockResolvedValue({ code: 'ABCD2345', friends: [{ id: FRIEND_ID, displayName: 'บี' }] }),
    lookup: vi.fn().mockResolvedValue({ status: 'ok', friend: { id: FRIEND_ID, displayName: 'บี' } }),
    addByCode: vi.fn().mockResolvedValue({ status: 'ok', friend: { id: FRIEND_ID, displayName: 'บี' } }),
    remove: vi.fn().mockResolvedValue(true),
    regenerateCode: vi.fn().mockResolvedValue('NEWC2345'),
    ...overrides,
  };
  const allowFriendLookup = vi.fn().mockReturnValue(true);
  return { friends, allowFriendLookup };
}

// จำลอง middleware ตรวจ token ของ /api ที่ใส่ req.userId ให้
async function start(deps) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/friends', createFriendsRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/friends`;
}

function call(url, { method = 'GET', body } = {}) {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('createFriendsRouter', () => {
  it('refuses to build without a lookup limiter', () => {
    expect(() => createFriendsRouter({ friends: setup().friends })).toThrow('allowFriendLookup');
  });

  it('returns the code and the friend list of this user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 'ABCD2345', friends: [{ id: FRIEND_ID, displayName: 'บี' }] });
    expect(deps.friends.getOverview).toHaveBeenCalledWith('user-1');
  });

  it('looks up a code and maps each failure to its status', async () => {
    const deps = setup();
    const base = await start(deps);

    const ok = await call(`${base}/lookup?code=abcd-2345`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ friend: { id: FRIEND_ID, displayName: 'บี' } });
    expect(deps.friends.lookup).toHaveBeenCalledWith('user-1', 'abcd-2345');

    for (const [status, httpStatus, error] of [
      ['invalid', 400, 'Invalid code'],
      ['self', 400, 'Own code'],
      ['not_found', 404, 'Not found'],
    ]) {
      deps.friends.lookup.mockResolvedValueOnce({ status });
      const res = await call(`${base}/lookup?code=x`);
      expect(res.status).toBe(httpStatus);
      expect(await res.json()).toEqual({ error });
    }
  });

  it('adds a friend by code from the body', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, { method: 'POST', body: { code: 'ABCD2345' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ friend: { id: FRIEND_ID, displayName: 'บี' } });
    expect(deps.friends.addByCode).toHaveBeenCalledWith('user-1', 'ABCD2345');
    deps.friends.addByCode.mockResolvedValueOnce({ status: 'not_found' });
    expect((await call(base, { method: 'POST', body: { code: 'ZZZZ2345' } })).status).toBe(404);
  });

  it('answers 429 for lookups and adds over the limit without touching the service', async () => {
    const deps = setup();
    deps.allowFriendLookup.mockReturnValue(false);
    const base = await start(deps);

    const lookup = await call(`${base}/lookup?code=ABCD2345`);
    const add = await call(base, { method: 'POST', body: { code: 'ABCD2345' } });

    expect([lookup.status, add.status]).toEqual([429, 429]);
    expect(await lookup.json()).toEqual({ error: 'Too many requests' });
    expect(deps.allowFriendLookup).toHaveBeenCalledWith('user-1');
    expect(deps.friends.lookup).not.toHaveBeenCalled();
    expect(deps.friends.addByCode).not.toHaveBeenCalled();
  });

  it('removes a friend and answers 404 for a bad id or a stranger', async () => {
    const deps = setup();
    const base = await start(deps);

    expect((await call(`${base}/${FRIEND_ID}`, { method: 'DELETE' })).status).toBe(204);
    expect(deps.friends.remove).toHaveBeenCalledWith('user-1', FRIEND_ID);
    expect((await call(`${base}/not-a-uuid`, { method: 'DELETE' })).status).toBe(404);
    expect(deps.friends.remove).toHaveBeenCalledTimes(1);
    deps.friends.remove.mockResolvedValueOnce(false);
    expect((await call(`${base}/${FRIEND_ID}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('issues a new code', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(`${base}/code`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 'NEWC2345' });
    expect(deps.friends.regenerateCode).toHaveBeenCalledWith('user-1');
  });
});
