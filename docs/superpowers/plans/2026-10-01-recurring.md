# Recurring Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้ตั้งรายการประจำ (เช่น ค่าเน็ตทุกวันที่ 5) ในหน้าเว็บ LIFF แล้วบอทบันทึกให้อัตโนมัติเดือนละครั้ง พร้อมส่ง push แจ้งและปุ่มยกเลิก

**Architecture:** ใช้ตาราง `recurring_rules` ที่มีอยู่แล้วใน `supabase/schema.sql` ตัวกระตุ้นภายนอก (cron-job.org) เรียก `POST /internal/recurring/run` พร้อม Bearer secret วันละครั้ง; runner ดึงกฎที่ถึงรอบ แล้วเรียก SQL function `apply_recurring_rule` ที่ทำทีละกฎแบบ atomic (จอง event + insert transaction + อัปเดต `last_run_on` ใน transaction เดียว) แล้ว push แจ้งผู้ใช้ ปุ่มยกเลิกใช้ postback `undo` เดิมผ่าน `line_event_id` สังเคราะห์ `recurring:<ruleId>:<YYYY-MM>` การจัดการกฎ (ดู/เพิ่ม/แก้/หยุด/ลบ) ทำในหน้าเว็บ LIFF ผ่าน `/api/recurring`

**Tech Stack:** Node.js (CommonJS) + Express 5, Supabase (PostgREST + plpgsql), @line/bot-sdk (pushMessage), LIFF (ES module ไม่มี build step), vitest

## Global Constraints

- ทำทีละขั้นตาม SPEC.md เขียน test ก่อนโค้ด และอัปเดต `work-memory/STATE.md` (CLAUDE.md ของโปรเจกต์)
- ห้าม commit ไฟล์ `.env` หรือ secret ใดๆ; ห้ามแก้ `.env` เอง ผู้ใช้เพิ่ม `CRON_SECRET` เอง
- ห้าม start/restart/kill server เอง ผู้ใช้เป็นคนทำ; ห้าม `git push`
- คอมเมนต์ในโค้ดบรรทัดเดียว ภาษาไทย ใช้เฉพาะอธิบาย "ทำไม" ศัพท์เทคนิคเป็นอังกฤษ; ชื่อตัวแปร/function/log message เป็นอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- วันที่ทุกอย่างคิดตามเวลา Asia/Bangkok ผ่าน `toBangkokDateString` (`src/utils/date.js`)
- ผู้ใช้ตัดสินใจแล้ว (2026-10-01): จัดการกฎผ่านหน้าเว็บ LIFF อย่างเดียว; ตัวกระตุ้นคือ cron ภายนอกเรียก endpoint + secret token; วันที่ 29-31 ในเดือนที่สั้นกว่าให้บันทึกวันสุดท้ายของเดือน; บันทึกแล้วส่ง push แจ้งพร้อมปุ่มยกเลิก
- กฎทำงาน "เดือนละครั้ง" สูงสุด: ถ้า `last_run_on >= วันที่ 1 ของเดือนนี้` ถือว่าเดือนนี้ทำแล้ว
- สร้าง/แก้/เปิดใช้กฎตอนที่รอบของเดือนนี้ผ่านไปแล้ว ให้ถือว่ารอบนี้ทำแล้ว (เริ่มนับจากรอบถัดไป ไม่ย้อนหลัง)
- รอบที่พลาดจากเดือนก่อนไม่ย้อนเก็บ; เก็บเฉพาะเดือนปัจจุบัน
- จำกัด 50 กฎต่อผู้ใช้ (กัน batch ของ runner ล้น)
- ไม่ตรวจเตือนงบหลังบันทึกรายการประจำ (นอกขอบเขตขั้นที่ 9)
- ทำงานบน branch `feat/step9-recurring` (สร้างจาก main แล้ว)

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `src/recurring/schedule.js` (+`.test.js`) | ฟังก์ชันล้วนคำนวณวันครบกำหนด/ถึงรอบหรือยัง/last_run_on หลังบันทึก |
| `supabase/009_recurring.sql` | SQL function `apply_recurring_rule` (atomic) + index |
| `src/db/repository.js` (+test) | method ของ `recurring_rules` |
| `src/recurring/run.js` (+`.test.js`) | runner: ดึงกฎที่ถึงรอบ, apply, push |
| `src/recurring/router.js` (+`.test.js`) | `POST /internal/recurring/run` ป้องกันด้วย secret |
| `src/line-reply.js` (+test) | เพิ่ม `createPushText` |
| `src/parser/format-reply.js`, `src/bot.js` | export `formatItem`, `buildUndoQuickReply` ให้ runner ใช้ซ้ำ |
| `src/config.js` (+test), `src/app.js` (+test), `index.js` | `CRON_SECRET`, mount router, wiring |
| `src/api/validate.js`, `src/api/router.js` (+tests) | `/api/recurring` สำหรับ LIFF |
| `public/liff/api.mjs`, `format.mjs`, `index.html`, `app.mjs`, `style.css` (+tests) | หน้าจัดการรายการประจำ |

---

### Task 1: ตัวคำนวณตารางเวลา (pure functions)

**Depends on:** none

**Files:**
- Create: `src/recurring/schedule.js`
- Test: `src/recurring/schedule.test.js`

**Interfaces:**
- Produces (ทั้งหมดรับ/คืนวันที่เป็น string `YYYY-MM-DD` เวลาไทย):
  - `lastDayOf(todayStr): number` วันสุดท้ายของเดือนที่ todayStr อยู่
  - `monthStartOf(todayStr): string` เช่น `'2026-10-01'`
  - `dueDateFor(todayStr, dayOfMonth): string` วันครบกำหนดของเดือนนี้ ถ้า `dayOfMonth` เกินวันสุดท้ายใช้วันสุดท้าย
  - `isDue(rule, todayStr): boolean` โดย `rule = { active, dayOfMonth, lastRunOn }` (`lastRunOn` เป็น string หรือ null)
  - `lastRunOnAfterSave(lastRunOn, dayOfMonth, todayStr): string | null`

- [ ] **Step 1: เขียนเทสต์ที่ล้มก่อน** สร้าง `src/recurring/schedule.test.js`

```js
import { describe, it, expect } from 'vitest';
import { lastDayOf, monthStartOf, dueDateFor, isDue, lastRunOnAfterSave } from './schedule.js';

describe('lastDayOf and monthStartOf', () => {
  it('knows month lengths including February in leap and normal years', () => {
    expect(lastDayOf('2026-10-15')).toBe(31);
    expect(lastDayOf('2026-04-01')).toBe(30);
    expect(lastDayOf('2026-02-10')).toBe(28);
    expect(lastDayOf('2028-02-10')).toBe(29);
    expect(monthStartOf('2026-10-15')).toBe('2026-10-01');
  });
});

describe('dueDateFor', () => {
  it('uses the day of the month as is when the month is long enough', () => {
    expect(dueDateFor('2026-10-15', 5)).toBe('2026-10-05');
    expect(dueDateFor('2026-10-15', 31)).toBe('2026-10-31');
  });

  it('falls back to the last day of a shorter month', () => {
    expect(dueDateFor('2026-02-10', 31)).toBe('2026-02-28');
    expect(dueDateFor('2028-02-10', 30)).toBe('2028-02-29');
    expect(dueDateFor('2026-04-10', 31)).toBe('2026-04-30');
  });
});

describe('isDue', () => {
  const rule = { active: true, dayOfMonth: 5, lastRunOn: null };

  it('is due on and after the due day when it has not run this month', () => {
    expect(isDue(rule, '2026-10-05')).toBe(true);
    expect(isDue(rule, '2026-10-20')).toBe(true);
  });

  it('is not due before the due day', () => {
    expect(isDue(rule, '2026-10-04')).toBe(false);
  });

  it('is not due when it already ran this month, even if the day was edited later', () => {
    expect(isDue({ ...rule, lastRunOn: '2026-10-05' }, '2026-10-20')).toBe(false);
    expect(isDue({ ...rule, dayOfMonth: 25, lastRunOn: '2026-10-05' }, '2026-10-25')).toBe(false);
  });

  it('is due again in the next month after a run last month', () => {
    expect(isDue({ ...rule, lastRunOn: '2026-09-05' }, '2026-10-05')).toBe(true);
  });

  it('is never due when paused', () => {
    expect(isDue({ ...rule, active: false }, '2026-10-20')).toBe(false);
  });

  it('is due on the last day of a short month for day 31', () => {
    expect(isDue({ ...rule, dayOfMonth: 31 }, '2026-02-27')).toBe(false);
    expect(isDue({ ...rule, dayOfMonth: 31 }, '2026-02-28')).toBe(true);
  });
});

describe('lastRunOnAfterSave', () => {
  it('marks this month as done when the due day has already passed', () => {
    expect(lastRunOnAfterSave(null, 5, '2026-10-10')).toBe('2026-10-05');
    expect(lastRunOnAfterSave(null, 10, '2026-10-10')).toBe('2026-10-10');
  });

  it('keeps the old value when the due day is still ahead', () => {
    expect(lastRunOnAfterSave(null, 20, '2026-10-10')).toBeNull();
    expect(lastRunOnAfterSave('2026-09-20', 20, '2026-10-10')).toBe('2026-09-20');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/recurring/schedule.test.js`
Expected: FAIL (Cannot find module './schedule.js')

- [ ] **Step 3: เขียนโค้ดขั้นต่ำ** สร้าง `src/recurring/schedule.js`

