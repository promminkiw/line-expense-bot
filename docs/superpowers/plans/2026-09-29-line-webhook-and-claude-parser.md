# LINE Webhook Echo Bot + Claude Message Parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำขั้นที่ 1 (LINE webhook echo bot ทดสอบในเครื่องผ่าน ngrok) และขั้นที่ 2 (ให้ Claude แยกข้อความภาษาไทยเป็นรายการ JSON แล้วตอบสรุปกลับใน LINE โดยยังไม่บันทึกลง database) ตาม `SPEC.md`

**Architecture:** Express app ตัวเดียว (`src/app.js`) รับ `POST /webhook` ตรวจ `x-line-signature` ด้วย middleware ของ `@line/bot-sdk` ตอบ 200 ทันทีแล้วส่ง events ต่อให้ `bot.handleEvents` ทุก dependency ภายนอก (LINE client, Anthropic client, เวลา) ถูกส่งเข้ามาแบบ dependency injection เพื่อให้เทสต์ใช้ fake object แทนได้โดยไม่ต้อง mock module ส่วน `index.js` เป็นจุดเดียวที่ประกอบของจริงเข้าด้วยกัน

**Tech Stack:** Node.js (CommonJS), Express 5.2.1, @line/bot-sdk 11.2.0, @anthropic-ai/sdk 0.129.0 (structured outputs ผ่าน `output_config.format`), dotenv, Vitest 5.0.2, ngrok (ทดสอบในเครื่อง)

## Global Constraints

- ผู้ใช้ใช้ Windows: ทุกคำสั่งในแผนต้องรันได้ใน PowerShell (ใช้ `curl.exe` ไม่ใช่ `curl`, ใช้ `Copy-Item` ไม่ใช่ `cp`)
- โปรเจกต์เป็น `"type": "commonjs"`: source ใช้ `require` / `module.exports`
- ไฟล์เทสต์ต้องใช้ `import` เท่านั้น เพราะ `require('vitest')` จะ throw `Vitest cannot be imported in a CommonJS module using require()`
- ห้ามใช้ `vi.mock` กับ module ที่ถูก `require` — ใช้ dependency injection + fake object แทน
- เทสต์วางคู่กับไฟล์: `src/foo.js` → `src/foo.test.js`
- ไม่เพิ่ม dependency ใหม่ (HTTP test ใช้ `app.listen(0)` + `fetch` ที่มีใน Node)
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log message เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม commit `.env` หรือ secret ใดๆ; agent ห้ามแก้ `.env` เอง (ผู้ใช้สร้างเองจาก `.env.example`)
- ห้าม agent start/restart/kill server เอง ขั้นที่ต้องรัน `npm start` / `ngrok` เป็นหน้าที่ของผู้ใช้
- Claude model: `claude-haiku-4-5` (ตั้งค่าเปลี่ยนได้ผ่าน env `CLAUDE_MODEL`)
- ตอบ LINE webhook ด้วย 200 ทันที แล้วประมวลผลต่อ
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `src/config.js` | อ่านและตรวจ environment variables | 1, 8 |
| `.env.example` | ตัวอย่าง env (ไม่มีค่าจริง) | 1, 8 |
| `src/app.js` | Express app: `/health`, `/webhook`, error handler ของ signature | 2 |
| `src/line-reply.js` | ห่อ `replyMessage` ของ LINE ให้เป็น `replyText(token, text)` | 3 |
| `src/bot.js` | ตัดสินใจว่าแต่ละ event ต้องตอบอะไร | 3, 8 |
| `index.js` | ประกอบของจริงเข้าด้วยกันแล้ว `listen` | 4, 8 |
| `src/utils/date.js` | วันที่ปัจจุบันตามเวลาไทย (`YYYY-MM-DD`) | 5 |
| `src/parser/categories.js` | หมวดหมู่ default + normalize หมวดที่ไม่รู้จัก | 5 |
| `src/parser/parse-message.js` | เรียก Claude แยกข้อความ + ตรวจผลลัพธ์ | 6 |
| `src/parser/format-reply.js` | แปลงผลการแยกเป็นข้อความตอบกลับ | 7 |
| `scripts/try-parse.js` | สคริปต์ลองเรียก Claude จริงจาก command line | 8 |

## Dependency Graph

- ขั้นที่ 1: Task 1, 2, 3 ทำขนานกันได้ (Task 1 เป็นคนเดียวที่แตะ `package.json`) → Task 4 (ต้องรอ 1-3)
- ขั้นที่ 2: Task 5 และ Task 7 ทำขนานกันได้ → Task 6 (รอ 5) → Task 8 (รอ 4, 6, 7)

---

## ขั้นที่ 1: LINE webhook echo bot

### Task 1: Config loader + `.env.example` + start script

**Depends on:** none

**Files:**
- Create: `src/config.js`
- Create: `.env.example`
- Modify: `package.json` (เพิ่ม script `start`)
- Test: `src/config.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `loadConfig(env: Record<string, string | undefined>) => { port: number, lineChannelSecret: string, lineChannelAccessToken: string }` — throw `Error` ที่ message มี `Missing environment variables: <KEY, KEY>` ถ้าขาด key

- [ ] **Step 1: Write the failing test**

`src/config.test.js`

```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
};

describe('loadConfig', () => {
  it('returns LINE credentials from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
    });
  });

  it('defaults port to 3000 when PORT is missing', () => {
    expect(loadConfig(VALID_ENV).port).toBe(3000);
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN'
    );
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, LINE_CHANNEL_SECRET: '' })).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.js`
Expected: FAIL — หาไฟล์ `./config.js` ไม่เจอ (error ประมาณ `Failed to load url ./config.js` หรือ `Cannot find module`)

- [ ] **Step 3: Write minimal implementation**

`src/config.js`

```js
const REQUIRED_KEYS = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN'];

