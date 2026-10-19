# LIFF Chart and CSV Export (Step 6b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำขั้นที่ 6 รอบที่สอง (6b) ของ `SPEC.md`: หน้าเว็บ LIFF มีกราฟแท่งแนวนอนตามหมวด (แท็บ รายจ่าย/รายรับ) ยอดรวมและกราฟคิดด้วย SQL แจ้งเมื่อรายการของเดือนถูกตัด และ export CSV ของเดือนที่เลือกผ่านลิงก์ใช้ครั้งเดียวที่เปิดใน Safari

**Architecture:** `GET /api/transactions` ส่ง `summary` (จาก SQL function `summarize_transactions` ที่มีอยู่แล้ว) และ `truncated` มาพร้อมรายการ หน้าเว็บวาดกราฟด้วย HTML/CSS จาก `summary` ส่วน export: หน้าเว็บเรียก `POST /api/exports` ได้ path `/exports/<token>` แล้วเปิดใน browser ภายนอกด้วย `liff.openWindow({ external: true })` route `GET /exports/:token` (ไม่ต้องมี ID token เพราะ Safari ส่ง header ไม่ได้) claim ลิงก์ในตาราง `export_links` แบบใช้ครั้งเดียวภายใน 5 นาที แล้วตอบไฟล์ CSV

**Tech Stack:** Node.js 22 (CommonJS), Express 5.2.1, @supabase/supabase-js 2.117.2, LIFF SDK v2 (CDN), Vitest 5.0.2, `node:crypto`

## Global Constraints

- ผู้ใช้ใช้ Windows; server เป็น CommonJS; ไฟล์เทสต์ใช้ `import`; ห้าม `vi.mock` กับ module ที่ถูก `require`; เทสต์วางคู่กับไฟล์
- ไฟล์ JavaScript ฝั่งหน้าเว็บอยู่ใน `public/liff/` เป็น ES module นามสกุล `.mjs` และเทสต์คู่กันเป็น `*.test.mjs`
- ไม่เพิ่ม dependency ใหม่ใน `package.json`; กราฟทำด้วย HTML/CSS ไม่โหลด library; LIFF SDK จาก CDN ของ LINE เท่านั้น
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม"; ชื่อตัวแปร/function/log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม agent อ่านหรือแก้ `.env`; ห้าม agent start/restart/kill server; ห้าม agent รัน SQL กับ Supabase จริง
- ห้าม `git add -f` และห้าม commit ไฟล์ใต้ `.superpowers/`
- `/api/*` ต้องมี LINE ID token ทุก route ยกเว้น `GET /api/config`; user id มาจาก token เท่านั้น; ทุก query กรองด้วย user id ของผู้ขอ
- `/api` router parse JSON เอง (`express.json({ limit: '10kb' })`) และตอบ JSON เสมอ; `app.js` ห้ามใส่ parser ไว้หน้า `/api`
- หน้าเว็บส่ง header `ngrok-skip-browser-warning: 1` ทุก request ไป `/api` (ใช้ `NGROK_SKIP_WARNING_HEADERS` ที่มีอยู่ใน `public/liff/api.mjs`)
- หน้าเว็บใส่ข้อความจากข้อมูลผู้ใช้ด้วย `textContent` เท่านั้น ห้าม `innerHTML`
- ยอดรวมและกราฟบนหน้าเว็บมาจาก `summarize_transactions` (SQL) ไม่คิดจากรายการที่แสดง
- กราฟ: แท่งแนวนอน เรียงยอดมากไปน้อย แสดงชื่อหมวด ยอดเงิน และ % ของประเภทนั้น; แท็บ `รายจ่าย` / `รายรับ` เปิดมาเป็น `รายจ่าย`; สีรายจ่าย `#c62828` รายรับ `#13853a`
- CSV: เดือนที่เลือกอยู่เท่านั้น; ชื่อไฟล์ `transactions-YYYY-MM.csv`; UTF-8 ขึ้นต้นด้วย BOM (`﻿`); บรรทัดคั่นด้วย `\r\n`; หัวตาราง `วันที่,ประเภท,หมวด,จำนวนเงิน,โน้ต`; วันที่ `YYYY-MM-DD`; ประเภท `รายจ่าย`/`รายรับ`; จำนวนเงินทศนิยม 2 ตำแหน่ง; เรียงวันที่เก่าไปใหม่; ช่องที่ขึ้นต้นด้วย `=` `+` `-` `@` tab หรือ CR ใส่ `'` นำหน้า (กัน CSV injection)
- ลิงก์ export: token สุ่ม 32 byte เป็น base64url (43 ตัว); database เก็บแค่ SHA-256 hex ของ token; ใช้ได้ครั้งเดียว; หมดอายุ 5 นาที; ลิงก์ผิดรูป ไม่มีอยู่ หมดอายุ หรือใช้แล้ว ตอบ `410` ข้อความเดียวกัน `ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง`
- ngrok ของผู้ใช้มี URL คงที่ ไม่ต้องบอกให้แก้ Webhook URL หรือ LIFF Endpoint URL
- ขั้นสุดท้ายของแผน: อัปเดต `work-memory/STATE.md` (controller ทำ)
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `src/export/csv.js` | สร้างข้อความ CSV และชื่อไฟล์ | 1 |
| `src/export/link-token.js` | สร้าง/hash/ตรวจรูปแบบ token ของลิงก์ export | 2 |
| `supabase/004_export_links.sql`, `src/db/repository.js` | ตาราง `export_links`, นับรายการ, อ่านทุกรายการทีละหน้า, สร้าง/claim ลิงก์ | 3 |
| `src/api/router.js` | `summary` + `truncated` ใน `/transactions`, `POST /exports` | 4 |
| `src/export/router.js` | `GET /exports/:token` ตอบไฟล์ CSV | 5 |
| `public/liff/format.mjs`, `public/liff/api.mjs` | ฟังก์ชัน pure ของกราฟ/ยอดรวม/ข้อความ export, `createExport` | 6 |
| `public/liff/index.html`, `style.css`, `app.mjs`, `format.mjs`, `format.test.mjs` | UI กราฟ แท็บ หมายเหตุ ปุ่ม Export; เอา `totals` เดิมออก | 7 |
| `src/app.js`, `index.js` | mount `/exports` และต่อ dependency | 8 |

## Dependency Graph

- Task 1, 2, 3, 6 ทำขนานกันได้
- Task 4 รอ Task 2, 3
- Task 5 รอ Task 1, 2, 3
- Task 7 รอ Task 4, 6 (แตะ `format.mjs` ต่อจาก Task 6)
- Task 8 รอ Task 5 (แตะ `index.js`)
- Task 7 กับ Task 8 ทำขนานกันได้ (ไฟล์ไม่ซ้ำกัน)
- Task 9 (ผู้ใช้รัน SQL + ตรวจในแอป LINE) รอทุก task

---

### Task 1: สร้างข้อความ CSV

**Depends on:** none

**Files:**
- Create: `src/export/csv.js`
- Test: `src/export/csv.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `buildTransactionsCsv(rows) => string` โดย `rows` คือ `[{ occurredOn: 'YYYY-MM-DD', type: 'expense'|'income', categoryName: string, amount: number, note: string|null }]` ตามลำดับที่ต้องการในไฟล์; `exportFileName(month) => 'transactions-YYYY-MM.csv'`

- [ ] **Step 1: Write the failing test**

`src/export/csv.test.js`

```js
import { describe, it, expect } from 'vitest';
import { buildTransactionsCsv, exportFileName } from './csv.js';