```js
function lastDayOf(todayStr) {
  const year = Number(todayStr.slice(0, 4));
  const month = Number(todayStr.slice(5, 7));
  // วันที่ 0 ของเดือนถัดไปคือวันสุดท้ายของเดือนนี้
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthStartOf(todayStr) {
  return `${todayStr.slice(0, 7)}-01`;
}

function dueDateFor(todayStr, dayOfMonth) {
  const day = Math.min(dayOfMonth, lastDayOf(todayStr));
  return `${todayStr.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

// เดือนละครั้งสูงสุด เทียบกับต้นเดือน ไม่เทียบกับวันครบกำหนด กันบันทึกซ้ำเมื่อผู้ใช้แก้วันที่ทีหลัง
function isDue(rule, todayStr) {
  if (!rule.active) return false;
  if (rule.lastRunOn && rule.lastRunOn >= monthStartOf(todayStr)) return false;
  return dueDateFor(todayStr, rule.dayOfMonth) <= todayStr;
}

// รอบของเดือนนี้ที่ผ่านไปแล้วตอนสร้าง/แก้/เปิดใช้ไม่ย้อนบันทึก เริ่มนับจากรอบถัดไป
function lastRunOnAfterSave(lastRunOn, dayOfMonth, todayStr) {
  const dueOn = dueDateFor(todayStr, dayOfMonth);
  return dueOn <= todayStr ? dueOn : lastRunOn;
}

module.exports = { lastDayOf, monthStartOf, dueDateFor, isDue, lastRunOnAfterSave };
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/recurring/schedule.test.js`
Expected: PASS (ทุก test)

- [ ] **Step 5: Commit**

```bash
git add src/recurring/schedule.js src/recurring/schedule.test.js docs/superpowers/plans/2026-10-01-recurring.md
git commit -m "feat: add schedule helpers for recurring rules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: SQL function และ repository

**Depends on:** Task 1

**Files:**
- Create: `supabase/009_recurring.sql`
- Modify: `supabase/schema.sql` (บรรทัดแรก header), `src/db/repository.js` (เพิ่ม method และ export), `SPEC.md` (บรรทัด `recurring_rules`)
- Test: `src/db/repository.test.js` (เพิ่ม `'or'` และ `'limit'` ในรายการ method ของ `fakeSupabase`)

**Interfaces:**
- Consumes: `lastDayOf`, `monthStartOf` จาก `src/recurring/schedule.js`
- Produces (บน `createRepository(supabase)`):
  - `listRecurringRules(userId): Promise<Rule[]>` เรียงตาม `day_of_month` แล้ว `created_at`
  - `createRecurringRule({ userId, type, categoryId, amount, note, dayOfMonth, active, lastRunOn }): Promise<Rule>`
  - `updateRecurringRule(userId, id, { type, categoryId, amount, note, dayOfMonth, active, lastRunOn }): Promise<boolean>` (false ถ้าไม่พบแถว)
  - `deleteRecurringRule(userId, id): Promise<boolean>`
  - `listDueRecurringRules(todayStr): Promise<(Rule & { userId, lineUserId, categoryName })[]>` สูงสุด 500 แถว
  - `applyRecurringRule({ ruleId, dueOn, eventId }): Promise<boolean>` true = สร้างรายการจริง
  - โดย `Rule = { id, type, categoryId, amount: number, note, dayOfMonth, active, lastRunOn: string|null }`

- [ ] **Step 1: เขียน SQL** สร้าง `supabase/009_recurring.sql`

```sql
-- รันใน Supabase SQL Editor ต่อจาก 008_pending_slips_event_index.sql เพื่อเปิดใช้รายการประจำ

-- ทำทีละกฎใน transaction เดียว: จอง event, บันทึกรายการ และอัปเดต last_run_on พร้อมกัน
-- คืน true เมื่อสร้างรายการจริง false เมื่อกฎถูกหยุด/ลบ หรือรอบนี้เคยทำไปแล้ว
create or replace function public.apply_recurring_rule(p_rule_id uuid, p_due date, p_event_id text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  r public.recurring_rules%rowtype;
  claimed_event text;
begin
  -- ไม่เชื่อ event id จากผู้เรียก เพื่อให้รับประกันเดือนละครั้งอยู่ใน database เอง
  if p_event_id is distinct from 'recurring:' || p_rule_id || ':' || to_char(p_due, 'YYYY-MM') then
    raise exception 'invalid recurring event id %', p_event_id;
  end if;

  -- เช็กซ้ำใต้ lock ว่ายังไม่ได้ทำเดือนนี้ กันกฎที่เพิ่งถูกแก้ระหว่าง runner ทำงานบันทึกย้อนหลัง
  -- for update กันสอง request ที่ยิงพร้อมกันบันทึกซ้ำ
  select * into r from public.recurring_rules where id = p_rule_id and active
    and (last_run_on is null or last_run_on < date_trunc('month', p_due)::date) for update;
  if not found then
    return false;
  end if;

  insert into public.line_events (webhook_event_id, user_id)
  values (p_event_id, r.user_id)
  on conflict (webhook_event_id) do nothing
  returning webhook_event_id into claimed_event;

  -- เลื่อน last_run_on แม้ event ถูกจองไปแล้ว เพื่อไม่ให้เดือนที่ถูกยกเลิกหรือบันทึกไปแล้วถูกลองซ้ำ
  update public.recurring_rules set last_run_on = p_due where id = p_rule_id;

  if claimed_event is null then
    return false;
  end if;

  insert into public.transactions (user_id, type, category_id, amount, note, occurred_on, source, line_event_id)
  values (r.user_id, r.type, r.category_id, r.amount, r.note, p_due, 'recurring', p_event_id);
  return true;
end
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นเหมือน budget_status
revoke execute on function public.apply_recurring_rule(uuid, date, text) from public, anon, authenticated;
grant execute on function public.apply_recurring_rule(uuid, date, text) to service_role;

create index recurring_rules_user_id_idx on public.recurring_rules (user_id);

notify pgrst, 'reload schema';
```

แก้บรรทัดแรกของ `supabase/schema.sql`: ต่อท้ายรายการไฟล์ด้วย `, 008_pending_slips_event_index.sql และ 009_recurring.sql` (เปลี่ยน "และ 008_..." เป็น ", 008_..., และ 009_recurring.sql" ให้ประโยคอ่านถูก)

แก้ `SPEC.md` บรรทัด `\- recurring\_rules: ...` ให้ต่อท้ายว่า ` (ทำงานเดือนละครั้ง, last\_run\_on เป็นวันครบกำหนดของรอบล่าสุด)`

- [ ] **Step 2: เขียนเทสต์ repository ที่ล้ม** ใน `src/db/repository.test.js`: เพิ่ม `'or', 'limit'` ในอาร์เรย์ method ของ `fakeSupabase` (บรรทัด `for (const method of ['select', 'eq', 'upsert', ...])`) แล้วเพิ่ม describe ท้ายไฟล์

```js
describe('repository recurring rules', () => {
  const ROW = {
    id: 'r1',
    type: 'expense',
    category_id: 'c1',
    amount: '590.00',
    note: 'ค่าเน็ต',
    day_of_month: 5,
    active: true,
    last_run_on: null,
  };
  const RULE = {
    id: 'r1',
    type: 'expense',
    categoryId: 'c1',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: null,
  };
  const COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';

  it('lists the rules of one user in day order and converts amount to a number', async () => {
    const { supabase, calls } = fakeSupabase({ data: [ROW], error: null });

    expect(await createRepository(supabase).listRecurringRules('user-1')).toEqual([RULE]);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['select', COLUMNS],
      ['eq', 'user_id', 'user-1'],
      ['order', 'day_of_month'],
      ['order', 'created_at'],
    ]);
  });

  it('creates a rule and returns it', async () => {
    const { supabase, calls } = fakeSupabase({ data: ROW, error: null });

    const rule = await createRepository(supabase).createRecurringRule({
      userId: 'user-1',
      type: 'expense',
      categoryId: 'c1',
      amount: 590,
      note: 'ค่าเน็ต',
      dayOfMonth: 5,
      active: true,
      lastRunOn: null,
    });

    expect(rule).toEqual(RULE);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      [
        'insert',
        {
          user_id: 'user-1',
          type: 'expense',
          category_id: 'c1',
          amount: 590,
          note: 'ค่าเน็ต',
          day_of_month: 5,
          active: true,
          last_run_on: null,
        },
      ],
      ['select', COLUMNS],
      ['single'],
    ]);
  });

  it('updates only this user rule and reports whether it existed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'r1' }], error: null });

    const updated = await createRepository(supabase).updateRecurringRule('user-1', 'r1', {
      type: 'expense',
      categoryId: 'c1',
      amount: 600,
      note: 'ค่าเน็ต',
      dayOfMonth: 6,
      active: false,
      lastRunOn: '2026-10-06',
    });

    expect(updated).toBe(true);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      [
        'update',
        {
          type: 'expense',
          category_id: 'c1',
          amount: 600,
          note: 'ค่าเน็ต',
          day_of_month: 6,
          active: false,
          last_run_on: '2026-10-06',
        },
      ],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'r1'],
      ['select', 'id'],
    ]);
  });

  it('returns false when updating or deleting a rule that does not exist', async () => {
    const empty = fakeSupabase({ data: [], count: 0, error: null }).supabase;

    expect(await createRepository(empty).updateRecurringRule('user-1', 'r1', {})).toBe(false);
    expect(await createRepository(empty).deleteRecurringRule('user-1', 'r1')).toBe(false);
  });

  it('deletes only this user rule', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteRecurringRule('user-1', 'r1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'r1'],
    ]);
  });

  it('lists due rules with the line user id and category name, filtered by day before the last day of the month', async () => {
    const dueRow = { ...ROW, user_id: 'user-1', users: { line_user_id: 'U1' }, categories: { name: 'ค่าสาธารณูปโภค' } };
    const { supabase, calls } = fakeSupabase({ data: [dueRow], error: null });

    const rules = await createRepository(supabase).listDueRecurringRules('2026-10-15');

    expect(rules).toEqual([{ ...RULE, userId: 'user-1', lineUserId: 'U1', categoryName: 'ค่าสาธารณูปโภค' }]);
    expect(calls).toEqual([
      ['from', 'recurring_rules'],
      ['select', `${COLUMNS}, user_id, users(line_user_id), categories(name)`],
      ['eq', 'active', true],
      ['or', 'last_run_on.is.null,last_run_on.lt.2026-10-01'],
      ['lte', 'day_of_month', 15],
      ['order', 'created_at'],
      ['limit', 500],
    ]);
  });

  it('does not filter by day on the last day of the month so day 31 rules are caught up', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    await createRepository(supabase).listDueRecurringRules('2026-02-28');

    expect(calls.some(([method]) => method === 'lte')).toBe(false);
  });

  it('applies a rule through the rpc and returns whether a transaction was created', async () => {
    const { supabase, calls } = fakeSupabase({ data: true, error: null });

    const created = await createRepository(supabase).applyRecurringRule({
      ruleId: 'r1',
      dueOn: '2026-10-05',
      eventId: 'recurring:r1:2026-10',
    });

    expect(created).toBe(true);
    expect(calls).toEqual([
      ['rpc', 'apply_recurring_rule', { p_rule_id: 'r1', p_due: '2026-10-05', p_event_id: 'recurring:r1:2026-10' }],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const failing = fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;
    const repository = createRepository(failing);

    await expect(repository.listRecurringRules('u')).rejects.toThrow('Database listRecurringRules failed: boom');
    await expect(repository.createRecurringRule({})).rejects.toThrow('Database createRecurringRule failed: boom');
    await expect(repository.updateRecurringRule('u', 'r', {})).rejects.toThrow('Database updateRecurringRule failed: boom');
    await expect(repository.deleteRecurringRule('u', 'r')).rejects.toThrow('Database deleteRecurringRule failed: boom');
    await expect(repository.listDueRecurringRules('2026-10-15')).rejects.toThrow('Database listDueRecurringRules failed: boom');
    await expect(repository.applyRecurringRule({})).rejects.toThrow('Database applyRecurringRule failed: boom');
  });
});
```

- [ ] **Step 3: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL (`listRecurringRules is not a function` ฯลฯ) ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 4: เขียน repository** ใน `src/db/repository.js`

ด้านบนไฟล์ ต่อจาก `const { categoryKey } = require('./transaction-rows');` เพิ่ม

```js
const { lastDayOf, monthStartOf } = require('../recurring/schedule');
```

ต่อจากค่าคงที่ `EXPORT_PAGE_SIZE` เพิ่ม

```js
const RULE_COLUMNS = 'id, type, category_id, amount, note, day_of_month, active, last_run_on';
// กันงานรอบเดียวหนักเกินไป ที่เหลือจะถูกหยิบในรอบถัดไป
const DUE_RULE_BATCH = 500;

function toRule(row) {
  return {
    id: row.id,
    type: row.type,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note,
    dayOfMonth: row.day_of_month,
    active: row.active,
    lastRunOn: row.last_run_on,
  };
}
```

ก่อน `return {` ท้าย `createRepository` เพิ่ม method

```js
  async function listRecurringRules(userId) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .select(RULE_COLUMNS)
      .eq('user_id', userId)
      .order('day_of_month')
      .order('created_at');
    throwIfError('listRecurringRules', error);
    return data.map(toRule);
  }

  async function createRecurringRule({ userId, type, categoryId, amount, note, dayOfMonth, active, lastRunOn }) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .insert({
        user_id: userId,
        type,
        category_id: categoryId,
        amount,
        note,
        day_of_month: dayOfMonth,
        active,
        last_run_on: lastRunOn,
      })
      .select(RULE_COLUMNS)
      .single();
    throwIfError('createRecurringRule', error);
    return toRule(data);
  }

  async function updateRecurringRule(userId, id, fields) {
    const { data, error } = await supabase
      .from('recurring_rules')
      .update({
        type: fields.type,
        category_id: fields.categoryId,
        amount: fields.amount,
        note: fields.note,
        day_of_month: fields.dayOfMonth,
        active: fields.active,
        last_run_on: fields.lastRunOn,
      })
      .eq('user_id', userId)
      .eq('id', id)
      .select('id');
    throwIfError('updateRecurringRule', error);
    return data.length > 0;
  }

  async function deleteRecurringRule(userId, id) {
    const { count, error } = await supabase
      .from('recurring_rules')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('id', id);
    throwIfError('deleteRecurringRule', error);
    return count > 0;
  }

  // กรองใน SQL ให้เหลือเฉพาะกฎที่ยังไม่ทำเดือนนี้และถึงวันแล้ว วันสุดท้ายของเดือนไม่กรองวัน เพื่อเก็บกฎวันที่ 29-31
  async function listDueRecurringRules(today) {
    const todayDay = Number(today.slice(8, 10));
    let query = supabase
      .from('recurring_rules')
      .select(`${RULE_COLUMNS}, user_id, users(line_user_id), categories(name)`)
      .eq('active', true)
      .or(`last_run_on.is.null,last_run_on.lt.${monthStartOf(today)}`);
    if (todayDay < lastDayOf(today)) {
      query = query.lte('day_of_month', todayDay);
    }
    const { data, error } = await query.order('created_at').limit(DUE_RULE_BATCH);
    throwIfError('listDueRecurringRules', error);
    return data.map((row) => ({
      ...toRule(row),
      userId: row.user_id,
      lineUserId: row.users.line_user_id,
      categoryName: row.categories.name,
    }));
  }

  async function applyRecurringRule({ ruleId, dueOn, eventId }) {
    const { data, error } = await supabase.rpc('apply_recurring_rule', {
      p_rule_id: ruleId,
      p_due: dueOn,
      p_event_id: eventId,
    });
    throwIfError('applyRecurringRule', error);
    return data === true;
  }
```

ใน `return { ... }` ท้ายไฟล์ เพิ่ม `listRecurringRules, createRecurringRule, updateRecurringRule, deleteRecurringRule, listDueRecurringRules, applyRecurringRule,` ต่อจาก `deleteTransaction,`

- [ ] **Step 5: รันให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 6: Commit**

```bash
git add supabase/009_recurring.sql supabase/schema.sql SPEC.md src/db/repository.js src/db/repository.test.js
git commit -m "feat: add recurring rule repository methods and apply function" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Runner และ push

**Depends on:** Task 1, Task 2

**Files:**
- Create: `src/recurring/run.js`
- Modify: `src/line-reply.js` (เพิ่ม `createPushText`), `src/parser/format-reply.js` (export `formatItem`), `src/bot.js` (export `buildUndoQuickReply`)
- Test: `src/recurring/run.test.js`, `src/line-reply.test.js`

**Interfaces:**
- Consumes: `repository.listDueRecurringRules(today)`, `repository.applyRecurringRule({ ruleId, dueOn, eventId })` (Task 2); `isDue`, `dueDateFor` (Task 1)
- Produces:
  - `createPushText(client): (to: string, text: string, quickReplyItems?: object[]) => Promise<void>` ใน `src/line-reply.js` (`client.pushMessage({ to, messages })`)
  - `createRecurringRunner({ repository, pushText, now?, logger? }): () => Promise<{ due, created, skipped, failed }>` ใน `src/recurring/run.js`
  - `formatItem(item)` จาก `src/parser/format-reply.js`, `buildUndoQuickReply(webhookEventId)` จาก `src/bot.js`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม** เพิ่มใน `src/line-reply.test.js`: แก้ import เป็น `import { createReplyText, createReplyFlex, createPushText } from './line-reply.js';` แล้วเพิ่ม describe ท้ายไฟล์

```js
describe('createPushText', () => {
  it('pushes one text message to the user with quick reply items', async () => {
    const client = { pushMessage: vi.fn().mockResolvedValue({}) };
    const items = [{ type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=e1' } }];

    await createPushText(client)('U1', 'saved', items);

    expect(client.pushMessage).toHaveBeenCalledWith({
      to: 'U1',
      messages: [{ type: 'text', text: 'saved', quickReply: { items } }],
    });
  });

  it('sends plain text without quick reply and cuts text that is too long', async () => {
    const client = { pushMessage: vi.fn().mockResolvedValue({}) };

    await createPushText(client)('U1', 'x'.repeat(6000));

    const message = client.pushMessage.mock.calls[0][0].messages[0];
    expect(message.quickReply).toBeUndefined();
    expect(message.text.length).toBeLessThanOrEqual(5000);
  });
});
```

สร้าง `src/recurring/run.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createRecurringRunner } from './run.js';

const NOW = new Date('2026-10-05T03:00:00Z');

function rule(overrides = {}) {
  return {
    id: 'r1',
    userId: 'user-1',
    lineUserId: 'U1',
    type: 'expense',
    categoryId: 'c1',
    categoryName: 'ค่าสาธารณูปโภค',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: null,
    ...overrides,
  };
}

function setup(rules = [rule()]) {
  const repository = {
    listDueRecurringRules: vi.fn().mockResolvedValue(rules),
    applyRecurringRule: vi.fn().mockResolvedValue(true),
  };
  const pushText = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const run = createRecurringRunner({ repository, pushText, now: () => NOW, logger });
  return { repository, pushText, logger, run };
}

describe('createRecurringRunner', () => {
  it('asks for the rules due today in Bangkok time', async () => {
    const { repository, run } = setup([]);

    await run();

    expect(repository.listDueRecurringRules).toHaveBeenCalledWith('2026-10-05');
  });

  it('applies a due rule with a per month event id and pushes a notice with an undo button', async () => {
    const { repository, pushText, run } = setup();

    const result = await run();

    expect(repository.applyRecurringRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      dueOn: '2026-10-05',
      eventId: 'recurring:r1:2026-10',
    });
    expect(pushText).toHaveBeenCalledWith(
      'U1',
      'บันทึกรายการประจำให้อัตโนมัติ\n- รายจ่าย | ค่าสาธารณูปโภค | 590 บาท | 05/10 | ค่าเน็ต',
      [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'ยกเลิก',
            data: 'action=undo&event=recurring%3Ar1%3A2026-10',
            displayText: 'ยกเลิก',
          },
        },
      ]
    );
    expect(result).toEqual({ due: 1, created: 1, skipped: 0, failed: 0 });
  });

  it('skips a rule the database says was already applied and sends nothing', async () => {
    const { repository, pushText, run } = setup();
    repository.applyRecurringRule.mockResolvedValue(false);

    expect(await run()).toEqual({ due: 1, created: 0, skipped: 1, failed: 0 });
    expect(pushText).not.toHaveBeenCalled();
  });

  it('ignores rules that are not due according to the schedule', async () => {
    const { repository, run } = setup([rule({ dayOfMonth: 20 }), rule({ id: 'r2', lastRunOn: '2026-10-01' })]);

    expect(await run()).toEqual({ due: 0, created: 0, skipped: 0, failed: 0 });
    expect(repository.applyRecurringRule).not.toHaveBeenCalled();
  });

  it('uses the last day of a short month as the date', async () => {
    const { repository } = setup([rule({ dayOfMonth: 31 })]);
    const feb = createRecurringRunner({
      repository,
      pushText: vi.fn().mockResolvedValue(),
      now: () => new Date('2026-02-28T03:00:00Z'),
      logger: { error: vi.fn() },
    });

    await feb();

    expect(repository.applyRecurringRule).toHaveBeenCalledWith({
      ruleId: 'r1',
      dueOn: '2026-02-28',
      eventId: 'recurring:r1:2026-02',
    });
  });

  it('keeps going and counts a failure when one rule throws, without logging amounts', async () => {
    const { repository, pushText, logger, run } = setup([rule(), rule({ id: 'r2', amount: 100 })]);
    repository.applyRecurringRule.mockRejectedValueOnce(new Error('db down'));

    const result = await run();

    expect(result).toEqual({ due: 2, created: 1, skipped: 0, failed: 1 });
    expect(pushText).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to apply recurring rule', { ruleId: 'r1' }, expect.any(Error));
  });

  it('still counts the rule as created when the push fails', async () => {
    const { pushText, logger, run } = setup();
    pushText.mockRejectedValue(new Error('push failed'));

    expect(await run()).toEqual({ due: 1, created: 1, skipped: 0, failed: 0 });
    expect(logger.error).toHaveBeenCalledWith('Failed to push recurring notice', { ruleId: 'r1' }, expect.any(Error));
  });

  it('lets a failure to list rules propagate so the endpoint answers 500', async () => {
    const { repository, run } = setup();
    repository.listDueRecurringRules.mockRejectedValue(new Error('db down'));

    await expect(run()).rejects.toThrow('db down');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/recurring/run.test.js src/line-reply.test.js`
Expected: FAIL (`createPushText is not a function`, ไม่พบ `./run.js`)

- [ ] **Step 3: เขียนโค้ด**

`src/line-reply.js`: แทนที่ `createReplyText` ให้ใช้ helper ร่วม และเพิ่ม `createPushText`

```js
function buildTextMessage(text, quickReplyItems) {
  const message = { type: 'text', text: capTextLength(text) };
  if (quickReplyItems && quickReplyItems.length > 0) {
    message.quickReply = { items: quickReplyItems };
  }
  return message;
}

function createReplyText(client) {
  return async function replyText(replyToken, text, quickReplyItems) {
    await client.replyMessage({ replyToken, messages: [buildTextMessage(text, quickReplyItems)] });
  };
}

function createPushText(client) {
  return async function pushText(to, text, quickReplyItems) {
    await client.pushMessage({ to, messages: [buildTextMessage(text, quickReplyItems)] });
  };
}
```

และแก้ท้ายไฟล์เป็น `module.exports = { capTextLength, createReplyText, createReplyFlex, createPushText };`

`src/parser/format-reply.js`: แก้ `module.exports` เป็น `{ formatSavedReply, formatSlipConfirmReply, formatAmount, formatItem }`

`src/bot.js`: เพิ่ม `buildUndoQuickReply,` ใน `module.exports` (ต่อจาก `SLIP_TTL_MS,`)

สร้าง `src/recurring/run.js`

```js
const { toBangkokDateString } = require('../utils/date');
const { dueDateFor, isDue } = require('./schedule');
const { formatItem } = require('../parser/format-reply');
const { buildUndoQuickReply } = require('../bot');

function createRecurringRunner({ repository, pushText, now = () => new Date(), logger = console }) {
  return async function run() {
    const today = toBangkokDateString(now());
    const rules = await repository.listDueRecurringRules(today);
    const result = { due: 0, created: 0, skipped: 0, failed: 0 };
    for (const rule of rules) {
      // SQL กรองมาแล้ว เช็กซ้ำที่นี่เพื่อให้กติกาอยู่ที่ schedule.js ที่เดียว
      if (!isDue(rule, today)) continue;
      result.due += 1;
      const dueOn = dueDateFor(today, rule.dayOfMonth);
      // event id ต่อเดือนทำให้ยกเลิกผ่านปุ่มเดิมได้ และกันบันทึกซ้ำเดือนเดียวกัน
      const eventId = `recurring:${rule.id}:${dueOn.slice(0, 7)}`;
      let created;
      try {
        created = await repository.applyRecurringRule({ ruleId: rule.id, dueOn, eventId });
      } catch (err) {
        logger.error('Failed to apply recurring rule', { ruleId: rule.id }, err);
        result.failed += 1;
        continue;
      }
      if (!created) {
        result.skipped += 1;
        continue;
      }
      result.created += 1;
      const text = [
        'บันทึกรายการประจำให้อัตโนมัติ',
        formatItem({
          type: rule.type,
          category: rule.categoryName,
          amount: rule.amount,
          date: dueOn,
          note: rule.note,
        }),
      ].join('\n');
      try {
        await pushText(rule.lineUserId, text, buildUndoQuickReply(eventId));
      } catch (err) {
        // บันทึกสำเร็จแล้ว push พังไม่ต้องย้อนรายการ
        logger.error('Failed to push recurring notice', { ruleId: rule.id }, err);
      }
    }
    return result;
  };
}

module.exports = { createRecurringRunner };
```

- [ ] **Step 4: รันให้ผ่าน แล้วรันทั้งชุดเพื่อดูผลกระทบ**

Run: `npx vitest run src/recurring src/line-reply.test.js src/bot.test.js src/parser`
Expected: PASS ทั้งหมด (เทสต์ `bot` และ `format-reply` เดิมต้องไม่พัง)

- [ ] **Step 5: Commit**

```bash
git add src/recurring/run.js src/recurring/run.test.js src/line-reply.js src/line-reply.test.js src/parser/format-reply.js src/bot.js
git commit -m "feat: add recurring runner with push notice and undo button" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Endpoint ที่ cron เรียก และ wiring

**Depends on:** Task 3

**Files:**
- Create: `src/recurring/router.js`
- Modify: `src/config.js`, `src/app.js`, `index.js`, `.env.example` (เพิ่มบรรทัด `CRON_SECRET=` ที่ไม่มีค่าจริง; ห้ามแตะ `.env`)
- Test: `src/recurring/router.test.js`, `src/config.test.js`, `src/app.test.js`

**Interfaces:**
- Consumes: `createRecurringRunner(...)` (Task 3), `createPushText` (Task 3)
- Produces:
  - `createRecurringRouter({ cronSecret, run, logger? }): express.Router` เส้นทาง `POST /recurring/run` (mount ที่ `/internal` ได้ URL `/internal/recurring/run`) ตอบ 401 ถ้า Bearer ไม่ตรง, 200 `{ due, created, skipped, failed }`, 500 `{ error: 'Internal error' }`; throw `TypeError` ถ้าไม่ส่ง `cronSecret`
  - `loadConfig` คืน `cronSecret`; `CRON_SECRET` เป็น required key (ต่อท้าย `LINE_LOGIN_CHANNEL_ID`)
  - `createApp({ ..., recurringRouter })` mount ที่ `/internal`

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

`src/config.test.js`: เพิ่ม `CRON_SECRET: 'cron-secret-789',` ใน `VALID_ENV`; ในเทสต์แรกเพิ่ม `cronSecret: 'cron-secret-789',` ท้ายออบเจ็กต์ที่คาดหวัง; ในเทสต์ "throws listing every missing key" เติม `, CRON_SECRET` ท้ายข้อความ

สร้าง `src/recurring/router.test.js`

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createRecurringRouter } from './router.js';

let server;

async function start(deps) {
  const app = express();
  app.use('/internal', createRecurringRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/internal`;
}

function post(base, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${base}/recurring/run`, { method: 'POST', headers });
}

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
});