function loadConfig(env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(env.PORT) || 3000,
    lineChannelSecret: env.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
  };
}

module.exports = { loadConfig };
```

`.env.example`

```
PORT=3000
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
```

`package.json` — แก้ส่วน `scripts` เป็น:

```json
  "scripts": {
    "start": "node index.js",
    "test": "vitest run"
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.js`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```powershell
git add src/config.js src/config.test.js .env.example package.json
git commit -m "feat: add environment config loader" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Express app พร้อม webhook ที่ตรวจ signature และตอบ 200 ทันที

**Depends on:** none

**Files:**
- Create: `src/app.js`
- Test: `src/app.test.js`

**Interfaces:**
- Consumes: `middleware`, `SignatureValidationFailed`, `JSONParseError` จาก `@line/bot-sdk`
- Produces: `createApp({ channelSecret: string, handleEvents: (events: object[]) => Promise<void>, logger?: { error: Function } }) => express.Application`
  - `GET /health` → 200 `{"status":"ok"}`
  - `POST /webhook` → signature ถูก: 200 ทันที แล้วเรียก `handleEvents(req.body.events)` แบบไม่รอ; ไม่มี/ผิด signature: 401; body ไม่ใช่ JSON: 400

- [ ] **Step 1: Write the failing test**

`src/app.test.js`

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.js`
Expected: FAIL — หา `./app.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/app.js`

```js
const express = require('express');
const { middleware, SignatureValidationFailed, JSONParseError } = require('@line/bot-sdk');

function createApp({ channelSecret, handleEvents, logger = console }) {
  const app = express();

  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // ห้ามใส่ express.json() ก่อน middleware นี้ เพราะต้องใช้ raw body ตรวจ signature
  app.post('/webhook', middleware({ channelSecret }), (req, res) => {
    // ตอบ 200 ก่อนประมวลผล เพราะ LINE จะ timeout และส่งซ้ำถ้ารอนาน
    res.sendStatus(200);
    const events = req.body.events || [];
    Promise.resolve()
      .then(() => handleEvents(events))
      .catch((err) => logger.error('Failed to handle events', err));
  });

  app.use((err, req, res, next) => {
    if (err instanceof SignatureValidationFailed) {
      res.status(401).send('Invalid signature');
      return;
    }
    if (err instanceof JSONParseError) {
      res.status(400).send('Invalid body');
      return;
    }
    next(err);
  });

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app.test.js`
Expected: PASS 8 tests

- [ ] **Step 5: Commit**

```powershell
git add src/app.js src/app.test.js
git commit -m "feat: add webhook endpoint with LINE signature check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Echo bot handler + LINE reply wrapper

**Depends on:** none

**Files:**
- Create: `src/line-reply.js`
- Create: `src/bot.js`
- Test: `src/line-reply.test.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: object ที่มี method `replyMessage({ replyToken, messages })` (คือ `messagingApi.MessagingApiClient` ของจริง ต่อใน Task 4)
- Produces:
  - `createReplyText(client) => (replyToken: string, text: string) => Promise<void>`
  - `createBot({ replyText, logger? }) => { handleEvent(event): Promise<void>, handleEvents(events: object[]): Promise<void> }`
    - ตอบเฉพาะ event `type: 'message'` ที่ `message.type: 'text'` ด้วยข้อความเดิม (echo) event อื่น (sticker, follow ฯลฯ) ไม่ตอบ
    - `handleEvents` ประมวลผลทุก event แม้บางอันพัง และ log `Failed to handle event`

- [ ] **Step 1: Write the failing tests**

`src/line-reply.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createReplyText } from './line-reply.js';

describe('createReplyText', () => {
  it('sends one text message with the reply token', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}) };
    const replyText = createReplyText(client);

    await replyText('token-1', 'hello');

    expect(client.replyMessage).toHaveBeenCalledWith({
      replyToken: 'token-1',
      messages: [{ type: 'text', text: 'hello' }],
    });
  });

  it('propagates LINE API errors', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue(new Error('Invalid reply token')) };
    const replyText = createReplyText(client);

    await expect(replyText('bad', 'hi')).rejects.toThrow('Invalid reply token');
  });
});
```

`src/bot.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createBot } from './bot.js';

function textEvent(text, replyToken = 'r1') {
  return { type: 'message', replyToken, message: { type: 'text', text } };
}

describe('bot.handleEvent', () => {
  it('echoes text messages back', async () => {
    const replyText = vi.fn().mockResolvedValue();
    const bot = createBot({ replyText });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(replyText).toHaveBeenCalledWith('r1', 'กินข้าว 60');
  });

  it('ignores sticker messages', async () => {
    const replyText = vi.fn();
    const bot = createBot({ replyText });

    await bot.handleEvent({ type: 'message', replyToken: 'r1', message: { type: 'sticker' } });

    expect(replyText).not.toHaveBeenCalled();
  });

  it('ignores non-message events such as follow', async () => {
    const replyText = vi.fn();
    const bot = createBot({ replyText });

    await bot.handleEvent({ type: 'follow', replyToken: 'r1' });

    expect(replyText).not.toHaveBeenCalled();
  });
});

