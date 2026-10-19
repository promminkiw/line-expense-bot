# ถามยอดด้วยภาษาธรรมชาติ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้พิมพ์ถามในแชต เช่น "เดือนนี้กินกาแฟไปเท่าไหร่" แล้วบอทตอบยอดรวมกับจำนวนรายการเป็นข้อความธรรมดา โดยยอดคำนวณด้วย SQL

**Architecture:** แยก module ใหม่ `src/query/` ไม่แตะ parser บันทึกรายการ ข้อความที่มีคำถาม (regex) และไม่ได้อยู่ระหว่างบอทถามกลับ จะถูกส่งให้ Claude แปลงเป็นเงื่อนไข `{ type, category, keyword, from, to }` ด้วย json_schema ถ้า Claude บอกว่าไม่ใช่คำถามจะไปทางบันทึกรายการตามเดิม ยอดคำนวณด้วย SQL function `query_totals` ใน `supabase/020_query_totals.sql`

**Tech Stack:** Node.js 24 + Express 5, @line/bot-sdk, @anthropic-ai/sdk (claude-haiku-5-5), Supabase Postgres, vitest + PGlite

## Global Constraints

- ตามแผนใหญ่ `docs/superpowers/plans/2026-10-18-roadmap-b.md` ข้อ 2 แต่ปรับ 3 จุดหลังอ่านโค้ดจริง: (1) ไม่ตัดข้อความที่มีตัวเลขออกจากประตูคำถาม เพราะคำถามมักมีวันที่ เช่น "1-15 ต.ค. ใช้ไปเท่าไหร่" และถ้าปล่อยให้ parser บันทึกรายการอาจได้รายการ 15 บาท ให้ Claude ตัดสินด้วย `is_question` แทน (2) SQL รับชื่อหมวด (`p_category text`) แทน id เพราะคำถามแบบ `both` อาจหมายถึงหมวดชื่อเดียวกันทั้งสองประเภท เช่น อื่นๆ (3) ไม่ตีความเป็นคำถามระหว่างที่บอทกำลังถามกลับ (มี pending clarification) เพราะข้อความนั้นคือคำตอบของรายการเดิม
- branch `feat/ask-totals` แตกจาก main ล่าสุด, TDD (เขียน test ให้ fail ก่อน), commit ทีละ task
- ห้าม `git push`, ห้ามรัน SQL ใน Supabase, ห้ามแก้ `.env`, ห้ามติดตั้งแพ็กเกจใหม่
- migration ใหม่คือ `020_query_totals.sql` (ไฟล์ล่าสุดตอนนี้คือ `019_delete_category.sql`; ไม่มีไฟล์ 016) รันซ้ำได้ (`create or replace`) เพิ่มชื่อไฟล์ใน `MIGRATIONS` ของ `src/db/sql-functions.test.js` หัวไฟล์ `supabase/schema.sql` และ README
- function SQL ใหม่ revoke จาก `public, anon, authenticated` แล้ว grant ให้ `service_role` และเพิ่มในเทสต์ `function permissions`
- ตัวเลขทุกตัวคำนวณด้วย SQL ห้ามให้ Claude คิดเลข server กรอง user_id ทุก query
- คำถามนับ rate limit เหมือนข้อความที่เรียก Claude อื่น (ประตูอยู่หลัง `allowRequest` ใน `handleText`) และ claimEvent ก่อนเหมือนเดิม
- คอมเมนต์ในโค้ดภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log ภาษาอังกฤษ; ไม่มี emoji ในโค้ด คอมเมนต์ log commit (ข้อความช่วยเหลือ `HELP_REPLY` เป็นข้อยกเว้นเดียวที่ใช้ emoji ได้)
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- ไฟล์ใหม่ใช้ CRLF เหมือนไฟล์เดิม (git autocrlf=true จัดการให้ตอน commit)
- ก่อนจบ: `npm test`, `npm run lint`, `node --check index.js` ผ่านทั้งหมด
- commit message ลงท้ายด้วย `Co-Authored-By:` ตามชื่อ model ของผู้ทำ

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/020_query_totals.sql` (ใหม่) | SQL function `query_totals` รวมยอดตามช่วงวัน ประเภท ชื่อหมวด และคำในโน้ต |
| `src/db/repository.js` | เพิ่ม `queryTotals(userId, criteria)` เรียก RPC |
| `src/query/parse-question.js` (ใหม่) | `looksLikeQuestion(text)` ประตู regex และ `createQuestionParser` เรียก Claude แล้วตรวจ/ปรับผล |
| `src/query/format-answer.js` (ใหม่) | `formatThaiRange(from, to)` และ `formatTotalsAnswer(question, rows)` สร้างข้อความตอบ |
| `src/bot.js` | ต่อทางคำถามใน `handleText` |
| `index.js` | สร้าง `parseQuestion` แล้วส่งให้ `createBot` |
| `src/menu/fixed-replies.js` | เพิ่มหัวข้อ ถามยอด ในข้อความช่วยเหลือ |

---

### Task 1: SQL function query_totals (020)

**Depends on:** none

**Files:**
- Create: `supabase/020_query_totals.sql`
- Modify: `supabase/schema.sql:1` (บรรทัดหัวไฟล์ที่บอกลำดับการรัน)
- Test: `src/db/sql-functions.test.js` (เพิ่มใน `MIGRATIONS`, describe ใหม่, แถวใน `function permissions`)

**Interfaces:**
- Produces: `public.query_totals(p_user_id uuid, p_from date, p_to date, p_type text, p_category text, p_keyword text)` returns table `(type text, total numeric, entry_count bigint)` แถวละประเภท เรียงตาม type; `p_type` คือ `'expense' | 'income' | 'both'`; `p_category = ''` คือไม่กรองหมวด (ถ้าไม่ว่างเทียบชื่อหมวดตรงตัว); `p_keyword = ''` คือไม่กรองโน้ต (ถ้าไม่ว่างค้นใน `transactions.note` แบบ `ilike` ไม่สนตัวพิมพ์ และ `%` `_` `\` ในคำค้นเป็นตัวอักษรธรรมดา)

- [ ] **Step 1: เพิ่มไฟล์ใน MIGRATIONS และเขียนเทสต์ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่ม `'020_query_totals.sql'` ต่อจาก `'019_delete_category.sql'` ใน `MIGRATIONS`:

```js
  '019_delete_category.sql',
  '020_query_totals.sql',
];
```

เพิ่ม describe ใหม่ต่อจาก `describe('summarize_transactions', ...)`:

```js
describe('query_totals', () => {
  async function addNoted(userId, categoryId, type, amount, occurredOn, note) {
    await db.query(
      'insert into transactions (user_id, category_id, type, amount, occurred_on, note) values ($1, $2, $3, $4, $5, $6)',
      [userId, categoryId, type, amount, occurredOn, note],
    );
  }

  async function totals(userId, type, category = '', keyword = '', from = '2026-10-01', to = '2026-10-31') {
    const result = await rows('select * from query_totals($1, $2, $3, $4, $5, $6)', [userId, from, to, type, category, keyword]);
    return result.map(numbers);
  }

  it('totals this user rows in the range by type when asked for both', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const salary = await createCategory(user, 'เงินเดือน', 'income');
    const otherFood = await createCategory(other, 'อาหาร', 'expense');
    await addNoted(user, food, 'expense', 60, '2026-10-01', 'กินข้าว');
    await addNoted(user, food, 'expense', 45.5, '2026-10-31', 'กาแฟ');
    await addNoted(user, salary, 'income', 25000, '2026-10-25', 'เงินเดือน');
    await addNoted(user, food, 'expense', 999, '2026-09-30', 'นอกช่วง');
    await addNoted(user, food, 'expense', 999, '2026-11-01', 'นอกช่วง');
    await addNoted(other, otherFood, 'expense', 777, '2026-10-10', 'กาแฟ');

    expect(await totals(user, 'both')).toEqual([
      { type: 'expense', total: 105.5, entry_count: 2 },
      { type: 'income', total: 25000, entry_count: 1 },
    ]);
    expect(await totals(user, 'expense')).toEqual([{ type: 'expense', total: 105.5, entry_count: 2 }]);
  });

  it('filters by category name across both types', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    const otherExpense = await createCategory(user, 'อื่นๆ', 'expense');
    const otherIncome = await createCategory(user, 'อื่นๆ', 'income');
    await addNoted(user, food, 'expense', 60, '2026-10-01', 'กินข้าว');
    await addNoted(user, otherExpense, 'expense', 30, '2026-10-02', 'ค่าจอด');
    await addNoted(user, otherIncome, 'income', 500, '2026-10-03', 'ขายของ');

    expect(await totals(user, 'both', 'อื่นๆ')).toEqual([
      { type: 'expense', total: 30, entry_count: 1 },
      { type: 'income', total: 500, entry_count: 1 },
    ]);
    expect(await totals(user, 'expense', 'อาหาร')).toEqual([{ type: 'expense', total: 60, entry_count: 1 }]);
  });

  it('finds the keyword anywhere in the note ignoring letter case', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addNoted(user, food, 'expense', 45, '2026-10-01', 'กาแฟเย็น');
    await addNoted(user, food, 'expense', 55, '2026-10-02', 'Coffee ร้านหน้าออฟฟิศ');
    await addNoted(user, food, 'expense', 60, '2026-10-03', 'กินข้าว');

    expect(await totals(user, 'expense', '', 'กาแฟ')).toEqual([{ type: 'expense', total: 45, entry_count: 1 }]);
    expect(await totals(user, 'expense', '', 'coffee')).toEqual([{ type: 'expense', total: 55, entry_count: 1 }]);
  });

  // คำค้นมาจากข้อความผู้ใช้ % และ _ ต้องเป็นตัวอักษรธรรมดา ไม่ใช่ wildcard ที่จับทุกแถว
  it('treats % and _ in the keyword as plain characters', async () => {
    const user = await createUser('U1');
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addNoted(user, food, 'expense', 10, '2026-10-01', 'ลด 50% ร้านกาแฟ');
    await addNoted(user, food, 'expense', 20, '2026-10-02', 'กินข้าว');
    await addNoted(user, food, 'expense', 30, '2026-10-03', 'a_b');

    expect(await totals(user, 'expense', '', '%')).toEqual([{ type: 'expense', total: 10, entry_count: 1 }]);
    expect(await totals(user, 'expense', '', '_')).toEqual([{ type: 'expense', total: 30, entry_count: 1 }]);
  });

  it('returns no rows when nothing matches', async () => {
    const user = await createUser('U1');

    expect(await totals(user, 'both')).toEqual([]);
  });
});
```

ใน `describe('function permissions', ...)` เพิ่มแถวต่อจาก `delete_category`:

```js
    ['delete_category', 'select delete_category(gen_random_uuid(), gen_random_uuid())'],
    ['query_totals', "select * from query_totals(gen_random_uuid(), '2026-10-01', '2026-10-31', 'both', '', '')"],
  ];
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL ตอน `beforeAll` เพราะอ่านไฟล์ `supabase/020_query_totals.sql` ไม่เจอ (ENOENT)

