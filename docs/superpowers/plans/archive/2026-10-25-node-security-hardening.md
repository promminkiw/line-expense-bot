# Node Security Hardening (Oct 2026) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปิดความเสี่ยงจาก Node.js security release วันที่ 21 ต.ค. 2026 (โดยเฉพาะ Brotli decoder CVE-2026-111497) และ `npm audit` ระดับ high 2 รายการ โดยไม่เปลี่ยนพฤติกรรมของบอทสำหรับผู้ใช้ปกติ

**Architecture:** 4 ชั้นป้องกัน (1) อัปเดต `body-parser` ผ่าน `npm audit fix` (2) ปักเวอร์ชัน Node บน Render เป็น 24.22.1 (3) เพิ่ม middleware เล็กๆ ที่ปฏิเสธ `Content-Encoding` ที่ไม่ใช่ identity/gzip/deflate ก่อน body parser ทุกจุดที่รับข้อมูลจากภายนอก เพื่อไม่ให้ request ที่ไม่ผ่านการยืนยันตัวตนถึงตัวคลาย Brotli ได้ (4) บันทึกวิธีดูแลลงเอกสาร ส่วนการตรวจ Node บน Render และการอัปเดต Node ในเครื่องเป็นงานของผู้ใช้ (ดูท้ายไฟล์)

**Tech Stack:** Node.js 24, Express 5.3, body-parser 2.x, vitest, ESLint

## Global Constraints

- ห้ามเปลี่ยนพฤติกรรมสำหรับ request ปกติ: LINE webhook, LIFF API และการอัปโหลดรูปใบเสร็จต้องทำงานเหมือนเดิมทุกกรณีที่ไม่มี `Content-Encoding` หรือใช้ gzip/deflate
- ห้ามแตะ `public/liff/`, `supabase/*.sql` และห้ามแก้ `.env`
- ชื่อไฟล์/ตัวแปร/log เป็นภาษาอังกฤษ คอมเมนต์สั้นบรรทัดเดียวเป็นภาษาไทย (ใช้เฉพาะอธิบาย "ทำไม") ห้ามใช้ emoji ในโค้ด คอมเมนต์ log และ commit message
- เขียน test ก่อนโค้ด (TDD) สำหรับโค้ดใหม่ทุกจุด
- ห้ามติดตั้งแพ็กเกจแบบ global ห้ามลบไฟล์ ห้ามเริ่ม/restart/kill dev server
- commit ลงท้ายด้วยบรรทัด `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` ข้อความขึ้นต้น `fix:` หรือ `docs:`
- หลังทุก task: `npm test` ต้องผ่านทั้งหมด (baseline ก่อนเริ่ม = 2396 ข้อ ใน 114 ไฟล์ จะเพิ่มตามเทสต์ใหม่ของแผนนี้) และ `npm run lint` ต้องสะอาด เทสต์ jsdom ใน `public/liff` ล้มสุ่มจาก timeout ได้เมื่อเครื่องโหลดหนัก ถ้าเจอให้รันไฟล์นั้นเดี่ยวและรันทั้งชุดซ้ำ จดชื่อเทสต์ลงรายงาน ห้ามแก้เทสต์เหล่านั้น
- ข้อเท็จจริงที่ตรวจแล้ว (2026-10-25): Node v24.22.1 และ v22.23.4 มีอยู่จริงใน `https://nodejs.org/dist/index.json` (วันที่ 2026-10-20, security true); `body-parser` ติดตั้งอยู่ 2.3.0 และรองรับ `Content-Encoding: br` (`node_modules/body-parser/lib/read.js` กรณี `'br'`); `npm audit` พบ high 2 รายการคือ `body-parser` 2.0.0-2.3.0 (production) และ `undici` ถึง 7.30.0 (มาจาก `jsdom` ซึ่งเป็น devDependency) โดย `npm view body-parser version` = 2.4.0; จุดที่รับ body จากภายนอกมี 3 จุด: `src/app.js` (`/webhook`, `express.raw` ก่อนตรวจ signature), `src/api/router.js` (`router.use(express.json)` ก่อนตรวจ token) และ `src/bills/router.js` (`express.raw` ของ `/read-receipt` ซึ่งอยู่ใต้ router ของ `/api` จึงผ่านจุดที่สองก่อนเสมอ)

---

### Task 1: อัปเดต dependency ด้วย npm audit fix

**Depends on:** none