describe('bot.handleEvents', () => {
  it('keeps processing other events when one fails and logs the failure', async () => {
    const replyText = vi
      .fn()
      .mockRejectedValueOnce(new Error('reply failed'))
      .mockResolvedValueOnce();
    const logger = { error: vi.fn() };
    const bot = createBot({ replyText, logger });

    await bot.handleEvents([textEvent('a', 'r1'), textEvent('b', 'r2')]);

    expect(replyText).toHaveBeenCalledWith('r2', 'b');
    expect(logger.error).toHaveBeenCalledWith('Failed to handle event', expect.any(Error));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/line-reply.test.js src/bot.test.js`
Expected: FAIL — หา `./line-reply.js` และ `./bot.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/line-reply.js`

```js
function createReplyText(client) {
  return async function replyText(replyToken, text) {
    await client.replyMessage({
      replyToken,
      messages: [{ type: 'text', text }],
    });
  };
}

module.exports = { createReplyText };
```

`src/bot.js`

```js
function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function createBot({ replyText, logger = console }) {
  async function handleEvent(event) {
    if (!isTextMessage(event)) {
      return;
    }
    await replyText(event.replyToken, event.message.text);
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อไม่ให้ event ที่พังหนึ่งอันทำให้ event อื่นไม่ถูกตอบ
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = { createBot };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/line-reply.test.js src/bot.test.js`
Expected: PASS 6 tests

- [ ] **Step 5: Commit**

```powershell
git add src/line-reply.js src/line-reply.test.js src/bot.js src/bot.test.js
git commit -m "feat: add echo bot handler and LINE reply wrapper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ประกอบ `index.js` + ตั้งค่า LINE OA + ทดสอบจริงผ่าน ngrok

**Depends on:** Task 1, Task 2, Task 3

**Files:**
- Create: `index.js`

**Interfaces:**
- Consumes: `loadConfig` (Task 1), `createApp` (Task 2), `createBot`, `createReplyText` (Task 3), `messagingApi.MessagingApiClient` จาก `@line/bot-sdk`
- Produces: `npm start` เปิด server ที่ `PORT` (default 3000) และ log `Server listening on port <PORT>`

**Manual check (ผู้ใช้เป็นคนทำ — agent ห้าม start server เอง):**
- Preconditions: ทำ Step 3-4 ด้านล่างเสร็จ, `npm start` รันอยู่ที่ port 3000, `ngrok http 3000` รันอยู่
- Base URL: `http://localhost:3000` และ URL ของ ngrok

| # | Action | Expected |
|---|---|---|
| 1 | PowerShell: `curl.exe http://localhost:3000/health` | เห็น `{"status":"ok"}` |
| 2 | PowerShell: `curl.exe -i -X POST http://localhost:3000/webhook -H "Content-Type: application/json" -d '{}'` | บรรทัดแรกเป็น `HTTP/1.1 401 Unauthorized` |
| 3 | LINE Developers Console > แท็บ Messaging API > Webhook URL กด Verify | ขึ้น `Success` |
| 4 | ในแอป LINE ส่งข้อความ `สวัสดี` หาบอท | บอทตอบกลับ `สวัสดี` |
| 5 | ส่ง sticker หาบอท | บอทไม่ตอบอะไร และ terminal ของ `npm start` ไม่มี error |

- [ ] **Step 1: เขียน `index.js`**

ไฟล์นี้ไม่มี unit test เพราะเป็นแค่จุดประกอบ logic ทั้งหมดถูกเทสต์ใน Task 1-3 แล้ว ตรวจด้วย Manual check แทน

`index.js`

```js
require('dotenv').config();
const { messagingApi } = require('@line/bot-sdk');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText } = require('./src/line-reply');

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const bot = createBot({ replyText: createReplyText(lineClient) });
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
```

- [ ] **Step 2: รันเทสต์ทั้งหมดให้ผ่านก่อน**

Run: `npm test`
Expected: PASS ทุกไฟล์ (config, app, line-reply, bot รวม 18 tests)

- [ ] **Step 3: (ผู้ใช้) สร้าง LINE OA และเปิด Messaging API**

1. เปิด https://manager.line.biz แล้ว login ด้วยบัญชี LINE → กด "สร้างบัญชีใหม่" กรอกข้อมูลจนเสร็จ ควรเห็นหน้า dashboard ของ OA ใหม่
2. ในหน้า OA กด "ตั้งค่า" (มุมขวาบน) → เมนูซ้าย "Messaging API" → กด "ใช้ Messaging API" → เลือกหรือสร้าง Provider → ยืนยัน ควรเห็น Channel ID และ Channel secret
3. ยังอยู่ใน "ตั้งค่า" → เมนู "การตั้งค่าการตอบกลับ" → เปิด "Webhook" และปิด "ข้อความตอบกลับอัตโนมัติ" กับ "ข้อความทักทาย" (ไม่งั้นบอทจะตอบซ้อนกับข้อความ auto)
4. เปิด https://developers.line.biz/console → เลือก Provider → เลือก channel ของ OA
   - แท็บ "Basic settings" → คัดลอก **Channel secret**
   - แท็บ "Messaging API" → เลื่อนลงล่างสุด "Channel access token (long-lived)" → กด Issue → คัดลอก token
5. ใน PowerShell ที่โฟลเดอร์โปรเจกต์: `Copy-Item .env.example .env` แล้ว `notepad .env` ใส่ค่า `LINE_CHANNEL_SECRET=` และ `LINE_CHANNEL_ACCESS_TOKEN=` จากข้อ 4 แล้ว save
6. ตรวจว่า `.env` ไม่ถูก track: `git status` ต้อง **ไม่เห็น** `.env` ในรายการ (มีอยู่ใน `.gitignore` แล้ว)

- [ ] **Step 4: (ผู้ใช้) ติดตั้งและเปิด ngrok**

1. สมัครบัญชีที่ https://dashboard.ngrok.com/signup แล้วไปหน้า "Your Authtoken" คัดลอก token
2. PowerShell: `winget install ngrok.ngrok` (ติดตั้งแบบทั้งเครื่อง — ถ้าไม่อยากใช้ winget ให้ดาวน์โหลด zip จากหน้า dashboard แทน) แล้วปิด-เปิด PowerShell ใหม่
3. `ngrok version` ควรเห็นเลขเวอร์ชัน
4. `ngrok config add-authtoken <token จากข้อ 1>` ควรเห็น `Authtoken saved`
5. PowerShell หน้าต่างที่ 1: `npm start` ควรเห็น `Server listening on port 3000`
6. PowerShell หน้าต่างที่ 2: `ngrok http 3000` ควรเห็นบรรทัด `Forwarding  https://xxxx.ngrok-free.app -> http://localhost:3000`
7. LINE Developers Console > แท็บ "Messaging API" > Webhook URL ใส่ `https://xxxx.ngrok-free.app/webhook` → Update → เปิด "Use webhook"
8. สแกน QR code ในแท็บเดียวกันเพื่อเพิ่มบอทเป็นเพื่อน

หมายเหตุ: URL ของ ngrok แบบฟรีเปลี่ยนทุกครั้งที่เปิดใหม่ ต้องกลับมาแก้ Webhook URL ทุกครั้ง

- [ ] **Step 5: (ผู้ใช้) ทำ Manual check ข้อ 1-5 ในตารางด้านบน ให้ผ่านทุกข้อ**

- [ ] **Step 6: Commit**

```powershell
git add index.js
git commit -m "feat: wire echo bot entry point" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## ขั้นที่ 2: Claude แยกข้อความเป็น JSON

รูปแบบผลลัพธ์ที่ใช้ร่วมกันใน Task 6-8 (ชื่อ `ParseResult`):

```js
// สำเร็จ
{ status: 'ok', items: [{ type: 'expense' | 'income', category: string, amount: number, date: 'YYYY-MM-DD', note: string }] }
// ต้องถามกลับ
{ status: 'clarify', question: string }
```

### Task 5: วันที่ตามเวลาไทย + หมวดหมู่ default

**Depends on:** none

**Files:**
- Create: `src/utils/date.js`
- Create: `src/parser/categories.js`
- Test: `src/utils/date.test.js`
- Test: `src/parser/categories.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `toBangkokDateString(date: Date) => string` รูปแบบ `YYYY-MM-DD` ตาม timezone `Asia/Bangkok`
  - `DEFAULT_CATEGORIES: { expense: string[], income: string[] }`
  - `FALLBACK_CATEGORY: 'อื่นๆ'`
  - `normalizeCategory(type: 'expense' | 'income', name: string) => string` คืน `name` ถ้าอยู่ในรายการของ `type` นั้น ไม่งั้นคืน `FALLBACK_CATEGORY`

- [ ] **Step 1: Write the failing tests**

`src/utils/date.test.js`

```js
import { describe, it, expect } from 'vitest';
import { toBangkokDateString } from './date.js';

describe('toBangkokDateString', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(toBangkokDateString(new Date('2026-09-29T05:00:00Z'))).toBe('2026-09-29');
  });

  it('rolls to next day after 17:00 UTC because Bangkok is UTC+7', () => {
    expect(toBangkokDateString(new Date('2026-09-29T17:00:00Z'))).toBe('2026-09-30');
  });

  it('stays on same day just before Bangkok midnight', () => {
    expect(toBangkokDateString(new Date('2026-09-29T16:59:59Z'))).toBe('2026-09-29');
  });
});
```

`src/parser/categories.test.js`

```js
import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, normalizeCategory } from './categories.js';

describe('DEFAULT_CATEGORIES', () => {
  it('includes fallback category in both types', () => {
    expect(DEFAULT_CATEGORIES.expense).toContain(FALLBACK_CATEGORY);
    expect(DEFAULT_CATEGORIES.income).toContain(FALLBACK_CATEGORY);
  });
});

describe('normalizeCategory', () => {
  it('keeps a known expense category', () => {
    expect(normalizeCategory('expense', 'อาหาร')).toBe('อาหาร');
  });

  it('keeps a known income category', () => {
    expect(normalizeCategory('income', 'เงินเดือน')).toBe('เงินเดือน');
  });

  it('falls back when category belongs to the other type', () => {
    expect(normalizeCategory('income', 'อาหาร')).toBe('อื่นๆ');
  });

  it('falls back for unknown category', () => {
    expect(normalizeCategory('expense', 'ของเล่นแมว')).toBe('อื่นๆ');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/utils/date.test.js src/parser/categories.test.js`
Expected: FAIL — หา `./date.js` และ `./categories.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/utils/date.js`

```js
// locale en-CA ให้รูปแบบ YYYY-MM-DD ตรงกับคอลัมน์ date ของ Postgres
const bangkokDateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toBangkokDateString(date) {
  return bangkokDateFormat.format(date);
}

module.exports = { toBangkokDateString };
```

`src/parser/categories.js`

```js
const FALLBACK_CATEGORY = 'อื่นๆ';

// ชุดชั่วคราวจนกว่าขั้นที่ 3 จะย้ายไปตาราง categories ต่อผู้ใช้
const DEFAULT_CATEGORIES = {
  expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', FALLBACK_CATEGORY],
  income: ['เงินเดือน', 'รายได้เสริม', FALLBACK_CATEGORY],
};

function normalizeCategory(type, name) {
  return DEFAULT_CATEGORIES[type].includes(name) ? name : FALLBACK_CATEGORY;
}

module.exports = { DEFAULT_CATEGORIES, FALLBACK_CATEGORY, normalizeCategory };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/utils/date.test.js src/parser/categories.test.js`
Expected: PASS 8 tests

- [ ] **Step 5: Commit**

```powershell
git add src/utils/date.js src/utils/date.test.js src/parser/categories.js src/parser/categories.test.js
git commit -m "feat: add Bangkok date helper and default categories" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Message parser ที่เรียก Claude ด้วย structured output

**Depends on:** Task 5

**Files:**
- Create: `src/parser/parse-message.js`
- Test: `src/parser/parse-message.test.js`

**Interfaces:**
- Consumes: `toBangkokDateString` (Task 5), `DEFAULT_CATEGORIES`, `normalizeCategory` (Task 5), object ที่มี `messages.create(params)` (คือ Anthropic client ของจริง ต่อใน Task 8)
- Produces:
  - `createMessageParser({ client, model: string, now?: () => Date }) => (text: string) => Promise<ParseResult>`
  - `class ParseError extends Error` — throw เมื่อ Claude ตอบไม่ใช่ JSON / ไม่มี text block / ถูกตัดเพราะ `max_tokens`
  - `PARSE_SCHEMA` (JSON schema ที่ส่งไปใน `output_config.format.schema`)
  - `DEFAULT_CLARIFY_QUESTION: string`

- [ ] **Step 1: Write the failing test**

`src/parser/parse-message.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  DEFAULT_CLARIFY_QUESTION,
} from './parse-message.js';

const NOW = () => new Date('2026-09-29T05:00:00Z');

function fakeClient(payload, { stopReason = 'end_turn', rawText } = {}) {
  const text = rawText !== undefined ? rawText : JSON.stringify(payload);
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        stop_reason: stopReason,
        content: [{ type: 'text', text }],
      }),
    },
  };
}

function item(overrides = {}) {
  return {
    type: 'expense',
    category: 'อาหาร',
    amount: 60,
    date: '2026-09-29',
    note: 'กินข้าว',
    ...overrides,
  };
}

function okPayload(items) {
  return { needs_clarification: false, question: '', items };
}

describe('parseMessage request', () => {
  it('sends model, user text, today in system prompt and JSON schema output format', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'claude-haiku-4-5', now: NOW });

    await parse('กินข้าว 60');

    const params = client.messages.create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-4-5');
    expect(params.messages).toEqual([{ role: 'user', content: 'กินข้าว 60' }]);
    expect(params.system).toContain('2026-09-29');
    expect(params.system).toContain('อาหาร');
    expect(params.output_config).toEqual({
      format: { type: 'json_schema', schema: PARSE_SCHEMA },
    });
  });
});