- [ ] **Step 3: เขียน migration**

สร้าง `supabase/020_query_totals.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 019 ก่อน push โค้ดที่ให้บอทตอบคำถามยอด รันซ้ำได้
-- รับชื่อหมวดแทน id เพราะคำถามแบบ both อาจหมายถึงหมวดชื่อเดียวกันทั้งรายรับและรายจ่าย เช่น อื่นๆ

create or replace function public.query_totals(
  p_user_id uuid,
  p_from date,
  p_to date,
  p_type text,
  p_category text,
  p_keyword text
)
returns table (type text, total numeric, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select t.type, sum(t.amount), count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
    and (p_type = 'both' or t.type = p_type)
    and (p_category = '' or c.name = p_category)
    -- คำค้นมาจากข้อความผู้ใช้ จึง escape \ % _ ให้เป็นตัวอักษรธรรมดา (ilike ใช้ \ เป็น escape โดยค่าเริ่มต้น)
    and (
      p_keyword = ''
      or t.note ilike '%' || replace(replace(replace(p_keyword, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  group by t.type
  order by t.type
$$;

revoke execute on function public.query_totals(uuid, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.query_totals(uuid, date, date, text, text, text) to service_role;
```

ใน `supabase/schema.sql` บรรทัดแรก เปลี่ยน `018_category_icon.sql และ 019_delete_category.sql ต่อตามลำดับ` เป็น:

```
018_category_icon.sql, 019_delete_category.sql และ 020_query_totals.sql ต่อตามลำดับ
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งไฟล์ รวม `query_totals` 5 เทสต์ และ `does not let anon or authenticated call query_totals` / `lets service_role call query_totals`

- [ ] **Step 5: Commit**

```bash
git add supabase/020_query_totals.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add a function that totals entries for a question"
```

---

### Task 2: repository.queryTotals

**Depends on:** none (ใช้ชื่อ RPC และพารามิเตอร์ตาม Interfaces ของ Task 1)

**Files:**
- Modify: `src/db/repository.js` (เพิ่ม function ต่อจาก `summarizeTransactions` ราวบรรทัด 273 และใส่ชื่อใน object ที่ return ราวบรรทัด 767)
- Test: `src/db/repository.test.js` (describe ใหม่ต่อจาก `repository.summarizeTransactions`)

**Interfaces:**
- Consumes: RPC `query_totals` พารามิเตอร์ `p_user_id, p_from, p_to, p_type, p_category, p_keyword`
- Produces: `repository.queryTotals(userId, { from, to, type, category, keyword }) => Promise<Array<{ type: 'expense' | 'income', total: number, entryCount: number }>>` (field อื่นใน object ที่สองถูกเมิน จึงส่ง object คำถามจาก Task 3 เข้าไปตรงๆ ได้)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/db/repository.test.js` ต่อจาก describe `repository.summarizeTransactions`:

```js
describe('repository.queryTotals', () => {
  const criteria = { from: '2026-10-01', to: '2026-10-18', type: 'expense', category: '', keyword: 'กาแฟ' };

  it('calls the SQL function with the question criteria and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ type: 'expense', total: '450.00', entry_count: '6' }], error: null });

    const rows = await createRepository(supabase).queryTotals('user-1', { ...criteria, isQuestion: true });

    expect(rows).toEqual([{ type: 'expense', total: 450, entryCount: 6 }]);
    expect(calls).toEqual([
      [
        'rpc',
        'query_totals',
        { p_user_id: 'user-1', p_from: '2026-10-01', p_to: '2026-10-18', p_type: 'expense', p_category: '', p_keyword: 'กาแฟ' },
      ],
    ]);
  });

  it('returns an empty array when nothing matches', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).queryTotals('user-1', criteria)).toEqual([]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).queryTotals('user-1', criteria);

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database queryTotals failed: boom');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/repository.test.js -t queryTotals`
Expected: FAIL `createRepository(...).queryTotals is not a function`

- [ ] **Step 3: เขียนโค้ด**

ใน `src/db/repository.js` ต่อจาก `summarizeTransactions`:

```js
  async function queryTotals(userId, { from, to, type, category, keyword }) {
    const { data, error } = await supabase.rpc('query_totals', {
      p_user_id: userId,
      p_from: from,
      p_to: to,
      p_type: type,
      p_category: category,
      p_keyword: keyword,
    });
    throwIfError('queryTotals', error);
    return data.map((row) => ({ type: row.type, total: Number(row.total), entryCount: Number(row.entry_count) }));
  }
```

ใน object ที่ return ท้ายไฟล์ เพิ่ม `queryTotals,` ต่อจาก `summarizeTransactions,`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: let the repository total entries for a question"
```

---

### Task 3: ประตูคำถามและ question parser

**Depends on:** none

**Files:**
- Create: `src/query/parse-question.js`
- Test: `src/query/parse-question.test.js`

**Interfaces:**
- Consumes: `ParseError`, `REQUEST_TIMEOUT_MS`, `MAX_RETRIES`, `OVERALL_TIMEOUT_MS`, `isPlainObject` จาก `src/parser/parse-message.js`; `toBangkokDateString`, `isValidCalendarDate` จาก `src/utils/date.js`; `withLowEffort` จาก `src/utils/claude-effort.js`
- Produces:
  - `looksLikeQuestion(text: string) => boolean`
  - `createQuestionParser({ client, model, now = () => new Date() }) => parseQuestion(text: string, categoryNames: string[]) => Promise<Question>`
  - `Question` คือ `{ isQuestion: false }` หรือ `{ isQuestion: true, type: 'expense' | 'income' | 'both', category: string, keyword: string, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }` โดย `category` เป็นชื่อใน `categoryNames` หรือ `''`, `keyword` trim แล้วไม่เกิน 50 ตัวอักษร, `from <= to` และช่วงไม่เกิน 366 วัน (ถ้า Claude ให้มาไม่ผ่าน ใช้วันที่ 1 ของเดือนนี้ถึงวันนี้)
  - `buildQuestionSchema(categoryNames: string[])`, `MAX_KEYWORD_LENGTH = 50`, `MAX_RANGE_DAYS = 366`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/query/parse-question.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { looksLikeQuestion, createQuestionParser, buildQuestionSchema, MAX_KEYWORD_LENGTH } = require('./parse-question.js');
const { ParseError } = require('../parser/parse-message.js');

// 2026-10-18 เวลาไทย (วันอาทิตย์)
const NOW = () => new Date('2026-10-18T05:00:00Z');
const NAMES = ['อาหาร', 'เดินทาง', 'อื่นๆ', 'เงินเดือน'];

function fakeClient(payload, { stopReason = 'end_turn', rawText } = {}) {
  const text = rawText !== undefined ? rawText : JSON.stringify(payload);
  return {
    messages: { create: vi.fn().mockResolvedValue({ stop_reason: stopReason, content: [{ type: 'text', text }] }) },
  };
}

function answer(overrides = {}) {
  return { is_question: true, type: 'expense', category: '', keyword: 'กาแฟ', from: '2026-10-01', to: '2026-10-18', ...overrides };
}

function parserFor(payload, options) {
  const client = fakeClient(payload, options);
  return { client, parseQuestion: createQuestionParser({ client, model: 'claude-haiku-5-5', now: NOW }) };
}

describe('looksLikeQuestion', () => {
  it.each(['เดือนนี้กินกาแฟไปเท่าไหร่', 'ค่าเดินทางเดือนที่แล้วเท่าไร', 'สัปดาห์นี้ใช้ไปกี่บาท', 'ใช้ไปเท่าไหร่แล้ว', 'รวมเท่าไหร่', '1-15 ต.ค. ใช้ไปเท่าไหร่'])(
    'lets %s through',
    (text) => {
      expect(looksLikeQuestion(text)).toBe(true);
    }
  );

  it.each(['กินข้าว 60', 'สรุปเดือนนี้', 'เงินเดือนเข้า 25000', ''])('stops %s', (text) => {
    expect(looksLikeQuestion(text)).toBe(false);
  });
});

describe('parseQuestion request', () => {
  it('sends the user text, today, the category list and the JSON schema', async () => {
    const { client, parseQuestion } = parserFor(answer());

    await parseQuestion('เดือนนี้กินกาแฟไปเท่าไหร่', NAMES);

    const params = client.messages.create.mock.calls[0][0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.messages).toEqual([{ role: 'user', content: 'เดือนนี้กินกาแฟไปเท่าไหร่' }]);
    expect(params.system).toContain('2026-10-18');
    expect(params.system).toContain('อาหาร, เดินทาง, อื่นๆ, เงินเดือน');
    expect(params.output_config).toEqual({ format: { type: 'json_schema', schema: buildQuestionSchema(NAMES) }, effort: 'low' });
    const options = client.messages.create.mock.calls[0][1];
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('builds a schema whose category enum is the names plus an empty string', () => {
    const schema = buildQuestionSchema(['อื่นๆ', 'อาหาร', 'อื่นๆ']);

    expect(schema.properties.category.enum).toEqual(['อื่นๆ', 'อาหาร', '']);
    expect(schema.required).toEqual(['is_question', 'type', 'category', 'keyword', 'from', 'to']);
    expect(schema.additionalProperties).toBe(false);
  });
});

describe('parseQuestion result', () => {
  it('returns the question criteria', async () => {
    const { parseQuestion } = parserFor(answer());

    expect(await parseQuestion('เดือนนี้กินกาแฟไปเท่าไหร่', NAMES)).toEqual({
      isQuestion: true,
      type: 'expense',
      category: '',
      keyword: 'กาแฟ',
      from: '2026-10-01',
      to: '2026-10-18',
    });
  });

  it('returns only isQuestion false when Claude says it is not a question', async () => {
    const { parseQuestion } = parserFor(answer({ is_question: false }));

    expect(await parseQuestion('ข้าวมันไก่ 50 แพงเท่าไหร่', NAMES)).toEqual({ isQuestion: false });
  });

  it('drops a category that is not in the list', async () => {
    const { parseQuestion } = parserFor(answer({ category: 'ค่าแมว' }));

    expect((await parseQuestion('ค่าแมวเท่าไหร่', NAMES)).category).toBe('');
  });

  it('trims the keyword and cuts it to the maximum length', async () => {
    const { parseQuestion } = parserFor(answer({ keyword: `  ${'ก'.repeat(80)}  ` }));

    expect((await parseQuestion('เท่าไหร่', NAMES)).keyword).toBe('ก'.repeat(MAX_KEYWORD_LENGTH));
  });

  it.each([
    ['an invalid date', { from: '2026-02-30', to: '2026-10-18' }],
    ['an empty date', { from: '', to: '' }],
    ['a reversed range', { from: '2026-10-18', to: '2026-10-01' }],
    ['a range over 366 days', { from: '2024-01-01', to: '2026-10-18' }],
  ])('uses this month so far for %s', async (_, range) => {
    const { parseQuestion } = parserFor(answer(range));

    const question = await parseQuestion('เท่าไหร่', NAMES);

    expect([question.from, question.to]).toEqual(['2026-10-01', '2026-10-18']);
  });

  it('keeps a full leap-year range of 366 days', async () => {
    const { parseQuestion } = parserFor(answer({ from: '2024-01-01', to: '2024-12-31' }));

    const question = await parseQuestion('ปี 2024 ใช้ไปเท่าไหร่', NAMES);

    expect([question.from, question.to]).toEqual(['2024-01-01', '2024-12-31']);
  });

  it('falls back to both for an unknown type', async () => {
    const { parseQuestion } = parserFor(answer({ type: 'transfer' }));

    expect((await parseQuestion('เท่าไหร่', NAMES)).type).toBe('both');
  });

  it.each([
    ['truncated', { stopReason: 'max_tokens' }],
    ['refused', { stopReason: 'refusal' }],
    ['not JSON', { rawText: 'not json' }],
    ['missing is_question', { rawText: JSON.stringify({ type: 'expense' }) }],
  ])('throws ParseError when the response is %s', async (_, options) => {
    const { parseQuestion } = parserFor(answer(), options);

    await expect(parseQuestion('เท่าไหร่', NAMES)).rejects.toBeInstanceOf(ParseError);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/query/parse-question.test.js`