describe('createRecurringRouter', () => {
  it('refuses to build without a secret so the endpoint is never open', () => {
    expect(() => createRecurringRouter({ cronSecret: '', run: vi.fn() })).toThrow('cronSecret');
  });

  it('runs the job and returns the counts when the bearer secret matches', async () => {
    const run = vi.fn().mockResolvedValue({ due: 2, created: 1, skipped: 1, failed: 0 });
    const base = await start({ cronSecret: 's3cret', run });

    const res = await post(base, 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ due: 2, created: 1, skipped: 1, failed: 0 });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('returns 401 and does not run for a missing or wrong secret', async () => {
    const run = vi.fn();
    const base = await start({ cronSecret: 's3cret', run });

    expect((await post(base, undefined)).status).toBe(401);
    expect((await post(base, 'wrong')).status).toBe(401);
    expect((await post(base, 's3cret-longer')).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it('returns 500 and logs when the job throws', async () => {
    const logger = { error: vi.fn() };
    const base = await start({ cronSecret: 's3cret', run: vi.fn().mockRejectedValue(new Error('db down')), logger });

    const res = await post(base, 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('answers only POST', async () => {
    const base = await start({ cronSecret: 's3cret', run: vi.fn() });

    const res = await fetch(`${base}/recurring/run`, { headers: { Authorization: 'Bearer s3cret' } });

    expect(res.status).toBe(404);
  });
});
```

`src/app.test.js`: เพิ่มพารามิเตอร์ท้าย `start` เป็น `start(handleEvents, logger, apiRouter, exportRouter, recurringRouter)` ส่งต่อให้ `createApp({ ..., recurringRouter })` แล้วเพิ่ม describe

```js
describe('recurring router', () => {
  it('mounts the router under /internal', async () => {
    const recurringRouter = express.Router();
    recurringRouter.post('/recurring/run', (req, res) => res.json({ ok: true }));
    const baseUrl = await start(vi.fn(), undefined, undefined, undefined, recurringRouter);

    const res = await fetch(`${baseUrl}/internal/recurring/run`, { method: 'POST' });

    expect(await res.json()).toEqual({ ok: true });
  });
});
```

และเพิ่ม `import express from 'express';` ที่หัวไฟล์ถ้ายังไม่มี

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/recurring/router.test.js src/config.test.js src/app.test.js`
Expected: FAIL

- [ ] **Step 3: เขียนโค้ด**

`src/config.js`: เพิ่ม `'CRON_SECRET',` ท้าย `REQUIRED_KEYS` และ `cronSecret: env.CRON_SECRET,` ท้ายออบเจ็กต์ที่คืน

สร้าง `src/recurring/router.js`

```js
const crypto = require('node:crypto');
const express = require('express');

// เทียบ hash เพื่อให้ timingSafeEqual ได้ความยาวเท่ากันเสมอ และไม่เปิดเผยความยาวของ secret
function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

function createRecurringRouter({ cronSecret, run, logger = console }) {
  if (!cronSecret) {
    throw new TypeError('createRecurringRouter requires cronSecret');
  }
  const router = express.Router();

  router.post('/recurring/run', async (req, res) => {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
    if (!token || !safeEqual(token, cronSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try {
      res.json(await run());
    } catch (err) {
      logger.error('Recurring run failed', err);
      res.status(500).json({ error: 'Internal error' });
    }
  });

  return router;
}

module.exports = { createRecurringRouter };
```

`src/app.js`: เพิ่ม `recurringRouter` ในพารามิเตอร์ของ `createApp` และหลังบล็อก `if (exportRouter) { ... }` เพิ่ม

```js
  if (recurringRouter) {
    app.use('/internal', recurringRouter);
  }
```

`index.js`: แก้ `require('./src/line-reply')` ให้ดึง `createPushText` เพิ่ม; เพิ่ม require สองบรรทัด

```js
const { createRecurringRunner } = require('./src/recurring/run');
const { createRecurringRouter } = require('./src/recurring/router');
```

ก่อน `const app = createApp({` เพิ่ม

```js
const recurringRouter = createRecurringRouter({
  cronSecret: config.cronSecret,
  run: createRecurringRunner({ repository, pushText: createPushText(lineClient) }),
});
```

และส่ง `recurringRouter,` ใน `createApp({ ... })`

`.env.example`: เพิ่มบรรทัด `CRON_SECRET=` (ไม่มีค่า)

- [ ] **Step 4: รันให้ผ่าน แล้วตรวจ syntax ของ index.js**

Run: `npx vitest run src/recurring src/config.test.js src/app.test.js src/line-reply.test.js && node --check index.js`
Expected: PASS และ `node --check` ไม่มี output

- [ ] **Step 5: Commit**

```bash
git add src/recurring/router.js src/recurring/router.test.js src/config.js src/config.test.js src/app.js src/app.test.js index.js .env.example
git commit -m "feat: add cron endpoint for recurring rules" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: API สำหรับหน้าเว็บ

**Depends on:** Task 1, Task 2

**Files:**
- Modify: `src/api/validate.js`, `src/api/router.js`
- Test: `src/api/validate.test.js`, `src/api/router.test.js`

**Interfaces:**
- Consumes: `repository.listRecurringRules/createRecurringRule/updateRecurringRule/deleteRecurringRule`, `repository.listCategories`; `lastRunOnAfterSave` (Task 1)
- Produces:
  - `validateRecurringRule(body)` ใน `validate.js` คืน `{ ok: true, value: { amount, categoryId, dayOfMonth, note, active } }` หรือ `{ ok: false, error }`
  - `GET /api/recurring` -> `200 { rules: Rule[] }`
  - `POST /api/recurring` body `{ categoryId, amount, dayOfMonth, note, active }` -> `201 { rule }`; 400 ข้อมูลไม่ถูกต้อง/ไม่พบหมวด; 409 `{ error: 'Too many rules' }` เมื่อครบ 50
  - `PUT /api/recurring/:id` body เดียวกัน -> 204; 404 ถ้า id ไม่ใช่ UUID หรือไม่พบ
  - `DELETE /api/recurring/:id` -> 204 / 404

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

`src/api/validate.test.js`: แก้ import เป็น `import { parseMonth, validateTransactionUpdate, validateRecurringRule } from './validate.js';` แล้วเพิ่ม

```js
describe('validateRecurringRule', () => {
  const RULE = { amount: 590, categoryId: 'cat-1', dayOfMonth: 5, note: ' ค่าเน็ต ', active: true };

  it('accepts a valid rule and trims the note', () => {
    expect(validateRecurringRule(RULE)).toEqual({
      ok: true,
      value: { amount: 590, categoryId: 'cat-1', dayOfMonth: 5, note: 'ค่าเน็ต', active: true },
    });
  });

  it('accepts day 1 and day 31 and an empty note', () => {
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 1, note: '' }).ok).toBe(true);
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 31 }).ok).toBe(true);
  });

  it('rejects each bad field with its own error', () => {
    expect(validateRecurringRule(null)).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateRecurringRule({ ...RULE, amount: 0 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateRecurringRule({ ...RULE, amount: 10.001 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateRecurringRule({ ...RULE, categoryId: '' })).toEqual({ ok: false, error: 'Invalid category' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 0 })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 32 })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: 5.5 })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, dayOfMonth: '5' })).toEqual({ ok: false, error: 'Invalid day' });
    expect(validateRecurringRule({ ...RULE, note: 'ก'.repeat(201) })).toEqual({ ok: false, error: 'Invalid note' });
    expect(validateRecurringRule({ ...RULE, note: 5 })).toEqual({ ok: false, error: 'Invalid note' });
    expect(validateRecurringRule({ ...RULE, active: 'yes' })).toEqual({ ok: false, error: 'Invalid active' });
  });
});
```

`src/api/router.test.js`: ใน `setup()` เพิ่มใน `repository` ของ deps

```js
      listRecurringRules: vi.fn().mockResolvedValue([]),
      createRecurringRule: vi.fn().mockImplementation(async (fields) => ({
        id: ID,
        type: fields.type,
        categoryId: fields.categoryId,
        amount: fields.amount,
        note: fields.note,
        dayOfMonth: fields.dayOfMonth,
        active: fields.active,
        lastRunOn: fields.lastRunOn,
      })),
      updateRecurringRule: vi.fn().mockResolvedValue(true),
      deleteRecurringRule: vi.fn().mockResolvedValue(true),
