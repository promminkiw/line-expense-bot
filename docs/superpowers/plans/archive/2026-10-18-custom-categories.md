# Custom Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ใช้เพิ่ม เปลี่ยนชื่อ ซ่อน และเลิกซ่อนหมวดของตัวเองได้ในแท็บโปรไฟล์ และให้ Claude เลือกหมวดที่ผู้ใช้สร้างเองตอนแยกข้อความ

**Architecture:** เพิ่มคอลัมน์ `categories.hidden` (ซ่อนแทนการลบ) หมวดระบบ (`อื่นๆ` ทั้งสองประเภท และ `ใบเสร็จ/สลิปโอนเงิน`) แก้ไม่ได้เพราะโค้ดอ้างด้วยชื่อ parser รับรายชื่อหมวดของผู้ใช้ต่อ request แล้วสร้าง enum ใน schema และ prompt เอง bot โหลดหมวดของผู้ใช้ก่อนเรียก Claude ถ้าโหลดไม่ได้ใช้หมวดเริ่มต้น API มี `POST /api/categories` และ `PATCH /api/categories/:id` หน้า LIFF มีส่วน "หมวดของฉัน" ในแท็บโปรไฟล์ ตัวเลือกหมวดตอนเพิ่ม/แก้ไม่แสดงหมวดที่ซ่อน (ยกเว้นหมวดเดิมของรายการที่กำลังแก้) แต่ตัวกรองรายการยังแสดงทุกหมวด

**Tech Stack:** Node.js 24 + Express 5, @line/bot-sdk, @anthropic-ai/sdk (claude-haiku-5-5), Supabase Postgres, LIFF (vanilla JS ES modules ใน `public/liff/`), vitest + PGlite + jsdom

## Global Constraints

- ทำทีละฟีเจอร์ตามลำดับในไฟล์นี้ ห้ามทำขนานกัน (ทุกฟีเจอร์แก้ `src/bot.js`, `src/api/router.js`, `src/db/repository.js`, `public/liff/app.mjs`, `public/liff/index.html`)
- หนึ่งฟีเจอร์ = หนึ่ง branch `feat/<name>` แตกจาก main ล่าสุด, TDD (เขียน test ให้ fail ก่อน), commit ทีละ task, merge เข้า main ในเครื่องด้วย `--no-ff` เมื่อจบฟีเจอร์
- ห้าม `git push`, ห้ามรัน SQL ใน Supabase, ห้ามแก้ `.env`, ห้ามติดตั้งแพ็กเกจใหม่โดยไม่ถาม
- migration ใหม่ต่อเลขจาก `015` (ตอนนี้ไฟล์ล่าสุดคือ `015_bill_invariants.sql`; 016 ถูกใช้แล้ว revert จึงเริ่มที่ `017`) รันซ้ำได้ (`if not exists`, `create or replace`) เพิ่มชื่อไฟล์ใน `MIGRATIONS` ของ `src/db/sql-functions.test.js` และหัวไฟล์ `supabase/schema.sql` และบรรทัด "ไฟล์ล่าสุด" ใน README
- ถ้าโค้ดใหม่ต้องใช้คอลัมน์/ตารางใหม่ตั้งแต่ request แรก README ต้องบอกว่าต้องรัน SQL ก่อน push
- คอมเมนต์ในโค้ดภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log ภาษาอังกฤษ; ไม่มี emoji ในโค้ด คอมเมนต์ log commit
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- push message นับโควตา LINE OA: ฟีเจอร์ที่ push ต้องให้ผู้ใช้เปิดเอง (ค่าตั้งต้นปิด)
- ก่อนจบแต่ละฟีเจอร์: `npm test` และ `npm run lint` ผ่านทั้งหมด, อัปเดต SPEC.md (ฟังก์ชัน, Database, ลำดับการทำ) และ `work-memory/STATE.md`
- ไฟล์ใหม่ใช้ CRLF เหมือนไฟล์เดิมส่วนใหญ่ (git autocrlf=true จัดการให้ตอน commit)

Commit message ทุกอันลงท้ายด้วยสองบรรทัดนี้ (เว้นหนึ่งบรรทัดก่อน):

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
```

## การตัดสินใจของแผนนี้ (นอกเหนือจาก roadmap)

- หมวดระบบ = `expense:อื่นๆ`, `income:อื่นๆ`, `expense:ใบเสร็จ/สลิปโอนเงิน` ห้ามเปลี่ยนชื่อและห้ามซ่อน (API ตอบ 400 `System category`) และห้ามตั้งชื่อหมวดใหม่หรือเปลี่ยนชื่อเป็น `อื่นๆ` หรือ `ใบเสร็จ/สลิปโอนเงิน` ไม่ว่าประเภทไหน (400 `Reserved name`)
- `users.loadCategoryIds` ซ่อมเฉพาะหมวดระบบที่หาย; ถ้าผู้ใช้ไม่มีหมวดเลย (สร้างผู้ใช้สำเร็จแต่สร้างหมวดพัง) เติมหมวดเริ่มต้นครบชุดเหมือนเดิม หมวดเริ่มต้นใหม่ในอนาคตต้องเติมด้วย migration แบบ `011_slip_category.sql`
- ชื่อหมวด: trim แล้วยาว 1-30 หน่วย (`string.length`), ห้ามมี `,` (prompt คั่นรายชื่อหมวดด้วย `, `) และห้ามมีตัวควบคุม (รหัส < 32 และ 127)
- นับเพดาน 30 เฉพาะหมวดที่ไม่ซ่อนในประเภทเดียวกัน (รวมหมวดระบบ) ทั้งตอนเพิ่มและตอนเลิกซ่อน (409 `Too many categories`)
- server ยอมรับหมวดที่ซ่อนแล้วใน `PATCH /api/transactions/:id`, รายการประจำ, งบ และบิล (ตรวจแค่ว่าเป็นของผู้ใช้) เพราะรายการเก่าที่อยู่ในหมวดนั้นต้องแก้ส่วนอื่นได้โดยไม่ถูกบังคับย้ายหมวด การซ่อนบังคับที่ตัวเลือกใน LIFF และ enum ของ Claude เท่านั้น
- งบ: `GET /api/budgets` ตัดแถวของหมวดที่ซ่อนออกเฉพาะเมื่อเดือนนั้นไม่มีงบและไม่มียอดใช้ (แถวที่ยังมีงบหรือยอดยังแสดง ให้ผู้ใช้ยกเลิกงบที่ค้างได้) SQL `budget_status` ไม่แก้
- รายการประจำที่ตั้งไว้กับหมวดที่ซ่อนยังทำงานต่อตามปกติ
- ยืนยันบิลของเพื่อนยังจับคู่หมวดด้วยชื่อเหมือนเดิม (หมวดที่ซ่อนแต่ชื่อตรงก็ใช้ได้)
- หมวดใหม่และหมวดเริ่มต้นที่เปลี่ยนชื่อใช้ไอคอน `other` (มีอยู่แล้วใน `categoryStyle`)
- Browser check ใช้ไม่ได้กับ agent (LIFF ต้อง login ผ่านแอป LINE) ทุก block เป็น checklist ให้คนทำเองหลัง deploy

## Dependency graph

T1 -> (T2, T4 ขนานได้) ; T2 -> T3 ; T2 + T4 -> T5 ; T3 + T5 -> T6 ; T2 + T4 -> T7 ; T7 -> T8 -> T9 ; T6 + T9 -> T10

---

### Task 1: Branch และ migration `017_category_hidden.sql`

**Depends on:** none

**Files:**
- Create: `supabase/017_category_hidden.sql`
- Modify: `supabase/schema.sql:1` (หัวไฟล์)
- Test: `src/db/sql-functions.test.js` (รายการ `MIGRATIONS` และ describe ใหม่ก่อน `describe('function permissions'`)

**Interfaces:**
- Produces: คอลัมน์ `public.categories.hidden boolean not null default false`

- [ ] **Step 1: สร้าง branch**

```bash
git checkout main
git checkout -b feat/custom-categories
```

Expected: `Switched to a new branch 'feat/custom-categories'`

- [ ] **Step 2: เขียนเทสต์ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่มชื่อไฟล์ท้าย `MIGRATIONS`:

```js
  '015_bill_invariants.sql',
  '017_category_hidden.sql',
];
```

แล้วเพิ่ม describe นี้ไว้ก่อนบรรทัด `describe('function permissions', () => {`:

```js
describe('017_category_hidden.sql', () => {
  it('adds hidden to categories, false by default', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');

    expect((await one('select hidden from categories where id = $1', [food])).hidden).toBe(false);

    await db.query('update categories set hidden = true where id = $1', [food]);
    expect((await one('select hidden from categories where id = $1', [food])).hidden).toBe(true);
  });

  // เตือนงบยังต้องทำงานกับหมวดที่ซ่อน เพราะรายการประจำยังบันทึกลงหมวดนั้นได้
  it('keeps a hidden category in budget_status', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await db.query('update categories set hidden = true where id = $1', [food]);

    expect(await rows('select category from budget_status($1, $2)', [user, '2026-10-01'])).toEqual([{ category: 'อาหาร' }]);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('017_category_hidden.sql'))).resolves.toBeDefined();
  });
});
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL (`ENOENT` อ่าน `017_category_hidden.sql` ไม่ได้ ทุกเทสต์ในไฟล์ถูกข้าม)

- [ ] **Step 4: เขียน migration**

`supabase/017_category_hidden.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 015 ก่อน push โค้ดที่ให้ผู้ใช้จัดการหมวดเอง รันซ้ำได้
-- ซ่อนแทนการลบ เพราะรายการเก่า งบ รายการประจำ และบิลยังอ้างอิงหมวดนั้นอยู่

alter table public.categories add column if not exists hidden boolean not null default false;
```

ใน `supabase/schema.sql` บรรทัดแรก แก้ข้อความ `014_bill_indexes.sql และ 015_bill_invariants.sql ต่อตามลำดับ` เป็น:

```
014_bill_indexes.sql, 015_bill_invariants.sql และ 017_category_hidden.sql ต่อตามลำดับ (ไม่มี 016 เพราะถูกถอยออก)
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทุกเทสต์ในไฟล์ (รวม 3 เทสต์ใหม่)

- [ ] **Step 6: Commit**

```bash
git add supabase/017_category_hidden.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -F - <<'EOF'
feat: add a hidden flag to categories

Categories are hidden instead of deleted because old entries, budgets,
recurring rules and bills still point at them.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 2: กติกาหมวดใน `src/parser/categories.js`

**Depends on:** Task 1

**Files:**
- Modify: `src/parser/categories.js`
- Test: `src/parser/categories.test.js`

**Interfaces:**
- Produces:
  - `SYSTEM_CATEGORIES: { expense: string[], income: string[] }` = `{ expense: ['ใบเสร็จ/สลิปโอนเงิน', 'อื่นๆ'], income: ['อื่นๆ'] }`
  - `MAX_CATEGORY_NAME_LENGTH = 30`, `MAX_VISIBLE_CATEGORIES = 30`
  - `isSystemCategory(type: string, name: string): boolean`
  - `isReservedCategoryName(name: string): boolean`
  - `toTextCategories(categories: Array<{ type, name, hidden? }>): { expense: string[], income: string[] }`
  - `normalizeCategory(type, name, categories = TEXT_CATEGORIES): string`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

แทนบรรทัด import แรกของ `src/parser/categories.test.js` ด้วย:

```js
import {
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY,
  SLIP_CATEGORY,
  TEXT_CATEGORIES,
  SYSTEM_CATEGORIES,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_VISIBLE_CATEGORIES,
  normalizeCategory,
  isSystemCategory,
  isReservedCategoryName,
  toTextCategories,
} from './categories.js';
```

และเพิ่มท้ายไฟล์:

```js
describe('normalizeCategory with the user categories', () => {
  const USER = { expense: ['ค่าแมว', 'อื่นๆ'], income: ['อื่นๆ'] };

  it('keeps a category from the given list', () => {
    expect(normalizeCategory('expense', 'ค่าแมว', USER)).toBe('ค่าแมว');
  });

  it('falls back to อื่นๆ for a default category the user does not have', () => {
    expect(normalizeCategory('expense', 'อาหาร', USER)).toBe('อื่นๆ');
  });
});

describe('SYSTEM_CATEGORIES', () => {
  it('lists the categories the code refers to by name', () => {
    expect(SYSTEM_CATEGORIES).toEqual({ expense: [SLIP_CATEGORY, FALLBACK_CATEGORY], income: [FALLBACK_CATEGORY] });
  });

  it('caps names and visible categories at 30', () => {
    expect(MAX_CATEGORY_NAME_LENGTH).toBe(30);
    expect(MAX_VISIBLE_CATEGORIES).toBe(30);
  });
});

describe('isSystemCategory', () => {
  it.each([
    ['expense', 'อื่นๆ', true],
    ['income', 'อื่นๆ', true],
    ['expense', 'ใบเสร็จ/สลิปโอนเงิน', true],
    ['income', 'ใบเสร็จ/สลิปโอนเงิน', false],
    ['expense', 'อาหาร', false],
    ['other', 'อื่นๆ', false],
  ])('%s %s -> %s', (type, name, expected) => {
    expect(isSystemCategory(type, name)).toBe(expected);
  });
});

describe('isReservedCategoryName', () => {
  it('reserves the system names for any type', () => {
    expect(isReservedCategoryName('อื่นๆ')).toBe(true);
    expect(isReservedCategoryName('ใบเสร็จ/สลิปโอนเงิน')).toBe(true);
    expect(isReservedCategoryName('อาหาร')).toBe(false);
  });
});

describe('toTextCategories', () => {
  it('keeps visible names by type and drops hidden ones and the slip category', () => {
    const categories = [
      { type: 'expense', name: 'อาหาร', hidden: false },
      { type: 'expense', name: 'ค่าแมว', hidden: false },
      { type: 'expense', name: 'บันเทิง', hidden: true },
      { type: 'expense', name: SLIP_CATEGORY, hidden: false },
      { type: 'expense', name: 'อื่นๆ', hidden: false },
      { type: 'income', name: 'เงินเดือน', hidden: false },
      { type: 'income', name: 'อื่นๆ', hidden: false },
    ];

    expect(toTextCategories(categories)).toEqual({
      expense: ['อาหาร', 'ค่าแมว', 'อื่นๆ'],
      income: ['เงินเดือน', 'อื่นๆ'],
    });
  });

  it('always offers อื่นๆ even when the row is missing', () => {
    expect(toTextCategories([{ type: 'expense', name: 'อาหาร', hidden: false }])).toEqual({
      expense: ['อาหาร', 'อื่นๆ'],
      income: ['อื่นๆ'],
    });
  });

  it('treats a row without the hidden field as visible', () => {
    expect(toTextCategories([{ type: 'income', name: 'โบนัส' }]).income).toEqual(['โบนัส', 'อื่นๆ']);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/parser/categories.test.js`
Expected: FAIL (`isSystemCategory is not a function` และ `SYSTEM_CATEGORIES` เป็น undefined)

- [ ] **Step 3: เขียนโค้ด**

แทนทั้งไฟล์ `src/parser/categories.js`:

```js
const FALLBACK_CATEGORY = 'อื่นๆ';
// บอทใส่หมวดนี้ให้รายจ่ายที่อ่านจากรูปสลิปเอง Claude ไม่ได้เลือก
const SLIP_CATEGORY = 'ใบเสร็จ/สลิปโอนเงิน';

// หมวดที่สร้างให้ผู้ใช้ทุกคน
const DEFAULT_CATEGORIES = {
  expense: ['อาหาร', 'เดินทาง', 'ช้อปปิ้ง', 'บิล/ค่าบริการ', 'สุขภาพ', 'บันเทิง', SLIP_CATEGORY, FALLBACK_CATEGORY],
  income: ['เงินเดือน', 'รายได้เสริม', FALLBACK_CATEGORY],
};

// หมวดที่ให้ Claude เลือกสำหรับข้อความที่พิมพ์ เมื่อไม่รู้หมวดของผู้ใช้
const TEXT_CATEGORIES = {
  expense: DEFAULT_CATEGORIES.expense.filter((name) => name !== SLIP_CATEGORY),
  income: DEFAULT_CATEGORIES.income,
};

// โค้ดอ้างหมวดเหล่านี้ด้วยชื่อ จึงห้ามผู้ใช้เปลี่ยนชื่อหรือซ่อน
const SYSTEM_CATEGORIES = {
  expense: [SLIP_CATEGORY, FALLBACK_CATEGORY],
  income: [FALLBACK_CATEGORY],
};

// ทุกหมวดที่ไม่ซ่อนถูกส่งให้ Claude ในทุกข้อความ จึงจำกัดความยาวชื่อและจำนวน
const MAX_CATEGORY_NAME_LENGTH = 30;
const MAX_VISIBLE_CATEGORIES = 30;

function isSystemCategory(type, name) {
  return Object.hasOwn(SYSTEM_CATEGORIES, type) && SYSTEM_CATEGORIES[type].includes(name);
}

function isReservedCategoryName(name) {
  return name === FALLBACK_CATEGORY || name === SLIP_CATEGORY;
}

function toTextCategories(categories) {
  const pick = (type) => {
    const names = categories
      .filter((category) => category.type === type && !category.hidden && category.name !== SLIP_CATEGORY)
      .map((category) => category.name);
    // อื่นๆ ต้องมีเสมอ เพราะเป็นหมวดสำรองเมื่อไม่มีหมวดไหนตรง
    return names.includes(FALLBACK_CATEGORY) ? names : [...names, FALLBACK_CATEGORY];
  };
  return { expense: pick('expense'), income: pick('income') };
}

function normalizeCategory(type, name, categories = TEXT_CATEGORIES) {
  return categories[type].includes(name) ? name : FALLBACK_CATEGORY;
}

module.exports = {
  DEFAULT_CATEGORIES,
  TEXT_CATEGORIES,
  SYSTEM_CATEGORIES,
  FALLBACK_CATEGORY,
  SLIP_CATEGORY,
  MAX_CATEGORY_NAME_LENGTH,
  MAX_VISIBLE_CATEGORIES,
  isSystemCategory,
  isReservedCategoryName,
  toTextCategories,
  normalizeCategory,
};
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/parser/categories.test.js`
Expected: PASS ทุกเทสต์ (เทสต์เดิมของ `normalizeCategory` ยังผ่านเพราะ default เป็น `TEXT_CATEGORIES`)

- [ ] **Step 5: Commit**