describe('parseMessage result', () => {
  it('returns every item when text has multiple entries', async () => {
    const items = [item(), item({ amount: 45, note: 'กาแฟ' })];
    const parse = createMessageParser({ client: fakeClient(okPayload(items)), model: 'm', now: NOW });

    const result = await parse('กินข้าว 60 กาแฟ 45');

    expect(result).toEqual({ status: 'ok', items });
  });

  it('returns clarify with Claude question when message is ambiguous', async () => {
    const payload = { needs_clarification: true, question: 'ซื้ออะไร กี่บาท?', items: [] };
    const parse = createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW });

    expect(await parse('ซื้อของ')).toEqual({ status: 'clarify', question: 'ซื้ออะไร กี่บาท?' });
  });

  it('uses default question when clarification question is empty', async () => {
    const payload = { needs_clarification: true, question: '', items: [] };
    const parse = createMessageParser({ client: fakeClient(payload), model: 'm', now: NOW });

    expect(await parse('อืม')).toEqual({ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION });
  });

  it('asks to clarify when Claude returns no items', async () => {
    const parse = createMessageParser({ client: fakeClient(okPayload([])), model: 'm', now: NOW });

    expect(await parse('สวัสดี')).toEqual({ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION });
  });

  it('asks to clarify when any amount is not positive', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item(), item({ amount: 0 })])),
      model: 'm',
      now: NOW,
    });

    expect(await parse('กินข้าว 60 กาแฟ')).toEqual({
      status: 'clarify',
      question: DEFAULT_CLARIFY_QUESTION,
    });
  });

  it('replaces category that does not match the item type with fallback', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ type: 'income', category: 'อาหาร' })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('ได้เงิน 500');

    expect(result.items[0].category).toBe('อื่นๆ');
  });

  it('replaces malformed date with today in Bangkok', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ date: 'yesterday' })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('กินข้าว 60');

    expect(result.items[0].date).toBe('2026-09-29');
  });
});