const HEADER = 'วันที่,ประเภท,หมวด,จำนวนเงิน,โน้ต';

function row(overrides = {}) {
  return { occurredOn: '2026-09-29', type: 'expense', categoryName: 'อาหาร', amount: 60, note: 'กินข้าว', ...overrides };
}

describe('buildTransactionsCsv', () => {
  it('starts with a BOM and the Thai header row', () => {
    const csv = buildTransactionsCsv([]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toBe(`﻿${HEADER}\r\n`);
  });

  it('writes one line per entry with CRLF line endings', () => {
    const csv = buildTransactionsCsv([row(), row({ type: 'income', categoryName: 'เงินเดือน', amount: 25000.5, note: '' })]);

    expect(csv).toBe(
      `﻿${HEADER}\r\n2026-09-29,รายจ่าย,อาหาร,60.00,กินข้าว\r\n2026-09-29,รายรับ,เงินเดือน,25000.50,\r\n`
    );
  });

  it('writes an empty note when the note is null', () => {
    expect(buildTransactionsCsv([row({ note: null })])).toContain('2026-09-29,รายจ่าย,อาหาร,60.00,\r\n');
  });

  it('quotes cells that contain commas, quotes or line breaks', () => {
    const csv = buildTransactionsCsv([row({ note: 'ข้าว, "พิเศษ"\nมื้อเย็น' })]);

    expect(csv).toContain('2026-09-29,รายจ่าย,อาหาร,60.00,"ข้าว, ""พิเศษ""\nมื้อเย็น"\r\n');
  });

  it('prefixes cells that a spreadsheet could run as a formula', () => {
    const csv = buildTransactionsCsv([
      row({ note: '=SUM(A1:A9)' }),
      row({ note: '+1' }),
      row({ note: '-5' }),
      row({ note: '@cmd' }),
    ]);

    expect(csv).toContain(",'=SUM(A1:A9)\r\n");
    expect(csv).toContain(",'+1\r\n");
    expect(csv).toContain(",'-5\r\n");
    expect(csv).toContain(",'@cmd\r\n");
  });
});

describe('exportFileName', () => {
  it('names the file after the month', () => {
    expect(exportFileName('2026-09')).toBe('transactions-2026-09.csv');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/export/csv.test.js`
Expected: FAIL เพราะหา `./csv.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/export/csv.js`

```js
const HEADER = ['วันที่', 'ประเภท', 'หมวด', 'จำนวนเงิน', 'โน้ต'];
const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };
// BOM ทำให้ Excel เปิดไฟล์เป็น UTF-8 และแสดงภาษาไทยถูก
const BOM = '﻿';
// ข้อความที่ขึ้นต้นด้วยอักขระเหล่านี้ spreadsheet อาจรันเป็นสูตร (CSV injection)
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(value) {
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildTransactionsCsv(rows) {
  const lines = [
    HEADER,
    ...rows.map((row) => [row.occurredOn, TYPE_LABELS[row.type], row.categoryName, row.amount.toFixed(2), row.note || '']),
  ];
  return `${BOM}${lines.map((cells) => cells.map(escapeCell).join(',')).join('\r\n')}\r\n`;
}

function exportFileName(month) {
  return `transactions-${month}.csv`;
}

module.exports = { buildTransactionsCsv, exportFileName };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/export/csv.test.js`
Expected: PASS 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/export/csv.js src/export/csv.test.js
git commit -m "feat: build CSV text for exported entries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Token ของลิงก์ export

**Depends on:** none

**Files:**
- Create: `src/export/link-token.js`
- Test: `src/export/link-token.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `createLinkToken() => { token: string (43 ตัว base64url), tokenHash: string (64 ตัว hex) }`; `hashLinkToken(token) => string (64 ตัว hex)`; `isLinkToken(value) => boolean`; `EXPORT_LINK_TTL_MS = 300000`

- [ ] **Step 1: Write the failing test**

`src/export/link-token.test.js`

```js
import { describe, it, expect } from 'vitest';
import { createLinkToken, hashLinkToken, isLinkToken, EXPORT_LINK_TTL_MS } from './link-token.js';

describe('createLinkToken', () => {
  it('returns a 43 character base64url token and its hash', () => {
    const { token, tokenHash } = createLinkToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(hashLinkToken(token));
  });

  it('returns a different token every time', () => {
    expect(createLinkToken().token).not.toBe(createLinkToken().token);
  });
});

describe('hashLinkToken', () => {
  it('returns the SHA-256 hex digest', () => {
    expect(hashLinkToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('isLinkToken', () => {
  it('accepts a generated token', () => {
    expect(isLinkToken(createLinkToken().token)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLinkToken('short')).toBe(false);
    expect(isLinkToken(`${'a'.repeat(42)}!`)).toBe(false);
    expect(isLinkToken('a'.repeat(44))).toBe(false);
    expect(isLinkToken(undefined)).toBe(false);
  });
});

describe('EXPORT_LINK_TTL_MS', () => {
  it('is five minutes', () => {
    expect(EXPORT_LINK_TTL_MS).toBe(5 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/export/link-token.test.js`
Expected: FAIL เพราะหา `./link-token.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/export/link-token.js`

```js
const crypto = require('node:crypto');

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const EXPORT_LINK_TTL_MS = 5 * 60 * 1000;

// เก็บแค่ hash ใน database ถ้าข้อมูลในตารางรั่วก็เอาไปดาวน์โหลดไม่ได้
function hashLinkToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createLinkToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashLinkToken(token) };
}

function isLinkToken(value) {
  return typeof value === 'string' && TOKEN_PATTERN.test(value);
}

module.exports = { createLinkToken, hashLinkToken, isLinkToken, EXPORT_LINK_TTL_MS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/export/link-token.test.js`
Expected: PASS 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/export/link-token.js src/export/link-token.test.js
git commit -m "feat: create one-time export link tokens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ตาราง export_links และ repository

**Depends on:** none

**Files:**
- Create: `supabase/004_export_links.sql`
- Modify: `src/db/repository.js`
- Test: `src/db/repository.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces (ใน object ที่ `createRepository(supabase)` คืน):
  - `listTransactions(userId, from, to) => Promise<{ transactions: Transaction[], totalCount: number }>` (เปลี่ยนจากเดิมที่คืน array; ผู้เรียกเดิมมีแค่ `src/api/router.js` ซึ่ง Task 4 แก้)
  - `listAllTransactions(userId, from, to) => Promise<Transaction[]>` เรียงวันที่เก่าไปใหม่ อ่านทีละ 1000 แถวจนครบ
  - `createExportLink({ tokenHash, userId, month, expiresAt }) => Promise<void>` (`expiresAt` เป็น ISO string)
  - `claimExportLink(tokenHash, nowIso) => Promise<{ userId, month } | null>`
  - `Transaction = { id, type, amount: number, note, occurredOn, categoryId }`

- [ ] **Step 1: Write the SQL file**

`supabase/004_export_links.sql`

```sql
-- รันใน Supabase SQL Editor ต่อจาก 003 เพื่อเก็บลิงก์ดาวน์โหลด CSV ที่ใช้ได้ครั้งเดียว

create table public.export_links (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ให้ลบ user แล้ว cascade มาลบลิงก์ได้เร็ว
create index export_links_user_id_idx on public.export_links (user_id);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.export_links enable row level security;
```

- [ ] **Step 2: Write the failing tests**

ใน `src/db/repository.test.js`:

1. ใน `fakeSupabase` แก้รายการ method ให้มี `range`, `is`, `gt` ด้วย:

```js
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete', 'update', 'gte', 'lte', 'order', 'range', 'is', 'gt']) {
```

2. ต่อท้าย `fakeSupabase` เพิ่ม helper นี้

```js
// เหมือน fakeSupabase แต่ await แต่ละครั้งได้ผลลัพธ์ถัดไป ใช้กับ query ที่อ่านทีละหน้า
function fakeSupabasePages(results) {
  const calls = [];
  let index = 0;
  const builder = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range']) {
    builder[method] = vi.fn((...args) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.then = (resolve, reject) => Promise.resolve(results[index++]).then(resolve, reject);
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
  };
  return { supabase, calls };
}
```

3. แทนที่ `describe('repository.listTransactions', ...)` ทั้งบล็อกด้วย

```js
describe('repository.listTransactions', () => {
  it('reads this user rows in the date range, newest first, with the total count', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1,
      error: null,
    });

    const result = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(result).toEqual({
      transactions: [
        { id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c1' },
      ],
      totalCount: 1,
    });
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'occurred_on', '2026-09-01'],
      ['lte', 'occurred_on', '2026-09-30'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
    ]);
  });

  it('returns number amounts when PostgREST sends numbers', async () => {
    const { supabase } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: 60.5, note: null, occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1,
      error: null,
    });

    const { transactions } = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(transactions[0].amount).toBe(60.5);
  });

  it('reports a total count larger than the rows returned', async () => {
    const { supabase } = fakeSupabase({
      data: [{ id: 't1', type: 'expense', amount: 1, note: '', occurred_on: '2026-09-29', category_id: 'c1' }],
      count: 1500,
      error: null,
    });

    const { totalCount } = await createRepository(supabase).listTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(totalCount).toBe(1500);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).listTransactions('user-1', 'a', 'b');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listTransactions failed: boom');
  });
});