```

แล้วเพิ่ม describe ท้ายไฟล์ (เวลาในเทสต์คือ `2026-09-30T03:00Z` = 30 ก.ย. เวลาไทย)

```js
describe('recurring rules API', () => {
  const BODY = { categoryId: 'c-food', amount: 590, dayOfMonth: 5, note: 'ค่าเน็ต', active: true };
  const EXISTING = {
    id: ID,
    type: 'expense',
    categoryId: 'c-food',
    amount: 590,
    note: 'ค่าเน็ต',
    dayOfMonth: 5,
    active: true,
    lastRunOn: '2026-08-05',
  };

  it('lists the rules of the signed in user', async () => {
    const deps = setup();
    deps.repository.listRecurringRules.mockResolvedValue([EXISTING]);
    const base = await start(deps);

    const res = await call(base, '/recurring');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rules: [EXISTING] });
    expect(deps.repository.listRecurringRules).toHaveBeenCalledWith('user-1');
  });

  it('creates a rule, takes the type from the category and skips this month when the day has passed', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/recurring', { method: 'POST', body: BODY });

    expect(res.status).toBe(201);
    expect(deps.repository.createRecurringRule).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'expense',
      categoryId: 'c-food',
      amount: 590,
      note: 'ค่าเน็ต',
      dayOfMonth: 5,
      active: true,
      lastRunOn: '2026-09-05',
    });
    expect((await res.json()).rule.id).toBe(ID);
  });

  it('leaves lastRunOn empty when the due day is still ahead this month', async () => {
    const deps = setup();
    const base = await start(deps);

    await call(base, '/recurring', { method: 'POST', body: { ...BODY, dayOfMonth: 31 } });

    expect(deps.repository.createRecurringRule.mock.calls[0][0].lastRunOn).toBeNull();
  });

  it('rejects a bad body, a category that is not the user and the 51st rule', async () => {
    const deps = setup();
    const base = await start(deps);

    expect((await call(base, '/recurring', { method: 'POST', body: { ...BODY, amount: -1 } })).status).toBe(400);
    expect((await call(base, '/recurring', { method: 'POST', body: { ...BODY, categoryId: 'other' } })).status).toBe(400);
    expect(deps.repository.createRecurringRule).not.toHaveBeenCalled();

    deps.repository.listRecurringRules.mockResolvedValue(Array.from({ length: 50 }, () => EXISTING));
    const full = await call(base, '/recurring', { method: 'POST', body: BODY });
    expect(full.status).toBe(409);
    expect(await full.json()).toEqual({ error: 'Too many rules' });
  });

  it('updates a rule and recomputes lastRunOn from the existing value', async () => {
    const deps = setup();
    deps.repository.listRecurringRules.mockResolvedValue([EXISTING]);
    const base = await start(deps);

    const res = await call(base, `/recurring/${ID}`, { method: 'PUT', body: { ...BODY, amount: 600, dayOfMonth: 31 } });

    expect(res.status).toBe(204);
    expect(deps.repository.updateRecurringRule).toHaveBeenCalledWith('user-1', ID, {
      type: 'expense',
      categoryId: 'c-food',
      amount: 600,
      note: 'ค่าเน็ต',
      dayOfMonth: 31,
      active: true,
      lastRunOn: '2026-08-05',
    });
  });

  it('returns 404 when updating or deleting a rule that is missing or has a bad id', async () => {
    const deps = setup();
    const base = await start(deps);
    deps.repository.deleteRecurringRule.mockResolvedValue(false);

    expect((await call(base, `/recurring/${ID}`, { method: 'PUT', body: BODY })).status).toBe(404);
    expect((await call(base, '/recurring/not-a-uuid', { method: 'PUT', body: BODY })).status).toBe(404);
    expect((await call(base, `/recurring/${ID}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(base, '/recurring/not-a-uuid', { method: 'DELETE' })).status).toBe(404);
    expect(deps.repository.updateRecurringRule).not.toHaveBeenCalled();
  });

  it('deletes a rule', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, `/recurring/${ID}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(deps.repository.deleteRecurringRule).toHaveBeenCalledWith('user-1', ID);
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/recurring', { token: null })).status).toBe(401);
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run src/api`
Expected: FAIL (`validateRecurringRule is not a function`, route 404)

- [ ] **Step 3: เขียนโค้ด**

`src/api/validate.js`: เพิ่มก่อน `module.exports`

```js
function validateRecurringRule(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const { amount, categoryId, dayOfMonth, note, active } = body;
  if (!isValidAmount(amount)) {
    return { ok: false, error: 'Invalid amount' };
  }
  if (typeof categoryId !== 'string' || categoryId.length === 0) {
    return { ok: false, error: 'Invalid category' };
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { ok: false, error: 'Invalid day' };
  }
  if (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: 'Invalid note' };
  }
  if (typeof active !== 'boolean') {
    return { ok: false, error: 'Invalid active' };
  }
  return { ok: true, value: { amount, categoryId, dayOfMonth, note: note.trim(), active } };
}
```

และแก้ export เป็น `module.exports = { parseMonth, isValidAmount, validateTransactionUpdate, validateRecurringRule };`

`src/api/router.js`: แก้ import บรรทัด 3 เป็น `const { parseMonth, isValidAmount, validateTransactionUpdate, validateRecurringRule } = require('./validate');` เพิ่ม

```js
const { toBangkokDateString } = require('../utils/date');
const { lastRunOnAfterSave } = require('../recurring/schedule');
```

และค่าคงที่ใต้ `UUID_PATTERN`

```js
const MAX_RECURRING_RULES = 50;
```

เพิ่ม route ก่อน `router.post('/exports', ...)`

```js
  router.get('/recurring', async (req, res) => {
    res.json({ rules: await repository.listRecurringRules(req.userId) });
  });

  router.post('/recurring', async (req, res) => {
    const result = validateRecurringRule(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const [categories, rules] = await Promise.all([
      repository.listCategories(req.userId),
      repository.listRecurringRules(req.userId),
    ]);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    if (rules.length >= MAX_RECURRING_RULES) {
      res.status(409).json({ error: 'Too many rules' });
      return;
    }
    const today = toBangkokDateString(now());
    const rule = await repository.createRecurringRule({
      userId: req.userId,
      type: category.type,
      ...result.value,
      lastRunOn: lastRunOnAfterSave(null, result.value.dayOfMonth, today),
    });
    res.status(201).json({ rule });
  });

  router.put('/recurring/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const result = validateRecurringRule(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    const [categories, rules] = await Promise.all([
      repository.listCategories(req.userId),
      repository.listRecurringRules(req.userId),
    ]);
    const category = categories.find((item) => item.id === result.value.categoryId);
    if (!category) {
      res.status(400).json({ error: 'Invalid category' });
      return;
    }
    const existing = rules.find((item) => item.id === req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const today = toBangkokDateString(now());
    const updated = await repository.updateRecurringRule(req.userId, req.params.id, {
      type: category.type,
      ...result.value,
      lastRunOn: lastRunOnAfterSave(existing.lastRunOn, result.value.dayOfMonth, today),
    });
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });

  router.delete('/recurring/:id', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const deleted = await repository.deleteRecurringRule(req.userId, req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  });
```

(`now` เป็นพารามิเตอร์ของ `createApiRouter` อยู่แล้ว)

- [ ] **Step 4: รันให้ผ่าน**

Run: `npx vitest run src/api`
Expected: PASS ทั้งโฟลเดอร์

- [ ] **Step 5: Commit**

```bash
git add src/api/validate.js src/api/validate.test.js src/api/router.js src/api/router.test.js
git commit -m "feat: add recurring rules API for the LIFF page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: หน้าเว็บ LIFF จัดการรายการประจำ

**Depends on:** Task 5

**Files:**
- Modify: `public/liff/api.mjs`, `public/liff/format.mjs`, `public/liff/index.html`, `public/liff/app.mjs`, `public/liff/style.css`
- Test: `public/liff/api.test.mjs`, `public/liff/format.test.mjs`

**Interfaces:**
- Consumes: `/api/recurring` (Task 5)
- Produces:
  - `api.listRecurring()`, `api.createRecurring(body)`, `api.updateRecurring(id, body)`, `api.deleteRecurring(id)`
  - `describeRecurringDay(day): string`, `recurringRows(rules, categories): Row[]` โดย `Row = { id, categoryId, amount, note, dayOfMonth, active, title, text }`, `describeRecurringFailure(status, action): string` (`action` เป็น `'save'` หรือ `'delete'`)

**Browser check:** (LIFF เปิดได้เฉพาะในแอป LINE จึงให้ผู้ใช้ทดสอบเองในแอป LINE; Playwright ใช้ไม่ได้)
- Preconditions: รัน `supabase/009_recurring.sql` แล้ว, ผู้ใช้ restart `npm start` เอง, ngrok ทำงาน, เปิดหน้า LIFF จากเมนู "เปิดเว็บ" ในแอป LINE

| # | Action | Expected |
|---|---|---|
| 1 | เลื่อนลงใต้ส่วน "งบประมาณรายจ่าย" | เห็นหัวข้อ "รายการประจำ" และข้อความ "ยังไม่มีรายการประจำ" กับปุ่ม "เพิ่มรายการประจำ" |
| 2 | กด "เพิ่มรายการประจำ" เลือกหมวด "ค่าสาธารณูปโภค" ใส่ 590 วันที่ 31 โน้ต "ค่าเน็ต" กด "บันทึก" | dialog ปิด รายการใหม่ขึ้นว่า "ค่าสาธารณูปโภค" และ "รายจ่าย 590 บาท · ทุกวันที่ 31 (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย) · ค่าเน็ต" |
| 3 | กดรายการนั้น ติ๊กเอา "ใช้งาน" ออก กด "บันทึก" | รายการจางลงและมีคำว่า "หยุดไว้" |
| 4 | กดรายการ กด "ลบ" ครั้งแรก | ปุ่มเปลี่ยนเป็น "กดอีกครั้งเพื่อลบ" ยังไม่ลบ |
| 5 | กดปุ่มเดิมอีกครั้ง | dialog ปิด รายการหาย เห็นข้อความ "ยังไม่มีรายการประจำ" |
| 6 | เพิ่มรายการใหม่ ใส่จำนวนเงิน 0 | บราวเซอร์ไม่ยอมส่งฟอร์ม (ขั้นต่ำ 0.01) |

- [ ] **Step 1: เขียนเทสต์ที่ล้ม**

`public/liff/api.test.mjs`: เพิ่มเทสต์ใน describe `createApi`

```js
  it('lists, creates, updates and deletes recurring rules', async () => {
    const fetchImpl = fakeFetch(200, { rules: [] });
    const api = setup(fetchImpl);
    const body = { categoryId: 'c1', amount: 590, dayOfMonth: 5, note: '', active: true };

    await api.listRecurring();
    await api.createRecurring(body);
    await api.updateRecurring('r 1', body);
    await api.deleteRecurring('r 1');

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
      ['/api/recurring', undefined],
      ['/api/recurring', 'POST'],
      ['/api/recurring/r%201', 'PUT'],
      ['/api/recurring/r%201', 'DELETE'],
    ]);
    expect(fetchImpl.mock.calls[1][1].body).toBe(JSON.stringify(body));
  });
```

`public/liff/format.test.mjs`: เพิ่ม `describeRecurringDay, recurringRows, describeRecurringFailure,` ในรายการ import แล้วเพิ่ม

```js
describe('describeRecurringDay', () => {
  it('says every month on that day', () => {
    expect(describeRecurringDay(5)).toBe('ทุกวันที่ 5');
    expect(describeRecurringDay(28)).toBe('ทุกวันที่ 28');
  });

  it('explains that days 29 to 31 use the last day of a shorter month', () => {
    expect(describeRecurringDay(31)).toBe('ทุกวันที่ 31 (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย)');
    expect(describeRecurringDay(29)).toBe('ทุกวันที่ 29 (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย)');
  });
});

describe('recurringRows', () => {
  const categories = [{ id: 'c1', name: 'ค่าสาธารณูปโภค', type: 'expense' }];
  const rule = { id: 'r1', type: 'expense', categoryId: 'c1', amount: 590, note: 'ค่าเน็ต', dayOfMonth: 5, active: true, lastRunOn: null };

  it('builds a title and a summary line', () => {
    expect(recurringRows([rule], categories)).toEqual([
      {
        id: 'r1',
        categoryId: 'c1',
        amount: 590,
        note: 'ค่าเน็ต',
        dayOfMonth: 5,
        active: true,
        title: 'ค่าสาธารณูปโภค',
        text: 'รายจ่าย 590 บาท · ทุกวันที่ 5 · ค่าเน็ต',
      },
    ]);
  });

  it('marks a paused rule, omits an empty note and shows income as income', () => {
    const [row] = recurringRows([{ ...rule, type: 'income', note: '', active: false }], categories);

    expect(row.text).toBe('รายรับ 590 บาท · ทุกวันที่ 5 · หยุดไว้');
    expect(row.active).toBe(false);
  });

  it('still shows a rule whose category no longer exists', () => {
    expect(recurringRows([rule], [])[0].title).toBe('ไม่ทราบหมวด');
  });
});

describe('describeRecurringFailure', () => {
  it('explains each status in Thai', () => {
    expect(describeRecurringFailure(401, 'save')).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(describeRecurringFailure(404, 'save')).toBe('ไม่พบรายการประจำนี้แล้ว');
    expect(describeRecurringFailure(409, 'save')).toBe('มีรายการประจำครบ 50 รายการแล้ว ลบอันเก่าก่อนเพิ่มใหม่');
    expect(describeRecurringFailure(400, 'save')).toBe('ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่ (1-31)');
    expect(describeRecurringFailure(500, 'save')).toBe('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeRecurringFailure(undefined, 'delete')).toBe('ลบไม่สำเร็จ ลองใหม่อีกครั้ง');
  });
});
```

- [ ] **Step 2: รันให้เห็นว่าล้ม**

Run: `npx vitest run public/liff`
Expected: FAIL (`listRecurring is not a function`, `describeRecurringDay` ไม่ได้ export)

- [ ] **Step 3: เขียน api.mjs และ format.mjs**

`public/liff/api.mjs`: ใน object ที่ `createApi` คืน ต่อจาก `setBudget` เพิ่ม

```js
    listRecurring: () => request('/recurring'),
    createRecurring: (body) => request('/recurring', { method: 'POST', body: JSON.stringify(body) }),
    updateRecurring: (id, body) =>
      request(`/recurring/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) }),
    deleteRecurring: (id) => request(`/recurring/${encodeURIComponent(id)}`, { method: 'DELETE' }),
