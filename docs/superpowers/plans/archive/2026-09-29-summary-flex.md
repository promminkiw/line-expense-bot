# Summary with SQL + Flex Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำขั้นที่ 4 ของ `SPEC.md`: ผู้ใช้พิมพ์ "สรุปวันนี้ / สรุปสัปดาห์นี้ / สรุปเดือนนี้" (หรือ "สรุป" แล้วเลือกปุ่ม) แล้วบอทคำนวณยอดด้วย SQL function ใน Supabase ให้ Claude เขียนคำอธิบายสั้นๆ จากตัวเลขที่คำนวณแล้ว และตอบเป็น Flex Message

**Architecture:** ยอดรวมตามประเภทและหมวดคำนวณใน Postgres ด้วย function `summarize_transactions` (เรียกผ่าน `supabase.rpc`) ส่วน Node.js แค่จัดรูป: `src/summary/` มีไฟล์เล็กๆ แยกหน้าที่ (แปลงคำสั่ง, คำนวณช่วงวันที่, จัดกลุ่ม 5 หมวดแรก, สร้าง Flex, ขอคำอธิบายจาก Claude) บอทตรวจคำสั่งสรุปก่อนส่งข้อความให้ parser จึงไม่เสียค่า Claude แยกรายการ ทุก dependency ยังส่งเข้าแบบ injection เหมือนเดิม

**Tech Stack:** Node.js 22 (CommonJS), Express 5.2.1, @line/bot-sdk 11.2.0 (Flex Message), @anthropic-ai/sdk 0.129.0, @supabase/supabase-js 2.117.2 (`rpc`), Supabase Postgres, Vitest 5.0.2

## Global Constraints

- ผู้ใช้ใช้ Windows: ทุกคำสั่งในแผนต้องรันได้ใน PowerShell (ใช้ `curl.exe` ไม่ใช่ `curl`)
- โปรเจกต์เป็น `"type": "commonjs"`: source ใช้ `require` / `module.exports`; ไฟล์เทสต์ใช้ `import` เท่านั้น
- ห้ามใช้ `vi.mock` กับ module ที่ถูก `require` — ใช้ dependency injection + fake object แทน
- เทสต์วางคู่กับไฟล์: `src/foo.js` → `src/foo.test.js`
- ไม่เพิ่ม dependency ใหม่
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log message เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม commit `.env` หรือ secret; agent ห้ามอ่านหรือแก้ `.env`; ห้าม agent start/restart/kill server
- SQL ใหม่อยู่ในไฟล์ `supabase/003_summary_function.sql` ผู้ใช้รันเองใน Supabase SQL Editor
- ห้ามให้ Claude คิดเลข: ยอดทุกตัวมาจาก SQL และการรวมใน Node ทำเป็นหน่วยสตางค์ (จำนวนเต็ม) เท่านั้น Claude ได้รับตัวเลขที่จัดรูปแล้วและเขียนแค่คำอธิบาย
- คำสั่งสรุป (เทียบหลังตัดช่องว่างทั้งหมดออก): `สรุป` → เมนู, `สรุปวันนี้` → วันนี้, `สรุปสัปดาห์นี้` → สัปดาห์นี้, `สรุปเดือนนี้` → เดือนนี้
- "สัปดาห์นี้" = วันจันทร์ของสัปดาห์นี้ถึงวันนี้ตามเวลาไทย (Asia/Bangkok); "เดือนนี้" = วันที่ 1 ถึงวันนี้; "วันนี้" = วันนี้
- การ์ดแสดง รายรับ / รายจ่าย / คงเหลือ แล้วตามด้วยหมวดรายจ่ายสูงสุด 5 หมวด หมวดที่เหลือรวมเป็นบรรทัด `หมวดอื่น`
- "สรุป" เฉยๆ ตอบ `ต้องการสรุปช่วงไหน` พร้อม Quick Reply 3 ปุ่ม `วันนี้` / `สัปดาห์นี้` / `เดือนนี้` (ปุ่มเป็น message action ที่ส่งข้อความ `สรุปวันนี้` / `สรุปสัปดาห์นี้` / `สรุปเดือนนี้`)
- ช่วงที่ไม่มีรายการ: ไม่เรียก Claude และใช้คำอธิบาย `ยังไม่มีรายการในช่วงนี้`
- ถ้า Claude เขียนคำอธิบายไม่สำเร็จ ยังส่งการ์ดโดยไม่มีคำอธิบาย และ log `Failed to comment summary`
- เพดานเวลาเรียก Claude สำหรับคำอธิบาย: `15000` ms
- function `summarize_transactions` ต้องเรียกได้เฉพาะ `service_role` (revoke จาก `public`, `anon`, `authenticated`)
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `supabase/003_summary_function.sql` | SQL function รวมยอดตามประเภทและหมวด | 1 |
| `src/summary/command.js` | แปลงข้อความเป็นคำสั่งสรุป | 2 |
| `src/summary/period.js` | ช่วงวันที่และป้ายชื่อของแต่ละคำสั่ง | 2 |
| `src/summary/summary.js` | รวมแถวจาก SQL เป็นยอดรวม + 5 หมวดแรก (หน่วยสตางค์) | 3 |
| `src/parser/format-reply.js` | export `formatAmount` ให้ไฟล์อื่นใช้ | 3 |
| `src/summary/flex.js` | สร้าง Flex Message ของการ์ดสรุป | 4 |
| `src/summary/comment.js` | ขอคำอธิบายสั้นจาก Claude | 5 |
| `src/db/repository.js` | `summarizeTransactions` เรียก rpc | 6 |
| `src/line-reply.js` | `replyFlex` | 7 |
| `src/bot.js` | ตรวจคำสั่งสรุปและตอบการ์ด | 8 |
| `index.js` | ต่อ commenter และ replyFlex เข้ากับบอท | 9 |

## Dependency Graph

- Task 1, 2, 3, 6, 7 ทำขนานกันได้ (Task 1 มีส่วนที่ผู้ใช้ทำเองบนเว็บ Supabase)
- Task 4 และ Task 5 รอ Task 3 (ใช้รูปของ summary และ `formatAmount`) แล้วทำขนานกันได้
- Task 8 รอ Task 2, 3, 4, 5, 6, 7
- Task 9 รอทุก task

---

### Task 1: SQL function `summarize_transactions`

**Depends on:** none

**Files:**
- Create: `supabase/003_summary_function.sql`

**Interfaces:**
- Consumes: ตาราง `transactions`, `categories` จาก `supabase/schema.sql`
- Produces: `public.summarize_transactions(p_user_id uuid, p_from date, p_to date)` คืนแถว `(type text, category text, total numeric, entry_count bigint)` เรียงตาม `type` แล้ว `total` มากไปน้อย แล้ว `category`; เรียกผ่าน supabase-js ได้ด้วย `supabase.rpc('summarize_transactions', { p_user_id, p_from, p_to })`

