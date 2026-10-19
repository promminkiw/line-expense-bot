# LIFF UI Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ปรับหน้าเว็บ LIFF ให้เป็นแอปแบบ 5 แท็บล่าง (รายการ / สรุป / จัดการงบ / รอบเดือน / โปรไฟล์) มีไอคอน SVG ประจำหมวด สีและแอนิเมชันเบาๆ skeleton loading empty state ค้นหา/กรองรายการ กราฟแนวโน้ม 6 เดือน และหน้าโปรไฟล์ที่แสดงยอดคงเหลือ พร้อมยกระดับคุณภาพโปรเจกต์ (ESLint, CI, README, DOM test)

**Architecture:** ยังเป็น HTML + ES module ธรรมดาไม่มี build step (`public/liff`) แบ่งโค้ดใหม่เป็นโมดูลเล็กที่รับ `doc`/`win` เข้ามาเพื่อทดสอบด้วย jsdom; ส่วนที่เป็นตรรกะล้วนอยู่ใน `format.mjs` ต่อไป; สี/ธีมทั้งหมดย้ายเป็น CSS custom properties ใน `tokens.css` (ธีมสว่างอย่างเดียว ผู้ใช้ตัดสินใจไม่ทำ dark mode) และมีเทสต์ตรวจ contrast จากไฟล์ CSS จริง; backend เพิ่ม SQL 010 (2 function) + `GET /api/profile` + `GET /api/trend`; การค้นหา/กรองทำฝั่ง client บนรายการของเดือนที่โหลดมาแล้ว

**Tech Stack:** Node.js (CommonJS) + Express 5, Supabase (PostgREST + plpgsql), LIFF, vitest + jsdom (devDependency ใหม่), ESLint (devDependency ใหม่), GitHub Actions

## Global Constraints