```

`public/liff/format.mjs`: เพิ่มท้ายไฟล์

```js
const RECURRING_TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

export function describeRecurringDay(day) {
  return day > 28 ? `ทุกวันที่ ${day} (เดือนที่สั้นกว่านั้นใช้วันสุดท้าย)` : `ทุกวันที่ ${day}`;
}

export function recurringRows(rules, categories) {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return rules.map((rule) => {
    const parts = [`${RECURRING_TYPE_LABELS[rule.type]} ${formatBaht(rule.amount)}`, describeRecurringDay(rule.dayOfMonth)];
    if (rule.note) parts.push(rule.note);
    if (!rule.active) parts.push('หยุดไว้');
    return {
      id: rule.id,
      categoryId: rule.categoryId,
      amount: rule.amount,
      note: rule.note,
      dayOfMonth: rule.dayOfMonth,
      active: rule.active,
      title: names.get(rule.categoryId) || 'ไม่ทราบหมวด',
      text: parts.join(' · '),
    };
  });
}

export function describeRecurringFailure(status, action) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบรายการประจำนี้แล้ว';
  if (status === 409) return 'มีรายการประจำครบ 50 รายการแล้ว ลบอันเก่าก่อนเพิ่มใหม่';
  if (status === 400) return 'ข้อมูลไม่ถูกต้อง ตรวจจำนวนเงิน หมวด และวันที่ (1-31)';
  return action === 'delete' ? 'ลบไม่สำเร็จ ลองใหม่อีกครั้ง' : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff`
Expected: PASS

- [ ] **Step 5: เขียน UI (index.html, app.mjs, style.css)** ส่วนนี้ไม่มี unit test (DOM) ตรวจด้วย Browser check ด้านบน

`public/liff/index.html`: ต่อจาก `</section>` ของ `#budgets` (ก่อน `<p id="status" ...>`) เพิ่ม

