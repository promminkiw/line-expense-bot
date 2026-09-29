import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { createApp } from './app.js';

const SECRET = 'test-channel-secret';

function sign(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64');
}

let server;

async function start(handleEvents, logger = { error: vi.fn() }) {
  const app = createApp({ channelSecret: SECRET, handleEvents, logger });
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