**Files:**
- Modify: `package-lock.json` (ไฟล์ร่วม: task นี้ต้องรันเดี่ยว)
- Modify: `package.json` (ควรไม่เปลี่ยน ถ้าเปลี่ยนให้รายงาน)

**Interfaces:**
- Produces: `body-parser` >= 2.4.0 ใน lockfile; `npm audit` ไม่มี high

- [ ] **Step 1: บันทึกสถานะก่อนแก้** รัน `npm audit` และ `npm ls body-parser undici` จดผลลงรายงาน (คาดว่า body-parser 2.3.0, undici 7.30.0, high 2 รายการ)
- [ ] **Step 2: รันการแก้** `npm audit fix --ignore-scripts` (ห้ามใช้ `--force`; `--ignore-scripts` กันไม่ให้ install script ของแพ็กเกจอย่าง `sharp` ทำงานโดยไม่จำเป็น เพราะงานนี้แก้แค่ lockfile) ถ้าคำสั่งขอให้ใช้ `--force` หรือเปลี่ยน major ของแพ็กเกจใดให้หยุดและรายงาน BLOCKED
- [ ] **Step 3: ตรวจผล** เกณฑ์หลักคือ `npm audit --omit=dev --audit-level=high` ต้องมี exit code 0 (คำสั่งเดียวกับที่ CI รัน) และ `npm ls body-parser` ต้องเห็น body-parser >= 2.4.0 เพียงสำเนาเดียว (ไม่มีสำเนาเก่าซ้อนใน express); ส่วน `undici` มาจาก `jsdom` ที่เป็น devDependency ให้รายงานเลขเวอร์ชันใหม่ตามจริงเป็นข้อมูล ถ้าอัปเดตไม่ได้โดยไม่ใช้ `--force` ให้ปล่อยไว้และรายงาน (ไม่ใช่เหตุให้ BLOCKED เพราะไม่กระทบ production); `git diff --stat` ต้องแตะเฉพาะ `package-lock.json` (ถ้า `package.json` เปลี่ยน ให้รายงานว่าบรรทัดไหนและทำไม); `git diff package-lock.json` ต้องเปลี่ยนเฉพาะ `version`, `resolved`, `integrity` (และ `dependencies` ย่อยของแพ็กเกจที่เปลี่ยน) ของแพ็กเกจที่มีชื่ออยู่เดิม ถ้าพบชื่อแพ็กเกจที่ไม่เคยอยู่ใน lockfile ให้หยุดและรายงาน
- [ ] **Step 4: ตรวจว่าไม่พัง** `npm test` และ `npm run lint` และ `node --check index.js`
- [ ] **Step 5: Commit**

```bash
git add package-lock.json
git commit -m "fix: update body-parser and undici to clear npm audit high findings"
```

### Task 2: ปฏิเสธ Content-Encoding ที่ไม่ใช่ identity/gzip/deflate ก่อน body parser

**Depends on:** Task 1

**Files:**
- Create: `src/utils/request-encoding.js`
- Create: `src/utils/request-encoding.test.js`
- Modify: `src/app.js` (ใส่ middleware ใน `app.post('/webhook', ...)` ก่อน `express.raw`)
- Modify: `src/app.test.js` (เพิ่มเทสต์ใน `describe('POST /webhook')`)
- Modify: `src/api/router.js` (ใส่ `router.use(rejectUnsupportedEncoding)` ก่อน `router.use(express.json(...))`)
- Modify: `src/api/router.test.js` (เพิ่มเทสต์)

**Interfaces:**
- Produces: `require('./utils/request-encoding')` -> `{ rejectUnsupportedEncoding(req, res, next) }` ถ้า `req.headers['content-encoding']` ไม่มีหรือทุกค่า (คั่นด้วยจุลภาค ตัดช่องว่าง ตัวพิมพ์เล็ก) อยู่ใน `identity|gzip|deflate` เรียก `next()` ไม่งั้นตอบ `415` พร้อม `{ "error": "Unsupported encoding" }` และไม่เรียก `next()`

