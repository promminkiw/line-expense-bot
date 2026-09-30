# LIFF Transactions Page (Step 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำขั้นที่ 6 รอบแรก (6a) ของ `SPEC.md`: หน้าเว็บ LIFF ที่เปิดในแอป LINE แสดงรายการของผู้ใช้ตามเดือน แก้ไข (จำนวนเงิน หมวด วันที่ โน้ต) และลบรายการได้ โดย server ตรวจ LINE ID token ทุก request ส่วนกราฟและ CSV ทำในรอบ 6b

**Architecture:** Express ตัวเดิมให้บริการไฟล์ static ของหน้าเว็บที่ `/liff/` (HTML + JavaScript ธรรมดา ไม่มีขั้น build) และ JSON API ที่ `/api/*` หน้าเว็บใช้ LIFF SDK จาก CDN ของ LINE เพื่อ login แล้วส่ง ID token ใน header `Authorization: Bearer` ทุก request ฝั่ง server ส่ง token ไปตรวจที่ LINE (`/oauth2/v2.1/verify`) ได้ `sub` (LINE user id) แล้วแปลงเป็น user id ภายในด้วย `users.ensureUser` ทุก query กรองด้วย user id นั้น logic ที่เทสต์ได้แยกเป็นไฟล์เล็ก (ตรวจ token, ตรวจข้อมูล, router, จัดรูปฝั่งหน้าเว็บ, ตัวเรียก API ฝั่งหน้าเว็บ)

**Tech Stack:** Node.js 22 (CommonJS), Express 5.2.1, @supabase/supabase-js 2.117.2, LIFF SDK v2 (CDN `https://static.line-scdn.net/liff/edge/2/sdk.js`), LINE Login ID token verify API, Vitest 5.0.2

## Global Constraints

- ผู้ใช้ใช้ Windows; server เป็น CommonJS; ไฟล์เทสต์ใช้ `import`; ห้าม `vi.mock` กับ module ที่ถูก `require`; เทสต์วางคู่กับไฟล์
- ไฟล์ JavaScript ฝั่งหน้าเว็บอยู่ใน `public/liff/` เป็น ES module นามสกุล `.mjs` (เพราะโปรเจกต์เป็น CommonJS) และเทสต์คู่กันเป็น `*.test.mjs`
- ไม่เพิ่ม dependency ใหม่ใน `package.json`; หน้าเว็บโหลด LIFF SDK จาก CDN ของ LINE เท่านั้น
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม"; ชื่อตัวแปร/function/log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม agent อ่านหรือแก้ `.env`; ห้าม agent start/restart/kill server
- ความปลอดภัยตาม SPEC: หน้าเว็บส่ง LINE ID token ทุก request; server verify กับ LINE แล้วใช้ `sub` เป็น LINE user id; ทุก query ของ API กรองด้วย user id ของผู้ขอ; ไม่รับ user id จาก client
- API ตอบ JSON เสมอ: token ไม่มีหรือไม่ผ่าน → `401 {"error":"Unauthorized"}`; ข้อมูลผิด → `400 {"error": <ข้อความ>}`; ไม่พบหรือไม่ใช่ของผู้ขอ → `404 {"error":"Not found"}`; error อื่น → `500 {"error":"Internal error"}` และ log `API request failed`
- ข้อมูลที่แก้ได้: `amount` (number > 0, ≤ 10000000, ทศนิยมไม่เกิน 2 ตำแหน่ง), `categoryId` (ต้องเป็นหมวดของผู้ขอ), `occurredOn` (วันที่ `YYYY-MM-DD` ที่มีจริง), `note` (string ยาวไม่เกิน 200 ตัว) — ประเภทรายรับ/รายจ่ายเปลี่ยนตามหมวดที่เลือกเสมอ
- เดือนใน API เป็น `YYYY-MM`; ค่าเริ่มต้นในหน้าเว็บคือเดือนปัจจุบันตามเวลาไทย
- หน้าเว็บใส่ข้อความจากข้อมูลผู้ใช้ด้วย `textContent` เท่านั้น ห้าม `innerHTML` กับข้อมูลผู้ใช้
- env ใหม่: `LIFF_ID`, `LINE_LOGIN_CHANNEL_ID` (ผู้ใช้เพิ่มเองใน `.env`)
- ngrok ของผู้ใช้มี URL คงที่ ใช้เป็น LIFF Endpoint URL ได้ครั้งเดียว ไม่ต้องบอกให้แก้ Webhook URL ซ้ำ
- ขั้นสุดท้ายของแผน: อัปเดต `work-memory/STATE.md` (controller ทำ)
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `src/config.js`, `.env.example` | env `LIFF_ID`, `LINE_LOGIN_CHANNEL_ID` | 1 |
| `src/api/verify-id-token.js` | ตรวจ LINE ID token กับ LINE คืน LINE user id | 2 |
| `src/api/validate.js` | ตรวจเดือนและข้อมูลที่แก้ | 3 |
| `src/db/repository.js` | list/update/delete รายการ, list หมวด | 4 |
| `src/api/router.js` | Express router ของ `/api` พร้อมตรวจ token | 5 |
| `public/liff/index.html`, `style.css`, `format.mjs`, `api.mjs`, `app.mjs` | หน้าเว็บ LIFF | 6 |
| `src/app.js`, `index.js` | เสิร์ฟ `/liff/` และต่อ `/api` | 7 |
| `src/menu/fixed-replies.js`, `src/bot.js`, `index.js` | ข้อความ `เปิดเว็บ` ตอบเป็นลิงก์ LIFF | 8 |

## Dependency Graph

- Task 1, 2, 3, 4, 6 ทำขนานกันได้
- Task 5 รอ Task 2, 3, 4
- Task 7 รอ Task 1, 5, 6 (แตะ `index.js`)
- Task 8 รอ Task 7 (แตะ `index.js` ต่อจาก Task 7)
- Task 9 (ผู้ใช้ตั้งค่า LINE + ตรวจด้วยมือ) รอทุก task

---

### Task 1: Config ของ LIFF

**Depends on:** none

**Files:**
- Modify: `src/config.js`
- Modify: `.env.example`
- Test: `src/config.test.js`

**Interfaces:**
- Produces: `loadConfig(env)` คืน field เพิ่ม `liffId: string`, `lineLoginChannelId: string`; ขาด key ไหน throw `Missing environment variables: ...` ตามลำดับ `REQUIRED_KEYS`

- [ ] **Step 1: Write the failing test**

แทนที่ทั้งไฟล์ `src/config.test.js`