Expected: FAIL `Cannot find module './parse-question.js'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/query/parse-question.js`:

```js
const {
  ParseError,
  REQUEST_TIMEOUT_MS,
  MAX_RETRIES,
  OVERALL_TIMEOUT_MS,
  isPlainObject,
} = require('../parser/parse-message');
const { toBangkokDateString, isValidCalendarDate } = require('../utils/date');
const { withLowEffort } = require('../utils/claude-effort');

// ไม่ตัดข้อความที่มีตัวเลข เพราะคำถามมักมีวันที่ เช่น "1-15 ต.ค. ใช้ไปเท่าไหร่" ให้ Claude ตัดสินด้วย is_question
const QUESTION_PATTERN = /เท่าไหร่|เท่าไร|กี่บาท|ไปเท่า|รวมเท่า/;
const QUESTION_TYPES = ['expense', 'income', 'both'];
const MAX_KEYWORD_LENGTH = 50;
// ช่วงยาวกว่าหนึ่งปีน่าจะเป็นวันที่ที่ Claude อ่านผิด และทำให้ SQL อ่านแถวมากเกินไป
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;

function looksLikeQuestion(text) {
  return QUESTION_PATTERN.test(text);
}

// messages.create ไม่แปลง schema ให้ จึงต้องใส่ additionalProperties: false เอง
function buildQuestionSchema(categoryNames) {
  return {
    type: 'object',
    properties: {
      is_question: { type: 'boolean' },
      type: { type: 'string', enum: QUESTION_TYPES },
      category: { type: 'string', enum: [...new Set(categoryNames), ''] },
      keyword: { type: 'string' },
      from: { type: 'string' },
      to: { type: 'string' },
    },
    required: ['is_question', 'type', 'category', 'keyword', 'from', 'to'],
    additionalProperties: false,
  };
}

function buildSystemPrompt(today, categoryNames) {
  return [
    'You read a Thai message sent to a personal finance bot and decide whether the user asks how much they spent or earned.',
    `Today is ${today} (Asia/Bangkok). Weeks start on Monday.`,
    '',
    'Rules:',
    '- is_question is true only when the user asks for the total of past entries, e.g. "เดือนนี้กินกาแฟไปเท่าไหร่". A message that records a new entry, e.g. "กาแฟ 45", is not a question.',
    '- type is expense for spending, income for earnings, both when the user asks about both.',
    `- Categories: ${[...new Set(categoryNames)].join(', ')}`,
    '- category is a name from the list only when the user names that category itself. Otherwise "".',
    '- keyword is one specific item word to search in entry notes, e.g. "กาแฟ". Prefer keyword over category when the user names an item. Use "" when the user names no item.',
    '- from and to are YYYY-MM-DD. "วันนี้" is today. "สัปดาห์นี้" is Monday of this week to today. "เดือนนี้" is the 1st of this month to today. "เดือนที่แล้ว" is the whole previous month. When no period is given, use the 1st of this month to today.',
    '- When is_question is false, set type to "both" and category, keyword, from and to to "".',
  ].join('\n');
}

function monthSoFar(today) {
  return { from: `${today.slice(0, 8)}01`, to: today };
}

function normalizeRange(from, to, today) {
  if (!isValidCalendarDate(from) || !isValidCalendarDate(to) || from > to) {
    return monthSoFar(today);
  }
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  return days > MAX_RANGE_DAYS ? monthSoFar(today) : { from, to };
}

function toQuestion(data, today, categoryNames) {
  if (data.is_question !== true) {
    return { isQuestion: false };
  }
  const keyword = typeof data.keyword === 'string' ? data.keyword.trim().slice(0, MAX_KEYWORD_LENGTH) : '';
  return {
    isQuestion: true,
    type: QUESTION_TYPES.includes(data.type) ? data.type : 'both',
    category: categoryNames.includes(data.category) ? data.category : '',
    keyword,
    ...normalizeRange(data.from, data.to, today),
  };
}

function createQuestionParser({ client, model, now = () => new Date() }) {
  return async function parseQuestion(text, categoryNames) {
    const today = toBangkokDateString(now());
    const response = await client.messages.create(
      {
        model,
        // เผื่อที่ให้การคิดของ Haiku 5.5 ซึ่งนับรวมใน max_tokens
        max_tokens: 1024,
        system: buildSystemPrompt(today, categoryNames),
        messages: [{ role: 'user', content: text }],
        output_config: withLowEffort(model, { format: { type: 'json_schema', schema: buildQuestionSchema(categoryNames) } }),
      },
      {
        timeout: REQUEST_TIMEOUT_MS,
        maxRetries: MAX_RETRIES,
        signal: AbortSignal.timeout(OVERALL_TIMEOUT_MS),
      }
    );

    if (response.stop_reason === 'max_tokens') {
      throw new ParseError('Claude question response was truncated');
    }
    if (response.stop_reason === 'refusal') {
      throw new ParseError('Claude refused to read the question');
    }
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock) {
      throw new ParseError('Claude question response has no text block');
    }
    let data;
    try {
      data = JSON.parse(textBlock.text);
    } catch {
      throw new ParseError('Claude question response is not valid JSON');
    }
    if (!isPlainObject(data) || typeof data.is_question !== 'boolean') {
      throw new ParseError('Claude question response does not match the expected shape');
    }
    return toQuestion(data, today, categoryNames);
  };
}

module.exports = {
  looksLikeQuestion,
  createQuestionParser,
  buildQuestionSchema,
  MAX_KEYWORD_LENGTH,
  MAX_RANGE_DAYS,
};
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/query/parse-question.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/query/parse-question.js src/query/parse-question.test.js
git commit -m "feat: read a totals question with Claude"
```