```bash
git add src/parser/categories.js src/parser/categories.test.js
git commit -F - <<'EOF'
feat: add system category rules and per-user text categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 3: parser รับหมวดของผู้ใช้

**Depends on:** Task 2

**Files:**
- Modify: `src/parser/parse-message.js`
- Test: `src/parser/parse-message.test.js`

**Interfaces:**
- Consumes: `TEXT_CATEGORIES`, `normalizeCategory(type, name, categories)` จาก Task 2
- Produces: `parseMessage(text, history = [], categories = TEXT_CATEGORIES)`; export เพิ่ม `buildParseSchema(categories)`; `PARSE_SCHEMA` และ `ALL_CATEGORIES` เดิมยังอยู่และเท่ากับของหมวดเริ่มต้น

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน import ของ `src/parser/parse-message.test.js` เพิ่ม `buildParseSchema,` ต่อจาก `PARSE_SCHEMA,` แล้วเพิ่มท้ายไฟล์:

```js
describe('parseMessage with the user categories', () => {
  const USER_CATEGORIES = { expense: ['ค่าแมว', 'อาหาร', 'อื่นๆ'], income: ['โบนัส', 'อื่นๆ'] };

  it('offers only the user categories in the prompt and the schema', async () => {
    const client = fakeClient(okPayload([item({ category: 'ค่าแมว' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('อาหารแมว 300', [], USER_CATEGORIES);

    const params = client.messages.create.mock.calls[0][0];
    expect(params.system).toContain('- Expense categories: ค่าแมว, อาหาร, อื่นๆ');
    expect(params.system).toContain('- Income categories: โบนัส, อื่นๆ');
    expect(params.output_config.format.schema).toEqual(buildParseSchema(USER_CATEGORIES));
    expect(params.output_config.format.schema.properties.items.items.properties.category.enum).toEqual([
      'ค่าแมว',
      'อาหาร',
      'อื่นๆ',
      'โบนัส',
    ]);
  });

  it('keeps a user category that Claude picked', async () => {
    const client = fakeClient(okPayload([item({ category: 'ค่าแมว', note: 'อาหารแมว', amount: 300 })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('อาหารแมว 300', [], USER_CATEGORIES);

    expect(result).toEqual({
      status: 'ok',
      items: [{ type: 'expense', category: 'ค่าแมว', amount: 300, date: '2026-09-29', note: 'อาหารแมว' }],
    });
  });

  it('falls back to อื่นๆ for a category outside the user list', async () => {
    const client = fakeClient(okPayload([item({ category: 'เดินทาง' })]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    const result = await parse('BTS 40', [], USER_CATEGORIES);

    expect(result.items[0].category).toBe('อื่นๆ');
  });

  it('uses the default schema object when no categories are given', async () => {
    const client = fakeClient(okPayload([item()]));
    const parse = createMessageParser({ client, model: 'm', now: NOW });

    await parse('กินข้าว 60');

    expect(client.messages.create.mock.calls[0][0].output_config.format.schema).toBe(PARSE_SCHEMA);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: FAIL (`buildParseSchema is not a function` และ prompt ยังมีหมวดเริ่มต้น)

- [ ] **Step 3: เขียนโค้ด**

ใน `src/parser/parse-message.js`:

แทนส่วนตั้งแต่ `const ALL_CATEGORIES = ...` จนจบ `const PARSE_SCHEMA = {...};` ด้วย:

```js
// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เองทุก object
function buildParseSchema(categories) {
  const names = [...new Set([...categories.expense, ...categories.income])];
  return {
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
            category: { type: 'string', enum: names },
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
}

const PARSE_SCHEMA = buildParseSchema(TEXT_CATEGORIES);
const ALL_CATEGORIES = PARSE_SCHEMA.properties.items.items.properties.category.enum;
```

แก้ `buildSystemPrompt`:

```js
function buildSystemPrompt(today, categories) {
```

และสองบรรทัดในนั้น:

```js
    `- Expense categories: ${categories.expense.join(', ')}`,
    `- Income categories: ${categories.income.join(', ')}`,
```

แก้ `normalizeItem` และ `toParseResult`:

```js
function normalizeItem(item, today, categories) {
  return {
    type: item.type,
    category: normalizeCategory(item.type, item.category, categories),
    amount: item.amount,
    date: isValidCalendarDate(item.date) ? item.date : today,
    note: item.note,
  };
}

function toParseResult(data, today, categories) {
```

และบรรทัดท้ายของ `toParseResult`:

```js
  return { status: 'ok', items: data.items.map((item) => normalizeItem(item, today, categories)) };
```

แก้ `createMessageParser`:

```js
function createMessageParser({ client, model, now = () => new Date() }) {
  return async function parseMessage(text, history = [], categories = TEXT_CATEGORIES) {
    const today = toBangkokDateString(now());
    // ใช้ schema ที่สร้างไว้แล้วเมื่อเป็นหมวดเริ่มต้น ไม่ต้องสร้างใหม่ทุกข้อความ
    const schema = categories === TEXT_CATEGORIES ? PARSE_SCHEMA : buildParseSchema(categories);
```

แล้วในตัว request แก้ `system: buildSystemPrompt(today),` เป็น `system: buildSystemPrompt(today, categories),` และ `schema: PARSE_SCHEMA` เป็น `schema` (คือ `format: { type: 'json_schema', schema }`) และบรรทัดสุดท้าย `return toParseResult(data, today);` เป็น `return toParseResult(data, today, categories);`

เพิ่ม `buildParseSchema,` ใน `module.exports` ต่อจาก `PARSE_SCHEMA,`

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: PASS ทุกเทสต์ (เทสต์เดิมที่เทียบ `schema: PARSE_SCHEMA` ยังผ่าน)

- [ ] **Step 5: Commit**

```bash
git add src/parser/parse-message.js src/parser/parse-message.test.js
git commit -F - <<'EOF'
feat: let the message parser use the user categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 4: repository อ่านและแก้หมวด

**Depends on:** Task 1

**Files:**
- Modify: `src/db/repository.js` (`seedDefaultCategories`, `listCategories`, เพิ่ม `createCategory`, `updateCategory`, export)
- Test: `src/db/repository.test.js`

**Interfaces:**
- Produces:
  - `listCategories(userId): Promise<Array<{ id, name, type, hidden: boolean }>>` (select `'id, name, type, hidden'`)
  - `seedDefaultCategories(userId, categories = DEFAULT_CATEGORIES): Promise<void>`
  - `createCategory(userId, { type, name }): Promise<{ status: 'ok', category } | { status: 'duplicate' }>`
  - `updateCategory(userId, id, { name?, hidden? }): Promise<{ status: 'ok', category } | { status: 'duplicate' } | { status: 'not_found' }>`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/db/repository.test.js` แทน `describe('repository.listCategories', ...)` ทั้งก้อนด้วย:

```js
describe('repository.listCategories', () => {
  it('reads this user categories with the hidden flag ordered by type and name', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ id: 'c1', name: 'อาหาร', type: 'expense', hidden: false }],
      error: null,
    });

    expect(await createRepository(supabase).listCategories('user-1')).toEqual([
      { id: 'c1', name: 'อาหาร', type: 'expense', hidden: false },
    ]);
    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, name, type, hidden'],
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

describe('repository.createCategory', () => {
  it('inserts the category for this user and returns it', async () => {
    const row = { id: 'c9', name: 'ค่าแมว', type: 'expense', hidden: false };
    const { supabase, calls } = fakeSupabase({ data: row, error: null });

    const result = await createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'ค่าแมว' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls).toEqual([
      ['from', 'categories'],
      ['insert', { user_id: 'user-1', type: 'expense', name: 'ค่าแมว' }],
      ['select', 'id, name, type, hidden'],
      ['single'],
    ]);
  });

  it('reports a duplicate name instead of throwing', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'อาหาร' })).toEqual({
      status: 'duplicate',
    });
  });

  it('throws DatabaseError for other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).createCategory('user-1', { type: 'expense', name: 'x' })).rejects.toThrow(
      'Database createCategory failed: boom'
    );
  });
});

describe('repository.updateCategory', () => {
  const row = { id: 'c9', name: 'แมว', type: 'expense', hidden: false };

  it('updates only the given fields of this user row and returns it', async () => {
    const { supabase, calls } = fakeSupabase({ data: [row], error: null });

    const result = await createRepository(supabase).updateCategory('user-1', 'c9', { name: 'แมว' });

    expect(result).toEqual({ status: 'ok', category: row });
    expect(calls).toEqual([
      ['from', 'categories'],
      ['update', { name: 'แมว' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'c9'],
      ['select', 'id, name, type, hidden'],
    ]);
  });

  it('sends only hidden when hiding', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...row, hidden: true }], error: null });

    await createRepository(supabase).updateCategory('user-1', 'c9', { hidden: true });

    expect(calls[1]).toEqual(['update', { hidden: true }]);
  });

  it('reports not_found when no row of this user matched', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).updateCategory('user-1', 'c9', { hidden: true })).toEqual({
      status: 'not_found',
    });
  });

  it('reports a duplicate name instead of throwing', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { code: '23505', message: 'duplicate key' } });

    expect(await createRepository(supabase).updateCategory('user-1', 'c9', { name: 'อาหาร' })).toEqual({
      status: 'duplicate',
    });
  });

  it('throws DatabaseError for other errors', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).updateCategory('user-1', 'c9', { name: 'x' })).rejects.toThrow(
      'Database updateCategory failed: boom'
    );
  });
});
```

และใน `describe('repository.seedDefaultCategories', ...)` เพิ่มเทสต์นี้ต่อจากเทสต์แรก:

```js
  it('inserts only the given categories when a set is passed', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).seedDefaultCategories('user-1', { expense: ['อื่นๆ'], income: ['อื่นๆ'] });

    expect(calls[1][1]).toEqual([
      { user_id: 'user-1', type: 'expense', name: 'อื่นๆ' },
      { user_id: 'user-1', type: 'income', name: 'อื่นๆ' },
    ]);
  });
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL (`createCategory is not a function`, select ยังเป็น `'id, name, type'`, seed ยังใส่ 11 แถว)

- [ ] **Step 3: เขียนโค้ด**

ใน `src/db/repository.js` เพิ่มค่าคงที่ต่อจาก `const TRANSACTION_COLUMNS = ...`:

```js
const CATEGORY_COLUMNS = 'id, name, type, hidden';
```

เพิ่ม function นี้ต่อจาก `function toTransaction(row) {...}` (ระดับเดียวกับ `toRule`):

```js
function toCategory(row) {
  return { id: row.id, name: row.name, type: row.type, hidden: row.hidden };
}
```

แทน `seedDefaultCategories`:

```js
  async function seedDefaultCategories(userId, categories = DEFAULT_CATEGORIES) {
    const rows = Object.entries(categories).flatMap(([type, names]) =>
      names.map((name) => ({ user_id: userId, type, name }))
    );
    const { error } = await supabase
      .from('categories')
      .upsert(rows, { onConflict: 'user_id,type,name', ignoreDuplicates: true });
    throwIfError('seedDefaultCategories', error);
  }
```

แทน `listCategories` และเพิ่มสอง function ต่อท้าย:

```js
  async function listCategories(userId) {
    const { data, error } = await supabase
      .from('categories')
      .select(CATEGORY_COLUMNS)
      .eq('user_id', userId)
      .order('type')
      .order('name');
    throwIfError('listCategories', error);
    return data.map(toCategory);
  }

  // ชื่อซ้ำในประเภทเดียวกันชน unique (user_id, type, name) จึงคืน duplicate ให้ API ตอบ 409
  async function createCategory(userId, { type, name }) {
    const { data, error } = await supabase
      .from('categories')
      .insert({ user_id: userId, type, name })
      .select(CATEGORY_COLUMNS)
      .single();
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('createCategory', error);
    return { status: 'ok', category: toCategory(data) };
  }

  async function updateCategory(userId, id, fields) {
    const changes = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.hidden !== undefined) changes.hidden = fields.hidden;
    const { data, error } = await supabase
      .from('categories')
      .update(changes)
      .eq('user_id', userId)
      .eq('id', id)
      .select(CATEGORY_COLUMNS);
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('updateCategory', error);
    return data.length > 0 ? { status: 'ok', category: toCategory(data[0]) } : { status: 'not_found' };
  }
```

ใน object ที่ `createRepository` return เพิ่ม `createCategory,` และ `updateCategory,` ต่อจาก `listCategories,`

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทุกเทสต์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -F - <<'EOF'
feat: read the hidden flag and create or update categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 5: user service ซ่อมเฉพาะหมวดระบบ และโหลดหมวดสำหรับ Claude

**Depends on:** Task 2, Task 4

**Files:**
- Modify: `src/users.js`
- Test: `src/users.test.js`

**Interfaces:**
- Consumes: `SYSTEM_CATEGORIES`, `DEFAULT_CATEGORIES`, `toTextCategories` (Task 2); `repository.listCategories`, `repository.seedDefaultCategories(userId, categories)` (Task 4)
- Produces: `users.loadTextCategories(userId): Promise<{ expense: string[], income: string[] }>`; `users.loadCategoryIds` เดิม (คืน `Map` key `type:name` -> id รวมหมวดที่ซ่อน)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/users.test.js` แก้ import บรรทัดที่ 3 เป็น:

```js
import { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES } from './parser/categories.js';
```

ใน `setup` เพิ่ม `listCategories: vi.fn().mockResolvedValue([]),` ต่อจาก `getCategoryIds: ...`

ใน `describe('userService.loadCategoryIds', ...)`:
- เทสต์ `'seeds default categories and reloads when the user has none'` แก้ assertion เป็น `expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1', DEFAULT_CATEGORIES);`
- เทสต์ `'seeds the missing defaults and reloads when a default category was added after the user joined'` เปลี่ยนชื่อเป็น `'seeds the missing system categories and reloads'` และแก้ assertion เป็น `expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1', SYSTEM_CATEGORIES);`
- เพิ่มเทสต์:

```js
  // ผู้ใช้เปลี่ยนชื่อหมวดเริ่มต้นได้ ถ้าเติมกลับจะมีหมวดชื่อเดิมงอกขึ้นมาซ้ำ
  it('does not seed when only a renamed default category is missing', async () => {
    const withoutFood = new Map([...ALL_DEFAULT_IDS].filter(([key]) => key !== 'expense:อาหาร'));
    const { repository, service } = setup({ getCategoryIds: vi.fn().mockResolvedValue(withoutFood) });

    const ids = await service.loadCategoryIds('user-1');

    expect(repository.seedDefaultCategories).not.toHaveBeenCalled();
    expect(ids).toBe(withoutFood);
  });
```

และเพิ่ม describe ใหม่ท้ายไฟล์:

```js
describe('userService.loadTextCategories', () => {
  it('returns the visible category names by type for Claude', async () => {
    const { repository, service } = setup({
      listCategories: vi.fn().mockResolvedValue([
        { id: 'c1', name: 'ค่าแมว', type: 'expense', hidden: false },
        { id: 'c2', name: 'บันเทิง', type: 'expense', hidden: true },
        { id: 'c3', name: 'อื่นๆ', type: 'expense', hidden: false },
        { id: 'c4', name: 'อื่นๆ', type: 'income', hidden: false },
      ]),
    });

    expect(await service.loadTextCategories('user-1')).toEqual({ expense: ['ค่าแมว', 'อื่นๆ'], income: ['อื่นๆ'] });
    expect(repository.listCategories).toHaveBeenCalledWith('user-1');
  });

  it('rejects when the categories cannot be read', async () => {
    const { service } = setup({ listCategories: vi.fn().mockRejectedValue(new Error('db down')) });

    await expect(service.loadTextCategories('user-1')).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/users.test.js`
Expected: FAIL (`loadTextCategories is not a function`, seed ถูกเรียกด้วย argument เดียว, เทสต์ renamed เรียก seed)

- [ ] **Step 3: เขียนโค้ด**

ใน `src/users.js` แทนบรรทัด require แรกและค่าคงที่ `DEFAULT_CATEGORY_KEYS` ด้วย:

```js
const { DEFAULT_CATEGORIES, SYSTEM_CATEGORIES, toTextCategories } = require('./parser/categories');
const { categoryKey } = require('./db/transaction-rows');

// getProfile ของ LINE SDK ไม่มี timeout ถ้าค้างจะกินเวลาของ reply token
const PROFILE_TIMEOUT_MS = 3000;
const SYSTEM_CATEGORY_KEYS = Object.entries(SYSTEM_CATEGORIES).flatMap(([type, names]) =>
  names.map((name) => categoryKey(type, name))
);
```

(ลบบรรทัด `const { categoryKey } = ...` เดิมที่ซ้ำ และลบ `DEFAULT_CATEGORY_KEYS` ทิ้ง)

แทน `loadCategoryIds` และเพิ่ม `loadTextCategories`:

```js
  async function loadCategoryIds(userId) {
    const categoryIds = await repository.getCategoryIds(userId);
    // ตรวจเฉพาะหมวดระบบ เพราะหมวดเริ่มต้นอื่นผู้ใช้เปลี่ยนชื่อได้ ถ้าเติมกลับจะมีหมวดซ้ำงอกขึ้นมา
    if (SYSTEM_CATEGORY_KEYS.every((key) => categoryIds.has(key))) {
      return categoryIds;
    }
    // ไม่มีหมวดเลยคือสร้างผู้ใช้สำเร็จแต่สร้างหมวดไม่สำเร็จ จึงเติมหมวดเริ่มต้นครบชุด
    await repository.seedDefaultCategories(userId, categoryIds.size === 0 ? DEFAULT_CATEGORIES : SYSTEM_CATEGORIES);
    return repository.getCategoryIds(userId);
  }

  async function loadTextCategories(userId) {
    return toTextCategories(await repository.listCategories(userId));
  }

  return { ensureUser, loadCategoryIds, loadTextCategories };
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/users.test.js`
Expected: PASS ทุกเทสต์

- [ ] **Step 5: Commit**

```bash
git add src/users.js src/users.test.js
git commit -F - <<'EOF'
feat: repair only system categories and load text categories per user

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 6: bot ส่งหมวดของผู้ใช้ให้ parser

**Depends on:** Task 3, Task 5

**Files:**
- Modify: `src/bot.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: `users.loadTextCategories(userId)` (Task 5), `parseMessage(text, history, categories)` (Task 3), `TEXT_CATEGORIES` (Task 2)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/bot.test.js`:

เพิ่ม import ต่อจาก import ของ `./menu/fixed-replies.js`:

```js
import { TEXT_CATEGORIES } from './parser/categories.js';
```

เพิ่มค่าคงที่ต่อจาก `const FOOD_ITEM = ...`:

```js
const USER_TEXT_CATEGORIES = { expense: ['อาหาร', 'อื่นๆ'], income: ['อื่นๆ'] };
```

ใน `setup` ส่วน `users: {` เพิ่ม `loadTextCategories: vi.fn().mockResolvedValue(USER_TEXT_CATEGORIES),` ต่อจาก `ensureUser: ...`

แทนทุกที่ (replace all) ของ `toHaveBeenCalledWith('กินข้าว 60', []);` ด้วย `toHaveBeenCalledWith('กินข้าว 60', [], USER_TEXT_CATEGORIES);` และ `toHaveBeenCalledWith('500000', history);` ด้วย `toHaveBeenCalledWith('500000', history, USER_TEXT_CATEGORIES);`

ในเทสต์ `'does not check budgets for income'` ใน object `users:` เพิ่ม `loadTextCategories: vi.fn().mockResolvedValue(USER_TEXT_CATEGORIES),`

เพิ่ม describe ใหม่ก่อน `describe('bot slip image', () => {`:

```js
describe('bot text categories', () => {
  it('passes the user categories to the parser', async () => {
    const { deps, bot } = setup();
    const categories = { expense: ['ค่าแมว', 'อื่นๆ'], income: ['อื่นๆ'] };
    deps.users.loadTextCategories.mockResolvedValue(categories);

    await bot.handleEvent(textEvent('อาหารแมว 300'));

    expect(deps.users.loadTextCategories).toHaveBeenCalledWith('user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('อาหารแมว 300', [], categories);
  });

  // หมวดเป็นตัวช่วยเลือก ถ้าโหลดไม่ได้ยังบันทึกด้วยหมวดเริ่มต้นได้ ดีกว่าตอบว่าระบบมีปัญหา
  it('falls back to the default categories and still saves when loading them fails', async () => {
    const { deps, bot } = setup();
    deps.users.loadTextCategories.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60', [], TEXT_CATEGORIES);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to load text categories',
      { userId: 'user-1' },
      expect.any(Error)
    );
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  it('does not load categories for the summary menu', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.users.loadTextCategories).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL (parseMessage ถูกเรียกด้วย 2 argument)

- [ ] **Step 3: เขียนโค้ด**

ใน `src/bot.js` เพิ่ม require ต่อจาก `const { formatAmount } = require('./parser/format-reply');`:

```js
const { TEXT_CATEGORIES } = require('./parser/categories');
```

ใน `createBot` เพิ่ม function ต่อจาก `forgetConversation`:

```js
  // หมวดของผู้ใช้เป็นตัวช่วยเลือก ถ้าโหลดไม่ได้ใช้หมวดเริ่มต้นแทน ยังบันทึกรายการได้
  async function loadTextCategories(userId) {
    try {
      return await users.loadTextCategories(userId);
    } catch (err) {
      logger.error('Failed to load text categories', { userId }, err);
      return TEXT_CATEGORIES;
    }
  }
```

ใน `handleText` แทนสองบรรทัด:

```js
    const { messages: history, loadFailed } = await loadHistory(userId);
    const result = await parseMessage(event.message.text, history);
```

ด้วย:

```js
    const { messages: history, loadFailed } = await loadHistory(userId);
    const textCategories = await loadTextCategories(userId);
    const result = await parseMessage(event.message.text, history, textCategories);
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทุกเทสต์ ถ้ามีเทสต์ข้อความอื่นที่ส่ง `users` เองแล้ว fail เพราะ `logger.error` ถูกเรียกเพิ่ม ให้เพิ่ม `loadTextCategories: vi.fn().mockResolvedValue(USER_TEXT_CATEGORIES),` ใน object `users` ของเทสต์นั้น (ค้นด้วย `users: {` ใน `src/bot.test.js`)

- [ ] **Step 5: Commit**

```bash
git add src/bot.js src/bot.test.js
git commit -F - <<'EOF'
feat: parse text messages with the user categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 7: API จัดการหมวด และกรองงบของหมวดที่ซ่อน

**Depends on:** Task 2, Task 4

**Files:**
- Modify: `src/api/validate.js`, `src/api/router.js`
- Test: `src/api/validate.test.js`, `src/api/router.test.js`

**Interfaces:**
- Consumes: `isSystemCategory`, `isReservedCategoryName`, `MAX_CATEGORY_NAME_LENGTH`, `MAX_VISIBLE_CATEGORIES` (Task 2); `repository.listCategories`, `createCategory`, `updateCategory` (Task 4)
- Produces (สัญญา HTTP ที่ Task 8-9 ใช้):
  - `GET /api/categories` -> `200 { categories: [{ id, name, type, hidden, system }] }`
  - `POST /api/categories` body `{ type: 'expense'|'income', name }` -> `201 { category: { id, name, type, hidden, system } }`; `400 { error: 'Invalid body'|'Invalid type'|'Invalid name'|'Reserved name' }`; `409 { error: 'Too many categories'|'Duplicate name' }`
  - `PATCH /api/categories/:id` body `{ name?, hidden? }` -> `200 { category }`; `400 { error: 'Invalid body'|'Invalid name'|'Reserved name'|'Invalid hidden'|'System category' }`; `404 { error: 'Not found' }`; `409 { error: 'Too many categories'|'Duplicate name' }`
  - `GET /api/budgets` ตัดแถวที่ `categoryId` เป็นหมวดซ่อนและ `budget === null && spent === 0`
  - `validateCategoryCreate(body)`, `validateCategoryUpdate(body)` คืน `{ ok: true, value } | { ok: false, error }`

- [ ] **Step 1: เขียนเทสต์ validate ที่ fail**

ใน `src/api/validate.test.js` แก้ import เป็น:

```js
import {
  parseMonth,
  validateTransactionUpdate,
  validateRecurringRule,
  validateCategoryCreate,
  validateCategoryUpdate,
} from './validate.js';
```

เพิ่มท้ายไฟล์:

```js
describe('validateCategoryCreate', () => {
  it('accepts a type and a trimmed name', () => {
    expect(validateCategoryCreate({ type: 'expense', name: '  ค่าแมว ' })).toEqual({
      ok: true,
      value: { type: 'expense', name: 'ค่าแมว' },
    });
  });

  it('accepts a 30 unit name and rejects 31', () => {
    expect(validateCategoryCreate({ type: 'income', name: 'ก'.repeat(30) }).ok).toBe(true);
    expect(validateCategoryCreate({ type: 'income', name: 'ก'.repeat(31) })).toEqual({ ok: false, error: 'Invalid name' });
  });

  // prompt ของ Claude คั่นชื่อหมวดด้วยจุลภาค และตัวควบคุมทำให้ prompt เพี้ยน
  it.each([[''], ['   '], ['แมว,หมา'], ['แมว\nหมา'], ['a\u007fb'], [42], [undefined]])('rejects the name %j', (name) => {
    expect(validateCategoryCreate({ type: 'expense', name })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it('rejects the names of system categories for any type', () => {
    expect(validateCategoryCreate({ type: 'income', name: 'อื่นๆ' })).toEqual({ ok: false, error: 'Reserved name' });
    expect(validateCategoryCreate({ type: 'income', name: 'ใบเสร็จ/สลิปโอนเงิน' })).toEqual({ ok: false, error: 'Reserved name' });
  });

  it('rejects a bad type or body', () => {
    expect(validateCategoryCreate({ type: 'saving', name: 'x' })).toEqual({ ok: false, error: 'Invalid type' });
    expect(validateCategoryCreate(null)).toEqual({ ok: false, error: 'Invalid body' });
  });
});

describe('validateCategoryUpdate', () => {
  it('accepts a new name, a hidden flag, or both', () => {
    expect(validateCategoryUpdate({ name: ' แมว ' })).toEqual({ ok: true, value: { name: 'แมว' } });
    expect(validateCategoryUpdate({ hidden: true })).toEqual({ ok: true, value: { hidden: true } });
    expect(validateCategoryUpdate({ name: 'แมว', hidden: false })).toEqual({ ok: true, value: { name: 'แมว', hidden: false } });
  });

  it('rejects an empty or missing body', () => {
    expect(validateCategoryUpdate({})).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateCategoryUpdate(null)).toEqual({ ok: false, error: 'Invalid body' });
  });

  it('rejects a bad name or hidden value', () => {
    expect(validateCategoryUpdate({ name: '' })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateCategoryUpdate({ name: 'อื่นๆ' })).toEqual({ ok: false, error: 'Reserved name' });
    expect(validateCategoryUpdate({ hidden: 'true' })).toEqual({ ok: false, error: 'Invalid hidden' });
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run src/api/validate.test.js`
Expected: FAIL (`validateCategoryCreate is not a function`)

- [ ] **Step 3: เขียน validate**

ใน `src/api/validate.js` เพิ่ม require ต่อจากบรรทัดที่ 2:

```js
const { MAX_CATEGORY_NAME_LENGTH, isReservedCategoryName } = require('../parser/categories');
```

เพิ่มก่อน `module.exports`:

```js
// prompt ของ Claude คั่นชื่อหมวดด้วยจุลภาค และตัวควบคุมทำให้ prompt เพี้ยน จึงไม่รับทั้งสองแบบ
function hasForbiddenNameCharacter(name) {
  return [...name].some((char) => char === ',' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function validateCategoryName(value) {
  if (typeof value !== 'string') {
    return { ok: false, error: 'Invalid name' };
  }
  const name = value.trim();
  if (name.length === 0 || name.length > MAX_CATEGORY_NAME_LENGTH || hasForbiddenNameCharacter(name)) {
    return { ok: false, error: 'Invalid name' };
  }
  if (isReservedCategoryName(name)) {
    return { ok: false, error: 'Reserved name' };
  }
  return { ok: true, value: name };
}

function validateCategoryCreate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  if (body.type !== 'expense' && body.type !== 'income') {
    return { ok: false, error: 'Invalid type' };
  }
  const name = validateCategoryName(body.name);
  return name.ok ? { ok: true, value: { type: body.type, name: name.value } } : name;
}

function validateCategoryUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const value = {};
  if (body.name !== undefined) {
    const name = validateCategoryName(body.name);
    if (!name.ok) return name;
    value.name = name.value;
  }
  if (body.hidden !== undefined) {
    if (typeof body.hidden !== 'boolean') {
      return { ok: false, error: 'Invalid hidden' };
    }
    value.hidden = body.hidden;
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'Invalid body' };
  }
  return { ok: true, value };
}
```

แก้ `module.exports` เป็น:

```js
module.exports = {
  parseMonth,
  isValidAmount,
  validateTransactionUpdate,
  validateRecurringRule,
  validateCategoryCreate,
  validateCategoryUpdate,
};
```

Run: `npx vitest run src/api/validate.test.js`
Expected: PASS

- [ ] **Step 4: เขียนเทสต์ router ที่ fail**

ใน `src/api/router.test.js` แทน `describe('GET /api/categories', ...)` ทั้งก้อนด้วย:

```js
describe('GET /api/categories', () => {
  it('returns the user categories with a system flag', async () => {
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue([
      { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false },
      { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false },
      { id: 'c-old', name: 'เก่า', type: 'income', hidden: true },
    ]);
    const base = await start(deps);

    const res = await call(base, '/categories');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      categories: [
        { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false, system: false },
        { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false, system: true },
        { id: 'c-old', name: 'เก่า', type: 'income', hidden: true, system: false },
      ],
    });
  });
});

describe('categories API', () => {
  const CAT_ID = '22222222-3333-4444-5555-666666666666';
  const OTHER_ID = '33333333-4444-5555-6666-777777777777';
  const CAT = { id: CAT_ID, name: 'ค่าแมว', type: 'expense', hidden: false };
  const OTHER = { id: OTHER_ID, name: 'อื่นๆ', type: 'expense', hidden: false };
  const visibleExpense = (count) =>
    Array.from({ length: count }, (_, index) => ({ id: `v-${index}`, name: `หมวด ${index}`, type: 'expense', hidden: false }));

  function withCategories(categories) {
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue(categories);
    deps.repository.createCategory = vi.fn().mockResolvedValue({ status: 'ok', category: CAT });
    deps.repository.updateCategory = vi.fn().mockResolvedValue({ status: 'ok', category: { ...CAT, name: 'แมว' } });
    return deps;
  }

  it('creates a category with a trimmed name', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: ' ค่าแมว ' } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ category: { ...CAT, system: false } });
    expect(deps.repository.createCategory).toHaveBeenCalledWith('user-1', { type: 'expense', name: 'ค่าแมว' });
  });

  it.each([
    [{ type: 'saving', name: 'x' }, 'Invalid type'],
    [{ type: 'expense', name: '' }, 'Invalid name'],
    [{ type: 'expense', name: 'อื่นๆ' }, 'Reserved name'],
  ])('refuses to create %j', async (body, error) => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(deps.repository.createCategory).not.toHaveBeenCalled();
  });

  it('answers 409 for a duplicate name', async () => {
    const deps = withCategories([OTHER]);
    deps.repository.createCategory.mockResolvedValue({ status: 'duplicate' });
    const base = await start(deps);

    const res = await call(base, '/categories', { method: 'POST', body: { type: 'expense', name: 'อาหาร' } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Duplicate name' });
  });

  it('refuses a 31st visible category of a type but not when the others are hidden', async () => {
    const full = withCategories(visibleExpense(30));
    const fullBase = await start(full);
    const refused = await call(fullBase, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: 'Too many categories' });
    expect(full.repository.createCategory).not.toHaveBeenCalled();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));

    const hidden = withCategories(visibleExpense(30).map((category) => ({ ...category, hidden: true })));
    const hiddenBase = await start(hidden);
    const allowed = await call(hiddenBase, '/categories', { method: 'POST', body: { type: 'expense', name: 'ใหม่' } });
    expect(allowed.status).toBe(201);
  });

  it('renames a category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'แมว' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ category: { ...CAT, name: 'แมว', system: false } });
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { name: 'แมว' });
  });

  it('hides a category', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.updateCategory.mockResolvedValue({ status: 'ok', category: { ...CAT, hidden: true } });
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: true } });

    expect(res.status).toBe(200);
    expect(deps.repository.updateCategory).toHaveBeenCalledWith('user-1', CAT_ID, { hidden: true });
  });

  it('refuses to change a system category', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const res = await call(base, `/categories/${OTHER_ID}`, { method: 'PATCH', body: { hidden: true } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'System category' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('answers 404 for another user category and for an id that is not a uuid', async () => {
    const deps = withCategories([OTHER]);
    const base = await start(deps);

    const unknown = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: true } });
    const bad = await call(base, '/categories/abc', { method: 'PATCH', body: { hidden: true } });

    expect(unknown.status).toBe(404);
    expect(bad.status).toBe(404);
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });

  it('refuses to unhide past the visible limit', async () => {
    const deps = withCategories([{ ...CAT, hidden: true }, ...visibleExpense(30)]);
    const base = await start(deps);

    const res = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: false } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many categories' });
  });

  it('maps duplicate and not_found from the repository', async () => {
    const deps = withCategories([CAT, OTHER]);
    deps.repository.updateCategory
      .mockResolvedValueOnce({ status: 'duplicate' })
      .mockResolvedValueOnce({ status: 'not_found' });
    const base = await start(deps);

    const duplicate = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'อาหาร' } });
    const gone = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { name: 'แมว' } });

    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: 'Duplicate name' });
    expect(gone.status).toBe(404);
  });

  it('rejects a bad patch body', async () => {
    const deps = withCategories([CAT, OTHER]);
    const base = await start(deps);

    const empty = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: {} });
    const badHidden = await call(base, `/categories/${CAT_ID}`, { method: 'PATCH', body: { hidden: 'yes' } });

    expect(await empty.json()).toEqual({ error: 'Invalid body' });
    expect(await badHidden.json()).toEqual({ error: 'Invalid hidden' });
    expect(deps.repository.updateCategory).not.toHaveBeenCalled();
  });
});
```

และใน `describe('budgets', ...)` เพิ่มเทสต์ต่อจากเทสต์แรก:

```js
  // หมวดที่ซ่อนแต่ยังมีงบหรือยอดต้องเห็นอยู่ ผู้ใช้จะได้ยกเลิกงบที่ค้างได้
  it('drops a hidden category only when the month has no budget and no spending', async () => {
    const deps = setup();
    deps.repository.listCategories.mockResolvedValue([
      ...CATEGORIES,
      { id: 'c-old', name: 'เก่า', type: 'expense', hidden: true },
      { id: 'c-old2', name: 'เก่า2', type: 'expense', hidden: true },
      { id: 'c-old3', name: 'เก่า3', type: 'expense', hidden: true },
    ]);
    deps.repository.getBudgetStatus.mockResolvedValue([
      { categoryId: 'c-food', category: 'อาหาร', budget: null, spent: 0 },
      { categoryId: 'c-old', category: 'เก่า', budget: null, spent: 0 },
      { categoryId: 'c-old2', category: 'เก่า2', budget: 1000, spent: 0 },
      { categoryId: 'c-old3', category: 'เก่า3', budget: null, spent: 15 },
    ]);
    const base = await start(deps);

    const res = await call(base, '/budgets?month=2026-09');

    expect((await res.json()).budgets.map((row) => row.categoryId)).toEqual(['c-food', 'c-old2', 'c-old3']);
  });
```

- [ ] **Step 5: รันให้เห็นว่า fail**

Run: `npx vitest run src/api/router.test.js`
Expected: FAIL (POST/PATCH `/categories` ตอบ 404, GET ไม่มี `system`, งบยังมี `c-old`)

- [ ] **Step 6: เขียน router**

ใน `src/api/router.js` แก้ require ของ validate เป็น:

```js
const {
  parseMonth,
  isValidAmount,
  validateTransactionUpdate,
  validateRecurringRule,
  validateCategoryCreate,
  validateCategoryUpdate,
} = require('./validate');
```

เพิ่ม require และ helper ต่อจาก `const MAX_RECURRING_RULES = 50;`:

```js
const { isSystemCategory, MAX_VISIBLE_CATEGORIES } = require('../parser/categories');

function withSystemFlag(category) {
  return { ...category, system: isSystemCategory(category.type, category.name) };
}

function countVisible(categories, type) {
  return categories.filter((category) => category.type === type && !category.hidden).length;
}
```

แทน route `GET /categories` ด้วย:

```js
  router.get('/categories', async (req, res) => {
    const categories = await repository.listCategories(req.userId);
    res.json({ categories: categories.map(withSystemFlag) });
  });

  router.post('/categories', async (req, res) => {
    const result = validateCategoryCreate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    if (countVisible(categories, result.value.type) >= MAX_VISIBLE_CATEGORIES) {
      res.status(409).json({ error: 'Too many categories' });
      return;
    }
    const created = await repository.createCategory(req.userId, result.value);
    if (created.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    res.status(201).json({ category: withSystemFlag(created.category) });
  });

  router.patch('/categories/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateCategoryUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const categories = await repository.listCategories(req.userId);
    const category = categories.find((item) => item.id === req.params.id);
    if (!category) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    // โค้ดอ้างหมวดระบบด้วยชื่อ ถ้าเปลี่ยนชื่อหรือซ่อนจะบันทึกรายการที่ไม่เข้าหมวดไหนไม่ได้
    if (isSystemCategory(category.type, category.name)) {
      res.status(400).json({ error: 'System category' });
      return;
    }
    const unhiding = result.value.hidden === false && category.hidden;
    if (unhiding && countVisible(categories, category.type) >= MAX_VISIBLE_CATEGORIES) {
      res.status(409).json({ error: 'Too many categories' });
      return;
    }
    const updated = await repository.updateCategory(req.userId, category.id, result.value);
    if (updated.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    if (updated.status === 'not_found') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ category: withSystemFlag(updated.category) });
  });
```

แทนบรรทัดสุดท้ายของ route `GET /budgets` (`res.json({ budgets: await repository.getBudgetStatus(req.userId, month) });`) ด้วย:

```js
    const [budgets, categories] = await Promise.all([
      repository.getBudgetStatus(req.userId, month),
      repository.listCategories(req.userId),
    ]);
    const hiddenIds = new Set(categories.filter((category) => category.hidden).map((category) => category.id));
    // หมวดที่ซ่อนยังแสดงถ้ามีงบหรือยอดในเดือนนั้น ผู้ใช้จะได้ยกเลิกงบที่ค้างได้
    res.json({
      budgets: budgets.filter((row) => !hiddenIds.has(row.categoryId) || row.budget !== null || row.spent > 0),
    });
```

- [ ] **Step 7: รันให้ผ่าน**

Run: `npx vitest run src/api/router.test.js src/api/validate.test.js`
Expected: PASS ทุกเทสต์

- [ ] **Step 8: Commit**

```bash
git add src/api/validate.js src/api/validate.test.js src/api/router.js src/api/router.test.js
git commit -F - <<'EOF'
feat: add category create and update endpoints

Hidden categories with no budget and no spending in the month are left
out of the budget list.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 8: LIFF ตัวช่วยที่ไม่แตะ DOM (api, ตัวเลือกหมวด, ข้อความ error)

**Depends on:** Task 7

**Files:**
- Modify: `public/liff/api.mjs`, `public/liff/format.mjs`
- Create: `public/liff/categories-format.mjs`
- Test: `public/liff/api.test.mjs`, `public/liff/format.test.mjs`, `public/liff/categories-format.test.mjs`

**Interfaces:**
- Consumes: สัญญา HTTP ของ Task 7
- Produces:
  - `api.createCategory({ type, name })` -> `POST /api/categories`
  - `api.updateCategory(id, { name?, hidden? })` -> `PATCH /api/categories/:id`
  - `groupCategoryOptions(categories, { includeHidden = false, keepId = null } = {})` -> `{ expense, income }`
  - `describeCategoryError(status: number, error: string | undefined): string`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/api.test.mjs` เพิ่มใน `describe('createApi', ...)`:

```js
  it('creates and updates categories', async () => {
    const fetchImpl = fakeFetch(200, { category: {} });
    const api = setup(fetchImpl);

    await api.createCategory({ type: 'expense', name: 'ค่าแมว' });
    await api.updateCategory('c 1', { hidden: true });

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method, options.body])).toEqual([
      ['/api/categories', 'POST', JSON.stringify({ type: 'expense', name: 'ค่าแมว' })],
      ['/api/categories/c%201', 'PATCH', JSON.stringify({ hidden: true })],
    ]);
  });
```

ใน `public/liff/format.test.mjs` แทน `describe('groupCategoryOptions', ...)` ด้วย:

```js
describe('groupCategoryOptions', () => {
  const food = { id: 'c1', name: 'อาหาร', type: 'expense' };
  const salary = { id: 'c2', name: 'เงินเดือน', type: 'income' };
  const old = { id: 'c3', name: 'เก่า', type: 'expense', hidden: true };

  it('splits categories by type', () => {
    expect(groupCategoryOptions([food, salary])).toEqual({ expense: [food], income: [salary] });
  });

  it('leaves hidden categories out by default', () => {
    expect(groupCategoryOptions([food, old, salary])).toEqual({ expense: [food], income: [salary] });
  });

  it('keeps the hidden category of the entry being edited', () => {
    expect(groupCategoryOptions([food, old, salary], { keepId: 'c3' })).toEqual({ expense: [food, old], income: [salary] });
  });

  it('includes every hidden category when asked', () => {
    expect(groupCategoryOptions([food, old, salary], { includeHidden: true })).toEqual({
      expense: [food, old],
      income: [salary],
    });
  });
});
```

สร้าง `public/liff/categories-format.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { describeCategoryError } from './categories-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

describe('describeCategoryError', () => {
  it.each([
    [401, undefined, LOGIN_REQUIRED_MESSAGE],
    [409, 'Duplicate name', 'มีหมวดชื่อนี้อยู่แล้ว'],
    [409, 'Too many categories', 'มีหมวดที่ใช้อยู่ได้ไม่เกิน 30 หมวดต่อประเภท ซ่อนหมวดที่ไม่ใช้ก่อน'],
    [400, 'Invalid name', 'ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
    [400, 'Reserved name', 'ชื่อนี้ใช้กับหมวดของระบบแล้ว ลองชื่ออื่น'],
    [400, 'System category', 'หมวดของระบบแก้ไม่ได้'],
    [404, 'Not found', 'ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่'],
    [500, undefined, 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง'],
    [0, undefined, 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง'],
  ])('status %s %s -> %s', (status, error, message) => {
    expect(describeCategoryError(status, error)).toBe(message);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run public/liff/api.test.mjs public/liff/format.test.mjs public/liff/categories-format.test.mjs`
Expected: FAIL (`createCategory is not a function`, หมวดที่ซ่อนยังอยู่ในผล, import `categories-format.mjs` ไม่ได้)

- [ ] **Step 3: เขียนโค้ด**

ใน `public/liff/api.mjs` เพิ่มใน object ที่ return ต่อจาก `listCategories: ...`:

```js
    createCategory: (body) => request('/categories', { method: 'POST', body: JSON.stringify(body) }),
    updateCategory: (id, body) =>
      request(`/categories/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
```

ใน `public/liff/format.mjs` แทน `groupCategoryOptions` ด้วย:

```js
// หมวดที่ซ่อนไม่ให้เลือกใหม่ ยกเว้นหมวดเดิมของรายการที่กำลังแก้ หรือเมื่อขอทั้งหมดสำหรับตัวกรอง
export function groupCategoryOptions(categories, { includeHidden = false, keepId = null } = {}) {
  const shown = categories.filter((category) => includeHidden || !category.hidden || category.id === keepId);
  return {
    expense: shown.filter((category) => category.type === 'expense'),
    income: shown.filter((category) => category.type === 'income'),
  };
}
```

สร้าง `public/liff/categories-format.mjs`:

```js
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

const MESSAGES = new Map([
  ['409:Duplicate name', 'มีหมวดชื่อนี้อยู่แล้ว'],
  ['409:Too many categories', 'มีหมวดที่ใช้อยู่ได้ไม่เกิน 30 หมวดต่อประเภท ซ่อนหมวดที่ไม่ใช้ก่อน'],
  ['400:Invalid name', 'ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)'],
  ['400:Reserved name', 'ชื่อนี้ใช้กับหมวดของระบบแล้ว ลองชื่ออื่น'],
  ['400:System category', 'หมวดของระบบแก้ไม่ได้'],
]);

export function describeCategoryError(status, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบหมวดนี้แล้ว ลองเปิดหน้าใหม่';
  return MESSAGES.get(`${status}:${error}`) ?? 'บันทึกหมวดไม่สำเร็จ ลองใหม่อีกครั้ง';
}
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run public/liff/api.test.mjs public/liff/format.test.mjs public/liff/categories-format.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add public/liff/api.mjs public/liff/api.test.mjs public/liff/format.mjs public/liff/format.test.mjs public/liff/categories-format.mjs public/liff/categories-format.test.mjs
git commit -F - <<'EOF'
feat: add LIFF helpers for managing categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 9: LIFF ส่วน "หมวดของฉัน" และตัวเลือกหมวดที่ไม่แสดงหมวดซ่อน

**Depends on:** Task 8

**Files:**
- Create: `public/liff/categories-panel.mjs`
- Modify: `public/liff/index.html`, `public/liff/style.css`, `public/liff/app.mjs`, `public/liff/bill-form.mjs`
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `api.createCategory`, `api.updateCategory`, `groupCategoryOptions`, `describeCategoryError` (Task 8); `createCategoryBadge` จาก `categories.mjs`
- Produces: `createCategoriesPanel({ doc, els, getApi, getCategories, onChanged }) -> { render }`

**Browser check:**
- Preconditions: deploy branch นี้ (หรือชี้ LIFF Endpoint ไปที่ tunnel ของเครื่อง) และรัน `supabase/017_category_hidden.sql` ใน Supabase แล้ว; บัญชี LINE ที่เปิดหน้าเว็บผ่าน LIFF ได้
- Base URL: ลิงก์ LIFF ของบอท (`https://liff.line.me/<LIFF_ID>`) เปิดจากแอป LINE

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "โปรไฟล์" | มีการ์ด "หมวดของฉัน" ใต้การ์ดโปรไฟล์ แสดงหัวข้อ "หมวดรายจ่าย" และ "หมวดรายรับ"; แถว "อื่นๆ" และ "ใบเสร็จ/สลิปโอนเงิน" มีข้อความ "หมวดของระบบ" และไม่มีปุ่ม |
| 2 | เลือก "รายจ่าย" พิมพ์ "ค่าแมว" แตะ "เพิ่ม" | แถว "ค่าแมว" ขึ้นในหมวดรายจ่าย และมีข้อความ "เพิ่มหมวด ค่าแมว แล้ว" |
| 3 | พิมพ์ "ค่าแมว" อีกครั้งแล้วแตะ "เพิ่ม" | ข้อความแดง "มีหมวดชื่อนี้อยู่แล้ว" และไม่มีแถวซ้ำ |
| 4 | แตะ "เปลี่ยนชื่อ" ที่แถว "ค่าแมว" พิมพ์ "แมว" แตะ "บันทึก" | dialog ปิด แถวเปลี่ยนเป็น "แมว" |
| 5 | แตะ "ซ่อน" ที่แถว "บันเทิง" | แถวมีป้าย "ซ่อนอยู่" และปุ่มเปลี่ยนเป็น "เลิกซ่อน" |
| 6 | แท็บ "รายการ" แตะรายการใดก็ได้เพื่อแก้ แล้วเปิดตัวเลือกหมวด | ไม่มี "บันเทิง" แต่มี "แมว"; ตัวกรองหมวดด้านบนรายการยังมี "บันเทิง" |
| 7 | กลับไปแชตกับบอท พิมพ์ "อาหารแมว 300" | การ์ดบันทึกแสดงหมวด "แมว" |

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/app.dom.test.mjs`:

แก้ `makeFetch` ให้ส่ง `error` กลับได้ (แทนเงื่อนไข `if (body && typeof body === 'object' && typeof body.status === 'number' && Object.keys(body).length === 1) {...}` ทั้งบล็อก):

```js
    // { status } หรือ { status, error } คือ HTTP error พร้อม body แบบที่ server ตอบ
    if (body && typeof body === 'object' && typeof body.status === 'number' && Object.keys(body).every((key) => key === 'status' || key === 'error')) {
      return { ok: false, status: body.status, json: async () => (body.error === undefined ? {} : { error: body.error }) };
    }
```

ใน `describe('index.html static invariants', ...)` เทสต์ `'starts every JS-controlled loading and error element hidden'` เพิ่ม `'categories-manager',` ต่อจาก `'friends',` ในรายการ `ids`

เพิ่มสอง describe นี้ท้ายไฟล์:

```js
describe('LIFF category manager', () => {
  const MANAGED = [
    { id: 'c-food', name: 'อาหาร', type: 'expense', hidden: false, system: false },
    { id: 'c-trip', name: 'เดินทาง', type: 'expense', hidden: true, system: false },
    { id: 'c-other', name: 'อื่นๆ', type: 'expense', hidden: false, system: true },
    { id: 'c-salary', name: 'เงินเดือน', type: 'income', hidden: false, system: false },
  ];

  // หยุด boot ที่ liff.init เพื่อให้ route ใช้กับการโหลดหมวดครั้งแรกด้วย
  async function openManager(route = () => undefined) {
    const liff = await boot({ holdInit: true });
    const calls = routeFetch((method, path) => {
      const override = route(method, path);
      if (override !== undefined) return override;
      return method === 'GET' && path === '/api/categories' ? { categories: MANAGED } : undefined;
    });
    liff.releaseInit();
    await settle();
    clickTab('profile');
    return calls;
  }

  const namesIn = (id) => [...byId(id).querySelectorAll('.category-row-name')].map((el) => el.textContent);
  const optionsOf = (id) => [...byId(id).options].map((option) => option.textContent);
  const rowOf = (id) => document.querySelector(`[data-category-id="${id}"]`);

  it('lists the categories by type and marks hidden and system ones', async () => {
    await openManager();

    expect(byId('categories-manager').hidden).toBe(false);
    expect(namesIn('category-rows-expense')).toEqual(['อาหาร', 'เดินทาง', 'อื่นๆ']);
    expect(namesIn('category-rows-income')).toEqual(['เงินเดือน']);
    expect(rowOf('c-trip').querySelector('.category-hidden-tag').textContent).toBe('ซ่อนอยู่');
    expect(rowOf('c-trip').querySelector('[data-action="toggle-hidden"]').textContent).toBe('เลิกซ่อน');
    expect(rowOf('c-other').querySelector('.category-system-note').textContent).toBe('หมวดของระบบ');
    expect(rowOf('c-other').querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps hidden categories out of the pickers but in the list filter', async () => {
    await openManager();

    expect(optionsOf('edit-category')).toEqual(['อาหาร', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('recurring-category')).toEqual(['อาหาร', 'อื่นๆ', 'เงินเดือน']);
    expect(optionsOf('filter-category')).toEqual(['ทุกหมวด', 'อาหาร', 'เดินทาง', 'อื่นๆ', 'เงินเดือน']);
  });

  it('keeps the hidden category selected when editing an old entry in it', async () => {
    await openManager();
    clickTab('list');

    [...document.querySelectorAll('#list .row-button')].find((button) => button.textContent.includes('BTS')).click();
    await settle();

    expect(byId('edit-category').value).toBe('c-trip');
  });

  it('adds a category and offers it in the pickers', async () => {
    const created = { id: 'c-cat', name: 'ค่าแมว', type: 'expense', hidden: false, system: false };
    const calls = await openManager((method, path) => (method === 'POST' && path === '/api/categories' ? { category: created } : undefined));

    byId('category-add-type').value = 'expense';
    byId('category-add-name').value = '  ค่าแมว ';
    byId('category-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(calls).toContain('POST /api/categories');
    expect(namesIn('category-rows-expense')).toContain('ค่าแมว');
    expect(optionsOf('edit-category')).toContain('ค่าแมว');
    expect(byId('category-add-name').value).toBe('');
    expect(byId('category-status').textContent).toBe('เพิ่มหมวด ค่าแมว แล้ว');
  });

  it('shows the server reason when adding fails', async () => {
    await openManager((method, path) =>
      method === 'POST' && path === '/api/categories' ? { status: 409, error: 'Duplicate name' } : undefined
    );

    byId('category-add-name').value = 'อาหาร';
    byId('category-add-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('category-add-error').textContent).toBe('มีหมวดชื่อนี้อยู่แล้ว');
    expect(namesIn('category-rows-expense')).toEqual(['อาหาร', 'เดินทาง', 'อื่นๆ']);
  });

  it('hides a category and drops it from the edit picker', async () => {
    const calls = await openManager((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], hidden: true } } : undefined
    );

    rowOf('c-food').querySelector('[data-action="toggle-hidden"]').click();
    await settle();

    expect(calls).toContain('PATCH /api/categories/c-food');
    expect(rowOf('c-food').querySelector('[data-action="toggle-hidden"]').textContent).toBe('เลิกซ่อน');
    expect(optionsOf('edit-category')).not.toContain('อาหาร');
    expect(byId('category-status').textContent).toBe('ซ่อนหมวด อาหาร แล้ว');
  });

  it('renames a category through the dialog', async () => {
    await openManager((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { category: { ...MANAGED[0], name: 'ข้าว' } } : undefined
    );

    rowOf('c-food').querySelector('[data-action="rename"]').click();
    expect(byId('category-dialog').hasAttribute('open')).toBe(true);
    expect(byId('category-dialog-name').value).toBe('อาหาร');
    byId('category-dialog-name').value = 'ข้าว';
    byId('category-dialog-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('category-dialog').hasAttribute('open')).toBe(false);
    expect(namesIn('category-rows-expense')).toContain('ข้าว');
    expect(optionsOf('edit-category')).toContain('ข้าว');
  });

  it('keeps the rename dialog open with the reason when it fails', async () => {
    await openManager((method, path) =>
      method === 'PATCH' && path === '/api/categories/c-food' ? { status: 400, error: 'Invalid name' } : undefined
    );

    rowOf('c-food').querySelector('[data-action="rename"]').click();
    byId('category-dialog-name').value = 'a,b';
    byId('category-dialog-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('category-dialog').hasAttribute('open')).toBe(true);
    expect(byId('category-dialog-error').textContent).toBe('ชื่อหมวดต้องยาว 1-30 ตัวอักษร และห้ามมีเครื่องหมายจุลภาค (,)');
  });
});

describe('LIFF bill form with a hidden category', () => {
  it('does not offer a hidden expense category', async () => {
    const liff = await boot({ search: '?tab=bills', holdInit: true });
    routeFetch((method, path) =>
      method === 'GET' && path === '/api/categories'
        ? { categories: [...CATEGORIES, { id: 'c-old', name: 'เก่า', type: 'expense', hidden: true }] }
        : undefined
    );
    liff.releaseInit();
    await settle();

    byId('bill-new').click();
    await settle();

    expect([...byId('bill-form-category').options].map((option) => option.textContent)).toEqual(['อาหาร', 'เดินทาง']);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: FAIL (`byId('categories-manager')` เป็น null และตัวเลือกหมวดยังมีหมวดที่ซ่อน)

- [ ] **Step 3: เพิ่ม HTML**

ใน `public/liff/index.html` เพิ่ม section นี้ต่อจาก `</section>` ที่ปิด `profile-card` (ก่อน `<section id="friends" ...>`):

```html
      <section id="categories-manager" class="categories-manager" aria-labelledby="categories-manager-title" hidden>
        <h2 id="categories-manager-title">หมวดของฉัน</h2>
        <p class="friends-hint">หมวดที่ซ่อนจะไม่ให้เลือกใหม่ แต่รายการเก่ายังอยู่ครบ</p>
        <form id="category-add-form" class="category-add" novalidate>
          <label for="category-add-name">เพิ่มหมวด</label>
          <div class="category-add-fields">
            <select id="category-add-type" aria-label="ประเภทหมวด">
              <option value="expense">รายจ่าย</option>
              <option value="income">รายรับ</option>
            </select>
            <input id="category-add-name" type="text" maxlength="30" autocomplete="off" placeholder="เช่น ค่าแมว">
            <button type="submit" id="category-add-submit">เพิ่ม</button>
          </div>
          <p id="category-add-error" class="error" role="alert"></p>
        </form>
        <p id="category-status" class="export-status" role="status" aria-live="polite"></p>
        <h3 class="category-group">หมวดรายจ่าย</h3>
        <ul id="category-rows-expense" class="category-rows"></ul>
        <h3 class="category-group">หมวดรายรับ</h3>
        <ul id="category-rows-income" class="category-rows"></ul>
      </section>
```

และเพิ่ม dialog นี้ต่อจาก `</dialog>` ของ `friend-dialog`:

```html
  <dialog id="category-dialog" aria-labelledby="category-dialog-title">
    <form id="category-dialog-form" novalidate>
      <h2 id="category-dialog-title">เปลี่ยนชื่อหมวด</h2>
      <label for="category-dialog-name">ชื่อใหม่</label>
      <input id="category-dialog-name" type="text" maxlength="30" autocomplete="off">
      <p id="category-dialog-error" class="error" role="alert"></p>
      <div class="actions">
        <button type="button" id="category-dialog-cancel">ยกเลิก</button>
        <button type="submit" id="category-dialog-save" class="primary">บันทึก</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 4: เพิ่ม CSS**

ต่อท้าย `public/liff/style.css`:

```css
.categories-manager { margin: 12px 16px 0; padding: 20px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.categories-manager h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.3; }
.category-add { margin-top: 16px; }
.category-add-fields { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.category-add-fields input { flex: 1 1 140px; min-width: 0; }
.category-group { margin: 16px 0 0; font-size: 15px; font-weight: 700; }
.category-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.category-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 48px; border-bottom: 1px solid var(--border); }
.category-row-name { display: flex; flex: 1; align-items: center; gap: 12px; min-width: 0; overflow-wrap: anywhere; }
.category-hidden-tag, .category-system-note { font-size: 13px; color: var(--muted); }
.category-actions { display: flex; gap: 4px; }
.category-actions button { font: inherit; font-weight: 700; min-height: 44px; padding: 0 12px; border: none; background: none; color: var(--primary); }
#category-add-error:empty, #category-dialog .error:empty { display: none; }
```

- [ ] **Step 5: เขียน panel**

สร้าง `public/liff/categories-panel.mjs`:

```js
import { ApiError } from './api.mjs';
import { createCategoryBadge } from './categories.mjs';
import { describeCategoryError } from './categories-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);

// ส่วนจัดการหมวดในแท็บโปรไฟล์ ใช้หมวดชุดเดียวกับทั้งหน้า แก้แล้วส่งชุดใหม่ให้ app อัปเดตตัวเลือกหมวดทุกที่
export function createCategoriesPanel({ doc, els, getApi, getCategories, onChanged }) {
  let busy = false;
  let renaming = null;

  function setBusy(next) {
    busy = next;
    els.addSubmit.disabled = next;
    els.dialogSave.disabled = next;
    for (const button of els.section.querySelectorAll('.category-actions button')) button.disabled = next;
  }

  function setStatus(text) {
    els.status.textContent = text;
  }

  function actionButton(label, ariaLabel, action, onClick) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.action = action;
    button.setAttribute('aria-label', ariaLabel);
    button.disabled = busy;
    button.addEventListener('click', onClick);
    return button;
  }

  function renderRow(category) {
    const item = doc.createElement('li');
    item.className = 'category-row';
    item.dataset.categoryId = category.id;
    const name = doc.createElement('span');
    name.className = 'category-row-name';
    name.append(createCategoryBadge(doc, category.name), doc.createTextNode(category.name));
    item.append(name);
    if (category.hidden) {
      const tag = doc.createElement('span');
      tag.className = 'category-hidden-tag';
      tag.textContent = 'ซ่อนอยู่';
      item.append(tag);
    }
    if (category.system) {
      const note = doc.createElement('span');
      note.className = 'category-system-note';
      note.textContent = 'หมวดของระบบ';
      item.append(note);
      return item;
    }
    const toggleLabel = category.hidden ? 'เลิกซ่อน' : 'ซ่อน';
    const actions = doc.createElement('div');
    actions.className = 'category-actions';
    actions.append(
      actionButton('เปลี่ยนชื่อ', `เปลี่ยนชื่อหมวด ${category.name}`, 'rename', () => openRename(category)),
      actionButton(toggleLabel, `${toggleLabel}หมวด ${category.name}`, 'toggle-hidden', () => toggleHidden(category))
    );
    item.append(actions);
    return item;
  }

  function render() {
    const categories = getCategories();
    els.section.hidden = categories.length === 0;
    els.expenseRows.replaceChildren(...categories.filter((category) => category.type === 'expense').map(renderRow));
    els.incomeRows.replaceChildren(...categories.filter((category) => category.type === 'income').map(renderRow));
  }

  async function update(category, changes, showError) {
    setBusy(true);
    try {
      const { category: updated } = await getApi().updateCategory(category.id, changes);
      onChanged(getCategories().map((item) => (item.id === updated.id ? updated : item)));
      return updated;
    } catch (err) {
      showError(describeCategoryError(statusOf(err), errorOf(err)));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggleHidden(category) {
    if (busy) return;
    setStatus('');
    const updated = await update(category, { hidden: !category.hidden }, setStatus);
    if (updated) setStatus(updated.hidden ? `ซ่อนหมวด ${updated.name} แล้ว` : `เลิกซ่อนหมวด ${updated.name} แล้ว`);
  }

  function openRename(category) {
    renaming = category;
    els.dialogName.value = category.name;
    els.dialogError.textContent = '';
    els.dialog.showModal();
    els.dialogName.focus();
  }

  els.dialogForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !renaming) return;
    els.dialogError.textContent = '';
    const updated = await update(renaming, { name: els.dialogName.value.trim() }, (message) => {
      els.dialogError.textContent = message;
    });
    if (!updated) return;
    renaming = null;
    els.dialog.close();
    setStatus(`เปลี่ยนชื่อหมวดเป็น ${updated.name} แล้ว`);
  });

  els.dialogCancel.addEventListener('click', () => {
    renaming = null;
    els.dialog.close();
  });

  els.addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    els.addError.textContent = '';
    setStatus('');
    setBusy(true);
    try {
      const { category } = await getApi().createCategory({ type: els.addType.value, name: els.addName.value.trim() });
      els.addName.value = '';
      onChanged([...getCategories(), category]);
      setStatus(`เพิ่มหมวด ${category.name} แล้ว`);
    } catch (err) {
      els.addError.textContent = describeCategoryError(statusOf(err), errorOf(err));
    } finally {
      setBusy(false);
    }
  });

  return { render };
}
```

- [ ] **Step 6: ต่อ panel เข้า app และกรองตัวเลือกหมวด**

ใน `public/liff/app.mjs`:

1. เพิ่ม import ต่อจาก `import { createFriendsPanel } from './friends-panel.mjs';`:

```js
import { createCategoriesPanel } from './categories-panel.mjs';
```

2. เพิ่มต่อจาก `const friendsPanel = createFriendsPanel({...});` (หลังวงเล็บปิดของ call นั้น):

```js
const categoriesPanel = createCategoriesPanel({
  doc: document,
  els: {
    section: document.getElementById('categories-manager'),
    addForm: document.getElementById('category-add-form'),
    addType: document.getElementById('category-add-type'),
    addName: document.getElementById('category-add-name'),
    addSubmit: document.getElementById('category-add-submit'),
    addError: document.getElementById('category-add-error'),
    status: document.getElementById('category-status'),
    expenseRows: document.getElementById('category-rows-expense'),
    incomeRows: document.getElementById('category-rows-income'),
    dialog: document.getElementById('category-dialog'),
    dialogForm: document.getElementById('category-dialog-form'),
    dialogName: document.getElementById('category-dialog-name'),
    dialogError: document.getElementById('category-dialog-error'),
    dialogSave: document.getElementById('category-dialog-save'),
    dialogCancel: document.getElementById('category-dialog-cancel'),
  },
  getApi: () => api,
  getCategories: () => categories,
  onChanged: (next) => setCategories(next),
});
```

3. แทน `function fillCategoryOptions() {...}` ทั้งก้อนด้วย:

```js
function fillCategoryOptions() {
  const visible = groupCategoryOptions(categories);
  fillGroupedSelect(els.category, visible);
  fillGroupedSelect(els.recurringCategory, visible);
  // ตัวกรองต้องเลือกหมวดที่ซ่อนแล้วได้ เพราะรายการเก่ายังอยู่ในหมวดนั้น
  const all = groupCategoryOptions(categories, { includeHidden: true });
  const selected = fillGroupedSelect(els.filterCategory, all, new Option('ทุกหมวด', ''));
  // คืนค่าที่เลือกไว้เฉพาะเมื่อยังมีตัวเลือกนั้น ไม่งั้น select จะว่าง
  els.filterCategory.value = selected;
  if (els.filterCategory.value !== selected) els.filterCategory.value = '';
}

function setCategories(next) {
  categories = next;
  fillCategoryOptions();
  categoriesPanel.render();
}

// รายการเก่าอาจอยู่ในหมวดที่ซ่อนแล้ว ต้องใส่หมวดนั้นกลับเข้าตัวเลือก ไม่งั้น select ว่างแล้วบันทึกผิดหมวด
function showCategoryOptions(select, keepId) {
  fillGroupedSelect(select, groupCategoryOptions(categories, { keepId }));
  select.value = keepId ?? '';
}
```

4. ใน `ensureCategories` แทน:

```js
      ({ categories } = await api.listCategories());
      fillCategoryOptions();
```

ด้วย:

```js
      setCategories((await api.listCategories()).categories);
```

5. ใน `openEditor` แทน `els.category.value = item.categoryId;` ด้วย `showCategoryOptions(els.category, item.categoryId);`

6. ใน `openRecurringEditor` แทน:

```js
  if (row) {
    els.recurringCategory.value = row.categoryId;
  } else if (els.recurringCategory.options.length > 0) {
    els.recurringCategory.selectedIndex = 0;
  }
```

ด้วย:

```js
  showCategoryOptions(els.recurringCategory, row ? row.categoryId : null);
  if (!row && els.recurringCategory.options.length > 0) els.recurringCategory.selectedIndex = 0;
```

7. ใน `loadAll` แทน:

```js
  ({ categories } = await api.listCategories());
  fillCategoryOptions();
```

ด้วย:

```js
  setCategories((await api.listCategories()).categories);
```

ใน `public/liff/bill-form.mjs` ใน `fillCategories` แทนบรรทัดแรก:

```js
    const expense = getCategories().filter((category) => category.type === 'expense' && !category.hidden);
```

- [ ] **Step 7: รันให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทุกเทสต์ (รวมเทสต์เดิมของ filter, editor, recurring, bill form)

- [ ] **Step 8: Commit**

```bash
git add public/liff/categories-panel.mjs public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/bill-form.mjs public/liff/app.dom.test.mjs
git commit -F - <<'EOF'
feat: manage categories from the LIFF profile tab

Hidden categories leave the add and edit pickers but stay in the list
filter, and the entry being edited keeps its hidden category.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

---

### Task 10: เอกสารและตรวจทั้งชุด

**Depends on:** Task 6, Task 9

**Files:**
- Modify: `SPEC.md`, `README.md`, `work-memory/STATE.md`

**Interfaces:** none

- [ ] **Step 1: แก้ SPEC.md**

1. ในส่วน "## ฟังก์ชัน" เพิ่มบรรทัดว่างและข้อนี้ต่อจากข้อ `8\. หารบิลกับเพื่อน ...`:

```
9\. หมวดของผู้ใช้เอง: แท็บโปรไฟล์มีส่วน "หมวดของฉัน" เพิ่มหมวดรายจ่าย/รายรับ เปลี่ยนชื่อ ซ่อน/เลิกซ่อน (ไม่มีลบจริง เพราะรายการเก่า งบ รายการประจำ บิลอ้างอิงอยู่) หมวดระบบ "อื่นๆ" ทั้งสองประเภทและ "ใบเสร็จ/สลิปโอนเงิน" แก้ไม่ได้ ชื่อยาว 1-30 ตัวอักษร ห้ามมี "," ห้ามซ้ำในประเภทเดียวกัน หมวดที่ไม่ซ่อนไม่เกิน 30 ต่อประเภท Claude เลือกได้เฉพาะหมวดที่ไม่ซ่อนของผู้ใช้คนนั้น (ถ้าโหลดหมวดไม่ได้ใช้หมวดเริ่มต้น) ตัวเลือกหมวดตอนเพิ่ม/แก้ไม่แสดงหมวดที่ซ่อน ยกเว้นหมวดเดิมของรายการที่กำลังแก้ ตัวกรองรายการยังแสดงทุกหมวด แท็บงบแสดงหมวดที่ซ่อนเฉพาะเมื่อเดือนนั้นยังมีงบหรือยอดใช้ API: `POST /api/categories` `{ type, name }`, `PATCH /api/categories/:id` `{ name?, hidden? }`, `GET /api/categories` คืน `hidden` และ `system` เพิ่ม
```

2. แทนบรรทัด `\- categories: id, user\_id, name, type` ด้วย:

```
\- categories: id, user\_id, name, type, hidden (ซ่อนแทนการลบ ใช้ SQL `017_category_hidden.sql`)
```

3. ในส่วน "## ลำดับการทำ" เพิ่มบรรทัดว่างและข้อนี้ต่อจากข้อ `11\. หารบิลกับเพื่อน ...`:

```
12\. หมวดของผู้ใช้เอง (roadmap ทิศทาง ข ข้อแรก: docs/superpowers/plans/2026-10-18-roadmap-b.md)
```

- [ ] **Step 2: แก้ README.md**

แทนข้อความ `(ไฟล์ล่าสุดตอนนี้คือ \`015_bill_invariants.sql\`)` ด้วย:

```
(ไฟล์ล่าสุดตอนนี้คือ `017_category_hidden.sql` ต้องรันก่อน push เพราะโค้ดเวอร์ชันนั้นอ่านคอลัมน์ hidden ทุกครั้งที่โหลดหมวด ถ้ายังไม่รัน หน้าเว็บโหลดไม่ขึ้นและบอทใช้หมวดเริ่มต้นแทน; ไม่มีไฟล์ 016 เพราะถูกถอยออก)
```

- [ ] **Step 3: แก้ work-memory/STATE.md**

แก้บรรทัด `Updated:` เป็นวันที่ทำจริง แล้วเพิ่มบรรทัดนี้เป็นข้อแรกใต้ `## Next`:

```
- [ ] หมวดของผู้ใช้เอง (roadmap ข ลำดับ 1, branch feat/custom-categories, แผน docs/superpowers/plans/2026-10-18-custom-categories.md): Task 1-9 เสร็จ npm test <ผลจริง> lint ผ่าน ยังไม่ push; ผู้ใช้ต้อง (1) รัน supabase/017_category_hidden.sql ใน Supabase SQL Editor ก่อน push (2) ทำ Browser check ของ Task 9 ในแอป LINE; ถัดไปคือ roadmap ลำดับ 2 ถามยอดด้วยภาษาธรรมชาติ
```

(แทน `<ผลจริง>` ด้วยตัวเลขที่ได้จาก Step 4 เช่น `1450/1450`)

- [ ] **Step 4: รันทั้งชุด**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: ผ่านทั้งหมด จดจำนวนเทสต์ที่ผ่านไปใส่ใน STATE (Step 3)

- [ ] **Step 5: Commit**

```bash
git add SPEC.md README.md work-memory/STATE.md
git commit -F - <<'EOF'
docs: record custom categories in SPEC, README and STATE

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014ArNrjZ5mrVWNCqmZkKcsc
EOF
```

- [ ] **Step 6: Merge เข้า main ในเครื่อง (ไม่ push)**

```bash
git checkout main
git merge --no-ff feat/custom-categories -m "Merge branch 'feat/custom-categories'"
npm test
```

Expected: merge สำเร็จและ `npm test` ผ่านบน main; ห้าม `git push`