```html
    <section id="recurring" class="recurring" aria-labelledby="recurring-title" hidden>
      <h2 id="recurring-title">รายการประจำ</h2>
      <p class="recurring-hint">บอทบันทึกให้อัตโนมัติเดือนละครั้งตามวันที่ตั้งไว้ และแจ้งใน LINE (กดยกเลิกได้) ถ้าตั้งวันที่ผ่านไปแล้วในเดือนนี้ จะเริ่มเดือนหน้า</p>
      <p id="recurring-loading" class="recurring-loading" role="status" hidden>กำลังโหลดรายการประจำ...</p>
      <p id="recurring-empty" class="recurring-empty" hidden>ยังไม่มีรายการประจำ</p>
      <ul id="recurring-rows" class="recurring-rows"></ul>
      <div id="recurring-error" class="budgets-error" hidden>
        <p id="recurring-error-text"></p>
        <button type="button" id="recurring-retry">ลองใหม่</button>
      </div>
      <button type="button" id="recurring-add">เพิ่มรายการประจำ</button>
    </section>
```

และต่อจาก `</dialog>` ของ `#budget-editor` เพิ่ม

```html
  <dialog id="recurring-editor" aria-labelledby="recurring-editor-title">
    <form id="recurring-form">
      <h2 id="recurring-editor-title"></h2>
      <label>หมวด
        <select id="recurring-category" required></select>
      </label>
      <label>จำนวนเงิน (บาท)
        <input id="recurring-amount" type="number" inputmode="decimal" step="0.01" min="0.01" max="10000000" required>
      </label>
      <label>ทุกวันที่ (1-31)
        <input id="recurring-day" type="number" inputmode="numeric" step="1" min="1" max="31" required>
      </label>
      <label>โน้ต
        <input id="recurring-note" type="text" maxlength="200">
      </label>
      <label class="check">
        <input id="recurring-active" type="checkbox" checked> ใช้งาน
      </label>
      <p id="recurring-busy" class="confirm-detail" role="status" hidden>กำลังบันทึก...</p>
      <p id="recurring-editor-error" class="error" role="alert" hidden></p>
      <div class="actions">
        <button type="button" id="recurring-delete" class="danger">ลบ</button>
        <button type="button" id="recurring-cancel">ปิด</button>
        <button type="submit" class="primary">บันทึก</button>
      </div>
    </form>
  </dialog>
```