---

### Task 4: ข้อความตอบยอด

**Depends on:** none

**Files:**
- Create: `src/query/format-answer.js`
- Test: `src/query/format-answer.test.js`

**Interfaces:**
- Consumes: `formatAmount` จาก `src/parser/format-reply.js`, `TYPE_LABELS` จาก `src/utils/type-labels.js`
- Produces:
  - `formatThaiRange(from: 'YYYY-MM-DD', to: 'YYYY-MM-DD') => string` เช่น `1-18 ต.ค. 2569`
  - `formatTotalsAnswer(question: { type, category, keyword, from, to }, rows: Array<{ type, total, entryCount }>) => string`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/query/format-answer.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { formatThaiRange, formatTotalsAnswer } = require('./format-answer.js');

describe('formatThaiRange', () => {
  it.each([
    ['2026-10-18', '2026-10-18', '18 ต.ค. 2569'],
    ['2026-10-01', '2026-10-18', '1-18 ต.ค. 2569'],
    ['2026-09-25', '2026-10-05', '25 ก.ย. - 5 ต.ค. 2569'],
    ['2025-12-25', '2026-01-05', '25 ธ.ค. 2568 - 5 ม.ค. 2569'],
  ])('formats %s to %s', (from, to, expected) => {
    expect(formatThaiRange(from, to)).toBe(expected);
  });
});