describe('parseMessage errors', () => {
  it('throws ParseError when Claude text is not JSON', async () => {
    const parse = createMessageParser({
      client: fakeClient(null, { rawText: 'not json' }),
      model: 'm',
      now: NOW,
    });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('throws ParseError when output was cut by max_tokens', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item()]), { stopReason: 'max_tokens' }),
      model: 'm',
      now: NOW,
    });

    await expect(parse('x')).rejects.toBeInstanceOf(ParseError);
  });

  it('propagates API errors from the client', async () => {
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error('overloaded')) } };
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await expect(parse('x')).rejects.toThrow('overloaded');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: FAIL — หา `./parse-message.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/parser/parse-message.js`

```js
const { DEFAULT_CATEGORIES, normalizeCategory } = require('./categories');
const { toBangkokDateString } = require('../utils/date');

const DEFAULT_CLARIFY_QUESTION = 'ช่วยบอกรายการและจำนวนเงินอีกครั้งได้ไหม เช่น "กินข้าว 60"';
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const ALL_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];

// structured outputs บังคับให้ทุก field อยู่ใน required และปิด additionalProperties
const PARSE_SCHEMA = {
  type: 'object',
  properties: {
    needs_clarification: { type: 'boolean' },
    question: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['expense', 'income'] },
          category: { type: 'string', enum: ALL_CATEGORIES },
          amount: { type: 'number' },
          date: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['type', 'category', 'amount', 'date', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['needs_clarification', 'question', 'items'],
  additionalProperties: false,
};

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ParseError';
  }
}

function buildSystemPrompt(today) {
  return [
    'You extract income and expense entries from a Thai user message for a personal finance bot.',
    `Today is ${today} (Asia/Bangkok).`,
    '',
    'Rules:',
    '- One message may contain several entries, e.g. "กินข้าว 60 กาแฟ 45" is two expense entries. Return one item per entry.',
    '- amount is the number of Thai baht as a positive number. Never add amounts together.',
    '- date is YYYY-MM-DD. Resolve relative words such as "เมื่อวาน" or "เมื่อวานซืน" from today. Use today when no date is given.',
    '- note is a short Thai description taken from the message, e.g. "กินข้าว".',
    `- Expense categories: ${DEFAULT_CATEGORIES.expense.join(', ')}`,
    `- Income categories: ${DEFAULT_CATEGORIES.income.join(', ')}`,
    '- Pick the category from the list that matches the item type. Use "อื่นๆ" when nothing fits.',
    '- If any entry has no amount, or you cannot tell what it is, set needs_clarification to true, items to [], and write one short Thai question in question.',
    '- Otherwise set needs_clarification to false and question to "".',
  ].join('\n');
}

function normalizeItem(item, today) {
  return {
    type: item.type,
    category: normalizeCategory(item.type, item.category),
    amount: item.amount,
    date: ISO_DATE_PATTERN.test(item.date) ? item.date : today,
    note: item.note,
  };
}

function toParseResult(data, today) {
  if (data.needs_clarification) {
    return { status: 'clarify', question: data.question || DEFAULT_CLARIFY_QUESTION };
  }

  const hasInvalidAmount = data.items.some(
    (item) => !Number.isFinite(item.amount) || item.amount <= 0
  );
  if (data.items.length === 0 || hasInvalidAmount) {
    return { status: 'clarify', question: DEFAULT_CLARIFY_QUESTION };
  }

  return { status: 'ok', items: data.items.map((item) => normalizeItem(item, today)) };
}

function createMessageParser({ client, model, now = () => new Date() }) {
  return async function parseMessage(text) {
    const today = toBangkokDateString(now());
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(today),
      messages: [{ role: 'user', content: text }],
      output_config: { format: { type: 'json_schema', schema: PARSE_SCHEMA } },
    });

    if (response.stop_reason === 'max_tokens') {
      throw new ParseError('Claude response was truncated');
    }
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new ParseError('Claude response has no text block');
    }

    let data;
    try {
      data = JSON.parse(textBlock.text);
    } catch {
      throw new ParseError('Claude response is not valid JSON');
    }
    return toParseResult(data, today);
  };
}

module.exports = { createMessageParser, ParseError, PARSE_SCHEMA, DEFAULT_CLARIFY_QUESTION };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: PASS 11 tests

- [ ] **Step 5: Commit**

```powershell
git add src/parser/parse-message.js src/parser/parse-message.test.js
git commit -m "feat: parse expense messages with Claude structured output" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: แปลงผลการแยกเป็นข้อความตอบกลับ