- ทำทีละขั้นตาม SPEC.md เขียน test ก่อนโค้ด และอัปเดต `work-memory/STATE.md` (CLAUDE.md ของโปรเจกต์)
- ห้าม commit ไฟล์ `.env` หรือ secret ใดๆ; ห้ามแก้ `.env`; ห้าม start/restart/kill server เอง ผู้ใช้เป็นคนทำ; ห้าม `git push`
- คอมเมนต์ในโค้ดบรรทัดเดียว ภาษาไทย ใช้เฉพาะอธิบาย "ทำไม" ศัพท์เทคนิคเป็นอังกฤษ; ชื่อตัวแปร/function/log message เป็นอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- ห้ามใช้ `innerHTML` กับข้อมูลใดๆ สร้าง DOM ด้วย `createElement`/`textContent` เท่านั้น (โน้ตมาจากข้อความผู้ใช้); SVG สร้างด้วย `createElementNS` เท่านั้น
- ห้ามเปลี่ยนพฤติกรรมของ endpoint เดิม (`/api/transactions`, `/budgets`, `/recurring`, `/exports`, `/categories`) และห้ามเปลี่ยน id ขององค์ประกอบเดิมใน `index.html` ที่ `app.mjs` อ้างอยู่ (เพิ่มได้ ย้ายที่ได้ ห้ามเปลี่ยนชื่อ)
- LIFF scope ยังเป็น `openid` อย่างเดียว ชื่อผู้ใช้ในโปรไฟล์อ่านจากตาราง `users.display_name` ผ่าน API ไม่ใช้ `liff.getProfile()`
- สีทุกคู่ที่เป็นข้อความต้อง contrast >= 4.5:1 (AA); คู่ที่ไม่ใช่ข้อความ (แท่งงบสีเตือน) >= 3:1; แอนิเมชันทุกชนิดต้องปิดเมื่อ `prefers-reduced-motion: reduce`
- ผู้ใช้ตัดสินใจแล้ว (2026-10-01): 5 แท็บล่างชื่อ รายการ, สรุป, จัดการงบ, รอบเดือน (= รายการประจำที่มีอยู่เดิม), โปรไฟล์ (แสดงยอดเงินคงเหลือและอื่นๆ); ไอคอนหมวดเป็น SVG ที่วาดเองเป็น inline sprite (ไม่ใช้ CDN ไม่ใช้ไลบรารีไอคอน); ความมีชีวิตชีวา = สีและการ์ดตามหมวด + แอนิเมชันเบาๆ + empty state มีภาพประกอบ (ผู้ใช้สั่งตัด dark mode ออกภายหลัง ห้ามทำ ห้ามใส่ `prefers-color-scheme` ใดๆ); เพิ่ม skeleton loading; ข้อเสนอที่เลือก = ค้นหา/กรองรายการ, กราฟแนวโน้ม + เทียบเดือนก่อน, คุณภาพโปรเจกต์ (README, GitHub Actions, ESLint, DOM test)
- ยอดเงินคงเหลือ = รายรับ - รายจ่าย ทุกรายการสะสมที่บันทึกในบอทตั้งแต่เริ่ม (ไม่ใช่ยอดในบัญชีจริง ต้องบอกไว้ในหน้า)
- การติดตั้ง `jsdom` และ `eslint` (+ `@eslint/js`, `globals`) เป็น devDependency ของโปรเจกต์นี้ผู้ใช้อนุมัติแล้วโดยเลือกข้อ "คุณภาพโปรเจกต์" (ไม่ใช่การติดตั้งแบบ global)
- ทำงานบน branch `feat/liff-ui-refresh` สร้างจาก `main` (ทำโดย orchestrator ก่อนเริ่ม Task 1: `git switch -c feat/liff-ui-refresh`) งานนี้แทรกก่อนขั้นที่ 10 Deploy
- LIFF ต้องล็อกอิน LINE จึงใช้ Playwright ทดสอบอัตโนมัติไม่ได้ ส่วน "Browser check" ของทุก task ผู้ใช้ทำเองในแอป LINE (เปิดจาก Rich Menu ช่อง เปิดเว็บ)

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/010_profile_and_trend.sql` | SQL function `lifetime_totals`, `monthly_totals` (service_role เท่านั้น) |
| `src/db/repository.js` (+test) | `getLifetimeTotals`, `getMonthlyTotals`, `getDisplayName` |
| `src/api/trend.js` (+test) | `monthsEndingAt`, `buildTrend` (ล้วน) |
| `src/api/router.js` (+test) | `GET /api/trend`, `GET /api/profile` |
| `public/liff/api.mjs` (+test) | `getTrend`, `getProfile` |
| `public/liff/tokens.css` (+`tokens.test.mjs`) | ตัวแปรสี + สีหมวด + เทสต์ contrast |
| `public/liff/style.css` | ใช้ตัวแปรจาก tokens, สไตล์ component ใหม่ |
| `public/liff/icons.mjs`, `categories.mjs` (+tests) | `createSvgIcon`, `categoryStyle`, `createCategoryBadge` |
| `public/liff/tabs.mjs` (+test) | `TABS`, `createTabController` |
| `public/liff/skeleton.mjs` (+test) | `createSkeletonRows`, `createLoadingIndicator` |
| `public/liff/motion.mjs` (+test) | `animateNumber`, `growBar`, `prefersReducedMotion` |
| `public/liff/empty-state.mjs` (+test) | `createEmptyState` |
| `public/liff/format.mjs` (+test) | `filterTransactions`, `trendBars`, `describeExpenseComparison`, `profileView` ฯลฯ |
| `public/liff/index.html`, `app.mjs` | sprite, แท็บล่าง, panel, wiring |
| `public/liff/app.dom.test.mjs` | smoke test boot ทั้งหน้าด้วย jsdom + fake `liff`/`fetch` |
| `eslint.config.js`, `.github/workflows/ci.yml`, `README.md`, `package.json` | คุณภาพโปรเจกต์ |

## Parallelism

Task 1 -> Task 2 (backend) ทำขนานกับ Task 3 ได้ ส่วน Task 3 -> 13 แตะ `index.html`/`app.mjs`/`style.css` ร่วมกัน ต้องทำเรียงลำดับ Task 2 ต้องเสร็จก่อน Task 10 และ 11

---

### Task 1: SQL 010 และ repository

**Depends on:** none

**Files:**
- Create: `supabase/010_profile_and_trend.sql`
- Modify: `src/db/repository.js` (เพิ่ม 3 method ต่อจาก `summarizeTransactions` และใส่ใน object ที่ return ท้ายไฟล์)
- Modify: `supabase/schema.sql:1` (บรรทัดคอมเมนต์หัวไฟล์ เพิ่ม `010_profile_and_trend.sql` ต่อท้ายรายการ)
- Test: `src/db/repository.test.js`

**Interfaces:**
- Produces:
  - `repository.getLifetimeTotals(userId): Promise<{ income: number, expense: number, entryCount: number, firstDate: string | null }>`
  - `repository.getMonthlyTotals(userId, from, to): Promise<Array<{ month: string, type: 'income' | 'expense', total: number }>>` (`month` เป็น `YYYY-MM`, `from`/`to` เป็น `YYYY-MM-DD`)
  - `repository.getDisplayName(userId): Promise<string | null>`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลว** ต่อท้าย `src/db/repository.test.js`

```js
describe('repository.getLifetimeTotals', () => {
  it('calls the SQL function and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ income: '25000.00', expense: '1234.50', entry_count: '12', first_date: '2026-08-03' }],
      error: null,
    });

    const totals = await createRepository(supabase).getLifetimeTotals('user-1');

    expect(totals).toEqual({ income: 25000, expense: 1234.5, entryCount: 12, firstDate: '2026-08-03' });
    expect(calls).toEqual([['rpc', 'lifetime_totals', { p_user_id: 'user-1' }]]);
  });

  it('returns zeros and a null first date when the user has no entries', async () => {
    const { supabase } = fakeSupabase({
      data: [{ income: 0, expense: 0, entry_count: 0, first_date: null }],
      error: null,
    });

    expect(await createRepository(supabase).getLifetimeTotals('user-1')).toEqual({
      income: 0,
      expense: 0,
      entryCount: 0,
      firstDate: null,
    });
  });

  it('treats an empty result as no entries', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).getLifetimeTotals('user-1')).toEqual({
      income: 0,
      expense: 0,
      entryCount: 0,
      firstDate: null,
    });
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).getLifetimeTotals('user-1')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository.getMonthlyTotals', () => {
  it('calls the SQL function for this user and range and converts numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { month: '2026-09', type: 'expense', total: '500.25' },
        { month: '2026-09', type: 'income', total: 25000 },
      ],
      error: null,
    });

    const rows = await createRepository(supabase).getMonthlyTotals('user-1', '2026-05-01', '2026-10-31');

    expect(rows).toEqual([
      { month: '2026-09', type: 'expense', total: 500.25 },
      { month: '2026-09', type: 'income', total: 25000 },
    ]);
    expect(calls).toEqual([
      ['rpc', 'monthly_totals', { p_user_id: 'user-1', p_from: '2026-05-01', p_to: '2026-10-31' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).getMonthlyTotals('user-1', '2026-05-01', '2026-10-31')).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository.getDisplayName', () => {
  it('reads the display name of this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: { display_name: 'สมชาย' }, error: null });

    expect(await createRepository(supabase).getDisplayName('user-1')).toBe('สมชาย');
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'display_name'],
      ['eq', 'id', 'user-1'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when the user or the name is missing', async () => {
    expect(await createRepository(fakeSupabase({ data: null, error: null }).supabase).getDisplayName('user-1')).toBeNull();
    expect(
      await createRepository(fakeSupabase({ data: { display_name: null }, error: null }).supabase).getDisplayName('user-1')
    ).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).getDisplayName('user-1')).rejects.toBeInstanceOf(DatabaseError);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้มเหลว**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL (`getLifetimeTotals is not a function` และของอีก 2 method)

- [ ] **Step 3: เขียน SQL** `supabase/010_profile_and_trend.sql`

```sql
-- รันใน Supabase SQL Editor ต่อจาก 009 สำหรับหน้าโปรไฟล์ (ยอดสะสม) และกราฟแนวโน้มรายเดือนในหน้า LIFF

-- aggregate ที่ไม่มี group by คืนหนึ่งแถวเสมอ แม้ผู้ใช้ยังไม่มีรายการ (income/expense = 0, first_date = null)
create or replace function public.lifetime_totals(p_user_id uuid)
returns table (income numeric, expense numeric, entry_count bigint, first_date date)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(*),
    min(t.occurred_on)
  from public.transactions t
  where t.user_id = p_user_id
$$;

create or replace function public.monthly_totals(p_user_id uuid, p_from date, p_to date)
returns table (month text, type text, total numeric)
language sql
stable
set search_path = public
as $$
  select to_char(t.occurred_on, 'YYYY-MM'), t.type, sum(t.amount)
  from public.transactions t
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
  group by 1, 2
  order by 1, 2
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นนอกจาก RLS และต้องคงไว้ถ้าเปลี่ยนเป็น security definer
revoke execute on function public.lifetime_totals(uuid) from public, anon, authenticated;
grant execute on function public.lifetime_totals(uuid) to service_role;
revoke execute on function public.monthly_totals(uuid, date, date) from public, anon, authenticated;
grant execute on function public.monthly_totals(uuid, date, date) to service_role;
```

- [ ] **Step 4: เขียน method ใน `src/db/repository.js`** ต่อจาก `summarizeTransactions` (ก่อน `getBudgetStatus`)

```js
  async function getLifetimeTotals(userId) {
    const { data, error } = await supabase.rpc('lifetime_totals', { p_user_id: userId });
    throwIfError('getLifetimeTotals', error);
    // aggregate คืนหนึ่งแถวเสมอ แต่กันไว้เผื่อผลว่าง
    const row = data[0] || {};
    return {
      income: Number(row.income ?? 0),
      expense: Number(row.expense ?? 0),
      entryCount: Number(row.entry_count ?? 0),
      firstDate: row.first_date ?? null,
    };
  }

  async function getMonthlyTotals(userId, from, to) {
    const { data, error } = await supabase.rpc('monthly_totals', { p_user_id: userId, p_from: from, p_to: to });
    throwIfError('getMonthlyTotals', error);
    return data.map((row) => ({ month: row.month, type: row.type, total: Number(row.total) }));
  }

  async function getDisplayName(userId) {
    const { data, error } = await supabase.from('users').select('display_name').eq('id', userId).maybeSingle();
    throwIfError('getDisplayName', error);
    return data ? data.display_name : null;
  }
```

แล้วเพิ่มใน object ที่ return ท้ายไฟล์ ต่อจาก `summarizeTransactions,`:

```js
    getLifetimeTotals,
    getMonthlyTotals,
    getDisplayName,
```

- [ ] **Step 5: แก้หัวไฟล์ `supabase/schema.sql` บรรทัด 1** ให้ต่อท้ายรายการด้วย ` และ 010_profile_and_trend.sql` (ใส่ "และ" ก่อน 010 แทนที่ "และ" ของ 009 เดิมเป็นเครื่องหมายจุลภาค)

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS

- [ ] **Step 7: Manual SQL check (ผู้ใช้ทำใน Supabase SQL Editor หลังรัน 010)** แทน `<uuid>` ด้วย id ของตัวเองจากตาราง users

```sql
select * from public.lifetime_totals('<uuid>');
select * from public.monthly_totals('<uuid>', '2026-05-01', '2026-10-31');
select has_function_privilege('anon', 'public.lifetime_totals(uuid)', 'execute') as anon_lifetime,
       has_function_privilege('authenticated', 'public.monthly_totals(uuid, date, date)', 'execute') as auth_monthly,
       has_function_privilege('service_role', 'public.monthly_totals(uuid, date, date)', 'execute') as service_monthly;
```
Expected: บรรทัดแรกได้ 1 แถว (income/expense ตรงกับ Table Editor, entry_count ตรงจำนวนแถว); บรรทัดสองได้แถวต่อเดือนต่อประเภท; บรรทัดสาม `anon_lifetime = false`, `auth_monthly = false`, `service_monthly = true`

- [ ] **Step 8: Commit**

```bash
git add supabase/010_profile_and_trend.sql supabase/schema.sql src/db/repository.js src/db/repository.test.js
git commit -m "feat: add lifetime and monthly totals SQL functions and repository methods"
```

---

### Task 2: API `/api/trend` และ `/api/profile` + client

**Depends on:** Task 1

**Files:**
- Create: `src/api/trend.js`
- Test: `src/api/trend.test.js`
- Modify: `src/api/router.js` (require ที่หัวไฟล์, เพิ่ม 2 route ต่อจาก `router.get('/transactions', ...)`)
- Test: `src/api/router.test.js` (เพิ่ม mock ใน `setup()` และ describe ใหม่ท้ายไฟล์)
- Modify: `public/liff/api.mjs` (เพิ่ม 2 method)
- Test: `public/liff/api.test.mjs`

**Interfaces:**
- Consumes: `repository.getMonthlyTotals`, `repository.getLifetimeTotals`, `repository.getDisplayName` จาก Task 1; `parseMonth` จาก `src/api/validate.js`
- Produces:
  - `monthsEndingAt(month, count = 6): string[]` เช่น `monthsEndingAt('2026-03')` = `['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']`
  - `buildTrend(month, rows): Array<{ month, income, expense }>` เรียงเก่าไปใหม่ เติม 0 ให้เดือนที่ไม่มีข้อมูล
  - `GET /api/trend?month=YYYY-MM` -> `{ months: [{ month, income, expense } x6] }` (เดือนที่ส่งคือเดือนสุดท้าย) 400 ถ้า month ผิด
  - `GET /api/profile` -> `{ displayName: string | null, income, expense, balance, entryCount, firstDate: string | null }` (`balance` คำนวณเป็นสตางค์)
  - `api.getTrend(month)`, `api.getProfile()` ฝั่งหน้าเว็บ

- [ ] **Step 1: เขียนเทสต์ trend** `src/api/trend.test.js`

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const { monthsEndingAt, buildTrend } = createRequire(import.meta.url)('./trend.js');

describe('monthsEndingAt', () => {
  it('lists 6 months oldest first and crosses the year boundary', () => {
    expect(monthsEndingAt('2026-03')).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03']);
  });

  it('ends at the given month when no year boundary is crossed', () => {
    expect(monthsEndingAt('2026-10')).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });
});

describe('buildTrend', () => {
  it('fills missing months and types with zero', () => {
    const rows = [
      { month: '2026-09', type: 'expense', total: 500.25 },
      { month: '2026-10', type: 'income', total: 25000 },
    ];

    const trend = buildTrend('2026-10', rows);

    expect(trend).toHaveLength(6);
    expect(trend[0]).toEqual({ month: '2026-05', income: 0, expense: 0 });
    expect(trend[4]).toEqual({ month: '2026-09', income: 0, expense: 500.25 });
    expect(trend[5]).toEqual({ month: '2026-10', income: 25000, expense: 0 });
  });

  it('ignores rows outside the window and unknown types', () => {
    const rows = [
      { month: '2025-01', type: 'expense', total: 999 },
      { month: '2026-10', type: 'transfer', total: 5 },
    ];

    const trend = buildTrend('2026-10', rows);

    expect(trend.every((entry) => entry.income === 0 && entry.expense === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run src/api/trend.test.js`
Expected: FAIL (cannot find `./trend.js`)

- [ ] **Step 3: เขียน** `src/api/trend.js`

```js
const TREND_MONTHS = 6;

// ใช้ UTC ล้วนเพื่อไม่ให้ timezone ของเครื่องทำให้เดือนเลื่อน
function monthsEndingAt(month, count = TREND_MONTHS) {
  const [year, value] = month.split('-').map(Number);
  const months = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, value - 1 - offset, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function buildTrend(month, rows) {
  const byMonth = new Map(monthsEndingAt(month).map((key) => [key, { month: key, income: 0, expense: 0 }]));
  for (const row of rows) {
    const entry = byMonth.get(row.month);
    if (entry && (row.type === 'income' || row.type === 'expense')) {
      entry[row.type] = row.total;
    }
  }
  return [...byMonth.values()];
}

module.exports = { TREND_MONTHS, monthsEndingAt, buildTrend };
```

- [ ] **Step 4: รัน trend test ให้ผ่าน**

Run: `npx vitest run src/api/trend.test.js`
Expected: PASS

- [ ] **Step 5: เขียนเทสต์ router (ล้มเหลวก่อน)**

ใน `src/api/router.test.js` เพิ่ม 3 mock ใน object `repository` ของ `setup()` (ต่อจาก `deleteRecurringRule`):

```js
      getMonthlyTotals: vi.fn().mockResolvedValue([
        { month: '2026-09', type: 'expense', total: 60 },
        { month: '2026-08', type: 'income', total: 25000 },
      ]),
      getLifetimeTotals: vi.fn().mockResolvedValue({ income: 25000.1, expense: 60.2, entryCount: 3, firstDate: '2026-08-03' }),
      getDisplayName: vi.fn().mockResolvedValue('สมชาย'),
```

แล้วต่อท้ายไฟล์:

```js
describe('GET /api/trend', () => {
  it('returns 6 months ending at the requested month, filled with zeros', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/trend?month=2026-09');

    expect(res.status).toBe(200);
    expect(deps.repository.getMonthlyTotals).toHaveBeenCalledWith('user-1', '2026-04-01', '2026-09-30');
    const { months } = await res.json();
    expect(months.map((entry) => entry.month)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(months[4]).toEqual({ month: '2026-08', income: 25000, expense: 0 });
    expect(months[5]).toEqual({ month: '2026-09', income: 0, expense: 60 });
  });

  it('rejects a missing, malformed or non-string month', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const query of ['', '?month=2026-13', '?month=abc', '?month=2026-09&month=2026-08']) {
      const res = await call(base, `/trend${query}`);
      expect(res.status).toBe(400);
    }
    expect(deps.repository.getMonthlyTotals).not.toHaveBeenCalled();
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/trend?month=2026-09', { token: null })).status).toBe(401);
  });
});

describe('GET /api/profile', () => {
  it('returns the name, lifetime totals and a balance computed in satang', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/profile');

    expect(res.status).toBe(200);
    expect(deps.repository.getLifetimeTotals).toHaveBeenCalledWith('user-1');
    expect(deps.repository.getDisplayName).toHaveBeenCalledWith('user-1');
    // 25000.10 - 60.20 ต้องได้ 24939.9 พอดี ไม่ใช่ 24939.899999999998
    expect(await res.json()).toEqual({
      displayName: 'สมชาย',
      income: 25000.1,
      expense: 60.2,
      balance: 24939.9,
      entryCount: 3,
      firstDate: '2026-08-03',
    });
  });

  it('allows a negative balance and a missing name', async () => {
    const deps = setup();
    deps.repository.getLifetimeTotals.mockResolvedValue({ income: 100, expense: 250.5, entryCount: 2, firstDate: '2026-09-01' });
    deps.repository.getDisplayName.mockResolvedValue(null);
    const base = await start(deps);

    const body = await (await call(base, '/profile')).json();

    expect(body.balance).toBe(-150.5);
    expect(body.displayName).toBeNull();
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/profile', { token: null })).status).toBe(401);
  });
});
```

- [ ] **Step 6: รันให้เห็นล้มเหลว**

Run: `npx vitest run src/api/router.test.js`
Expected: FAIL (route ตอบ 404)

- [ ] **Step 7: เขียน route ใน `src/api/router.js`**

เพิ่ม require ต่อจากบรรทัด `lastRunOnAfterSave`:

```js
const { monthsEndingAt, buildTrend } = require('./trend');
```

เพิ่ม route ต่อจาก `router.get('/transactions', ...)` ทั้งก้อน (ก่อน `router.patch('/transactions/:id'`):

```js
  router.get('/trend', async (req, res) => {
    const month = req.query.month;
    const range = typeof month === 'string' ? parseMonth(month) : null;
    if (!range) {
      res.status(400).json({ error: 'Invalid month' });
      return;
    }
    const months = monthsEndingAt(month);
    const rows = await repository.getMonthlyTotals(req.userId, `${months[0]}-01`, range.to);
    res.json({ months: buildTrend(month, rows) });
  });

  router.get('/profile', async (req, res) => {
    const [displayName, totals] = await Promise.all([
      repository.getDisplayName(req.userId),
      repository.getLifetimeTotals(req.userId),
    ]);
    // คิดเป็นสตางค์เพื่อไม่ให้ทศนิยมลอยตัวเพี้ยน
    const balanceSatang = Math.round(totals.income * 100) - Math.round(totals.expense * 100);
    res.json({
      displayName,
      income: totals.income,
      expense: totals.expense,
      balance: balanceSatang / 100,
      entryCount: totals.entryCount,
      firstDate: totals.firstDate,
    });
  });
```

- [ ] **Step 8: เขียนเทสต์ client ล้มเหลวก่อน** ใน `public/liff/api.test.mjs` ก่อนปีกกาปิดของ `describe('createApi'`

```js
  it('asks for the trend of a month and the profile', async () => {
    const fetchImpl = fakeFetch(200, {});
    const api = setup(fetchImpl);

    await api.getTrend('2026-09');
    await api.getProfile();

    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/trend?month=2026-09', '/api/profile']);
  });
```

- [ ] **Step 9: เพิ่มใน `public/liff/api.mjs`** ต่อจาก `listTransactions`

```js
    getTrend: (month) => request(`/trend?month=${encodeURIComponent(month)}`),
    getProfile: () => request('/profile'),
```

- [ ] **Step 10: รันเทสต์ที่เกี่ยวข้องให้ผ่าน แล้วรันทั้งชุด**

Run: `npx vitest run src/api public/liff/api.test.mjs`
Expected: PASS
Run: `npm test`
Expected: PASS ทั้งหมด (ไม่มีเทสต์เดิมพัง)

- [ ] **Step 11: Commit**

```bash
git add src/api/trend.js src/api/trend.test.js src/api/router.js src/api/router.test.js public/liff/api.mjs public/liff/api.test.mjs
git commit -m "feat: add trend and profile API endpoints"
```

---

### Task 3: Design tokens และเทสต์ contrast

**Depends on:** none (แต่ Task 4-13 ต้องรอ Task นี้)

**Files:**
- Create: `public/liff/tokens.css`
- Test: `public/liff/tokens.test.mjs`
- Modify: `public/liff/style.css` (เขียนทับทั้งไฟล์)
- Modify: `public/liff/index.html:7` (เพิ่ม link tokens.css ก่อน style.css) และ `index.html:5` (viewport เพิ่ม `viewport-fit=cover`)

**Interfaces:**
- Produces: CSS custom properties ที่ task ถัดไปใช้: `--bg --surface --text --muted --border --track --outline --primary --on-primary --danger --on-danger --warn --notice-bg --notice-text` และต่อหมวด `--cat-<key>-fg`, `--cat-<key>-bg` โดย key ∈ `food transport shopping bill health fun salary side other`; คลาสยูทิลิตี้ `.sr-only`

- [ ] **Step 1: เขียนเทสต์ contrast ที่ล้มเหลวก่อน** `public/liff/tokens.test.mjs`

```js
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function parseVars(text) {
  const vars = {};
  for (const [, name, value] of text.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    vars[name] = value;
  }
  return vars;
}

const vars = parseVars(css);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const CATEGORY_KEYS = ['food', 'transport', 'shopping', 'bill', 'health', 'fun', 'salary', 'side', 'other'];

// คู่ที่เป็นข้อความต้อง >= 4.5 (AA)
const TEXT_PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'bg'],
  ['muted', 'surface'],
  ['primary', 'surface'],
  ['danger', 'surface'],
  ['on-primary', 'primary'],
  ['on-danger', 'danger'],
  ['notice-text', 'notice-bg'],
  ...CATEGORY_KEYS.map((key) => [`cat-${key}-fg`, `cat-${key}-bg`]),
];

// คู่ที่ไม่ใช่ข้อความ (เส้นขอบปุ่ม แท่งสีเตือน) ต้อง >= 3
const UI_PAIRS = [
  ['outline', 'surface'],
  ['warn', 'surface'],
];

it('does not define a dark theme', () => {
  expect(css).not.toContain('prefers-color-scheme');
});

describe('tokens', () => {
  it('defines every token used by the pairs', () => {
    for (const name of new Set([...TEXT_PAIRS, ...UI_PAIRS].flat())) {
      expect(vars[name], `missing --${name}`).toBeDefined();
    }
  });

  it.each(TEXT_PAIRS)('text pair %s on %s has AA contrast', (fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_PAIRS)('ui pair %s on %s has at least 3:1', (fg, bg) => {
    expect(contrast(vars[fg], vars[bg])).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/tokens.test.mjs`
Expected: FAIL (ENOENT tokens.css)

- [ ] **Step 3: เขียน** `public/liff/tokens.css`

```css
/* ค่าสีทั้งหมดอยู่ที่นี่ที่เดียว เทสต์ tokens.test.mjs ตรวจ contrast จากไฟล์นี้ ต้องใช้รูปแบบ #rrggbb เท่านั้น */
:root {
  color-scheme: light;
  --bg: #f5f5f5;
  --surface: #ffffff;
  --text: #222222;
  --muted: #555555;
  --border: #dddddd;
  --track: #eeeeee;
  --outline: #767676;
  --primary: #13853a;
  --on-primary: #ffffff;
  --danger: #c62828;
  --on-danger: #ffffff;
  --warn: #b26a00;
  --notice-bg: #fff4d6;
  --notice-text: #6b4e00;
  --cat-food-fg: #9a3412;
  --cat-food-bg: #ffedd5;
  --cat-transport-fg: #1d4ed8;
  --cat-transport-bg: #dbeafe;
  --cat-shopping-fg: #a21caf;
  --cat-shopping-bg: #fae8ff;
  --cat-bill-fg: #0f766e;
  --cat-bill-bg: #ccfbf1;
  --cat-health-fg: #be123c;
  --cat-health-bg: #ffe4e6;
  --cat-fun-fg: #6d28d9;
  --cat-fun-bg: #ede9fe;
  --cat-salary-fg: #15803d;
  --cat-salary-bg: #dcfce7;
  --cat-side-fg: #4d7c0f;
  --cat-side-bg: #ecfccb;
  --cat-other-fg: #475569;
  --cat-other-bg: #e2e8f0;
}
```

- [ ] **Step 4: รันเทสต์ ถ้าคู่ไหนไม่ถึงเกณฑ์ให้ปรับค่าสีของคู่นั้น (fg เข้มขึ้นหรือ bg อ่อนลง) แล้วรันซ้ำจนผ่าน ห้ามลดเกณฑ์ในเทสต์**

Run: `npx vitest run public/liff/tokens.test.mjs`
Expected: PASS (ทุกคู่ และไม่มี `prefers-color-scheme` ใน tokens.css)

- [ ] **Step 5: เขียน `public/liff/style.css` ใหม่ทั้งไฟล์** (พฤติกรรมเดิมทุกอย่าง เปลี่ยนแค่สีเป็นตัวแปร และเพิ่ม `.sr-only`, สไตล์ `background`/`color` ของ dialog)

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, "Leelawadee UI", Tahoma, sans-serif; background: var(--bg); color: var(--text); }
.sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.bar h1 { margin: 0; font-size: 18px; }
.totals { margin: 12px 16px 0; font-size: 14px; color: var(--muted); }
.status { margin: 16px; color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0 16px 24px; }
.day { margin-top: 16px; font-size: 13px; color: var(--muted); }
.row { display: flex; justify-content: space-between; gap: 12px; margin-top: 6px; padding: 0; background: var(--surface); border-radius: 8px; }
.row .amount { white-space: nowrap; font-weight: 600; }
.row.expense .amount { color: var(--danger); }
.row.income .amount { color: var(--primary); }
dialog { width: min(92vw, 420px); border: none; border-radius: 12px; padding: 20px; background: var(--surface); color: var(--text); }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
dialog label { display: block; margin-top: 12px; font-size: 14px; }
dialog input, dialog select { display: block; width: 100%; margin-top: 4px; padding: 10px; font-size: 16px; color: var(--text); background: var(--surface); border: 1px solid var(--outline); border-radius: 8px; }
.error { color: var(--danger); font-size: 14px; }
.actions { display: flex; gap: 8px; margin-top: 20px; }
.actions button { flex: 1; padding: 10px; font-size: 16px; border-radius: 8px; border: 1px solid var(--outline); background: var(--surface); color: var(--text); }
.actions .primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.actions .danger { color: var(--danger); border-color: var(--danger); }
.row-button { display: flex; justify-content: space-between; gap: 12px; width: 100%; padding: 12px; border: none; border-radius: 8px; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; }
.actions .danger-solid { background: var(--danger); border-color: var(--danger); color: var(--on-danger); }
.actions button { min-height: 44px; }
.confirm-category { margin: 12px 0 0; font-size: 18px; font-weight: 600; }
.confirm-amount { margin: 4px 0 0; font-size: 18px; }
.confirm-detail { margin: 4px 0 0; font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
#confirm-delete h2 { margin: 0; font-size: 18px; }
.actions button:disabled { opacity: 0.6; }
.actions .danger-solid:disabled { opacity: 1; filter: brightness(0.75); }
.notice { margin: 8px 16px 0; padding: 8px 12px; font-size: 13px; color: var(--notice-text); background: var(--notice-bg); border-radius: 8px; }
.export { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 12px 16px 0; }
.export button { font: inherit; min-height: 44px; padding: 10px 16px; font-size: 16px; border: 1px solid var(--primary); border-radius: 8px; background: var(--surface); color: var(--primary); }
.export button:disabled { opacity: 0.6; }
.export-status { margin: 0; font-size: 13px; color: var(--muted); }
.chart { margin: 12px 16px 0; padding: 12px; background: var(--surface); border-radius: 8px; }
.chart-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.chart h2 { margin: 0; font-size: 16px; }
.tabs { display: flex; gap: 4px; }
.tabs button { font: inherit; min-height: 44px; padding: 8px 14px; font-size: 14px; border: 1px solid var(--outline); border-radius: 999px; background: var(--surface); color: var(--text); }
.tabs button[aria-pressed="true"] { background: var(--text); border-color: var(--text); color: var(--surface); }
.chart-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.chart-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; margin-top: 10px; font-size: 14px; }
.chart-label { overflow-wrap: anywhere; }
.chart-value { white-space: nowrap; color: var(--muted); }
.chart-track { grid-column: 1 / -1; height: 10px; background: var(--track); border-radius: 5px; overflow: hidden; }
.chart-fill { height: 100%; min-width: 2px; border-radius: 5px; }
.chart-row.expense .chart-fill { background: var(--danger); }
.chart-row.income .chart-fill { background: var(--primary); }
.chart-empty { margin: 12px 0 0; color: var(--muted); }
.budgets { margin: 12px 16px 0; padding: 12px; background: var(--surface); border-radius: 8px; }
.budgets h2 { margin: 0; font-size: 16px; }
.budgets-hint { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.budgets-error { margin: 12px 0 0; color: var(--muted); }
.budgets-error p { margin: 0 0 8px; }
.budgets-loading { margin: 12px 0 0; color: var(--muted); }
.budget-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.budget-button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; width: 100%; min-height: 44px; margin-top: 8px; padding: 8px 0; border: none; background: none; font: inherit; font-size: 14px; color: inherit; text-align: left; cursor: pointer; }
.budget-label { overflow-wrap: anywhere; font-weight: 600; }
.budget-edit { white-space: nowrap; color: var(--primary); }
.budget-value { grid-column: 1 / -1; color: var(--muted); }
.budget-track { display: block; grid-column: 1 / -1; height: 10px; background: var(--track); border-radius: 5px; overflow: hidden; }
.budget-fill { display: block; height: 100%; border-radius: 5px; }
.budget-row.ok .budget-fill { background: var(--primary); }
.budget-row.warn .budget-fill { background: var(--warn); }
.budget-row.over .budget-fill { background: var(--danger); }
.budget-row.over .budget-value { color: var(--danger); }
#budget-editor h2 { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.recurring { margin: 12px 16px 0; padding: 12px; background: var(--surface); border-radius: 8px; }
.recurring h2 { margin: 0; font-size: 16px; }
.recurring-hint { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.recurring-loading, .recurring-empty { margin: 12px 0 0; color: var(--muted); }
.recurring-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.recurring-button { display: block; width: 100%; min-height: 44px; margin-top: 8px; padding: 8px 0; border: none; background: none; font: inherit; font-size: 14px; color: inherit; text-align: left; cursor: pointer; }
.recurring-title { display: block; overflow-wrap: anywhere; font-weight: 600; }
.recurring-text { display: block; overflow-wrap: anywhere; color: var(--muted); }
.recurring-row.paused .recurring-title, .recurring-row.paused .recurring-text { color: var(--muted); }
#recurring-add, #recurring-retry { font: inherit; min-height: 44px; padding: 10px 16px; font-size: 16px; border: 1px solid var(--primary); border-radius: 8px; background: var(--surface); color: var(--primary); }
#recurring-add { margin-top: 12px; }
#recurring-add:disabled { opacity: 0.6; }
#recurring-editor h2, #recurring-confirm-delete h2 { margin: 0; font-size: 18px; }
#recurring-editor-title:focus { outline: none; }
#recurring-editor .check { display: flex; align-items: center; gap: 8px; min-height: 44px; }
#recurring-editor .check input { width: auto; margin: 0; flex: none; }
```

- [ ] **Step 6: แก้ `public/liff/index.html`**

บรรทัด 5 เปลี่ยนเป็น:
```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```
บรรทัด 7 เปลี่ยนเป็น:
```html
  <link rel="stylesheet" href="tokens.css">
  <link rel="stylesheet" href="style.css">
```

- [ ] **Step 7: รันทั้งชุดและตรวจไม่มีสีฮาร์ดโค้ดเหลือใน style.css**

Run: `npm test`
Expected: PASS ทั้งหมด
Run: `grep -nE "#[0-9a-fA-F]{3,6}" public/liff/style.css`
Expected: ไม่มีบรรทัดที่พิมพ์ออกมา (ยกเว้นไม่มีเลย; `rgba(0, 0, 0, 0.5)` ของ backdrop ไม่ใช่ hex จึงไม่ติด)

- [ ] **Step 8: Browser check (ผู้ใช้ทำในแอป LINE หลัง restart)**
- Preconditions: ผู้ใช้ restart `npm start`, ngrok ทำงาน, เปิด LIFF จาก Rich Menu
- Base URL: LIFF ผ่าน Rich Menu

| # | Action | Expected |
|---|---|---|
| 1 | เปิดหน้ารายการโดยโทรศัพท์เป็นโหมดสว่าง | หน้าตาเหมือนเดิม พื้นหลังเทาอ่อน การ์ดขาว ตัวเลขรายจ่ายสีแดง รายรับสีเขียว |
| 2 | กดแถวรายการเพื่อเปิด dialog แก้ไข | dialog พื้นขาว ช่องกรอกมีขอบชัด ปุ่ม บันทึก เป็นสีเขียวตัวอักษรขาว หน้าตาใกล้เคียงของเดิม |
| 3 | เปลี่ยนโทรศัพท์เป็นโหมดมืดแล้วเปิดหน้าใหม่ | หน้ายังเป็นธีมสว่างเหมือนเดิม (ไม่ทำ dark mode) |

- [ ] **Step 9: Commit**

```bash
git add public/liff/tokens.css public/liff/tokens.test.mjs public/liff/style.css public/liff/index.html
git commit -m "feat: add design tokens and contrast test for LIFF"
```

---

### Task 4: ไอคอน SVG ประจำหมวด (inline sprite) และเครื่องมือ DOM test

**Depends on:** Task 3

**Files:**
- Modify: `package.json`, `package-lock.json` (เพิ่ม `jsdom` devDependency)
- Create: `public/liff/icons.mjs`, `public/liff/categories.mjs`
- Test: `public/liff/icons.test.mjs`, `public/liff/categories.test.mjs`
- Modify: `public/liff/index.html` (ใส่ sprite ทันทีหลัง `<body>`)
- Modify: `public/liff/style.css` (ต่อท้าย)

**Interfaces:**
- Consumes: ตัวแปร `--cat-<key>-fg/-bg` จาก Task 3
- Produces:
  - `createSvgIcon(doc, symbolId, className = 'icon'): SVGSVGElement` สร้าง `<svg class aria-hidden><use href="#symbolId"></svg>`
  - `categoryStyle(name): { key, symbol, className }` เช่น `categoryStyle('อาหาร')` = `{ key: 'food', symbol: 'cat-food', className: 'cat-food' }`; ชื่อที่ไม่รู้จักได้ `other`
  - `createCategoryBadge(doc, name): HTMLSpanElement` คลาส `cat-badge cat-<key>` มี svg อยู่ข้างใน
  - symbol id ใน sprite: `cat-food cat-transport cat-shopping cat-bill cat-health cat-fun cat-salary cat-side cat-other` (viewBox 24)

- [ ] **Step 1: ติดตั้ง jsdom (devDependency ของโปรเจกต์ ผู้ใช้อนุมัติแล้ว)**

Run: `npm install --save-dev jsdom`
Expected: `package.json` มี `"jsdom"` ใน devDependencies; ไม่มี error

- [ ] **Step 2: เขียนเทสต์ที่ล้มเหลวก่อน** `public/liff/icons.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createSvgIcon } from './icons.mjs';

describe('createSvgIcon', () => {
  it('builds an svg that references the sprite symbol and is hidden from screen readers', () => {
    const svg = createSvgIcon(document, 'cat-food');

    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('class')).toBe('icon');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelector('use').getAttribute('href')).toBe('#cat-food');
  });

  it('accepts a custom class', () => {
    expect(createSvgIcon(document, 'tab-list', 'icon nav-icon').getAttribute('class')).toBe('icon nav-icon');
  });
});
```

`public/liff/categories.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { categoryStyle, createCategoryBadge } from './categories.mjs';

describe('categoryStyle', () => {
  it.each([
    ['อาหาร', 'food'],
    ['เดินทาง', 'transport'],
    ['ช้อปปิ้ง', 'shopping'],
    ['บิล/ค่าบริการ', 'bill'],
    ['สุขภาพ', 'health'],
    ['บันเทิง', 'fun'],
    ['เงินเดือน', 'salary'],
    ['รายได้เสริม', 'side'],
    ['อื่นๆ', 'other'],
  ])('maps %s to %s', (name, key) => {
    expect(categoryStyle(name)).toEqual({ key, symbol: `cat-${key}`, className: `cat-${key}` });
  });

  it('falls back to other for unknown names, including names that look like object keys', () => {
    expect(categoryStyle('หมวดที่ผู้ใช้ตั้งเอง').key).toBe('other');
    expect(categoryStyle('constructor').key).toBe('other');
    expect(categoryStyle('').key).toBe('other');
    expect(categoryStyle(undefined).key).toBe('other');
  });
});

describe('createCategoryBadge', () => {
  it('wraps the category icon in a colored badge', () => {
    const badge = createCategoryBadge(document, 'อาหาร');

    expect(badge.className).toBe('cat-badge cat-food');
    expect(badge.querySelector('use').getAttribute('href')).toBe('#cat-food');
  });
});
```

- [ ] **Step 3: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/icons.test.mjs public/liff/categories.test.mjs`
Expected: FAIL (cannot find module)

- [ ] **Step 4: เขียน** `public/liff/icons.mjs`

```js
const SVG_NS = 'http://www.w3.org/2000/svg';

// ไอคอนทั้งหมดอยู่ใน sprite ใน index.html อ้างด้วย <use> จึงไม่ต้องโหลดไฟล์เพิ่ม
export function createSvgIcon(doc, symbolId, className = 'icon') {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${symbolId}`);
  svg.append(use);
  return svg;
}
```

`public/liff/categories.mjs`

```js
import { createSvgIcon } from './icons.mjs';

// ใช้ Map เพราะชื่อหมวดมาจากผู้ใช้ ชื่ออย่าง constructor ต้องไม่หลุดไปเจอ property ของ Object
const CATEGORY_KEYS = new Map([
  ['อาหาร', 'food'],
  ['เดินทาง', 'transport'],
  ['ช้อปปิ้ง', 'shopping'],
  ['บิล/ค่าบริการ', 'bill'],
  ['สุขภาพ', 'health'],
  ['บันเทิง', 'fun'],
  ['เงินเดือน', 'salary'],
  ['รายได้เสริม', 'side'],
  ['อื่นๆ', 'other'],
]);

export function categoryStyle(name) {
  const key = CATEGORY_KEYS.get(name) ?? 'other';
  return { key, symbol: `cat-${key}`, className: `cat-${key}` };
}

export function createCategoryBadge(doc, name) {
  const { symbol, className } = categoryStyle(name);
  const badge = doc.createElement('span');
  badge.className = `cat-badge ${className}`;
  badge.append(createSvgIcon(doc, symbol));
  return badge;
}
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/icons.test.mjs public/liff/categories.test.mjs`
Expected: PASS

- [ ] **Step 6: ใส่ sprite ใน `public/liff/index.html`** ทันทีหลังแท็ก `<body>` (ไอคอนเส้น 24x24 วาดเองสไตล์เดียวกัน สีมาจาก `currentColor`)

```html
  <svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <symbol id="cat-food" viewBox="0 0 24 24"><path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M8 3.5c0 1.6 1 1.6 1 3.2M12 3.5c0 1.6 1 1.6 1 3.2M16 3.5c0 1.6 1 1.6 1 3.2"/></symbol>
    <symbol id="cat-transport" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="13" rx="2"/><path d="M4 11h16"/><circle cx="8" cy="19.5" r="1.2"/><circle cx="16" cy="19.5" r="1.2"/></symbol>
    <symbol id="cat-shopping" viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></symbol>
    <symbol id="cat-bill" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></symbol>
    <symbol id="cat-health" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></symbol>
    <symbol id="cat-fun" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/></symbol>
    <symbol id="cat-salary" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9.5h.01M17.5 14.5h.01"/></symbol>
    <symbol id="cat-side" viewBox="0 0 24 24"><ellipse cx="12" cy="7" rx="6" ry="2.5"/><path d="M6 7v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7"/><path d="M6 12v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-5"/></symbol>
    <symbol id="cat-other" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></symbol>
  </svg>
```

- [ ] **Step 7: ต่อท้าย `public/liff/style.css`**

```css
.icon { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.cat-badge { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px; border-radius: 50%; background: var(--cat-bg); color: var(--cat-fg); }
.cat-badge .icon { width: 20px; height: 20px; }
.cat-food { --cat-bg: var(--cat-food-bg); --cat-fg: var(--cat-food-fg); }
.cat-transport { --cat-bg: var(--cat-transport-bg); --cat-fg: var(--cat-transport-fg); }
.cat-shopping { --cat-bg: var(--cat-shopping-bg); --cat-fg: var(--cat-shopping-fg); }
.cat-bill { --cat-bg: var(--cat-bill-bg); --cat-fg: var(--cat-bill-fg); }
.cat-health { --cat-bg: var(--cat-health-bg); --cat-fg: var(--cat-health-fg); }
.cat-fun { --cat-bg: var(--cat-fun-bg); --cat-fg: var(--cat-fun-fg); }
.cat-salary { --cat-bg: var(--cat-salary-bg); --cat-fg: var(--cat-salary-fg); }
.cat-side { --cat-bg: var(--cat-side-bg); --cat-fg: var(--cat-side-fg); }
.cat-other { --cat-bg: var(--cat-other-bg); --cat-fg: var(--cat-other-fg); }
```

- [ ] **Step 8: รันทั้งชุด**

Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json public/liff/icons.mjs public/liff/icons.test.mjs public/liff/categories.mjs public/liff/categories.test.mjs public/liff/index.html public/liff/style.css
git commit -m "feat: add category SVG icon sprite and badge helpers with jsdom tests"
```

---

### Task 5: Bottom Tab Navigator

**Depends on:** Task 3, Task 4

**Files:**
- Create: `public/liff/tabs.mjs`
- Test: `public/liff/tabs.test.mjs`
- Modify: `public/liff/index.html` (จัด `<main>` เป็น panel, เพิ่ม `<nav>`, เพิ่ม symbol ไอคอนแท็บ)
- Modify: `public/liff/app.mjs` (import, สร้าง controller, scroll to top เมื่อเปลี่ยนแท็บ)
- Modify: `public/liff/style.css` (ต่อท้าย)

**Interfaces:**
- Consumes: `createSvgIcon` (Task 4)
- Produces:
  - `TABS: Array<{ id, label, title, icon, showMonth }>` ลำดับ `list, summary, budgets, recurring, profile`
  - `DEFAULT_TAB = 'list'`, `findTab(id)` (id ไม่รู้จักได้แท็บ `list`)
  - `createTabController({ doc, nav, titleEl, monthEl, panelFor, onChange })` -> `{ select(id), current }`; `panelFor(id)` คืน element ของ panel; สร้างปุ่มใน `nav` เอง (`button.nav-button[data-tab]`) ตั้ง `aria-current="page"` ที่ปุ่มที่เลือก, `hidden` ที่ panel อื่น, เปลี่ยนข้อความ `titleEl`, ซ่อน `monthEl` ในแท็บที่ `showMonth` เป็น false, เรียก `onChange(id)` ทุกครั้งที่แท็บเปลี่ยนจริง (ไม่เรียกถ้าเลือกแท็บเดิม)
  - id ของ panel ใน HTML: `panel-list`, `panel-summary`, `panel-budgets`, `panel-recurring`, `panel-profile`; id ของ nav: `bottom-nav`; id ของหัวข้อ: `page-title`
  - symbol ไอคอนแท็บ: `tab-list tab-chart tab-budget tab-repeat tab-user`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลวก่อน** `public/liff/tabs.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TABS, DEFAULT_TAB, findTab, createTabController } from './tabs.mjs';

function setup() {
  document.body.replaceChildren();
  const nav = document.createElement('nav');
  const titleEl = document.createElement('h1');
  const monthEl = document.createElement('input');
  const panels = new Map();
  for (const tab of TABS) {
    const panel = document.createElement('div');
    panel.id = `panel-${tab.id}`;
    document.body.append(panel);
    panels.set(tab.id, panel);
  }
  const onChange = vi.fn();
  const controller = createTabController({ doc: document, nav, titleEl, monthEl, panelFor: (id) => panels.get(id), onChange });
  return { nav, titleEl, monthEl, panels, onChange, controller };
}

describe('TABS', () => {
  it('has the five tabs in order', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['list', 'summary', 'budgets', 'recurring', 'profile']);
    expect(TABS.map((tab) => tab.label)).toEqual(['รายการ', 'สรุป', 'จัดการงบ', 'รอบเดือน', 'โปรไฟล์']);
    expect(DEFAULT_TAB).toBe('list');
  });

  it('falls back to the list tab for an unknown id', () => {
    expect(findTab('nope').id).toBe('list');
  });
});

describe('createTabController', () => {
  let ctx;
  beforeEach(() => {
    ctx = setup();
  });

  it('renders one button per tab with an icon and a label', () => {
    const buttons = ctx.nav.querySelectorAll('button[data-tab]');

    expect([...buttons].map((button) => button.dataset.tab)).toEqual(TABS.map((tab) => tab.id));
    expect(buttons[1].textContent).toBe('สรุป');
    expect(buttons[1].querySelector('use').getAttribute('href')).toBe('#tab-chart');
  });

  it('selecting a tab shows only its panel, marks the button, sets the title and notifies', () => {
    ctx.controller.select('budgets');

    expect([...ctx.panels].filter(([, panel]) => !panel.hidden).map(([id]) => id)).toEqual(['budgets']);
    expect(ctx.nav.querySelector('[aria-current="page"]').dataset.tab).toBe('budgets');
    expect(ctx.nav.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(ctx.titleEl.textContent).toBe(findTab('budgets').title);
    expect(ctx.onChange).toHaveBeenCalledWith('budgets');
    expect(ctx.controller.current).toBe('budgets');
  });

  it('hides the month picker on tabs that do not depend on a month', () => {
    ctx.controller.select('summary');
    expect(ctx.monthEl.hidden).toBe(false);

    ctx.controller.select('recurring');
    expect(ctx.monthEl.hidden).toBe(true);

    ctx.controller.select('profile');
    expect(ctx.monthEl.hidden).toBe(true);

    ctx.controller.select('list');
    expect(ctx.monthEl.hidden).toBe(false);
  });

  it('does not notify when the same tab is selected again', () => {
    ctx.controller.select('summary');
    ctx.onChange.mockClear();

    ctx.controller.select('summary');

    expect(ctx.onChange).not.toHaveBeenCalled();
  });

  it('switches when a nav button is clicked', () => {
    ctx.nav.querySelector('button[data-tab="profile"]').click();

    expect(ctx.controller.current).toBe('profile');
    expect(ctx.panels.get('profile').hidden).toBe(false);
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/tabs.test.mjs`
Expected: FAIL (cannot find `./tabs.mjs`)

- [ ] **Step 3: เขียน** `public/liff/tabs.mjs`

```js
import { createSvgIcon } from './icons.mjs';

export const TABS = [
  { id: 'list', label: 'รายการ', title: 'รายการของฉัน', icon: 'tab-list', showMonth: true },
  { id: 'summary', label: 'สรุป', title: 'สรุปรายเดือน', icon: 'tab-chart', showMonth: true },
  { id: 'budgets', label: 'จัดการงบ', title: 'จัดการงบประมาณ', icon: 'tab-budget', showMonth: true },
  { id: 'recurring', label: 'รอบเดือน', title: 'รายการประจำ', icon: 'tab-repeat', showMonth: false },
  { id: 'profile', label: 'โปรไฟล์', title: 'โปรไฟล์', icon: 'tab-user', showMonth: false },
];

export const DEFAULT_TAB = 'list';

export function findTab(id) {
  return TABS.find((tab) => tab.id === id) ?? TABS[0];
}

function buildButton(doc, tab) {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'nav-button';
  button.dataset.tab = tab.id;
  const label = doc.createElement('span');
  label.textContent = tab.label;
  button.append(createSvgIcon(doc, tab.icon), label);
  return button;
}

export function createTabController({ doc, nav, titleEl, monthEl, panelFor, onChange = () => {} }) {
  let current = null;

  function select(id) {
    const tab = findTab(id);
    if (tab.id === current) return;
    current = tab.id;
    for (const button of nav.querySelectorAll('button[data-tab]')) {
      if (button.dataset.tab === tab.id) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    }
    for (const other of TABS) {
      panelFor(other.id).hidden = other.id !== tab.id;
    }
    titleEl.textContent = tab.title;
    monthEl.hidden = !tab.showMonth;
    onChange(tab.id);
  }

  nav.replaceChildren(...TABS.map((tab) => buildButton(doc, tab)));
  nav.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-tab]');
    if (button) select(button.dataset.tab);
  });

  return {
    select,
    get current() {
      return current;
    },
  };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/tabs.test.mjs`
Expected: PASS

- [ ] **Step 5: จัด `index.html` เป็น panel** แทนที่บรรทัด `<main id="app">` ... `</main>` ทั้งก้อนด้วยโครงนี้ (เนื้อในของ section/ul/p เดิมย้ายมาทั้งหมดโดยไม่เปลี่ยน id ใดๆ; ตรงที่เขียนว่า `(เดิม)` ให้คัดลอกบรรทัดเดิมมาวางตรงนั้นทุกบรรทัด)

```html
  <main id="app">
    <header class="bar">
      <h1 id="page-title">รายการของฉัน</h1>
      <input type="month" id="month" aria-label="เลือกเดือน">
    </header>
    <div id="panel-list" class="panel">
      <p id="totals" class="totals" hidden></p>
      <p id="truncated" class="notice" hidden>เดือนนี้มีรายการมากกว่าที่แสดงได้ ยอดรวมและกราฟนับครบทุกรายการ ดูรายการทั้งหมดได้จาก Export CSV ในแท็บสรุป</p>
      <p id="status" class="status" role="status" aria-live="polite">กำลังโหลด...</p>
      <ul id="list" class="list"></ul>
    </div>
    <div id="panel-summary" class="panel" hidden>
      <div class="export">
        <button type="button" id="export-button" disabled>Export CSV</button>
        <p id="export-status" class="export-status" role="status" aria-live="polite"></p>
      </div>
      <section id="chart" class="chart" aria-labelledby="chart-title" hidden>
        (เดิม: เนื้อใน section#chart ทั้งหมด ตั้งแต่ div.chart-head ถึง p#chart-empty)
      </section>
    </div>
    <div id="panel-budgets" class="panel" hidden>
      <section id="budgets" class="budgets" aria-labelledby="budgets-title" hidden>
        (เดิม: เนื้อใน section#budgets ทั้งหมด)
      </section>
    </div>
    <div id="panel-recurring" class="panel" hidden>
      <section id="recurring" class="recurring" aria-labelledby="recurring-title" hidden>
        (เดิม: เนื้อใน section#recurring ทั้งหมด)
      </section>
    </div>
    <div id="panel-profile" class="panel" hidden></div>
  </main>
  <nav id="bottom-nav" class="bottom-nav" aria-label="เมนูหลัก"></nav>
```

และเพิ่ม symbol ไอคอนแท็บใน `<svg>` sprite ที่ Task 4 สร้าง (ต่อจาก `cat-other`):

```html
    <symbol id="tab-list" viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></symbol>
    <symbol id="tab-chart" viewBox="0 0 24 24"><path d="M5 20V10M12 20V4M19 20v-7"/></symbol>
    <symbol id="tab-budget" viewBox="0 0 24 24"><path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M16 14.5h.01"/></symbol>
    <symbol id="tab-repeat" viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M20 6H8a4 4 0 0 0-4 4v1"/><path d="M7 21l-3-3 3-3"/><path d="M4 18h12a4 4 0 0 0 4-4v-1"/></symbol>
    <symbol id="tab-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/></symbol>
```

- [ ] **Step 6: ต่อท้าย `style.css`**

```css
main#app { padding-bottom: calc(76px + env(safe-area-inset-bottom)); }
.bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; display: flex; background: var(--surface); border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom); }
.nav-button { flex: 1; min-width: 0; min-height: 56px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 6px 2px; border: none; background: none; font: inherit; font-size: 12px; color: var(--muted); cursor: pointer; }
.nav-button[aria-current="page"] { color: var(--primary); font-weight: 600; }
.nav-button:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
```

- [ ] **Step 7: ต่อสายใน `app.mjs`**

เพิ่ม import ใต้บรรทัด import ของ `format.mjs`:

```js
import { DEFAULT_TAB, createTabController } from './tabs.mjs';
```

เพิ่มก่อน `async function boot()`:

```js
const tabController = createTabController({
  doc: document,
  nav: document.getElementById('bottom-nav'),
  titleEl: document.getElementById('page-title'),
  monthEl: els.month,
  panelFor: (id) => document.getElementById(`panel-${id}`),
  onChange: () => window.scrollTo(0, 0),
});
tabController.select(DEFAULT_TAB);
```

- [ ] **Step 8: รันทั้งชุด และตรวจ syntax**

Run: `npm test`
Expected: PASS ทั้งหมด
Run: `node --check public/liff/app.mjs`
Expected: ไม่มี output (ผ่าน)

- [ ] **Step 9: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: ผู้ใช้ restart `npm start`, ngrok ทำงาน, เปิด LIFF จาก Rich Menu, มีรายการในเดือนนี้

| # | Action | Expected |
|---|---|---|
| 1 | เปิดหน้าเว็บ | เห็นแถบ 5 ปุ่มติดขอบล่าง (รายการ สรุป จัดการงบ รอบเดือน โปรไฟล์) ปุ่ม รายการ เป็นสีเขียว หัวข้อบนสุดคือ รายการของฉัน |
| 2 | กดแท็บ สรุป | เห็นปุ่ม Export CSV และกราฟตามหมวด ไม่เห็นรายการหรืองบ ตัวเลือกเดือนยังอยู่ |
| 3 | กดแท็บ จัดการงบ | เห็นงบประมาณรายจ่าย แตะหมวดแล้วตั้งงบได้เหมือนเดิม |
| 4 | กดแท็บ รอบเดือน | เห็นรายการประจำ ตัวเลือกเดือนหายไป เพิ่ม/แก้รายการประจำได้เหมือนเดิม |
| 5 | กดแท็บ โปรไฟล์ | หน้าว่างพร้อมหัวข้อ โปรไฟล์ (เนื้อหายังไม่มีจนกว่า Task 11) |
| 6 | เลื่อนหน้ารายการยาวๆ | แถบล่างไม่บังรายการสุดท้าย |
| 7 | แก้จำนวนเงินของรายการหนึ่งแล้วบันทึก | dialog ปิด กลับมาที่แท็บ รายการ ยอดเปลี่ยน |

- [ ] **Step 10: Commit**

```bash
git add public/liff/tabs.mjs public/liff/tabs.test.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css
git commit -m "feat: add bottom tab navigator to LIFF page"
```

---

### Task 6: ใช้ไอคอนและสีหมวดในรายการ กราฟ งบ และรายการประจำ

**Depends on:** Task 4, Task 5

**Files:**
- Modify: `public/liff/app.mjs` (`renderRow`, `renderChart`, `renderBudgets`, `renderRecurring`, import)
- Modify: `public/liff/style.css` (ต่อท้าย)

**Interfaces:**
- Consumes: `createCategoryBadge(doc, name)`, `categoryStyle(name)` (Task 4)
- Produces: คลาส `row-text`, `row-title`, `row-note`, `chart-label-wrap`, `budget-label-wrap`, `recurring-head` (ใช้ใน CSS ด้านล่างเท่านั้น)

ไม่มี logic ใหม่ที่ทดสอบแยกได้ (โครงสร้าง DOM ครอบด้วย smoke test ของ Task 13)

- [ ] **Step 1: import ใน `app.mjs`** ใต้บรรทัด import ของ `tabs.mjs`

```js
import { categoryStyle, createCategoryBadge } from './categories.mjs';
```

- [ ] **Step 2: แทนที่ `renderRow` ทั้ง function**

```js
// ใช้ textContent ทุกจุดเพราะโน้ตมาจากข้อความที่ผู้ใช้พิมพ์
function renderRow(item) {
  const row = document.createElement('li');
  row.className = `row ${item.type} ${categoryStyle(item.categoryName).className}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'row-button';
  const text = document.createElement('span');
  text.className = 'row-text';
  const title = document.createElement('span');
  title.className = 'row-title';
  title.textContent = item.categoryName;
  text.append(title);
  if (item.note) {
    const note = document.createElement('span');
    note.className = 'row-note';
    note.textContent = item.note;
    text.append(note);
  }
  const amount = document.createElement('span');
  amount.className = 'amount';
  amount.textContent = formatSignedBaht(item);
  button.append(createCategoryBadge(document, item.categoryName), text, amount);
  button.addEventListener('click', () => openEditor(item));
  row.append(button);
  return row;
}
```

- [ ] **Step 3: `renderChart`** แทนที่ 3 บรรทัดที่สร้าง `label`

```js
    const label = document.createElement('span');
    label.className = 'chart-label';
    label.textContent = row.category;
```
ด้วย

```js
    const label = document.createElement('span');
    label.className = 'chart-label chart-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(createCategoryBadge(document, row.category), labelText);
```

- [ ] **Step 4: `renderBudgets`** แทนที่ 3 บรรทัดที่สร้าง `label`

```js
    const label = document.createElement('span');
    label.className = 'budget-label';
    label.textContent = row.category;
```
ด้วย

```js
    const label = document.createElement('span');
    label.className = 'budget-label budget-label-wrap';
    const labelText = document.createElement('span');
    labelText.textContent = row.category;
    label.append(createCategoryBadge(document, row.category), labelText);
```

- [ ] **Step 5: `renderRecurring`** แทนที่บรรทัด

```js
    const title = document.createElement('span');
    title.className = 'recurring-title';
    title.textContent = row.title;
```
ด้วย

```js
    const title = document.createElement('span');
    title.className = 'recurring-title recurring-head';
    const titleText = document.createElement('span');
    titleText.textContent = row.title;
    title.append(createCategoryBadge(document, row.title), titleText);
```

- [ ] **Step 6: ต่อท้าย `style.css`**

```css
.row { box-shadow: inset 3px 0 0 var(--cat-fg); }
.row-button { align-items: center; }
.row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.row-title { font-weight: 600; overflow-wrap: anywhere; }
.row-note { font-size: 13px; color: var(--muted); overflow-wrap: anywhere; }
.chart-label-wrap, .budget-label-wrap, .recurring-head { display: flex; align-items: center; gap: 8px; }
.chart-label-wrap .cat-badge, .budget-label-wrap .cat-badge, .recurring-head .cat-badge { width: 28px; height: 28px; }
.chart-label-wrap .icon, .budget-label-wrap .icon, .recurring-head .icon { width: 16px; height: 16px; }
```

- [ ] **Step 7: ตรวจและรันทั้งชุด**

Run: `node --check public/liff/app.mjs`
Expected: ผ่าน
Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 8: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: เหมือน Task 5; มีรายการอย่างน้อยหมวดอาหาร เดินทาง และรายรับเงินเดือน

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ รายการ | แต่ละแถวมีวงกลมไอคอนสีประจำหมวด (อาหาร = ชามส้ม, เดินทาง = รถบัสน้ำเงิน, เงินเดือน = ธนบัตรเขียว) และแถบสีบางๆ ด้านซ้ายของการ์ด; โน้ตอยู่บรรทัดล่างของชื่อหมวด |
| 2 | แท็บ สรุป | หน้าแถวกราฟมีไอคอนเล็กหน้าชื่อหมวด |
| 3 | แท็บ จัดการงบ และ รอบเดือน | แต่ละหมวดมีไอคอนหน้าชื่อ |

- [ ] **Step 9: Commit**

```bash
git add public/liff/app.mjs public/liff/style.css
git commit -m "feat: show category icons and colors across LIFF lists"
```

---

### Task 7: Skeleton loading

**Depends on:** Task 5, Task 6

**Files:**
- Create: `public/liff/skeleton.mjs`
- Test: `public/liff/skeleton.test.mjs`
- Modify: `public/liff/index.html` (เพิ่ม `ul` skeleton ใต้ข้อความโหลดของงบและรายการประจำ และใน panel สรุป; ซ่อนข้อความโหลดเดิมด้วย `sr-only`)
- Modify: `public/liff/app.mjs`
- Modify: `public/liff/style.css` (ต่อท้าย)

**Interfaces:**
- Produces:
  - `createSkeletonRows(doc, count, variant = 'row'): DocumentFragment` สร้าง `li.skeleton.skeleton-<variant>[aria-hidden=true]` จำนวน `count`; variant ที่ใช้: `row` (สูง 56), `bar` (สูง 44), `card` (สูง 96)
  - `createLoadingIndicator({ doc, textEl, skeletonEl, count, variant }): { set(visible: boolean) }` เติม skeleton ลง `skeletonEl` ครั้งเดียว; `set(true)` แสดงทั้ง `textEl` และ `skeletonEl`; `set(false)` ซ่อนทั้งคู่ (ข้อความโหลดยังอยู่ให้ screen reader แต่ซ่อนด้วย `sr-only` ทางสายตา)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลวก่อน** `public/liff/skeleton.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createSkeletonRows, createLoadingIndicator } from './skeleton.mjs';

describe('createSkeletonRows', () => {
  it('creates the requested number of hidden placeholder rows', () => {
    const list = document.createElement('ul');
    list.append(createSkeletonRows(document, 3, 'bar'));

    const items = list.querySelectorAll('li');
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.className).toBe('skeleton skeleton-bar');
      expect(item.getAttribute('aria-hidden')).toBe('true');
      expect(item.textContent).toBe('');
    }
  });

  it('defaults to the row variant', () => {
    const list = document.createElement('ul');
    list.append(createSkeletonRows(document, 1));

    expect(list.firstElementChild.className).toBe('skeleton skeleton-row');
  });
});

describe('createLoadingIndicator', () => {
  function setup() {
    const textEl = document.createElement('p');
    const skeletonEl = document.createElement('ul');
    const indicator = createLoadingIndicator({ doc: document, textEl, skeletonEl, count: 2, variant: 'bar' });
    return { textEl, skeletonEl, indicator };
  }

  it('fills the skeleton once and toggles both elements together', () => {
    const { textEl, skeletonEl, indicator } = setup();

    expect(skeletonEl.children).toHaveLength(2);

    indicator.set(true);
    expect(textEl.hidden).toBe(false);
    expect(skeletonEl.hidden).toBe(false);

    indicator.set(false);
    expect(textEl.hidden).toBe(true);
    expect(skeletonEl.hidden).toBe(true);
    expect(skeletonEl.children).toHaveLength(2);
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/skeleton.test.mjs`
Expected: FAIL (cannot find `./skeleton.mjs`)

- [ ] **Step 3: เขียน** `public/liff/skeleton.mjs`

```js
export function createSkeletonRows(doc, count, variant = 'row') {
  const fragment = doc.createDocumentFragment();
  for (let index = 0; index < count; index += 1) {
    const item = doc.createElement('li');
    item.className = `skeleton skeleton-${variant}`;
    item.setAttribute('aria-hidden', 'true');
    fragment.append(item);
  }
  return fragment;
}

// ข้อความโหลดเดิมยังคงอยู่ให้ screen reader อ่าน ส่วน skeleton เป็นภาพประกอบอย่างเดียว
export function createLoadingIndicator({ doc, textEl, skeletonEl, count, variant = 'bar' }) {
  skeletonEl.replaceChildren(createSkeletonRows(doc, count, variant));
  return {
    set(visible) {
      textEl.hidden = !visible;
      skeletonEl.hidden = !visible;
    },
  };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/skeleton.test.mjs`
Expected: PASS

- [ ] **Step 5: แก้ `index.html`**

(ก) ที่ `p#budgets-loading` เปลี่ยนคลาสเป็น `class="budgets-loading sr-only"` และเพิ่มบรรทัดนี้ต่อท้ายทันที:
```html
      <ul id="budgets-skeleton" class="skeleton-list" aria-hidden="true" hidden></ul>
```
(ข) ที่ `p#recurring-loading` เปลี่ยนเป็น `class="recurring-loading sr-only"` และเพิ่มต่อท้ายทันที:
```html
      <ul id="recurring-skeleton" class="skeleton-list" aria-hidden="true" hidden></ul>
```
(ค) ใน `div#panel-summary` เพิ่มเป็นลูกตัวสุดท้าย (หลัง `section#chart`):
```html
      <ul id="summary-skeleton" class="skeleton-list skeleton-padded" aria-hidden="true" hidden></ul>
```
(ง) ใน `div#panel-list` ไม่ต้องเพิ่มอะไร (ใช้ `ul#list` เอง)

- [ ] **Step 6: แก้ `app.mjs`**

(ก) import เพิ่ม:
```js
import { createSkeletonRows, createLoadingIndicator } from './skeleton.mjs';
```
(ข) ใน `els` เพิ่ม 3 บรรทัด (ต่อจาก `budgetsLoading`/`recurringLoading` ตามลำดับที่สะดวก):
```js
  budgetsSkeleton: document.getElementById('budgets-skeleton'),
  recurringSkeleton: document.getElementById('recurring-skeleton'),
  summarySkeleton: document.getElementById('summary-skeleton'),
```
(ค) หลังบรรทัด `const recurringGuard = createLatestGuard();` เพิ่ม:
```js
const budgetsLoading = createLoadingIndicator({ doc: document, textEl: els.budgetsLoading, skeletonEl: els.budgetsSkeleton, count: 4 });
const recurringLoading = createLoadingIndicator({ doc: document, textEl: els.recurringLoading, skeletonEl: els.recurringSkeleton, count: 3 });
els.summarySkeleton.replaceChildren(createSkeletonRows(document, 1, 'card'));
```
(ง) แทนที่การตั้ง `hidden` ของข้อความโหลด (ทุกจุด ค้นด้วย grep ด้านล่าง):

| function | บรรทัดเดิม | บรรทัดใหม่ |
|---|---|---|
| `renderBudgets` | `els.budgetsLoading.hidden = true;` | `budgetsLoading.set(false);` |
| `showBudgetsError` | `els.budgetsLoading.hidden = true;` | `budgetsLoading.set(false);` |
| `loadMonth` (reset) | `els.budgetsLoading.hidden = false;` | `budgetsLoading.set(true);` |
| `els.budgetsRetry` handler | `els.budgetsLoading.hidden = false;` | `budgetsLoading.set(true);` |
| `renderRecurring` | `els.recurringLoading.hidden = true;` | `recurringLoading.set(false);` |
| `showRecurringError` | `els.recurringLoading.hidden = true;` | `recurringLoading.set(false);` |
| `els.recurringRetry` handler | `els.recurringLoading.hidden = false;` | `recurringLoading.set(true);` |
| `boot` | `els.recurringLoading.hidden = false;` | `recurringLoading.set(true);` |

(จ) `setStatus` รับสถานะกำลังโหลด: แทนที่ function เดิม
```js
function setStatus(text, { loading = false } = {}) {
  els.status.textContent = text;
  els.status.hidden = !text;
  // ข้อความโหลดยังอยู่ให้ screen reader แต่ทางสายตาใช้ skeleton แทน
  els.status.classList.toggle('sr-only', loading);
}
```
(ฉ) `loadMonth` ใน `if (reset) { ... }` เปลี่ยน `els.list.replaceChildren();` เป็น `els.list.replaceChildren(createSkeletonRows(document, 6, 'row'));` เปลี่ยน `setStatus('กำลังโหลด...');` เป็น `setStatus('กำลังโหลด...', { loading: true });` และเพิ่ม `els.summarySkeleton.hidden = false;` ต่อจาก `els.chart.hidden = true;`
(ช) `render(...)` เพิ่มบรรทัดแรกของ function: `els.summarySkeleton.hidden = true;`
(ซ) `showLoadError` แทนที่ทั้ง function
```js
function showLoadError(err) {
  // ล้างเฉพาะ skeleton ที่ค้าง ไม่ล้างรายการจริงตอน reload ล้มเหลว
  if (els.list.querySelector('.skeleton')) els.list.replaceChildren();
  els.summarySkeleton.hidden = true;
  setStatus(
    err instanceof ApiError && err.status === 401
      ? LOGIN_REQUIRED_MESSAGE
      : 'โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'
  );
}
```

- [ ] **Step 7: ต่อท้าย `style.css`**

```css
.skeleton-list { list-style: none; margin: 8px 0 0; padding: 0; }
.skeleton-padded { margin: 12px 16px 0; }
.skeleton { background: linear-gradient(90deg, var(--track) 25%, var(--border) 50%, var(--track) 75%); background-size: 200% 100%; border-radius: 8px; margin-top: 8px; animation: shimmer 1.2s linear infinite; }
.skeleton-row { height: 56px; }
.skeleton-bar { height: 44px; }
.skeleton-card { height: 96px; }
.list > .skeleton { margin-top: 6px; }
@keyframes shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

- [ ] **Step 8: ตรวจว่าแก้ครบทุกจุดและรันทั้งชุด**

Run: `grep -nE "(budgetsLoading|recurringLoading)\.hidden" public/liff/app.mjs`
Expected: ไม่มีบรรทัดที่พิมพ์ออกมา
Run: `node --check public/liff/app.mjs`
Expected: ผ่าน
Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: เหมือน Task 5; เพื่อเห็น skeleton ให้ตั้ง Network throttling ไม่ได้ในแอป LINE จึงให้สังเกตตอนเปิดครั้งแรกหรือเปลี่ยนเดือนซ้ำเร็วๆ

| # | Action | Expected |
|---|---|---|
| 1 | เปิดหน้าเว็บใหม่ | ช่วงโหลดเห็นแท่งสีเทาวิ่งแสงเลื่อนแทนข้อความ กำลังโหลด...; พอข้อมูลมาแท่งเทาหายแล้วเห็นรายการจริง |
| 2 | เปลี่ยนเดือนใน แท็บ รายการ | เห็น skeleton 6 แถวชั่วครู่แล้วเป็นรายการของเดือนนั้น |
| 3 | เปิดแท็บ จัดการงบ ขณะโหลดช้า | เห็นแท่ง skeleton 4 แถว ไม่เห็นข้อความ กำลังโหลดงบ... |
| 4 | ปิดเครือข่ายแล้วเปลี่ยนเดือน | skeleton หายไป แสดงข้อความ โหลดข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง |
| 5 | เปิด reduced motion ในเครื่อง (ถ้ามี) | skeleton นิ่ง ไม่วิ่งแสง |

- [ ] **Step 10: Commit**

```bash
git add public/liff/skeleton.mjs public/liff/skeleton.test.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css
git commit -m "feat: add skeleton loading states to LIFF page"
```

---

### Task 8: Empty state มีภาพประกอบ และแอนิเมชันเบาๆ

**Depends on:** Task 7

**Files:**
- Create: `public/liff/motion.mjs`, `public/liff/empty-state.mjs`
- Test: `public/liff/motion.test.mjs`, `public/liff/empty-state.test.mjs`
- Modify: `public/liff/index.html` (symbol ภาพประกอบ, โครง totals ใหม่, container empty state)
- Modify: `public/liff/app.mjs`
- Modify: `public/liff/style.css` (ต่อท้าย)

**Interfaces:**
- Produces:
  - `easeOutCubic(t)`, `interpolate(from, to, progress)` (progress ถูก clamp 0-1)
  - `prefersReducedMotion(win): boolean` (คืน `false` ถ้าไม่มี `matchMedia`)
  - `animateNumber({ win, from, to, durationMs = 600, onFrame }): () => void` เรียก `onFrame(value)` ทุกเฟรม ค่าสุดท้ายเท่ากับ `to` เป๊ะ; ถ้า reduced motion หรือ `from === to` เรียก `onFrame(to)` ทันทีหนึ่งครั้ง; คืนฟังก์ชันยกเลิก
  - `growBar(win, el, percent, property = 'width')` ตั้ง `el.style[property]` เป็น `percent%` โดยเริ่มจาก 0% แล้วเลื่อนในเฟรมถัดไปให้ CSS transition ทำงาน (reduced motion = ตั้งค่าตรงๆ)
  - `createEmptyState(doc, kind, tag = 'div'): HTMLElement` โดย `kind` ∈ `list | search | summary | recurring` สร้าง `<tag class="empty-state"><svg.empty-art/><p.empty-title/><p.empty-hint/></tag>`
  - symbol: `empty-list empty-search empty-chart empty-recurring` (viewBox 64)
  - id ใหม่ใน HTML: `stat-income`, `stat-expense`, `stat-balance` (ใน `#totals`), `summary-empty`, `recurring-empty` (เปลี่ยนจาก `p` เป็น `div`)

- [ ] **Step 1: เขียนเทสต์ motion ที่ล้มเหลวก่อน** `public/liff/motion.test.mjs`

```js
import { describe, it, expect, vi } from 'vitest';
import { easeOutCubic, interpolate, prefersReducedMotion, animateNumber, growBar } from './motion.mjs';

function fakeWindow({ reduced = false } = {}) {
  const frames = [];
  let now = 0;
  return {
    frames,
    advance(ms) {
      now += ms;
      const pending = frames.splice(0);
      for (const callback of pending) callback(now);
    },
    matchMedia: vi.fn(() => ({ matches: reduced })),
    performance: { now: () => now },
    requestAnimationFrame: vi.fn((callback) => frames.push(callback)),
    cancelAnimationFrame: vi.fn(),
  };
}

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it('interpolates and clamps the progress', () => {
    expect(interpolate(10, 20, 0)).toBe(10);
    expect(interpolate(10, 20, 1)).toBe(20);
    expect(interpolate(10, 20, 5)).toBe(20);
    expect(interpolate(10, 20, -1)).toBe(10);
  });
});

describe('prefersReducedMotion', () => {
  it('reads the media query and tolerates a missing matchMedia', () => {
    expect(prefersReducedMotion(fakeWindow({ reduced: true }))).toBe(true);
    expect(prefersReducedMotion(fakeWindow({ reduced: false }))).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
  });
});

describe('animateNumber', () => {
  it('jumps straight to the target when motion is reduced', () => {
    const win = fakeWindow({ reduced: true });
    const onFrame = vi.fn();

    animateNumber({ win, from: 0, to: 500, onFrame });

    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledWith(500);
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('does not animate when the value does not change', () => {
    const win = fakeWindow();
    const onFrame = vi.fn();

    animateNumber({ win, from: 7, to: 7, onFrame });

    expect(onFrame).toHaveBeenCalledWith(7);
    expect(win.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('counts up over the duration and ends exactly on the target', () => {
    const win = fakeWindow();
    const values = [];

    animateNumber({ win, from: 0, to: 100, durationMs: 600, onFrame: (value) => values.push(value) });
    win.advance(300);
    win.advance(400);

    expect(values).toHaveLength(2);
    expect(values[0]).toBeGreaterThan(0);
    expect(values[0]).toBeLessThan(100);
    expect(values[1]).toBe(100);
    expect(win.frames).toHaveLength(0);
  });

  it('returns a function that cancels the pending frame', () => {
    const win = fakeWindow();

    const cancel = animateNumber({ win, from: 0, to: 100, onFrame: () => {} });
    cancel();

    expect(win.cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe('growBar', () => {
  it('sets the final size directly when motion is reduced', () => {
    const el = { style: {} };

    growBar(fakeWindow({ reduced: true }), el, 40);

    expect(el.style.width).toBe('40%');
  });

  it('starts from zero and grows on a later frame', () => {
    const win = fakeWindow();
    const el = { style: {} };

    growBar(win, el, 40, 'height');

    expect(el.style.height).toBe('0%');
    win.advance(16);
    expect(el.style.height).toBe('0%');
    win.advance(16);
    expect(el.style.height).toBe('40%');
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/motion.test.mjs`
Expected: FAIL (cannot find `./motion.mjs`)

- [ ] **Step 3: เขียน** `public/liff/motion.mjs`

```js
export function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
}

export function interpolate(from, to, progress) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  return from + (to - from) * easeOutCubic(clamped);
}

export function prefersReducedMotion(win) {
  return Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function animateNumber({ win, from, to, durationMs = 600, onFrame }) {
  if (prefersReducedMotion(win) || from === to) {
    onFrame(to);
    return () => {};
  }
  const start = win.performance.now();
  let frameId;
  function step(now) {
    const progress = (now - start) / durationMs;
    // เฟรมสุดท้ายส่งค่าเป้าหมายตรงๆ ไม่ให้ทศนิยมจากการ interpolate ค้าง
    onFrame(progress >= 1 ? to : interpolate(from, to, progress));
    if (progress < 1) frameId = win.requestAnimationFrame(step);
  }
  frameId = win.requestAnimationFrame(step);
  return () => win.cancelAnimationFrame(frameId);
}

// ต้องเริ่มที่ 0 แล้วเปลี่ยนในเฟรมถัดไป CSS transition ถึงจะเล่น (ซ้อน rAF สองชั้นเพราะ element เพิ่งถูกต่อเข้า DOM)
export function growBar(win, el, percent, property = 'width') {
  if (prefersReducedMotion(win)) {
    el.style[property] = `${percent}%`;
    return;
  }
  el.style[property] = '0%';
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => {
      el.style[property] = `${percent}%`;
    });
  });
}
```

- [ ] **Step 4: เขียนเทสต์ empty state** `public/liff/empty-state.test.mjs`

```js
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createEmptyState } from './empty-state.mjs';

describe('createEmptyState', () => {
  it.each([
    ['list', 'empty-list', 'ยังไม่มีรายการในเดือนนี้'],
    ['search', 'empty-search', 'ไม่พบรายการที่ค้นหา'],
    ['summary', 'empty-chart', 'ยังไม่มีข้อมูลสรุปในเดือนนี้'],
    ['recurring', 'empty-recurring', 'ยังไม่มีรายการประจำ'],
  ])('builds the %s state with its illustration and title', (kind, symbol, title) => {
    const el = createEmptyState(document, kind);

    expect(el.tagName).toBe('DIV');
    expect(el.className).toBe('empty-state');
    expect(el.querySelector('use').getAttribute('href')).toBe(`#${symbol}`);
    expect(el.querySelector('.empty-title').textContent).toBe(title);
    expect(el.querySelector('.empty-hint').textContent.length).toBeGreaterThan(0);
  });

  it('can use another tag so it can live inside a list', () => {
    expect(createEmptyState(document, 'list', 'li').tagName).toBe('LI');
  });

  it('throws for an unknown kind so a typo is caught early', () => {
    expect(() => createEmptyState(document, 'nope')).toThrow('Unknown empty state: nope');
  });
});
```

- [ ] **Step 5: เขียน** `public/liff/empty-state.mjs`

```js
import { createSvgIcon } from './icons.mjs';

const EMPTY_STATES = {
  list: {
    symbol: 'empty-list',
    title: 'ยังไม่มีรายการในเดือนนี้',
    hint: 'พิมพ์ในแชตได้เลย เช่น "กินข้าว 60" บอทจะบันทึกให้',
  },
  search: {
    symbol: 'empty-search',
    title: 'ไม่พบรายการที่ค้นหา',
    hint: 'ลองเปลี่ยนคำค้นหรือล้างตัวกรอง',
  },
  summary: {
    symbol: 'empty-chart',
    title: 'ยังไม่มีข้อมูลสรุปในเดือนนี้',
    hint: 'เมื่อมีรายการแล้ว กราฟตามหมวดจะแสดงที่นี่',
  },
  recurring: {
    symbol: 'empty-recurring',
    title: 'ยังไม่มีรายการประจำ',
    hint: 'เพิ่มค่าใช้จ่ายที่เกิดทุกเดือน เช่น ค่าเน็ต แล้วบอทจะบันทึกให้เอง',
  },
};

export function createEmptyState(doc, kind, tag = 'div') {
  const state = EMPTY_STATES[kind];
  if (!state) throw new Error(`Unknown empty state: ${kind}`);
  const el = doc.createElement(tag);
  el.className = 'empty-state';
  const title = doc.createElement('p');
  title.className = 'empty-title';
  title.textContent = state.title;
  const hint = doc.createElement('p');
  hint.className = 'empty-hint';
  hint.textContent = state.hint;
  el.append(createSvgIcon(doc, state.symbol, 'icon empty-art'), title, hint);
  return el;
}
```

- [ ] **Step 6: รันเทสต์ทั้งสองไฟล์ให้ผ่าน**

Run: `npx vitest run public/liff/motion.test.mjs public/liff/empty-state.test.mjs`
Expected: PASS

- [ ] **Step 7: แก้ `index.html`**

(ก) เพิ่ม symbol ภาพประกอบ (viewBox 64) ใน sprite ต่อจาก `tab-user`:
```html
    <symbol id="empty-list" viewBox="0 0 64 64"><rect x="14" y="10" width="36" height="46" rx="4"/><path d="M24 10V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M22 26h20M22 34h20M22 42h12"/></symbol>
    <symbol id="empty-search" viewBox="0 0 64 64"><circle cx="28" cy="28" r="14"/><path d="M38 38l14 14"/></symbol>
    <symbol id="empty-chart" viewBox="0 0 64 64"><path d="M12 52h40"/><rect x="16" y="34" width="8" height="18" rx="2"/><rect x="28" y="22" width="8" height="30" rx="2"/><rect x="40" y="12" width="8" height="40" rx="2"/></symbol>
    <symbol id="empty-recurring" viewBox="0 0 64 64"><path d="M44 12l8 8-8 8"/><path d="M52 20H24a12 12 0 0 0-12 12v4"/><path d="M20 52l-8-8 8-8"/><path d="M12 44h28a12 12 0 0 0 12-12v-4"/></symbol>
```
(ข) แทนที่ `<p id="totals" class="totals" hidden></p>` ด้วย
```html
      <div id="totals" class="stat-cards" hidden>
        <div class="stat income"><span class="stat-label">รายรับ</span><span id="stat-income" class="stat-value"></span></div>
        <div class="stat expense"><span class="stat-label">รายจ่าย</span><span id="stat-expense" class="stat-value"></span></div>
        <div class="stat balance"><span class="stat-label">คงเหลือเดือนนี้</span><span id="stat-balance" class="stat-value"></span></div>
      </div>
```
(ค) แทนที่ `<p id="recurring-empty" class="recurring-empty" hidden>ยังไม่มีรายการประจำ</p>` ด้วย `<div id="recurring-empty" hidden></div>`
(ง) ใน `div#panel-summary` เพิ่มก่อน `ul#summary-skeleton`: `<div id="summary-empty" hidden></div>`

- [ ] **Step 8: แก้ `app.mjs`**

(ก) import เพิ่ม:
```js
import { animateNumber, growBar } from './motion.mjs';
import { createEmptyState } from './empty-state.mjs';
```
(ข) `els` เพิ่ม: ลบบรรทัดที่ไม่ใช้แล้วไม่ต้อง (ยังไม่มี) และเพิ่ม
```js
  statIncome: document.getElementById('stat-income'),
  statExpense: document.getElementById('stat-expense'),
  statBalance: document.getElementById('stat-balance'),
  summaryEmpty: document.getElementById('summary-empty'),
```
(ค) หลังบรรทัด `els.summarySkeleton.replaceChildren(...)` เพิ่ม:
```js
els.summaryEmpty.append(createEmptyState(document, 'summary'));
els.recurringEmpty.append(createEmptyState(document, 'recurring'));

// เก็บค่าเดิมและตัวยกเลิกของแต่ละช่อง เพื่อนับต่อจากค่าเดิมและไม่ให้แอนิเมชันซ้อนกัน
const shownAmounts = new Map();
function showAmount(el, value) {
  const previous = shownAmounts.get(el);
  if (previous) previous.cancel();
  const from = previous ? previous.value : 0;
  const cancel = animateNumber({
    win: window,
    from,
    to: value,
    onFrame: (current) => {
      el.textContent = formatBaht(Math.round(current * 100) / 100);
    },
  });
  shownAmounts.set(el, { value, cancel });
}
```
(ง) ใน `render(...)` แทนที่
```js
  els.totals.textContent = `รายรับ ${formatBaht(sum.income)} · รายจ่าย ${formatBaht(sum.expense)}`;
  els.totals.hidden = false;
```
ด้วย
```js
  showAmount(els.statIncome, sum.income);
  showAmount(els.statExpense, sum.expense);
  showAmount(els.statBalance, Math.round((sum.income - sum.expense) * 100) / 100);
  els.totals.hidden = false;
```
(จ) ใน `render(...)` ส่วนรายการว่าง แทนที่
```js
  if (transactions.length === 0) {
    setStatus('ยังไม่มีรายการในเดือนนี้');
    return;
  }
```
ด้วย
```js
  if (transactions.length === 0) {
    setStatus('');
    els.list.append(createEmptyState(document, 'list', 'li'));
    return;
  }
```
และให้แถวแต่ละรายการเข้าฉากไล่ลำดับ: ในลูป `for (const group of groupByDate(transactions))` เพิ่มตัวนับ `let rowIndex = 0;` ก่อนลูป และแทนที่ `els.list.append(renderRow(item));` ด้วย
```js
      const rowEl = renderRow(item);
      rowEl.style.setProperty('--i', String(Math.min(rowIndex, 10)));
      rowIndex += 1;
      els.list.append(rowEl);
```
(ฉ) `renderChart()`: แทนที่
```js
  if (!hasChartData(lastSummary)) {
    els.chart.hidden = true;
    return;
  }
```
ด้วย
```js
  if (!hasChartData(lastSummary)) {
    els.chart.hidden = true;
    els.summaryEmpty.hidden = false;
    return;
  }
  els.summaryEmpty.hidden = true;
```
และในลูปสร้างแท่ง แทนที่ `fill.style.width = \`${row.width}%\`;` ด้วย `growBar(window, fill, row.width);`
(ช) `renderBudgets`: แทนที่ `fill.style.width = \`${row.width}%\`;` ด้วย `growBar(window, fill, row.width);`
(ซ) `loadMonth` (reset): เพิ่ม `els.summaryEmpty.hidden = true;` ต่อจาก `els.chart.hidden = true;`
(ฌ) `renderRecurring`: แทนที่ `els.recurringEmpty.hidden = rules.length > 0;` (บรรทัดเดิม ไม่เปลี่ยน — ตอนนี้ `recurringEmpty` เป็น div ที่มี empty state อยู่ข้างใน) ไม่ต้องแก้

- [ ] **Step 9: ต่อท้าย `style.css`**

```css
.stat-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 12px 16px 0; }
.stat { display: flex; flex-direction: column; gap: 2px; padding: 10px; background: var(--surface); border-radius: 12px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.stat-label { font-size: 12px; color: var(--muted); }
.stat-value { font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
.stat.income .stat-value { color: var(--primary); }
.stat.expense .stat-value { color: var(--danger); }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 24px 16px; padding: 24px 16px; text-align: center; background: var(--surface); border-radius: 12px; }
.empty-art { width: 72px; height: 72px; stroke-width: 2.2; color: var(--muted); }
.empty-title { margin: 8px 0 0; font-weight: 600; }
.empty-hint { margin: 0; font-size: 13px; color: var(--muted); }
.chart-fill, .budget-fill { transition: width 0.5s ease-out; }
.panel:not([hidden]) { animation: panel-in 0.2s ease-out; }
.row { animation: row-in 0.25s ease-out both; animation-delay: calc(var(--i, 0) * 25ms); transition: transform 0.1s; }
.row-button:active, .budget-button:active, .recurring-button:active { opacity: 0.7; }
.nav-button { transition: color 0.15s; }
.nav-button:active { transform: scale(0.94); }
@keyframes panel-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 10: ตรวจและรันทั้งชุด**

Run: `node --check public/liff/app.mjs`
Expected: ผ่าน
Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 11: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: เหมือน Task 5; มีเดือนหนึ่งที่ไม่มีรายการ (เช่นเดือนอนาคต)

| # | Action | Expected |
|---|---|---|
| 1 | เปิดแท็บ รายการ เดือนที่มีรายการ | เห็นการ์ด 3 ใบ (รายรับ รายจ่าย คงเหลือเดือนนี้) ตัวเลขนับขึ้นจาก 0 ใน ~0.6 วินาที แถวรายการเข้าฉากไล่ลงมาทีละแถว |
| 2 | เลือกเดือนที่ไม่มีรายการ | เห็นภาพคลิปบอร์ด + ข้อความ ยังไม่มีรายการในเดือนนี้ พร้อมคำแนะนำให้พิมพ์ในแชต |
| 3 | แท็บ สรุป เดือนว่าง | เห็นภาพแท่งกราฟ + ข้อความ ยังไม่มีข้อมูลสรุปในเดือนนี้ |
| 4 | แท็บ สรุป เดือนที่มีรายการ | แท่งกราฟค่อยๆ ยาวออกจากซ้ายไปขวา |
| 5 | สลับแท็บไปมา | เนื้อหาเลื่อนขึ้นเบาๆ พร้อมจางเข้า |
| 6 | แท็บ รอบเดือน เมื่อยังไม่มีกฎ | เห็นภาพลูกศรวนซ้ำ + ข้อความ ยังไม่มีรายการประจำ ปุ่ม เพิ่มรายการประจำ ยังกดได้ |
| 7 | เปิด reduced motion ในเครื่อง | ทุกอย่างขึ้นทันที ไม่มีนับขึ้น ไม่มีสไลด์ |

- [ ] **Step 12: Commit**

```bash
git add public/liff/motion.mjs public/liff/motion.test.mjs public/liff/empty-state.mjs public/liff/empty-state.test.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css
git commit -m "feat: add empty states and light animations to LIFF page"
```

---

### Task 9: ค้นหา/กรองรายการ

**Depends on:** Task 8

**Files:**
- Modify: `public/liff/format.mjs` (เพิ่ม 3 function)
- Test: `public/liff/format.test.mjs`
- Modify: `public/liff/index.html`, `public/liff/app.mjs`, `public/liff/style.css`

**Interfaces:**
- Consumes: `createEmptyState(doc, 'search', 'li')` (Task 8)
- Produces:
  - `filterTransactions(transactions, { query = '', categoryId = '', type = '' } = {}): Transaction[]` คงลำดับเดิม; `query` ค้นในชื่อหมวด + โน้ต แบบไม่สนตัวพิมพ์ ตัดช่องว่างหัวท้าย; `categoryId`/`type` ว่าง = ไม่กรอง
  - `isFilterActive({ query, categoryId, type }): boolean`
  - `describeFilterResult(shown, total, truncated): string` เช่น `พบ 3 จาก 20 รายการ`; ถ้า `truncated` ต่อท้าย ` (ค้นเฉพาะรายการที่แสดง)`
  - id ใหม่ใน HTML: `filters` (div), `search` (input type=search), `filter-type` (select), `filter-category` (select), `filter-clear` (button), `filter-status` (p role=status)

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลวก่อน** เพิ่มใน `public/liff/format.test.mjs` (เพิ่มชื่อใน import list ด้านบนด้วย: `filterTransactions, isFilterActive, describeFilterResult`) แล้วต่อท้ายไฟล์

```js
describe('filterTransactions', () => {
  const items = [
    { id: '1', type: 'expense', categoryId: 'c-food', categoryName: 'อาหาร', note: 'ข้าวมันไก่', amount: 60 },
    { id: '2', type: 'expense', categoryId: 'c-trip', categoryName: 'เดินทาง', note: 'BTS', amount: 40 },
    { id: '3', type: 'income', categoryId: 'c-salary', categoryName: 'เงินเดือน', note: '', amount: 25000 },
    { id: '4', type: 'expense', categoryId: 'c-food', categoryName: 'อาหาร', note: null, amount: 45 },
  ];

  it('returns everything when no filter is set', () => {
    expect(filterTransactions(items, {})).toEqual(items);
    expect(filterTransactions(items)).toEqual(items);
  });

  it('matches the query against the category name and the note, ignoring case and outer spaces', () => {
    expect(filterTransactions(items, { query: '  bts ' }).map((item) => item.id)).toEqual(['2']);
    expect(filterTransactions(items, { query: 'อาหาร' }).map((item) => item.id)).toEqual(['1', '4']);
    expect(filterTransactions(items, { query: 'ไก่' }).map((item) => item.id)).toEqual(['1']);
  });

  it('filters by category and by type and combines the conditions', () => {
    expect(filterTransactions(items, { categoryId: 'c-food' }).map((item) => item.id)).toEqual(['1', '4']);
    expect(filterTransactions(items, { type: 'income' }).map((item) => item.id)).toEqual(['3']);
    expect(filterTransactions(items, { type: 'expense', categoryId: 'c-food', query: 'ข้าว' }).map((item) => item.id)).toEqual(['1']);
    expect(filterTransactions(items, { type: 'income', categoryId: 'c-food' })).toEqual([]);
  });

  it('handles a missing note without throwing', () => {
    expect(filterTransactions(items, { query: 'null' })).toEqual([]);
  });
});

describe('isFilterActive', () => {
  it('is false for empty or whitespace-only filters', () => {
    expect(isFilterActive({ query: '', categoryId: '', type: '' })).toBe(false);
    expect(isFilterActive({ query: '   ', categoryId: '', type: '' })).toBe(false);
  });

  it('is true when any field is set', () => {
    expect(isFilterActive({ query: 'a', categoryId: '', type: '' })).toBe(true);
    expect(isFilterActive({ query: '', categoryId: 'c1', type: '' })).toBe(true);
    expect(isFilterActive({ query: '', categoryId: '', type: 'income' })).toBe(true);
  });
});

describe('describeFilterResult', () => {
  it('reports shown and total counts', () => {
    expect(describeFilterResult(3, 20, false)).toBe('พบ 3 จาก 20 รายการ');
  });

  it('warns that only the displayed entries were searched when the month is truncated', () => {
    expect(describeFilterResult(0, 500, true)).toBe('พบ 0 จาก 500 รายการ (ค้นเฉพาะรายการที่แสดง)');
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/format.test.mjs`
Expected: FAIL (`filterTransactions is not a function` หรือ import ไม่เจอ)

- [ ] **Step 3: เพิ่มใน `public/liff/format.mjs`** ต่อท้ายไฟล์

```js
export function filterTransactions(transactions, { query = '', categoryId = '', type = '' } = {}) {
  const needle = query.trim().toLowerCase();
  return transactions.filter((item) => {
    if (type && item.type !== type) return false;
    if (categoryId && item.categoryId !== categoryId) return false;
    if (!needle) return true;
    return `${item.categoryName} ${item.note || ''}`.toLowerCase().includes(needle);
  });
}

export function isFilterActive({ query, categoryId, type }) {
  return Boolean(query.trim() || categoryId || type);
}

export function describeFilterResult(shown, total, truncated) {
  const text = `พบ ${shown} จาก ${total} รายการ`;
  return truncated ? `${text} (ค้นเฉพาะรายการที่แสดง)` : text;
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/format.test.mjs`
Expected: PASS

- [ ] **Step 5: เพิ่ม UI ใน `index.html`** ใน `div#panel-list` ต่อจาก `p#truncated` และก่อน `p#status`

```html
      <div id="filters" class="filters" hidden>
        <input type="search" id="search" placeholder="ค้นหาจากหมวดหรือโน้ต" aria-label="ค้นหารายการ" maxlength="50">
        <select id="filter-type" aria-label="กรองตามประเภท">
          <option value="">ทุกประเภท</option>
          <option value="expense">รายจ่าย</option>
          <option value="income">รายรับ</option>
        </select>
        <select id="filter-category" aria-label="กรองตามหมวด"></select>
        <button type="button" id="filter-clear" hidden>ล้างตัวกรอง</button>
        <p id="filter-status" class="filter-status" role="status" aria-live="polite"></p>
      </div>
```

- [ ] **Step 6: แก้ `app.mjs`**

(ก) import เพิ่มในรายการจาก `format.mjs`: `filterTransactions, isFilterActive, describeFilterResult,`
(ข) `els` เพิ่ม:
```js
  filters: document.getElementById('filters'),
  search: document.getElementById('search'),
  filterType: document.getElementById('filter-type'),
  filterCategory: document.getElementById('filter-category'),
  filterClear: document.getElementById('filter-clear'),
  filterStatus: document.getElementById('filter-status'),
```
(ค) ตัวแปรสถานะ ต่อจาก `let lastSummary = [];`:
```js
let lastTransactions = [];
let lastTruncated = false;
```
(ง) `fillCategoryOptions()`: ต่อท้าย function (ก่อนปีกกาปิด) เพิ่มตัวเลือกของตัวกรองหมวด โดยจำค่าที่เลือกไว้
```js
  const selected = els.filterCategory.value;
  els.filterCategory.replaceChildren(new Option('ทุกหมวด', ''));
  for (const type of ['expense', 'income']) {
    const group = document.createElement('optgroup');
    group.label = TYPE_LABELS[type];
    for (const category of groups[type]) {
      const option = document.createElement('option');
      option.value = category.id;
      option.textContent = category.name;
      group.append(option);
    }
    els.filterCategory.append(group);
  }
  els.filterCategory.value = selected;
```
(จ) แยกส่วนวาดรายการออกจาก `render(...)`: ใน `render({ transactions, summary, truncated })` แทนที่ตั้งแต่บรรทัด `els.list.replaceChildren();` จนจบ function ด้วยการเก็บสถานะแล้วเรียก `renderList()` แล้วเพิ่ม function ใหม่ `renderList` ตามนี้

ใน `render` (ต่อจาก `renderChart();`):
```js
  lastTransactions = transactions;
  lastTruncated = truncated;
  renderList();
}

function currentFilter() {
  return { query: els.search.value, categoryId: els.filterCategory.value, type: els.filterType.value };
}

function renderList() {
  const filter = currentFilter();
  const active = isFilterActive(filter);
  const shown = filterTransactions(lastTransactions, filter);
  els.list.replaceChildren();
  // ซ่อนตัวกรองเมื่อเดือนว่างและไม่ได้กรองอยู่ ไม่งั้นผู้ใช้ติดค้างโดยล้างตัวกรองไม่ได้
  els.filters.hidden = lastTransactions.length === 0 && !active;
  els.filterClear.hidden = !active;
  els.filterStatus.textContent = active ? describeFilterResult(shown.length, lastTransactions.length, lastTruncated) : '';
  if (lastTransactions.length === 0) {
    setStatus('');
    els.list.append(createEmptyState(document, 'list', 'li'));
    return;
  }
  if (shown.length === 0) {
    setStatus('');
    els.list.append(createEmptyState(document, 'search', 'li'));
    return;
  }
  setStatus('');
  let rowIndex = 0;
  for (const group of groupByDate(shown)) {
    const heading = document.createElement('li');
    heading.className = 'day';
    heading.textContent = formatThaiDate(group.date);
    els.list.append(heading);
    for (const item of group.items) {
      const rowEl = renderRow(item);
      rowEl.style.setProperty('--i', String(Math.min(rowIndex, 10)));
      rowIndex += 1;
      els.list.append(rowEl);
    }
  }
}
```
(ฉ) ผูก event ต่อจากบรรทัด `els.month.addEventListener('change', ...)`:
```js
for (const control of [els.search, els.filterType, els.filterCategory]) {
  control.addEventListener('input', renderList);
}
els.filterClear.addEventListener('click', () => {
  els.search.value = '';
  els.filterType.value = '';
  els.filterCategory.value = '';
  renderList();
  els.search.focus();
});
```
(ช) ใน `loadMonth({ reset: true })` เพิ่ม `els.filters.hidden = true;` ต่อจาก `els.truncated.hidden = true;` (กันตัวกรองเก่าโผล่ระหว่างโหลด)

- [ ] **Step 7: ต่อท้าย `style.css`**

```css
.filters { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 16px 0; }
.filters input, .filters select { min-height: 44px; padding: 8px 10px; font: inherit; font-size: 16px; color: var(--text); background: var(--surface); border: 1px solid var(--outline); border-radius: 8px; }
.filters input[type="search"] { grid-column: 1 / -1; }
#filter-clear { grid-column: 1 / -1; min-height: 44px; font: inherit; color: var(--primary); background: none; border: 1px solid var(--primary); border-radius: 8px; }
.filter-status { grid-column: 1 / -1; margin: 0; font-size: 13px; color: var(--muted); }
```

- [ ] **Step 8: ตรวจและรันทั้งชุด**

Run: `node --check public/liff/app.mjs`
Expected: ผ่าน
Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: เหมือน Task 5; เดือนนี้มีรายการอย่างน้อย 5 รายการหลายหมวด มีโน้ตต่างกัน

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ รายการ | เห็นช่องค้นหา ตัวเลือก ทุกประเภท และ ทุกหมวด เหนือรายการ |
| 2 | พิมพ์คำที่อยู่ในโน้ตของรายการหนึ่ง | เหลือเฉพาะรายการที่ตรง ข้อความใต้ช่องบอก พบ N จาก M รายการ และมีปุ่ม ล้างตัวกรอง |
| 3 | เลือกประเภท รายรับ | เหลือเฉพาะรายรับ |
| 4 | พิมพ์คำที่ไม่มีใครตรง | เห็นภาพแว่นขยาย + ข้อความ ไม่พบรายการที่ค้นหา |
| 5 | กด ล้างตัวกรอง | รายการกลับมาครบ ช่องค้นหาว่าง โฟกัสอยู่ที่ช่องค้นหา |
| 6 | ค้นหาแล้วกดแก้ไขรายการ บันทึก | หลังบันทึกยังคงตัวกรองเดิมไว้ |
| 7 | เปลี่ยนเดือน | ตัวกรองเก่ายังอยู่ (คำค้นยังใช้กับเดือนใหม่) ผลตรงกับเดือนใหม่ |

- [ ] **Step 10: Commit**

```bash
git add public/liff/format.mjs public/liff/format.test.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css
git commit -m "feat: add search and filters to LIFF transaction list"
```

---

### Task 10: กราฟแนวโน้ม 6 เดือน และเทียบเดือนก่อน (แท็บสรุป)

**Depends on:** Task 2, Task 9

**Files:**
- Modify: `public/liff/format.mjs`, Test: `public/liff/format.test.mjs`
- Modify: `public/liff/index.html`, `public/liff/app.mjs`, `public/liff/style.css`

**Interfaces:**
- Consumes: `api.getTrend(month)` -> `{ months: [{ month, income, expense }] }` (Task 2); `growBar(win, el, percent, 'height')` (Task 8); `createLoadingIndicator` (Task 7)
- Produces:
  - `thaiMonthShort('2026-09')` = `'ก.ย.'`
  - `formatFullThaiDate('2026-09-05')` = `'5 ก.ย. 2569'` (ใช้ใน Task 11)
  - `trendBars(months): Array<{ month, label, income, expense, incomeHeight, expenseHeight, description }>` ความสูงเป็น % เทียบค่าสูงสุดของทั้งช่วง (ค่ามากกว่า 0 ได้อย่างน้อย 2%, ค่า 0 = 0)
  - `describeExpenseComparison(months): { level: 'up' | 'down' | 'same' | 'none', text }` เทียบรายจ่ายเดือนสุดท้ายกับเดือนก่อนหน้า (คิดเป็นสตางค์)
  - id ใหม่ใน HTML: `trend` (section), `trend-bars` (ul), `trend-comparison` (p), `trend-loading` (p sr-only), `trend-skeleton` (ul), `trend-error`, `trend-error-text`, `trend-retry`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลวก่อน** เพิ่ม import `thaiMonthShort, formatFullThaiDate, trendBars, describeExpenseComparison` ใน `format.test.mjs` แล้วต่อท้ายไฟล์

```js
describe('thaiMonthShort and formatFullThaiDate', () => {
  it('abbreviates the month in Thai', () => {
    expect(thaiMonthShort('2026-01')).toBe('ม.ค.');
    expect(thaiMonthShort('2026-09')).toBe('ก.ย.');
    expect(thaiMonthShort('2026-12')).toBe('ธ.ค.');
  });

  it('writes a full date with the Buddhist year and no leading zero on the day', () => {
    expect(formatFullThaiDate('2026-09-05')).toBe('5 ก.ย. 2569');
    expect(formatFullThaiDate('2025-12-31')).toBe('31 ธ.ค. 2568');
  });
});

describe('trendBars', () => {
  const months = [
    { month: '2026-07', income: 0, expense: 0 },
    { month: '2026-08', income: 20000, expense: 5000 },
    { month: '2026-09', income: 10000, expense: 10000 },
  ];

  it('scales every bar against the largest value of the window', () => {
    const bars = trendBars(months);

    expect(bars.map((bar) => bar.label)).toEqual(['ก.ค.', 'ส.ค.', 'ก.ย.']);
    expect(bars[1].incomeHeight).toBe(100);
    expect(bars[1].expenseHeight).toBe(25);
    expect(bars[2].incomeHeight).toBe(50);
    expect(bars[2].expenseHeight).toBe(50);
  });

  it('keeps zero as zero and gives tiny non-zero values a visible minimum', () => {
    const bars = trendBars([
      { month: '2026-08', income: 0, expense: 0 },
      { month: '2026-09', income: 1000000, expense: 1 },
    ]);

    expect(bars[0].incomeHeight).toBe(0);
    expect(bars[0].expenseHeight).toBe(0);
    expect(bars[1].expenseHeight).toBe(2);
  });

  it('gives all zero heights when the whole window is empty', () => {
    const bars = trendBars([{ month: '2026-09', income: 0, expense: 0 }]);

    expect(bars[0].incomeHeight).toBe(0);
    expect(bars[0].expenseHeight).toBe(0);
  });

  it('describes each month in words for screen readers', () => {
    expect(trendBars(months)[1].description).toBe('ส.ค. รายรับ 20,000 บาท รายจ่าย 5,000 บาท');
  });
});

describe('describeExpenseComparison', () => {
  const pair = (previous, current) => [
    { month: '2026-08', income: 0, expense: previous },
    { month: '2026-09', income: 0, expense: current },
  ];

  it('reports an increase with percent and amount', () => {
    expect(describeExpenseComparison(pair(1000, 1250))).toEqual({
      level: 'up',
      text: 'รายจ่ายมากกว่าเดือนก่อน 25% (+250 บาท)',
    });
  });

  it('reports a decrease with percent and amount', () => {
    expect(describeExpenseComparison(pair(1000, 400.5))).toEqual({
      level: 'down',
      text: 'รายจ่ายน้อยกว่าเดือนก่อน 60% (-599.5 บาท)',
    });
  });

  it('reports equal spending', () => {
    expect(describeExpenseComparison(pair(300, 300))).toEqual({ level: 'same', text: 'รายจ่ายเท่ากับเดือนก่อน' });
  });

  it('cannot compare when the previous month had no expenses', () => {
    expect(describeExpenseComparison(pair(0, 500))).toEqual({ level: 'none', text: 'เดือนก่อนไม่มีรายจ่ายให้เทียบ' });
  });

  it('has nothing to compare with fewer than two months', () => {
    expect(describeExpenseComparison([{ month: '2026-09', income: 0, expense: 5 }])).toEqual({ level: 'none', text: '' });
  });

  it('compares in satang so decimals do not drift', () => {
    expect(describeExpenseComparison(pair(0.1, 0.3)).text).toBe('รายจ่ายมากกว่าเดือนก่อน 200% (+0.2 บาท)');
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/format.test.mjs`
Expected: FAIL (function ยังไม่มี)

- [ ] **Step 3: เพิ่มใน `public/liff/format.mjs`** ต่อท้ายไฟล์

```js
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export function thaiMonthShort(month) {
  return THAI_MONTHS[Number(month.split('-')[1]) - 1];
}

export function formatFullThaiDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${Number(day)} ${thaiMonthShort(`${year}-${month}`)} ${Number(year) + 543}`;
}

// ค่าที่มากกว่า 0 แต่เล็กมากต้องยังเห็นเป็นแท่ง ไม่ให้ดูเหมือนไม่มียอด
function barHeight(value, max) {
  if (max === 0 || value <= 0) return 0;
  return Math.max((value / max) * 100, 2);
}

export function trendBars(months) {
  const max = Math.max(0, ...months.flatMap((entry) => [entry.income, entry.expense]));
  return months.map((entry) => {
    const label = thaiMonthShort(entry.month);
    return {
      month: entry.month,
      label,
      income: entry.income,
      expense: entry.expense,
      incomeHeight: barHeight(entry.income, max),
      expenseHeight: barHeight(entry.expense, max),
      description: `${label} รายรับ ${formatBaht(entry.income)} รายจ่าย ${formatBaht(entry.expense)}`,
    };
  });
}

// เทียบเป็นสตางค์เพื่อไม่ให้ทศนิยมลอยตัวทำให้เปอร์เซ็นต์เพี้ยน
export function describeExpenseComparison(months) {
  if (months.length < 2) return { level: 'none', text: '' };
  const current = Math.round(months[months.length - 1].expense * 100);
  const previous = Math.round(months[months.length - 2].expense * 100);
  if (previous === 0) return { level: 'none', text: 'เดือนก่อนไม่มีรายจ่ายให้เทียบ' };
  const diff = current - previous;
  if (diff === 0) return { level: 'same', text: 'รายจ่ายเท่ากับเดือนก่อน' };
  const percent = Math.round((Math.abs(diff) / previous) * 100);
  const amount = formatBaht(Math.abs(diff) / 100);
  return diff > 0
    ? { level: 'up', text: `รายจ่ายมากกว่าเดือนก่อน ${percent}% (+${amount})` }
    : { level: 'down', text: `รายจ่ายน้อยกว่าเดือนก่อน ${percent}% (-${amount})` };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/format.test.mjs`
Expected: PASS

- [ ] **Step 5: เพิ่มส่วนกราฟใน `index.html`** ใน `div#panel-summary` ต่อจาก `section#chart` และก่อน `div#summary-empty`

```html
      <section id="trend" class="trend" aria-labelledby="trend-title">
        <h2 id="trend-title">แนวโน้ม 6 เดือนล่าสุด</h2>
        <p id="trend-comparison" class="trend-comparison" hidden></p>
        <p id="trend-loading" class="sr-only" role="status">กำลังโหลดกราฟแนวโน้ม...</p>
        <ul id="trend-skeleton" class="skeleton-list" aria-hidden="true"></ul>
        <ul id="trend-bars" class="trend-bars" hidden></ul>
        <p id="trend-legend" class="trend-legend" hidden><span class="legend income">รายรับ</span><span class="legend expense">รายจ่าย</span></p>
        <div id="trend-error" class="budgets-error" hidden>
          <p id="trend-error-text"></p>
          <button type="button" id="trend-retry">ลองใหม่</button>
        </div>
      </section>
```

- [ ] **Step 6: แก้ `app.mjs`**

(ก) import เพิ่มจาก `format.mjs`: `trendBars, describeExpenseComparison,`
(ข) `els` เพิ่ม:
```js
  trendBars: document.getElementById('trend-bars'),
  trendComparison: document.getElementById('trend-comparison'),
  trendLegend: document.getElementById('trend-legend'),
  trendLoading: document.getElementById('trend-loading'),
  trendSkeleton: document.getElementById('trend-skeleton'),
  trendError: document.getElementById('trend-error'),
  trendErrorText: document.getElementById('trend-error-text'),
  trendRetry: document.getElementById('trend-retry'),
```
(ค) ต่อจาก `const recurringLoading = ...`:
```js
const trendGuard = createLatestGuard();
const trendLoading = createLoadingIndicator({ doc: document, textEl: els.trendLoading, skeletonEl: els.trendSkeleton, count: 1, variant: 'card' });
```
(ง) เพิ่ม function ต่อจาก `loadBudgets`:
```js
function renderTrend(months, currentMonthKey) {
  trendLoading.set(false);
  els.trendError.hidden = true;
  els.trendBars.replaceChildren();
  for (const bar of trendBars(months)) {
    const item = document.createElement('li');
    item.className = `trend-col${bar.month === currentMonthKey ? ' current' : ''}`;
    const pair = document.createElement('div');
    pair.className = 'trend-pair';
    pair.setAttribute('aria-hidden', 'true');
    const income = document.createElement('span');
    income.className = 'trend-bar income';
    const expense = document.createElement('span');
    expense.className = 'trend-bar expense';
    growBar(window, income, bar.incomeHeight, 'height');
    growBar(window, expense, bar.expenseHeight, 'height');
    pair.append(income, expense);
    const label = document.createElement('span');
    label.className = 'trend-label';
    label.setAttribute('aria-hidden', 'true');
    label.textContent = bar.label;
    const description = document.createElement('span');
    description.className = 'sr-only';
    description.textContent = bar.description;
    item.append(pair, label, description);
    els.trendBars.append(item);
  }
  els.trendBars.hidden = false;
  els.trendLegend.hidden = false;
  const comparison = describeExpenseComparison(months);
  els.trendComparison.textContent = comparison.text;
  els.trendComparison.className = `trend-comparison ${comparison.level}`;
  els.trendComparison.hidden = !comparison.text;
}

function showTrendError(err) {
  trendLoading.set(false);
  els.trendBars.hidden = true;
  els.trendLegend.hidden = true;
  els.trendComparison.hidden = true;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.trendErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดกราฟแนวโน้มไม่สำเร็จ';
  els.trendRetry.hidden = loginRequired;
  els.trendError.hidden = false;
}

// กราฟแนวโน้มโหลดแยกจากรายการ ถ้าพังส่วนอื่นยังใช้ได้ และไม่ throw
async function loadTrend() {
  const month = els.month.value;
  const requestId = trendGuard.start();
  const isCurrent = () => month === els.month.value && trendGuard.isCurrent(requestId);
  try {
    const { months } = await api.getTrend(month);
    if (isCurrent()) renderTrend(months, month);
  } catch (err) {
    if (isCurrent()) showTrendError(err);
  }
}
```
(จ) `loadMonth`: ใน `if (reset) { ... }` เพิ่ม
```js
    els.trendBars.hidden = true;
    els.trendLegend.hidden = true;
    els.trendComparison.hidden = true;
    els.trendError.hidden = true;
    trendLoading.set(true);
```
และต่อจาก `const budgetsLoaded = loadBudgets();` เพิ่ม `const trendLoaded = loadTrend();` และต่อจาก `await budgetsLoaded;` เพิ่ม `await trendLoaded;`
(ฉ) ผูกปุ่มลองใหม่ ต่อจาก handler ของ `els.budgetsRetry`:
```js
els.trendRetry.addEventListener('click', () => {
  els.trendError.hidden = true;
  trendLoading.set(true);
  loadTrend();
});
```

- [ ] **Step 7: ต่อท้าย `style.css`**

```css
.trend { margin: 12px 16px 0; padding: 12px; background: var(--surface); border-radius: 8px; }
.trend h2 { margin: 0; font-size: 16px; }
.trend-comparison { margin: 8px 0 0; padding: 6px 10px; font-size: 14px; border-radius: 8px; background: var(--track); color: var(--text); }
.trend-comparison.up { color: var(--danger); }
.trend-comparison.down { color: var(--primary); }
.trend-bars { display: flex; align-items: flex-end; gap: 6px; height: 140px; margin: 12px 0 0; padding: 0; list-style: none; }
.trend-col { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
.trend-pair { display: flex; align-items: flex-end; justify-content: center; gap: 3px; width: 100%; flex: 1; }
.trend-bar { display: block; width: 40%; max-width: 14px; border-radius: 4px 4px 0 0; transition: height 0.5s ease-out; }
.trend-bar.income { background: var(--primary); }
.trend-bar.expense { background: var(--danger); }
.trend-label { margin-top: 4px; font-size: 12px; color: var(--muted); }
.trend-col.current .trend-label { color: var(--text); font-weight: 700; }
.trend-legend { display: flex; justify-content: center; gap: 16px; margin: 8px 0 0; font-size: 12px; color: var(--muted); }
.legend::before { content: ""; display: inline-block; width: 10px; height: 10px; margin-right: 4px; border-radius: 2px; }
.legend.income::before { background: var(--primary); }
.legend.expense::before { background: var(--danger); }
#trend-retry { font: inherit; min-height: 44px; padding: 10px 16px; font-size: 16px; border: 1px solid var(--primary); border-radius: 8px; background: var(--surface); color: var(--primary); }
```

- [ ] **Step 8: ตรวจและรันทั้งชุด**

Run: `node --check public/liff/app.mjs`
Expected: ผ่าน
Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: เหมือน Task 5; ผู้ใช้ restart `npm start` และ **รัน `supabase/010_profile_and_trend.sql` แล้ว** (ไม่งั้นกราฟจะขึ้นข้อความโหลดไม่สำเร็จ)

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ สรุป | เห็นหัวข้อ แนวโน้ม 6 เดือนล่าสุด แท่งคู่ (เขียว = รายรับ แดง = รายจ่าย) 6 เดือน เดือนที่เลือกตัวหนังสือหนา แท่งค่อยๆ สูงขึ้น |
| 2 | ดูข้อความเหนือกราฟ | มีประโยคเทียบ เช่น รายจ่ายมากกว่า/น้อยกว่าเดือนก่อน N% (ยอด) หรือ เดือนก่อนไม่มีรายจ่ายให้เทียบ ตรงกับตัวเลขจริงที่ผู้ใช้คำนวณเอง |
| 3 | เปลี่ยนเดือนเป็นเดือนก่อน | กราฟเลื่อนช่วงไป 6 เดือนที่ลงท้ายด้วยเดือนนั้น |
| 4 | ปิดเครือข่ายแล้วเปลี่ยนเดือน | ส่วนกราฟขึ้น โหลดกราฟแนวโน้มไม่สำเร็จ + ปุ่ม ลองใหม่ ส่วนอื่นของหน้ายังใช้ได้ |

- [ ] **Step 10: Commit**

```bash
git add public/liff/format.mjs public/liff/format.test.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css
git commit -m "feat: add 6-month trend chart and month comparison to summary tab"
```

---

### Task 11: แท็บโปรไฟล์ (ยอดเงินคงเหลือ)

**Depends on:** Task 2, Task 10

**Files:**
- Modify: `public/liff/format.mjs`, Test: `public/liff/format.test.mjs`
- Modify: `public/liff/index.html`, `public/liff/app.mjs`, `public/liff/style.css`

**Interfaces:**
- Consumes: `api.getProfile()` (Task 2), `formatFullThaiDate` (Task 10), `animateNumber` และ `showAmount` (Task 8), `createLoadingIndicator` (Task 7)
- Produces:
  - `profileView(profile): { name, initial, balance, balanceText, negative, incomeText, expenseText, countText, sinceText }`
    - `name` = ชื่อที่ trim แล้ว หรือ `'ผู้ใช้'` ถ้าว่าง/null; `initial` = ตัวอักษรแรกของชื่อ (นับตาม code point, ตัวพิมพ์ใหญ่); `countText` = `'12 รายการ'` (คั่นหลักพัน); `sinceText` = `'เริ่มบันทึกตั้งแต่ 3 ส.ค. 2569'` หรือ `'ยังไม่เคยบันทึกรายการ'`
  - id ใหม่ใน HTML: `profile-card`, `profile-avatar`, `profile-name`, `profile-since`, `profile-balance`, `profile-income`, `profile-expense`, `profile-count`, `profile-loading`, `profile-skeleton`, `profile-error`, `profile-error-text`, `profile-retry`, `profile-close`

- [ ] **Step 1: เขียนเทสต์ที่ล้มเหลวก่อน** เพิ่ม import `profileView` แล้วต่อท้าย `format.test.mjs`

```js
describe('profileView', () => {
  const profile = {
    displayName: '  สมชาย ใจดี ',
    income: 25000,
    expense: 1234.5,
    balance: 23765.5,
    entryCount: 1234,
    firstDate: '2026-08-03',
  };

  it('builds the display texts', () => {
    expect(profileView(profile)).toEqual({
      name: 'สมชาย ใจดี',
      initial: 'ส',
      balance: 23765.5,
      balanceText: '23,765.5 บาท',
      negative: false,
      incomeText: '25,000 บาท',
      expenseText: '1,234.5 บาท',
      countText: '1,234 รายการ',
      sinceText: 'เริ่มบันทึกตั้งแต่ 3 ส.ค. 2569',
    });
  });

  it('marks a negative balance', () => {
    const view = profileView({ ...profile, income: 100, expense: 250.5, balance: -150.5 });

    expect(view.negative).toBe(true);
    expect(view.balanceText).toBe('-150.5 บาท');
  });

  it('falls back to a generic name when the name is missing or blank', () => {
    expect(profileView({ ...profile, displayName: null }).name).toBe('ผู้ใช้');
    expect(profileView({ ...profile, displayName: '   ' }).name).toBe('ผู้ใช้');
    expect(profileView({ ...profile, displayName: null }).initial).toBe('ผ');
  });

  it('takes the first code point as the initial so an emoji name is not split', () => {
    expect(profileView({ ...profile, displayName: 'abc' }).initial).toBe('A');
    expect(profileView({ ...profile, displayName: '\u{1F600} Sam' }).initial).toBe('\u{1F600}');
  });

  it('handles a user without any entries', () => {
    const view = profileView({ displayName: null, income: 0, expense: 0, balance: 0, entryCount: 0, firstDate: null });

    expect(view.sinceText).toBe('ยังไม่เคยบันทึกรายการ');
    expect(view.countText).toBe('0 รายการ');
    expect(view.balanceText).toBe('0 บาท');
    expect(view.negative).toBe(false);
  });
});
```

- [ ] **Step 2: รันให้เห็นล้มเหลว**

Run: `npx vitest run public/liff/format.test.mjs`
Expected: FAIL (`profileView` ไม่มี)

- [ ] **Step 3: เพิ่มใน `public/liff/format.mjs`** ต่อท้ายไฟล์

```js
export function profileView(profile) {
  const name = (profile.displayName || '').trim() || 'ผู้ใช้';
  return {
    name,
    // Array.from นับตาม code point ชื่อที่ขึ้นต้นด้วย emoji จะไม่ถูกตัดครึ่ง
    initial: Array.from(name)[0].toUpperCase(),
    balance: profile.balance,
    balanceText: formatBaht(profile.balance),
    negative: profile.balance < 0,
    incomeText: formatBaht(profile.income),
    expenseText: formatBaht(profile.expense),
    countText: `${profile.entryCount.toLocaleString('en-US')} รายการ`,
    sinceText: profile.firstDate ? `เริ่มบันทึกตั้งแต่ ${formatFullThaiDate(profile.firstDate)}` : 'ยังไม่เคยบันทึกรายการ',
  };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/format.test.mjs`
Expected: PASS

- [ ] **Step 5: เติม `div#panel-profile` ใน `index.html`** (แทนที่ `<div id="panel-profile" class="panel" hidden></div>`)

```html
    <div id="panel-profile" class="panel" hidden>
      <p id="profile-loading" class="sr-only" role="status">กำลังโหลดโปรไฟล์...</p>
      <ul id="profile-skeleton" class="skeleton-list skeleton-padded" aria-hidden="true"></ul>
      <div id="profile-error" class="budgets-error profile-error" hidden>
        <p id="profile-error-text"></p>
        <button type="button" id="profile-retry">ลองใหม่</button>
      </div>
      <section id="profile-card" class="profile-card" aria-labelledby="profile-name" hidden>
        <div class="profile-head">
          <span id="profile-avatar" class="profile-avatar" aria-hidden="true"></span>
          <div>
            <h2 id="profile-name" class="profile-name"></h2>
            <p id="profile-since" class="profile-since"></p>
          </div>
        </div>
        <div class="balance-card">
          <span class="stat-label">ยอดเงินคงเหลือ</span>
          <span id="profile-balance" class="balance-value"></span>
          <span class="balance-note">รายรับ - รายจ่าย ทุกรายการที่บันทึกในบอทตั้งแต่เริ่ม ไม่ใช่ยอดเงินในบัญชีจริง</span>
        </div>
        <div class="profile-stats">
          <div class="stat income"><span class="stat-label">รายรับสะสม</span><span id="profile-income" class="stat-value"></span></div>
          <div class="stat expense"><span class="stat-label">รายจ่ายสะสม</span><span id="profile-expense" class="stat-value"></span></div>
          <div class="stat"><span class="stat-label">จำนวนรายการ</span><span id="profile-count" class="stat-value"></span></div>
        </div>
        <section class="profile-tips" aria-labelledby="tips-title">
          <h3 id="tips-title">วิธีใช้บอท</h3>
          <ul>
            <li>พิมพ์รายการในแชต เช่น "กินข้าว 60 กาแฟ 45" บอทบันทึกให้ทันที</li>
            <li>พิมพ์ "สรุป" เพื่อดูยอดวันนี้ สัปดาห์นี้ หรือเดือนนี้</li>
            <li>ส่งรูปสลิปหรือใบเสร็จ บอทอ่านยอดแล้วถามยืนยันก่อนบันทึก</li>
            <li>บันทึกผิด กดปุ่มยกเลิกใต้ข้อความตอบกลับได้เลย</li>
          </ul>
        </section>
        <button type="button" id="profile-close" class="profile-close">กลับไปแชต</button>
      </section>
    </div>
```

- [ ] **Step 6: แก้ `app.mjs`**

(ก) import เพิ่มจาก `format.mjs`: `profileView,`
(ข) `els` เพิ่ม:
```js
  profileCard: document.getElementById('profile-card'),
  profileAvatar: document.getElementById('profile-avatar'),
  profileName: document.getElementById('profile-name'),
  profileSince: document.getElementById('profile-since'),
  profileBalance: document.getElementById('profile-balance'),
  profileIncome: document.getElementById('profile-income'),
  profileExpense: document.getElementById('profile-expense'),
  profileCount: document.getElementById('profile-count'),
  profileLoading: document.getElementById('profile-loading'),
  profileSkeleton: document.getElementById('profile-skeleton'),
  profileError: document.getElementById('profile-error'),
  profileErrorText: document.getElementById('profile-error-text'),
  profileRetry: document.getElementById('profile-retry'),
  profileClose: document.getElementById('profile-close'),
```
(ค) ต่อจาก `const trendLoading = ...`:
```js
const profileGuard = createLatestGuard();
const profileLoading = createLoadingIndicator({ doc: document, textEl: els.profileLoading, skeletonEl: els.profileSkeleton, count: 1, variant: 'card' });
```
(ง) ต่อจาก `loadTrend`:
```js
function renderProfile(profile) {
  const view = profileView(profile);
  profileLoading.set(false);
  els.profileError.hidden = true;
  els.profileAvatar.textContent = view.initial;
  els.profileName.textContent = view.name;
  els.profileSince.textContent = view.sinceText;
  showAmount(els.profileBalance, view.balance);
  els.profileBalance.classList.toggle('negative', view.negative);
  els.profileIncome.textContent = view.incomeText;
  els.profileExpense.textContent = view.expenseText;
  els.profileCount.textContent = view.countText;
  els.profileCard.hidden = false;
}

function showProfileError(err) {
  profileLoading.set(false);
  els.profileCard.hidden = true;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.profileErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดโปรไฟล์ไม่สำเร็จ';
  els.profileRetry.hidden = loginRequired;
  els.profileError.hidden = false;
}

// ยอดสะสมไม่ผูกกับเดือน โหลดแยกและไม่ throw
async function loadProfile() {
  const requestId = profileGuard.start();
  try {
    const profile = await api.getProfile();
    if (profileGuard.isCurrent(requestId)) renderProfile(profile);
  } catch (err) {
    if (profileGuard.isCurrent(requestId)) showProfileError(err);
  }
}
```
(จ) ผูกปุ่ม ต่อจาก handler ของ `els.trendRetry`:
```js
els.profileRetry.addEventListener('click', () => {
  els.profileError.hidden = true;
  profileLoading.set(true);
  loadProfile();
});
// closeWindow ใช้ได้เฉพาะในแอป LINE
els.profileClose.addEventListener('click', () => liff.closeWindow());
```
(ฉ) `boot()`: เปลี่ยน `await Promise.all([loadMonth({ reset: true }), loadRecurring()]);` เป็น `await Promise.all([loadMonth({ reset: true }), loadRecurring(), loadProfile()]);`
(ช) `runEdit(...)`: ยอดสะสมเปลี่ยนเมื่อแก้/ลบรายการ ให้โหลดโปรไฟล์ใหม่ ใน 2 จุดที่เรียก `await loadMonth();` (กรณีสำเร็จ และกรณี `failure.closeAndReload`) เพิ่มบรรทัด `loadProfile();` ต่อจาก `await loadMonth();` ทั้งสองจุด (ไม่ต้อง await ให้ UI ไม่ช้า)

- [ ] **Step 7: ต่อท้าย `style.css`**

```css
.profile-card { margin: 12px 16px 0; }
.profile-head { display: flex; align-items: center; gap: 12px; }
.profile-avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 56px; height: 56px; border-radius: 50%; font-size: 24px; font-weight: 700; background: var(--primary); color: var(--on-primary); }
.profile-name { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.profile-since { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
.balance-card { display: flex; flex-direction: column; gap: 4px; margin-top: 16px; padding: 16px; background: var(--surface); border-radius: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
.balance-value { font-size: 28px; font-weight: 700; color: var(--primary); overflow-wrap: anywhere; }
.balance-value.negative { color: var(--danger); }
.balance-note { font-size: 12px; color: var(--muted); }
.profile-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.profile-tips { margin-top: 16px; padding: 12px 16px; background: var(--surface); border-radius: 12px; }
.profile-tips h3 { margin: 0 0 4px; font-size: 14px; }
.profile-tips ul { margin: 0; padding-left: 18px; font-size: 13px; color: var(--muted); }
.profile-tips li { margin-top: 4px; }
.profile-close, #profile-retry { width: 100%; margin-top: 16px; min-height: 44px; font: inherit; font-size: 16px; color: var(--primary); background: var(--surface); border: 1px solid var(--primary); border-radius: 8px; }
.profile-error { margin: 12px 16px 0; }
```

- [ ] **Step 8: ตรวจและรันทั้งชุด**

Run: `node --check public/liff/app.mjs`
Expected: ผ่าน
Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 9: Browser check (ผู้ใช้ทำในแอป LINE)**
- Preconditions: เหมือน Task 10 (รัน 010 แล้ว); ผู้ใช้รู้ยอดรายรับรวมและรายจ่ายรวมทั้งหมดจาก Supabase Table Editor

| # | Action | Expected |
|---|---|---|
| 1 | กดแท็บ โปรไฟล์ | เห็นวงกลมตัวอักษรแรกของชื่อ LINE, ชื่อ, ข้อความ เริ่มบันทึกตั้งแต่ <วันที่รายการแรก ปี พ.ศ.> |
| 2 | ดูการ์ดยอดเงินคงเหลือ | ตัวเลขใหญ่นับขึ้นจาก 0 เท่ากับ รายรับรวม - รายจ่ายรวม ที่ผู้ใช้คำนวณเอง; มีข้อความกำกับว่าไม่ใช่ยอดบัญชีจริง |
| 3 | ดู 3 การ์ดเล็ก | รายรับสะสม รายจ่ายสะสม จำนวนรายการ ตรงกับ Table Editor |
| 4 | กลับแท็บ รายการ ลบรายการรายจ่าย 1 รายการ แล้วเปิดแท็บ โปรไฟล์ | ยอดคงเหลือเพิ่มขึ้นเท่ากับยอดรายการที่ลบ จำนวนรายการลดลง 1 |
| 5 | กด กลับไปแชต | หน้า LIFF ปิด กลับมาที่แชต |
| 6 | ปิดเครือข่ายแล้วเปิดหน้าใหม่ แล้วเปิดแท็บ โปรไฟล์ | เห็น โหลดโปรไฟล์ไม่สำเร็จ + ปุ่ม ลองใหม่ |

- [ ] **Step 10: Commit**

```bash
git add public/liff/format.mjs public/liff/format.test.mjs public/liff/index.html public/liff/app.mjs public/liff/style.css
git commit -m "feat: add profile tab with lifetime balance to LIFF page"
```

---

### Task 12: DOM smoke test ของทั้งหน้า LIFF

**Depends on:** Task 11

**Files:**
- Create: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: `index.html` และ `app.mjs` ทั้งหมด; `fetch`, `liff` จำลอง

เป้าหมาย: ล็อกว่า boot แล้วแท็บ ไอคอน skeleton รายการ ตัวกรอง กราฟแนวโน้ม และโปรไฟล์ต่อสายถูกต้อง โดยไม่เปิด dialog (jsdom ไม่รองรับ `showModal`)

- [ ] **Step 1: เขียนเทสต์** `public/liff/app.dom.test.mjs`

```js
// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll } from 'vitest';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const CATEGORIES = [
  { id: 'c-food', name: 'อาหาร', type: 'expense' },
  { id: 'c-trip', name: 'เดินทาง', type: 'expense' },
  { id: 'c-salary', name: 'เงินเดือน', type: 'income' },
];

const TRANSACTIONS = [
  { id: 't1', type: 'expense', amount: 60, note: 'ข้าวมันไก่', occurredOn: '2026-10-02', categoryId: 'c-food', categoryName: 'อาหาร' },
  { id: 't2', type: 'expense', amount: 40, note: 'BTS', occurredOn: '2026-10-01', categoryId: 'c-trip', categoryName: 'เดินทาง' },
  { id: 't3', type: 'income', amount: 25000, note: '', occurredOn: '2026-10-01', categoryId: 'c-salary', categoryName: 'เงินเดือน' },
];

const RESPONSES = {
  '/api/config': { liffId: 'liff-1' },
  '/api/categories': { categories: CATEGORIES },
  '/api/transactions': {
    transactions: TRANSACTIONS,
    summary: [
      { type: 'expense', category: 'อาหาร', total: 60, entryCount: 1 },
      { type: 'expense', category: 'เดินทาง', total: 40, entryCount: 1 },
      { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
    ],
    truncated: false,
  },
  '/api/budgets': { budgets: [{ categoryId: 'c-food', category: 'อาหาร', budget: 1000, spent: 60 }] },
  '/api/recurring': { rules: [] },
  '/api/trend': {
    months: [
      { month: '2026-05', income: 0, expense: 0 },
      { month: '2026-06', income: 0, expense: 0 },
      { month: '2026-07', income: 0, expense: 0 },
      { month: '2026-08', income: 0, expense: 0 },
      { month: '2026-09', income: 0, expense: 200 },
      { month: '2026-10', income: 25000, expense: 100 },
    ],
  },
  '/api/profile': { displayName: 'สมชาย', income: 25000, expense: 100, balance: 24900, entryCount: 3, firstDate: '2026-08-03' },
};

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function settle() {
  for (let i = 0; i < 10; i += 1) await flush();
}

beforeAll(async () => {
  document.documentElement.innerHTML = html;
  // ปิดแอนิเมชันเพื่อให้ค่าสุดท้ายขึ้นทันทีและผลคงที่
  window.matchMedia = () => ({ matches: true });
  globalThis.liff = {
    init: async () => {},
    isLoggedIn: () => true,
    getIDToken: () => 'token',
    closeWindow: () => {},
  };
  globalThis.fetch = async (url) => {
    const path = new URL(url, 'http://localhost').pathname;
    const body = RESPONSES[path];
    return { ok: Boolean(body), status: body ? 200 : 404, json: async () => body };
  };
  await import('./app.mjs');
  await settle();
});

describe('LIFF page after boot', () => {
  it('renders the five bottom tabs with the list tab selected', () => {
    const buttons = [...document.querySelectorAll('#bottom-nav button')];

    expect(buttons.map((button) => button.textContent)).toEqual(['รายการ', 'สรุป', 'จัดการงบ', 'รอบเดือน', 'โปรไฟล์']);
    expect(document.querySelector('#bottom-nav [aria-current="page"]').textContent).toBe('รายการ');
    expect(document.getElementById('panel-list').hidden).toBe(false);
    expect(document.getElementById('panel-profile').hidden).toBe(true);
  });

  it('shows the transactions with category badges and replaces the skeleton', () => {
    const rows = document.querySelectorAll('#list .row');

    expect(rows).toHaveLength(3);
    expect(document.querySelector('#list .skeleton')).toBeNull();
    expect(rows[0].querySelector('.row-title').textContent).toBe('อาหาร');
    expect(rows[0].querySelector('.row-note').textContent).toBe('ข้าวมันไก่');
    expect(rows[0].querySelector('.cat-badge use').getAttribute('href')).toBe('#cat-food');
    expect(rows[2].classList.contains('cat-salary')).toBe(true);
  });

  it('shows the month totals', () => {
    expect(document.getElementById('stat-income').textContent).toBe('25,000 บาท');
    expect(document.getElementById('stat-expense').textContent).toBe('100 บาท');
    expect(document.getElementById('stat-balance').textContent).toBe('24,900 บาท');
  });

  it('filters the list by the search box and shows the search empty state', () => {
    const search = document.getElementById('search');

    search.value = 'bts';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(1);
    expect(document.getElementById('filter-status').textContent).toBe('พบ 1 จาก 3 รายการ');

    search.value = 'ไม่มีแน่นอน';
    search.dispatchEvent(new Event('input'));
    expect(document.querySelectorAll('#list .row')).toHaveLength(0);
    expect(document.querySelector('#list .empty-title').textContent).toBe('ไม่พบรายการที่ค้นหา');

    document.getElementById('filter-clear').click();
    expect(document.querySelectorAll('#list .row')).toHaveLength(3);
  });

  it('renders the six-month trend and the comparison text', () => {
    expect(document.querySelectorAll('#trend-bars .trend-col')).toHaveLength(6);
    expect(document.getElementById('trend-comparison').textContent).toBe('รายจ่ายน้อยกว่าเดือนก่อน 50% (-100 บาท)');
    expect(document.querySelector('#trend-bars .trend-col.current .trend-label').textContent).toBe('ต.ค.');
  });

  it('renders the budget rows with category icons', () => {
    expect(document.querySelectorAll('#budget-rows .budget-row')).toHaveLength(1);
    expect(document.querySelector('#budget-rows .cat-badge use').getAttribute('href')).toBe('#cat-food');
  });

  it('shows the recurring empty state when there are no rules', () => {
    expect(document.getElementById('recurring-empty').hidden).toBe(false);
    expect(document.querySelector('#recurring-empty .empty-title').textContent).toBe('ยังไม่มีรายการประจำ');
  });

  it('switches tabs and shows the profile with the balance', () => {
    document.querySelector('#bottom-nav button[data-tab="profile"]').click();

    expect(document.getElementById('panel-profile').hidden).toBe(false);
    expect(document.getElementById('panel-list').hidden).toBe(true);
    expect(document.getElementById('month').hidden).toBe(true);
    expect(document.getElementById('page-title').textContent).toBe('โปรไฟล์');
    expect(document.getElementById('profile-name').textContent).toBe('สมชาย');
    expect(document.getElementById('profile-avatar').textContent).toBe('ส');
    expect(document.getElementById('profile-balance').textContent).toBe('24,900 บาท');
    expect(document.getElementById('profile-since').textContent).toBe('เริ่มบันทึกตั้งแต่ 3 ส.ค. 2569');
  });
});
```

- [ ] **Step 2: รันเทสต์**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: PASS ทุกข้อ ถ้าล้ม ให้ตรวจก่อนว่าเป็นบั๊กจริงของหน้า (เช่น id ไม่ตรง ลำดับ boot) แล้วแก้ที่โค้ดหน้า ไม่ใช่ผ่อนเทสต์; ถ้าล้มเพราะข้อจำกัดของ jsdom (เช่น `AbortSignal.timeout` ไม่มี) ให้เพิ่ม stub ใน `beforeAll` และแจ้งในรายงาน

- [ ] **Step 3: พิสูจน์ว่าเทสต์จับของจริง (mutation check)** แก้ชั่วคราวใน `app.mjs` ให้ `renderRow` ไม่ใส่ `.row-note` (คอมเมนต์บรรทัด `text.append(note);`) รัน `npx vitest run public/liff/app.dom.test.mjs`
Expected: FAIL ที่ข้อ shows the transactions แล้ว **คืนโค้ดกลับ** (`git checkout public/liff/app.mjs` ไม่ได้เพราะมีงานค้าง ให้ undo การแก้เฉพาะบรรทัดนั้นด้วยมือ) รันซ้ำให้ PASS

- [ ] **Step 4: รันทั้งชุด**

Run: `npm test`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add public/liff/app.dom.test.mjs
git commit -m "test: add DOM smoke test for the LIFF page"
```

---

### Task 13: คุณภาพโปรเจกต์ (ESLint, CI, README) และเอกสาร

**Depends on:** Task 12

**Files:**
- Modify: `package.json`, `package-lock.json` (devDependencies: `eslint`, `@eslint/js`, `globals`; script `lint`)
- Create: `eslint.config.js`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Modify: `SPEC.md` (เติมหัวข้อเว็บ LIFF), `work-memory/STATE.md`
- Modify: ไฟล์ที่ ESLint ชี้ (เฉพาะตัวแปร/import ที่ไม่ใช้ ห้ามเปลี่ยนพฤติกรรม)

**Interfaces:**
- Produces: `npm run lint` (ต้องผ่านด้วย exit code 0), workflow CI รัน `npm ci`, `npm run lint`, `npm test`, `node --check index.js`

- [ ] **Step 1: ติดตั้ง ESLint (devDependency ของโปรเจกต์ ผู้ใช้อนุมัติแล้ว)**

Run: `npm install --save-dev eslint @eslint/js globals`
Expected: ไม่มี error; `package.json` มี 3 แพ็กเกจใน devDependencies

- [ ] **Step 2: เพิ่ม script ใน `package.json`** ในส่วน `scripts` ต่อจาก `"test"`

```json
    "lint": "eslint .",
```

- [ ] **Step 3: เขียน** `eslint.config.js`

```js
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'work-memory/**', '.superpowers/**', 'docs/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
  },
  {
    // ไฟล์เทสต์ .js ใช้ import แบบ ESM (vitest จัดการให้)
    files: ['**/*.test.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  {
    files: ['public/**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, liff: 'readonly' } },
  },
  {
    files: ['**/*.test.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
  },
];
```

- [ ] **Step 4: รัน lint ดูผล**

Run: `npm run lint`
Expected: อาจมีรายการเตือน/ผิด (เช่น `no-unused-vars`) ถ้ามีเกิน 20 รายการ หยุดแล้วรายงานผู้ใช้ก่อน ห้ามแก้ต่อ

- [ ] **Step 5: แก้เฉพาะรายการที่ lint ชี้** โดยลบตัวแปร/import ที่ไม่ใช้เท่านั้น ห้ามเปลี่ยน logic; ถ้ากฎใดชี้โค้ดที่ตั้งใจ (เช่น `catch {}` ว่างที่มีคอมเมนต์อธิบาย) ให้ใส่ `// eslint-disable-next-line <rule>` บรรทัดเดียวพร้อมเหตุผลภาษาไทย แล้วรันซ้ำ

Run: `npm run lint`
Expected: exit code 0 ไม่มี output

- [ ] **Step 6: รันทั้งชุดเพื่อกันแก้แล้วพัง**

Run: `npm test`
Expected: PASS ทั้งหมด จำนวนเทสต์ไม่ลดลงจากก่อน Step 5
Run: `node --check index.js && node --check public/liff/app.mjs`
Expected: ผ่าน

- [ ] **Step 7: เขียน** `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: node --check index.js
```

- [ ] **Step 8: เขียน** `README.md` ที่รากโปรเจกต์ โดยอ่านชื่อ environment variable จาก `src/config.js` เท่านั้น (ห้ามเปิดอ่านไฟล์ `.env` และห้ามใส่ค่า secret ใดๆ) เนื้อหาต้องมีหัวข้อนี้ครบตามลำดับ:
  1. ชื่อโปรเจกต์ + ย่อหน้าเดียวอธิบายว่าคืออะไร (LINE OA บันทึกรายรับรายจ่ายจากภาษาธรรมชาติ + เว็บ LIFF)
  2. ความสามารถ (bullet จาก SPEC.md ข้อ 1-7: บันทึกด้วยข้อความ, อ่านสลิป/ใบเสร็จ, สรุปวัน/สัปดาห์/เดือน, งบ + เตือน, รายการประจำ, เว็บ LIFF 5 แท็บ, Export CSV)
  3. สถาปัตยกรรม: แผนภาพ mermaid `flowchart LR` จาก LINE -> Express (webhook, /api, /liff static) -> Claude API / Supabase, และ cron-job.org -> `/internal/recurring/run`
  4. Tech stack
  5. โครงสร้างโฟลเดอร์ (`src/`, `public/liff/`, `supabase/`, `docs/superpowers/plans/`)
  6. การติดตั้งและรัน: `npm ci`, สร้าง `.env` ตามชื่อตัวแปรที่อ่านจาก `src/config.js` (ตารางชื่อตัวแปร + คำอธิบายสั้น ไม่มีค่า), รัน SQL ใน `supabase/` ตามลำดับ `schema.sql` แล้ว `002` ถึง `010`, `npm start`
  7. คำสั่งพัฒนา: `npm test`, `npm run lint`, `npm run try-parse`
  8. หมายเหตุความปลอดภัย: ตรวจ LINE signature, verify ID token ฝั่ง server, RLS ทุกตาราง + function จำกัด service_role, rate limit, endpoint cron ป้องกันด้วย secret
  9. สถานะ: อยู่ระหว่างเตรียม deploy (ขั้นที่ 10)

  ไม่ใส่ภาพหน้าจอ (ผู้ใช้เพิ่มเองภายหลังได้ที่ `docs/screenshots/`)

- [ ] **Step 9: อัปเดต `SPEC.md`** แก้บรรทัด 31 (ข้อ 3 เว็บ LIFF) ให้เป็น

```
3\. เว็บ LIFF: แท็บล่าง 5 แท็บ (รายการ ค้นหา/กรองตามคำ ประเภท หมวด; สรุป กราฟตามหมวด กราฟแนวโน้ม 6 เดือนพร้อมเทียบเดือนก่อน Export CSV; จัดการงบ; รอบเดือน = จัดการรายการประจำ; โปรไฟล์ ยอดเงินคงเหลือสะสม = รายรับ - รายจ่ายทุกรายการที่บันทึกในบอท), แก้/ลบรายการ, ไอคอน SVG และสีประจำหมวด (ธีมสว่างอย่างเดียว ไม่มี dark mode), skeleton loading และ empty state
```

และเพิ่มในส่วนข้อมูล/API ที่มีอยู่ (หาตำแหน่งที่อธิบาย endpoint หรือ SQL function ถ้ามี ถ้าไม่มีส่วนนั้นให้เพิ่มบรรทัดต่อท้ายข้อ 3): `GET /api/trend?month=` (6 เดือนสิ้นสุดเดือนที่เลือก) และ `GET /api/profile` (ชื่อ ยอดสะสม ยอดคงเหลือ จำนวนรายการ วันที่รายการแรก) และ SQL `010_profile_and_trend.sql`

- [ ] **Step 10: อัปเดต `work-memory/STATE.md`**
  - เปลี่ยน `Updated:` และบรรทัด `Goal:` ให้บอกว่าปรับหน้า LIFF (5 แท็บ ไอคอน skeleton empty state ค้นหา แนวโน้ม โปรไฟล์) + คุณภาพโปรเจกต์ เสร็จบน branch `feat/liff-ui-refresh` (ยัง ไม่ merge จนกว่าผู้ใช้ manual check ผ่าน) และขั้นถัดไปยังเป็นขั้นที่ 10 Deploy
  - ใน `## Next` เพิ่มรายการ: ผู้ใช้รัน `supabase/010_profile_and_trend.sql` และทำ manual check ตาราง Browser check ของ Task 3, 5-11 ในแอป LINE (ข้อ 10 และ 11 ต้องรัน 010 ก่อน) แล้ว merge; ticket ที่ยอมรับ: การค้นหาค้นเฉพาะรายการที่โหลดมา (เดือนที่ถูกตัดค้นไม่ครบ มีข้อความบอก), ยอดคงเหลือไม่ใช่ยอดบัญชีจริง, กราฟแนวโน้มไม่มี DOM test ระดับ pixel; ที่ยังไม่ทำจาก DOM test: dialog ทั้งหมด (jsdom ไม่รองรับ showModal)
  - ใน `## Done` เพิ่มบรรทัดสรุปงานนี้ (จำนวนเทสต์ล่าสุดจาก `npm test`, lint ผ่าน)
  - ใน `## Learned` เพิ่ม: LIFF ล็อกอิน LINE จึงใช้ Playwright ทดสอบอัตโนมัติไม่ได้ ใช้ DOM smoke test (`app.dom.test.mjs` + fake `liff`/`fetch`) แทน; jsdom ไม่มี `matchMedia`/`showModal` ต้อง stub

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json eslint.config.js .github/workflows/ci.yml README.md SPEC.md work-memory/STATE.md
git add -u
git commit -m "chore: add ESLint, CI workflow and README, update SPEC and STATE"
```

(`git add -u` เพื่อรวมไฟล์ที่ ESLint บังคับให้แก้ใน Step 5; ตรวจ `git status` ก่อน commit ว่าไม่มีไฟล์ `.env` หรือไฟล์ที่ไม่ได้ตั้งใจติดมา)

---

## Self-Review (ผู้เขียนแผนตรวจแล้ว)

**Spec coverage**
- Bottom Tab Navigator 5 แท็บ: Task 5 (+ โปรไฟล์ Task 11, รอบเดือน = รายการประจำเดิม)
- ไอคอน SVG แยกตามหมวด: Task 4 (sprite) + Task 6 (ใช้ในรายการ/กราฟ/งบ/รายการประจำ)
- เว็บดูมีชีวิต: สี/การ์ดตามหมวด (Task 3, 4, 6), แอนิเมชันเบา + reduced motion (Task 8), empty state (Task 8); dark mode ถูกตัดออกตามที่ผู้ใช้สั่ง
- Skeleton loading: Task 7 (รายการ, สรุป, งบ, รอบเดือน, กราฟแนวโน้ม Task 10, โปรไฟล์ Task 11)
- ข้อเสนอที่ผู้ใช้เลือก: ค้นหา/กรอง (Task 9), กราฟแนวโน้ม + เทียบเดือนก่อน (Task 10 + API Task 2), คุณภาพโปรเจกต์ (Task 12 DOM test, Task 13 ESLint/CI/README)
- ยอดคงเหลือสะสม + หมายเหตุว่าไม่ใช่ยอดจริง: Task 1, 2, 11

**Placeholder scan:** ทุกขั้นที่แก้โค้ดมีโค้ดจริง; ข้อที่ใช้ "(เดิม: ...)" ใน Task 5 Step 5 หมายถึงย้ายโค้ดเดิมโดยไม่แก้ ระบุขอบเขตไว้ชัด; ส่วน README/SPEC/STATE ระบุเนื้อหาที่ต้องมีครบแต่ไม่ได้เขียนข้อความเต็มเพราะต้องอ่านข้อมูลจริงจาก `src/config.js`/SPEC.md ตอนทำ

**Type consistency:** `growBar(win, el, percent, property)` ใช้ตรงกันใน Task 8, 10; `showAmount(el, value)` นิยามใน Task 8 ใช้ใน Task 11; `createLoadingIndicator({doc,textEl,skeletonEl,count,variant})` ตรงกันใน Task 7, 10, 11; `createEmptyState(doc, kind, tag)` kind ตรงกับ Task 8/9; `api.getTrend`/`getProfile` ตรงกับ Task 2; ชื่อ field ของ `/api/profile` (`displayName, income, expense, balance, entryCount, firstDate`) ตรงกับ `profileView`

**ความเสี่ยง/ข้อจำกัดที่รู้ล่วงหน้า**
- การค้นหาทำฝั่ง client บนรายการที่โหลดมา (เดือนที่ถูกตัดค้นไม่ครบ มีข้อความบอกผู้ใช้)
- ยอดสีใน Task 3 เป็นค่าตั้งต้นที่คำนวณคร่าวๆ ถ้าเทสต์ contrast ล้มให้ปรับค่าสี ไม่ลดเกณฑ์
- jsdom ไม่รองรับ `<dialog>.showModal` และ `matchMedia` DOM test จึงไม่ครอบ dialog ทั้งหมด
- แท็บ รอบเดือน ใช้ข้อความหัวข้อ "รายการประจำ" ใน panel (ชื่อแท็บตามที่ผู้ใช้เรียก)
