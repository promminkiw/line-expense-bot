# Folder Structure Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** จัดโฟลเดอร์ให้เป็นระเบียบโดยพฤติกรรมของบอทและหน้า LIFF ไม่เปลี่ยน และหยุดส่งไฟล์เทสต์ออกทาง `/liff`

**Architecture:** ย้ายไฟล์ด้วย `git mv` เพื่อเก็บประวัติ แล้วแก้ path ใน `require`/`import` ของไฟล์ที่อ้างถึง ฝั่ง server ย้ายไฟล์หลวมใน `src/` เข้าโฟลเดอร์ตามหน้าที่ ฝั่ง LIFF แยกตามฟีเจอร์ด้วยสคริปต์ที่คำนวณ relative path ใหม่ให้ทุกไฟล์ ส่วน static ของ `/liff` ใส่ middleware ตอบ 404 ให้ไฟล์เทสต์

**Tech Stack:** Node 24, Express 5, CommonJS (server), ES module ไม่มี build step (LIFF), vitest + jsdom, ESLint

## Global Constraints

- ห้ามเปลี่ยนพฤติกรรม: ทุก task ต้องจบที่ `npm test` ผ่านครบ (ก่อนเริ่มมี 2445 เทสต์ จำนวนต้องเท่าเดิม ยกเว้น task ที่เพิ่มเทสต์ใหม่)
- ใช้ `git mv` ย้ายไฟล์เสมอ ห้ามลบแล้วสร้างใหม่
- ห้ามแตะ `.env`, `supabase/*.sql`, `work-memory/archive/`, `docs/superpowers/plans/archive/`
- คอมเมนต์ในโค้ด: ภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปรและ log เป็นภาษาอังกฤษ; ห้าม emoji
- commit message ภาษาอังกฤษแบบ conventional (`refactor:`, `fix:`, `docs:`) ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- ห้าม `git push` และห้ามเปิด/ปิด dev server เอง
- ไม่เปลี่ยนชื่อไฟล์ (แค่ย้ายโฟลเดอร์) ยกเว้น `src/users.js` ซึ่งเปลี่ยนเป็น `src/users/service.js` ให้ตรงกับ `bills/service.js` และ `friends/service.js`
- ไม่แตะ `src/menu/`, `src/wallets/`, `src/persona.js` (ตัดสินแล้วว่าคงไว้)

## File Structure หลังทำครบ

```
src/
  app.js, config.js, persona.js          คงที่ราก (จุดประกอบ app และค่าตั้งต้น)
  chat/bot.js, chat/line-reply.js        ย้ายจากราก src/
  users/service.js                        ย้ายจาก src/users.js
  utils/rate-limit.js                     ย้ายจากราก src/
  budgets/alerts.js                       เปลี่ยนชื่อโฟลเดอร์จาก budget/
public/liff/
  index.html, app.mjs, api.mjs, format.mjs, deep-link.mjs, tokens.css, style.css
  dom-harness.mjs, app.*.dom.test.mjs, style.test.mjs, tokens.test.mjs ...  (เทสต์ของไฟล์ที่ราก)
  ui/          banner empty-state icons motion reveal ripple skeleton success-mark swipe tabs
  bills/       bill-form bills-format bills-panel
  budgets/     budget-bulk budget-bulk-panel budget-edit budget-sheet budgets-all-panel budgets-format budgets-panel
  categories/  categories categories-format categories-panel category-icons
  friends/     friends-format friends-panel
  goals/       goals-format goals-panel
  wallets/     wallets-format wallets-panel
  settings/    settings-panel
  vendor/ assets/                         คงเดิม
```

## ลำดับและการทำขนาน