```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
  LIFF_ID: '1234567890-AbCdEfGh',
  LINE_LOGIN_CHANNEL_ID: '1234567890',
};

describe('loadConfig', () => {
  it('returns LINE, Claude, Supabase and LIFF settings from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000', CLAUDE_MODEL: 'claude-sonnet-5-5' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
      anthropicApiKey: 'sk-ant-test',
      claudeModel: 'claude-sonnet-5-5',
      supabaseUrl: 'https://abc.supabase.co',
      supabaseServiceRoleKey: 'sb_secret_test',
      liffId: '1234567890-AbCdEfGh',
      lineLoginChannelId: '1234567890',
    });
  });

  it('defaults port to 3000 and model to claude-haiku-4-5', () => {
    const config = loadConfig(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.claudeModel).toBe('claude-haiku-4-5');
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFF_ID, LINE_LOGIN_CHANNEL_ID'
    );
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, LINE_LOGIN_CHANNEL_ID: '' })).toThrow(
      'Missing environment variables: LINE_LOGIN_CHANNEL_ID'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.js`
Expected: FAIL 3 tests (ไม่มี `liffId`, ข้อความ missing ไม่มี 2 key ใหม่, ค่าว่างของ `LINE_LOGIN_CHANNEL_ID` ไม่ throw)

- [ ] **Step 3: Write minimal implementation**

แทนที่ทั้งไฟล์ `src/config.js`

```js
const REQUIRED_KEYS = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'LIFF_ID',
  'LINE_LOGIN_CHANNEL_ID',
];
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
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    liffId: env.LIFF_ID,
    lineLoginChannelId: env.LINE_LOGIN_CHANNEL_ID,
  };
}

module.exports = { loadConfig };
```

แทนที่ทั้งไฟล์ `.env.example`

```
PORT=3000
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
LIFF_ID=
LINE_LOGIN_CHANNEL_ID=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.js`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/config.js src/config.test.js .env.example
git commit -m "feat: add LIFF config keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: ตรวจ LINE ID token

**Depends on:** none

**Files:**
- Create: `src/api/verify-id-token.js`
- Test: `src/api/verify-id-token.test.js`

**Interfaces:**
- Produces:
  - `class AuthError extends Error` (`name = 'AuthError'`)
  - `createIdTokenVerifier({ channelId: string, fetchImpl?: typeof fetch }) => (idToken: string) => Promise<string>` — คืน LINE user id (`sub`); throw `AuthError` เมื่อไม่มี token, LINE ตอบไม่ ok หรือไม่มี `sub`; error เครือข่ายส่งต่อตามเดิม (ไม่ใช่ AuthError)
  - request: `POST https://api.line.me/oauth2/v2.1/verify`, header `Content-Type: application/x-www-form-urlencoded`, body `id_token=<token>&client_id=<channelId>`, `signal` จาก `AbortSignal.timeout(5000)`

- [ ] **Step 1: Write the failing test**

`src/api/verify-id-token.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createIdTokenVerifier, AuthError } from './verify-id-token.js';

function fakeFetch(status, payload) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => payload });
}

describe('createIdTokenVerifier', () => {
  it('posts the token to LINE and returns the LINE user id', async () => {
    const fetchImpl = fakeFetch(200, { sub: 'U123', aud: '1234567890' });
    const verify = createIdTokenVerifier({ channelId: '1234567890', fetchImpl });

    expect(await verify('token-abc')).toBe('U123');

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.line.me/oauth2/v2.1/verify');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(new URLSearchParams(options.body).get('id_token')).toBe('token-abc');
    expect(new URLSearchParams(options.body).get('client_id')).toBe('1234567890');
    expect(options.signal).toEqual(expect.any(AbortSignal));
  });

  it('rejects a missing token without calling LINE', async () => {
    const fetchImpl = fakeFetch(200, { sub: 'U123' });
    const verify = createIdTokenVerifier({ channelId: '1', fetchImpl });

    await expect(verify('')).rejects.toBeInstanceOf(AuthError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a token LINE does not accept', async () => {
    const verify = createIdTokenVerifier({
      channelId: '1',
      fetchImpl: fakeFetch(400, { error: 'invalid_request', error_description: 'IdToken expired.' }),
    });

    await expect(verify('expired')).rejects.toThrow('ID token rejected with status 400');
  });

  it('rejects a response without a subject', async () => {
    const verify = createIdTokenVerifier({ channelId: '1', fetchImpl: fakeFetch(200, {}) });

    await expect(verify('token')).rejects.toBeInstanceOf(AuthError);
  });

  it('passes network errors through as they are', async () => {
    const verify = createIdTokenVerifier({
      channelId: '1',
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('fetch failed')),
    });

    const promise = verify('token');
    await expect(promise).rejects.toThrow('fetch failed');
    await expect(promise).rejects.not.toBeInstanceOf(AuthError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/verify-id-token.test.js`
Expected: FAIL เพราะหา `./verify-id-token.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/api/verify-id-token.js`

```js
const VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify';
// ให้ LINE ตรวจลายเซ็นและวันหมดอายุแทน จึงไม่ต้องดูแล key เอง แต่จำกัดเวลารอไว้
const VERIFY_TIMEOUT_MS = 5000;

class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthError';
  }
}

function createIdTokenVerifier({ channelId, fetchImpl = fetch }) {
  return async function verifyIdToken(idToken) {
    if (!idToken) {
      throw new AuthError('Missing ID token');
    }
    const response = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }).toString(),
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new AuthError(`ID token rejected with status ${response.status}`);
    }
    const payload = await response.json();
    if (!payload.sub) {
      throw new AuthError('ID token has no subject');
    }
    return payload.sub;
  };
}

module.exports = { createIdTokenVerifier, AuthError };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/verify-id-token.test.js`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/api/verify-id-token.js src/api/verify-id-token.test.js
git commit -m "feat: verify LINE ID tokens for the web API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ตรวจเดือนและข้อมูลที่แก้

**Depends on:** none

**Files:**
- Create: `src/api/validate.js`
- Test: `src/api/validate.test.js`

**Interfaces:**
- Consumes: `MAX_AMOUNT` (10000000) จาก `src/parser/parse-message.js` (มีอยู่แล้ว)
- Produces:
  - `parseMonth(value: string | undefined) => { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } | null`
  - `validateTransactionUpdate(body) => { ok: true, value: { amount, categoryId, occurredOn, note } } | { ok: false, error: string }` — `note` ถูก trim; ข้อความ error คือ `Invalid body`, `Invalid amount`, `Invalid category`, `Invalid date`, `Invalid note`

- [ ] **Step 1: Write the failing test**

`src/api/validate.test.js`