**Depends on:** none (ใช้แค่รูปแบบ `ParseResult` ที่ระบุไว้ต้นขั้นที่ 2)

**Files:**
- Create: `src/parser/format-reply.js`
- Test: `src/parser/format-reply.test.js`

**Interfaces:**
- Consumes: `ParseResult`
- Produces: `formatParseReply(result: ParseResult) => string`
  - `clarify` → คืน `question` ตรงๆ
  - `ok` → บรรทัดแรก `แยกรายการได้ดังนี้ (ยังไม่บันทึก)` ตามด้วยบรรทัดละรายการ `- <รายจ่าย|รายรับ> | <category> | <amount> บาท | <DD/MM> | <note>` (ถ้า note ว่าง ตัด ` | <note>` ออก)

- [ ] **Step 1: Write the failing test**

`src/parser/format-reply.test.js`

```js
import { describe, it, expect } from 'vitest';
import { formatParseReply } from './format-reply.js';

describe('formatParseReply', () => {
  it('returns the question for clarify result', () => {
    expect(formatParseReply({ status: 'clarify', question: 'ซื้ออะไร กี่บาท?' })).toBe(
      'ซื้ออะไร กี่บาท?'
    );
  });

  it('lists every item with type, category, amount, date and note', () => {
    const reply = formatParseReply({
      status: 'ok',
      items: [
        { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' },
        { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: 'เงินเดือน' },
      ],
    });

    expect(reply).toBe(
      [
        'แยกรายการได้ดังนี้ (ยังไม่บันทึก)',
        '- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
        '- รายรับ | เงินเดือน | 25,000 บาท | 01/09 | เงินเดือน',
      ].join('\n')
    );
  });

  it('keeps up to two decimal places', () => {
    const reply = formatParseReply({
      status: 'ok',
      items: [{ type: 'expense', category: 'อาหาร', amount: 1250.5, date: '2026-09-29', note: 'x' }],
    });

    expect(reply).toContain('1,250.5 บาท');
  });

  it('omits note separator when note is empty', () => {
    const reply = formatParseReply({
      status: 'ok',
      items: [{ type: 'expense', category: 'อื่นๆ', amount: 10, date: '2026-09-29', note: '' }],
    });

    expect(reply.split('\n')[1]).toBe('- รายจ่าย | อื่นๆ | 10 บาท | 29/09');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/format-reply.test.js`
Expected: FAIL — หา `./format-reply.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/parser/format-reply.js`