- ทำทีละ task ตามลำดับ 1 -> 6 ใน checkout เดียว ห้ามทำขนาน: ระหว่างย้ายไฟล์ `npm test` ของ task อื่นจะพัง, รันเทสต์สองชุดพร้อมกันกิน RAM เกิน (ดู `vitest.config.mjs`) และ commit พร้อมกันชน `index.lock`
- Task 3 ต้องรอ Task 2 (แก้ `index.js` ทั้งคู่), Task 5 ต้องรอ Task 1 (เทสต์ static ต่อยอดใน `src/app.test.js`)

---

### Task 1: ไม่ส่งไฟล์เทสต์ออกทาง /liff

**Depends on:** none

**Files:**
- Modify: `src/app.js:6-34`
- Test: `src/app.test.js` (ต่อท้าย `describe('GET /liff/', ...)` ที่บรรทัด 240-277)

**Interfaces:**
- Consumes: none
- Produces: `/liff/**/*.test.mjs` และ `/liff/**/dom-harness.mjs` ตอบ 404; ไฟล์อื่นใน `/liff` ทำงานเหมือนเดิม (Task 5 อาศัยว่า regex ครอบคลุมไฟล์ในโฟลเดอร์ย่อยด้วย)

- [ ] **Step 1: Write the failing test**

เพิ่มใน `src/app.test.js` ภายใน `describe('GET /liff/', () => { ... })` ต่อจาก test `'redirects /liff to /liff/ so relative asset paths resolve'`:

```js
  it.each([
    '/liff/format.test.mjs',
    '/liff/app.core.dom.test.mjs',
    '/liff/dom-harness.mjs',
    '/liff/format%2Etest.mjs',
    '/liff/FORMAT.TEST.MJS',
  ])('does not serve test-only file %s', async (path) => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}${path}`);

    expect(res.status).toBe(404);
  });

  it('still serves the module that sits next to a test file', async () => {
    const baseUrl = await start(vi.fn());

    const res = await fetch(`${baseUrl}/liff/format.mjs`);

    expect(res.status).toBe(200);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.js`
Expected: FAIL 5 เคสของ `does not serve test-only file` (ได้ 200 แทน 404); เคส `still serves the module...` PASS

- [ ] **Step 3: Write minimal implementation**

ใน `src/app.js` เพิ่มต่อจากบรรทัด `const LIFF_DIR = ...`:

```js
// เทสต์วางคู่กับโค้ดหน้า LIFF แต่ไม่ใช่ส่วนของหน้าเว็บ จึงไม่ควรให้คนนอกโหลดได้
// ไม่ยึดท้าย path และไม่สนตัวพิมพ์ เพราะ Windows (dev ผ่าน ngrok) เปิด FORMAT.TEST.MJS หรือ format.test.mjs::$DATA ได้
const LIFF_TEST_ONLY = /\.test\.mjs|dom-harness\.mjs/i;

function hideLiffTestFiles(req, res, next) {
  let filePath;
  try {
    // serve-static decode path ก่อนหาไฟล์ ต้องเทียบหลัง decode ไม่งั้น %2E เลี่ยงได้
    filePath = decodeURIComponent(req.path);
  } catch {
    next();
    return;
  }
  if (LIFF_TEST_ONLY.test(filePath)) {
    res.sendStatus(404);
    return;
  }
  next();
}
```

แล้วแก้บรรทัด `app.use('/liff', express.static(LIFF_DIR));` เป็น:

```js
  app.use('/liff', hideLiffTestFiles, express.static(LIFF_DIR));
```


- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app.test.js`
Expected: PASS ทั้งไฟล์ รวมเทสต์เดิม `serves the LIFF page`, `serves page modules as JavaScript`, `serves the mascot image as webp`, `redirects /liff to /liff/`

- [ ] **Step 5: Run full suite and lint**

Run: `npm test` แล้ว `npm run lint`
Expected: เทสต์ผ่าน 2451/2451 (เพิ่ม 6), lint ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/app.test.js
git commit -m "fix(liff): stop serving test files from /liff"
```

---

### Task 2: ย้าย bot.js และ line-reply.js เข้า src/chat/

**Depends on:** none

**Files:**
- Move: `src/bot.js` -> `src/chat/bot.js`
- Move: `src/bot.test.js` -> `src/chat/bot.test.js`
- Move: `src/line-reply.js` -> `src/chat/line-reply.js`
- Move: `src/line-reply.test.js` -> `src/chat/line-reply.test.js`
- Modify: `index.js:7-8` (shared file, Task 3 แก้ไฟล์นี้ด้วย)
- Modify: `src/recurring/run.js:4`

**Interfaces:**
- Consumes: none
- Produces: `require('./src/chat/bot')` ส่ง `createBot`, `SLIP_TTL_MS`, `buildUndoQuickReply` เหมือนเดิม; `require('./src/chat/line-reply')` ส่ง `createReplyText`, `createReplyFlex`, `createPushText`, `createPushFlex` เหมือนเดิม

- [ ] **Step 1: Move the tests first**

```bash
git mv src/bot.test.js src/chat/bot.test.js
git mv src/line-reply.test.js src/chat/line-reply.test.js
```

ใน `src/chat/bot.test.js` แก้ import บรรทัด 23-25 (บรรทัด 22 `from './bot.js'` คงไว้):

```js
import { HELP_MENU_REPLY, HELP_SECTIONS, WEB_COMING_SOON_REPLY, getHelpReply } from '../menu/fixed-replies.js';
import { TEXT_CATEGORIES } from '../parser/categories.js';
import { SAVING_AMOUNT_REPLY, GOAL_GONE_REPLY } from '../goals/chat.js';
```

`src/chat/line-reply.test.js` บรรทัด 2 `from './line-reply.js'` คงไว้

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/chat/bot.test.js src/chat/line-reply.test.js`
Expected: FAIL ทั้งสองไฟล์ด้วย `Failed to load url ./bot.js` / `./line-reply.js` (หรือข้อความ Cannot find module ทำนองเดียวกัน)

- [ ] **Step 3: Move the sources and fix requires**

```bash
git mv src/bot.js src/chat/bot.js
git mv src/line-reply.js src/chat/line-reply.js
```

ใน `src/chat/bot.js` บรรทัด 1-5 และบรรทัดที่ `} = require('./chat/replies');` (บรรทัด 24) เอา `chat/` ออก:

```js
const { createUrlBuilders } = require('./urls');
const { createSupport } = require('./support');
const { createSlipHandlers, SLIP_TTL_MS } = require('./slip');
const { createPostbackHandlers } = require('./postback');
const { createTextHandlers } = require('./text');
```

```js
} = require('./replies');
```

ตรวจว่าไม่มี require อื่นที่ขึ้นต้นด้วย `./` เหลือใน `src/chat/bot.js`: `grep -n "require('\./" src/chat/bot.js` ต้องเห็นแค่ 6 บรรทัดข้างบน ถ้ามีบรรทัดอื่นที่ชี้ไปนอก `chat/` ให้เติม `../`

`src/chat/line-reply.js` ไม่มี relative require (ตรวจด้วย `grep -n "require('\." src/chat/line-reply.js` ต้องไม่เจอ)

ใน `index.js` แก้บรรทัด 7-8:

```js
const { createBot, SLIP_TTL_MS } = require('./src/chat/bot');
const { createReplyText, createReplyFlex, createPushText, createPushFlex } = require('./src/chat/line-reply');
```

ใน `src/recurring/run.js` แก้บรรทัด 4:

```js
const { buildUndoQuickReply } = require('../chat/bot');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chat src/recurring`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Verify nothing still points to the old paths**

Run: `grep -rnE "src/bot'|src/line-reply'|\.\./bot'|\./bot'|\./line-reply'" index.js src scripts`
Expected: ไม่มี output

Run: `node -e "require('./src/chat/bot'); require('./src/chat/line-reply'); require('./src/recurring/run')"`
Expected: ไม่มี output และ exit 0

- [ ] **Step 6: Run full suite, lint and node --check**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: เทสต์ผ่านครบ จำนวนเท่ากับก่อน task นี้, lint ไม่มี error, `node --check` ไม่มี output

- [ ] **Step 7: Commit**

```bash
# rename ถูก stage แล้วจาก git mv ระบุ path เก่าจะได้ fatal: pathspec
git add src/chat index.js src/recurring/run.js
git commit -m "refactor: move bot and line-reply into src/chat"
```

---

### Task 3: ย้าย users.js เป็น src/users/service.js และ rate-limit.js เข้า src/utils/

**Depends on:** Task 2 (แก้ `index.js` เหมือนกัน)

**Files:**
- Move: `src/users.js` -> `src/users/service.js`
- Move: `src/users.test.js` -> `src/users/service.test.js`
- Move: `src/rate-limit.js` -> `src/utils/rate-limit.js`
- Move: `src/rate-limit.test.js` -> `src/utils/rate-limit.test.js`
- Modify: `index.js:12-13` (shared file)

**Interfaces:**
- Consumes: none
- Produces: `require('./src/users/service')` ส่ง `createUserService` เหมือนเดิม; `require('./src/utils/rate-limit')` ส่ง `createRateLimiter`, `createFailureLimiter` เหมือนเดิม

- [ ] **Step 1: Move the tests first**

```bash
mkdir -p src/users
git mv src/users.test.js src/users/service.test.js
git mv src/rate-limit.test.js src/utils/rate-limit.test.js
```

ใน `src/users/service.test.js` แก้บรรทัด 2-3:

```js
import { createUserService } from './service.js';
import { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES } from '../parser/categories.js';
```

`src/utils/rate-limit.test.js` บรรทัด 2 `from './rate-limit.js'` คงไว้

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/users/service.test.js src/utils/rate-limit.test.js`
Expected: FAIL ทั้งสองไฟล์เพราะหา `./service.js` และ `./rate-limit.js` ไม่เจอ

- [ ] **Step 3: Move the sources and fix requires**

```bash
git mv src/users.js src/users/service.js
git mv src/rate-limit.js src/utils/rate-limit.js
```

ใน `src/users/service.js` แก้บรรทัด 1-3:

```js
const { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES, toTextCategories } = require('../parser/categories');
const { categoryKey } = require('../db/transaction-rows');
const { isDefaultWallet } = require('../wallets/wallets');
```

`src/utils/rate-limit.js` ไม่มี relative require (ตรวจด้วย `grep -n "require('\." src/utils/rate-limit.js` ต้องไม่เจอ ถ้าเจอให้เติม `../`)

ใน `index.js` แก้บรรทัด 12-13:

```js
const { createUserService } = require('./src/users/service');
const { createRateLimiter, createFailureLimiter } = require('./src/utils/rate-limit');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/users src/utils/rate-limit.test.js`
Expected: PASS

- [ ] **Step 5: Verify nothing still points to the old paths**

Run: `grep -rnE "src/users'|src/rate-limit'|\.\./users'|\.\./rate-limit'|require\('\./users'\)|require\('\./rate-limit'\)" index.js src scripts`
Expected: ไม่เจอ (`./domains/users` ใน `src/db/repository.js` ไม่ตรง pattern นี้และไม่เกี่ยว)

Run: `node -e "require('./src/users/service'); require('./src/utils/rate-limit')"`
Expected: ไม่มี output และ exit 0

- [ ] **Step 6: Run full suite, lint and node --check**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: เทสต์ผ่านครบ จำนวนเท่าเดิม, lint ไม่มี error

- [ ] **Step 7: Commit**

```bash
git add src/users src/utils index.js
git commit -m "refactor: move user service into src/users and rate-limit into src/utils"
```

---

### Task 4: เปลี่ยนโฟลเดอร์ src/budget/ เป็น src/budgets/

**Depends on:** none

**Files:**
- Move: `src/budget/alerts.js` -> `src/budgets/alerts.js`
- Move: `src/budget/alerts.test.js` -> `src/budgets/alerts.test.js`
- Modify: `src/chat/support.js:1`
- Modify: `src/parser/saved-flex.js:2`

**Interfaces:**
- Consumes: none
- Produces: `require('../budgets/alerts')` ส่ง `budgetMonths`, `findBudgetAlerts`, `formatBudgetAlerts`, `describeBudgetAlert`, `describeBudgetGauge`, `BUDGET_CHECK_FAILED_NOTICE` เหมือนเดิม

- [ ] **Step 1: Move the folder**

```bash
git mv src/budget src/budgets
```

`src/budgets/alerts.js` บรรทัด 1 `require('../parser/format-reply')` ยังถูกเพราะความลึกโฟลเดอร์เท่าเดิม; `src/budgets/alerts.test.js` import `'./alerts.js'` ยังถูก

- [ ] **Step 2: Run the importers' tests to verify they fail**

Run: `npx vitest run src/parser/saved-flex.test.js`
Expected: FAIL ด้วย `Cannot find module '../budget/alerts'`

- [ ] **Step 3: Fix the requires**

`src/chat/support.js` บรรทัด 1:

```js
const { budgetMonths, findBudgetAlerts } = require('../budgets/alerts');
```

`src/parser/saved-flex.js` บรรทัด 2:

```js
const { formatBudgetAlerts, describeBudgetGauge, BUDGET_CHECK_FAILED_NOTICE } = require('../budgets/alerts');
```

- [ ] **Step 4: Verify nothing still points to the old path**

Run: `grep -rn "budget/alerts" index.js src scripts`
Expected: ไม่เจอ

- [ ] **Step 5: Run full suite and lint**

Run: `npm test` แล้ว `npm run lint`
Expected: เทสต์ผ่านครบ จำนวนเท่าเดิม, lint ไม่มี error

- [ ] **Step 6: Commit**

```bash
git add src/budgets src/chat/support.js src/parser/saved-flex.js
git commit -m "refactor: rename src/budget to src/budgets to match other feature folders"
```

---

### Task 5: แยก public/liff/ เป็นโฟลเดอร์ตามฟีเจอร์

**Depends on:** Task 1

**Files:**
- Move: ไฟล์ `.mjs` 31 ไฟล์และ `.test.mjs` ที่คู่กันใน `public/liff/` เข้าโฟลเดอร์ `ui/ bills/ budgets/ categories/ friends/ goals/ wallets/ settings/` (รายชื่อเต็มอยู่ใน `GROUPS` ของสคริปต์ใน Step 3)
- Modify: relative import ในทุกไฟล์ `.mjs` ที่อ้างไฟล์ที่ย้าย รวม `public/liff/app.mjs`, `public/liff/app.*.dom.test.mjs`, `public/liff/dom-harness.mjs` (สคริปต์แก้ให้)
- Modify: path ที่ชี้ออกไป `../../src/` ในเทสต์ที่ย้าย (สคริปต์แก้ให้เป็น `../../../src/...`): `bills-format.test.mjs:26` และ `new URL('../../src/db/domains/bills.js', ...)` ที่บรรทัด 124, `categories-format.test.mjs:4`, `category-icons.test.mjs:3`, `friends-format.test.mjs:12`
- Modify: `src/parser/categories.js:29` คอมเมนต์ที่อ้าง `public/liff/category-icons.mjs` แก้เป็น `public/liff/categories/category-icons.mjs` (แก้มือหลังรันสคริปต์)
- Test: `src/app.test.js` (เพิ่มเคสไฟล์ในโฟลเดอร์ย่อย)
- Temporary: `<scratchpad>/move-liff.mjs` (ไม่ commit)

**Interfaces:**
- Consumes: `LIFF_TEST_ONLY` ใน `src/app.js` จาก Task 1 ต้องตอบ 404 ให้ไฟล์เทสต์ในโฟลเดอร์ย่อยด้วย
- Produces: URL ของ `index.html`, `app.mjs`, `tokens.css`, `style.css`, `assets/mascot.webp` คงเดิม (Rich Menu และ LIFF endpoint ไม่ต้องแก้)

**Browser check:**
- Preconditions: ผู้ใช้เปิด server เอง (`npm start`) ที่ port 3000 ด้วย `.env` ปกติ; ไม่ต้อง login LINE เพราะดูแค่ว่าโมดูลโหลดครบ
- Base URL: `http://localhost:3000`

| # | Action | Expected |
|---|---|---|
| 1 | เปิด DevTools แท็บ Network กรอง `mjs` แล้วเปิด `/liff/` | ทุกแถว `.mjs` มี Status 200 ไม่มี 404 |
| 2 | ดูแท็บ Console | ไม่มี error `Failed to fetch dynamically imported module` หรือ `404` ของไฟล์ `.mjs` |
| 3 | เปิด `/liff/ui/motion.test.mjs` | ได้หน้า Not Found (404) |

- [ ] **Step 1: Write the failing test**

เพิ่มใน `src/app.test.js` ภายใน `describe('GET /liff/', ...)` ต่อจากเทสต์ของ Task 1:

```js
  it('serves modules from feature folders and hides their tests', async () => {
    const baseUrl = await start(vi.fn());

    const moduleRes = await fetch(`${baseUrl}/liff/ui/motion.mjs`);
    const testRes = await fetch(`${baseUrl}/liff/ui/motion.test.mjs`);

    expect(moduleRes.status).toBe(200);
    expect(moduleRes.headers.get('content-type')).toContain('javascript');
    expect(testRes.status).toBe(404);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.js -t "feature folders"`
Expected: FAIL เพราะ `moduleRes.status` เป็น 404 (ยังไม่มี `ui/motion.mjs`)

- [ ] **Step 3: Write the move script into the scratchpad**

สร้างไฟล์ `<scratchpad>/move-liff.mjs` (path เต็มของ scratchpad อยู่ใน system prompt ของ session; ห้ามวางสคริปต์ใน repo):

```js
// ย้ายไฟล์ LIFF เข้าโฟลเดอร์ตามฟีเจอร์ แล้วคำนวณ relative import ใหม่ให้ทุกไฟล์
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'public/liff';
const GROUPS = {
  ui: ['banner', 'empty-state', 'icons', 'motion', 'reveal', 'ripple', 'skeleton', 'success-mark', 'swipe', 'tabs'],
  bills: ['bill-form', 'bills-format', 'bills-panel'],
  budgets: ['budget-bulk', 'budget-bulk-panel', 'budget-edit', 'budget-sheet', 'budgets-all-panel', 'budgets-format', 'budgets-panel'],
  categories: ['categories', 'categories-format', 'categories-panel', 'category-icons'],
  friends: ['friends-format', 'friends-panel'],
  goals: ['goals-format', 'goals-panel'],
  wallets: ['wallets-format', 'wallets-panel'],
  settings: ['settings-panel'],
};
const SPECIFIER = /(from\s*'|import\(\s*'|new URL\(\s*')(\.{1,2}\/[^']+)'/g;

const moves = new Map();
for (const [dir, names] of Object.entries(GROUPS)) {
  for (const name of names) {
    if (!existsSync(path.join(ROOT, `${name}.mjs`))) throw new Error(`missing ${name}.mjs`);
    for (const file of [`${name}.mjs`, `${name}.test.mjs`]) {
      if (existsSync(path.join(ROOT, file))) moves.set(file, `${dir}/${file}`);
    }
  }
}

function listModules(dir) {
  return readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listModules(rel);
    return rel.endsWith('.mjs') ? [rel] : [];
  });
}

function rewrite(oldFile, source) {
  const newFile = moves.get(oldFile) ?? oldFile;
  return source.replace(SPECIFIER, (match, prefix, specifier) => {
    const oldTarget = path.posix.normalize(path.posix.join(path.posix.dirname(oldFile), specifier));
    const newTarget = moves.get(oldTarget) ?? oldTarget;
    let rel = path.posix.relative(path.posix.dirname(newFile), newTarget);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    return `${prefix}${rel}'`;
  });
}