```js
import { describe, it, expect } from 'vitest';
import { parseMonth, validateTransactionUpdate } from './validate.js';

const VALID = { amount: 60, categoryId: 'cat-1', occurredOn: '2026-09-29', note: ' กินข้าว ' };

describe('parseMonth', () => {
  it('returns the first and last day of the month', () => {
    expect(parseMonth('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(parseMonth('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('knows February in leap and normal years', () => {
    expect(parseMonth('2028-02').to).toBe('2028-02-29');
    expect(parseMonth('2026-02').to).toBe('2026-02-28');
  });

  it('rejects anything that is not YYYY-MM', () => {
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026-9')).toBeNull();
    expect(parseMonth('')).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });
});

describe('validateTransactionUpdate', () => {
  it('accepts a valid update and trims the note', () => {
    expect(validateTransactionUpdate(VALID)).toEqual({
      ok: true,
      value: { amount: 60, categoryId: 'cat-1', occurredOn: '2026-09-29', note: 'กินข้าว' },
    });
  });

  it('accepts the smallest and largest amounts', () => {
    expect(validateTransactionUpdate({ ...VALID, amount: 0.01 }).ok).toBe(true);
    expect(validateTransactionUpdate({ ...VALID, amount: 10000000 }).ok).toBe(true);
  });

  it('rejects amounts that are not positive, too large, not numbers or finer than satang', () => {
    for (const amount of [0, -5, 10000000.01, '60', Number.NaN, 1.005]) {
      expect(validateTransactionUpdate({ ...VALID, amount })).toEqual({ ok: false, error: 'Invalid amount' });
    }
  });

  it('rejects a missing category', () => {
    expect(validateTransactionUpdate({ ...VALID, categoryId: '' })).toEqual({ ok: false, error: 'Invalid category' });
  });

  it('rejects dates that are malformed or do not exist', () => {
    for (const occurredOn of ['2026-9-1', '2026-02-30', '', undefined]) {
      expect(validateTransactionUpdate({ ...VALID, occurredOn })).toEqual({ ok: false, error: 'Invalid date' });
    }
  });

  it('rejects notes that are not strings or longer than 200 characters', () => {
    expect(validateTransactionUpdate({ ...VALID, note: 5 })).toEqual({ ok: false, error: 'Invalid note' });
    expect(validateTransactionUpdate({ ...VALID, note: 'ก'.repeat(201) })).toEqual({ ok: false, error: 'Invalid note' });
  });

  it('rejects a body that is not an object', () => {
    expect(validateTransactionUpdate(null)).toEqual({ ok: false, error: 'Invalid body' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/validate.test.js`
Expected: FAIL เพราะหา `./validate.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/api/validate.js`

```js
const { MAX_AMOUNT } = require('../parser/parse-message');

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NOTE_LENGTH = 200;

function parseMonth(value) {
  const match = MONTH_PATTERN.exec(value || '');
  if (!match) {
    return null;
  }
  // วันที่ 0 ของเดือนถัดไปคือวันสุดท้ายของเดือนที่ต้องการ
  const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
  return { from: `${match[1]}-${match[2]}-01`, to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}` };
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidAmount(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return false;
  }
  // คอลัมน์ numeric(12,2) เก็บได้แค่สตางค์ จึงไม่รับทศนิยมละเอียดกว่านั้น
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
}

function validateTransactionUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const { amount, categoryId, occurredOn, note } = body;
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'Invalid amount' };
  }
  if (typeof categoryId !== 'string' || categoryId.length === 0) {
    return { ok: false, error: 'Invalid category' };
  }
  if (!isCalendarDate(occurredOn)) {
    return { ok: false, error: 'Invalid date' };
  }
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'Invalid note' };
  }
  return { ok: true, value: { amount, categoryId, occurredOn, note: note.trim() } };
}

module.exports = { parseMonth, validateTransactionUpdate };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/validate.test.js`
Expected: PASS 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/api/validate.js src/api/validate.test.js
git commit -m "feat: validate month and transaction updates for the web API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Repository สำหรับหน้าเว็บ

**Depends on:** none

**Files:**
- Modify: `src/db/repository.js`
- Test: `src/db/repository.test.js`

**Interfaces:**
- Produces (เพิ่มใน object ที่ `createRepository` คืน, throw `DatabaseError` เมื่อ Supabase คืน `error`):
  - `listTransactions(userId, from, to) => Promise<Array<{ id, type, amount: number, note, occurredOn, categoryId }>>` เรียงวันที่ใหม่ก่อน แล้ว `created_at` ใหม่ก่อน
  - `listCategories(userId) => Promise<Array<{ id, name, type }>>` เรียงตาม type แล้ว name
  - `updateTransaction(userId, id, { type, amount, categoryId, occurredOn, note }) => Promise<boolean>` (`true` ถ้ามีแถวถูกแก้)
  - `deleteTransaction(userId, id) => Promise<boolean>` (`true` ถ้ามีแถวถูกลบ)

- [ ] **Step 1: Write the failing test**

ใน `src/db/repository.test.js` แก้บรรทัดรายการ method ของ `fakeSupabase` จาก

```js
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete']) {
```

เป็น

```js
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete', 'update', 'gte', 'lte', 'order']) {
```

แล้วเพิ่ม describe เหล่านี้ท้ายไฟล์

```js
describe('repository.listTransactions', () => {
  it('reads this user rows in the date range, newest first', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-09-29', category_id: 'c1' }],
      error: null,
    });

    const rows = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows).toEqual([
      { id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c1' },
    ]);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id'],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'occurred_on', '2026-09-01'],
      ['lte', 'occurred_on', '2026-09-30'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).listTransactions('user-1', 'a', 'b')).rejects.toThrow(
      'Database listTransactions failed: boom'
    );
  });
});

describe('repository.listCategories', () => {
  it('reads this user categories ordered by type and name', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 'c1', name: 'อาหาร', type: 'expense' }],
      error: null,
    });

    expect(await createRepository(supabase).listCategories('user-1')).toEqual([
      { id: 'c1', name: 'อาหาร', type: 'expense' },
    ]);
    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, name, type'],
      ['eq', 'user_id', 'user-1'],
      ['order', 'type'],
      ['order', 'name'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).listCategories('user-1')).rejects.toThrow(
      'Database listCategories failed: boom'
    );
  });
});

describe('repository.updateTransaction', () => {
  const fields = { type: 'income', amount: 25000, categoryId: 'c9', occurredOn: '2026-09-01', note: 'เงินเดือน' };

  it('updates only this user row and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 't1' }], error: null });

    expect(await createRepository(supabase).updateTransaction('user-1', 't1', fields)).toBe(true);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['update', { type: 'income', amount: 25000, category_id: 'c9', occurred_on: '2026-09-01', note: 'เงินเดือน' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 't1'],
      ['select', 'id'],
    ]);
  });

  it('returns false when no row matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).updateTransaction('user-1', 't1', fields)).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).updateTransaction('user-1', 't1', fields)).rejects.toThrow(
      'Database updateTransaction failed: boom'
    );
  });
});