```js
const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

function formatAmount(amount) {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function formatItem(item) {
  const parts = [
    TYPE_LABELS[item.type],
    item.category,
    `${formatAmount(item.amount)} บาท`,
    formatDate(item.date),
  ];
  if (item.note) {
    parts.push(item.note);
  }
  return `- ${parts.join(' | ')}`;
}

function formatParseReply(result) {
  if (result.status === 'clarify') {
    return result.question;
  }
  return ['แยกรายการได้ดังนี้ (ยังไม่บันทึก)', ...result.items.map(formatItem)].join('\n');
}

module.exports = { formatParseReply };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/format-reply.test.js`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```powershell
git add src/parser/format-reply.js src/parser/format-reply.test.js
git commit -m "feat: format parsed entries as LINE reply text" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ต่อ parser เข้ากับบอท + config ของ Claude + ทดสอบกับ Claude และ LINE จริง

**Depends on:** Task 4, Task 6, Task 7

**Files:**
- Modify: `src/bot.js` (เปลี่ยนจาก echo เป็นเรียก parser)
- Modify: `src/bot.test.js` (แทนที่เทสต์ echo)
- Modify: `src/config.js` (เพิ่ม `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`)
- Modify: `src/config.test.js`
- Modify: `.env.example`
- Modify: `index.js`
- Modify: `package.json` (เพิ่ม script `try-parse`)
- Create: `scripts/try-parse.js`

**Interfaces:**
- Consumes: `createMessageParser` (Task 6), `formatParseReply` (Task 7), `createReplyText`, `createApp` (Task 2-3), Anthropic client จาก `@anthropic-ai/sdk` (`const Anthropic = require('@anthropic-ai/sdk'); new Anthropic({ apiKey })`)
- Produces:
  - `createBot({ replyText, parseMessage, logger? })` — ข้อความ text → `parseMessage` → `formatParseReply` → `replyText`; ถ้า parse พัง ตอบ `PARSE_FAILED_REPLY` และ log `Failed to parse message`
  - `PARSE_FAILED_REPLY: string` export จาก `src/bot.js`
  - `loadConfig(env)` คืนเพิ่ม `anthropicApiKey: string`, `claudeModel: string` (default `'claude-haiku-4-5'`) และ `ANTHROPIC_API_KEY` กลายเป็น required

**Manual check (ผู้ใช้เป็นคนทำ):**
- Preconditions: ใส่ `ANTHROPIC_API_KEY` ใน `.env` แล้ว, `npm start` รันอยู่ที่ port 3000, `ngrok http 3000` รันอยู่ และ Webhook URL ใน LINE Developers Console ชี้ไปที่ URL ngrok ปัจจุบัน
- ทุกข้อที่ส่งถึง Claude มีค่าใช้จ่าย API เล็กน้อย

| # | Action | Expected |
|---|---|---|
| 1 | PowerShell: `npm run try-parse -- "กินข้าว 60 กาแฟ 45"` | JSON มี `"status": "ok"` และ `items` 2 รายการ type `expense` amount `60` และ `45` |
| 2 | `npm run try-parse -- "เงินเดือนเข้า 25000"` | 1 รายการ type `income` category `เงินเดือน` amount `25000` |
| 3 | `npm run try-parse -- "เมื่อวานค่าแท็กซี่ 120"` | `date` เป็นวันที่ของเมื่อวาน (ตามเวลาไทย) category `เดินทาง` |
| 4 | `npm run try-parse -- "ซื้อของ"` | `"status": "clarify"` และมี `question` เป็นภาษาไทย |
| 5 | ในแอป LINE ส่ง `กินข้าว 60 กาแฟ 45` | บอทตอบ `แยกรายการได้ดังนี้ (ยังไม่บันทึก)` ตามด้วย 2 บรรทัดที่เป็นรายจ่ายหมวดอาหาร 60 บาท และ 45 บาท |
| 6 | ในแอป LINE ส่ง `ซื้อของ` | บอทตอบเป็นคำถามสั้นๆ ภาษาไทย |
| 7 | หยุด `npm start` ใส่ `ANTHROPIC_API_KEY=wrong` ใน `.env` แล้ว `npm start` ใหม่ ส่ง `กินข้าว 60` | บอทตอบ `ขออภัย ระบบอ่านข้อความไม่สำเร็จ ...` และ terminal มี log `Failed to parse message` (ทดสอบเสร็จให้ใส่ key จริงคืน) |

- [ ] **Step 1: Write the failing tests**

`src/config.test.js` — แทนที่ทั้งไฟล์เป็น:

```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
  ANTHROPIC_API_KEY: 'sk-ant-test',
};

describe('loadConfig', () => {
  it('returns LINE and Claude settings from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000', CLAUDE_MODEL: 'claude-sonnet-5-5' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
      anthropicApiKey: 'sk-ant-test',
      claudeModel: 'claude-sonnet-5-5',
    });
  });

  it('defaults port to 3000 and model to claude-haiku-4-5', () => {
    const config = loadConfig(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.claudeModel).toBe('claude-haiku-4-5');
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY'
    );
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, ANTHROPIC_API_KEY: '' })).toThrow(
      'Missing environment variables: ANTHROPIC_API_KEY'
    );
  });
});
```

`src/bot.test.js` — แทนที่ทั้งไฟล์เป็น:

```js
import { describe, it, expect, vi } from 'vitest';
import { createBot, PARSE_FAILED_REPLY } from './bot.js';

function textEvent(text, replyToken = 'r1') {
  return { type: 'message', replyToken, message: { type: 'text', text } };
}

function setup({ parseMessage, replyText } = {}) {
  const deps = {
    replyText: replyText || vi.fn().mockResolvedValue(),
    parseMessage: parseMessage || vi.fn(),
    logger: { error: vi.fn() },
  };
  return { deps, bot: createBot(deps) };
}