`public/liff/style.css`: เพิ่มท้ายไฟล์

```css
.recurring { margin: 12px 16px 0; padding: 12px; background: #fff; border-radius: 8px; }
.recurring h2 { margin: 0; font-size: 16px; }
.recurring-hint { margin: 4px 0 0; font-size: 13px; color: #555; }
.recurring-loading, .recurring-empty { margin: 12px 0 0; color: #666; }
.recurring-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.recurring-button { display: block; width: 100%; min-height: 44px; margin-top: 8px; padding: 8px 0; border: none; background: none; font: inherit; font-size: 14px; color: inherit; text-align: left; cursor: pointer; }
.recurring-title { display: block; overflow-wrap: anywhere; font-weight: 600; }
.recurring-text { display: block; overflow-wrap: anywhere; color: #555; }
.recurring-row.paused .recurring-title, .recurring-row.paused .recurring-text { opacity: 0.55; }
#recurring-add { margin-top: 12px; min-height: 44px; }
#recurring-editor h2 { margin: 0; font-size: 18px; }
#recurring-editor .check { display: flex; align-items: center; gap: 8px; }
```

`public/liff/app.mjs`:

(ก) ใน import จาก `./format.mjs` เพิ่ม `recurringRows, describeRecurringFailure,` (ก่อน `LOGIN_REQUIRED_MESSAGE,`)

(ข) ใน `els` เพิ่มท้ายออบเจ็กต์

```js
  recurring: document.getElementById('recurring'),
  recurringRows: document.getElementById('recurring-rows'),
  recurringLoading: document.getElementById('recurring-loading'),
  recurringEmpty: document.getElementById('recurring-empty'),
  recurringError: document.getElementById('recurring-error'),
  recurringErrorText: document.getElementById('recurring-error-text'),
  recurringRetry: document.getElementById('recurring-retry'),
  recurringAdd: document.getElementById('recurring-add'),
  recurringEditor: document.getElementById('recurring-editor'),
  recurringForm: document.getElementById('recurring-form'),
  recurringEditorTitle: document.getElementById('recurring-editor-title'),
  recurringCategory: document.getElementById('recurring-category'),
  recurringAmount: document.getElementById('recurring-amount'),
  recurringDay: document.getElementById('recurring-day'),
  recurringNote: document.getElementById('recurring-note'),
  recurringActive: document.getElementById('recurring-active'),
  recurringBusy: document.getElementById('recurring-busy'),
  recurringEditorError: document.getElementById('recurring-editor-error'),
  recurringDelete: document.getElementById('recurring-delete'),
  recurringCancel: document.getElementById('recurring-cancel'),
  recurringSave: document.querySelector('#recurring-form button[type="submit"]'),
```

(ค) ใต้ `let budgetBusy = false;` เพิ่ม

```js
let recurringRules = [];
let editingRecurring = null;
let recurringBusy = false;
let deleteArmed = false;
```

(ง) แก้ `fillCategoryOptions` ให้เติมทั้งสอง select (แทนที่ทั้งฟังก์ชัน)

```js
function fillCategoryOptions() {
  const groups = groupCategoryOptions(categories);
  for (const select of [els.category, els.recurringCategory]) {
    select.replaceChildren();
    for (const type of ['expense', 'income']) {
      const group = document.createElement('optgroup');
      group.label = TYPE_LABELS[type];
      for (const category of groups[type]) {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        group.append(option);
      }
      select.append(group);
    }
  }
}
```

(จ) เพิ่มก่อน `async function boot() {`

```js
function renderRecurring(rules) {
  recurringRules = rules;
  els.recurringRows.replaceChildren();
  els.recurringLoading.hidden = true;
  els.recurringError.hidden = true;
  els.recurring.hidden = false;
  els.recurringEmpty.hidden = rules.length > 0;
  for (const row of recurringRows(rules, categories)) {
    const item = document.createElement('li');
    item.className = `recurring-row${row.active ? '' : ' paused'}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'recurring-button';
    const title = document.createElement('span');
    title.className = 'recurring-title';
    title.textContent = row.title;
    const text = document.createElement('span');
    text.className = 'recurring-text';
    text.textContent = row.text;
    button.append(title, text);
    button.addEventListener('click', () => openRecurringEditor(row));
    item.append(button);
    els.recurringRows.append(item);
  }
}

function showRecurringError(err) {
  els.recurringRows.replaceChildren();
  els.recurringLoading.hidden = true;
  els.recurringEmpty.hidden = true;
  els.recurring.hidden = false;
  const loginRequired = err instanceof ApiError && err.status === 401;
  els.recurringErrorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดรายการประจำไม่สำเร็จ';
  els.recurringRetry.hidden = loginRequired;
  els.recurringError.hidden = false;
}

// รายการประจำไม่ผูกกับเดือน โหลดแยกจากรายการและงบ และไม่ throw
async function loadRecurring() {
  try {
    const { rules } = await api.listRecurring();
    renderRecurring(rules);
  } catch (err) {
    showRecurringError(err);
  }
}

function openRecurringEditor(row = null) {
  editingRecurring = row;
  deleteArmed = false;
  els.recurringEditorTitle.textContent = row ? 'แก้รายการประจำ' : 'เพิ่มรายการประจำ';
  if (row) {
    els.recurringCategory.value = row.categoryId;
  } else if (els.recurringCategory.options.length > 0) {
    els.recurringCategory.selectedIndex = 0;
  }
  els.recurringAmount.value = row ? String(row.amount) : '';
  els.recurringDay.value = row ? String(row.dayOfMonth) : '';
  els.recurringNote.value = row ? row.note : '';
  els.recurringActive.checked = row ? row.active : true;
  els.recurringDelete.hidden = !row;
  els.recurringDelete.textContent = 'ลบ';
  els.recurringBusy.hidden = true;
  els.recurringEditorError.hidden = true;
  els.recurringEditor.showModal();
}

function setRecurringBusy(isBusy) {
  recurringBusy = isBusy;
  els.recurringSave.disabled = isBusy;
  els.recurringDelete.disabled = isBusy;
  els.recurringCancel.disabled = isBusy;
  els.recurringBusy.hidden = !isBusy;
  els.recurringEditorError.hidden = true;
}