describe('repository.deleteTransaction', () => {
  it('deletes only this user row and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteTransaction('user-1', 't1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 't1'],
    ]);
  });

  it('returns false when no row matched', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(supabase).deleteTransaction('user-1', 't1')).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ count: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).deleteTransaction('user-1', 't1')).rejects.toThrow(
      'Database deleteTransaction failed: boom'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL 10 tests ใหม่ (`... is not a function`); เทสต์เดิมยังผ่าน

- [ ] **Step 3: Write minimal implementation**

ใน `src/db/repository.js` เพิ่ม function เหล่านี้ก่อน `return {` ของ `createRepository`

```js
  async function listTransactions(userId, from, to) {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, type, amount, note, occurred_on, category_id')
      .eq('user_id', userId)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });
    throwIfError('listTransactions', error);
    return data.map((row) => ({
      id: row.id,
      type: row.type,
      amount: Number(row.amount),
      note: row.note,
      occurredOn: row.occurred_on,
      categoryId: row.category_id,
    }));
  }

  async function listCategories(userId) {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, type')
      .eq('user_id', userId)
      .order('type')
      .order('name');
    throwIfError('listCategories', error);
    return data.map((row) => ({ id: row.id, name: row.name, type: row.type }));
  }

  async function updateTransaction(userId, id, fields) {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        type: fields.type,
        amount: fields.amount,
        category_id: fields.categoryId,
        occurred_on: fields.occurredOn,
        note: fields.note,
      })
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    throwIfError('updateTransaction', error);
    return data.length > 0;
  }

  async function deleteTransaction(userId, id) {
    const { count, error } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    throwIfError('deleteTransaction', error);
    return count > 0;
  }
```

และเพิ่ม `listTransactions,` `listCategories,` `updateTransaction,` `deleteTransaction,` ใน object ที่ `createRepository` คืน

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: list, update and delete transactions for the web page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API router

**Depends on:** Task 2, Task 3, Task 4

**Files:**
- Create: `src/api/router.js`
- Test: `src/api/router.test.js`

**Interfaces:**
- Consumes: `AuthError` (Task 2), `parseMonth`, `validateTransactionUpdate` (Task 3), repository `listTransactions`, `listCategories`, `updateTransaction`, `deleteTransaction` (Task 4), `users.ensureUser(lineUserId) => userId` (มีอยู่แล้ว)
- Produces: `createApiRouter({ verifyIdToken, users, repository, liffId, logger? }) => express.Router` ที่มี
  - `GET /config` (ไม่ต้อง login) → `200 { liffId }`
  - ทุก route ด้านล่างต้องมี `Authorization: Bearer <idToken>`
  - `GET /categories` → `200 { categories: [{ id, name, type }] }`
  - `GET /transactions?month=YYYY-MM` → `200 { transactions: [{ id, type, amount, note, occurredOn, categoryId, categoryName }] }`
  - `PATCH /transactions/:id` body `{ amount, categoryId, occurredOn, note }` → `204`
  - `DELETE /transactions/:id` → `204`
  - router ต้องต่อหลัง `express.json()` (Task 7 ทำ)

- [ ] **Step 1: Write the failing test**

`src/api/router.test.js`

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createApiRouter } from './router.js';
import { AuthError } from './verify-id-token.js';

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
      listTransactions: vi.fn().mockResolvedValue([
        { id: ID, type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food' },
      ]),
      updateTransaction: vi.fn().mockResolvedValue(true),
      deleteTransaction: vi.fn().mockResolvedValue(true),
    },
    liffId: 'liff-123',
    logger: { error: vi.fn() },
    ...overrides,
  };
  return deps;
}

async function start(deps) {
  const app = express();
  app.use('/api', express.json(), createApiRouter(deps));
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
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
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
  it('returns the month entries with their category names', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-09');

    expect(res.status).toBe(200);
    expect(deps.repository.listTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(await res.json()).toEqual({
      transactions: [
        { id: ID, type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food', categoryName: 'อาหาร' },
      ],
    });
  });

  it('returns 400 for an invalid month', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-13');

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid month' });
    expect(deps.repository.listTransactions).not.toHaveBeenCalled();
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
  });
});