describe('bot.handleEvent', () => {
  it('replies with formatted items when parse succeeds', async () => {
    const parseMessage = vi.fn().mockResolvedValue({
      status: 'ok',
      items: [{ type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' }],
    });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(parseMessage).toHaveBeenCalledWith('กินข้าว 60');
    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'แยกรายการได้ดังนี้ (ยังไม่บันทึก)\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว'
    );
  });

  it('replies with the clarification question', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'กี่บาท?' });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('ซื้อของ'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', 'กี่บาท?');
  });

  it('replies with fallback message and logs when parse fails', async () => {
    const parseMessage = vi.fn().mockRejectedValue(new Error('overloaded'));
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', PARSE_FAILED_REPLY);
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to parse message', expect.any(Error));
  });

  it('ignores sticker messages without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({ type: 'message', replyToken: 'r1', message: { type: 'sticker' } });

    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('ignores non-message events such as follow', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({ type: 'follow', replyToken: 'r1' });

    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot.handleEvents', () => {
  it('keeps processing other events when one reply fails and logs the failure', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'q' });
    const replyText = vi
      .fn()
      .mockRejectedValueOnce(new Error('reply failed'))
      .mockResolvedValueOnce();
    const { deps, bot } = setup({ parseMessage, replyText });

    await bot.handleEvents([textEvent('a', 'r1'), textEvent('b', 'r2')]);

    expect(replyText).toHaveBeenCalledWith('r2', 'q');
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to handle event', expect.any(Error));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/config.test.js src/bot.test.js`
Expected: FAIL — config ยังไม่คืน `anthropicApiKey` / `claudeModel` และ bot ยัง echo ข้อความเดิม (`PARSE_FAILED_REPLY` เป็น `undefined`)

- [ ] **Step 3: Update `src/config.js`**

```js
const REQUIRED_KEYS = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'ANTHROPIC_API_KEY'];
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5';

function loadConfig(env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(env.PORT) || 3000,
    lineChannelSecret: env.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeModel: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
  };
}

module.exports = { loadConfig };
```

- [ ] **Step 4: Update `src/bot.js`**

```js
const { formatParseReply } = require('./parser/format-reply');

const PARSE_FAILED_REPLY = 'ขออภัย ระบบอ่านข้อความไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง เช่น "กินข้าว 60"';

function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function createBot({ replyText, parseMessage, logger = console }) {
  async function buildReply(text) {
    try {
      const result = await parseMessage(text);
      return formatParseReply(result);
    } catch (err) {
      logger.error('Failed to parse message', err);
      return PARSE_FAILED_REPLY;
    }
  }

  async function handleEvent(event) {
    if (!isTextMessage(event)) {
      return;
    }
    const reply = await buildReply(event.message.text);
    await replyText(event.replyToken, reply);
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อไม่ให้ event ที่พังหนึ่งอันทำให้ event อื่นไม่ถูกตอบ
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = { createBot, PARSE_FAILED_REPLY };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/config.test.js src/bot.test.js`
Expected: PASS 10 tests

- [ ] **Step 6: Update `index.js`, `.env.example`, `package.json` และสร้าง `scripts/try-parse.js`**

`index.js` — แทนที่ทั้งไฟล์เป็น:

```js
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { messagingApi } = require('@line/bot-sdk');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText } = require('./src/line-reply');
const { createMessageParser } = require('./src/parser/parse-message');

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
const parseMessage = createMessageParser({ client: anthropic, model: config.claudeModel });

const bot = createBot({ replyText: createReplyText(lineClient), parseMessage });
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
});

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
```

`.env.example` — แทนที่ทั้งไฟล์เป็น:

```
PORT=3000
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5
```

`scripts/try-parse.js`

```js
// สคริปต์ลองเรียก Claude จริงโดยไม่ต้องผ่าน LINE ใช้ปรับ prompt
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { loadConfig } = require('../src/config');
const { createMessageParser } = require('../src/parser/parse-message');

async function main() {
  const text = process.argv.slice(2).join(' ');
  if (!text) {
    console.error('Usage: npm run try-parse -- "<message>"');
    process.exitCode = 1;
    return;
  }

  const config = loadConfig(process.env);
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const parseMessage = createMessageParser({ client, model: config.claudeModel });

  const result = await parseMessage(text);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('try-parse failed', err);
  process.exitCode = 1;
});
```

`package.json` — แก้ส่วน `scripts` เป็น:

```json
  "scripts": {
    "start": "node index.js",
    "test": "vitest run",
    "try-parse": "node scripts/try-parse.js"
  },
```

- [ ] **Step 7: รันเทสต์ทั้งหมด**

Run: `npm test`
Expected: PASS ทุกไฟล์ (config 4, app 8, line-reply 2, bot 6, date 3, categories 5, parse-message 11, format-reply 4 = 43 tests)

- [ ] **Step 8: (ผู้ใช้) ใส่ API key**

1. เปิด https://platform.claude.com → Settings → API Keys → Create Key → คัดลอก key (ขึ้นต้น `sk-ant-`)
2. `notepad .env` เพิ่มบรรทัด `ANTHROPIC_API_KEY=<key>` และ `CLAUDE_MODEL=claude-haiku-4-5` แล้ว save
3. `git status` ต้องไม่เห็น `.env`

- [ ] **Step 9: (ผู้ใช้) ทำ Manual check ข้อ 1-7 ให้ผ่านทุกข้อ**

ถ้าข้อ 1-4 ได้ผลไม่ตรง ให้ปรับข้อความใน `buildSystemPrompt` แล้วรัน `npm run try-parse` ซ้ำ (ไม่ต้องแก้เทสต์ เพราะเทสต์ตรวจแค่ว่า prompt มีวันที่และหมวดหมู่)

- [ ] **Step 10: Commit**

```powershell
git add src/bot.js src/bot.test.js src/config.js src/config.test.js .env.example index.js package.json scripts/try-parse.js
git commit -m "feat: reply with Claude-parsed entries instead of echo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## ข้อจำกัดที่ตั้งใจเลื่อนไปขั้นถัดไป

- การถามกลับยังไม่จำบริบท: คำตอบของผู้ใช้หลังบอทถามจะถูกแยกเป็นข้อความใหม่ (ต้องมี state ใน DB — ขั้นที่ 3)
- Quick Reply "ยกเลิก/แก้ไข" ต้องมีรายการที่บันทึกแล้วก่อน — ขั้นที่ 3
- หมวดหมู่ยังเป็นชุด default ในโค้ด — ขั้นที่ 3 ย้ายไปตาราง `categories` ต่อผู้ใช้