describe('formatTotalsAnswer', () => {
  const base = { type: 'expense', category: '', keyword: '', from: '2026-10-01', to: '2026-10-18' };

  it('answers the expense total with the keyword', () => {
    const text = formatTotalsAnswer({ ...base, keyword: 'กาแฟ' }, [{ type: 'expense', total: 450, entryCount: 6 }]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)');
  });

  it('names the category and keeps satang', () => {
    const text = formatTotalsAnswer({ ...base, category: 'อาหาร' }, [{ type: 'expense', total: 1234.5, entryCount: 3 }]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569 หมวด อาหาร: รายจ่าย 1,234.5 บาท (3 รายการ)');
  });

  it('answers income then expense when asked for both', () => {
    const text = formatTotalsAnswer({ ...base, type: 'both' }, [
      { type: 'expense', total: 100, entryCount: 2 },
      { type: 'income', total: 25000, entryCount: 1 },
    ]);

    expect(text).toBe('ช่วง 1-18 ต.ค. 2569: รายรับ 25,000 บาท (1 รายการ), รายจ่าย 100 บาท (2 รายการ)');
  });

  it('says there are no entries when nothing matches', () => {
    expect(formatTotalsAnswer({ ...base, type: 'income' }, [])).toBe('ช่วง 1-18 ต.ค. 2569: รายรับ 0 บาท (ไม่มีรายการ)');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/query/format-answer.test.js`
Expected: FAIL `Cannot find module './format-answer.js'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/query/format-answer.js`:

```js
const { formatAmount } = require('../parser/format-reply');
const { TYPE_LABELS } = require('../utils/type-labels');

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function splitDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return { day, month: THAI_MONTHS[month - 1], year: year + 543 };
}

// ตัดเดือนและปีที่ซ้ำออก ให้อ่านง่ายเหมือนที่คนไทยเขียนช่วงวันที่
function formatThaiRange(from, to) {
  const start = splitDate(from);
  const end = splitDate(to);
  const endText = `${end.day} ${end.month} ${end.year}`;
  if (from === to) return endText;
  if (start.year !== end.year) return `${start.day} ${start.month} ${start.year} - ${endText}`;
  if (start.month !== end.month) return `${start.day} ${start.month} - ${endText}`;
  return `${start.day}-${endText}`;
}

function describeTotal(type, rows) {
  const row = rows.find((item) => item.type === type);
  const total = row ? row.total : 0;
  const count = row ? row.entryCount : 0;
  return `${TYPE_LABELS[type]} ${formatAmount(total)} บาท (${count > 0 ? `${count} รายการ` : 'ไม่มีรายการ'})`;
}

function formatTotalsAnswer(question, rows) {
  const scope = [`ช่วง ${formatThaiRange(question.from, question.to)}`];
  if (question.category) scope.push(`หมวด ${question.category}`);
  if (question.keyword) scope.push(`คำว่า "${question.keyword}"`);
  const types = question.type === 'both' ? ['income', 'expense'] : [question.type];
  return `${scope.join(' ')}: ${types.map((type) => describeTotal(type, rows)).join(', ')}`;
}

module.exports = { formatThaiRange, formatTotalsAnswer };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/query/format-answer.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/query/format-answer.js src/query/format-answer.test.js
git commit -m "feat: write the answer to a totals question"
```

---

### Task 5: บอทตอบคำถามยอดในแชต

**Depends on:** Task 2, Task 3, Task 4

**Files:**
- Modify: `src/bot.js` (require ด้านบน, `createBot` รับ `parseQuestion`, function ใหม่ใน `createBot`, `handleText` ราวบรรทัด 257-259)
- Modify: `index.js` (require และสร้าง `parseQuestion` ราวบรรทัด 9-14 และ 52-53, ส่งเข้า `createBot` ราวบรรทัด 85)
- Modify: `src/menu/fixed-replies.js` (`HELP_REPLY`)
- Test: `src/bot.test.js`, `src/menu/fixed-replies.test.js`

**Interfaces:**
- Consumes: `repository.queryTotals` (Task 2), `looksLikeQuestion` และ `parseQuestion` (Task 3), `formatTotalsAnswer` (Task 4), `repository.listCategories(userId)` เดิม (คืน `[{ id, name, type, hidden, ... }]`)
- Produces: `createBot({ ..., parseQuestion })`

**LINE check:** *(ทำหลังผู้ใช้รัน `supabase/020_query_totals.sql` ใน Supabase แล้ว merge+push และ Render deploy เสร็จ)*
- Preconditions: บอทใน LINE ของผู้ใช้ มีรายการเดือนนี้อย่างน้อย 2 รายการ โดยมีโน้ตคำว่า กาแฟ อย่างน้อย 1 รายการ

| # | Action | Expected |
|---|---|---|
| 1 | พิมพ์ `เดือนนี้กินกาแฟไปเท่าไหร่` | บอทตอบข้อความขึ้นต้นด้วย `ช่วง 1-<วันนี้> <เดือน> <ปี พ.ศ.> คำว่า "กาแฟ": รายจ่าย` ตามด้วยยอดที่ตรงกับผลรวมรายการกาแฟในหน้าเว็บ ไม่มีการ์ด "บันทึกแล้ว" |
| 2 | พิมพ์ `เดือนนี้รายรับรายจ่ายเท่าไหร่` | บอทตอบ `รายรับ ... บาท (... รายการ), รายจ่าย ... บาท (... รายการ)` ตรงกับการ์ดยอดในหน้าเว็บแท็บรายการ |
| 3 | พิมพ์ `กาแฟ 45` | บอทตอบการ์ด "บันทึกแล้ว" ตามเดิม |
| 4 | พิมพ์ `ช่วยเหลือ` | ข้อความช่วยเหลือมีหัวข้อ `🔎 ถามยอด` |

- [ ] **Step 1: เขียนเทสต์ที่ fail ใน bot.test.js**

ใน `src/bot.test.js` ฟังก์ชัน `setup` เพิ่ม dependency ใหม่และ mock ใน `repository`:

```js
    parseMessage: vi.fn().mockResolvedValue({ status: 'ok', items: [FOOD_ITEM] }),
    parseQuestion: vi.fn().mockResolvedValue({ isQuestion: false }),
```

และใน object `repository:` ของ `setup` เพิ่ม:

```js
      listCategories: vi.fn().mockResolvedValue([
        { id: 'cat-food', name: 'อาหาร', type: 'expense', hidden: false },
        { id: 'cat-old', name: 'ค่าแมว', type: 'expense', hidden: true },
        { id: 'cat-other', name: 'อื่นๆ', type: 'expense', hidden: false },
        { id: 'cat-income-other', name: 'อื่นๆ', type: 'income', hidden: false },
      ]),
      queryTotals: vi.fn().mockResolvedValue([{ type: 'expense', total: 450, entryCount: 6 }]),
```

เพิ่ม describe ใหม่ต่อจาก `describe('bot text categories', ...)`:

```js
describe('bot totals questions', () => {
  const QUESTION = { isQuestion: true, type: 'expense', category: '', keyword: 'กาแฟ', from: '2026-10-01', to: '2026-10-18' };

  it('answers a question with totals from SQL and does not record an entry', async () => {
    const { deps, bot } = setup();
    deps.parseQuestion.mockResolvedValue(QUESTION);

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    expect(deps.repository.queryTotals).toHaveBeenCalledWith('user-1', QUESTION);
    expect(deps.replyText).toHaveBeenCalledWith('r1', 'ช่วง 1-18 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)', undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  // ผู้ใช้ถามถึงรายการเก่าได้ จึงส่งทุกชื่อหมวดรวมที่ซ่อน ไม่ใช่เฉพาะหมวดที่ให้เลือกตอนบันทึก
  it('gives the parser every category name once, hidden ones included', async () => {
    const { deps, bot } = setup();
    deps.parseQuestion.mockResolvedValue(QUESTION);

    await bot.handleEvent(textEvent('ค่าแมวเท่าไหร่'));

    expect(deps.parseQuestion).toHaveBeenCalledWith('ค่าแมวเท่าไหร่', ['อาหาร', 'ค่าแมว', 'อื่นๆ']);
  });

  it('uses the default category names when loading them fails', async () => {
    const { deps, bot } = setup();
    deps.repository.listCategories.mockRejectedValue(new Error('db down'));
    deps.parseQuestion.mockResolvedValue(QUESTION);

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    const names = deps.parseQuestion.mock.calls[0][1];
    expect(names).toContain('อาหาร');
    expect(names).toContain('เงินเดือน');
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to load question categories', { userId: 'user-1' }, expect.any(Error));
    expect(deps.replyText).toHaveBeenCalledWith('r1', expect.stringContaining('รายจ่าย 450 บาท'), undefined);
  });

  it('records the message as before when Claude says it is not a question', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ข้าวมันไก่ 50 แพงเท่าไหร่'));

    expect(deps.parseQuestion).toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalledWith('ข้าวมันไก่ 50 แพงเท่าไหร่', [], expect.anything());
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  it('does not call the question parser without a question word', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseQuestion).not.toHaveBeenCalled();
  });

  // ระหว่างที่บอทถามกลับ ข้อความถัดไปคือคำตอบของรายการเดิม
  it('does not read a reply to a clarifying question as a totals question', async () => {
    const { deps, bot } = setup();
    deps.repository.getPendingClarification.mockResolvedValue({
      messages: [
        { role: 'user', text: 'ซื้อรถ' },
        { role: 'assistant', text: 'ซื้อรถกี่บาท' },
      ],
      updatedAt: new Date(NOW_MS).toISOString(),
    });

    await bot.handleEvent(textEvent('ไม่แน่ใจว่าเท่าไหร่ ประมาณ 500000'));

    expect(deps.parseQuestion).not.toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalled();
  });

  it('counts a question against the rate limit', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    expect(deps.parseQuestion).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
  });

  it('replies with the system error when the question parser fails', async () => {
    const { deps, bot } = setup();
    deps.parseQuestion.mockRejectedValue(new Error('timeout'));

    await bot.handleEvent(textEvent('เดือนนี้กินกาแฟไปเท่าไหร่'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });
});
```

`SYSTEM_ERROR_REPLY`, `RATE_LIMITED_REPLY` และ `NOW_MS` มีอยู่แล้วในไฟล์เทสต์ (import จาก `./bot.js` บรรทัด 1-19 และประกาศที่บรรทัด 23)

- [ ] **Step 2: เขียนเทสต์ที่ fail ใน fixed-replies.test.js**

ใน `src/menu/fixed-replies.test.js` ต่อจากเทสต์ `documents the recurring section between the slip and undo sections`:

```js
  it('documents asking for totals after the summary section', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🔎 ถามยอด');
    expect(title).toBeGreaterThan(lines.indexOf('📊 ดูสรุปยอด'));
    expect(lines.slice(title + 1, title + 3)).toEqual([
      'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
      'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
    ]);
  });
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/bot.test.js src/menu/fixed-replies.test.js`
Expected: FAIL เทสต์ใน `bot totals questions` (เช่น `queryTotals` ไม่ถูกเรียก และ `parseQuestion` ไม่ถูกเรียก) และ `documents asking for totals after the summary section` ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 4: ต่อทางคำถามใน bot.js**

ด้านบน `src/bot.js` ต่อจาก `const { TEXT_CATEGORIES } = require('./parser/categories');` เปลี่ยนเป็น:

```js
const { TEXT_CATEGORIES, DEFAULT_CATEGORIES } = require('./parser/categories');
const { looksLikeQuestion } = require('./query/parse-question');
const { formatTotalsAnswer } = require('./query/format-answer');
```

ต่อจาก `const MAX_HISTORY_MESSAGES = 6;` เพิ่ม:

```js
// ใช้ถามยอดเมื่อโหลดหมวดของผู้ใช้ไม่ได้ ชื่อซ้ำ (อื่นๆ) ถูกตัดใน schema อยู่แล้ว
const DEFAULT_QUESTION_CATEGORIES = [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])];
```

ในพารามิเตอร์ของ `createBot` เพิ่ม `parseQuestion,` ต่อจาก `parseMessage,`

ใน `createBot` ต่อจาก function `loadTextCategories` เพิ่ม:

```js
  // ผู้ใช้ถามถึงรายการเก่าได้ จึงใช้ทุกหมวดรวมที่ซ่อน ถ้าโหลดไม่ได้ยังตอบด้วยหมวดเริ่มต้นได้
  async function loadQuestionCategories(userId) {
    try {
      const categories = await repository.listCategories(userId);
      return [...new Set(categories.map((category) => category.name))];
    } catch (err) {
      logger.error('Failed to load question categories', { userId }, err);
      return DEFAULT_QUESTION_CATEGORIES;
    }
  }

  async function answerQuestion(text, userId) {
    const question = await parseQuestion(text, await loadQuestionCategories(userId));
    if (!question.isQuestion) {
      return null;
    }
    const rows = await repository.queryTotals(userId, question);
    return { text: formatTotalsAnswer(question, rows) };
  }
```

ใน `handleText` เปลี่ยน:

```js
    const { messages: history, loadFailed } = await loadHistory(userId);
    const textCategories = await loadTextCategories(userId);
```

เป็น:

```js
    const { messages: history, loadFailed } = await loadHistory(userId);
    // ระหว่างที่บอทถามกลับ ข้อความถัดไปคือคำตอบของรายการเดิม จึงไม่ตีความเป็นคำถามยอด
    if (history.length === 0 && looksLikeQuestion(event.message.text)) {
      const answer = await answerQuestion(event.message.text, userId);
      if (answer) {
        return answer;
      }
    }
    const textCategories = await loadTextCategories(userId);
```

- [ ] **Step 5: ส่ง parseQuestion จาก index.js**

ใน `index.js` ต่อจาก `const { createMessageParser } = require('./src/parser/parse-message');` เพิ่ม:

```js
const { createQuestionParser } = require('./src/query/parse-question');
```

ต่อจาก `const parseMessage = createMessageParser({ client: anthropic, model: config.claudeModel });` เพิ่ม:

```js
const parseQuestion = createQuestionParser({ client: anthropic, model: config.claudeModel });
```

ใน `createBot({ ... })` เพิ่ม `parseQuestion,` ต่อจาก `parseMessage,`

- [ ] **Step 6: เพิ่มหัวข้อในข้อความช่วยเหลือ**

ใน `src/menu/fixed-replies.js` ต่อจากบรรทัด `'แล้วเลือก วันนี้ / สัปดาห์นี้ / เดือนนี้',`:

```js
  'แล้วเลือก วันนี้ / สัปดาห์นี้ / เดือนนี้',
  '',
  '🔎 ถามยอด',
  'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
  'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
```

- [ ] **Step 7: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/bot.test.js src/menu/fixed-replies.test.js`
Expected: PASS ทั้งสองไฟล์

Run: `node --check index.js`
Expected: ไม่มี output (syntax ถูกต้อง)

- [ ] **Step 8: Commit**

```bash
git add src/bot.js src/bot.test.js index.js src/menu/fixed-replies.js src/menu/fixed-replies.test.js
git commit -m "feat: answer totals questions in the chat"
```

---

### Task 6: เอกสารและ STATE

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5

**Files:**
- Modify: `README.md` (ส่วน ความสามารถ ราวบรรทัด 10, ขั้นตอนรัน SQL ราวบรรทัด 94, ประโยค deploy ราวบรรทัด 103)
- Modify: `SPEC.md` (ฟังก์ชันข้อใหม่ต่อจากข้อ 9 ราวบรรทัด 49, ลำดับการทำข้อ 14 ต่อจากข้อ 13 ราวบรรทัด 131)
- Modify: `docs/superpowers/plans/2026-10-18-roadmap-b.md` (สถานะข้อ 2 ในตารางลำดับ และบรรทัดสถานะด้านบน)
- Modify: `work-memory/STATE.md`

**Interfaces:**
- Consumes: พฤติกรรมจาก Task 1-5

- [ ] **Step 1: อัปเดต README**

- ส่วน ความสามารถ ต่อจาก bullet **สรุปวัน/สัปดาห์/เดือน** เพิ่ม:

```markdown
- **ถามยอด:** พิมพ์ถาม เช่น `เดือนนี้กินกาแฟไปเท่าไหร่` หรือ `ค่าเดินทางเดือนที่แล้วเท่าไร` Claude แปลงคำถามเป็นช่วงวัน ประเภท หมวด และคำค้นในโน้ต แล้ว SQL รวมยอด บอทตอบยอดรวมและจำนวนรายการเป็นข้อความ (ช่วงไม่เกิน 366 วัน ถ้าไม่บอกช่วงใช้เดือนนี้)
```

- ขั้นตอนรัน SQL: เปลี่ยน `` `002` ถึง `019` `` เป็น `` `002` ถึง `020` ``
- ประโยค deploy: เปลี่ยน `(ไฟล์ล่าสุดตอนนี้คือ `019_delete_category.sql` ต้องรันก่อน push เพราะปุ่มลบหมวดเรียก function `delete_category` ถ้ายังไม่รัน การลบหมวดจะล้มเหลว (ตอบ 500) ส่วนอื่นยังใช้ได้;` เป็น:

```
(ไฟล์ล่าสุดตอนนี้คือ `020_query_totals.sql` ต้องรันก่อน push เพราะบอทเรียก function `query_totals` เมื่อผู้ใช้ถามยอด ถ้ายังไม่รัน คำถามยอดจะได้ข้อความระบบมีปัญหา ส่วนการบันทึกรายการยังใช้ได้; `019_delete_category.sql` ก็ต้องรันก่อน เพราะปุ่มลบหมวดเรียก function `delete_category` ถ้ายังไม่รัน การลบหมวดจะล้มเหลว (ตอบ 500);
```

ตรวจทุกประโยคกับโค้ดจริงก่อน commit (`grep -n "019\|020" README.md`)

- [ ] **Step 2: อัปเดต SPEC**

- ต่อจากย่อหน้าฟังก์ชันข้อ 9 (ขึ้นต้นด้วย `9\. หมวดของผู้ใช้เอง:`) เพิ่มย่อหน้าใหม่ (เว้นบรรทัดว่างคั่นเหมือนข้ออื่น):

```markdown
10\. ถามยอดด้วยภาษาธรรมชาติ: ข้อความที่มีคำว่า เท่าไหร่ เท่าไร กี่บาท ไปเท่า หรือ รวมเท่า และไม่ได้อยู่ระหว่างบอทถามกลับ จะถูกส่งให้ Claude แปลงเป็น `{ is_question, type: expense|income|both, category, keyword, from, to }` ด้วย json_schema (หมวดให้เลือกจากทุกหมวดของผู้ใช้รวมที่ซ่อน ถ้าโหลดไม่ได้ใช้หมวดเริ่มต้น) ถ้าไม่ใช่คำถามไปทางบันทึกรายการตามเดิม server ตรวจวันที่ (วันที่จริง from <= to ช่วงไม่เกิน 366 วัน ไม่ผ่านใช้วันที่ 1 ของเดือนนี้ถึงวันนี้) ตัดคำค้นไม่เกิน 50 ตัวอักษร แล้วรวมยอดด้วย SQL function `query_totals` (`020_query_totals.sql` กรองตามชื่อหมวด และค้นคำในโน้ตแบบไม่สนตัวพิมพ์ โดย % _ เป็นตัวอักษรธรรมดา) ตอบเป็นข้อความ เช่น `ช่วง 1-18 ต.ค. 2569 คำว่า "กาแฟ": รายจ่าย 450 บาท (6 รายการ)` นับ rate limit เหมือนข้อความอื่นที่เรียก Claude
```

- ส่วนลำดับการทำ ต่อจากข้อ 13 เพิ่ม:

```markdown
14\. ถามยอดด้วยภาษาธรรมชาติ (roadmap ทิศทาง ข ข้อ 2: docs/superpowers/plans/2026-10-19-ask-totals.md)
```

- [ ] **Step 3: อัปเดต roadmap และ STATE**

- `docs/superpowers/plans/2026-10-18-roadmap-b.md`: ในตารางลำดับ แถวลำดับ 2 เปลี่ยนสถานะ `ยังไม่เริ่ม (ถัดไป)` เป็น `เสร็จบน branch รอ push` และแถวลำดับ 3 เป็น `ยังไม่เริ่ม (ถัดไป)`; บรรทัด **สถานะ** ด้านบนเพิ่มประโยค `ข้อ 2 เสร็จบน branch feat/ask-totals (แผน 2026-10-19-ask-totals.md)`
- `work-memory/STATE.md` ส่วน Next เพิ่มบรรทัดบนสุด: `` - [ ] `next` ถามยอด (แผน docs/superpowers/plans/2026-10-19-ask-totals.md) Task 1-6 เสร็จบน branch feat/ask-totals ยังไม่ merge/push: ผู้ใช้ต้องรัน `supabase/020_query_totals.sql` ก่อน push และทำ LINE check ของ Task 5 ``

- [ ] **Step 4: ตรวจทั้งหมดแล้ว commit**

Run: `npm test`, `npm run lint`, `node --check index.js`
Expected: ผ่านทั้งหมด (ถ้า `scripts/try-parse.test.js` timeout ตอนรันพร้อมกัน ให้รันเดี่ยวด้วย `npx vitest run scripts/try-parse.test.js` ก่อนสรุปว่าพัง)

```bash
git add README.md SPEC.md docs/superpowers/plans/2026-10-18-roadmap-b.md work-memory/STATE.md
git commit -m "docs: describe asking for totals"
```