describe('DELETE /api/transactions/:id', () => {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api/router.test.js`
Expected: FAIL เพราะหา `./router.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/api/router.js`

```js
const express = require('express');
const { AuthError } = require('./verify-id-token');
const { parseMonth, validateTransactionUpdate } = require('./validate');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readBearerToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
}

function createApiRouter({ verifyIdToken, users, repository, liffId, logger = console }) {
  const router = express.Router();

  router.get('/config', (req, res) => {
    res.json({ liffId });
  });

  // ใช้ user id จาก token ที่ LINE ยืนยันเท่านั้น ไม่เชื่อค่าที่ client ส่งมา
  router.use(async (req, res, next) => {
    try {
      const lineUserId = await verifyIdToken(readBearerToken(req));
      req.userId = await users.ensureUser(lineUserId);
      next();
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next(err);
    }
  });

  router.get('/categories', async (req, res) => {
    res.json({ categories: await repository.listCategories(req.userId) });
  });

  router.get('/transactions', async (req, res) => {
    const range = parseMonth(req.query.month);
    if (!range) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const [transactions, categories] = await Promise.all([
      repository.listTransactions(req.userId, range.from, range.to),
      repository.listCategories(req.userId),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    res.json({
      transactions: transactions.map((item) => ({ ...item, categoryName: names.get(item.categoryId) || '' })),
    });
  });

  router.patch('/transactions/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateTransactionUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    // ประเภทรายรับ/รายจ่ายตามหมวดที่เลือก เพื่อไม่ให้ประเภทกับหมวดขัดกัน
    const updated = await repository.updateTransaction(req.userId, req.params.id, {
      ...result.value,
      type: category.type,
    });
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.delete('/transactions/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const deleted = await repository.deleteTransaction(req.userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.use((err, req, res, next) => {
    logger.error('API request failed', { path: req.path }, err);
    res.status(500).json({ error: 'Internal error' });
  });

  return router;
}

module.exports = { createApiRouter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/api/router.test.js`
Expected: PASS 15 tests

- [ ] **Step 5: Commit**

```bash
git add src/api/router.js src/api/router.test.js
git commit -m "feat: add authenticated JSON API for the LIFF page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: หน้าเว็บ LIFF

**Depends on:** none

**Files:**
- Create: `public/liff/index.html`
- Create: `public/liff/style.css`
- Create: `public/liff/format.mjs`
- Create: `public/liff/api.mjs`
- Create: `public/liff/app.mjs`
- Test: `public/liff/format.test.mjs`
- Test: `public/liff/api.test.mjs`

**Interfaces:**
- Consumes: API ตาม Task 5 (`/api/config`, `/api/categories`, `/api/transactions`, `PATCH`/`DELETE /api/transactions/:id`) และ global `liff` จาก LIFF SDK
- Produces:
  - `format.mjs`: `formatBaht(amount) => string`, `formatThaiDate('YYYY-MM-DD') => 'DD/MM'`, `currentMonth(now: Date) => 'YYYY-MM'` (เวลาไทย), `groupByDate(transactions) => Array<{ date, items }>` (รักษาลำดับเดิม), `totals(transactions) => { income, expense }` (รวมเป็นสตางค์), `groupCategoryOptions(categories) => { expense: [...], income: [...] }`
  - `api.mjs`: `class ApiError extends Error { status }`, `createApi({ fetchImpl, getIdToken }) => { listCategories(), listTransactions(month), updateTransaction(id, body), deleteTransaction(id) }`

- [ ] **Step 1: Write the failing tests**

`public/liff/format.test.mjs`

```js
import { describe, it, expect } from 'vitest';
import {
  formatBaht,
  formatThaiDate,
  currentMonth,
  groupByDate,
  totals,
  groupCategoryOptions,
} from './format.mjs';

describe('formatBaht', () => {
  it('adds separators and the currency word', () => {
    expect(formatBaht(25000)).toBe('25,000 บาท');
    expect(formatBaht(1250.5)).toBe('1,250.5 บาท');
  });
});

describe('formatThaiDate', () => {
  it('shows day and month', () => {
    expect(formatThaiDate('2026-09-05')).toBe('05/09');
  });
});

describe('currentMonth', () => {
  it('uses Bangkok time', () => {
    // 2026-09-30 18:00 UTC คือ 2026-10-01 01:00 เวลาไทย
    expect(currentMonth(new Date('2026-09-30T18:00:00Z'))).toBe('2026-10');
    expect(currentMonth(new Date('2026-09-30T10:00:00Z'))).toBe('2026-09');
  });
});

describe('groupByDate', () => {
  it('groups consecutive entries of the same day and keeps order', () => {
    const items = [
      { id: 'a', occurredOn: '2026-09-29' },
      { id: 'b', occurredOn: '2026-09-29' },
      { id: 'c', occurredOn: '2026-09-28' },
    ];

    expect(groupByDate(items)).toEqual([
      { date: '2026-09-29', items: [items[0], items[1]] },
      { date: '2026-09-28', items: [items[2]] },
    ]);
  });
});

describe('totals', () => {
  it('sums income and expense in satang', () => {
    expect(
      totals([
        { type: 'expense', amount: 0.1 },
        { type: 'expense', amount: 0.2 },
        { type: 'income', amount: 25000 },
      ])
    ).toEqual({ income: 25000, expense: 0.3 });
  });
});

describe('groupCategoryOptions', () => {
  it('splits categories by type', () => {
    const food = { id: 'c1', name: 'อาหาร', type: 'expense' };
    const salary = { id: 'c2', name: 'เงินเดือน', type: 'income' };

    expect(groupCategoryOptions([food, salary])).toEqual({ expense: [food], income: [salary] });
  });
});
```

`public/liff/api.test.mjs`

```js
import { describe, it, expect, vi } from 'vitest';
import { createApi, ApiError } from './api.mjs';

function fakeFetch(status, body) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function setup(fetchImpl) {
  return createApi({ fetchImpl, getIdToken: () => 'token-1' });
}

describe('createApi', () => {
  it('sends the ID token and reads JSON', async () => {
    const fetchImpl = fakeFetch(200, { categories: [] });

    expect(await setup(fetchImpl).listCategories()).toEqual({ categories: [] });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/categories');
    expect(options.headers.Authorization).toBe('Bearer token-1');
  });

  it('asks for one month of entries', async () => {
    const fetchImpl = fakeFetch(200, { transactions: [] });

    await setup(fetchImpl).listTransactions('2026-09');

    expect(fetchImpl.mock.calls[0][0]).toBe('/api/transactions?month=2026-09');
  });

  it('sends updates as JSON with PATCH and returns null on 204', async () => {
    const fetchImpl = fakeFetch(204, null);
    const body = { amount: 60, categoryId: 'c1', occurredOn: '2026-09-29', note: '' };

    expect(await setup(fetchImpl).updateTransaction('t1', body)).toBeNull();
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/transactions/t1');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(options.body)).toEqual(body);
  });

  it('deletes with DELETE', async () => {
    const fetchImpl = fakeFetch(204, null);

    await setup(fetchImpl).deleteTransaction('t1');

    expect(fetchImpl.mock.calls[0][1].method).toBe('DELETE');
  });

  it('throws ApiError with the status when the server refuses', async () => {
    const promise = setup(fakeFetch(401, { error: 'Unauthorized' })).listCategories();

    await expect(promise).rejects.toBeInstanceOf(ApiError);
    await expect(promise).rejects.toMatchObject({ status: 401 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run public/liff`
Expected: FAIL เพราะหา `./format.mjs` และ `./api.mjs` ไม่เจอ

- [ ] **Step 3: Write the page**

`public/liff/format.mjs`

```js
export function formatBaht(amount) {
  return `${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} บาท`;
}

export function formatThaiDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

export function currentMonth(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get('year')}-${get('month')}`;
}

export function groupByDate(transactions) {
  const groups = [];
  for (const item of transactions) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.occurredOn) {
      last.items.push(item);
    } else {
      groups.push({ date: item.occurredOn, items: [item] });
    }
  }
  return groups;
}

// รวมเป็นสตางค์เพื่อไม่ให้ทศนิยมของ JavaScript คลาดเคลื่อน
export function totals(transactions) {
  let income = 0;
  let expense = 0;
  for (const item of transactions) {
    const satang = Math.round(item.amount * 100);
    if (item.type === 'income') {
      income += satang;
    } else {
      expense += satang;
    }
  }
  return { income: income / 100, expense: expense / 100 };
}

export function groupCategoryOptions(categories) {
  return {
    expense: categories.filter((category) => category.type === 'expense'),
    income: categories.filter((category) => category.type === 'income'),
  };
}
```

`public/liff/api.mjs`

```js
export class ApiError extends Error {
  constructor(status) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function createApi({ fetchImpl, getIdToken }) {
  async function request(path, options = {}) {
    const response = await fetchImpl(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getIdToken()}` },
    });
    if (!response.ok) {
      throw new ApiError(response.status);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    listCategories: () => request('/categories'),
    listTransactions: (month) => request(`/transactions?month=${encodeURIComponent(month)}`),
    updateTransaction: (id, body) =>
      request(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteTransaction: (id) => request(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}
```

`public/liff/index.html`

```html
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>รายการรายรับรายจ่าย</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main id="app">
    <header class="bar">
      <h1>รายการของฉัน</h1>
      <input type="month" id="month" aria-label="เลือกเดือน">
    </header>
    <p id="totals" class="totals" hidden></p>
    <p id="status" class="status">กำลังโหลด...</p>
    <ul id="list" class="list"></ul>
  </main>
  <dialog id="editor">
    <form id="edit-form">
      <h2>แก้ไขรายการ</h2>
      <label>จำนวนเงิน (บาท)
        <input id="edit-amount" type="number" inputmode="decimal" step="0.01" min="0.01" max="10000000" required>
      </label>
      <label>หมวด
        <select id="edit-category" required></select>
      </label>
      <label>วันที่
        <input id="edit-date" type="date" required>
      </label>
      <label>โน้ต
        <input id="edit-note" type="text" maxlength="200">
      </label>
      <p id="edit-error" class="error" hidden></p>
      <div class="actions">
        <button type="button" id="delete-button" class="danger">ลบ</button>
        <button type="button" id="cancel-button">ปิด</button>
        <button type="submit" class="primary">บันทึก</button>
      </div>
    </form>
  </dialog>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script type="module" src="app.mjs"></script>
</body>
</html>
```

`public/liff/style.css`

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, "Leelawadee UI", Tahoma, sans-serif; background: #f5f5f5; color: #222; }
.bar { position: sticky; top: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #ddd; }
.bar h1 { margin: 0; font-size: 18px; }
.totals { margin: 12px 16px 0; font-size: 14px; color: #555; }
.status { margin: 16px; color: #666; }
.list { list-style: none; margin: 0; padding: 0 16px 24px; }
.day { margin-top: 16px; font-size: 13px; color: #888; }
.row { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; padding: 12px; background: #fff; border-radius: 8px; cursor: pointer; }
.row .amount { white-space: nowrap; font-weight: 600; }
.row.expense .amount { color: #e53935; }
.row.income .amount { color: #1db446; }
dialog { width: min(92vw, 420px); border: none; border-radius: 12px; padding: 20px; }
dialog label { display: block; margin-top: 12px; font-size: 14px; }
dialog input, dialog select { display: block; width: 100%; margin-top: 4px; padding: 10px; font-size: 16px; }
.error { color: #e53935; font-size: 14px; }
.actions { display: flex; gap: 8px; margin-top: 20px; }
.actions button { flex: 1; padding: 10px; font-size: 16px; border-radius: 8px; border: 1px solid #ccc; background: #fff; }
.actions .primary { background: #1db446; border-color: #1db446; color: #fff; }
.actions .danger { color: #e53935; border-color: #e53935; }
```

`public/liff/app.mjs`

```js
import { createApi, ApiError } from './api.mjs';
import {
  formatBaht,
  formatThaiDate,
  currentMonth,
  groupByDate,
  totals,
  groupCategoryOptions,
} from './format.mjs';

const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

const els = {
  month: document.getElementById('month'),
  totals: document.getElementById('totals'),
  status: document.getElementById('status'),
  list: document.getElementById('list'),
  editor: document.getElementById('editor'),
  form: document.getElementById('edit-form'),
  amount: document.getElementById('edit-amount'),
  category: document.getElementById('edit-category'),
  date: document.getElementById('edit-date'),
  note: document.getElementById('edit-note'),
  error: document.getElementById('edit-error'),
  deleteButton: document.getElementById('delete-button'),
  cancelButton: document.getElementById('cancel-button'),
};

let api;
let categories = [];
let editing = null;
let confirmDelete = false;

function setStatus(text) {
  els.status.textContent = text;
  els.status.hidden = !text;
}

function showLoadError(err) {
  setStatus(
    err instanceof ApiError && err.status === 401
      ? 'กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง'
      : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'
  );
}

function fillCategoryOptions() {
  const groups = groupCategoryOptions(categories);
  els.category.replaceChildren();
  for (const type of ['expense', 'income']) {
    const group = document.createElement('optgroup');
    group.label = TYPE_LABELS[type];
    for (const category of groups[type]) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      group.append(option);
    }
    els.category.append(group);
  }
}

// ใช้ textContent ทุกจุดเพราะโน้ตมาจากข้อความที่ผู้ใช้พิมพ์
function renderRow(item) {
  const row = document.createElement('li');
  row.className = `row ${item.type}`;
  const label = document.createElement('span');
  label.textContent = item.note ? `${item.categoryName} · ${item.note}` : item.categoryName;
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = `${item.type === 'income' ? '+' : '-'}${formatBaht(item.amount)}`;
  row.append(label, amount);
  row.addEventListener('click', () => openEditor(item));
  return row;
}

function render(transactions) {
  const sum = totals(transactions);
  els.totals.textContent = `รายรับ ${formatBaht(sum.income)} · รายจ่าย ${formatBaht(sum.expense)}`;
  els.totals.hidden = false;
  els.list.replaceChildren();
  if (transactions.length === 0) {
    setStatus('ยังไม่มีรายการในเดือนนี้');
    return;
  }
  setStatus('');
  for (const group of groupByDate(transactions)) {
    const heading = document.createElement('li');
    heading.className = 'day';
    heading.textContent = formatThaiDate(group.date);
    els.list.append(heading);
    for (const item of group.items) {
      els.list.append(renderRow(item));
    }
  }
}

async function loadMonth() {
  setStatus('กำลังโหลด...');
  const { transactions } = await api.listTransactions(els.month.value);
  render(transactions);
}

function openEditor(item) {
  editing = item;
  confirmDelete = false;
  els.deleteButton.textContent = 'ลบ';
  els.amount.value = String(item.amount);
  els.category.value = item.categoryId;
  els.date.value = item.occurredOn;
  els.note.value = item.note || '';
  els.error.hidden = true;
  els.editor.showModal();
}

async function runEdit(action) {
  try {
    await action();
    els.editor.close();
    await loadMonth();
  } catch (err) {
    els.error.textContent =
      err instanceof ApiError && err.status === 400
        ? 'ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่อีกครั้ง'
        : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
    els.error.hidden = false;
  }
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  runEdit(() =>
    api.updateTransaction(editing.id, {
      amount: Number(els.amount.value),
      categoryId: els.category.value,
      occurredOn: els.date.value,
      note: els.note.value,
    })
  );
});

// กดสองครั้งเพื่อลบ กันการลบโดยไม่ตั้งใจโดยไม่ต้องใช้ confirm ของเบราว์เซอร์
els.deleteButton.addEventListener('click', () => {
  if (!confirmDelete) {
    confirmDelete = true;
    els.deleteButton.textContent = 'ยืนยันลบ';
    return;
  }
  runEdit(() => api.deleteTransaction(editing.id));
});

els.cancelButton.addEventListener('click', () => els.editor.close());
els.month.addEventListener('change', () => loadMonth().catch(showLoadError));

async function boot() {
  try {
    const config = await (await fetch('/api/config')).json();
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) {
      liff.login();
      return;
    }
    api = createApi({ fetchImpl: (...args) => fetch(...args), getIdToken: () => liff.getIDToken() });
    els.month.value = currentMonth(new Date());
    ({ categories } = await api.listCategories());
    fillCategoryOptions();
    await loadMonth();
  } catch (err) {
    showLoadError(err);
  }
}

boot();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run public/liff`
Expected: PASS 11 tests ใน 2 ไฟล์

- [ ] **Step 5: Commit**

```bash
git add public/liff
git commit -m "feat: add LIFF page to view, edit and delete entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: เสิร์ฟหน้าเว็บและต่อ API

**Depends on:** Task 1, Task 5, Task 6

**Files:**
- Modify: `src/app.js`
- Modify: `index.js`
- Test: `src/app.test.js`

**Interfaces:**
- Consumes: `createApiRouter` (Task 5), `createIdTokenVerifier` (Task 2), `config.liffId`, `config.lineLoginChannelId` (Task 1), ไฟล์ใน `public/liff/` (Task 6)
- Produces: `createApp({ channelSecret, handleEvents, apiRouter?, logger? })` เสิร์ฟ `public/liff/` ที่ `/liff/` และถ้ามี `apiRouter` จะต่อที่ `/api` หลัง `express.json({ limit: '10kb' })`

- [ ] **Step 1: Write the failing tests**

ใน `src/app.test.js` แก้ function `start` ให้รับ option ของ `apiRouter`

```js
async function start(handleEvents, logger = { error: vi.fn() }, apiRouter) {
  const app = createApp({ channelSecret: SECRET, handleEvents, logger, apiRouter });
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}`;
}
```

เพิ่ม import ด้านบน

```js
import express from 'express';
```

แล้วเพิ่ม describe เหล่านี้ท้ายไฟล์

```js
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
});

describe('/api', () => {
  it('passes parsed JSON bodies to the API router', async () => {
    const apiRouter = express.Router();
    apiRouter.post('/echo', (req, res) => res.json(req.body));
    const baseUrl = await start(vi.fn(), { error: vi.fn() }, apiRouter);

    const res = await fetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 }),
    });

    expect(await res.json()).toEqual({ a: 1 });
  });

  it('rejects JSON bodies larger than 10kb', async () => {
    const apiRouter = express.Router();
    apiRouter.post('/echo', (req, res) => res.json(req.body));
    const baseUrl = await start(vi.fn(), { error: vi.fn() }, apiRouter);

    const res = await fetch(`${baseUrl}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'x'.repeat(11 * 1024) }),
    });

    expect(res.status).toBe(413);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app.test.js`
Expected: FAIL 4 tests ใหม่ (404 ที่ `/liff/` และ `/api/echo`); เทสต์เดิมยังผ่าน

- [ ] **Step 3: Write minimal implementation**

ใน `src/app.js` เพิ่มบรรทัดนี้ใต้ require ของ `@line/bot-sdk`

```js
const path = require('node:path');

const LIFF_DIR = path.join(__dirname, '..', 'public', 'liff');
```

แก้ parameter ของ `createApp` เป็น

```js
function createApp({ channelSecret, handleEvents, apiRouter, logger = console }) {
```

และเพิ่มบล็อกนี้ต่อจาก route `GET /health`

```js
  app.use('/liff', express.static(LIFF_DIR));

  if (apiRouter) {
    app.use('/api', express.json({ limit: '10kb' }), apiRouter);
  }
```

ใน `index.js` เพิ่ม require ต่อจาก require ของ `./src/summary/comment`

```js
const { createIdTokenVerifier } = require('./src/api/verify-id-token');
const { createApiRouter } = require('./src/api/router');
```

แก้การสร้าง `app` ให้เป็น

```js
const apiRouter = createApiRouter({
  verifyIdToken: createIdTokenVerifier({ channelId: config.lineLoginChannelId }),
  users,
  repository,
  liffId: config.liffId,
});
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
  apiRouter,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

Run: `node --check index.js`
Expected: ไม่มี output

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS ทุกไฟล์ (24 ไฟล์เทสต์)

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/app.test.js index.js
git commit -m "feat: serve the LIFF page and mount the web API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ข้อความ "เปิดเว็บ" ตอบเป็นลิงก์ LIFF

**Depends on:** Task 7

**Files:**
- Modify: `src/menu/fixed-replies.js`
- Modify: `src/bot.js`
- Modify: `index.js`
- Test: `src/menu/fixed-replies.test.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Produces:
  - `getFixedReply(text, { liffUrl } = {}) => string | null` — `เปิดเว็บ` คืน `buildWebReply(liffUrl)` ถ้ามี `liffUrl` ไม่งั้นคืน `WEB_COMING_SOON_REPLY`; `ช่วยเหลือ` เหมือนเดิม
  - `buildWebReply(liffUrl) => 'เปิดหน้าเว็บดูและแก้ไขรายการ: ' + liffUrl`
  - `createBot({ ..., liffUrl? })` ส่ง `liffUrl` ให้ `getFixedReply`
  - `index.js` ส่ง `liffUrl: 'https://liff.line.me/' + config.liffId`

- [ ] **Step 1: Write the failing tests**

ใน `src/menu/fixed-replies.test.js` แก้ import เป็น

```js
import { getFixedReply, buildWebReply, HELP_REPLY, WEB_COMING_SOON_REPLY } from './fixed-replies.js';
```

แล้วเพิ่มเทสต์นี้ใน `describe('getFixedReply', ...)`

```js
  it('returns the LIFF link for the web button when a link is configured', () => {
    const liffUrl = 'https://liff.line.me/1234567890-AbCdEfGh';

    expect(getFixedReply('เปิดเว็บ', { liffUrl })).toBe(buildWebReply(liffUrl));
    expect(buildWebReply(liffUrl)).toBe('เปิดหน้าเว็บดูและแก้ไขรายการ: https://liff.line.me/1234567890-AbCdEfGh');
  });
```

ใน `src/bot.test.js` เพิ่มเทสต์นี้ใน `describe('bot menu fixed replies', ...)`

```js
  it('replies the LIFF link for the web button when configured', async () => {
    const { deps, bot } = setup({ liffUrl: 'https://liff.line.me/liff-1' });

    await bot.handleEvent(textEvent('เปิดเว็บ'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'เปิดหน้าเว็บดูและแก้ไขรายการ: https://liff.line.me/liff-1',
      undefined
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/menu/fixed-replies.test.js src/bot.test.js`
Expected: FAIL 2 tests ใหม่ (`buildWebReply is not a function` และได้ข้อความกำลังพัฒนาแทนลิงก์)

- [ ] **Step 3: Write minimal implementation**

ใน `src/menu/fixed-replies.js` แทน function `getFixedReply` และ `module.exports` ด้วย

```js
function buildWebReply(liffUrl) {
  return `เปิดหน้าเว็บดูและแก้ไขรายการ: ${liffUrl}`;
}

function getFixedReply(text, { liffUrl } = {}) {
  const key = text.replace(/\s+/g, '');
  if (key === 'เปิดเว็บ' && liffUrl) {
    return buildWebReply(liffUrl);
  }
  return Object.hasOwn(FIXED_REPLIES, key) ? FIXED_REPLIES[key] : null;
}

module.exports = { getFixedReply, buildWebReply, HELP_REPLY, WEB_COMING_SOON_REPLY };
```

แก้คอมเมนต์เหนือ `WEB_COMING_SOON_REPLY` เป็น

```js
// ใช้เมื่อยังไม่ได้ตั้งค่า LIFF เท่านั้น
```

ใน `src/bot.js` เพิ่ม `liffUrl,` ใน parameter ของ `createBot` (ต่อจาก `allowRequest,`) และแก้บรรทัดที่เรียก `getFixedReply` เป็น

```js
    const fixedReply = getFixedReply(event.message.text, { liffUrl });
```

ใน `index.js` เพิ่ม `liffUrl: \`https://liff.line.me/${config.liffId}\`,` ใน object ที่ส่งให้ `createBot` (ต่อจาก `allowRequest,`)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/menu/fixed-replies.test.js src/bot.test.js`
Expected: PASS ทุกเทสต์ในสองไฟล์

Run: `npm test` แล้ว `node --check index.js`
Expected: PASS ทุกไฟล์; `node --check` ไม่มี output

- [ ] **Step 5: Commit**

```bash
git add src/menu/fixed-replies.js src/menu/fixed-replies.test.js src/bot.js src/bot.test.js index.js
git commit -m "feat: reply the LIFF link for the web menu button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: (ผู้ใช้) ตั้งค่า LIFF และทดสอบในแอป LINE

**Depends on:** Task 1-8

**Files:** ไม่มี (ตั้งค่าบนเว็บ LINE Developers, OA Manager และ `.env`)

ชื่อเมนูบนเว็บอาจต่างจากนี้เล็กน้อย

- [ ] **Step 1: (ผู้ใช้) สร้าง LINE Login channel และ LIFF app**

| # | Action | Expected |
|---|---|---|
| 1 | `https://developers.line.biz/console/` เลือก Provider เดียวกับบอท > `Create a new channel` > `LINE Login` | เห็นฟอร์มสร้าง channel |
| 2 | Region `Thailand`, ชื่อ `รายรับรายจ่าย เว็บ`, คำอธิบายสั้นๆ, App types ติ๊ก `Web app`, ใส่อีเมล, ยอมรับเงื่อนไข > `Create` | ได้ channel ใหม่ สถานะ `Developing` |
| 3 | แท็บ `Basic settings` copy `Channel ID` (ตัวเลข) | ได้ตัวเลขประมาณ 10 หลัก |
| 4 | แท็บ `LIFF` > `Add`: LIFF app name `รายรับรายจ่าย`, Size `Full`, Endpoint URL `https://<โดเมน ngrok ของคุณ>/liff/` (มี `/` ท้าย), Scopes ติ๊ก `openid`, Bot link feature `Off` > `Add` | ได้ LIFF app และ `LIFF ID` รูปแบบ `1234567890-AbCdEfGh` |
| 5 | เปิด `.env` เพิ่ม `LIFF_ID=<LIFF ID จากข้อ 4>` และ `LINE_LOGIN_CHANNEL_ID=<Channel ID จากข้อ 3>` แล้ว save | `.env` มีครบ 9 key |

- [ ] **Step 2: (ผู้ใช้) Manual check**

**Manual check (ผู้ใช้ทำ — agent ห้าม start server):**
- Preconditions: Step 1 เสร็จ, `Ctrl+C` แล้ว `npm start` ใหม่บน branch นี้, ngrok รันอยู่, มีรายการในเดือนนี้อย่างน้อย 2 รายการ

| # | Action | Expected |
|---|---|---|
| 1 | ในแอป LINE พิมพ์ `เปิดเว็บ` หาบอท | บอทตอบ `เปิดหน้าเว็บดูและแก้ไขรายการ: https://liff.line.me/<LIFF ID>` |
| 2 | แตะลิงก์ในข้อ 1 (ถ้าขึ้นหน้าขออนุญาต ให้กด `อนุญาต`) | เปิดหน้า `รายการของฉัน` ในแอป LINE ช่องเดือนเป็นเดือนนี้ แสดงรายรับ/รายจ่ายรวม และรายการเดือนนี้แยกตามวัน ตรงกับ Table Editor > transactions |
| 3 | เปลี่ยนเดือนเป็นเดือนที่ไม่มีรายการ | ขึ้น `ยังไม่มีรายการในเดือนนี้` และรวมเป็น 0 บาท |
| 4 | กลับมาเดือนนี้ แตะรายการหนึ่ง แก้จำนวนเงินเป็นค่าใหม่ > `บันทึก` | หน้าต่างปิด รายการแสดงยอดใหม่ และ Table Editor แถวนั้น `amount` เป็นค่าใหม่ |
| 5 | แตะรายการเดิม เปลี่ยนหมวดเป็นหมวดในกลุ่ม `รายรับ` > `บันทึก` | รายการเป็นสีเขียวมีเครื่องหมาย `+` และ Table Editor แถวนั้น `type` = `income` |
| 6 | แตะรายการหนึ่ง แก้จำนวนเงินเป็น `20000000` > `บันทึก` | ขึ้นข้อความสีแดง `ข้อมูลไม่ถูกต้อง ...` หรือช่องจำนวนเงินเตือนเกินค่าสูงสุด และข้อมูลใน Table Editor ไม่เปลี่ยน |
| 7 | แตะรายการหนึ่ง กด `ลบ` | ปุ่มเปลี่ยนเป็น `ยืนยันลบ` รายการยังอยู่ |
| 8 | กด `ยืนยันลบ` | หน้าต่างปิด รายการหายจากหน้าเว็บและจาก Table Editor |
| 9 | ในเบราว์เซอร์บนคอมพิวเตอร์ เปิด `http://localhost:3000/api/transactions?month=2026-09` | เห็น `{"error":"Unauthorized"}` |
| 10 | OA Manager > ริชเมนู > `เมนูหลัก` > ช่อง B เปลี่ยนการดำเนินการเป็น `ลิงก์` (Link) ใส่ `https://liff.line.me/<LIFF ID>` > บันทึก แล้วกดปุ่ม `เปิดเว็บ` ในแชต | เปิดหน้า `รายการของฉัน` ทันที |

---

## ข้อจำกัดที่ตั้งใจเลื่อนไปขั้นถัดไป

- กราฟตามหมวดและ export CSV ทำในรอบ 6b
- ยังเพิ่มรายการใหม่จากหน้าเว็บไม่ได้ (บันทึกผ่านแชตเหมือนเดิม)
- ID token ของ LIFF หมดอายุได้ ถ้าเปิดหน้าค้างไว้นานจะขึ้น `กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง`
- API ยังไม่มี rate limit (ทุก request ต้องมี ID token ที่ LINE ยืนยันแล้ว)
- ไฟล์เทสต์ `*.test.mjs` อยู่ใน `public/liff/` จึงถูกเสิร์ฟเป็นไฟล์ static ด้วย (ไม่มีข้อมูลลับ)
- LINE Login channel ยังเป็นสถานะ Developing ใช้ได้เฉพาะผู้ดูแล channel จนกว่าจะ publish ก่อน deploy ในขั้นที่ 10
