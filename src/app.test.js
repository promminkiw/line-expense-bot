import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import { createApp } from './app.js';
import { createApiRouter } from './api/router.js';
import { createExportRouter } from './export/router.js';

const SECRET = 'test-channel-secret';

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64');
}

let server;

async function start(handleEvents, logger = { error: vi.fn() }, apiRouter, exportRouter, recurringRouter) {
  const app = createApp({ channelSecret: SECRET, handleEvents, logger, apiRouter, exportRouter, recurringRouter });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function postWebhook(baseUrl, body, signature) {
  const headers = { 'Content-Type': 'application/json' };
  if (signature) headers['x-line-signature'] = signature;
  return fetch(`${baseUrl}/webhook`, { method: 'POST', headers, body });
}

afterEach(async () => {
  // ปิด keep-alive connection ของ fetch ก่อน ไม่งั้น close() อาจรอค้าง
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /health', () => {
  it('returns ok', async () => {
    const baseUrl = await start(vi.fn());
    const res = await fetch(`${baseUrl}/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /webhook', () => {
  it('returns 200 and passes events to handleEvents when signature is valid', async () => {
    const handleEvents = vi.fn().mockResolvedValue();
    const baseUrl = await start(handleEvents);
    const events = [{ type: 'message', replyToken: 'r1', message: { type: 'text', text: 'hi' } }];
    const body = JSON.stringify({ destination: 'U1', events });

    const res = await postWebhook(baseUrl, body, sign(body));

    expect(res.status).toBe(200);
    await vi.waitFor(() => expect(handleEvents).toHaveBeenCalledWith(events));
  });

  it('returns 200 for LINE verify request with empty events', async () => {
    const baseUrl = await start(vi.fn().mockResolvedValue());
    const body = JSON.stringify({ destination: 'U1', events: [] });

    const res = await postWebhook(baseUrl, body, sign(body));

    expect(res.status).toBe(200);
  });

  it('returns 401 and skips handleEvents when signature header is missing', async () => {
    const handleEvents = vi.fn();
    const baseUrl = await start(handleEvents);

    const res = await postWebhook(baseUrl, JSON.stringify({ events: [] }));

    expect(res.status).toBe(401);
    expect(handleEvents).not.toHaveBeenCalled();
  });

  it('returns 401 when signature does not match body', async () => {
    const handleEvents = vi.fn();
    const baseUrl = await start(handleEvents);
    const body = JSON.stringify({ events: [] });

    const res = await postWebhook(baseUrl, body, sign('other body'));

    expect(res.status).toBe(401);
    expect(handleEvents).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not JSON but signature is valid', async () => {
    const baseUrl = await start(vi.fn());
    const body = 'not-json';

    const res = await postWebhook(baseUrl, body, sign(body));

    expect(res.status).toBe(400);
  });

  it('returns 413 and skips handleEvents when body exceeds size limit', async () => {
    const handleEvents = vi.fn();
    const baseUrl = await start(handleEvents);

    const res = await postWebhook(baseUrl, 'x'.repeat(1024 * 1024 + 1), 'any-signature');

    expect(res.status).toBe(413);
    expect(handleEvents).not.toHaveBeenCalled();
  });

  it('returns 415 without stack trace when content-encoding is unsupported', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'xyz' },
      body: '{}',
    });
    const text = await res.text();

    expect(res.status).toBe(415);
    expect(text).not.toContain(' at ');
    expect(text).not.toContain('node_modules');
    expect(text).not.toContain('.js:');
  });

  it('returns 400 without stack trace when gzip body is corrupt', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: 'not gzip data',
    });
    const text = await res.text();

    expect(res.status).toBe(400);
    expect(text).not.toContain(' at ');
    expect(text).not.toContain('node_modules');
    expect(text).not.toContain('.js:');
  });

  it('responds 200 without waiting for handleEvents to finish', async () => {
    const handleEvents = vi.fn(() => new Promise(() => {}));
    const baseUrl = await start(handleEvents);
    const body = JSON.stringify({ events: [] });

    const res = await postWebhook(baseUrl, body, sign(body));

    expect(res.status).toBe(200);
  });

  it('logs error when handleEvents rejects, response is still 200', async () => {
    const logger = { error: vi.fn() };
    const baseUrl = await start(vi.fn().mockRejectedValue(new Error('boom')), logger);
    const body = JSON.stringify({ events: [] });

    const res = await postWebhook(baseUrl, body, sign(body));

    expect(res.status).toBe(200);
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('Failed to handle events', expect.any(Error))
    );
  });
});

describe('GET /liff/', () => {
  it('serves the LIFF page', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/liff/`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('id="app"');
  });

  it('serves page modules as JavaScript', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/liff/app.mjs`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
  });

  it('redirects /liff to /liff/ so relative asset paths resolve', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/liff`, { redirect: 'manual' });

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/liff/');
  });
});

describe('/api', () => {
  function buildApiRouter() {
    return createApiRouter({
      verifyIdToken: vi.fn().mockResolvedValue({ lineUserId: 'U1', name: null }),
      users: { ensureUser: vi.fn().mockResolvedValue('user-1') },
      repository: { listCategories: vi.fn().mockResolvedValue([]) },
      allowExport: vi.fn().mockReturnValue(true),
      friendsRouter: express.Router(),
      liffId: 'liff-123',
      logger: { error: vi.fn() },
    });
  }

  it('mounts the API router under /api', async () => {
    const baseUrl = await start(vi.fn(), { error: vi.fn() }, buildApiRouter());

    const res = await fetch(`${baseUrl}/api/config`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ liffId: 'liff-123' });
  });

  it('answers malformed JSON bodies with JSON, not the app text handler', async () => {
    const baseUrl = await start(vi.fn(), { error: vi.fn() }, buildApiRouter());

    const res = await fetch(`${baseUrl}/api/transactions/x`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });

    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ error: 'Invalid body' });
  });

  it('rejects JSON bodies larger than 10kb with a JSON error', async () => {
    const baseUrl = await start(vi.fn(), { error: vi.fn() }, buildApiRouter());

    const res = await fetch(`${baseUrl}/api/transactions/x`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'x'.repeat(11 * 1024) }),
    });

    expect(res.status).toBe(413);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('/exports', () => {
  it('mounts the export router under /exports', async () => {
    const repository = { claimExportLink: vi.fn(), listAllTransactions: vi.fn(), listCategories: vi.fn() };
    const baseUrl = await start(vi.fn(), undefined, undefined, createExportRouter({ repository }));

    const res = await fetch(`${baseUrl}/exports/not-a-token`);

    expect(res.status).toBe(410);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(repository.claimExportLink).not.toHaveBeenCalled();
  });

  it('is not mounted when no export router is given', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/exports/not-a-token`);

    expect(res.status).toBe(404);
  });
});

describe('recurring router', () => {
  it('mounts the router under /internal', async () => {
    const recurringRouter = express.Router();
    recurringRouter.post('/recurring/run', (req, res) => res.json({ ok: true }));
    const baseUrl = await start(vi.fn(), undefined, undefined, undefined, recurringRouter);

    const res = await fetch(`${baseUrl}/internal/recurring/run`, { method: 'POST' });

    expect(await res.json()).toEqual({ ok: true });
  });
});