- [ ] **Step 1: เขียนเทสต์ unit ก่อน** สร้าง `src/utils/request-encoding.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { rejectUnsupportedEncoding } from './request-encoding.js';

function run(header) {
  const req = { headers: header === undefined ? {} : { 'content-encoding': header } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  rejectUnsupportedEncoding(req, res, next);
  return { res, next };
}

describe('rejectUnsupportedEncoding', () => {
  it.each([undefined, 'identity', 'gzip', 'deflate', 'GZIP', ' gzip ', 'gzip, deflate'])(
    'lets %j through',
    (header) => {
      const { res, next } = run(header);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    }
  );

  // รวมค่าที่เสียรูป: token ว่างถือว่าไม่รองรับ เพราะ body-parser ไม่แยก token เอง จึงห้ามปล่อยให้ผ่านโดยบังเอิญ
  it.each(['br', 'BR', 'br ', 'zstd', 'compress', 'gzip, br', 'unknown', ',br', 'gzip,,br', 'identity, br', 'gzip,\tbr', ',', ', ,', ''])(
    'rejects %j with 415',
    (header) => {
      const { res, next } = run(header);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(415);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unsupported encoding' });
    }
  );
});
```

- [ ] **Step 2: รันให้ล้ม** `npx vitest run src/utils/request-encoding.test.js` ต้องล้ม (ไม่พบโมดูล)
- [ ] **Step 3: เขียน middleware** สร้าง `src/utils/request-encoding.js`:

```js
const ALLOWED_ENCODINGS = new Set(['identity', 'gzip', 'deflate']);

// body-parser คลาย br/zstd ให้เอง และ express.raw ของ webhook ทำงานก่อนตรวจ signature จึงปิดทางไว้ก่อน
function rejectUnsupportedEncoding(req, res, next) {
  const header = req.headers['content-encoding'];
  if (header === undefined) {
    next();
    return;
  }
  // ไม่กรอง token ว่างทิ้ง: ค่าที่เสียรูปต้องถูกปฏิเสธ ไม่ใช่ถูกมองข้าม
  const encodings = header.split(',').map((value) => value.trim().toLowerCase());
  if (encodings.every((encoding) => ALLOWED_ENCODINGS.has(encoding))) {
    next();
    return;
  }
  res.status(415).json({ error: 'Unsupported encoding' });
}

module.exports = { rejectUnsupportedEncoding };
```

- [ ] **Step 4: รันให้ผ่าน** `npx vitest run src/utils/request-encoding.test.js` ต้องผ่านทุกข้อ
- [ ] **Step 5: เขียนเทสต์ของ webhook ก่อนต่อสาย** ใน `src/app.test.js` เพิ่ม `import zlib from 'node:zlib';` และ `import http from 'node:http';` ที่หัวไฟล์ (ถ้ายังไม่มี) แล้วเพิ่มใน `describe('POST /webhook', ...)` (ใช้ `start`, `sign` ที่มีอยู่ในไฟล์):

```js
  it('returns 415 for a brotli encoded body before checking the signature and never builds the brotli decoder', async () => {
    const brotli = vi.spyOn(zlib, 'createBrotliDecompress');
    const handleEvents = vi.fn();
    const baseUrl = await start(handleEvents);
    const body = JSON.stringify({ destination: 'U1', events: [] });

    const res = await fetch(`${baseUrl}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br', 'x-line-signature': sign(body) },
      body,
    });

    expect(res.status).toBe(415);
    expect(handleEvents).not.toHaveBeenCalled();
    expect(brotli).not.toHaveBeenCalled();
    brotli.mockRestore();
  });

  // fetch รวม header ซ้ำไม่ได้ จึงใช้ http.request เพื่อส่ง Content-Encoding สองบรรทัดจริง
  it('returns 415 when a second Content-Encoding header line asks for brotli', async () => {
    const brotli = vi.spyOn(zlib, 'createBrotliDecompress');
    const handleEvents = vi.fn();
    const baseUrl = await start(handleEvents);
    const body = JSON.stringify({ destination: 'U1', events: [] });

    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        `${baseUrl}/webhook`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': ['gzip', 'br'], 'x-line-signature': sign(body) } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      );
      req.on('error', reject);
      req.end(body);
    });

    expect(status).toBe(415);
    expect(brotli).not.toHaveBeenCalled();
    brotli.mockRestore();
  });