const rewritten = new Map();
for (const file of listModules('')) {
  const source = readFileSync(path.join(ROOT, file), 'utf8');
  const next = rewrite(file, source);
  if (next !== source) rewritten.set(moves.get(file) ?? file, next);
}

for (const [from, to] of moves) {
  mkdirSync(path.join(ROOT, path.posix.dirname(to)), { recursive: true });
  execFileSync('git', ['mv', path.posix.join(ROOT, from), path.posix.join(ROOT, to)], { stdio: 'inherit' });
}
for (const [file, content] of rewritten) writeFileSync(path.join(ROOT, file), content);

console.log(`moved ${moves.size} files, rewrote imports in ${rewritten.size} files`);
```

- [ ] **Step 4: Run the script from the repo root**

Run: `node <scratchpad>/move-liff.mjs`
Expected: บรรทัดสุดท้าย `moved 52 files, rewrote imports in N files` (31 โมดูล + 21 เทสต์ที่มีคู่; ถ้าตัวเลขไม่ใช่ 52 ให้หยุดและเทียบกับ `ls public/liff` ก่อนไปต่อ) และ `git status` เห็นเป็น `renamed:` ไม่ใช่ `deleted:` + `new file:`

ถ้าสคริปต์ throw ก่อน `git mv` ไม่มีไฟล์ไหนถูกแก้ ถ้าพังระหว่าง `git mv` ให้ย้อนด้วย `git restore --source=HEAD --staged --worktree public/liff && git clean -nd public/liff` (ดูผล `-n` ก่อน แล้วขอผู้ใช้ก่อนรัน `git clean -fd`)

- [ ] **Step 5: Spot-check the rewritten imports**

Run: `grep -nE "from '\./(icons|format|api)\.mjs'|from '\.\./(format|api)\.mjs'|from '\.\./ui/icons\.mjs'" public/liff/app.mjs public/liff/ui/tabs.mjs public/liff/bills/bills-panel.mjs`
Expected: `app.mjs` อ้าง `./api.mjs` และ `./format.mjs`; `ui/tabs.mjs` อ้าง `./icons.mjs`; `bills/bills-panel.mjs` อ้าง `../api.mjs`, `../format.mjs`, `../ui/icons.mjs`

Run: `grep -n "src/db/domains/bills.js" public/liff/bills/bills-format.test.mjs`
Expected: `'../../../src/db/domains/bills.js'`

Run: `grep -n "vendor/qrcode" public/liff/friends/friends-panel.mjs`
Expected: `'../vendor/qrcode.mjs'`

- [ ] **Step 5b: Fix the stale path in a server comment**

ใน `src/parser/categories.js` บรรทัด 29 แก้ `public/liff/category-icons.mjs` เป็น `public/liff/categories/category-icons.mjs` (แก้แค่ path ในคอมเมนต์ ข้อความอื่นคงเดิม)

- [ ] **Step 6: Verify every relative import resolves**

Run:
```bash
node -e "
const fs=require('fs'),p=require('path');let bad=0;
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p.join(d,e.name)):e.name.endsWith('.mjs')?[p.join(d,e.name)]:[]);
for(const f of walk('public/liff'))for(const m of fs.readFileSync(f,'utf8').matchAll(/(?:from\s*|import\(\s*|new URL\(\s*)'(\.{1,2}\/[^']+)'/g)){const t=p.resolve(p.dirname(f),m[1]);if(!fs.existsSync(t)){bad++;console.log(f,'->',m[1]);}}
console.log('unresolved:',bad);"
```
Expected: `unresolved: 0`

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run src/app.test.js public/liff`
Expected: PASS ทั้งหมด รวม `serves modules from feature folders and hides their tests`

- [ ] **Step 8: Run full suite, lint and node --check**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check public/liff/app.mjs`
Expected: เทสต์ผ่าน 2452/2452 (หลัง Task 1 บวก 1), lint ไม่มี error

- [ ] **Step 9: Commit**

```bash
git add -A public/liff
git add src/app.test.js src/parser/categories.js
git commit -m "refactor(liff): group page modules into feature folders"
```

- [ ] **Step 10: Ask the user to run the Browser check above**

agent ห้ามเปิด server เอง ให้ส่งตาราง Browser check ให้ผู้ใช้ และบันทึกใน `work-memory/STATE.md` หัวข้อ รอผู้ใช้ทำ (Task 6)

---

### Task 6: อัปเดต README และ STATE

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5

**Files:**
- Modify: `README.md:68-70` (code block หัวข้อ โครงสร้างโฟลเดอร์ บรรทัด 67-78)
- Modify: `work-memory/STATE.md`

**Interfaces:**
- Consumes: path ใหม่ทั้งหมดจาก Task 1-5
- Produces: none

- [ ] **Step 1: Update the README folder tree**

แทนบรรทัด 68-70 ของ `README.md` (`src/ ...` สองบรรทัดและ `public/liff/ ...` หนึ่งบรรทัด) ด้วย:

```
src/                        โค้ดฝั่ง server: app.js, config.js, persona.js ที่ราก ที่เหลือแยกโฟลเดอร์ตามฟีเจอร์:
                            chat (bot.js, line-reply.js), api, parser, query, slip, summary, budgets, recurring,
                            notifications, goals, wallets, friends, bills, users, export, menu, db (domains), utils
public/liff/                หน้าเว็บ LIFF: app.mjs, api.mjs, format.mjs ที่ราก ที่เหลือแยกโฟลเดอร์ ui, bills,
                            budgets, categories, friends, goals, wallets, settings (เทสต์อยู่คู่ไฟล์ และ server ไม่ส่งไฟล์เทสต์ออก)
```

- [ ] **Step 2: Check no doc outside archive still names an old path**

Run: `grep -rnE "src/bot\.js|src/users\.js|src/rate-limit|src/line-reply|src/budget/" README.md SPEC.md CLAUDE.md work-memory/STATE.md work-memory/LEARNED.md work-memory/user-checks.md work-memory/p3-audit.md`
Expected: ไม่เจอ (แผนที่เสร็จแล้วใน `docs/superpowers/plans/` เป็นประวัติ ไม่ต้องแก้)

- [ ] **Step 3: Update STATE.md**

- Done: เพิ่มบรรทัดบนสุด `- [x] จัดโฟลเดอร์ (2026-10-30, <commit แรก>..<commit สุดท้าย>): ไม่ส่งไฟล์เทสต์ทาง /liff, ย้ายไฟล์หลวมใน src/, budget -> budgets, LIFF แยกโฟลเดอร์ตามฟีเจอร์; แผน plans/2026-10-30-folder-structure-cleanup.md; npm test <ผล> lint ผ่าน` และตัดรายการ Done เก่าสุดให้เหลือ 5
- รอผู้ใช้ทำ: เพิ่มข้อ `15. หลังจัดโฟลเดอร์ LIFF: เปิด /liff/ ดู Network ไม่มี .mjs 404 และส่งข้อความใน LINE ดูว่าบอทยังตอบปกติ`
- Next: แก้บรรทัด `แยก public/liff/app.mjs` ให้ชี้ว่าโฟลเดอร์ฟีเจอร์พร้อมแล้ว ส่วนที่แยกออกจาก app.mjs ให้วางในโฟลเดอร์ฟีเจอร์ที่ตรงกัน

- [ ] **Step 4: Commit**

```bash
git add README.md work-memory/STATE.md
git commit -m "docs: record the folder cleanup in README and STATE"
```