async function runRecurringAction(action, kind) {
  if (recurringBusy) return;
  setRecurringBusy(true);
  let failure = null;
  try {
    await action();
  } catch (err) {
    failure = describeRecurringFailure(err instanceof ApiError ? err.status : undefined, kind);
  } finally {
    setRecurringBusy(false);
  }
  if (failure) {
    els.recurringEditorError.textContent = failure;
    els.recurringEditorError.hidden = false;
    return;
  }
  els.recurringEditor.close();
  await loadRecurring();
}

els.recurringAdd.addEventListener('click', () => openRecurringEditor(null));
els.recurringForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const body = {
    categoryId: els.recurringCategory.value,
    amount: Number(els.recurringAmount.value),
    dayOfMonth: Number(els.recurringDay.value),
    note: els.recurringNote.value,
    active: els.recurringActive.checked,
  };
  const target = editingRecurring;
  runRecurringAction(() => (target ? api.updateRecurring(target.id, body) : api.createRecurring(body)), 'save');
});
// กดลบสองครั้ง ครั้งแรกเปลี่ยนข้อความปุ่มเพื่อกันกดพลาด
els.recurringDelete.addEventListener('click', () => {
  if (!deleteArmed) {
    deleteArmed = true;
    els.recurringDelete.textContent = 'กดอีกครั้งเพื่อลบ';
    return;
  }
  const target = editingRecurring;
  runRecurringAction(() => api.deleteRecurring(target.id), 'delete');
});
els.recurringCancel.addEventListener('click', () => els.recurringEditor.close());
els.recurringEditor.addEventListener('cancel', (event) => {
  if (recurringBusy) event.preventDefault();
});
els.recurringEditor.addEventListener('close', () => {
  if (recurringBusy) els.recurringEditor.showModal();
});
els.recurringRetry.addEventListener('click', () => {
  els.recurringError.hidden = true;
  els.recurringLoading.hidden = false;
  loadRecurring();
});
```

(ฉ) ใน `boot()` แทนบรรทัด `await loadMonth({ reset: true });` ด้วย

```js
    await Promise.all([loadMonth({ reset: true }), loadRecurring()]);
```

`recurringRules` ที่ประกาศไว้ใช้เก็บสถานะล่าสุดเท่านั้น ถ้าไม่ถูกอ่านที่ไหน ให้ลบตัวแปรนี้และบรรทัด `recurringRules = rules;` ออก (ไม่ทิ้ง dead code)

- [ ] **Step 6: ตรวจ syntax และเทสต์ทั้งหมดของ LIFF**

Run: `node --check public/liff/app.mjs && npx vitest run public/liff`
Expected: ไม่มี error, PASS (หมายเหตุ: `node --check` กับ `.mjs` ที่ใช้ `document`/`liff` ตรวจเฉพาะ syntax)

- [ ] **Step 7: Commit**

```bash
git add public/liff
git commit -m "feat: add recurring rules section to the LIFF page" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: Manual check ในแอป LINE** ทำตามตาราง Browser check ด้านบน ผู้ใช้เป็นคนทำ (ต้องรัน SQL 009 และ restart เองก่อน) แล้วบันทึกผลลง STATE.md

---

### Task 7: ตรวจรวมกับ DB จริง, อัปเดต STATE และ SPEC

**Depends on:** Task 4, Task 6

**Files:**
- Modify: `work-memory/STATE.md`, `SPEC.md` (ถ้าข้อ 7 ในฟีเจอร์ต้องเติมรายละเอียด)

- [ ] **Step 1: รันทั้งชุดและ syntax check**

Run: `npm test && node --check index.js`
Expected: ทุกไฟล์ผ่าน (จำนวน test มากกว่า 507) ไม่มี error

- [ ] **Step 2: ผู้ใช้เตรียมเครื่อง (ทำเอง ตามลำดับ)**
  1. Supabase > SQL Editor > วาง `supabase/009_recurring.sql` ทั้งไฟล์ > Run ควรเห็น `Success. No rows returned`
  2. เช็กสิทธิ์: `select has_function_privilege('anon', 'public.apply_recurring_rule(uuid, date, text)', 'execute');` ต้องได้ `false`
  3. เปิดไฟล์ `.env` เพิ่มบรรทัด `CRON_SECRET=` ตามด้วยสตริงสุ่มยาวอย่างน้อย 32 ตัว (สร้างด้วย `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`)
  4. restart `npm start`

- [ ] **Step 3: Manual check endpoint** (ผู้ใช้ทำใน PowerShell; แทน `<SECRET>` ด้วยค่า CRON_SECRET)

| # | Action | Expected |
|---|---|---|
| 1 | สร้างกฎในหน้าเว็บ: วันที่ = วันนี้ จำนวน 1 บาท หมวดอะไรก็ได้ | กฎขึ้นในรายการ |
| 2 | `Invoke-RestMethod -Method Post http://localhost:3000/internal/recurring/run` (ไม่ใส่ header) | error 401 |
| 3 | รัน SQL: `update recurring_rules set last_run_on = null where note = '<โน้ตของกฎ>';` (ต้องทำเพราะกฎที่สร้างหลังวันครบกำหนดถูกตั้งว่าทำแล้ว) | `Success` |
| 4 | `Invoke-RestMethod -Method Post http://localhost:3000/internal/recurring/run -Headers @{ Authorization = 'Bearer <SECRET>' }` | ได้ `due=1 created=1 skipped=0 failed=0` และใน LINE ได้ push "บันทึกรายการประจำให้อัตโนมัติ" พร้อมปุ่ม "ยกเลิก" |
| 5 | เรียกคำสั่งข้อ 4 ซ้ำ | ได้ `due=0 created=0` (ไม่บันทึกซ้ำ ไม่มี push ใหม่) |
| 6 | เปิดหน้าเว็บ ดูเดือนนี้ | มีรายการ 1 บาทของกฎนั้นหนึ่งรายการ |
| 7 | กดปุ่ม "ยกเลิก" ใต้ push ใน LINE | บอทตอบว่ายกเลิกแล้ว รายการหายจากหน้าเว็บ |
| 8 | รัน SQL ข้อ 3 อีกครั้งแล้วเรียกข้อ 4 | ได้ `created=1` อีกครั้ง (ยืนยัน embed `users(line_user_id), categories(name)` ใช้ได้กับ DB จริง) แล้วลบกฎและรายการทดสอบทิ้งในหน้าเว็บ |

ถ้าข้อ 4 ได้ `failed=1` หรือ 500 ให้ดู log ของ server: ถ้าเป็น error ของ embed (`Could not find a relationship`) ให้แก้ `listDueRecurringRules` เป็น query แยกสำหรับ `users` และ `categories` แทน embed แล้วเพิ่มเทสต์ก่อนแก้

- [ ] **Step 4: อัปเดต `work-memory/STATE.md`** เพิ่มใน Done: ขั้นที่ 9 เสร็จ (วันที่, จำนวน test, ผล manual check, commit); แก้ Goal และ Next ให้ชี้ไปขั้นที่ 10 (Deploy บน Render + ตั้ง cron-job.org ให้เรียก `POST <โดเมนจริง>/internal/recurring/run` วันละครั้ง พร้อม header `Authorization: Bearer <CRON_SECRET>`; ต้องตั้ง `CRON_SECRET` ใน environment ของ Render ด้วย) เพิ่ม ticket ที่ยอมรับไว้: รอบที่พลาดจากเดือนก่อนไม่ย้อนเก็บ, ไม่เตือนงบหลังบันทึกรายการประจำ, ไม่มีเทสต์ DOM ของหน้าเว็บ, สร้างกฎหลังวันครบกำหนดจะเริ่มเดือนหน้า

- [ ] **Step 5: Commit**

```bash
git add work-memory/STATE.md SPEC.md
git commit -m "docs: record step 9 recurring rules results in STATE" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

ห้าม merge เข้า main จนกว่าผู้ใช้ยืนยันว่า manual check ผ่าน

---

## Self-Review

1. **Spec coverage:** ฟีเจอร์ 7 ใน SPEC (บันทึกอัตโนมัติตามรอบ) -> Task 1-4; `recurring_rules` fields ใน data model ครบ (`day_of_month`, `active`, `last_run_on`) -> Task 2; "ตัวกระตุ้นภายนอกเรียก endpoint ที่มี secret token" -> Task 4; push ต้องคำนึงโควตา -> ส่ง push ต่อกฎต่อเดือนเท่านั้น (ข้อความเดียวต่อรายการ); `transactions.source = 'recurring'` -> `apply_recurring_rule`; การตั้งค่าโดยผู้ใช้ -> Task 5-6 (ผู้ใช้เลือก LIFF อย่างเดียว) ไม่มี gap
2. **Placeholder scan:** ไม่มี TBD/TODO; ทุก step โค้ดมีโค้ดจริง; ข้อความ "ถ้า embed พังให้แก้..." เป็นแผนสำรองที่มีเงื่อนไขชัดเจนไม่ใช่ placeholder
3. **Test coverage:** ทุก task โค้ดระบุไฟล์เทสต์ colocate; Task 6 มี Browser check (manual ในแอป LINE เพราะ LIFF ต้องล็อกอิน LINE) ส่วน DOM ใน `app.mjs` ไม่มี unit test ตามแบบเดิมของโปรเจกต์ (ticket ยอมรับไว้ใน Task 7)
4. **Type consistency:** `Rule` (`id, type, categoryId, amount, note, dayOfMonth, active, lastRunOn`) ใช้ตรงกันใน repository, router, runner (เพิ่ม `userId, lineUserId, categoryName` เฉพาะ due list), format.mjs; `applyRecurringRule({ ruleId, dueOn, eventId })` ตรงกันใน Task 2/3; `lastRunOnAfterSave(lastRunOn, dayOfMonth, todayStr)` ตรงใน Task 1/5; event id `recurring:<ruleId>:<YYYY-MM>` ตรงใน Task 3 และ SQL ไม่ผูกรูปแบบ; ชื่อ `createPushText`, `createRecurringRunner`, `createRecurringRouter` ตรงกันใน Task 3/4