- [ ] **Step 1: เขียน `supabase/003_summary_function.sql`**

```sql
-- รันใน Supabase SQL Editor ต่อจาก 002 เพื่อให้บอทคำนวณยอดสรุปใน Postgres แทนการคิดเลขใน Claude

create or replace function public.summarize_transactions(p_user_id uuid, p_from date, p_to date)
returns table (type text, category text, total numeric, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select t.type, c.name, sum(t.amount), count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
  group by t.type, c.name
  order by t.type, sum(t.amount) desc, c.name
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงต้องปิดไม่ให้ anon key เรียกดูยอดของใครได้
revoke execute on function public.summarize_transactions(uuid, date, date) from public, anon, authenticated;
grant execute on function public.summarize_transactions(uuid, date, date) to service_role;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/003_summary_function.sql
git commit -m "feat: add SQL function for transaction summaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: (ผู้ใช้) รัน SQL และตรวจ**

**Manual check (ผู้ใช้เป็นคนทำ):**
- Preconditions: ตารางจาก `schema.sql` และ `002_pending_clarifications.sql` มีแล้ว และมีรายการใน `transactions` อย่างน้อย 1 แถวในเดือนนี้ (ถ้าไม่มี ให้ส่ง `กาแฟ 50` หาบอทก่อน)

| # | Action | Expected |
|---|---|---|
| 1 | Supabase > SQL Editor > New query > วางเนื้อหาทั้งไฟล์ `supabase/003_summary_function.sql` > Run | `Success. No rows returned` |
| 2 | รัน `select * from public.summarize_transactions((select id from public.users limit 1), date_trunc('month', current_date)::date, current_date);` | ได้แถวตามหมวดของรายการเดือนนี้ คอลัมน์ `type`, `category`, `total`, `entry_count` และ `total` ตรงกับผลรวมใน Table Editor > transactions |
| 3 | รัน `select has_function_privilege('anon', 'public.summarize_transactions(uuid, date, date)', 'execute') as anon, has_function_privilege('authenticated', 'public.summarize_transactions(uuid, date, date)', 'execute') as authenticated, has_function_privilege('service_role', 'public.summarize_transactions(uuid, date, date)', 'execute') as service_role;` | `anon` = false, `authenticated` = false, `service_role` = true |

---

### Task 2: แปลงคำสั่งสรุป + ช่วงวันที่

**Depends on:** none

**Files:**
- Create: `src/summary/command.js`
- Create: `src/summary/period.js`
- Test: `src/summary/command.test.js`
- Test: `src/summary/period.test.js`

**Interfaces:**
- Consumes: `toBangkokDateString(date: Date) => 'YYYY-MM-DD'` จาก `src/utils/date.js` (มีอยู่แล้ว)
- Produces:
  - `parseSummaryCommand(text: string) => 'menu' | 'today' | 'week' | 'month' | null`
  - `getPeriodRange(period: 'today' | 'week' | 'month', now: Date) => { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', label: string }` — `label` เช่น `วันนี้ (29/09)`, `สัปดาห์นี้ (28/09 - 29/09)`, `เดือนนี้ (01/09 - 29/09)`; ถ้า `from === to` แสดงวันเดียว; period อื่น throw `Error('Unknown period: <period>')`

- [ ] **Step 1: Write the failing tests**

`src/summary/command.test.js`

```js
import { describe, it, expect } from 'vitest';
import { parseSummaryCommand } from './command.js';

describe('parseSummaryCommand', () => {
  it('maps each summary text to its command', () => {
    expect(parseSummaryCommand('สรุป')).toBe('menu');
    expect(parseSummaryCommand('สรุปวันนี้')).toBe('today');
    expect(parseSummaryCommand('สรุปสัปดาห์นี้')).toBe('week');
    expect(parseSummaryCommand('สรุปเดือนนี้')).toBe('month');
  });

  it('ignores spaces anywhere in the text', () => {
    expect(parseSummaryCommand('  สรุป เดือนนี้ ')).toBe('month');
  });

  it('returns null for other messages', () => {
    expect(parseSummaryCommand('กินข้าว 60')).toBeNull();
    expect(parseSummaryCommand('สรุปปีนี้')).toBeNull();
    expect(parseSummaryCommand('ช่วยสรุปให้หน่อย')).toBeNull();
  });
});
```

`src/summary/period.test.js`

```js
import { describe, it, expect } from 'vitest';
import { getPeriodRange } from './period.js';

// 2026-09-29 เป็นวันอังคาร
const TUESDAY_NOON_BANGKOK = new Date('2026-09-29T05:00:00Z');

describe('getPeriodRange', () => {
  it('uses today for today', () => {
    expect(getPeriodRange('today', TUESDAY_NOON_BANGKOK)).toEqual({
      from: '2026-09-29',
      to: '2026-09-29',
      label: 'วันนี้ (29/09)',
    });
  });

  it('starts the week on Monday', () => {
    expect(getPeriodRange('week', TUESDAY_NOON_BANGKOK)).toEqual({
      from: '2026-09-28',
      to: '2026-09-29',
      label: 'สัปดาห์นี้ (28/09 - 29/09)',
    });
  });

  it('keeps Sunday in the week that started the Monday before', () => {
    const sunday = new Date('2026-10-04T05:00:00Z');

    expect(getPeriodRange('week', sunday).from).toBe('2026-09-28');
  });

  it('shows a single date when the week starts today', () => {
    const monday = new Date('2026-09-28T05:00:00Z');

    expect(getPeriodRange('week', monday).label).toBe('สัปดาห์นี้ (28/09)');
  });

  it('uses Bangkok time to decide the day', () => {
    // 2026-09-27 18:00 UTC คือ 2026-09-28 01:00 เวลาไทย (วันจันทร์)
    const earlyMondayBangkok = new Date('2026-09-27T18:00:00Z');

    expect(getPeriodRange('week', earlyMondayBangkok)).toMatchObject({
      from: '2026-09-28',
      to: '2026-09-28',
    });
  });

  it('starts the month on day 1', () => {
    expect(getPeriodRange('month', TUESDAY_NOON_BANGKOK)).toEqual({
      from: '2026-09-01',
      to: '2026-09-29',
      label: 'เดือนนี้ (01/09 - 29/09)',
    });
  });

  it('throws for an unknown period', () => {
    expect(() => getPeriodRange('year', TUESDAY_NOON_BANGKOK)).toThrow('Unknown period: year');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/summary`
Expected: FAIL เพราะหา `./command.js` และ `./period.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/summary/command.js`

```js
const COMMANDS = {
  'สรุป': 'menu',
  'สรุปวันนี้': 'today',
  'สรุปสัปดาห์นี้': 'week',
  'สรุปเดือนนี้': 'month',
};

function parseSummaryCommand(text) {
  const key = text.replace(/\s+/g, '');
  return Object.hasOwn(COMMANDS, key) ? COMMANDS[key] : null;
}

module.exports = { parseSummaryCommand };
```

`src/summary/period.js`

```js
const { toBangkokDateString } = require('../utils/date');

const PERIOD_NAMES = { today: 'วันนี้', week: 'สัปดาห์นี้', month: 'เดือนนี้' };

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function shortDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function startOf(period, today) {
  if (period === 'today') {
    return today;
  }
  if (period === 'week') {
    // getUTCDay ให้ 0 = อาทิตย์ จึงเลื่อนให้จันทร์เป็นวันแรกของสัปดาห์
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
    return addDays(today, -((weekday + 6) % 7));
  }
  if (period === 'month') {
    return `${today.slice(0, 8)}01`;
  }
  throw new Error(`Unknown period: ${period}`);
}

function getPeriodRange(period, now) {
  const today = toBangkokDateString(now);
  const from = startOf(period, today);
  const dates = from === today ? shortDate(today) : `${shortDate(from)} - ${shortDate(today)}`;
  return { from, to: today, label: `${PERIOD_NAMES[period]} (${dates})` };
}

module.exports = { getPeriodRange };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/summary`
Expected: PASS 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/summary/command.js src/summary/command.test.js src/summary/period.js src/summary/period.test.js
git commit -m "feat: parse summary commands and compute Bangkok date ranges

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: รวมแถวจาก SQL เป็นยอดสรุป

**Depends on:** none

**Files:**
- Create: `src/summary/summary.js`
- Modify: `src/parser/format-reply.js` (เพิ่ม `formatAmount` ใน `module.exports`)
- Test: `src/summary/summary.test.js`
- Test: `src/parser/format-reply.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `buildSummary(rows: Array<{ type: 'income' | 'expense', category: string, total: number, entryCount: number }>, label: string) => { label, incomeTotal: number, expenseTotal: number, net: number, topExpenses: Array<{ category: string, total: number }>, otherExpenseTotal: number, entryCount: number }` — ตัวเลขทุกตัวหน่วยบาท รวมภายในเป็นสตางค์; `topExpenses` สูงสุด 5 หมวด เรียงมากไปน้อย (เท่ากันเรียงตามชื่อหมวด)
  - `formatAmount(amount: number) => string` export จาก `src/parser/format-reply.js` (เช่น `25000` → `'25,000'`, `1250.5` → `'1,250.5'`)

- [ ] **Step 1: Write the failing tests**

`src/summary/summary.test.js`

```js
import { describe, it, expect } from 'vitest';
import { buildSummary } from './summary.js';

function expense(category, total, entryCount = 1) {
  return { type: 'expense', category, total, entryCount };
}

describe('buildSummary', () => {
  it('totals income, expense and net', () => {
    const summary = buildSummary(
      [
        { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
        expense('อาหาร', 105, 2),
      ],
      'วันนี้ (29/09)'
    );

    expect(summary).toEqual({
      label: 'วันนี้ (29/09)',
      incomeTotal: 25000,
      expenseTotal: 105,
      net: 24895,
      topExpenses: [{ category: 'อาหาร', total: 105 }],
      otherExpenseTotal: 0,
      entryCount: 3,
    });
  });

  it('adds satang exactly without floating point drift', () => {
    const summary = buildSummary([expense('อาหาร', 0.1), expense('เดินทาง', 0.2)], 'x');

    expect(summary.expenseTotal).toBe(0.3);
    expect(summary.net).toBe(-0.3);
  });

  it('keeps the top 5 expense categories and groups the rest', () => {
    const summary = buildSummary(
      [
        expense('อาหาร', 500),
        expense('เดินทาง', 400),
        expense('ช้อปปิ้ง', 300),
        expense('บิล/ค่าบริการ', 200),
        expense('สุขภาพ', 100),
        expense('บันเทิง', 50),
        expense('อื่นๆ', 25),
      ],
      'x'
    );

    expect(summary.topExpenses.map((entry) => entry.category)).toEqual([
      'อาหาร',
      'เดินทาง',
      'ช้อปปิ้ง',
      'บิล/ค่าบริการ',
      'สุขภาพ',
    ]);
    expect(summary.otherExpenseTotal).toBe(75);
  });

  it('orders expense categories by total even if rows arrive unsorted', () => {
    const summary = buildSummary([expense('อาหาร', 10), expense('เดินทาง', 90)], 'x');

    expect(summary.topExpenses[0]).toEqual({ category: 'เดินทาง', total: 90 });
  });

  it('returns zeros for no rows', () => {
    expect(buildSummary([], 'x')).toMatchObject({
      incomeTotal: 0,
      expenseTotal: 0,
      net: 0,
      topExpenses: [],
      otherExpenseTotal: 0,
      entryCount: 0,
    });
  });
});
```

ใน `src/parser/format-reply.test.js` แก้ import เป็น

```js
import { formatSavedReply, formatAmount } from './format-reply.js';
```

แล้วเพิ่ม `describe` นี้ท้ายไฟล์

```js
describe('formatAmount', () => {
  it('adds thousands separators and keeps up to two decimals', () => {
    expect(formatAmount(25000)).toBe('25,000');
    expect(formatAmount(1250.5)).toBe('1,250.5');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/summary/summary.test.js src/parser/format-reply.test.js`
Expected: FAIL (`./summary.js` หาไม่เจอ และ `formatAmount is not a function`)

- [ ] **Step 3: Write minimal implementation**

`src/summary/summary.js`

```js
const TOP_EXPENSE_COUNT = 5;

// รวมเป็นสตางค์ (จำนวนเต็ม) เพื่อไม่ให้ทศนิยมของ JavaScript คลาดเคลื่อน
function toSatang(baht) {
  return Math.round(Number(baht) * 100);
}

function buildSummary(rows, label) {
  let income = 0;
  let expense = 0;
  let entryCount = 0;
  const expenses = [];
  for (const row of rows) {
    const satang = toSatang(row.total);
    entryCount += row.entryCount;
    if (row.type === 'income') {
      income += satang;
    } else {
      expense += satang;
      expenses.push({ category: row.category, satang });
    }
  }
  expenses.sort((a, b) => b.satang - a.satang || a.category.localeCompare(b.category));
  const other = expenses.slice(TOP_EXPENSE_COUNT).reduce((sum, entry) => sum + entry.satang, 0);

  return {
    label,
    incomeTotal: income / 100,
    expenseTotal: expense / 100,
    net: (income - expense) / 100,
    topExpenses: expenses
      .slice(0, TOP_EXPENSE_COUNT)
      .map((entry) => ({ category: entry.category, total: entry.satang / 100 })),
    otherExpenseTotal: other / 100,
    entryCount,
  };
}

module.exports = { buildSummary };
```

ใน `src/parser/format-reply.js` แก้บรรทัดสุดท้ายเป็น

```js
module.exports = { formatSavedReply, formatAmount };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/summary/summary.test.js src/parser/format-reply.test.js`
Expected: PASS ทุกเทสต์ในสองไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/summary/summary.js src/summary/summary.test.js src/parser/format-reply.js src/parser/format-reply.test.js
git commit -m "feat: build summary totals and top expense categories in satang

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Flex Message ของการ์ดสรุป

**Depends on:** Task 3

**Files:**
- Create: `src/summary/flex.js`
- Test: `src/summary/flex.test.js`

**Interfaces:**
- Consumes: รูปของ summary จาก `buildSummary` (Task 3), `formatAmount` จาก `src/parser/format-reply.js` (Task 3)
- Produces: `buildSummaryFlex(summary, comment: string) => { type: 'flex', altText: string, contents: object }` — header `สรุป<label>`, body แถว `รายรับ` / `รายจ่าย` / `คงเหลือ`, ถ้ามีหมวดรายจ่ายเพิ่มหัวข้อ `รายจ่ายตามหมวด` แล้วแถวละหมวด และแถว `หมวดอื่น` เมื่อ `otherExpenseTotal > 0`; ถ้า `comment` ไม่ว่างเพิ่มท้ายการ์ด; `altText` = `สรุป<label>: รายรับ <x> บาท รายจ่าย <y> บาท`

- [ ] **Step 1: Write the failing test**

`src/summary/flex.test.js`

```js
import { describe, it, expect } from 'vitest';
import { buildSummaryFlex } from './flex.js';

function summary(overrides = {}) {
  return {
    label: 'วันนี้ (29/09)',
    incomeTotal: 25000,
    expenseTotal: 105,
    net: 24895,
    topExpenses: [{ category: 'อาหาร', total: 105 }],
    otherExpenseTotal: 0,
    entryCount: 3,
    ...overrides,
  };
}

function texts(flex) {
  const found = [];
  (function walk(node) {
    if (node && typeof node === 'object') {
      if (node.type === 'text') found.push(node.text);
      Object.values(node).forEach(walk);
    }
  })(flex.contents);
  return found;
}

describe('buildSummaryFlex', () => {
  it('builds a flex bubble with alt text for notifications', () => {
    const flex = buildSummaryFlex(summary(), 'ใช้จ่ายน้อย');

    expect(flex.type).toBe('flex');
    expect(flex.contents.type).toBe('bubble');
    expect(flex.altText).toBe('สรุปวันนี้ (29/09): รายรับ 25,000 บาท รายจ่าย 105 บาท');
  });

  it('shows the title, totals, categories and comment in order', () => {
    const flex = buildSummaryFlex(summary(), 'ใช้จ่ายน้อย');

    expect(texts(flex)).toEqual([
      'สรุปวันนี้ (29/09)',
      'รายรับ',
      '25,000 บาท',
      'รายจ่าย',
      '105 บาท',
      'คงเหลือ',
      '24,895 บาท',
      'รายจ่ายตามหมวด',
      'อาหาร',
      '105 บาท',
      'ใช้จ่ายน้อย',
    ]);
  });

  it('adds the other categories row only when there is a remainder', () => {
    const flex = buildSummaryFlex(summary({ otherExpenseTotal: 75 }), '');

    expect(texts(flex)).toContain('หมวดอื่น');
    expect(texts(flex)).toContain('75 บาท');
    expect(texts(buildSummaryFlex(summary(), ''))).not.toContain('หมวดอื่น');
  });

  it('omits the category section and the comment when both are empty', () => {
    const flex = buildSummaryFlex(summary({ expenseTotal: 0, net: 25000, topExpenses: [] }), '');

    expect(texts(flex)).not.toContain('รายจ่ายตามหมวด');
    expect(texts(flex)).toHaveLength(7);
  });

  it('shows a negative balance with a minus sign', () => {
    const flex = buildSummaryFlex(summary({ incomeTotal: 0, net: -105 }), '');

    expect(texts(flex)).toContain('-105 บาท');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/summary/flex.test.js`
Expected: FAIL เพราะหา `./flex.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/summary/flex.js`

```js
const { formatAmount } = require('../parser/format-reply');

const COLORS = { income: '#1DB446', expense: '#E53935', muted: '#888888' };

function baht(amount) {
  return `${formatAmount(amount)} บาท`;
}

function row(label, value, color) {
  const valueText = { type: 'text', text: value, size: 'sm', align: 'end', flex: 4 };
  if (color) {
    valueText.color = color;
  }
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [{ type: 'text', text: label, size: 'sm', color: COLORS.muted, flex: 3 }, valueText],
  };
}

function buildSummaryFlex(summary, comment) {
  const title = `สรุป${summary.label}`;
  const body = [
    row('รายรับ', baht(summary.incomeTotal), COLORS.income),
    row('รายจ่าย', baht(summary.expenseTotal), COLORS.expense),
    row('คงเหลือ', baht(summary.net)),
  ];
  if (summary.topExpenses.length > 0) {
    body.push(
      { type: 'separator', margin: 'md' },
      { type: 'text', text: 'รายจ่ายตามหมวด', size: 'sm', weight: 'bold', margin: 'md' }
    );
    for (const entry of summary.topExpenses) {
      body.push(row(entry.category, baht(entry.total)));
    }
    if (summary.otherExpenseTotal > 0) {
      body.push(row('หมวดอื่น', baht(summary.otherExpenseTotal)));
    }
  }
  if (comment) {
    body.push(
      { type: 'separator', margin: 'md' },
      { type: 'text', text: comment, size: 'sm', wrap: true, margin: 'md' }
    );
  }

  return {
    type: 'flex',
    altText: `${title}: รายรับ ${baht(summary.incomeTotal)} รายจ่าย ${baht(summary.expenseTotal)}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: title, weight: 'bold', size: 'md' }],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body },
    },
  };
}

module.exports = { buildSummaryFlex };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/summary/flex.test.js`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/summary/flex.js src/summary/flex.test.js
git commit -m "feat: build summary card as a LINE Flex Message

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: คำอธิบายสรุปจาก Claude

**Depends on:** Task 3

**Files:**
- Create: `src/summary/comment.js`
- Test: `src/summary/comment.test.js`

**Interfaces:**
- Consumes: รูปของ summary จาก `buildSummary` (Task 3), `formatAmount` (Task 3)
- Produces: `createSummaryCommenter({ client, model }) => (summary) => Promise<string>` — ส่งตัวเลขที่จัดรูปแล้วให้ Claude, คืนข้อความที่ trim แล้ว, throw `Error('Claude returned no comment')` ถ้าไม่มีข้อความ; request options `{ timeout: 15000, maxRetries: 1, signal: AbortSignal }`

- [ ] **Step 1: Write the failing test**

`src/summary/comment.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createSummaryCommenter } from './comment.js';

const SUMMARY = {
  label: 'วันนี้ (29/09)',
  incomeTotal: 0,
  expenseTotal: 1250.5,
  net: -1250.5,
  topExpenses: [{ category: 'อาหาร', total: 1250.5 }],
  otherExpenseTotal: 0,
  entryCount: 2,
};

function fakeClient(content) {
  return { messages: { create: vi.fn().mockResolvedValue({ content }) } };
}

describe('createSummaryCommenter', () => {
  it('sends formatted numbers and forbids Claude from calculating', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })(SUMMARY);

    const [params, options] = client.messages.create.mock.calls[0];
    expect(params.model).toBe('m');
    expect(params.system).toContain('Do not calculate');
    expect(params.messages[0].content).toContain('รายจ่าย: 1,250.5 บาท');
    expect(params.messages[0].content).toContain('- อาหาร: 1,250.5 บาท');
    expect(options).toEqual({ timeout: 15000, maxRetries: 1, signal: expect.any(AbortSignal) });
  });

  it('returns the trimmed comment text', async () => {
    const client = fakeClient([{ type: 'text', text: '  วันนี้ใช้กับอาหารเป็นหลัก  ' }]);

    expect(await createSummaryCommenter({ client, model: 'm' })(SUMMARY)).toBe(
      'วันนี้ใช้กับอาหารเป็นหลัก'
    );
  });

  it('mentions the other categories total when there is one', async () => {
    const client = fakeClient([{ type: 'text', text: 'ok' }]);

    await createSummaryCommenter({ client, model: 'm' })({ ...SUMMARY, otherExpenseTotal: 75 });

    expect(client.messages.create.mock.calls[0][0].messages[0].content).toContain('- หมวดอื่น: 75 บาท');
  });

  it('throws when Claude returns no text', async () => {
    const client = fakeClient([]);

    await expect(createSummaryCommenter({ client, model: 'm' })(SUMMARY)).rejects.toThrow(
      'Claude returned no comment'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/summary/comment.test.js`
Expected: FAIL เพราะหา `./comment.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/summary/comment.js`

```js
const { formatAmount } = require('../parser/format-reply');

// คำอธิบายเป็นส่วนเสริม ให้เวลาสั้นกว่าตอนแยกรายการเพื่อให้การ์ดยังตอบทันเวลา
const COMMENT_TIMEOUT_MS = 15000;

const SYSTEM_PROMPT = [
  'You write a short, friendly comment in Thai about a personal spending summary.',
  'Write at most two short sentences.',
  'Do not calculate anything and do not state any number that is not given.',
  'Do not use emoji.',
].join('\n');

function describeSummary(summary) {
  const lines = [
    `ช่วงเวลา: ${summary.label}`,
    `รายรับ: ${formatAmount(summary.incomeTotal)} บาท`,
    `รายจ่าย: ${formatAmount(summary.expenseTotal)} บาท`,
    `คงเหลือ: ${formatAmount(summary.net)} บาท`,
    'รายจ่ายตามหมวด:',
    ...summary.topExpenses.map((entry) => `- ${entry.category}: ${formatAmount(entry.total)} บาท`),
  ];
  if (summary.otherExpenseTotal > 0) {
    lines.push(`- หมวดอื่น: ${formatAmount(summary.otherExpenseTotal)} บาท`);
  }
  return lines.join('\n');
}

function createSummaryCommenter({ client, model }) {
  return async function commentSummary(summary) {
    const response = await client.messages.create(
      {
        model,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: describeSummary(summary) }],
      },
      {
        timeout: COMMENT_TIMEOUT_MS,
        maxRetries: 1,
        signal: AbortSignal.timeout(COMMENT_TIMEOUT_MS),
      }
    );
    const textBlock = response.content.find((block) => block.type === 'text');
    const comment = textBlock ? textBlock.text.trim() : '';
    if (!comment) {
      throw new Error('Claude returned no comment');
    }
    return comment;
  };
}

module.exports = { createSummaryCommenter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/summary/comment.test.js`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/summary/comment.js src/summary/comment.test.js
git commit -m "feat: ask Claude for a short summary comment from computed numbers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `summarizeTransactions` ใน repository

**Depends on:** none

**Files:**
- Modify: `src/db/repository.js` (เพิ่ม function และใส่ใน object ที่ return)
- Test: `src/db/repository.test.js` (เพิ่ม `rpc` ใน `fakeSupabase` และเพิ่ม describe ใหม่)

**Interfaces:**
- Consumes: SQL function จาก Task 1 (ชื่อและพารามิเตอร์)
- Produces: `repository.summarizeTransactions(userId: string, from: 'YYYY-MM-DD', to: 'YYYY-MM-DD') => Promise<Array<{ type, category, total: number, entryCount: number }>>` — throw `DatabaseError` เมื่อ Supabase คืน `error`

- [ ] **Step 1: Write the failing test**

ใน `src/db/repository.test.js` ใน function `fakeSupabase` เพิ่ม `rpc` ใน object `supabase` ให้เป็นดังนี้

```js
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
    rpc: vi.fn((name, params) => {
      calls.push(['rpc', name, params]);
      return builder;
    }),
  };
```

แล้วเพิ่ม describe นี้ท้ายไฟล์

```js
describe('repository.summarizeTransactions', () => {
  it('calls the SQL function for this user and date range and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ type: 'expense', category: 'อาหาร', total: '105.50', entry_count: '2' }],
      error: null,
    });

    const rows = await createRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    expect(rows).toEqual([{ type: 'expense', category: 'อาหาร', total: 105.5, entryCount: 2 }]);
    expect(calls).toEqual([
      ['rpc', 'summarize_transactions', { p_user_id: 'user-1', p_from: '2026-09-01', p_to: '2026-09-29' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).summarizeTransactions('user-1', '2026-09-01', '2026-09-29');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database summarizeTransactions failed: boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL 2 tests (`summarizeTransactions is not a function`)

- [ ] **Step 3: Write minimal implementation**

ใน `src/db/repository.js` เพิ่ม function นี้ก่อน `return {` ของ `createRepository`

```js
  async function summarizeTransactions(userId, from, to) {
    const { data, error } = await supabase.rpc('summarize_transactions', {
      p_user_id: userId,
      p_from: from,
      p_to: to,
    });
    throwIfError('summarizeTransactions', error);
    // numeric และ bigint จาก Postgres อาจมาเป็น string จึงแปลงเป็น number ที่นี่ที่เดียว
    return data.map((row) => ({
      type: row.type,
      category: row.category,
      total: Number(row.total),
      entryCount: Number(row.entry_count),
    }));
  }
```

และเพิ่ม `summarizeTransactions,` ใน object ที่ `createRepository` return

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: fetch transaction summaries through the SQL function

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `replyFlex`

**Depends on:** none

**Files:**
- Modify: `src/line-reply.js`
- Test: `src/line-reply.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `createReplyFlex(client) => (replyToken: string, flexMessage: object) => Promise<void>` export จาก `src/line-reply.js` ข้างๆ `createReplyText`

- [ ] **Step 1: Write the failing test**

ใน `src/line-reply.test.js` แก้ import เป็น

```js
import { createReplyText, createReplyFlex } from './line-reply.js';
```

แล้วเพิ่ม describe นี้ท้ายไฟล์

```js
describe('createReplyFlex', () => {
  it('sends the flex message with the reply token', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}) };
    const flex = { type: 'flex', altText: 'สรุป', contents: { type: 'bubble' } };

    await createReplyFlex(client)('token-1', flex);

    expect(client.replyMessage).toHaveBeenCalledWith({ replyToken: 'token-1', messages: [flex] });
  });

  it('propagates LINE API errors', async () => {
    const client = { replyMessage: vi.fn().mockRejectedValue(new Error('Invalid reply token')) };

    await expect(createReplyFlex(client)('bad', {})).rejects.toThrow('Invalid reply token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/line-reply.test.js`
Expected: FAIL (`createReplyFlex is not a function`)

- [ ] **Step 3: Write minimal implementation**

แทนที่ทั้งไฟล์ `src/line-reply.js`

```js
function createReplyText(client) {
  return async function replyText(replyToken, text, quickReplyItems) {
    const message = { type: 'text', text };
    if (quickReplyItems && quickReplyItems.length > 0) {
      message.quickReply = { items: quickReplyItems };
    }
    await client.replyMessage({ replyToken, messages: [message] });
  };
}

function createReplyFlex(client) {
  return async function replyFlex(replyToken, flexMessage) {
    await client.replyMessage({ replyToken, messages: [flexMessage] });
  };
}

module.exports = { createReplyText, createReplyFlex };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/line-reply.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/line-reply.js src/line-reply.test.js
git commit -m "feat: add flex message reply helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: บอทตอบคำสั่งสรุป

**Depends on:** Task 2, 3, 4, 5, 6, 7

**Files:**
- Modify: `src/bot.js`
- Test: `src/bot.test.js`

**Interfaces:**
- Consumes: `parseSummaryCommand`, `getPeriodRange` (Task 2), `buildSummary` (Task 3), `buildSummaryFlex` (Task 4), `commentSummary(summary)` ผ่าน injection (Task 5), `repository.summarizeTransactions` (Task 6), `replyFlex(replyToken, flex)` ผ่าน injection (Task 7)
- Produces: `createBot({ replyText, replyFlex, parseMessage, commentSummary, repository, users, allowRequest, now?, logger? })`; export เพิ่ม `SUMMARY_MENU_REPLY`, `NO_ENTRIES_COMMENT`
- พฤติกรรม: ข้อความ text ผ่าน `ensureUser` → `claimEvent` → `allowRequest` เหมือนเดิม แล้วถ้าเป็นคำสั่งสรุปจะไม่เรียก `parseMessage` และไม่แตะบริบทที่จำไว้:
  - `menu` → `replyText(token, 'ต้องการสรุปช่วงไหน', <quick reply 3 ปุ่ม>)`
  - `today` / `week` / `month` → `summarizeTransactions(userId, from, to)` → `buildSummary` → คำอธิบาย (ไม่มีรายการ: `ยังไม่มีรายการในช่วงนี้` โดยไม่เรียก Claude; Claude พัง: log `Failed to comment summary` พร้อม `{ userId }` แล้วใช้ `''`) → `replyFlex(token, flex)`
  - `summarizeTransactions` พัง → ตอบ `SYSTEM_ERROR_REPLY` ผ่าน catch เดิม

- [ ] **Step 1: Write the failing tests**

ใน `src/bot.test.js`:

แก้ import ด้านบนให้เป็น

```js
import {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
} from './bot.js';
```

ใน `setup()` เพิ่ม dependency ใหม่ 3 ตัว: `replyFlex` และ `commentSummary` ใน `deps`, และ `summarizeTransactions` ใน `repository` ให้ส่วนต้นของ `deps` เป็นดังนี้

```js
  const deps = {
    replyText: vi.fn().mockResolvedValue(),
    replyFlex: vi.fn().mockResolvedValue(),
    parseMessage: vi.fn().mockResolvedValue({ status: 'ok', items: [FOOD_ITEM] }),
    commentSummary: vi.fn().mockResolvedValue('วันนี้ใช้กับอาหารเป็นหลัก'),
    repository: {
      claimEvent: vi.fn().mockResolvedValue(true),
      insertTransactions: vi.fn().mockResolvedValue(),
      deleteTransactionsByEvent: vi.fn().mockResolvedValue(2),
      getPendingClarification: vi.fn().mockResolvedValue(null),
      savePendingClarification: vi.fn().mockResolvedValue(),
      clearPendingClarification: vi.fn().mockResolvedValue(),
      summarizeTransactions: vi
        .fn()
        .mockResolvedValue([{ type: 'expense', category: 'อาหาร', total: 105, entryCount: 2 }]),
    },
```

(ส่วนที่เหลือของ `setup()` คงเดิม)

เพิ่มค่าคงที่นี้ใต้ `UNDO_QUICK_REPLY`

```js
const SUMMARY_QUICK_REPLY = [
  { type: 'action', action: { type: 'message', label: 'วันนี้', text: 'สรุปวันนี้' } },
  { type: 'action', action: { type: 'message', label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' } },
  { type: 'action', action: { type: 'message', label: 'เดือนนี้', text: 'สรุปเดือนนี้' } },
];
```

แล้วเพิ่ม describe นี้ก่อน `describe('bot follow event', ...)`

```js
describe('bot summary command', () => {
  it('shows the period buttons for a plain summary request without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SUMMARY_MENU_REPLY, SUMMARY_QUICK_REPLY);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.summarizeTransactions).not.toHaveBeenCalled();
  });

  it('replies a summary card for today using SQL totals and the Claude comment', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-29', '2026-09-29');
    expect(deps.commentSummary).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'วันนี้ (29/09)', expenseTotal: 105, entryCount: 2 })
    );
    const [replyToken, flex] = deps.replyFlex.mock.calls[0];
    expect(replyToken).toBe('r1');
    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe('สรุปวันนี้ (29/09): รายรับ 0 บาท รายจ่าย 105 บาท');
    expect(JSON.stringify(flex)).toContain('วันนี้ใช้กับอาหารเป็นหลัก');
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('uses Monday to today for this week even with spaces in the command', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุป สัปดาห์นี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-28', '2026-09-29');
  });

  it('uses the first of the month to today for this month', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปเดือนนี้'));

    expect(deps.repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-09-01', '2026-09-29');
  });

  it('skips Claude and says there are no entries when the period is empty', async () => {
    const { deps, bot } = setup();
    deps.repository.summarizeTransactions.mockResolvedValue([]);

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.commentSummary).not.toHaveBeenCalled();
    expect(JSON.stringify(deps.replyFlex.mock.calls[0][1])).toContain(NO_ENTRIES_COMMENT);
  });

  it('still replies the card without a comment when Claude fails', async () => {
    const { deps, bot } = setup({ commentSummary: vi.fn().mockRejectedValue(new Error('overloaded')) });

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.replyFlex).toHaveBeenCalled();
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to comment summary',
      { userId: 'user-1' },
      expect.any(Error)
    );
  });

  it('replies system error when the summary query fails', async () => {
    const { deps, bot } = setup();
    deps.repository.summarizeTransactions.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.replyFlex).not.toHaveBeenCalled();
  });

  it('does not read or change the pending clarification', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.getPendingClarification).not.toHaveBeenCalled();
    expect(deps.repository.savePendingClarification).not.toHaveBeenCalled();
    expect(deps.repository.clearPendingClarification).not.toHaveBeenCalled();
  });

  it('still applies the rate limit before summarizing', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('สรุปวันนี้'));

    expect(deps.repository.summarizeTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bot.test.js`
Expected: FAIL เทสต์ใน `bot summary command` (เช่น `SUMMARY_MENU_REPLY` เป็น `undefined`, `summarizeTransactions` ไม่ถูกเรียก); เทสต์เดิมยังผ่าน

- [ ] **Step 3: Write minimal implementation**

ใน `src/bot.js`:

เพิ่ม require ต่อจากสองบรรทัดแรก

```js
const { parseSummaryCommand } = require('./summary/command');
const { getPeriodRange } = require('./summary/period');
const { buildSummary } = require('./summary/summary');
const { buildSummaryFlex } = require('./summary/flex');
```

เพิ่มค่าคงที่ต่อจาก `UNDO_NOT_FOUND_REPLY`

```js
const SUMMARY_MENU_REPLY = 'ต้องการสรุปช่วงไหน';
const NO_ENTRIES_COMMENT = 'ยังไม่มีรายการในช่วงนี้';
const SUMMARY_PERIOD_BUTTONS = [
  { label: 'วันนี้', text: 'สรุปวันนี้' },
  { label: 'สัปดาห์นี้', text: 'สรุปสัปดาห์นี้' },
  { label: 'เดือนนี้', text: 'สรุปเดือนนี้' },
];
```

เพิ่ม function นี้ต่อจาก `buildUndoQuickReply`

```js
// ใช้ message action เพื่อให้กดปุ่มแล้วได้ผลเหมือนพิมพ์คำสั่งเอง (Rich Menu ขั้นที่ 5 ใช้ข้อความชุดเดียวกัน)
function buildSummaryQuickReply() {
  return SUMMARY_PERIOD_BUTTONS.map((button) => ({
    type: 'action',
    action: { type: 'message', label: button.label, text: button.text },
  }));
}
```

แก้ parameter ของ `createBot` ให้เป็น

```js
function createBot({
  replyText,
  replyFlex,
  parseMessage,
  commentSummary,
  repository,
  users,
  allowRequest,
  now = () => Date.now(),
  logger = console,
}) {
```

เพิ่ม function สองตัวนี้ใน `createBot` ก่อน `async function handleText`

```js
  async function commentOn(summary, userId) {
    if (summary.entryCount === 0) {
      return NO_ENTRIES_COMMENT;
    }
    try {
      return await commentSummary(summary);
    } catch (err) {
      // คำอธิบายเป็นส่วนเสริม ยอดจาก SQL ยังส่งได้แม้ Claude ตอบไม่สำเร็จ
      logger.error('Failed to comment summary', { userId }, err);
      return '';
    }
  }

  async function handleSummary(command, userId) {
    if (command === 'menu') {
      return { text: SUMMARY_MENU_REPLY, quickReply: buildSummaryQuickReply() };
    }
    const range = getPeriodRange(command, new Date(now()));
    const rows = await repository.summarizeTransactions(userId, range.from, range.to);
    const summary = buildSummary(rows, range.label);
    const comment = await commentOn(summary, userId);
    return { flex: buildSummaryFlex(summary, comment) };
  }
```

ใน `handleText` เพิ่มบล็อกนี้ต่อจากการเช็ก `allowRequest` (ก่อน `const history = await loadHistory(userId);`)

```js
    const summaryCommand = parseSummaryCommand(event.message.text);
    if (summaryCommand) {
      return handleSummary(summaryCommand, userId);
    }
```

ใน `handleEvent` แก้บล็อกที่ส่งคำตอบให้เป็น

```js
    if (reply) {
      try {
        if (reply.flex) {
          await replyFlex(event.replyToken, reply.flex);
        } else {
          await replyText(event.replyToken, reply.text, reply.quickReply);
        }
      } catch (err) {
        logger.error('Failed to send reply', { lineUserId, eventType: event.type }, err);
      }
    }
```

และแก้ `module.exports` เป็น

```js
module.exports = {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
  SUMMARY_MENU_REPLY,
  NO_ENTRIES_COMMENT,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bot.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

- [ ] **Step 5: Run full suite**

Run: `npm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 6: Commit**

```bash
git add src/bot.js src/bot.test.js
git commit -m "feat: reply summary cards for summary commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ประกอบ `index.js` + ทดสอบใน LINE จริง

**Depends on:** Task 1-8

**Files:**
- Modify: `index.js`

**Interfaces:**
- Consumes: `createSummaryCommenter` (Task 5), `createReplyFlex` (Task 7), `createBot` ที่รับ `replyFlex` และ `commentSummary` (Task 8)
- Produces: server ที่ตอบคำสั่งสรุปได้จริง

ไฟล์นี้ไม่มี unit test เพราะเป็นแค่จุดประกอบ ตรวจด้วย Manual check แทน

- [ ] **Step 1: แก้ `index.js`**

แก้บรรทัด require ของ line-reply เป็น

```js
const { createReplyText, createReplyFlex } = require('./src/line-reply');
```

เพิ่ม require ต่อจาก require ของ `./src/db/fetch-with-timeout`

```js
const { createSummaryCommenter } = require('./src/summary/comment');
```

เพิ่มบรรทัดนี้ต่อจาก `const parseMessage = ...`

```js
const commentSummary = createSummaryCommenter({ client: anthropic, model: config.claudeModel });
```

แก้การสร้าง bot ให้เป็น

```js
const bot = createBot({
  replyText: createReplyText(lineClient),
  replyFlex: createReplyFlex(lineClient),
  parseMessage,
  commentSummary,
  repository,
  users,
  allowRequest,
});
```

- [ ] **Step 2: ตรวจ syntax และ require**

Run: `node --check index.js`
Expected: ไม่มี output (exit code 0)

Run: `node -e "require('./src/summary/comment'); require('./src/summary/flex'); require('./src/summary/period'); require('./src/summary/command'); require('./src/summary/summary'); console.log('ok')"`
Expected: พิมพ์ `ok`

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: PASS ทุกไฟล์ (18 ไฟล์เทสต์)

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "feat: wire summary commenter and flex replies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: (ผู้ใช้) Manual check ข้อ 1-7**

**Manual check (ผู้ใช้เป็นคนทำ — agent ห้าม start server เอง):**
- Preconditions: Task 1 Step 3 ผ่าน, หยุด `npm start` ตัวเก่าแล้ว `npm start` ใหม่, ngrok รันอยู่และ Webhook URL ตรงกับ ngrok ปัจจุบัน
- ทุกข้อที่มีคำอธิบายจาก Claude มีค่าใช้จ่าย API เล็กน้อย

| # | Action | Expected |
|---|---|---|
| 1 | ในแอป LINE ส่ง `สรุป` | บอทตอบ `ต้องการสรุปช่วงไหน` และมีปุ่ม `วันนี้` `สัปดาห์นี้` `เดือนนี้` |
| 2 | ส่ง `กาแฟ 45` แล้ว `ข้าว 60` (รอบอทตอบบันทึกแล้วทีละข้อความ) จากนั้นส่ง `สรุป` แล้วกดปุ่ม `วันนี้` | ในแชตขึ้น `สรุปวันนี้` จากฝั่งคุณ แล้วบอทตอบการ์ดหัวข้อ `สรุปวันนี้ (<วัน>/<เดือน>)` แสดง รายจ่ายรวมเท่ากับผลรวมรายการวันนี้ใน Table Editor > transactions, มีหัวข้อ `รายจ่ายตามหมวด` และมีคำอธิบายภาษาไทยสั้นๆ ท้ายการ์ด |
| 3 | ส่ง `สรุปสัปดาห์นี้` | หัวการ์ดแสดงช่วงตั้งแต่วันจันทร์ของสัปดาห์นี้ถึงวันนี้ ยอดตรงกับรายการในช่วงนั้น |
| 4 | ส่ง `สรุป เดือนนี้` (มีเว้นวรรค) | หัวการ์ดแสดง `เดือนนี้ (01/<เดือน> - <วันนี้>)` ยอดตรงกับรายการเดือนนี้ |
| 5 | ใน Table Editor > transactions ตรวจว่าไม่มีแถวใหม่หลังข้อ 1-4 | จำนวนแถวเท่าเดิมหลังข้อ 2 (คำสั่งสรุปไม่ถูกบันทึกเป็นรายการ) |
| 6 | ดูการแจ้งเตือนของ LINE หรือรายการแชต ตอนได้การ์ด | ข้อความแจ้งเตือนเป็น `สรุป... : รายรับ ... บาท รายจ่าย ... บาท` |
| 7 | ตรวจว่าคนนอกเรียก function ไม่ได้: PowerShell รัน `curl.exe -X POST "<SUPABASE_URL>/rest/v1/rpc/summarize_transactions" -H "apikey: <publishable key>" -H "Content-Type: application/json" -d '{\"p_user_id\":\"00000000-0000-0000-0000-000000000000\",\"p_from\":\"2026-01-01\",\"p_to\":\"2026-12-31\"}'` | ได้ error ที่มีคำว่า `permission denied` (ไม่ใช่ `[]`) |

---

## ข้อจำกัดที่ตั้งใจเลื่อนไปขั้นถัดไป

- ปุ่มสรุปใน Rich Menu เป็นขั้นที่ 5 (ปุ่มจะส่งข้อความชุดเดียวกับ Quick Reply ในขั้นนี้)
- ยังไม่มีการเทียบกับงบประมาณรายหมวด (ขั้นที่ 7)
- สรุปได้แค่ 3 ช่วงที่กำหนด ยังเลือกช่วงวันที่เองไม่ได้ (หน้าเว็บ LIFF ขั้นที่ 6)
- คำอธิบายจาก Claude อาจไม่เหมือนกันทุกครั้ง และอาจว่างถ้า Claude ตอบไม่ทัน 15 วินาที

---

## สิ่งที่เปลี่ยนจากแผนระหว่างลงมือทำ

- `src/summary/comment.js`: throw `Claude comment was truncated` เมื่อ `stop_reason` เป็น `max_tokens` และ `Claude refused to comment` เมื่อเป็น `refusal` (ก่อนอ่านข้อความ) และไม่ใส่หัวข้อ `รายจ่ายตามหมวด:` ใน prompt เมื่อไม่มีรายจ่าย; `comment.test.js` มี 7 tests (แผน 4)
- `src/db/repository.js`: คอมเมนต์เหนือการแปลง number เปลี่ยนเป็น "แปลงเป็น number เผื่อไว้ ให้ได้ชนิดเดียวกันเสมอไม่ว่า PostgREST จะส่งแบบไหน" (ผู้ใช้เลือกแก้ เพราะ PostgREST ส่งเป็นตัวเลข); เพิ่มเทสต์กรณีตัวเลขเป็น number และช่วงที่ไม่มีรายการ (รวม 4 tests ใน describe นี้ แผน 2)
- `supabase/003_summary_function.sql` และ `supabase/schema.sql`: ปรับคอมเมนต์ (revoke เป็นด่านที่สองนอกจาก RLS; ลำดับรัน schema -> 002 -> 003)
- `src/bot.test.js`: เทสต์กรณี Claude พังตรวจเพิ่มว่าการ์ดไม่มีข้อความ error
- Manual check ข้อ 6: altText จริงไม่มีช่องว่างหน้าเครื่องหมาย `:` (`สรุปวันนี้ (29/09): รายรับ ... บาท รายจ่าย ... บาท`)
- คำอธิบายจาก Claude อาจว่างได้อีกกรณี คือเมื่อ Claude ตอบถูกตัดหรือปฏิเสธ (log `Failed to comment summary`)