describe('repository.listAllTransactions', () => {
  const dbRow = { id: 't1', type: 'expense', amount: '60.00', note: 'กินข้าว', occurred_on: '2026-09-01', category_id: 'c1' };

  it('reads this user rows oldest first in pages of 1000 until a short page', async () => {
    const fullPage = Array.from({ length: 1000 }, () => dbRow);
    const { supabase, calls } = fakeSupabasePages([
      { data: fullPage, error: null },
      { data: [dbRow], error: null },
    ]);

    const rows = await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30');

    expect(rows).toHaveLength(1001);
    expect(rows[0]).toEqual({ id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-01', categoryId: 'c1' });
    expect(calls.slice(0, 9)).toEqual([
      ['from', 'transactions'],
      ['select', 'id, type, amount, note, occurred_on, category_id'],
      ['eq', 'user_id', 'user-1'],
      ['gte', 'occurred_on', '2026-09-01'],
      ['lte', 'occurred_on', '2026-09-30'],
      ['order', 'occurred_on', { ascending: true }],
      ['order', 'created_at', { ascending: true }],
      ['order', 'id', { ascending: true }],
      ['range', 0, 999],
    ]);
    expect(calls[17]).toEqual(['range', 1000, 1999]);
    expect(calls).toHaveLength(18);
  });

  it('stops after one page when the month has fewer than 1000 rows', async () => {
    const { supabase, calls } = fakeSupabasePages([{ data: [], error: null }]);

    expect(await createRepository(supabase).listAllTransactions('user-1', '2026-09-01', '2026-09-30')).toEqual([]);
    expect(calls.filter((call) => call[0] === 'range')).toEqual([['range', 0, 999]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabasePages([{ data: null, error: { message: 'boom' } }]);

    const promise = createRepository(supabase).listAllTransactions('user-1', 'a', 'b');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listAllTransactions failed: boom');
  });
});

describe('repository.createExportLink', () => {
  it('stores the token hash for this user and month', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).createExportLink({
      tokenHash: 'hash-1',
      userId: 'user-1',
      month: '2026-09',
      expiresAt: '2026-09-30T03:05:00.000Z',
    });

    expect(calls).toEqual([
      ['from', 'export_links'],
      ['insert', { token_hash: 'hash-1', user_id: 'user-1', month: '2026-09', expires_at: '2026-09-30T03:05:00.000Z' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).createExportLink({
      tokenHash: 'h',
      userId: 'u',
      month: '2026-09',
      expiresAt: 'x',
    });

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database createExportLink failed: boom');
  });
});

describe('repository.claimExportLink', () => {
  it('marks an unused, unexpired link as used in one update and returns its owner and month', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1', month: '2026-09' }], error: null });

    const link = await createRepository(supabase).claimExportLink('hash-1', '2026-09-30T03:01:00.000Z');

    expect(link).toEqual({ userId: 'user-1', month: '2026-09' });
    expect(calls).toEqual([
      ['from', 'export_links'],
      ['update', { used_at: '2026-09-30T03:01:00.000Z' }],
      ['eq', 'token_hash', 'hash-1'],
      ['is', 'used_at', null],
      ['gt', 'expires_at', '2026-09-30T03:01:00.000Z'],
      ['select', 'user_id, month'],
    ]);
  });

  it('returns null when no link matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).claimExportLink('hash-1', '2026-09-30T03:01:00.000Z')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).claimExportLink('hash-1', 'x');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database claimExportLink failed: boom');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL ในเทสต์ของ `listTransactions` (ยังคืน array), `listAllTransactions`, `createExportLink`, `claimExportLink` (ยังไม่มี function) ส่วนเทสต์อื่นผ่าน

- [ ] **Step 4: Write minimal implementation**

ใน `src/db/repository.js`:

1. ใต้บรรทัด `require` บนสุดของไฟล์ (นอก `createRepository`) เพิ่ม

```js
const TRANSACTION_COLUMNS = 'id, type, amount, note, occurred_on, category_id';
// PostgREST ตัดผลลัพธ์ตาม max-rows (ค่าเริ่มต้นของ Supabase คือ 1000) จึงต้องอ่านทีละหน้าเมื่อต้องการครบทุกแถว
const EXPORT_PAGE_SIZE = 1000;

// แปลงเป็น number เผื่อไว้ ให้ได้ชนิดเดียวกันเสมอไม่ว่า PostgREST จะส่งแบบไหน
function toTransaction(row) {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    note: row.note,
    occurredOn: row.occurred_on,
    categoryId: row.category_id,
  };
}
```

2. แทนที่ `listTransactions` ทั้ง function ด้วย

```js
  async function listTransactions(userId, from, to) {
    const { data, count, error } = await supabase
      .from('transactions')
      .select(TRANSACTION_COLUMNS, { count: 'exact' })
      .eq('user_id', userId)
      .gte('occurred_on', from)
      .lte('occurred_on', to)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false });
    throwIfError('listTransactions', error);
    return { transactions: data.map(toTransaction), totalCount: count };
  }

  async function listAllTransactions(userId, from, to) {
    const rows = [];
    for (let start = 0; ; start += EXPORT_PAGE_SIZE) {
      // เรียงด้วย id ด้วยเพื่อให้ลำดับคงที่ระหว่างหน้า ไม่ให้แถวซ้ำหรือหาย
      const { data, error } = await supabase
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('user_id', userId)
        .gte('occurred_on', from)
        .lte('occurred_on', to)
        .order('occurred_on', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(start, start + EXPORT_PAGE_SIZE - 1);
      throwIfError('listAllTransactions', error);
      rows.push(...data.map(toTransaction));
      if (data.length < EXPORT_PAGE_SIZE) {
        return rows;
      }
    }
  }

  async function createExportLink({ tokenHash, userId, month, expiresAt }) {
    const { error } = await supabase
      .from('export_links')
      .insert({ token_hash: tokenHash, user_id: userId, month, expires_at: expiresAt });
    throwIfError('createExportLink', error);
  }

  // update แบบมีเงื่อนไขในคำสั่งเดียว กันลิงก์เดียวถูกใช้สองครั้งพร้อมกัน
  async function claimExportLink(tokenHash, nowIso) {
    const { data, error } = await supabase
      .from('export_links')
      .update({ used_at: nowIso })
      .eq('token_hash', tokenHash)
      .is('used_at', null)
      .gt('expires_at', nowIso)
      .select('user_id, month');
    throwIfError('claimExportLink', error);
    return data.length > 0 ? { userId: data[0].user_id, month: data[0].month } : null;
  }
```

3. ใน object ที่ `createRepository` คืน เพิ่ม `listAllTransactions,` `createExportLink,` `claimExportLink,` ต่อจาก `listTransactions,`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

Run: `npm test`
Expected: `src/api/router.test.js` อาจยังผ่าน (router test ใช้ repository ปลอม) ถ้ามีไฟล์อื่นล้มเพราะ shape ของ `listTransactions` ให้บันทึกไว้ใน report (Task 4 จะแก้ router)

- [ ] **Step 6: Commit**

```bash
git add supabase/004_export_links.sql src/db/repository.js src/db/repository.test.js
git commit -m "feat: count month entries, page through exports and store one-time export links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API — summary, truncated และ POST /exports

**Depends on:** Task 2, Task 3

**Files:**
- Modify: `src/api/router.js`
- Test: `src/api/router.test.js`

**Interfaces:**
- Consumes: `repository.listTransactions(userId, from, to) => { transactions, totalCount }`, `repository.summarizeTransactions(userId, from, to) => [{ type, category, total, entryCount }]` (มีอยู่แล้ว), `repository.createExportLink({ tokenHash, userId, month, expiresAt })` (Task 3), `createLinkToken()`, `EXPORT_LINK_TTL_MS` (Task 2)
- Produces:
  - `createApiRouter({ verifyIdToken, users, repository, liffId, logger, now = () => new Date() })`
  - `GET /api/transactions?month=YYYY-MM` → `200 { transactions: [...เดิม + categoryName], summary: [{ type, category, total, entryCount }], truncated: boolean }`
  - `POST /api/exports` body `{ month: 'YYYY-MM' }` → `201 { path: '/exports/<token>' }`; month ผิด → `400 { error: 'Invalid month' }`

- [ ] **Step 1: Write the failing tests**

ใน `src/api/router.test.js`:

1. เพิ่ม import ต่อจาก import ของ `createApiRouter`

```js
import { hashLinkToken } from '../export/link-token.js';
```

2. ใน `setup()` แทนที่ `listTransactions` เดิม และเพิ่ม mock ใหม่ใน `repository` กับ `now`

```js
    repository: {
      listCategories: vi.fn().mockResolvedValue(CATEGORIES),
      listTransactions: vi.fn().mockResolvedValue({
        transactions: [
          { id: ID, type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food' },
        ],
        totalCount: 1,
      }),
      summarizeTransactions: vi.fn().mockResolvedValue([
        { type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 },
      ]),
      updateTransaction: vi.fn().mockResolvedValue(true),
      deleteTransaction: vi.fn().mockResolvedValue(true),
      createExportLink: vi.fn().mockResolvedValue(),
    },
    liffId: 'liff-123',
    logger: { error: vi.fn() },
    now: () => new Date('2026-09-30T03:00:00.000Z'),
```

3. ใน `describe('GET /api/transactions')` แทนที่เทสต์ `returns the month entries with their category names` ด้วย 2 เทสต์นี้

```js
  it('returns the month entries with category names, the SQL summary and truncated false', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-09');

    expect(res.status).toBe(200);
    expect(deps.repository.listTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(await res.json()).toEqual({
      transactions: [
        { id: ID, type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food', categoryName: 'อาหาร' },
      ],
      summary: [{ type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 }],
      truncated: false,
    });
  });

  it('flags truncated when the month has more rows than were returned', async () => {
    const deps = setup();
    deps.repository.listTransactions.mockResolvedValue({ transactions: [], totalCount: 1500 });
    const base = await start(deps);

    const res = await call(base, '/transactions?month=2026-09');

    expect((await res.json()).truncated).toBe(true);
  });
```

และในเทสต์ `returns 400 for an invalid month` ของกลุ่มนี้ เพิ่มบรรทัดท้าย

```js
    expect(deps.repository.summarizeTransactions).not.toHaveBeenCalled();
```

4. ต่อจาก `describe('DELETE /api/transactions/:id', ...)` เพิ่ม

```js
describe('POST /api/exports', () => {
  it('stores a hashed one-time link for this user that expires in five minutes', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-09' } });

    expect(res.status).toBe(201);
    const { path } = await res.json();
    expect(path).toMatch(/^\/exports\/[A-Za-z0-9_-]{43}$/);
    const token = path.slice('/exports/'.length);
    expect(deps.repository.createExportLink).toHaveBeenCalledWith({
      tokenHash: hashLinkToken(token),
      userId: 'user-1',
      month: '2026-09',
      expiresAt: '2026-09-30T03:05:00.000Z',
    });
  });

  it('returns 400 for an invalid month without storing a link', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-13' } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid month' });
    expect(deps.repository.createExportLink).not.toHaveBeenCalled();
  });

  it('requires a verified token', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/exports', { method: 'POST', body: { month: '2026-09' }, token: null });

    expect(res.status).toBe(401);
    expect(deps.repository.createExportLink).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/router.test.js`
Expected: FAIL ในเทสต์ของ `/transactions` (ยังไม่มี `summary`/`truncated` และ `transactions.map` ล้มเพราะ mock เป็น object) และ `POST /api/exports` (ได้ 404)

- [ ] **Step 3: Write minimal implementation**

ใน `src/api/router.js`:

1. เพิ่ม require ต่อจาก require ของ `./validate`

```js
const { createLinkToken, EXPORT_LINK_TTL_MS } = require('../export/link-token');
```

2. แก้บรรทัดประกาศ function เป็น

```js
function createApiRouter({ verifyIdToken, users, repository, liffId, logger = console, now = () => new Date() }) {
```

3. แทนที่ route `router.get('/transactions', ...)` ทั้งหมดด้วย

```js
  router.get('/transactions', async (req, res) => {
    const range = parseMonth(req.query.month);
    if (!range) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const [{ transactions, totalCount }, categories, summary] = await Promise.all([
      repository.listTransactions(req.userId, range.from, range.to),
      repository.listCategories(req.userId),
      repository.summarizeTransactions(req.userId, range.from, range.to),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    res.json({
      transactions: transactions.map((item) => ({ ...item, categoryName: names.get(item.categoryId) || '' })),
      // ยอดรวมและกราฟใช้ summary จาก SQL จึงนับครบแม้รายการที่ส่งมาถูกตัดตาม max-rows
      summary,
      truncated: totalCount > transactions.length,
    });
  });
```

4. ต่อจาก route `router.delete('/transactions/:id', ...)` เพิ่ม

```js
  router.post('/exports', async (req, res) => {
    const month = req.body && req.body.month;
    if (!parseMonth(month)) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const { token, tokenHash } = createLinkToken();
    await repository.createExportLink({
      tokenHash,
      userId: req.userId,
      month,
      expiresAt: new Date(now().getTime() + EXPORT_LINK_TTL_MS).toISOString(),
    });
    // ส่งกลับแค่ path ให้หน้าเว็บต่อ origin เอง เพราะ server ไม่รู้โดเมนของ ngrok
    res.status(201).json({ path: `/exports/${token}` });
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/router.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

Run: `npm test`
Expected: PASS ทุกไฟล์ ยกเว้นไฟล์ของ task อื่นที่ยังทำไม่เสร็จ (ให้บันทึกใน report)

- [ ] **Step 5: Commit**

```bash
git add src/api/router.js src/api/router.test.js
git commit -m "feat: return month summary and truncation, and issue export links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Route ดาวน์โหลด CSV

**Depends on:** Task 1, Task 2, Task 3

**Files:**
- Create: `src/export/router.js`
- Test: `src/export/router.test.js`

**Interfaces:**
- Consumes: `repository.claimExportLink(tokenHash, nowIso)`, `repository.listAllTransactions(userId, from, to)`, `repository.listCategories(userId)`; `hashLinkToken`, `isLinkToken` (Task 2); `buildTransactionsCsv`, `exportFileName` (Task 1); `parseMonth` จาก `src/api/validate.js`
- Produces: `createExportRouter({ repository, now = () => new Date(), logger = console }) => express.Router` ที่ตอบ `GET /:token` (Task 8 mount ที่ `/exports`)

- [ ] **Step 1: Write the failing test**

`src/export/router.test.js`

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createExportRouter } from './router.js';
import { createLinkToken, hashLinkToken } from './link-token.js';

const EXPIRED = 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง';

let server;

function setup(overrides = {}) {
  return {
    repository: {
      claimExportLink: vi.fn().mockResolvedValue({ userId: 'user-1', month: '2026-09' }),
      listAllTransactions: vi.fn().mockResolvedValue([
        { id: 't1', type: 'expense', amount: 60, note: 'กินข้าว', occurredOn: '2026-09-29', categoryId: 'c-food' },
      ]),
      listCategories: vi.fn().mockResolvedValue([{ id: 'c-food', name: 'อาหาร', type: 'expense' }]),
    },
    now: () => new Date('2026-09-30T03:01:00.000Z'),
    logger: { error: vi.fn() },
    ...overrides,
  };
}

async function start(deps) {
  const app = express();
  app.use('/exports', createExportRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/exports`;
}

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe('GET /exports/:token', () => {
  it('claims the link and downloads the month as CSV with a BOM', async () => {
    const deps = setup();
    const base = await start(deps);
    const { token } = createLinkToken();

    const res = await fetch(`${base}/${token}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="transactions-2026-09.csv"');
    expect(res.headers.get('cache-control')).toBe('no-store');
    // อ่านเป็น byte เพราะ res.text() ตัด BOM ทิ้ง
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('2026-09-29,รายจ่าย,อาหาร,60.00,กินข้าว\r\n');
    expect(deps.repository.claimExportLink).toHaveBeenCalledWith(hashLinkToken(token), '2026-09-30T03:01:00.000Z');
    expect(deps.repository.listAllTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-30');
    expect(deps.repository.listCategories).toHaveBeenCalledWith('user-1');
  });

  it('returns 410 for a malformed token without touching the database', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await fetch(`${base}/not-a-token`);

    expect(res.status).toBe(410);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe(EXPIRED);
    expect(deps.repository.claimExportLink).not.toHaveBeenCalled();
  });

  it('returns 410 when the link is unknown, expired or already used', async () => {
    const deps = setup();
    deps.repository.claimExportLink.mockResolvedValue(null);
    const base = await start(deps);

    const res = await fetch(`${base}/${createLinkToken().token}`);

    expect(res.status).toBe(410);
    expect(await res.text()).toBe(EXPIRED);
    expect(deps.repository.listAllTransactions).not.toHaveBeenCalled();
  });

  it('returns 500 text and logs when the database fails', async () => {
    const deps = setup();
    const error = new Error('db down');
    deps.repository.listAllTransactions.mockRejectedValue(error);
    const base = await start(deps);

    const res = await fetch(`${base}/${createLinkToken().token}`);

    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Export ไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(deps.logger.error).toHaveBeenCalledWith('Export failed', error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/export/router.test.js`
Expected: FAIL เพราะหา `./router.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/export/router.js`

```js
const express = require('express');
const { parseMonth } = require('../api/validate');
const { hashLinkToken, isLinkToken } = require('./link-token');
const { buildTransactionsCsv, exportFileName } = require('./csv');

const EXPIRED_MESSAGE = 'ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง';
const FAILED_MESSAGE = 'Export ไม่สำเร็จ ลองใหม่อีกครั้ง';

function sendText(res, status, text) {
  res.status(status).type('text/plain; charset=utf-8').set('Cache-Control', 'no-store').send(text);
}

// เปิดใน Safari ซึ่งส่ง ID token ไม่ได้ จึงใช้ลิงก์ใช้ครั้งเดียวแทนการยืนยันตัวตน
function createExportRouter({ repository, now = () => new Date(), logger = console }) {
  const router = express.Router();

  router.get('/:token', async (req, res) => {
    // ไม่แยกกรณีผิดรูป ไม่มี หมดอายุ หรือใช้แล้ว เพื่อไม่บอกใบ้คนที่เดาลิงก์
    if (!isLinkToken(req.params.token)) {
      sendText(res, 410, EXPIRED_MESSAGE);
      return;
    }
    const link = await repository.claimExportLink(hashLinkToken(req.params.token), now().toISOString());
    if (!link) {
      sendText(res, 410, EXPIRED_MESSAGE);
      return;
    }
    const range = parseMonth(link.month);
    const [rows, categories] = await Promise.all([
      repository.listAllTransactions(link.userId, range.from, range.to),
      repository.listCategories(link.userId),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    const csv = buildTransactionsCsv(rows.map((row) => ({ ...row, categoryName: names.get(row.categoryId) || '' })));
    res
      .status(200)
      .type('text/csv; charset=utf-8')
      .set('Content-Disposition', `attachment; filename="${exportFileName(link.month)}"`)
      .set('Cache-Control', 'no-store')
      .send(csv);
  });

  router.use((err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    logger.error('Export failed', err);
    sendText(res, 500, FAILED_MESSAGE);
  });

  return router;
}

module.exports = { createExportRouter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/export/router.test.js`
Expected: PASS 4 tests (ถ้า content-type ที่ได้ต่างจาก `text/csv; charset=utf-8` เล็กน้อย ให้ดู output จริงแล้วบันทึกใน report ห้ามแก้เทสต์ให้หลวมลงโดยไม่มีเหตุผล)

- [ ] **Step 5: Commit**

```bash
git add src/export/router.js src/export/router.test.js
git commit -m "feat: download the month as CSV through a one-time link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: ฟังก์ชันฝั่งหน้าเว็บสำหรับกราฟ ยอดรวม และ export

**Depends on:** none

**Files:**
- Modify: `public/liff/format.mjs`
- Modify: `public/liff/api.mjs`
- Test: `public/liff/format.test.mjs`
- Test: `public/liff/api.test.mjs`

**Interfaces:**
- Consumes: shape ของ API จาก Task 4: `summary: [{ type, category, total, entryCount }]`, `POST /api/exports` → `{ path }`
- Produces:
  - `summaryTotals(summary) => { income: number, expense: number }`
  - `chartRows(summary, type) => [{ category, total, share: number (จำนวนเต็ม 0-100), width: number (0-100) }]` เรียงยอดมากไปน้อย
  - `describeExportFailure(status) => string`
  - `api.createExport(month) => Promise<{ path }>`
  - (ยังไม่ลบ `totals` เดิม เพราะ `app.mjs` ยังใช้ Task 7 จะลบ)

- [ ] **Step 1: Write the failing tests**

ใน `public/liff/format.test.mjs` เพิ่ม `summaryTotals`, `chartRows`, `describeExportFailure` ใน import จาก `./format.mjs` แล้วเพิ่มท้ายไฟล์

```js
describe('summaryTotals', () => {
  it('sums the SQL summary by type in satang', () => {
    expect(
      summaryTotals([
        { type: 'expense', category: 'อาหาร', total: 0.1, entryCount: 1 },
        { type: 'expense', category: 'เดินทาง', total: 0.2, entryCount: 1 },
        { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
      ])
    ).toEqual({ income: 25000, expense: 0.3 });
  });

  it('returns zero for an empty month', () => {
    expect(summaryTotals([])).toEqual({ income: 0, expense: 0 });
  });
});

describe('chartRows', () => {
  const summary = [
    { type: 'expense', category: 'เดินทาง', total: 1500, entryCount: 3 },
    { type: 'expense', category: 'อาหาร', total: 3000, entryCount: 9 },
    { type: 'expense', category: 'ช้อปปิ้ง', total: 500, entryCount: 1 },
    { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
  ];

  it('keeps one type, sorts by total and gives share and bar width', () => {
    expect(chartRows(summary, 'expense')).toEqual([
      { category: 'อาหาร', total: 3000, share: 60, width: 100 },
      { category: 'เดินทาง', total: 1500, share: 30, width: 50 },
      { category: 'ช้อปปิ้ง', total: 500, share: 10, width: (500 / 3000) * 100 },
    ]);
  });

  it('returns the other type on its own', () => {
    expect(chartRows(summary, 'income')).toEqual([{ category: 'เงินเดือน', total: 25000, share: 100, width: 100 }]);
  });

  it('returns an empty list when the type has no entries', () => {
    expect(chartRows([], 'expense')).toEqual([]);
  });
});

describe('describeExportFailure', () => {
  it('asks to reopen from LINE on 401', () => {
    expect(describeExportFailure(401)).toBe(LOGIN_REQUIRED_MESSAGE);
  });

  it('asks to try again otherwise', () => {
    expect(describeExportFailure(500)).toBe('Export ไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeExportFailure(undefined)).toBe('Export ไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});
```

ใน `public/liff/api.test.mjs` เพิ่มใน `describe('createApi', ...)`

```js
  it('asks for an export link of one month with POST', async () => {
    const fetchImpl = fakeFetch(201, { path: '/exports/abc' });

    expect(await setup(fetchImpl).createExport('2026-09')).toEqual({ path: '/exports/abc' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/exports');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ month: '2026-09' });
    expect(options.headers.Authorization).toBe('Bearer token-1');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run public/liff`
Expected: FAIL เพราะยังไม่มี `summaryTotals`, `chartRows`, `describeExportFailure`, `createExport`

- [ ] **Step 3: Write minimal implementation**

ใน `public/liff/format.mjs` เพิ่มท้ายไฟล์

```js
// ยอดรวมมาจาก SQL เพื่อให้ตรงกับที่บอทสรุป และนับครบแม้รายการที่แสดงถูกตัด
export function summaryTotals(summary) {
  let income = 0;
  let expense = 0;
  for (const row of summary) {
    const satang = Math.round(row.total * 100);
    if (row.type === 'income') {
      income += satang;
    } else {
      expense += satang;
    }
  }
  return { income: income / 100, expense: expense / 100 };
}

export function chartRows(summary, type) {
  const rows = summary
    .filter((row) => row.type === type && row.total > 0)
    .sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, 'th'));
  const sum = rows.reduce((acc, row) => acc + row.total, 0);
  const max = rows.length > 0 ? rows[0].total : 0;
  return rows.map((row) => ({
    category: row.category,
    total: row.total,
    // ปัดเป็นจำนวนเต็มให้อ่านง่าย ผลรวมอาจไม่ครบ 100 พอดี
    share: Math.round((row.total / sum) * 100),
    // แท่งที่ยอดสูงสุดยาวเต็ม แท่งอื่นเทียบกับแท่งนี้
    width: (row.total / max) * 100,
  }));
}

export function describeExportFailure(status) {
  return status === 401 ? LOGIN_REQUIRED_MESSAGE : 'Export ไม่สำเร็จ ลองใหม่อีกครั้ง';
}
```

ใน `public/liff/api.mjs` ใน object ที่ `createApi` คืน เพิ่มต่อจาก `deleteTransaction`

```js
    createExport: (month) => request('/exports', { method: 'POST', body: JSON.stringify({ month }) }),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run public/liff`
Expected: PASS ทุกเทสต์ใน 2 ไฟล์

- [ ] **Step 5: Commit**

```bash
git add public/liff/format.mjs public/liff/format.test.mjs public/liff/api.mjs public/liff/api.test.mjs
git commit -m "feat: add chart, totals and export helpers for the LIFF page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: UI กราฟ หมายเหตุ และปุ่ม Export CSV

**Depends on:** Task 4, Task 6

**Files:**
- Modify: `public/liff/index.html`
- Modify: `public/liff/style.css`
- Modify: `public/liff/app.mjs`
- Modify: `public/liff/format.mjs` (ลบ `totals`)
- Test: `public/liff/format.test.mjs` (ลบเทสต์ `totals`)

**Interfaces:**
- Consumes: `api.listTransactions(month) => { transactions, summary, truncated }` (Task 4), `api.createExport(month) => { path }`, `summaryTotals`, `chartRows`, `describeExportFailure` (Task 6), `liff.openWindow({ url, external: true })` (LIFF SDK)
- Produces: ไม่มี (หน้าจอ)

**Browser check:** ทำใน Task 9 โดยผู้ใช้บนแอป LINE เพราะหน้าเว็บต้อง login ผ่าน LIFF ซึ่ง browser ทั่วไปทำแทนไม่ได้

- [ ] **Step 1: ลบ `totals` เดิม**

ใน `public/liff/format.test.mjs` ลบ `totals,` ออกจาก import และลบ `describe('totals', ...)` ทั้งบล็อก
ใน `public/liff/format.mjs` ลบ function `totals` และคอมเมนต์เหนือมัน (`// รวมเป็นสตางค์เพื่อไม่ให้ทศนิยมของ JavaScript คลาดเคลื่อน`)

Run: `npx vitest run public/liff`
Expected: PASS (เทสต์ของ `totals` หายไป ที่เหลือผ่าน)

- [ ] **Step 2: แก้ `public/liff/index.html`**

แทนที่บรรทัด `<p id="totals" class="totals" hidden></p>` ด้วย

```html
    <p id="totals" class="totals" hidden></p>
    <p id="truncated" class="notice" hidden>เดือนนี้มีรายการมากกว่าที่แสดงได้ ยอดรวมและกราฟนับครบทุกรายการ ดูรายการทั้งหมดได้จาก Export CSV</p>
    <div class="export">
      <button type="button" id="export-button">Export CSV</button>
      <p id="export-status" class="export-status" role="status" aria-live="polite"></p>
    </div>
    <section id="chart" class="chart" aria-labelledby="chart-title" hidden>
      <div class="chart-head">
        <h2 id="chart-title">สรุปตามหมวด</h2>
        <div class="tabs" role="tablist" aria-label="ประเภท">
          <button type="button" role="tab" data-type="expense" aria-selected="true">รายจ่าย</button>
          <button type="button" role="tab" data-type="income" aria-selected="false">รายรับ</button>
        </div>
      </div>
      <ul id="chart-rows" class="chart-rows"></ul>
      <p id="chart-empty" class="chart-empty" hidden></p>
    </section>
```

- [ ] **Step 3: เพิ่ม CSS ท้าย `public/liff/style.css`**

```css
.notice { margin: 8px 16px 0; padding: 8px 12px; font-size: 13px; color: #6b4e00; background: #fff4d6; border-radius: 8px; }
.export { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 12px 16px 0; }
.export button { min-height: 44px; padding: 10px 16px; font-size: 16px; border: 1px solid #13853a; border-radius: 8px; background: #fff; color: #13853a; }
.export button:disabled { opacity: 0.6; }
.export-status { margin: 0; font-size: 13px; color: #555; }
.chart { margin: 12px 16px 0; padding: 12px; background: #fff; border-radius: 8px; }
.chart-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.chart h2 { margin: 0; font-size: 16px; }
.tabs { display: flex; gap: 4px; }
.tabs button { min-height: 44px; padding: 8px 14px; font-size: 14px; border: 1px solid #ccc; border-radius: 999px; background: #fff; color: #222; }
.tabs button[aria-selected="true"] { background: #222; border-color: #222; color: #fff; }
.chart-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.chart-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; margin-top: 10px; font-size: 14px; }
.chart-label { overflow-wrap: anywhere; }
.chart-value { white-space: nowrap; color: #555; }
.chart-track { grid-column: 1 / -1; height: 10px; background: #eee; border-radius: 5px; overflow: hidden; }
.chart-fill { height: 100%; border-radius: 5px; }
.chart-row.expense .chart-fill { background: #c62828; }
.chart-row.income .chart-fill { background: #13853a; }
.chart-empty { margin: 12px 0 0; color: #666; }
```

- [ ] **Step 4: แก้ `public/liff/app.mjs`**

1. ใน import จาก `./format.mjs` แทน `totals,` ด้วย

```js
  summaryTotals,
  chartRows,
  describeExportFailure,
```

2. ใน object `els` เพิ่มต่อจาก `totals: document.getElementById('totals'),`

```js
  truncated: document.getElementById('truncated'),
  exportButton: document.getElementById('export-button'),
  exportStatus: document.getElementById('export-status'),
  chart: document.getElementById('chart'),
  chartRows: document.getElementById('chart-rows'),
  chartEmpty: document.getElementById('chart-empty'),
  tabs: document.querySelectorAll('#chart [role="tab"]'),
```

3. ต่อจากบรรทัด `let busy = false;` เพิ่ม

```js
let chartType = 'expense';
let lastSummary = [];
let exporting = false;
```

4. แทนที่ function `render(transactions)` ทั้งหมดด้วย 2 function นี้

```js
function renderChart() {
  for (const tab of els.tabs) {
    tab.setAttribute('aria-selected', String(tab.dataset.type === chartType));
  }
  const rows = chartRows(lastSummary, chartType);
  els.chartRows.replaceChildren();
  els.chart.hidden = false;
  if (rows.length === 0) {
    els.chartEmpty.textContent = chartType === 'expense' ? 'ยังไม่มีรายจ่ายในเดือนนี้' : 'ยังไม่มีรายรับในเดือนนี้';
    els.chartEmpty.hidden = false;
    return;
  }
  els.chartEmpty.hidden = true;
  for (const row of rows) {
    const item = document.createElement('li');
    item.className = `chart-row ${chartType}`;
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = row.category;
    const value = document.createElement('span');
    value.className = 'chart-value';
    value.textContent = `${formatBaht(row.total)} · ${row.share}%`;
    const track = document.createElement('div');
    track.className = 'chart-track';
    const fill = document.createElement('div');
    fill.className = 'chart-fill';
    fill.style.width = `${row.width}%`;
    track.append(fill);
    item.append(label, value, track);
    els.chartRows.append(item);
  }
}

function render({ transactions, summary, truncated }) {
  const sum = summaryTotals(summary);
  els.totals.textContent = `รายรับ ${formatBaht(sum.income)} · รายจ่าย ${formatBaht(sum.expense)}`;
  els.totals.hidden = false;
  els.truncated.hidden = !truncated;
  lastSummary = summary;
  renderChart();
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
```

5. ใน `loadMonth` แก้บล็อก `if (reset) { ... }` เป็น

```js
  if (reset) {
    els.list.replaceChildren();
    els.totals.hidden = true;
    els.truncated.hidden = true;
    els.chart.hidden = true;
    els.exportStatus.textContent = '';
    setStatus('กำลังโหลด...');
  }
```

และใน `try` แทนสองบรรทัด

```js
    const { transactions } = await api.listTransactions(month);
    // ทิ้งผลของเดือนเก่าเมื่อผู้ใช้เปลี่ยนเดือนไปแล้ว
    if (month === els.month.value) render(transactions);
```

ด้วย

```js
    const data = await api.listTransactions(month);
    // ทิ้งผลของเดือนเก่าเมื่อผู้ใช้เปลี่ยนเดือนไปแล้ว
    if (month === els.month.value) render(data);
```

6. ต่อจากบรรทัด `els.month.addEventListener('change', () => loadMonth({ reset: true }));` เพิ่ม

```js
for (const tab of els.tabs) {
  tab.addEventListener('click', () => {
    chartType = tab.dataset.type;
    renderChart();
  });
}

els.exportButton.addEventListener('click', async () => {
  if (exporting || !api) return;
  exporting = true;
  els.exportButton.disabled = true;
  els.exportStatus.textContent = 'กำลังเตรียมไฟล์...';
  try {
    const { path } = await api.createExport(els.month.value);
    // browser ในแอป LINE ดาวน์โหลดไฟล์ไม่ได้ จึงเปิดลิงก์ใน browser ภายนอก
    liff.openWindow({ url: new URL(path, window.location.origin).href, external: true });
    els.exportStatus.textContent = 'เปิดลิงก์ดาวน์โหลดใน browser แล้ว ลิงก์ใช้ได้ครั้งเดียวภายใน 5 นาที';
  } catch (err) {
    els.exportStatus.textContent = describeExportFailure(err instanceof ApiError ? err.status : undefined);
  } finally {
    exporting = false;
    els.exportButton.disabled = false;
  }
});
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run public/liff`
Expected: PASS ทุกเทสต์

Run: `node --check public/liff/app.mjs` และ `node --check public/liff/format.mjs`
Expected: ไม่มี output ทั้งสองคำสั่ง (ตรวจแค่ syntax เพราะ app.mjs ใช้ DOM และ LIFF จึงไม่มีเทสต์อัตโนมัติ)

Run: `npm test`
Expected: PASS ทุกไฟล์ ยกเว้นไฟล์ของ task อื่นที่ยังทำไม่เสร็จ (ให้บันทึกใน report)

ตรวจด้วยตาว่า `grep -n "innerHTML" public/liff/app.mjs` ไม่เจออะไร

- [ ] **Step 6: Commit**

```bash
git add public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/format.mjs public/liff/format.test.mjs
git commit -m "feat: show the category chart, truncation notice and CSV export on the LIFF page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Mount /exports ใน server

**Depends on:** Task 5

**Files:**
- Modify: `src/app.js`
- Modify: `index.js`
- Test: `src/app.test.js`

**Interfaces:**
- Consumes: `createExportRouter({ repository, now?, logger? })` (Task 5)
- Produces: `createApp({ channelSecret, handleEvents, apiRouter?, exportRouter?, logger? })` mount `exportRouter` ที่ `/exports`

- [ ] **Step 1: Write the failing test**

ใน `src/app.test.js`:

1. เพิ่ม import ต่อจาก import ของ `createApiRouter`

```js
import { createExportRouter } from './export/router.js';
```

2. แก้ `start` ให้รับ `exportRouter` ด้วย

```js
async function start(handleEvents, logger = { error: vi.fn() }, apiRouter, exportRouter) {
  const app = createApp({ channelSecret: SECRET, handleEvents, logger, apiRouter, exportRouter });
```

3. เพิ่มท้ายไฟล์

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app.test.js`
Expected: FAIL ที่ `mounts the export router under /exports` (ได้ 404)

- [ ] **Step 3: Write minimal implementation**

ใน `src/app.js` แก้บรรทัดประกาศ function เป็น

```js
function createApp({ channelSecret, handleEvents, apiRouter, exportRouter, logger = console }) {
```

และต่อจากบล็อก `if (apiRouter) { ... }` เพิ่ม

```js
  if (exportRouter) {
    app.use('/exports', exportRouter);
  }
```

ใน `index.js` เพิ่ม require ต่อจาก require ของ `./src/api/router`

```js
const { createExportRouter } = require('./src/export/router');
```

และแก้การสร้าง `app` เป็น

```js
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
  apiRouter,
  exportRouter: createExportRouter({ repository }),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

Run: `node --check index.js`
Expected: ไม่มี output

Run: `npm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/app.test.js index.js
git commit -m "feat: serve CSV export links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: (ผู้ใช้) รัน SQL และทดสอบในแอป LINE

**Depends on:** Task 1-8

**Files:** ไม่มี (Supabase SQL Editor และแอป LINE)

- [ ] **Step 1: (ผู้ใช้) รัน `supabase/004_export_links.sql`**

| # | Action | Expected |
|---|---|---|
| 1 | Supabase > SQL Editor > New query วางเนื้อหาไฟล์ `supabase/004_export_links.sql` > Run | `Success. No rows returned` |
| 2 | Table Editor | เห็นตาราง `export_links` ว่าง ไม่มีแถว |

- [ ] **Step 2: (ผู้ใช้) Manual check**

**Manual check (ผู้ใช้ทำ — agent ห้าม start server):**
- Preconditions: Step 1 เสร็จ, `Ctrl+C` แล้ว `npm start` ใหม่บน branch นี้, ngrok รันอยู่, เดือนนี้มีทั้งรายจ่ายหลายหมวดและรายรับอย่างน้อย 1 รายการ

| # | Action | Expected |
|---|---|---|
| 1 | เปิดหน้าเว็บจากปุ่ม `เปิดเว็บ` ใน Rich Menu | เห็นยอดรวม, ปุ่ม `Export CSV`, กล่อง `สรุปตามหมวด` ปุ่ม `รายจ่าย` ถูกกดอยู่ แท่งสีแดงเรียงยอดมากไปน้อย แต่ละแถวมีชื่อหมวด ยอด และ % |
| 2 | เทียบยอดรวมและยอดแต่ละหมวดกับคำตอบของบอทเมื่อพิมพ์ `สรุป เดือนนี้` | ตรงกัน |
| 3 | แตะปุ่ม `รายรับ` | แท่งเปลี่ยนเป็นสีเขียว แสดงหมวดรายรับ |
| 4 | เปลี่ยนเดือนเป็นเดือนที่ไม่มีรายการ | รวม 0 บาท, กล่องสรุปขึ้น `ยังไม่มีรายรับในเดือนนี้` หรือ `ยังไม่มีรายจ่ายในเดือนนี้` ตามแท็บ |
| 5 | กลับมาเดือนนี้ กด `Export CSV` | ข้อความ `ส่งลิงก์ไปเปิดใน browser แล้ว ...` และ Safari เปิดขึ้น (ถ้าเจอหน้าเตือนของ ngrok ให้กด `Visit Site`) |
| 6 | ใน Safari | ดาวน์โหลดไฟล์ `transactions-YYYY-MM.csv` ได้ (บันทึกลง Files) |
| 7 | เปิดไฟล์ใน Numbers หรือ Excel | ภาษาไทยอ่านได้ หัวตาราง `วันที่ ประเภท หมวด จำนวนเงิน โน้ต` จำนวนแถวเท่ากับรายการเดือนนี้ เรียงวันที่เก่าไปใหม่ |
| 8 | ใน Safari เปิดลิงก์เดิมซ้ำ (ดึงหน้าลงเพื่อ reload) | ขึ้น `ลิงก์นี้หมดอายุหรือถูกใช้ไปแล้ว ...` |
| 9 | Supabase Table Editor > `export_links` | มีแถวของครั้งที่กด `used_at` มีค่า และไม่มีคอลัมน์ที่เก็บ token ตรงๆ (มีแค่ `token_hash`) |

- [ ] **Step 3: (ผู้ใช้) ตรวจ RLS ของ `export_links`**

ใช้ anon/publishable key เรียก `GET /rest/v1/export_links` ต้องได้ `[]` (RLS ปิดกั้น) เหมือนการตรวจใน step 3

---

## ข้อจำกัดที่ตั้งใจเลื่อนไปขั้นถัดไป

- รายการในหน้าเว็บยังแสดงได้ไม่เกิน max-rows ของ Supabase (1000 แถวต่อเดือน) แต่มีหมายเหตุบอก และยอดรวม กราฟ และ CSV นับครบ
- แถวใน `export_links` ที่หมดอายุแล้วยังไม่ถูกลบอัตโนมัติ (ขนาดเล็ก ลบตาม user เมื่อ user ถูกลบ)
- HEAD ไม่ claim ลิงก์แล้ว แต่ถ้า Safari โหลดลิงก์ซ้ำเองด้วย GET (เช่น preview) ลิงก์จะถูกใช้ไปแล้ว ผู้ใช้ต้องกด Export ใหม่
- ลิงก์ export ใช้ได้โดยไม่ต้อง login ภายใน 5 นาทีแรก ใครได้ลิงก์ไปก่อนเจ้าของใช้ก็ดาวน์โหลดได้ (token สุ่ม 256 bit เดาไม่ได้)
- ยังเพิ่มรายการใหม่จากหน้าเว็บไม่ได้

---

## สิ่งที่เปลี่ยนจากแผนหลัง review

- `POST /api/exports` ปฏิเสธ month ที่ไม่ใช่ string ด้วย 400
- `GET /exports/:token`: %-escape ที่เสียให้ 410 โดยไม่ log, HEAD ให้ 405 โดยไม่ claim ลิงก์ (เทสต์ 6 ข้อ ไม่ใช่ 4)
- ปุ่มสลับประเภทกราฟใช้ toggle button ที่มี aria-pressed ใน role="group" (ผู้ใช้ตัดสินใจ) แทน role="tab"
- ข้อความ 500 ตอนดาวน์โหลดเป็น `Export ไม่สำเร็จ กลับไปกด Export CSV ในหน้าเว็บอีกครั้ง` เพราะลิงก์ถูก claim ไปแล้ว โหลดซ้ำจะได้ 410
- ข้อความสถานะหลังกด Export เป็น `ส่งลิงก์ไปเปิดใน browser แล้ว ถ้าไม่เห็นหน้าดาวน์โหลด กด Export CSV ใหม่ (ลิงก์ใช้ได้ครั้งเดียวภายใน 5 นาที)` เพราะ liff.openWindow อาจถูกบล็อกนอก LINE