```

  รัน `npx vitest run src/app.test.js -t "brotli"` ต้องล้ม (ตอนนี้ request ไปถึง body-parser และสร้าง decoder หรือได้ 400 ไม่ใช่ 415) และจดผลที่เห็นจริงลงรายงาน

- [ ] **Step 6: ต่อสายที่ webhook** ใน `src/app.js` เพิ่ม `const { rejectUnsupportedEncoding } = require('./utils/request-encoding');` ต่อจากบรรทัด require ด้านบน แล้วเปลี่ยน `app.post('/webhook', express.raw({ type: () => true, limit: '1mb' }), middleware({ channelSecret }), (req, res) => {` เป็น `app.post('/webhook', rejectUnsupportedEncoding, express.raw({ type: () => true, limit: '1mb' }), middleware({ channelSecret }), (req, res) => {` (ไม่แก้อย่างอื่น) รันเทสต์ brotli ซ้ำต้องผ่าน และ `npx vitest run src/app.test.js` ต้องผ่านทั้งไฟล์ รวมเทสต์เดิม `returns 415 without stack trace when content-encoding is unsupported` (บรรทัด ~139) ที่ต้องยังผ่านโดยไม่แก้ เพราะตอนนี้ตอบจาก middleware ใหม่
- [ ] **Step 7: เขียนเทสต์ของ /api ก่อนต่อสาย** ใน `src/api/router.test.js` เพิ่ม `import zlib from 'node:zlib';` ที่หัวไฟล์ แล้วเพิ่มหลัง `describe('GET /api/config', ...)` (ใช้ `start`, `setup`, `call` ที่มีอยู่ในไฟล์):

```js
describe('request encoding', () => {
  it('returns 415 for a brotli encoded body before reading the token and never builds the brotli decoder', async () => {
    const brotli = vi.spyOn(zlib, 'createBrotliDecompress');
    const deps = setup();
    const base = await start(deps);

    const res = await fetch(`${base}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'br', Authorization: 'Bearer good' },
      body: JSON.stringify({ name: 'x', type: 'expense' }),
    });

    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: 'Unsupported encoding' });
    expect(deps.verifyIdToken).not.toHaveBeenCalled();
    expect(brotli).not.toHaveBeenCalled();
    brotli.mockRestore();
  });

  // /bills/read-receipt ใช้ express.raw ของตัวเอง ต้องถูกกั้นด้วย middleware ระดับ router เช่นกัน
  it('also guards the receipt upload route mounted under the bills router', async () => {
    const readReceiptHandler = vi.fn((req, res) => res.json({ amount: 1 }));
    const billsRouter = express.Router();
    billsRouter.post('/read-receipt', readReceiptHandler);
    const base = await start(setup({ billsRouter }));

    const res = await fetch(`${base}/bills/read-receipt`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', 'Content-Encoding': 'br', Authorization: 'Bearer good' },
      body: Buffer.from([1, 2, 3]),
    });

    expect(res.status).toBe(415);
    expect(readReceiptHandler).not.toHaveBeenCalled();
  });

  it('still accepts a plain JSON body', async () => {
    const base = await start(setup());

    const res = await call(base, '/config', { token: null });

    expect(res.status).toBe(200);
  });
});
```

  ก่อนเขียนให้เปิด `setup()` ใน `src/api/router.test.js` เพื่อยืนยัน (ก) ว่ามัน return `verifyIdToken` เป็น `vi.fn()` และ (ข) ว่ารับ override `billsRouter` ได้ (เช่น `setup({ billsRouter })`) ถ้าไม่รับ ให้ทำตามรูปแบบที่ `setup` ใช้จริง (เช่น สร้าง deps แล้ว spread ทับ `billsRouter`) โดยไม่แก้ `setup` ให้เปลี่ยนความหมายของเทสต์อื่น ห้ามตัด assertion ทิ้ง รัน `npx vitest run src/api/router.test.js -t "request encoding"` ต้องล้มสองข้อแรก
- [ ] **Step 8: ต่อสายที่ /api** ใน `src/api/router.js` เพิ่ม `const { rejectUnsupportedEncoding } = require('../utils/request-encoding');` ต่อจากบรรทัด `const { AuthError } = require('./verify-id-token');` แล้วเพิ่ม `router.use(rejectUnsupportedEncoding);` ในบรรทัดก่อน `router.use(express.json({ limit: '10kb' }));` (ต่อจากคอมเมนต์เดิม ไม่ลบคอมเมนต์) รันเทสต์ข้อ Step 7 ต้องผ่าน แล้ว `npx vitest run src/api` ต้องผ่านทั้งโฟลเดอร์
- [ ] **Step 9: ตรวจรวม** `npm test`, `npm run lint`, `node --check index.js`; ยืนยันด้วย grep ว่าไม่มีจุดอื่นที่เรียก `express.raw`/`express.json`/`express.urlencoded`/`express.text` นอก 3 จุดที่ระบุ: `grep -rnE "express\.(raw|json|urlencoded|text)" src index.js --include=*.js --exclude=*.test.js` ต้องได้ 3 บรรทัดพอดี
- [ ] **Step 10: Commit** (ระบุ path ท้ายคำสั่งเพื่อไม่ดึงไฟล์อื่นที่ค้าง stage ไปด้วย)

```bash
git add src/utils/request-encoding.js src/utils/request-encoding.test.js src/app.js src/app.test.js src/api/router.js src/api/router.test.js
git commit -m "fix: reject request bodies with an unsupported content encoding before parsing" -- src/utils/request-encoding.js src/utils/request-encoding.test.js src/app.js src/app.test.js src/api/router.js src/api/router.test.js
```

### Task 3: ปักเวอร์ชัน Node บน Render เป็น 24.22.1

**Depends on:** Task 2 (ทำต่อจาก Task 2 ตามลำดับ ห้ามรันขนานกับ Task 2: ใช้ working tree และ git index เดียวกัน การ stage/commit พร้อมกันจะปนไฟล์กัน)

**Files:**
- Modify: `render.yaml` (เฉพาะ `NODE_VERSION`)
- Modify: `src/render-config.test.js` (เทสต์ `pins Node 24 ...`)

**Interfaces:**
- Produces: `NODE_VERSION` = `"24.22.1"` ใน `render.yaml`; เทสต์บังคับว่าเป็น 24.x และ minor/patch ไม่ต่ำกว่า 24.22.1

- [ ] **Step 1: แก้เทสต์ก่อน** ใน `src/render-config.test.js` แทนเทสต์ `pins Node 24 on Render, the same version CI tests with` ด้วย:

```js
  // security release 2026-10-21 แก้ Brotli decoder (CVE-2026-111497) ใน 24.22.1 จึงห้ามปักต่ำกว่านี้
  it('pins Node 24.22.1 or newer on Render, the same major CI tests with', () => {
    const node = envBlocks.find((block) => block.name === 'NODE_VERSION');
    const ci = readFileSync(new URL('.github/workflows/ci.yml', root), 'utf8');
    const pinned = node.body.match(/value: "(\d+)\.(\d+)\.(\d+)"/);

    expect(pinned, 'NODE_VERSION must be an exact x.y.z').not.toBeNull();
    const [major, minor, patch] = pinned.slice(1).map(Number);
    expect(major).toBe(24);
    expect(minor > 22 || (minor === 22 && patch >= 1), `NODE_VERSION ${major}.${minor}.${patch} is older than 24.22.1`).toBe(true);
    expect(ci).toMatch(/^\s*node-version: 24$/m);
  });
```

- [ ] **Step 2: รันให้ล้ม** `npx vitest run src/render-config.test.js` ต้องล้มที่เทสต์นี้ (ค่าปัจจุบัน `"24"`)
- [ ] **Step 3: แก้ `render.yaml`** เปลี่ยน `value: "24"` ใต้ `key: NODE_VERSION` เป็น `value: "24.22.1"` (ห้ามแก้บรรทัดอื่น)
- [ ] **Step 4: รันให้ผ่าน** `npx vitest run src/render-config.test.js` ต้องผ่านทั้งไฟล์ แล้ว `npm test` และ `npm run lint`
- [ ] **Step 5: Commit**

```bash
git add render.yaml src/render-config.test.js
git commit -m "fix: pin Node 24.22.1 on Render for the October 2026 security release"
```

### Task 4: เอกสารและสถานะงาน

**Depends on:** Task 2, Task 3

**Files:**
- Modify: `README.md` (หัวข้อ "ความปลอดภัย" และ "ข้อจำกัดที่ทราบ" เท่านั้น)
- Modify: `work-memory/STATE.md`

**Interfaces:** ไม่มี (เอกสารล้วน)

- [ ] **Step 0:** ตรวจความจริงของ git ก่อนแก้เอกสารสถานะ: `git log --oneline origin/main..main` และ `git status -sb` ผลคือแหล่งอ้างอิงว่าอะไร push แล้ว (branch `refactor/code-organization` ถูก merge และ push เข้า `main` แล้วเมื่อ 2026-10-25 ที่ `67d562f` แต่ `work-memory/STATE.md` ยังเขียนว่ารอตัดสินใจ/ยังไม่ push)
- [ ] **Step 1:** ใน `README.md` หัวข้อ "ความปลอดภัย" เพิ่มหนึ่งรายการ: server ปฏิเสธ request ที่มี `Content-Encoding` อื่นนอกจาก identity/gzip/deflate ด้วย 415 ก่อนอ่าน body ทุกจุด (webhook, `/api`) เพราะ `body-parser` คลาย Brotli ให้เอง (ที่มา: `src/utils/request-encoding.js`) ในหัวข้อ "ข้อจำกัดที่ทราบ" เพิ่มหนึ่งรายการ: `NODE_VERSION` ใน `render.yaml` ปักเลขเต็ม ต้องตามอัปเดตเองเมื่อ Node ออก security release (เช็กที่ nodejs.org/en/blog/vulnerability) อ่าน `README.md` ส่วนเหล่านั้นก่อนแก้เพื่อให้สไตล์และขนาดบรรทัดตรงกับรายการข้างเคียง (รายการละไม่เกิน 2 บรรทัด)
- [ ] **Step 2:** ใน `work-memory/STATE.md` (อ่านกติกาหัวไฟล์ก่อน: ไม่เกินประมาณ 60 บรรทัด รายการละไม่เกิน 2 บรรทัด) ทำตามนี้:
  - แก้ข้อความที่ล้าสมัยตามผล Step 0: บรรทัด `Updated:`, `Goal:`, ข้อ `0.` ใน "รอผู้ใช้ทำ" (เรื่องรอตัดสินใจ merge/push), รายการ Done ของ refactor ที่เขียนว่ายังไม่ push, และรายการ Next เกี่ยวกับ branch นั้น ให้ตรงความจริงว่า merge และ push แล้ว (`67d562f`) ย่อข้อความแทนการลบรายการ
  - เพิ่มข้อใหม่ 2 ข้อไว้บนสุดของ "รอผู้ใช้ทำ" แล้วเลขข้อให้ต่อเนื่อง (ไม่ต่อท้ายรายการยาวๆ): (ก) เปิด Render dashboard > line-expense-bot > Logs ของ deploy ล่าสุด ดูบรรทัด `Using Node.js version` ต้องเป็น 24.22.1 (ข) อัปเดต Node ในเครื่องเป็น 22.23.4 หรือ 24.22.1 ขึ้นไป (ตรวจด้วย `node -v`)
  - เพิ่มรายการ Done ของงานนี้พร้อมผลเทสต์จริงจาก `npm test`; ถ้า Done เกิน 5 รายการให้ย้ายรายการเก่าสุดไป `work-memory/archive/STATE-2026-09-to-10.md` (ต่อท้ายไฟล์ ไม่ลบอะไร)
- [ ] **Step 3:** `wc -l work-memory/STATE.md` ต้องไม่เกิน 62 (ถ้าเกิน ให้ย่อรายการที่ยาวเกิน 2 บรรทัด ไม่ลบรายการ) และเปิดอ่านว่าหัวข้อ "รอผู้ใช้ทำ" ขึ้นต้นด้วยข้อที่ผู้ใช้ต้องลงมือ
- [ ] **Step 4: Commit** (รวมไฟล์แผนนี้ด้วย เพราะยังไม่ถูก track)

```bash
git add README.md work-memory/STATE.md docs/superpowers/plans/2026-10-25-node-security-hardening.md
git commit -m "docs: record the request encoding guard, the pinned Node version and the node security plan"
```

(ถ้าแตะไฟล์ archive ให้เพิ่ม `work-memory/archive/STATE-2026-09-to-10.md` ใน `git add` ด้วย)

---

## ลำดับ merge และ push (แยก 2 รอบ)

`autoDeployTrigger: commit` ใน `render.yaml` ทำให้ push เข้า `main` สั่ง deploy ทันที (nothing reaches Render until merge และ push) ถ้า push ตัวปักเวอร์ชันพร้อมกับ guard แล้ว Render หาเวอร์ชันไม่เจอ build จะล้มและ guard จะไม่ถูก deploy ไปด้วย (ว่า Render คงอินสแตนซ์เก่าไว้เมื่อ build ล้มหรือไม่ ไม่มีหลักฐานในรีโป ถือเป็นข้อที่ยังไม่ทราบ) จึงแยกเป็น:

1. หลัง Task 1 และ Task 2 ผ่านรีวิว: merge `fix/node-security-oct-2026` ช่วงถึง Task 2 เข้า `main` แบบ fast-forward แล้ว push (รอบที่ 1: dependency และ guard)
2. หลัง Task 3 และ Task 4 ผ่านรีวิว: merge ส่วนที่เหลือเข้า `main` แล้ว push (รอบที่ 2: ปักเวอร์ชัน Node และเอกสาร) ก่อน push รอบนี้ให้ตรวจ `https://nodejs.org/dist/v24.22.1/` ว่ามีจริงอีกครั้ง
3. ห้าม `git push --force` ทุกกรณี และไม่ลบ branch

---

## งานของผู้ใช้ที่ agent ทำแทนไม่ได้ (ไม่อยู่ใน task ข้างบน)

ภาพรวม 2 ขั้น:

1. **ตรวจ Node บน Render หลัง deploy** ทำเมื่อ push เสร็จ
   - เปิด Render dashboard แล้วเลือกบริการ `line-expense-bot`
   - เปิดแท็บ Logs หรือ Events ของ deploy ล่าสุด
   - หาบรรทัดแนว `Using Node.js version` คาดว่าเห็น `24.22.1`
   - ถ้า deploy ล้มด้วยข้อความหาเวอร์ชันไม่เจอ Render จะคงเวอร์ชันเดิมที่รันอยู่ไว้ ให้แจ้งผมเพื่อปรับ `render.yaml`
2. **อัปเดต Node ในเครื่อง** (เป็นการติดตั้งระดับเครื่อง ผมจึงไม่ทำให้)
   - เปิด PowerShell พิมพ์ `node -v` ตอนนี้เห็น `v22.12.0`
   - ดาวน์โหลดตัวติดตั้ง LTS ของ Node 24 (24.22.1) จาก nodejs.org หรือ 22.23.4 ถ้าต้องการอยู่สาย 22 แล้วติดตั้งทับ
   - ปิดและเปิด PowerShell ใหม่ พิมพ์ `node -v` ควรเห็นเลขใหม่ จากนั้นรัน `npm test` ในโปรเจกต์อีกครั้ง

## Self-Review

- **Spec coverage:** ข้อ 1 (ตรวจ Node บน Render) และข้อ 4 (Node ในเครื่อง) เป็นงานของผู้ใช้ ระบุขั้นตอนไว้ข้างบนและใส่ใน STATE.md ผ่าน Task 4; ข้อ 2 = Task 3; ข้อ 3 = Task 1; ข้อ 5 = Task 2 (เลือก allowlist identity/gzip/deflate แทน `inflate: false` เพราะยังไม่ยืนยันว่า LINE ไม่ส่ง gzip; allowlist ไม่ทำให้กรณีนั้นพัง) ทุก task ทำเรียงลำดับ 1 -> 2 -> 3 -> 4 (ไม่มีงานขนาน)
- **ผลรีวิวแผน (2026-10-25):** falcon และ viper อนุมัติแบบมีข้อแก้ ปรับแล้ว: spy ว่า `createBrotliDecompress` ไม่ถูกเรียก, เคส header เสียรูปและ header ซ้ำสองบรรทัด, token ว่างถือว่าไม่รองรับ, เทสต์ครอบ `/api/bills/read-receipt`, แยก push เป็นสองรอบ, `npm audit fix --ignore-scripts` + ตรวจ diff ของ lockfile, ผ่อนเกณฑ์ `undici`, แก้ STATE.md ที่ล้าสมัยหลัง merge ครั้งก่อน, เพิ่มไฟล์แผนใน commit ของ Task 4, Task 3 ไม่ขนานกับ Task 2
- **Placeholder scan:** ทุก step ที่แก้โค้ดมีโค้ดเต็ม ยกเว้นการอ่าน `setup()` ใน Step 7 ที่ระบุวิธีตรวจและทางเลือกไว้ชัด
- **Test coverage:** Task 2 และ 3 เขียนเทสต์ก่อนโค้ดทุกจุด; Task 1 ตรวจด้วย `npm audit` และเทสต์ทั้งชุด; ไม่มี Browser check เพราะผู้ใช้ไม่เห็นอะไรเปลี่ยน
- **Type consistency:** ชื่อ `rejectUnsupportedEncoding` และข้อความ `{ error: 'Unsupported encoding' }` ตรงกันทุก task
