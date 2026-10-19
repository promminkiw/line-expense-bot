# เป้าหมายการออม Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้สร้างเป้าออม (ชื่อ ยอดเป้า วันที่อยากถึงเป้า ไม่บังคับ) ในแท็บใหม่ "ออม" ของหน้าเว็บ ออมเข้าเป้าจากหน้าเว็บหรือพิมพ์ในแชต `ออม เที่ยวญี่ปุ่น 1000` ดูหลอดความคืบหน้า ลบรายการออมที่ใส่ผิด และปิดเป้า โดยยอดสะสมคำนวณด้วย SQL และไม่ปนกับรายรับรายจ่าย

**Architecture:** ตารางใหม่ `savings_goals` และ `goal_contributions` แยกจาก `transactions` ทั้งหมด (`supabase/023_savings_goals.sql`) ยอดสะสมมาจาก SQL function `goal_progress` และการออมเข้าเป้าผ่าน `add_goal_contribution` ที่ล็อกแถวเป้าแล้วคืนยอดสะสมใหม่ ฝั่ง server มี router แยก `src/goals/router.js` mount ที่ `/api/goals` แบบเดียวกับ bills/friends คำสั่งในแชตเป็น regex ล้วนใน `src/goals/chat.js` ไม่เรียก Claude ฝั่ง LIFF มี module ใหม่ `goals-format.mjs` (คำนวณการแสดงผล) และ `goals-panel.mjs` (แท็บออม) ต่อเข้า `app.mjs`

**Tech Stack:** Node.js 24 + Express 5, @line/bot-sdk, Supabase Postgres, LIFF (vanilla JS ES modules ใน `public/liff/`), vitest + PGlite + jsdom

## คำถามถึงผู้ใช้ก่อนเริ่ม (ตอบแล้ว 2026-10-19)

1. **แท็บที่ 6 "ออม" ในแถบล่างพอดีจอแคบไหม** ตอบแล้ว 2026-10-19: เพิ่มแท็บที่ 6 "ออม" และเปลี่ยนชื่อแท็บ "จัดการงบ" เป็น "งบ" (หัวหน้าแท็บยังเป็น "จัดการงบประมาณ") ผลวัดจริงใน headless Chrome วันเดียวกัน (6 แท็บ ตัวอักษร 13px ฟอนต์ของ Windows): จอ 320px ปุ่มเหลือพื้นที่ข้อความ 49px เมื่อ padding ข้าง 2px และ 53px เมื่อ padding ข้าง 0; "รอบเดือน" กว้าง 51.3px จึงตัดเป็น 2 บรรทัดถ้ายังมี padding ข้าง ส่วน "งบ" กว้าง 13.9px; Task 8 จึงตัด padding ข้างของปุ่มเป็น 0 และให้ชื่อแท็บอยู่บรรทัดเดียว แล้ววัดซ้ำที่ 320/360/390px
2. การตัดสินใจอื่นในแผนนี้ ผู้ใช้รับแล้ว 2026-10-19: ชื่อเป้าห้ามซ้ำแบบไม่สนตัวพิมพ์, เปิดอยู่ได้ไม่เกิน 20 เป้า, ไม่มีการลบเป้า (ปิดแทน), เป้าที่ปิดแล้วรับยอดออมเพิ่มไม่ได้แต่ลบรายการออมได้, คำสั่ง `ออม <ชื่อ> <ยอด>` ในแชตจับเฉพาะผู้ใช้ที่มีเป้าที่เปิดอยู่อย่างน้อยหนึ่งเป้า

## Global Constraints

- ตามแผนใหญ่ `docs/superpowers/plans/2026-10-18-roadmap-b.md` ข้อ 5 แต่ปรับหลังอ่านโค้ดจริง: (1) ชื่อเป้าห้ามซ้ำแบบไม่สนตัวพิมพ์ (unique index `(user_id, lower(name))` แทน `unique (user_id, name)`) เพราะแชตหาเป้าจากชื่อแบบไม่สนตัวพิมพ์ ถ้า "Japan" กับ "japan" อยู่ด้วยกันได้ แชตจะเลือกไม่ได้ (2) ใช้ทั้ง function `goal_progress(p_user_id)` (อ่านยอด) และ `add_goal_contribution(...)` (ออมเข้าเป้าแล้วคืนยอดสะสมใหม่ใน transaction เดียว) เพราะบอทต้องตอบยอดสะสมหลังออม และต้องกันการออมเข้าเป้าที่เพิ่งถูกปิด (3) ปุ่ม "ยกเลิก" ในแชตอ้างรายการออมด้วย event id ของข้อความ (`action=undo_saving&event=<webhookEventId>`, ลบตาม `line_event_id`) แบบเดียวกับปุ่มยกเลิกรายการเดิม (4) API ของเป้าอยู่ใน router แยก `src/goals/router.js` ส่งเข้า `createApiRouter` เป็น `goalsRouter` แบบ `friendsRouter`/`billsRouter` เพราะ `src/api/router.js` ยาว 459 บรรทัดแล้ว
- การตัดสินใจที่ roadmap ไม่ได้ระบุ: ออมเข้าเป้าที่ปิดแล้วไม่ได้ (409 `Goal closed`, แชตตอบว่าเป้าปิดแล้ว) แต่ลบรายการออมของเป้าที่ปิดแล้วได้; เป้าที่เปิดอยู่ได้ไม่เกิน 20 เป้า (`MAX_OPEN_GOALS`) เพราะแชตแสดงรายชื่อเป้าที่เปิดทั้งหมดเมื่อหาไม่เจอ (เป้าที่ปิดไม่นับ เพราะเฟสนี้ลบเป้าไม่ได้); ชื่อเป้ายาว 1-30 ตัวอักษร (นับ code point เหมือน `char_length` ของ Postgres); ยอดเป้าและยอดออมต่อครั้งอยู่ในช่วง 0.01-10,000,000 บาท ทศนิยมไม่เกิน 2 ตำแหน่ง (ใช้ `isValidAmount` เดิมและเพดานเดียวกับตารางอื่น); ไม่มีการลบเป้า (ใช้ปิดเป้า) และไม่มีการถอน (YAGNI ตาม roadmap)
- ลำดับงาน: ทำแผนนี้หลัง `feat/weekly-summary` (migration 021) และ `feat/daily-reminder` (migration 022) merge เข้า main แล้ว แต่ไม่พึ่งโค้ดของสองฟีเจอร์นั้น ก่อนเริ่มให้ตรวจว่า `'021_...sql'` และ `'022_daily_reminder.sql'` อยู่ใน `MIGRATIONS` ของ `src/db/sql-functions.test.js` แล้ว ถ้าชื่อไฟล์ 021/022 จริงต่างจาก roadmap ให้ใช้ชื่อจริงทุกที่ที่แผนนี้อ้าง; anchor ทุกตัวในแผนนี้ตรวจกับ main ณ 2026-10-19 หลัง merge การ์ดถามยอด (`18ee475`: `src/bot.js` require `buildTotalsFlex` จาก `./query/answer-flex` แทน `formatTotalsAnswer`) เลขบรรทัดอาจเลื่อนหลังสองฟีเจอร์นั้น ให้หาจากข้อความ anchor ที่ให้ไว้
- แถบล่างมี 6 แท็บตามที่ผู้ใช้ตัดสิน 2026-10-19: รายการ สรุป งบ รอบเดือน ออม โปรไฟล์ (เปลี่ยนแค่ `label` ของแท็บ `budgets` จาก "จัดการงบ" เป็น "งบ" ส่วน `title` "จัดการงบประมาณ" คงเดิม); ปุ่มแท็บไม่มี padding ข้าง และชื่อแท็บอยู่บรรทัดเดียว (วัดที่ 320/360/390px ใน Task 8)
- branch `feat/savings-goals` แตกจาก main ล่าสุด, TDD (เขียน test ให้ fail ก่อน), commit ทีละ task, merge เข้า main ในเครื่องด้วย `--no-ff` เมื่อจบ
- ห้าม `git push`, ห้ามรัน SQL ใน Supabase, ห้ามแก้ `.env`, ห้ามติดตั้งแพ็กเกจใหม่
- migration ใหม่คือ `supabase/023_savings_goals.sql` (ไม่มีไฟล์ 016) รันซ้ำได้ (`create table if not exists`, `create index if not exists`, `create or replace function`) ตารางใหม่เปิด RLS ไม่มี policy, function ใหม่ revoke จาก `public, anon, authenticated` แล้ว grant ให้ `service_role` และเพิ่มในเทสต์ `function permissions`; เพิ่มชื่อไฟล์ใน `MIGRATIONS` (ต่อจาก `'022_daily_reminder.sql'`), หัวไฟล์ `supabase/schema.sql`, ลำดับรัน SQL และประโยค "ไฟล์ล่าสุด" ใน README
- โค้ดใหม่อ่านตารางใหม่ตั้งแต่ request แรกของแท็บออมและคำสั่ง ออม จึงต้องรัน `023_savings_goals.sql` ใน Supabase ก่อน push (README ต้องบอก)
- ตัวเลขยอดสะสมทุกตัวคำนวณด้วย SQL; เปอร์เซ็นต์ในข้อความและหลอดคิดใน JS จากยอดที่ SQL คืนแบบเดียวกับ `budgetRows` (สตางค์ ปัดลง); server กรอง `user_id` ทุก query
- คำสั่งออมในแชต: ไม่เรียก Claude, อยู่หลัง `claimEvent` และก่อน fixed replies, ไม่นับ rate limit; จับเฉพาะผู้ใช้ที่มีเป้าที่เปิดอยู่อย่างน้อยหนึ่งเป้า (ตัดสิน 2026-10-19) ถ้าไม่มีเป้าที่เปิดอยู่ ข้อความไปทางปกติทั้งหมด (fixed replies, rate limit, ถามยอด, บันทึกรายการ) เช่น "ออมสิน 1000" ถูกบันทึกเป็นรายการเหมือนเดิม; อ่านรายชื่อเป้าไม่ได้ตอบข้อความระบบมีปัญหา (ไม่เดาว่าเป็นรายการ เพราะอาจกลายเป็นรายจ่ายผิด)
- คอมเมนต์ในโค้ดภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log ภาษาอังกฤษ; ไม่มี emoji ในโค้ด คอมเมนต์ log commit (ข้อความช่วยเหลือ `HELP_REPLY` เป็นข้อยกเว้นเดียวที่ใช้ emoji ได้)
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย
- ไฟล์ใหม่ใช้ CRLF เหมือนไฟล์เดิม (git autocrlf=true จัดการให้ตอน commit)
- เทสต์อยู่คู่ไฟล์: `foo.js` -> `foo.test.js`, LIFF ใช้ `foo.test.mjs` หรือ jsdom ใน `public/liff/app.dom.test.mjs`; LIFF ต้องล็อกอิน LINE จึงตรวจ UI ด้วยมือในแอป LINE ตามตาราง LINE check
- ก่อนจบ: `npm test`, `npm run lint`, `node --check index.js` ผ่านทั้งหมด
- commit message ภาษาอังกฤษ ขึ้นต้นด้วยกริยา และลงท้ายด้วยบรรทัดว่างตามด้วยสองบรรทัด `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` และ `Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC`

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/023_savings_goals.sql` (ใหม่) | ตาราง `savings_goals`, `goal_contributions`, function `goal_progress`, `add_goal_contribution` |
| `supabase/schema.sql` | หัวไฟล์บอกลำดับรัน |
| `src/db/repository.js` | `listGoals`, `createGoal`, `updateGoal`, `addGoalContribution`, `listGoalContributions`, `deleteGoalContribution`, `deleteGoalContributionsByEvent` |
| `src/goals/validate.js` (ใหม่) | ตรวจ body ของ API เป้าและรายการออม |
| `src/goals/router.js` (ใหม่) | `/api/goals` ทุกเส้น |
| `src/api/router.js` | รับ `goalsRouter` แล้ว mount ที่ `/goals` |
| `index.js` | สร้าง `createGoalsRouter({ repository })` ส่งเข้า `createApiRouter` |
| `src/goals/chat.js` (ใหม่) | อ่านคำสั่ง `ออม <ชื่อ> <ยอด>`, มีเป้าที่เปิดอยู่ไหม, หาเป้า, ข้อความตอบ |
| `src/bot.js` | เส้นทางคำสั่งออมใน `handleText` (เฉพาะผู้ใช้ที่มีเป้าที่เปิดอยู่), postback `undo_saving` |
| `src/menu/fixed-replies.js` | หัวข้อออมเงินในข้อความช่วยเหลือ |
| `public/liff/api.mjs` | method ของ API เป้า |
| `public/liff/goals-format.mjs` (ใหม่) | เปอร์เซ็นต์ แถวเป้า แถวประวัติ ข้อความ error |
| `public/liff/tabs.mjs` | แท็บ `goals` และชื่อแท็บ `budgets` เป็น "งบ" |
| `public/liff/goals-panel.mjs` (ใหม่) | แท็บออม: รายการเป้า สร้าง/แก้/ปิดเป้า รายละเอียด ออมเพิ่ม ประวัติ ลบ |
| `public/liff/index.html` | ไอคอน `tab-goal`, `#panel-goals`, dialog `#goal-editor`, `#goal-detail` |
| `public/liff/style.css` | การ์ดเป้า ชื่อแท็บบรรทัดเดียว |
| `public/liff/app.mjs` | สร้าง goals panel และโหลดเมื่อเข้าแท็บ |

---

### Task 1: ตารางและ SQL function ของเป้าออม (023)

**Depends on:** none

**Files:**
- Create: `supabase/023_savings_goals.sql`
- Modify: `supabase/schema.sql:1` (บรรทัดหัวไฟล์ที่บอกลำดับการรัน)
- Test: `src/db/sql-functions.test.js` (เพิ่มใน `MIGRATIONS`, describe ใหม่, แถวใน `function permissions`)

**Interfaces:**
- Produces:
  - ตาราง `public.savings_goals (id uuid, user_id uuid, name text 1-30 ตัว, target_amount numeric(12,2) 0<x<=10,000,000, target_date date null, closed boolean default false, created_at)` unique `(id, user_id)` และ unique index `(user_id, lower(name))`
  - ตาราง `public.goal_contributions (id uuid, goal_id uuid, user_id uuid, amount numeric(12,2) 0<x<=10,000,000, occurred_on date, line_event_id text null -> line_events, created_at)` FK `(goal_id, user_id)` -> `savings_goals (id, user_id)` on delete cascade
  - `public.goal_progress(p_user_id uuid)` returns table `(id uuid, name text, target_amount numeric, target_date date, closed boolean, saved numeric, contribution_count bigint)` เป้าที่เปิดก่อน แล้วเรียงตาม `created_at`, `id`
  - `public.add_goal_contribution(p_user_id uuid, p_goal_id uuid, p_amount numeric, p_occurred_on date, p_line_event_id text)` returns table `(status text, contribution_id uuid, saved numeric)` หนึ่งแถว: `status` เป็น `'ok'` (พร้อม id และยอดสะสมหลังเพิ่ม) `'not_found'` (ไม่ใช่เป้าของผู้ใช้คนนี้) หรือ `'closed'` (สองกรณีหลัง id และ saved เป็น null และไม่เพิ่มแถว)

- [ ] **Step 1: เพิ่มไฟล์ใน MIGRATIONS และเขียนเทสต์ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่ม `'023_savings_goals.sql'` ต่อจาก `'022_daily_reminder.sql'` ใน `MIGRATIONS` (021 และ 022 ต้องอยู่ในรายการแล้วจากฟีเจอร์ก่อนหน้า):

```js
  '022_daily_reminder.sql',
  '023_savings_goals.sql',
];
```

เพิ่ม describe ใหม่ก่อน `describe('function permissions', ...)`:

```js
describe('023_savings_goals.sql', () => {
  async function createGoal(userId, name, target = 1000, { closed = false, createdAt = '2026-10-01T00:00:00Z', targetDate = null } = {}) {
    return (
      await one(
        'insert into savings_goals (user_id, name, target_amount, target_date, closed, created_at) values ($1, $2, $3, $4, $5, $6) returning id',
        [userId, name, target, targetDate, closed, createdAt],
      )
    ).id;
  }

  async function contribute(goalId, userId, amount, occurredOn = '2026-10-10') {
    await db.query('insert into goal_contributions (goal_id, user_id, amount, occurred_on) values ($1, $2, $3, $4)', [goalId, userId, amount, occurredOn]);
  }

  async function progress(userId) {
    const result = await rows(
      'select id, name, target_amount, target_date::text as target_date, closed, saved, contribution_count from goal_progress($1)',
      [userId],
    );
    return result.map(numbers);
  }

  it('totals each goal of this user, open goals first in the order they were made', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    const trip = await createGoal(user, 'เที่ยวญี่ปุ่น', 50000, { createdAt: '2026-10-02T00:00:00Z', targetDate: '2026-12-31' });
    const phone = await createGoal(user, 'มือถือ', 30000, { closed: true, createdAt: '2026-09-01T00:00:00Z' });
    const fund = await createGoal(user, 'กองทุนฉุกเฉิน', 10000, { createdAt: '2026-10-01T00:00:00Z' });
    const otherGoal = await createGoal(other, 'เที่ยวญี่ปุ่น', 1000);
    await contribute(trip, user, 1000);
    await contribute(trip, user, 5000.5);
    await contribute(phone, user, 30000);
    await contribute(otherGoal, other, 999);

    expect(await progress(user)).toEqual([
      { id: fund, name: 'กองทุนฉุกเฉิน', target_amount: 10000, target_date: null, closed: false, saved: 0, contribution_count: 0 },
      { id: trip, name: 'เที่ยวญี่ปุ่น', target_amount: 50000, target_date: '2026-12-31', closed: false, saved: 6000.5, contribution_count: 2 },
      { id: phone, name: 'มือถือ', target_amount: 30000, target_date: null, closed: true, saved: 30000, contribution_count: 1 },
    ]);
  });

  // แชตหาเป้าจากชื่อแบบไม่สนตัวพิมพ์ ชื่อที่ต่างกันแค่ตัวพิมพ์จึงต้องชนกัน
  it('does not let one user have two goals with the same name ignoring letter case', async () => {
    const user = await createUser('U1');
    const other = await createUser('U2');
    await createGoal(user, 'Japan');
    await createGoal(other, 'Japan');

    await expect(createGoal(user, 'japan')).rejects.toThrow('duplicate key');
  });

  it('refuses a bad name, an amount outside 0-10,000,000 and a contribution to a goal of another user', async () => {
    const user = await createUser('U1');
    const stranger = await createUser('U2');
    const goal = await createGoal(user, 'เที่ยว');
    const insertGoal = 'insert into savings_goals (user_id, name, target_amount) values ($1, $2, $3)';
    const insertContribution = "insert into goal_contributions (goal_id, user_id, amount, occurred_on) values ($1, $2, $3, '2026-10-10')";
    const bad = [
      [insertGoal, [user, '', 1000], 'check constraint'],
      [insertGoal, [user, 'ก'.repeat(31), 1000], 'check constraint'],
      [insertGoal, [user, 'ศูนย์', 0], 'check constraint'],
      [insertGoal, [user, 'เกิน', 10000000.01], 'check constraint'],
      [insertContribution, [goal, user, 0], 'check constraint'],
      [insertContribution, [goal, user, 10000000.01], 'check constraint'],
      [insertContribution, [goal, stranger, 100], 'foreign key'],
    ];

    for (const [sql, params, message] of bad) {
      await db.exec('savepoint bad_row');
      await expect(db.query(sql, params)).rejects.toThrow(message);
      await db.exec('rollback to savepoint bad_row');
    }
  });

  it('adds a contribution with its chat event and returns the new saved total', async () => {
    const user = await createUser('U1');
    const goal = await createGoal(user, 'เที่ยว', 5000);
    await contribute(goal, user, 1000);
    await db.query('insert into line_events (webhook_event_id, user_id) values ($1, $2)', ['ev-1', user]);

    const result = numbers(await one('select * from add_goal_contribution($1, $2, $3, $4, $5)', [user, goal, 250.5, '2026-10-19', 'ev-1']));

    expect(result.status).toBe('ok');
    expect(result.saved).toBe(1250.5);
    const saved = await rows('select amount, occurred_on::text as occurred_on, line_event_id from goal_contributions where id = $1', [
      result.contribution_id,
    ]);
    expect(saved.map(numbers)).toEqual([{ amount: 250.5, occurred_on: '2026-10-19', line_event_id: 'ev-1' }]);
  });

  it('answers not_found for a goal of another user and closed for a closed goal, adding nothing', async () => {
    const user = await createUser('U1');
    const stranger = await createUser('U2');
    const goal = await createGoal(user, 'เที่ยว');
    const closed = await createGoal(user, 'มือถือ', 1000, { closed: true });

    expect(await one('select * from add_goal_contribution($1, $2, 100, $3, null)', [stranger, goal, '2026-10-19'])).toEqual({
      status: 'not_found',
      contribution_id: null,
      saved: null,
    });
    expect(await one('select * from add_goal_contribution($1, $2, 100, $3, null)', [user, closed, '2026-10-19'])).toEqual({
      status: 'closed',
      contribution_id: null,
      saved: null,
    });
    expect(Number((await one('select count(*) from goal_contributions')).count)).toBe(0);
  });

  it('removes the goals and contributions of a deleted user', async () => {
    const user = await createUser('U1');
    const goal = await createGoal(user, 'เที่ยว');
    await contribute(goal, user, 100);

    await db.query('delete from users where id = $1', [user]);

    expect(Number((await one('select count(*) from savings_goals')).count)).toBe(0);
    expect(Number((await one('select count(*) from goal_contributions')).count)).toBe(0);
  });

  it('turns on row level security for both tables', async () => {
    const result = await rows(
      "select relname, relrowsecurity from pg_class where oid in ('public.savings_goals'::regclass, 'public.goal_contributions'::regclass) order by relname",
    );

    expect(result).toEqual([
      { relname: 'goal_contributions', relrowsecurity: true },
      { relname: 'savings_goals', relrowsecurity: true },
    ]);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('023_savings_goals.sql'))).resolves.toBeDefined();
  });
});
```

ใน `describe('function permissions', ...)` เพิ่มสองแถวท้าย array `calls`:

```js
    ['goal_progress', 'select * from goal_progress(gen_random_uuid())'],
    ['add_goal_contribution', "select * from add_goal_contribution(gen_random_uuid(), gen_random_uuid(), 1, '2026-10-19', null)"],
  ];
```

(service_role เรียก `add_goal_contribution` กับ id สุ่มได้แถว `not_found` จึงเข้ากิ่ง `resolves.toBeDefined()` เดิม ไม่ต้องแก้ส่วนนั้น)

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL ตอน `beforeAll` เพราะอ่านไฟล์ `supabase/023_savings_goals.sql` ไม่เจอ (ENOENT)

- [ ] **Step 3: เขียน migration**

สร้าง `supabase/023_savings_goals.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 022 ก่อน push โค้ดเป้าหมายการออม รันซ้ำได้
-- แยกจาก transactions ทั้งหมด เพราะเงินออมไม่ใช่รายจ่าย และต้องไม่กระทบยอดคงเหลือสะสม

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  target_amount numeric(12, 2) not null check (target_amount > 0 and target_amount <= 10000000),
  target_date date,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  -- ให้ goal_contributions อ้างอิง (id, user_id) คู่กัน กันการออมเข้าเป้าของผู้ใช้คนอื่น
  unique (id, user_id)
);

-- แชตหาเป้าจากชื่อแบบไม่สนตัวพิมพ์ ชื่อที่ต่างกันแค่ตัวพิมพ์จึงห้ามซ้ำ
create unique index if not exists savings_goals_user_name_idx on public.savings_goals (user_id, lower(name));

create table if not exists public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null,
  user_id uuid not null references public.users (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  occurred_on date not null,
  line_event_id text references public.line_events (webhook_event_id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);

create index if not exists goal_contributions_goal_idx on public.goal_contributions (goal_id, user_id);
-- ปุ่มยกเลิกในแชตลบรายการออมจาก event id ของข้อความ
create index if not exists goal_contributions_event_idx on public.goal_contributions (user_id, line_event_id)
  where line_event_id is not null;

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.savings_goals enable row level security;
alter table public.goal_contributions enable row level security;

create or replace function public.goal_progress(p_user_id uuid)
returns table (
  id uuid,
  name text,
  target_amount numeric,
  target_date date,
  closed boolean,
  saved numeric,
  contribution_count bigint
)
language sql
stable
set search_path = public
as $$
  select g.id, g.name, g.target_amount, g.target_date, g.closed, coalesce(sum(c.amount), 0), count(c.id)
  from public.savings_goals g
  left join public.goal_contributions c on c.goal_id = g.id and c.user_id = g.user_id
  where g.user_id = p_user_id
  group by g.id
  order by g.closed, g.created_at, g.id
$$;

revoke execute on function public.goal_progress(uuid) from public, anon, authenticated;
grant execute on function public.goal_progress(uuid) to service_role;

-- ล็อกแถวเป้าก่อนเพิ่ม กันการปิดเป้าแทรกระหว่างตรวจสถานะกับเพิ่มรายการ
create or replace function public.add_goal_contribution(
  p_user_id uuid,
  p_goal_id uuid,
  p_amount numeric,
  p_occurred_on date,
  p_line_event_id text
)
returns table (status text, contribution_id uuid, saved numeric)
language plpgsql
set search_path = public
as $$
declare
  v_closed boolean;
  v_id uuid;
begin
  select g.closed into v_closed
  from public.savings_goals g
  where g.id = p_goal_id and g.user_id = p_user_id
  for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::numeric;
    return;
  end if;
  if v_closed then
    return query select 'closed'::text, null::uuid, null::numeric;
    return;
  end if;

  insert into public.goal_contributions (goal_id, user_id, amount, occurred_on, line_event_id)
  values (p_goal_id, p_user_id, p_amount, p_occurred_on, p_line_event_id)
  returning id into v_id;

  return query
  select 'ok'::text, v_id, coalesce(sum(c.amount), 0)
  from public.goal_contributions c
  where c.goal_id = p_goal_id and c.user_id = p_user_id;
end
$$;

revoke execute on function public.add_goal_contribution(uuid, uuid, numeric, date, text) from public, anon, authenticated;
grant execute on function public.add_goal_contribution(uuid, uuid, numeric, date, text) to service_role;
```

ใน `supabase/schema.sql` บรรทัดแรก (ข้อความที่แผนเตือนลืมจดเขียนไว้) เปลี่ยน `021_notification_settings.sql และ 022_daily_reminder.sql ต่อตามลำดับ` เป็น `021_notification_settings.sql, 022_daily_reminder.sql และ 023_savings_goals.sql ต่อตามลำดับ` (คงส่วน `(ไม่มี 016 เพราะถูกถอยออก)` ไว้ท้ายเหมือนเดิม)

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งไฟล์ รวม `023_savings_goals.sql` 8 เทสต์ และ `does not let anon or authenticated call goal_progress` / `add_goal_contribution` กับ `lets service_role call ...` ของทั้งสอง function

- [ ] **Step 5: Commit**

```bash
git add supabase/023_savings_goals.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add savings goal tables and progress functions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 2: repository ของเป้าออม

**Depends on:** none (ใช้ชื่อตาราง RPC และพารามิเตอร์ตาม Interfaces ของ Task 1)

**Files:**
- Modify: `src/db/repository.js` (ค่าคงที่และ `toGoal` ด้านบน, function ใหม่ต่อจาก `queryTotals`, ชื่อใน object ที่ return ท้ายไฟล์)
- Test: `src/db/repository.test.js` (describe ใหม่ท้ายไฟล์)

**Interfaces:**
- Consumes: ตาราง `savings_goals`, `goal_contributions`, RPC `goal_progress`, `add_goal_contribution` (Task 1)
- Produces (ทุกตัว throw `DatabaseError` เมื่อ Supabase คืน error ที่ไม่ได้แปลงเป็น status):
  - `Goal = { id: string, name: string, targetAmount: number, targetDate: 'YYYY-MM-DD' | null, closed: boolean }`
  - `listGoals(userId) => Promise<Array<Goal & { saved: number, contributionCount: number }>>`
  - `createGoal(userId, { name, targetAmount, targetDate }) => Promise<{ status: 'ok', goal: Goal } | { status: 'duplicate' }>`
  - `updateGoal(userId, id, { name?, targetAmount?, targetDate?, closed? }) => Promise<{ status: 'ok', goal: Goal } | { status: 'duplicate' } | { status: 'not_found' }>`
  - `addGoalContribution(userId, goalId, { amount, occurredOn, lineEventId = null }) => Promise<{ status: 'ok' | 'not_found' | 'closed', contributionId: string | null, saved: number | null }>`
  - `listGoalContributions(userId, goalId) => Promise<Array<{ id, amount: number, occurredOn }>>` ใหม่สุดก่อน ไม่เกิน 100 แถว
  - `deleteGoalContribution(userId, goalId, id) => Promise<boolean>`
  - `deleteGoalContributionsByEvent(userId, webhookEventId) => Promise<number>`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ท้าย `src/db/repository.test.js`:

```js
describe('repository savings goals', () => {
  const GOAL_ROW = { id: 'g1', name: 'เที่ยว', target_amount: '50000.00', target_date: null, closed: false };

  it('lists goals with their saved totals from the SQL function', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [{ ...GOAL_ROW, target_date: '2026-12-31', saved: '6000.50', contribution_count: '2' }],
      error: null,
    });

    const goals = await createRepository(supabase).listGoals('user-1');

    expect(goals).toEqual([
      { id: 'g1', name: 'เที่ยว', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000.5, contributionCount: 2 },
    ]);
    expect(calls).toEqual([['rpc', 'goal_progress', { p_user_id: 'user-1' }]]);
  });

  it('creates a goal for this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: GOAL_ROW, error: null });

    const result = await createRepository(supabase).createGoal('user-1', { name: 'เที่ยว', targetAmount: 50000, targetDate: null });

    expect(result).toEqual({ status: 'ok', goal: { id: 'g1', name: 'เที่ยว', targetAmount: 50000, targetDate: null, closed: false } });
    expect(calls).toEqual([
      ['from', 'savings_goals'],
      ['insert', { user_id: 'user-1', name: 'เที่ยว', target_amount: 50000, target_date: null }],
      ['select', 'id, name, target_amount, target_date, closed'],
      ['single'],
    ]);
  });

  it('reports a duplicate name when creating or renaming', async () => {
    const duplicate = () => fakeSupabase({ data: null, error: { message: 'dup', code: '23505' } }).supabase;

    expect(await createRepository(duplicate()).createGoal('user-1', { name: 'เที่ยว', targetAmount: 1, targetDate: null })).toEqual({
      status: 'duplicate',
    });
    expect(await createRepository(duplicate()).updateGoal('user-1', 'g1', { name: 'เที่ยว' })).toEqual({ status: 'duplicate' });
  });

  it('updates only the given fields of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ ...GOAL_ROW, name: 'ทริป', closed: true }], error: null });

    const result = await createRepository(supabase).updateGoal('user-1', 'g1', { name: 'ทริป', closed: true });

    expect(result).toEqual({ status: 'ok', goal: { id: 'g1', name: 'ทริป', targetAmount: 50000, targetDate: null, closed: true } });
    expect(calls).toEqual([
      ['from', 'savings_goals'],
      ['update', { name: 'ทริป', closed: true }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'id', 'g1'],
      ['select', 'id, name, target_amount, target_date, closed'],
    ]);
  });

  it('maps the target fields to their columns and answers not_found when no row changed', async () => {
    const { supabase, calls } = fakeSupabase({ data: [], error: null });

    const result = await createRepository(supabase).updateGoal('user-1', 'g1', { targetAmount: 900, targetDate: '2027-01-31' });

    expect(result).toEqual({ status: 'not_found' });
    expect(calls[1]).toEqual(['update', { target_amount: 900, target_date: '2027-01-31' }]);
  });

  it('adds a contribution through the SQL function', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ status: 'ok', contribution_id: 'gc1', saved: '1250.50' }], error: null });

    const result = await createRepository(supabase).addGoalContribution('user-1', 'g1', {
      amount: 250.5,
      occurredOn: '2026-10-19',
      lineEventId: 'ev1',
    });

    expect(result).toEqual({ status: 'ok', contributionId: 'gc1', saved: 1250.5 });
    expect(calls).toEqual([
      [
        'rpc',
        'add_goal_contribution',
        { p_user_id: 'user-1', p_goal_id: 'g1', p_amount: 250.5, p_occurred_on: '2026-10-19', p_line_event_id: 'ev1' },
      ],
    ]);
  });

  it('sends no event id from the web and passes a refusal through', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ status: 'closed', contribution_id: null, saved: null }], error: null });

    const result = await createRepository(supabase).addGoalContribution('user-1', 'g1', { amount: 100, occurredOn: '2026-10-19' });

    expect(result).toEqual({ status: 'closed', contributionId: null, saved: null });
    expect(calls[0][2].p_line_event_id).toBeNull();
  });

  it('lists the latest contributions of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'gc2', amount: '1000.00', occurred_on: '2026-10-14' }], error: null });

    expect(await createRepository(supabase).listGoalContributions('user-1', 'g1')).toEqual([
      { id: 'gc2', amount: 1000, occurredOn: '2026-10-14' },
    ]);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['select', 'id, amount, occurred_on'],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'goal_id', 'g1'],
      ['order', 'occurred_on', { ascending: false }],
      ['order', 'created_at', { ascending: false }],
      ['limit', 100],
    ]);
  });

  it('deletes one contribution of this user goal', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteGoalContribution('user-1', 'g1', 'gc1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'goal_id', 'g1'],
      ['eq', 'id', 'gc1'],
    ]);
  });

  it('answers false when the contribution is not there', async () => {
    const { supabase } = fakeSupabase({ count: 0, error: null });

    expect(await createRepository(supabase).deleteGoalContribution('user-1', 'g1', 'gc1')).toBe(false);
  });

  it('deletes the contributions of a chat message for this user', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).deleteGoalContributionsByEvent('user-1', 'ev1')).toBe(1);
    expect(calls).toEqual([
      ['from', 'goal_contributions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'line_event_id', 'ev1'],
    ]);
  });

  it.each([
    ['listGoals', (repo) => repo.listGoals('user-1')],
    ['createGoal', (repo) => repo.createGoal('user-1', { name: 'x', targetAmount: 1, targetDate: null })],
    ['updateGoal', (repo) => repo.updateGoal('user-1', 'g1', { closed: true })],
    ['addGoalContribution', (repo) => repo.addGoalContribution('user-1', 'g1', { amount: 1, occurredOn: '2026-10-19' })],
    ['listGoalContributions', (repo) => repo.listGoalContributions('user-1', 'g1')],
    ['deleteGoalContribution', (repo) => repo.deleteGoalContribution('user-1', 'g1', 'gc1')],
    ['deleteGoalContributionsByEvent', (repo) => repo.deleteGoalContributionsByEvent('user-1', 'ev1')],
  ])('throws DatabaseError when %s fails', async (name, run) => {
    const { supabase } = fakeSupabase({ data: null, count: null, error: { message: 'boom' } });

    const promise = run(createRepository(supabase));

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow(`Database ${name} failed: boom`);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/repository.test.js -t "savings goals"`
Expected: FAIL `createRepository(...).listGoals is not a function` (และ function อื่นในกลุ่มเดียวกัน)

- [ ] **Step 3: เขียนโค้ด**

ใน `src/db/repository.js` ต่อจาก `const BILL_LIST_LIMIT = 50;` เพิ่ม:

```js
const GOAL_COLUMNS = 'id, name, target_amount, target_date, closed';
// ประวัติการออมในหน้าเว็บแสดงเฉพาะของล่าสุด กันหน้าโหลดช้าเมื่อออมมานาน
const GOAL_CONTRIBUTION_LIMIT = 100;
```

ต่อจาก function `toCategory` เพิ่ม:

```js
function toGoal(row) {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    targetDate: row.target_date,
    closed: row.closed,
  };
}
```

ใน `createRepository` ต่อจาก `queryTotals` เพิ่ม:

```js
  async function listGoals(userId) {
    const { data, error } = await supabase.rpc('goal_progress', { p_user_id: userId });
    throwIfError('listGoals', error);
    return data.map((row) => ({ ...toGoal(row), saved: Number(row.saved), contributionCount: Number(row.contribution_count) }));
  }

  // ชื่อซ้ำของผู้ใช้คนเดียวกันชน unique index จึงคืน duplicate ให้ API ตอบ 409
  async function createGoal(userId, { name, targetAmount, targetDate }) {
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({ user_id: userId, name, target_amount: targetAmount, target_date: targetDate })
      .select(GOAL_COLUMNS)
      .single();
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('createGoal', error);
    return { status: 'ok', goal: toGoal(data) };
  }

  async function updateGoal(userId, id, fields) {
    const changes = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.targetAmount !== undefined) changes.target_amount = fields.targetAmount;
    if (fields.targetDate !== undefined) changes.target_date = fields.targetDate;
    if (fields.closed !== undefined) changes.closed = fields.closed;
    const { data, error } = await supabase
      .from('savings_goals')
      .update(changes)
      .eq('user_id', userId)
      .eq('id', id)
      .select(GOAL_COLUMNS);
    if (error && error.code === UNIQUE_VIOLATION) {
      return { status: 'duplicate' };
    }
    throwIfError('updateGoal', error);
    return data.length > 0 ? { status: 'ok', goal: toGoal(data[0]) } : { status: 'not_found' };
  }

  async function addGoalContribution(userId, goalId, { amount, occurredOn, lineEventId = null }) {
    const { data, error } = await supabase.rpc('add_goal_contribution', {
      p_user_id: userId,
      p_goal_id: goalId,
      p_amount: amount,
      p_occurred_on: occurredOn,
      p_line_event_id: lineEventId,
    });
    throwIfError('addGoalContribution', error);
    const row = data[0];
    return { status: row.status, contributionId: row.contribution_id, saved: row.saved === null ? null : Number(row.saved) };
  }

  async function listGoalContributions(userId, goalId) {
    const { data, error } = await supabase
      .from('goal_contributions')
      .select('id, amount, occurred_on')
      .eq('user_id', userId)
      .eq('goal_id', goalId)
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(GOAL_CONTRIBUTION_LIMIT);
    throwIfError('listGoalContributions', error);
    return data.map((row) => ({ id: row.id, amount: Number(row.amount), occurredOn: row.occurred_on }));
  }

  async function deleteGoalContribution(userId, goalId, id) {
    const { count, error } = await supabase
      .from('goal_contributions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('goal_id', goalId)
      .eq('id', id);
    throwIfError('deleteGoalContribution', error);
    return count > 0;
  }

  async function deleteGoalContributionsByEvent(userId, webhookEventId) {
    const { count, error } = await supabase
      .from('goal_contributions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('line_event_id', webhookEventId);
    throwIfError('deleteGoalContributionsByEvent', error);
    return count;
  }
```

ใน object ที่ return ท้ายไฟล์ ต่อจาก `queryTotals,` เพิ่ม:

```js
    listGoals,
    createGoal,
    updateGoal,
    addGoalContribution,
    listGoalContributions,
    deleteGoalContribution,
    deleteGoalContributionsByEvent,
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: let the repository read and change savings goals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 3: ตรวจ body ของ API เป้าออม

**Depends on:** none

**Files:**
- Create: `src/goals/validate.js`
- Test: `src/goals/validate.test.js`

**Interfaces:**
- Consumes: `isValidAmount` จาก `src/api/validate.js`, `isValidCalendarDate` จาก `src/utils/date.js`
- Produces (คืน `{ ok: true, value }` หรือ `{ ok: false, error }`; error เป็น `'Invalid body' | 'Invalid name' | 'Invalid amount' | 'Invalid date' | 'Invalid closed'`):
  - `validateGoalCreate(body) => value { name: string (trim แล้ว), targetAmount: number, targetDate: string | null }`
  - `validateGoalUpdate(body) => value` มีเฉพาะ field ที่ส่งมาจาก `name`, `targetAmount`, `targetDate`, `closed` (อย่างน้อยหนึ่ง field)
  - `validateContribution(body) => value { amount: number, occurredOn: string }`
  - `MAX_GOAL_NAME_LENGTH = 30`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/goals/validate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateGoalCreate, validateGoalUpdate, validateContribution, MAX_GOAL_NAME_LENGTH } = require('./validate.js');

describe('validateGoalCreate', () => {
  it('trims the name and leaves the date empty when it is not sent', () => {
    expect(validateGoalCreate({ name: '  เที่ยวญี่ปุ่น  ', targetAmount: 50000 })).toEqual({
      ok: true,
      value: { name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: null },
    });
  });

  it('keeps a valid wished date', () => {
    expect(validateGoalCreate({ name: 'คอนโด', targetAmount: 1500000.5, targetDate: '2027-06-30' }).value.targetDate).toBe('2027-06-30');
  });

  it('counts the name length in characters, not bytes', () => {
    expect(validateGoalCreate({ name: 'ก'.repeat(MAX_GOAL_NAME_LENGTH), targetAmount: 1 }).ok).toBe(true);
    expect(validateGoalCreate({ name: 'ก'.repeat(MAX_GOAL_NAME_LENGTH + 1), targetAmount: 1 })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it.each([[undefined], [123], ['   '], ['เที่ยว\nญี่ปุ่น']])('refuses the name %j', (name) => {
    expect(validateGoalCreate({ name, targetAmount: 1 })).toEqual({ ok: false, error: 'Invalid name' });
  });

  it.each([[0], [-1], [10000000.01], [1.001], ['100'], [undefined]])('refuses the target %j', (targetAmount) => {
    expect(validateGoalCreate({ name: 'เที่ยว', targetAmount })).toEqual({ ok: false, error: 'Invalid amount' });
  });

  it.each([['2026-02-30'], [''], [20261231]])('refuses the date %j', (targetDate) => {
    expect(validateGoalCreate({ name: 'เที่ยว', targetAmount: 1, targetDate })).toEqual({ ok: false, error: 'Invalid date' });
  });

  it('refuses a body that is not an object', () => {
    expect(validateGoalCreate(undefined)).toEqual({ ok: false, error: 'Invalid body' });
  });
});

describe('validateGoalUpdate', () => {
  it('returns only the fields that were sent', () => {
    expect(validateGoalUpdate({ closed: true })).toEqual({ ok: true, value: { closed: true } });
    expect(validateGoalUpdate({ name: ' ทริป ', targetAmount: 900, targetDate: null })).toEqual({
      ok: true,
      value: { name: 'ทริป', targetAmount: 900, targetDate: null },
    });
  });

  it('refuses an empty change and a closed flag that is not a boolean', () => {
    expect(validateGoalUpdate({})).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateGoalUpdate(null)).toEqual({ ok: false, error: 'Invalid body' });
    expect(validateGoalUpdate({ closed: 'yes' })).toEqual({ ok: false, error: 'Invalid closed' });
  });

  it('checks each sent field like create does', () => {
    expect(validateGoalUpdate({ name: '' })).toEqual({ ok: false, error: 'Invalid name' });
    expect(validateGoalUpdate({ targetAmount: 0 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateGoalUpdate({ targetDate: '2026-13-01' })).toEqual({ ok: false, error: 'Invalid date' });
  });
});

describe('validateContribution', () => {
  it('accepts an amount and a date', () => {
    expect(validateContribution({ amount: 500.25, occurredOn: '2026-10-19' })).toEqual({
      ok: true,
      value: { amount: 500.25, occurredOn: '2026-10-19' },
    });
  });

  it('refuses a bad amount, a bad date and a missing body', () => {
    expect(validateContribution({ amount: 0, occurredOn: '2026-10-19' })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(validateContribution({ amount: 1, occurredOn: '19/10/2026' })).toEqual({ ok: false, error: 'Invalid date' });
    expect(validateContribution(undefined)).toEqual({ ok: false, error: 'Invalid body' });
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/goals/validate.test.js`
Expected: FAIL `Cannot find module './validate.js'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/goals/validate.js`:

```js
const { isValidAmount } = require('../api/validate');
const { isValidCalendarDate } = require('../utils/date');

// ตรงกับ check char_length ของตาราง savings_goals ซึ่งนับเป็นตัวอักษร
const MAX_GOAL_NAME_LENGTH = 30;

function fail(error) {
  return { ok: false, error };
}

function isObject(body) {
  return Boolean(body) && typeof body === 'object';
}

// ชื่อเป้าไปอยู่ในข้อความตอบของแชต ตัวควบคุมทำให้ข้อความเพี้ยน
function hasControlCharacter(name) {
  return [...name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

function checkName(value) {
  if (typeof value !== 'string') return fail('Invalid name');
  const name = value.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > MAX_GOAL_NAME_LENGTH || hasControlCharacter(name)) return fail('Invalid name');
  return { ok: true, value: name };
}

function checkTargetDate(value) {
  return value === null || isValidCalendarDate(value);
}

function validateGoalCreate(body) {
  if (!isObject(body)) return fail('Invalid body');
  const name = checkName(body.name);
  if (!name.ok) return name;
  if (!isValidAmount(body.targetAmount)) return fail('Invalid amount');
  const targetDate = body.targetDate === undefined ? null : body.targetDate;
  if (!checkTargetDate(targetDate)) return fail('Invalid date');
  return { ok: true, value: { name: name.value, targetAmount: body.targetAmount, targetDate } };
}

function validateGoalUpdate(body) {
  if (!isObject(body)) return fail('Invalid body');
  const value = {};
  if (body.name !== undefined) {
    const name = checkName(body.name);
    if (!name.ok) return name;
    value.name = name.value;
  }
  if (body.targetAmount !== undefined) {
    if (!isValidAmount(body.targetAmount)) return fail('Invalid amount');
    value.targetAmount = body.targetAmount;
  }
  if (body.targetDate !== undefined) {
    if (!checkTargetDate(body.targetDate)) return fail('Invalid date');
    value.targetDate = body.targetDate;
  }
  if (body.closed !== undefined) {
    if (typeof body.closed !== 'boolean') return fail('Invalid closed');
    value.closed = body.closed;
  }
  if (Object.keys(value).length === 0) return fail('Invalid body');
  return { ok: true, value };
}

function validateContribution(body) {
  if (!isObject(body)) return fail('Invalid body');
  if (!isValidAmount(body.amount)) return fail('Invalid amount');
  if (!isValidCalendarDate(body.occurredOn)) return fail('Invalid date');
  return { ok: true, value: { amount: body.amount, occurredOn: body.occurredOn } };
}

module.exports = { validateGoalCreate, validateGoalUpdate, validateContribution, MAX_GOAL_NAME_LENGTH };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/goals/validate.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/goals/validate.js src/goals/validate.test.js
git commit -m "feat: validate savings goal requests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 4: API /api/goals

**Depends on:** Task 3 (ใช้ชื่อ repository method ตาม Interfaces ของ Task 2 ผ่าน mock)

**Files:**
- Create: `src/goals/router.js`
- Test: `src/goals/router.test.js`
- Modify: `src/api/router.js` (พารามิเตอร์ `createApiRouter`, การตรวจ `goalsRouter`, `router.use('/goals', goalsRouter)` ต่อจาก `router.use('/bills', billsRouter);`)
- Modify: `src/api/router.test.js` (`setup`, describe `createApiRouter`, describe ใหม่ `/api/goals`)
- Modify: `src/app.test.js` (`buildApiRouter` ราวบรรทัด 204-215)
- Modify: `index.js` (require และ `createApiRouter({ ... })` ราวบรรทัด 28 และ 100-117)

**Interfaces:**
- Consumes: `validateGoalCreate`, `validateGoalUpdate`, `validateContribution` (Task 3); `repository.listGoals`, `createGoal`, `updateGoal`, `addGoalContribution`, `listGoalContributions`, `deleteGoalContribution` (Task 2)
- Produces:
  - `createGoalsRouter({ repository }) => express.Router` (ใช้ `req.userId` จาก middleware ของ `/api`)
  - `createApiRouter({ ..., goalsRouter })` โยน `TypeError('createApiRouter requires goalsRouter')` ถ้าไม่ใช่ function
  - API (ทุกเส้นตอบ 404 `{ error: 'Not found' }` ถ้า id ไม่ใช่ UUID หรือไม่ใช่ของผู้ใช้):
    - `GET /api/goals` -> 200 `{ goals: Array<Goal & { saved, contributionCount }> }`
    - `POST /api/goals` `{ name, targetAmount, targetDate? }` -> 201 `{ goal }`; 400 `{ error }`; 409 `Too many goals` (เปิดอยู่ 20 เป้าแล้ว) หรือ `Duplicate name`
    - `PATCH /api/goals/:id` `{ name?, targetAmount?, targetDate?, closed? }` -> 200 `{ goal }`; 400; 409 `Too many goals` (เปิดเป้าที่ปิดไว้เมื่อเปิดอยู่ 20 เป้าแล้ว) หรือ `Duplicate name`
    - `GET /api/goals/:id/contributions` -> 200 `{ contributions: [{ id, amount, occurredOn }] }`
    - `POST /api/goals/:id/contributions` `{ amount, occurredOn }` -> 201 `{ contribution: { id }, saved }`; 400; 409 `Goal closed`
    - `DELETE /api/goals/:id/contributions/:contributionId` -> 204

- [ ] **Step 1: เขียนเทสต์ router ที่ fail**

สร้าง `src/goals/router.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createGoalsRouter } from './router.js';

const GOAL = '11111111-2222-3333-4444-555555555555';
const OTHER_GOAL = '66666666-7777-8888-9999-000000000000';
const ENTRY = '22222222-3333-4444-5555-666666666666';
let server;

function goal(overrides = {}) {
  return { id: GOAL, name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: null, closed: false, saved: 6000, contributionCount: 2, ...overrides };
}

function openGoals(count) {
  return Array.from({ length: count }, (_, index) => goal({ id: `${index}`, name: `เป้า ${index}` }));
}

function setup(overrides = {}) {
  return {
    listGoals: vi.fn().mockResolvedValue([goal()]),
    createGoal: vi.fn().mockImplementation(async (userId, fields) => ({ status: 'ok', goal: { id: OTHER_GOAL, ...fields, closed: false } })),
    updateGoal: vi.fn().mockImplementation(async (userId, id, fields) => ({ status: 'ok', goal: { ...goal(), ...fields } })),
    addGoalContribution: vi.fn().mockResolvedValue({ status: 'ok', contributionId: ENTRY, saved: 6500 }),
    listGoalContributions: vi.fn().mockResolvedValue([{ id: ENTRY, amount: 500, occurredOn: '2026-10-19' }]),
    deleteGoalContribution: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

async function start(repository) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/goals', createGoalsRouter({ repository }));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/goals`;
}

function call(url, { method = 'GET', body } = {}) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

describe('GET /goals', () => {
  it('lists the goals of this user with their progress', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ goals: [goal()] });
    expect(repository.listGoals).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /goals', () => {
  it('creates a goal with a trimmed name and no date', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(base, { method: 'POST', body: { name: ' คอนโด ', targetAmount: 1500000 } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ goal: { id: OTHER_GOAL, name: 'คอนโด', targetAmount: 1500000, targetDate: null, closed: false } });
    expect(repository.createGoal).toHaveBeenCalledWith('user-1', { name: 'คอนโด', targetAmount: 1500000, targetDate: null });
  });

  it('refuses an invalid body without writing', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(base, { method: 'POST', body: { name: '', targetAmount: 1 } });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid name' });
    expect(repository.createGoal).not.toHaveBeenCalled();
  });

  // แชตแสดงรายชื่อเป้าที่เปิดอยู่ทั้งหมดเมื่อหาไม่เจอ จึงจำกัดจำนวน แต่เป้าที่ปิดไม่นับ
  it('refuses a 21st open goal but does not count closed goals', async () => {
    const full = setup({ listGoals: vi.fn().mockResolvedValue(openGoals(20)) });
    const base = await start(full);

    const res = await call(base, { method: 'POST', body: { name: 'ใหม่', targetAmount: 1 } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many goals' });
    expect(full.createGoal).not.toHaveBeenCalled();

    full.listGoals.mockResolvedValue([...openGoals(19), goal({ id: 'c1', name: 'ปิด', closed: true })]);
    expect((await call(base, { method: 'POST', body: { name: 'ใหม่', targetAmount: 1 } })).status).toBe(201);
  });

  it('answers 409 for a name already used', async () => {
    const base = await start(setup({ createGoal: vi.fn().mockResolvedValue({ status: 'duplicate' }) }));

    const res = await call(base, { method: 'POST', body: { name: 'เที่ยวญี่ปุ่น', targetAmount: 1 } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Duplicate name' });
  });
});

describe('PATCH /goals/:id', () => {
  it('closes a goal of this user', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}`, { method: 'PATCH', body: { closed: true } });

    expect(res.status).toBe(200);
    expect((await res.json()).goal.closed).toBe(true);
    expect(repository.updateGoal).toHaveBeenCalledWith('user-1', GOAL, { closed: true });
  });

  // Postgres คืน uuid ตัวพิมพ์เล็กเสมอ แต่ลิงก์อาจมีตัวพิมพ์ใหญ่
  it('accepts an upper-case id', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL.toUpperCase()}`, { method: 'PATCH', body: { name: 'ทริป' } });

    expect(res.status).toBe(200);
    expect(repository.updateGoal).toHaveBeenCalledWith('user-1', GOAL, { name: 'ทริป' });
  });

  it('answers 404 for a malformed id or a goal that is not this user', async () => {
    const repository = setup();
    const base = await start(repository);

    expect((await call(`${base}/not-a-uuid`, { method: 'PATCH', body: { closed: true } })).status).toBe(404);
    expect((await call(`${base}/${OTHER_GOAL}`, { method: 'PATCH', body: { closed: true } })).status).toBe(404);
    expect(repository.updateGoal).not.toHaveBeenCalled();
  });

  it('refuses an empty change', async () => {
    const base = await start(setup());

    const res = await call(`${base}/${GOAL}`, { method: 'PATCH', body: {} });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid body' });
  });

  it('refuses to reopen a goal when 20 goals are already open', async () => {
    const repository = setup({ listGoals: vi.fn().mockResolvedValue([...openGoals(20), goal({ closed: true })]) });
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}`, { method: 'PATCH', body: { closed: false } });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'Too many goals' });
    expect(repository.updateGoal).not.toHaveBeenCalled();
  });

  it('answers 409 for a duplicate name and 404 when the row is gone', async () => {
    const repository = setup({ updateGoal: vi.fn().mockResolvedValue({ status: 'duplicate' }) });
    const base = await start(repository);

    expect((await call(`${base}/${GOAL}`, { method: 'PATCH', body: { name: 'ซ้ำ' } })).status).toBe(409);
    repository.updateGoal.mockResolvedValue({ status: 'not_found' });
    expect((await call(`${base}/${GOAL}`, { method: 'PATCH', body: { name: 'หาย' } })).status).toBe(404);
  });
});

describe('/goals/:id/contributions', () => {
  it('lists the contributions of a goal of this user', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}/contributions`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contributions: [{ id: ENTRY, amount: 500, occurredOn: '2026-10-19' }] });
    expect(repository.listGoalContributions).toHaveBeenCalledWith('user-1', GOAL);
  });

  it('answers 404 for the history of a goal that is not this user', async () => {
    const repository = setup();
    const base = await start(repository);

    expect((await call(`${base}/${OTHER_GOAL}/contributions`)).status).toBe(404);
    expect(repository.listGoalContributions).not.toHaveBeenCalled();
  });

  it('adds a contribution and returns the new saved total from SQL', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}/contributions`, { method: 'POST', body: { amount: 500, occurredOn: '2026-10-19' } });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ contribution: { id: ENTRY }, saved: 6500 });
    expect(repository.addGoalContribution).toHaveBeenCalledWith('user-1', GOAL, { amount: 500, occurredOn: '2026-10-19' });
  });

  it('refuses a bad amount, a missing goal and a closed goal', async () => {
    const repository = setup();
    const base = await start(repository);
    const add = (id = GOAL, body = { amount: 500, occurredOn: '2026-10-19' }) => call(`${base}/${id}/contributions`, { method: 'POST', body });

    const bad = await add(GOAL, { amount: 0, occurredOn: '2026-10-19' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'Invalid amount' });
    expect((await add('nope')).status).toBe(404);
    repository.addGoalContribution.mockResolvedValue({ status: 'not_found', contributionId: null, saved: null });
    expect((await add()).status).toBe(404);
    repository.addGoalContribution.mockResolvedValue({ status: 'closed', contributionId: null, saved: null });
    const closed = await add();
    expect(closed.status).toBe(409);
    expect(await closed.json()).toEqual({ error: 'Goal closed' });
  });

  it('deletes one contribution of this user goal', async () => {
    const repository = setup();
    const base = await start(repository);

    const res = await call(`${base}/${GOAL}/contributions/${ENTRY}`, { method: 'DELETE' });

    expect(res.status).toBe(204);
    expect(repository.deleteGoalContribution).toHaveBeenCalledWith('user-1', GOAL, ENTRY);
  });

  it('answers 404 when there is nothing to delete or the id is malformed', async () => {
    const repository = setup({ deleteGoalContribution: vi.fn().mockResolvedValue(false) });
    const base = await start(repository);

    expect((await call(`${base}/${GOAL}/contributions/${ENTRY}`, { method: 'DELETE' })).status).toBe(404);
    expect((await call(`${base}/${GOAL}/contributions/x`, { method: 'DELETE' })).status).toBe(404);
    expect(repository.deleteGoalContribution).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: เขียนเทสต์ที่ fail สำหรับการ mount**

ใน `src/api/router.test.js` ฟังก์ชัน `setup` เพิ่มต่อจาก `billsRouter: express.Router(),`:

```js
    goalsRouter: express.Router(),
```

ใน `describe('createApiRouter', ...)` ต่อจากเทสต์ `refuses to build without the bills router`:

```js
  it('refuses to build without the goals router', () => {
    // eslint-disable-next-line no-unused-vars
    const { goalsRouter, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('goalsRouter');
  });
```

ท้ายไฟล์ ต่อจาก `describe('/api/bills', ...)`:

```js
describe('/api/goals', () => {
  it('reaches the goals router only after the ID token check, with the user id set', async () => {
    const goalsRouter = express.Router();
    goalsRouter.get('/', (req, res) => res.json({ userId: req.userId }));
    const base = await start(setup({ goalsRouter }));

    expect((await call(base, '/goals', { token: null })).status).toBe(401);
    expect(await (await call(base, '/goals')).json()).toEqual({ userId: 'user-1' });
  });
});
```

ใน `src/app.test.js` ฟังก์ชัน `buildApiRouter` เพิ่มต่อจาก `billsRouter: express.Router(),`:

```js
      goalsRouter: express.Router(),
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/goals/router.test.js src/api/router.test.js src/app.test.js`
Expected: FAIL `Cannot find module './router.js'` ใน `src/goals/router.test.js`, และ `refuses to build without the goals router` กับ `/api/goals` ใน `src/api/router.test.js` fail (ยังไม่ throw / ได้ 404) ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 4: เขียน router**

สร้าง `src/goals/router.js`:

```js
const express = require('express');
const { UUID_PATTERN } = require('../utils/uuid');
const { validateGoalCreate, validateGoalUpdate, validateContribution } = require('./validate');

// แชตแสดงรายชื่อเป้าที่เปิดอยู่ทั้งหมดเมื่อหาเป้าไม่เจอ จึงจำกัดไม่ให้ข้อความยาวเกินไป
const MAX_OPEN_GOALS = 20;

function notFound(res) {
  res.status(404).json({ error: 'Not found' });
}

function badRequest(res, error) {
  res.status(400).json({ error });
}

function countOpen(goals) {
  return goals.filter((goal) => !goal.closed).length;
}

// Postgres คืน uuid เป็นตัวพิมพ์เล็กเสมอ แต่ UUID_PATTERN รับตัวพิมพ์ใหญ่ด้วย
function readId(value) {
  return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
}

// ต้อง mount หลัง middleware ตรวจ ID token ของ /api เพราะใช้ req.userId
function createGoalsRouter({ repository }) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    res.json({ goals: await repository.listGoals(req.userId) });
  });

  router.post('/', async (req, res) => {
    const result = validateGoalCreate(req.body);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    if (countOpen(await repository.listGoals(req.userId)) >= MAX_OPEN_GOALS) {
      res.status(409).json({ error: 'Too many goals' });
      return;
    }
    const created = await repository.createGoal(req.userId, result.value);
    if (created.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    res.status(201).json({ goal: created.goal });
  });

  router.patch('/:id', async (req, res) => {
    const id = readId(req.params.id);
    if (!id) {
      notFound(res);
      return;
    }
    const result = validateGoalUpdate(req.body);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    const goals = await repository.listGoals(req.userId);
    const goal = goals.find((item) => item.id === id);
    if (!goal) {
      notFound(res);
      return;
    }
    if (result.value.closed === false && goal.closed && countOpen(goals) >= MAX_OPEN_GOALS) {
      res.status(409).json({ error: 'Too many goals' });
      return;
    }
    const updated = await repository.updateGoal(req.userId, id, result.value);
    if (updated.status === 'duplicate') {
      res.status(409).json({ error: 'Duplicate name' });
      return;
    }
    if (updated.status === 'not_found') {
      notFound(res);
      return;
    }
    res.json({ goal: updated.goal });
  });

  router.get('/:id/contributions', async (req, res) => {
    const id = readId(req.params.id);
    // ตรวจว่าเป็นเป้าของผู้ใช้ก่อน ไม่งั้นเป้าของคนอื่นจะได้รายการว่างแทน 404
    if (!id || !(await repository.listGoals(req.userId)).some((goal) => goal.id === id)) {
      notFound(res);
      return;
    }
    res.json({ contributions: await repository.listGoalContributions(req.userId, id) });
  });

  router.post('/:id/contributions', async (req, res) => {
    const id = readId(req.params.id);
    if (!id) {
      notFound(res);
      return;
    }
    const result = validateContribution(req.body);
    if (!result.ok) {
      badRequest(res, result.error);
      return;
    }
    const added = await repository.addGoalContribution(req.userId, id, result.value);
    if (added.status === 'not_found') {
      notFound(res);
      return;
    }
    if (added.status === 'closed') {
      res.status(409).json({ error: 'Goal closed' });
      return;
    }
    res.status(201).json({ contribution: { id: added.contributionId }, saved: added.saved });
  });

  router.delete('/:id/contributions/:contributionId', async (req, res) => {
    const id = readId(req.params.id);
    const contributionId = readId(req.params.contributionId);
    if (!id || !contributionId || !(await repository.deleteGoalContribution(req.userId, id, contributionId))) {
      notFound(res);
      return;
    }
    res.status(204).end();
  });

  return router;
}

module.exports = { createGoalsRouter, MAX_OPEN_GOALS };
```

- [ ] **Step 5: mount ใน /api และส่งจาก index.js**

ใน `src/api/router.js` พารามิเตอร์ของ `createApiRouter` เพิ่ม `goalsRouter,` ต่อจาก `billsRouter,` และต่อจากการตรวจ `billsRouter` เพิ่ม:

```js
  if (typeof goalsRouter !== 'function') {
    throw new TypeError('createApiRouter requires goalsRouter');
  }
```

ต่อจาก `router.use('/bills', billsRouter);` เพิ่ม:

```js
  router.use('/goals', goalsRouter);
```

ใน `index.js` ต่อจาก `const { createReceiptReader } = require('./src/bills/receipt');` เพิ่ม:

```js
const { createGoalsRouter } = require('./src/goals/router');
```

ใน `createApiRouter({ ... })` ต่อจาก object `billsRouter: createBillsRouter({ ... }),` เพิ่ม:

```js
  goalsRouter: createGoalsRouter({ repository }),
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/goals/router.test.js src/api/router.test.js src/app.test.js`
Expected: PASS ทั้งสามไฟล์

Run: `node --check index.js`
Expected: ไม่มี output

- [ ] **Step 7: Commit**

```bash
git add src/goals/router.js src/goals/router.test.js src/api/router.js src/api/router.test.js src/app.test.js index.js
git commit -m "feat: add the savings goals API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 5: อ่านคำสั่งออมและข้อความตอบในแชต

**Depends on:** none

**Files:**
- Create: `src/goals/chat.js`
- Test: `src/goals/chat.test.js`

**Interfaces:**
- Consumes: `formatAmount` จาก `src/parser/format-reply.js`, `isValidAmount` จาก `src/api/validate.js`
- Produces:
  - `parseSavingCommand(text: string) => null | { name: string, amount: number | null }` (`amount` เป็น null เมื่อยอดไม่อยู่ใน 0.01-10,000,000) อ่านแค่รูปแบบข้อความ ส่วนการตัดสินว่าจะจับเป็นคำสั่งออมไหมอยู่ที่บอท (Task 6) ด้วย `hasOpenGoal`
  - `hasOpenGoal(goals: Goal[]) => boolean` true เมื่อมีเป้าที่ `closed` เป็น false อย่างน้อยหนึ่งเป้า
  - `findOpenGoal(goals: Goal[], name: string) => Goal | null` เทียบชื่อแบบ trim และไม่สนตัวพิมพ์ ข้ามเป้าที่ปิด
  - `formatSavingReply({ name, amount, saved, target }) => string`
  - `formatGoalNotFoundReply(name, goals) => string` (บอทเรียกเฉพาะเมื่อ `hasOpenGoal(goals)` เป็น true)
  - `SAVING_AMOUNT_REPLY`, `GOAL_GONE_REPLY` (string)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/goals/chat.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseSavingCommand, hasOpenGoal, findOpenGoal, formatSavingReply, formatGoalNotFoundReply } = require('./chat.js');

const GOALS = [
  { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, closed: false },
  { id: 'g-2', name: 'Japan Trip', targetAmount: 1000, closed: false },
  { id: 'g-3', name: 'มือถือ', targetAmount: 30000, closed: true },
];

describe('parseSavingCommand', () => {
  it.each([
    ['ออม เที่ยวญี่ปุ่น 1000', { name: 'เที่ยวญี่ปุ่น', amount: 1000 }],
    ['ออมเที่ยวญี่ปุ่น 1,500.50 บาท', { name: 'เที่ยวญี่ปุ่น', amount: 1500.5 }],
    ['  ออม iPhone 15 30000  ', { name: 'iPhone 15', amount: 30000 }],
    ['ออม ทริป 0', { name: 'ทริป', amount: null }],
    ['ออม ทริป 20,000,000', { name: 'ทริป', amount: null }],
    // รูปแบบตรงกับคำสั่งออม บอทจึงต้องดู hasOpenGoal ก่อนจับ ไม่งั้นคนที่ไม่มีเป้าจะจดรายการนี้ไม่ได้
    ['ออมสิน 1000', { name: 'สิน', amount: 1000 }],
  ])('reads %s', (text, expected) => {
    expect(parseSavingCommand(text)).toEqual(expected);
  });

  it.each(['กินข้าว 60', 'ออม', 'ออม 1000', 'ออมเงิน', 'ออม ทริป 10.555', 'สรุปเดือนนี้'])('leaves %s to the other paths', (text) => {
    expect(parseSavingCommand(text)).toBeNull();
  });
});

describe('hasOpenGoal', () => {
  it('is true only when at least one goal is open', () => {
    expect(hasOpenGoal(GOALS)).toBe(true);
    expect(hasOpenGoal([GOALS[2]])).toBe(false);
    expect(hasOpenGoal([])).toBe(false);
  });
});

describe('findOpenGoal', () => {
  it('matches the name ignoring letter case and outer spaces', () => {
    expect(findOpenGoal(GOALS, ' japan trip ').id).toBe('g-2');
    expect(findOpenGoal(GOALS, 'เที่ยวญี่ปุ่น').id).toBe('g-1');
  });

  it('skips closed goals and unknown names', () => {
    expect(findOpenGoal(GOALS, 'มือถือ')).toBeNull();
    expect(findOpenGoal(GOALS, 'คอนโด')).toBeNull();
  });
});

describe('formatSavingReply', () => {
  it('shows the amount, the saved total and the percent rounded down', () => {
    expect(formatSavingReply({ name: 'เที่ยวญี่ปุ่น', amount: 1000, saved: 6000.5, target: 50000 })).toBe(
      'ออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000.5 / 50,000 บาท (12%)'
    );
  });

  it('says the goal is reached at 100 percent or more', () => {
    expect(formatSavingReply({ name: 'มือถือ', amount: 500, saved: 30500, target: 30000 })).toBe(
      'ออมเข้าเป้า มือถือ 500 บาทแล้ว\nยอดสะสม 30,500 / 30,000 บาท (101%)\nถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม'
    );
  });
});

describe('formatGoalNotFoundReply', () => {
  it('lists only the open goals with an example', () => {
    expect(formatGoalNotFoundReply('คอนโด', GOALS)).toBe(
      'ไม่พบเป้า "คอนโด"\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น, Japan Trip\nพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000'
    );
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/goals/chat.test.js`
Expected: FAIL `Cannot find module './chat.js'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/goals/chat.js`:

```js
const { formatAmount } = require('../parser/format-reply');
const { isValidAmount } = require('../api/validate');

// รูปแบบตายตัวจึงไม่ต้องใช้ Claude ชื่อเป้ามีตัวเลขได้ เพราะยอดต้องอยู่ท้ายสุดเสมอ
const SAVING_PATTERN = /^ออม\s*(.+?)\s+([\d,]+(?:\.\d{1,2})?)\s*(?:บาท)?$/;

const SAVING_AMOUNT_REPLY = 'จำนวนเงินออมต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท';
const GOAL_GONE_REPLY = 'ไม่พบเป้านี้แล้ว อาจถูกปิดไปแล้ว ดูเป้าที่เปิดอยู่ในหน้าเว็บ แท็บ ออม';

function parseSavingCommand(text) {
  const match = SAVING_PATTERN.exec(text.trim());
  if (!match) {
    return null;
  }
  const amount = Number(match[2].replace(/,/g, ''));
  return { name: match[1].trim(), amount: isValidAmount(amount) ? amount : null };
}

// คนที่ไม่มีเป้าเปิดอยู่ไม่ได้ใช้คำสั่งออม ข้อความอย่าง "ออมสิน 1000" ของเขาต้องเป็นรายการตามเดิม
function hasOpenGoal(goals) {
  return goals.some((goal) => !goal.closed);
}

function normalizeGoalName(name) {
  return name.trim().toLowerCase();
}

function findOpenGoal(goals, name) {
  const wanted = normalizeGoalName(name);
  return goals.find((goal) => !goal.closed && normalizeGoalName(goal.name) === wanted) ?? null;
}

// คิดเป็นสตางค์และปัดลง ให้ตรงกับหลอดในหน้าเว็บ
function goalPercent(saved, target) {
  return Math.floor((Math.round(saved * 100) * 100) / Math.round(target * 100));
}

function formatSavingReply({ name, amount, saved, target }) {
  const percent = goalPercent(saved, target);
  const lines = [
    `ออมเข้าเป้า ${name} ${formatAmount(amount)} บาทแล้ว`,
    `ยอดสะสม ${formatAmount(saved)} / ${formatAmount(target)} บาท (${percent}%)`,
  ];
  if (percent >= 100) {
    lines.push('ถึงเป้าแล้ว ปิดเป้าได้ในหน้าเว็บ แท็บ ออม');
  }
  return lines.join('\n');
}

function formatGoalNotFoundReply(name, goals) {
  const open = goals.filter((goal) => !goal.closed);
  return [
    `ไม่พบเป้า "${name}"`,
    `เป้าที่เปิดอยู่: ${open.map((goal) => goal.name).join(', ')}`,
    `พิมพ์ เช่น ออม ${open[0].name} 1000`,
  ].join('\n');
}

module.exports = {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatSavingReply,
  formatGoalNotFoundReply,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
};
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/goals/chat.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/goals/chat.js src/goals/chat.test.js
git commit -m "feat: read the saving command and write its replies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 6: บอทรับคำสั่งออมและปุ่มยกเลิก

**Depends on:** Task 2, Task 5

**Files:**
- Modify: `src/bot.js` (require ด้านบนต่อจากบรรทัด 14 `const { buildTotalsFlex } = require('./query/answer-flex');`, ค่าคงที่ต่อจาก `UNDO_NOT_FOUND_REPLY` บรรทัด 25 และ `UNDO_ACTION` บรรทัด 52, `buildUndoSavingQuickReply` ต่อจาก `buildUndoQuickReply` บรรทัด 75, `handleSaving` ต่อจาก `handleSummary` บรรทัด 274-283, `handleText` ต่อจากบล็อก `claimed` บรรทัด 288-291, `handleUndoSaving` ต่อจาก `handleUndo` บรรทัด 403-411, `handlePostback` บรรทัด 472-477, `module.exports` บรรทัด 581-600)
- Modify: `src/menu/fixed-replies.js` (`HELP_REPLY`)
- Test: `src/bot.test.js`, `src/menu/fixed-replies.test.js`

**Interfaces:**
- Consumes: `repository.listGoals`, `repository.addGoalContribution`, `repository.deleteGoalContributionsByEvent` (Task 2); `parseSavingCommand`, `hasOpenGoal`, `findOpenGoal`, `formatSavingReply`, `formatGoalNotFoundReply`, `SAVING_AMOUNT_REPLY`, `GOAL_GONE_REPLY` (Task 5); `toBangkokDateString` จาก `src/utils/date.js`
- Produces: postback data `action=undo_saving&event=<webhookEventId>`; export `UNDO_SAVING_DONE_REPLY = 'ยกเลิกการออมแล้ว'`, `UNDO_SAVING_NOT_FOUND_REPLY = 'ไม่พบรายการออมที่จะยกเลิก อาจถูกยกเลิกไปแล้ว'`; ข้อความที่ตรงรูปแบบ `ออม <ชื่อ> <ยอด>` ถูกจับเป็นคำสั่งออมเฉพาะเมื่อ `repository.listGoals` มีเป้าที่เปิดอยู่ ไม่งั้นไปทางเดิมทั้งหมด

**LINE check:** *(ทำหลังผู้ใช้รัน `supabase/023_savings_goals.sql` ใน Supabase แล้ว merge+push และ Render deploy เสร็จ และหลัง LINE check ของ Task 9 ที่สร้างเป้าไว้)*
- Preconditions: บอทใน LINE ของผู้ใช้ มีเป้าที่เปิดอยู่ชื่อ `เที่ยวญี่ปุ่น` ยอดเป้า 50,000 (สร้างในแท็บ ออม)

| # | Action | Expected |
|---|---|---|
| 1 | พิมพ์ `ออม เที่ยวญี่ปุ่น 1000` | บอทตอบข้อความ 2 บรรทัด `ออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว` และ `ยอดสะสม ... / 50,000 บาท (...%)` มีปุ่ม `ยกเลิก` ด้านล่าง ไม่มีการ์ด "บันทึกแล้ว" |
| 2 | กดปุ่ม `ยกเลิก` ของข้อความในข้อ 1 | บอทตอบ `ยกเลิกการออมแล้ว` และแท็บ ออม ในหน้าเว็บแสดงยอดสะสมเท่าก่อนข้อ 1 |
| 3 | พิมพ์ `ออม คอนโด 500` | บอทตอบ `ไม่พบเป้า "คอนโด"` ตามด้วยบรรทัด `เป้าที่เปิดอยู่: เที่ยวญี่ปุ่น` |
| 4 | พิมพ์ `ออม เที่ยวญี่ปุ่น 0` | บอทตอบ `จำนวนเงินออมต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท` |
| 5 | พิมพ์ `ช่วยเหลือ` | ข้อความช่วยเหลือมีหัวข้อ `🎯 ออมเงินเข้าเป้า` และบรรทัด `ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ` |
| 6 | พิมพ์ `กินข้าว 60` | บอทตอบการ์ด "บันทึกแล้ว" ตามเดิม |
| 7 | พิมพ์ `ออมสิน 1000` (ยังมีเป้า `เที่ยวญี่ปุ่น` เปิดอยู่) | บอทตอบ `ไม่พบเป้า "สิน"` ตามด้วยบรรทัด `เป้าที่เปิดอยู่: เที่ยวญี่ปุ่น` ไม่มีการ์ด "บันทึกแล้ว" |
| 8 | ในหน้าเว็บแท็บ `ออม` ปิดเป้า `เที่ยวญี่ปุ่น` (ไม่มีเป้าที่เปิดอยู่เลย) แล้วพิมพ์ `ออมสิน 1000` ในแชต | บอทตอบการ์ด "บันทึกแล้ว" รายการ 1,000 บาท เหมือนรายการทั่วไป (กดปุ่ม `ยกเลิก` ใต้การ์ดเพื่อลบรายการทดสอบนี้ แล้วเปิดเป้า `เที่ยวญี่ปุ่น` อีกครั้งในหน้าเว็บสำหรับ Browser check ของ Task 10) |

- [ ] **Step 1: เขียนเทสต์ที่ fail ใน bot.test.js**

ใน `src/bot.test.js` บรรทัด import จาก `./bot.js` เพิ่ม `UNDO_SAVING_DONE_REPLY,` และ `UNDO_SAVING_NOT_FOUND_REPLY,` ต่อจาก `QUESTION_FAILED_REPLY,` แล้วต่อจาก `import { TEXT_CATEGORIES } from './parser/categories.js';` เพิ่ม:

```js
import { SAVING_AMOUNT_REPLY, GOAL_GONE_REPLY } from './goals/chat.js';
```

ในฟังก์ชัน `setup` object `repository:` เพิ่มต่อจาก `queryTotals: ...,`:

```js
      listGoals: vi.fn().mockResolvedValue([
        { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: null, closed: false, saved: 5000, contributionCount: 1 },
        { id: 'g-2', name: 'มือถือ', targetAmount: 30000, targetDate: null, closed: true, saved: 30000, contributionCount: 3 },
      ]),
      addGoalContribution: vi.fn().mockResolvedValue({ status: 'ok', contributionId: 'gc-1', saved: 6000 }),
      deleteGoalContributionsByEvent: vi.fn().mockResolvedValue(1),
```

เพิ่ม describe ใหม่ต่อจาก `describe('bot undo postback', ...)`:

```js
describe('bot saving command', () => {
  const UNDO_SAVING_QUICK_REPLY = [
    {
      type: 'action',
      action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo_saving&event=ev1', displayText: 'ยกเลิก' },
    },
  ];

  it('adds the amount to the open goal named in the message without calling Claude', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1,000'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalledWith('user-1', 'g-1', {
      amount: 1000,
      occurredOn: '2026-09-29',
      lineEventId: 'ev1',
    });
    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'ออมเข้าเป้า เที่ยวญี่ปุ่น 1,000 บาทแล้ว\nยอดสะสม 6,000 / 50,000 บาท (12%)',
      UNDO_SAVING_QUICK_REPLY
    );
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.parseQuestion).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('ignores a redelivered saving message', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('answers even when the user is rate limited because it costs no Claude call', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.repository.addGoalContribution).toHaveBeenCalled();
    expect(deps.allowRequest).not.toHaveBeenCalled();
  });

  it('lists the open goals when the name is not found, skipping closed goals', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม มือถือ 100'));

    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'ไม่พบเป้า "มือถือ"\nเป้าที่เปิดอยู่: เที่ยวญี่ปุ่น\nพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000',
      undefined
    );
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
  });

  it('asks for a valid amount when the user has an open goal', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 0'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  // ผู้ใช้ตัดสิน 2026-10-19: คนที่ไม่มีเป้าเปิดอยู่ ข้อความอย่าง "ออมสิน 1000" ต้องเป็นรายการตามเดิม
  it('records the message as an entry when the user has no open goal', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockResolvedValue([
      { id: 'g-2', name: 'มือถือ', targetAmount: 30000, targetDate: null, closed: true, saved: 30000, contributionCount: 3 },
    ]);

    await bot.handleEvent(textEvent('ออมสิน 1000'));

    expect(deps.repository.listGoals).toHaveBeenCalledWith('user-1');
    expect(deps.repository.addGoalContribution).not.toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalledWith('ออมสิน 1000', [], USER_TEXT_CATEGORIES);
    expect(deps.repository.insertTransactions).toHaveBeenCalled();
  });

  it('leaves even a bad saving amount to the normal flow when the user has no goals', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('ออม ทริป 0'));

    expect(deps.repository.listGoals).toHaveBeenCalledWith('user-1');
    expect(deps.replyText).not.toHaveBeenCalledWith('r1', SAVING_AMOUNT_REPLY, undefined);
    expect(deps.parseMessage).toHaveBeenCalledWith('ออม ทริป 0', [], USER_TEXT_CATEGORIES);
  });

  it('counts the rate limit once the message falls through to the normal flow', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });
    deps.repository.listGoals.mockResolvedValue([]);

    await bot.handleEvent(textEvent('ออมสิน 1000'));

    expect(deps.repository.listGoals).toHaveBeenCalledWith('user-1');
    expect(deps.allowRequest).toHaveBeenCalledWith('U1');
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
  });

  // เป้าอาจถูกปิดจากหน้าเว็บระหว่างอ่านรายชื่อกับตอนบันทึก
  it('says the goal is gone when SQL refuses the contribution', async () => {
    const { deps, bot } = setup();
    deps.repository.addGoalContribution.mockResolvedValue({ status: 'closed', contributionId: null, saved: null });

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', GOAL_GONE_REPLY, undefined);
  });

  it('replies with the system error and records nothing when the goals cannot be read', async () => {
    const { deps, bot } = setup();
    deps.repository.listGoals.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('ออม เที่ยวญี่ปุ่น 1000'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
  });

  it('leaves other messages to the parser', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.repository.listGoals).not.toHaveBeenCalled();
    expect(deps.parseMessage).toHaveBeenCalled();
  });
});

describe('bot undo saving postback', () => {
  it('deletes the contribution of that event for this user and confirms', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo_saving&event=ev1'));

    expect(deps.repository.deleteGoalContributionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(deps.repository.deleteTransactionsByEvent).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_SAVING_DONE_REPLY, undefined);
  });

  it('tells the user when nothing was deleted', async () => {
    const { deps, bot } = setup();
    deps.repository.deleteGoalContributionsByEvent.mockResolvedValue(0);

    await bot.handleEvent(postbackEvent('action=undo_saving&event=ev1'));

    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_SAVING_NOT_FOUND_REPLY, undefined);
  });

  it('ignores the postback without an event id', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo_saving'));

    expect(deps.repository.deleteGoalContributionsByEvent).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});
```

(`NOW_MS` ของไฟล์เทสต์คือ `2026-09-29T05:00:00Z` ซึ่งเป็นวันที่ 2026-09-29 ตามเวลาไทย)

- [ ] **Step 2: เขียนเทสต์ที่ fail ใน fixed-replies.test.js**

ใน `src/menu/fixed-replies.test.js` ต่อจากเทสต์ `documents asking for totals after the summary section`:

```js
  it('documents the saving command after the totals section', () => {
    const lines = HELP_REPLY.split('\n');
    const title = lines.indexOf('🎯 ออมเงินเข้าเป้า');
    expect(title).toBeGreaterThan(lines.indexOf('🔎 ถามยอด'));
    expect(lines.slice(title + 1, title + 4)).toEqual([
      'สร้างเป้าในหน้าเว็บ แท็บ ออม',
      'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)',
      'ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ',
    ]);
  });
```

ในเทสต์ `uses the agreed wording` (แผนสรุปรายสัปดาห์และเตือนลืมจดไม่แก้ `HELP_REPLY` จึงยังตรงกับ main) array ที่ pin ไว้ เปลี่ยน:

```js
        '🔎 ถามยอด',
        'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
        'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
        '',
        '⚠️ จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
```

เป็น:

```js
        '🔎 ถามยอด',
        'พิมพ์ถามได้เลย เช่น เดือนนี้กินกาแฟไปเท่าไหร่',
        'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',
        '',
        '🎯 ออมเงินเข้าเป้า',
        'สร้างเป้าในหน้าเว็บ แท็บ ออม',
        'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)',
        'ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ',
        '',
        '⚠️ จำนวนเงินต่อรายการไม่เกิน 10,000,000 บาท',
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/bot.test.js src/menu/fixed-replies.test.js`
Expected: FAIL เทสต์ใน `bot saving command` (รวมสามเทสต์ของผู้ใช้ที่ไม่มีเป้าเปิดอยู่ ซึ่ง fail ที่ `listGoals` ไม่ถูกเรียก) ยกเว้น `leaves other messages to the parser` ที่ผ่านอยู่แล้ว, `bot undo saving postback`, `documents the saving command after the totals section` และ `uses the agreed wording` ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 4: ต่อคำสั่งออมใน bot.js**

ด้านบน `src/bot.js` ต่อจาก `const { buildTotalsFlex } = require('./query/answer-flex');` (บรรทัด 14 ของ main หลัง merge การ์ดถามยอด) เพิ่ม:

```js
const {
  parseSavingCommand,
  hasOpenGoal,
  findOpenGoal,
  formatSavingReply,
  formatGoalNotFoundReply,
  SAVING_AMOUNT_REPLY,
  GOAL_GONE_REPLY,
} = require('./goals/chat');
const { toBangkokDateString } = require('./utils/date');
```

ต่อจาก `const UNDO_NOT_FOUND_REPLY = ...;` เพิ่ม:

```js
const UNDO_SAVING_DONE_REPLY = 'ยกเลิกการออมแล้ว';
const UNDO_SAVING_NOT_FOUND_REPLY = 'ไม่พบรายการออมที่จะยกเลิก อาจถูกยกเลิกไปแล้ว';
```

ต่อจาก `const UNDO_ACTION = 'undo';` เพิ่ม:

```js
const UNDO_SAVING_ACTION = 'undo_saving';
```

ต่อจาก function `buildUndoQuickReply` เพิ่ม:

```js
function buildUndoSavingQuickReply(webhookEventId) {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: 'ยกเลิก',
        data: new URLSearchParams({ action: UNDO_SAVING_ACTION, event: webhookEventId }).toString(),
        displayText: 'ยกเลิก',
      },
    },
  ];
}
```

ใน `createBot` ต่อจาก function `handleSummary` เพิ่ม:

```js
  // คืน null เมื่อไม่มีเป้าที่เปิดอยู่ ให้ handleText ทำทางเดิมต่อ เพราะคนที่ไม่ใช้เป้าอาจพิมพ์ "ออมสิน 1000" เป็นรายการ
  async function handleSaving(command, userId, webhookEventId) {
    const goals = await repository.listGoals(userId);
    if (!hasOpenGoal(goals)) {
      return null;
    }
    if (command.amount === null) {
      return { text: SAVING_AMOUNT_REPLY };
    }
    const goal = findOpenGoal(goals, command.name);
    if (!goal) {
      return { text: formatGoalNotFoundReply(command.name, goals) };
    }
    const result = await repository.addGoalContribution(userId, goal.id, {
      amount: command.amount,
      occurredOn: toBangkokDateString(new Date(now())),
      lineEventId: webhookEventId,
    });
    // เป้าอาจถูกปิดจากหน้าเว็บระหว่างอ่านรายชื่อเป้ากับตอนบันทึก
    if (result.status !== 'ok') {
      return { text: GOAL_GONE_REPLY };
    }
    return {
      text: formatSavingReply({ name: goal.name, amount: command.amount, saved: result.saved, target: goal.targetAmount }),
      quickReply: buildUndoSavingQuickReply(webhookEventId),
    };
  }
```

ใน `handleText` ต่อจากบล็อก `if (!claimed) { return null; }` และก่อน `// ปุ่มเมนูตอบข้อความคงที่ ...` เพิ่ม:

```js
    // คำสั่งออมไม่เรียก Claude จึงไม่นับ rate limit และต้องมาก่อนทางบันทึกรายการ ไม่งั้นยอดออมจะกลายเป็นรายจ่าย
    const savingCommand = parseSavingCommand(event.message.text);
    if (savingCommand) {
      const savingReply = await handleSaving(savingCommand, userId, event.webhookEventId);
      if (savingReply) {
        return savingReply;
      }
    }
```

(ถ้า `repository.listGoals` throw ให้ปล่อยขึ้นไปถึง `handleEvent` ซึ่งตอบ `SYSTEM_ERROR_REPLY` อยู่แล้ว เทสต์ `replies with the system error and records nothing when the goals cannot be read` ครอบกรณีนี้)

ต่อจาก function `handleUndo` เพิ่ม:

```js
  async function handleUndoSaving(params, lineUserId) {
    const webhookEventId = params.get('event');
    if (!webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteGoalContributionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_SAVING_DONE_REPLY : UNDO_SAVING_NOT_FOUND_REPLY };
  }
```

ใน `handlePostback` ต่อจากบล็อก `if (action === UNDO_ACTION) { ... }` เพิ่ม:

```js
    if (action === UNDO_SAVING_ACTION) {
      return handleUndoSaving(params, lineUserId);
    }
```

ใน `module.exports` ต่อจาก `UNDO_NOT_FOUND_REPLY,` เพิ่ม:

```js
  UNDO_SAVING_DONE_REPLY,
  UNDO_SAVING_NOT_FOUND_REPLY,
```

- [ ] **Step 5: เพิ่มหัวข้อในข้อความช่วยเหลือ**

ใน `src/menu/fixed-replies.js` ต่อจากบรรทัด `'หรือ ค่าเดินทางเดือนที่แล้วเท่าไร',` (บรรทัด 36 ของ main) เพิ่ม:

```js
  '',
  '🎯 ออมเงินเข้าเป้า',
  'สร้างเป้าในหน้าเว็บ แท็บ ออม',
  'แล้วพิมพ์ เช่น ออม เที่ยวญี่ปุ่น 1000 (กด "ยกเลิก" ได้ถ้าพิมพ์ผิด)',
  'ใช้ได้เมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มีจะจดเป็นรายการตามปกติ',
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/bot.test.js src/menu/fixed-replies.test.js`
Expected: PASS ทั้งสองไฟล์

Run: `node --check index.js`
Expected: ไม่มี output

- [ ] **Step 7: Commit**

```bash
git add src/bot.js src/bot.test.js src/menu/fixed-replies.js src/menu/fixed-replies.test.js
git commit -m "feat: save into a goal from the chat with an undo button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 7: LIFF api และการจัดรูปข้อมูลเป้า

**Depends on:** none (ใช้ API ตาม Interfaces ของ Task 4)

**Files:**
- Modify: `public/liff/api.mjs` (object ที่ `createApi` คืน)
- Create: `public/liff/goals-format.mjs`
- Test: `public/liff/api.test.mjs`, `public/liff/goals-format.test.mjs`

**Interfaces:**
- Consumes: `formatBaht`, `formatFullThaiDate`, `LOGIN_REQUIRED_MESSAGE` จาก `public/liff/format.mjs`
- Produces:
  - api: `listGoals()`, `createGoal(body)`, `updateGoal(id, body)`, `listGoalContributions(id)`, `addGoalContribution(id, body)`, `deleteGoalContribution(id, contributionId) => Promise<true>`
  - `goalPercent(saved, target) => number` (สตางค์ ปัดลง)
  - `goalRow(goal) => goal & { percent, width (ไม่เกิน 100), reached: boolean, text, dateText }`
  - `splitGoals(goals) => { open: GoalRow[], closed: GoalRow[] }` คงลำดับเดิม
  - `contributionRows(contributions) => Array<{ id, text, label }>`
  - `describeGoalError(status, error) => string`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/api.test.mjs` ภายใน `describe('createApi', ...)` ต่อจากเทสต์ `reads the usage of a category and deletes it`:

```js
  it('lists, creates and updates goals', async () => {
    const fetchImpl = fakeFetch(200, { goals: [] });
    const api = setup(fetchImpl);

    await api.listGoals();
    await api.createGoal({ name: 'เที่ยว', targetAmount: 1000, targetDate: null });
    await api.updateGoal('g 1', { closed: true });

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method ?? 'GET', options.body])).toEqual([
      ['/api/goals', 'GET', undefined],
      ['/api/goals', 'POST', JSON.stringify({ name: 'เที่ยว', targetAmount: 1000, targetDate: null })],
      ['/api/goals/g%201', 'PATCH', JSON.stringify({ closed: true })],
    ]);
  });

  it('lists, adds and deletes the contributions of a goal', async () => {
    const fetchImpl = fakeFetch(200, { contributions: [] });
    const api = setup(fetchImpl);

    await api.listGoalContributions('g 1');
    await api.addGoalContribution('g 1', { amount: 500, occurredOn: '2026-10-19' });
    fetchImpl.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });
    const deleted = await api.deleteGoalContribution('g 1', 'c 2');

    expect(deleted).toBe(true);
    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method ?? 'GET', options.body])).toEqual([
      ['/api/goals/g%201/contributions', 'GET', undefined],
      ['/api/goals/g%201/contributions', 'POST', JSON.stringify({ amount: 500, occurredOn: '2026-10-19' })],
      ['/api/goals/g%201/contributions/c%202', 'DELETE', undefined],
    ]);
  });
```

สร้าง `public/liff/goals-format.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import { goalPercent, goalRow, splitGoals, contributionRows, describeGoalError } from './goals-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

const GOAL = { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000, contributionCount: 2 };

describe('goalPercent', () => {
  it.each([
    [6000, 50000, 12],
    [0, 1000, 0],
    [999.99, 1000, 99],
    [1000, 1000, 100],
    [12000, 10000, 120],
    [0.1, 0.3, 33],
  ])('%s of %s is %s percent', (saved, target, expected) => {
    expect(goalPercent(saved, target)).toBe(expected);
  });
});

describe('goalRow', () => {
  it('describes the progress, the bar width and the wished date', () => {
    expect(goalRow(GOAL)).toEqual({
      ...GOAL,
      percent: 12,
      width: 12,
      reached: false,
      text: 'ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)',
      dateText: 'อยากถึงเป้า 31 ธ.ค. 2569',
    });
  });

  it('caps the bar at 100, marks a reached goal and has no date line without a date', () => {
    const row = goalRow({ ...GOAL, targetAmount: 10000, saved: 12000, targetDate: null });

    expect([row.percent, row.width, row.reached, row.dateText]).toEqual([120, 100, true, '']);
  });
});

describe('splitGoals', () => {
  it('separates open and closed goals keeping their order', () => {
    const { open, closed } = splitGoals([GOAL, { ...GOAL, id: 'g-3', closed: true }, { ...GOAL, id: 'g-2' }]);

    expect(open.map((row) => row.id)).toEqual(['g-1', 'g-2']);
    expect(closed.map((row) => row.id)).toEqual(['g-3']);
  });
});

describe('contributionRows', () => {
  it('shows the date and amount and names both in the delete label', () => {
    expect(contributionRows([{ id: 'gc-1', amount: 1000, occurredOn: '2026-10-14' }])).toEqual([
      { id: 'gc-1', text: '14 ต.ค. 2569 · 1,000 บาท', label: 'ลบรายการออม 1,000 บาท วันที่ 14 ต.ค. 2569' },
    ]);
  });
});

describe('describeGoalError', () => {
  it.each([
    [401, undefined, LOGIN_REQUIRED_MESSAGE],
    [404, 'Not found', 'ไม่พบเป้าหรือรายการนี้แล้ว ลองเปิดหน้าใหม่'],
    [409, 'Duplicate name', 'มีเป้าชื่อนี้อยู่แล้ว'],
    [409, 'Too many goals', 'มีเป้าที่เปิดอยู่ได้ไม่เกิน 20 เป้า ปิดเป้าที่ไม่ใช้ก่อน'],
    [409, 'Goal closed', 'เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม'],
    [400, 'Invalid name', 'ชื่อเป้าต้องยาว 1-30 ตัวอักษร'],
    [400, 'Invalid amount', 'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)'],
    [400, 'Invalid date', 'วันที่ไม่ถูกต้อง'],
    [500, 'Internal error', 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'],
    [0, undefined, 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'],
  ])('explains %s %s', (status, error, expected) => {
    expect(describeGoalError(status, error)).toBe(expected);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/api.test.mjs public/liff/goals-format.test.mjs`
Expected: FAIL `api.listGoals is not a function` และ `Failed to load url ./goals-format.mjs` (หรือ Cannot find module)

- [ ] **Step 3: เขียนโค้ด**

ใน `public/liff/api.mjs` object ที่ return ต่อจาก `declineBill: ...,` เพิ่ม:

```js
    listGoals: () => request('/goals'),
    createGoal: (body) => request('/goals', { method: 'POST', body: JSON.stringify(body) }),
    updateGoal: (id, body) => request(`/goals/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    listGoalContributions: (id) => request(`/goals/${encodeURIComponent(id)}/contributions`),
    addGoalContribution: (id, body) =>
      request(`/goals/${encodeURIComponent(id)}/contributions`, { method: 'POST', body: JSON.stringify(body) }),
    // คืน true เพราะ 204 ได้ null ซึ่งฝั่ง panel ใช้แทนความล้มเหลว
    deleteGoalContribution: (id, contributionId) =>
      request(`/goals/${encodeURIComponent(id)}/contributions/${encodeURIComponent(contributionId)}`, { method: 'DELETE' }).then(() => true),
```

สร้าง `public/liff/goals-format.mjs`:

```js
import { formatBaht, formatFullThaiDate, LOGIN_REQUIRED_MESSAGE } from './format.mjs';

// คิดเป็นสตางค์และปัดลง ให้ตรงกับเปอร์เซ็นต์ที่บอทตอบในแชต
export function goalPercent(saved, target) {
  return Math.floor((Math.round(saved * 100) * 100) / Math.round(target * 100));
}

export function goalRow(goal) {
  const percent = goalPercent(goal.saved, goal.targetAmount);
  return {
    ...goal,
    percent,
    width: Math.min(percent, 100),
    reached: percent >= 100,
    text: `ออมแล้ว ${formatBaht(goal.saved)} จาก ${formatBaht(goal.targetAmount)} (${percent}%)`,
    dateText: goal.targetDate ? `อยากถึงเป้า ${formatFullThaiDate(goal.targetDate)}` : '',
  };
}

export function splitGoals(goals) {
  const rows = goals.map(goalRow);
  return { open: rows.filter((row) => !row.closed), closed: rows.filter((row) => row.closed) };
}

export function contributionRows(contributions) {
  return contributions.map((item) => {
    const date = formatFullThaiDate(item.occurredOn);
    const amount = formatBaht(item.amount);
    return { id: item.id, text: `${date} · ${amount}`, label: `ลบรายการออม ${amount} วันที่ ${date}` };
  });
}

const MESSAGES = new Map([
  ['409:Duplicate name', 'มีเป้าชื่อนี้อยู่แล้ว'],
  ['409:Too many goals', 'มีเป้าที่เปิดอยู่ได้ไม่เกิน 20 เป้า ปิดเป้าที่ไม่ใช้ก่อน'],
  ['409:Goal closed', 'เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม'],
  ['400:Invalid name', 'ชื่อเป้าต้องยาว 1-30 ตัวอักษร'],
  ['400:Invalid amount', 'จำนวนเงินต้องมากกว่า 0 และไม่เกิน 10,000,000 บาท (ทศนิยมไม่เกิน 2 ตำแหน่ง)'],
  ['400:Invalid date', 'วันที่ไม่ถูกต้อง'],
]);

export function describeGoalError(status, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (status === 404) return 'ไม่พบเป้าหรือรายการนี้แล้ว ลองเปิดหน้าใหม่';
  return MESSAGES.get(`${status}:${error}`) ?? 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/api.test.mjs public/liff/goals-format.test.mjs`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 5: Commit**

```bash
git add public/liff/api.mjs public/liff/api.test.mjs public/liff/goals-format.mjs public/liff/goals-format.test.mjs
git commit -m "feat: add goal API calls and goal formatting to the web page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 8: แท็บ "ออม" ในแถบล่าง และชื่อแท็บ "งบ"

**Depends on:** none

**Files:**
- Modify: `public/liff/tabs.mjs` (`TABS` บรรทัด 3-9: label ของ `budgets` และแถว `goals`)
- Modify: `public/liff/index.html` (symbol `tab-goal` ต่อจาก symbol `tab-user`, `#panel-goals` ต่อจาก `#panel-recurring`)
- Modify: `public/liff/style.css` (`.nav-button` บรรทัด 144 และกฎใหม่ต่อจากกฎ `.nav-button .icon` บรรทัด 145, การ์ด `.goals` ต่อจากกฎ `.recurring-rows`)
- Test: `public/liff/tabs.test.mjs`, `public/liff/style.test.mjs`, `public/liff/app.dom.test.mjs`
- Scratch (ไม่อยู่ใน repo ไม่ commit): `<scratchpad ของ session>/nav-width.html` สำหรับวัดความกว้างชื่อแท็บใน headless Chrome (ตอนเขียนแผนคือ `C:\Users\Lenovo\AppData\Local\Temp\claude\C--GithubPrommin-line-expense-bot\3f260a06-b79d-48c5-ad5a-6c9c0f394662\scratchpad`; ถ้า session ของผู้ลงมือมี scratchpad อื่นให้ใช้ของตัวเอง)

**Interfaces:**
- Produces: tab `{ id: 'goals', label: 'ออม', title: 'เป้าหมายการออม', icon: 'tab-goal', showMonth: false }` อยู่ระหว่าง `recurring` กับ `profile`; tab `budgets` เปลี่ยนเฉพาะ `label` เป็น `'งบ'` (`title: 'จัดการงบประมาณ'` คงเดิม เพราะเทสต์ `page-title` และหน้าหมวดของฉันอ้างหัวข้อนี้); panel `#panel-goals` มี `section#goals.goals` และ `h2#goals-title[tabindex="-1"]` (Task 9 เติมเนื้อหาใน section นี้); ลิงก์ `?tab=goals` ใช้ได้ทันทีเพราะ `parseTabLink` อ่าน id จาก `TABS`

**Browser check in LINE app:** *(ทำหลัง merge+push และ Render deploy)*
- Preconditions: เปิดหน้าเว็บจากปุ่ม เปิดเว็บ ในแชตบอท บนมือถือของผู้ใช้ (ถ้ามีมือถือจอเล็กหรือ iPhone SE ให้ลองด้วย)

| # | Action | Expected |
|---|---|---|
| 1 | ดูแถบล่าง | มี 6 แท็บเรียง รายการ สรุป งบ รอบเดือน ออม โปรไฟล์ ชื่อทุกแท็บอยู่บรรทัดเดียว ไม่ถูกตัด ไม่ล้นเข้าแท็บข้างๆ และแถบสูงเท่าเดิม |
| 2 | แตะแท็บ `งบ` | หัวหน้าเป็น `จัดการงบประมาณ` เหมือนเดิม และเห็นงบต่อหมวด |
| 3 | แตะแท็บ `ออม` | หัวหน้าเป็น `เป้าหมายการออม` ช่องเลือกเดือนหายไป แท็บ ออม มีขีดน้ำเงินด้านบน |
| 4 | แตะแท็บ `รายการ` | กลับมาหน้ารายการตามเดิม ช่องเลือกเดือนกลับมา |

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/tabs.test.mjs` เปลี่ยนเทสต์แรกของ `describe('TABS', ...)` เป็น:

```js
  it('has the six tabs in order, without bills which has its own page', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['list', 'summary', 'budgets', 'recurring', 'goals', 'profile']);
    expect(TABS.map((tab) => tab.label)).toEqual(['รายการ', 'สรุป', 'งบ', 'รอบเดือน', 'ออม', 'โปรไฟล์']);
    expect(DEFAULT_TAB).toBe('list');
  });

  // ชื่อแท็บสั้นลงให้ 6 แท็บพอดีจอ 320px แต่หัวหน้ายังบอกเต็มว่าแท็บนี้ทำอะไร
  it('keeps the full page title of the budgets tab', () => {
    expect(TABS.find((tab) => tab.id === 'budgets').title).toBe('จัดการงบประมาณ');
  });
```

และใน `hides the month picker on tabs that do not depend on a month` เพิ่มก่อน `ctx.controller.select('list');`:

```js
    ctx.controller.select('goals');
    expect(ctx.monthEl.hidden).toBe(true);
```

ใน `public/liff/style.test.mjs` ภายใน describe ที่มีเทสต์ `makes the bottom nav 68px tall` เพิ่มต่อจากเทสต์นั้น:

```js
  // วัดจริง 2026-10-19: 6 แท็บที่จอ 320px "รอบเดือน" กว้าง 51.3px แต่ปุ่มเหลือ 49px ถ้ามี padding ข้าง และห้ามย่อตัวอักษรต่ำกว่า 13px
  it('keeps every tab label on one line without side padding', () => {
    expect(declarations('.nav-button')).toMatch(/padding:\s*8px 0;/);
    expect(declarations('.nav-button span')).toMatch(/white-space:\s*nowrap/);
  });
```

ใน `public/liff/app.dom.test.mjs`:
- เทสต์ `renders the five bottom tabs with the list tab selected` (บรรทัด 359) เปลี่ยนชื่อเป็น `renders the six bottom tabs with the list tab selected` เปลี่ยน array ที่คาดเป็น `['รายการ', 'สรุป', 'งบ', 'รอบเดือน', 'ออม', 'โปรไฟล์']` และ loop `for (const id of ['summary', 'budgets', 'recurring', 'bills', 'profile'])` เป็น `for (const id of ['summary', 'budgets', 'recurring', 'goals', 'bills', 'profile'])`
- เทสต์ `switches through every tab updating selection, panels, title, and month picker` เพิ่มใน `expected` ต่อจาก `recurring`:

```js
      goals: { title: 'เป้าหมายการออม', month: true },
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/tabs.test.mjs public/liff/style.test.mjs public/liff/app.dom.test.mjs`
Expected: FAIL เทสต์ที่แก้ทั้งหมดข้างบน (ยังมี 5 แท็บและชื่อ จัดการงบ, ยังไม่มี `#panel-goals`, padding ยังเป็น `8px 2px`) ยกเว้น `keeps the full page title of the budgets tab` ที่ผ่านอยู่แล้ว (เป็นเทสต์กันไม่ให้เปลี่ยน title ไปด้วย)

- [ ] **Step 3: เพิ่มแท็บ ไอคอน panel และ CSS**

ใน `public/liff/tabs.mjs` เปลี่ยนแถว `budgets` ใน `TABS` เป็น (เปลี่ยนแค่ `label`):

```js
  { id: 'budgets', label: 'งบ', title: 'จัดการงบประมาณ', icon: 'tab-budget', showMonth: true },
```

และต่อจากแถว `recurring` เพิ่ม:

```js
  { id: 'goals', label: 'ออม', title: 'เป้าหมายการออม', icon: 'tab-goal', showMonth: false },
```

ใน `public/liff/index.html` ต่อจาก `</symbol>` ของ `<symbol id="tab-user" ...>`:

```html
    <symbol id="tab-goal" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12h.01" />
    </symbol>
```

ต่อจาก `</div>` ที่ปิด `<div id="panel-recurring" ...>` (ก่อน `<div id="panel-bills" ...>`):

```html
    <div id="panel-goals" class="panel" hidden>
      <section id="goals" class="goals" aria-labelledby="goals-title">
        <h2 id="goals-title" tabindex="-1">เป้าหมายการออม</h2>
        <p class="goals-hint">ออมผ่านแชตได้ เช่น <span class="nowrap">ออม เที่ยวญี่ปุ่น 1000</span></p>
      </section>
    </div>
```

ใน `public/liff/style.css` กฎ `.nav-button { ... }` เปลี่ยน `padding: 8px 2px;` เป็น `padding: 8px 0;` แล้วต่อจากกฎ `.nav-button .icon { ... }` เพิ่ม:

```css
.nav-button span { white-space: nowrap; }
```

ต่อจากกฎ `.recurring-rows { ... }` เพิ่ม:

```css
.goals { margin: 12px 16px 0; padding: 20px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.goals h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.3; }
.goals-hint { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/tabs.test.mjs public/liff/style.test.mjs public/liff/app.dom.test.mjs`
Expected: PASS ทั้งสามไฟล์ (เทสต์ `defines a sprite symbol for every bottom tab icon` ผ่านเพราะมี `tab-goal` แล้ว)

- [ ] **Step 5: วัดความกว้างชื่อแท็บใน headless Chrome ที่ 320/360/390px**

jsdom ไม่มี layout จึงวัดด้วย Chrome จริง สร้างไฟล์ `nav-width.html` ใน scratchpad ของ session (ไม่ใช่ใน repo) ด้วยเนื้อหานี้ (ปรับ path `file:///C:/GithubPrommin/line-expense-bot/...` ถ้า repo อยู่ที่อื่น หรือถ้าทำใน worktree ให้ชี้ไปที่ worktree นั้น):

```html
<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="file:///C:/GithubPrommin/line-expense-bot/public/liff/tokens.css">
<link rel="stylesheet" href="file:///C:/GithubPrommin/line-expense-bot/public/liff/style.css">
</head><body>
<pre id="out"></pre>
<script>
// ต้องตรงกับ label ใน public/liff/tabs.mjs
const LABELS = ['รายการ', 'สรุป', 'งบ', 'รอบเดือน', 'ออม', 'โปรไฟล์'];
function measure(width) {
  const frame = document.createElement('div');
  frame.style.cssText = `position:relative;width:${width}px;height:80px;`;
  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.style.position = 'absolute';
  for (const text of LABELS) {
    const button = document.createElement('button');
    button.className = 'nav-button';
    button.innerHTML = '<svg class="icon"></svg><span></span>';
    button.querySelector('span').textContent = text;
    nav.append(button);
  }
  frame.append(nav);
  document.body.append(frame);
  const rows = [...nav.children].map((button) => {
    const style = getComputedStyle(button);
    const content = button.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const span = button.querySelector('span');
    // nowrap ทำให้นับบรรทัดได้ 1 เสมอ จึงวัดความกว้างข้อความจริงเทียบกับพื้นที่ในปุ่มด้วย
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;white-space:nowrap;visibility:hidden;font:inherit;';
    probe.textContent = span.textContent;
    button.append(probe);
    const text = probe.getBoundingClientRect().width;
    probe.remove();
    const range = document.createRange();
    range.selectNodeContents(span);
    const lines = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    return `${span.textContent}: content ${content.toFixed(1)}px text ${text.toFixed(1)}px lines ${lines} fits ${text <= content ? 'yes' : 'NO'}`;
  });
  frame.remove();
  return rows;
}
const out = [];
for (const width of [320, 360, 390]) out.push(`${width}px`, ...measure(width).map((line) => '  ' + line));
document.getElementById('out').textContent = out.join('\n');
</script></body></html>
```

Run (Git Bash, แทน `<scratchpad>` ด้วย path จริงแบบ `C:/Users/...` ใน URL):

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --allow-file-access-from-files --disable-gpu --virtual-time-budget=3000 --dump-dom "file:///<scratchpad>/nav-width.html" 2>/dev/null | sed -n '/<pre id="out">/,/<\/pre>/p'
```

Expected: ทุกบรรทัดของทั้ง 320px, 360px และ 390px เป็น `lines 1 fits yes` ตอนเขียนแผน (2026-10-19, ฟอนต์ของ Windows) วัดได้ที่ 320px: ปุ่มละ `content 53.0px`, `รอบเดือน: text 51.3px`, `โปรไฟล์: text 45.0px`, `รายการ: text 43.1px`, `งบ: text 13.9px` (ก่อนตัด padding ข้าง ปุ่มเหลือ 49.0px และ `รอบเดือน` ตัดเป็น 2 บรรทัด) ถ้ามีบรรทัดไหนเป็น `fits NO` ให้หยุดและรายงานผู้ใช้พร้อมตัวเลข อย่าย่อตัวอักษรต่ำกว่า 13px เอง (ฟอนต์บนมือถือต่างจาก Windows ได้ จึงยังต้องดูจริงใน Browser check)

- [ ] **Step 6: Commit**

```bash
git add public/liff/tabs.mjs public/liff/tabs.test.mjs public/liff/index.html public/liff/style.css public/liff/style.test.mjs public/liff/app.dom.test.mjs
git commit -m "feat: add the savings tab and shorten the budgets tab label

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 9: แท็บออม รายการเป้า สร้าง แก้ และปิดเป้า

**Depends on:** Task 7, Task 8

**Files:**
- Create: `public/liff/goals-panel.mjs`
- Modify: `public/liff/index.html` (เนื้อหาใน `section#goals`, dialog `#goal-editor` ต่อจาก dialog `#recurring-confirm-delete`)
- Modify: `public/liff/style.css` (กฎของแถวเป้าต่อจากกฎ `.goals-hint`, `.check` ของ `#goal-editor` ต่อจากกฎ `#recurring-editor .check input`)
- Modify: `public/liff/app.mjs` (import, สร้าง `goalsPanel` ก่อน `const tabController = createTabController({`, `onChange` ของ tab)
- Test: `public/liff/app.dom.test.mjs` (`RESPONSES`, รายการ id ที่ต้องเริ่มด้วย hidden, describe ใหม่ท้ายไฟล์)

**Interfaces:**
- Consumes: `splitGoals`, `describeGoalError` (Task 7); `api.listGoals`, `api.createGoal`, `api.updateGoal` (Task 7); `#panel-goals`, `#goals-title` (Task 8)
- Produces: `createGoalsPanel({ doc, els, getApi }) => { refresh(): Promise<void> }` โหลดรายการเป้าเมื่อเรียก `refresh` (แท็บเรียกทุกครั้งที่เข้าแท็บ ออม); แถวเป้าแต่ละแถวคือ `li.goal-row` (เพิ่ม class `reached` เมื่อถึงเป้า) ที่มี `button.budget-button[data-goal-id]` ภายในมี `.budget-label` (ชื่อ) `.budget-edit` (คำกระทำ) `.budget-value` (ข้อความยอด) `.budget-track > .budget-fill[data-width]` และ `.goal-date` (ถ้ามีวันที่); ภายใน panel มี function `onRowClick(row)` และค่าคงที่ `ROW_ACTION_LABEL` ที่ Task 10 จะเปลี่ยน

**Browser check in LINE app:** *(ทำหลังผู้ใช้รัน `supabase/023_savings_goals.sql` แล้ว merge+push และ Render deploy)*
- Preconditions: เปิดหน้าเว็บจากแชตบอทในแอป LINE ยังไม่มีเป้าออม

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ `ออม` | เห็นข้อความ `ยังไม่มีเป้าออม กดปุ่มด้านล่างเพื่อสร้างเป้าแรก` และปุ่ม `สร้างเป้าใหม่` กดได้ |
| 2 | กด `สร้างเป้าใหม่` ใส่ชื่อ `เที่ยวญี่ปุ่น` ยอดเป้า `50000` วันที่ 31 ธ.ค. ปีนี้ แล้วกด `บันทึก` | dialog ปิด ขึ้นข้อความ `สร้างเป้า เที่ยวญี่ปุ่น แล้ว` มีแถว `เที่ยวญี่ปุ่น` ข้อความ `ออมแล้ว 0 บาท จาก 50,000 บาท (0%)` หลอดว่าง และบรรทัด `อยากถึงเป้า 31 ธ.ค. <ปี พ.ศ.>` |
| 3 | กด `สร้างเป้าใหม่` อีกครั้ง ใส่ชื่อ `เที่ยวญี่ปุ่น` ยอด `1000` แล้วกด `บันทึก` | dialog ยังเปิด มีข้อความแดง `มีเป้าชื่อนี้อยู่แล้ว` |
| 4 | ปิด dialog แล้วแตะแถว `เที่ยวญี่ปุ่น` ติ๊ก `ปิดเป้านี้` แล้วกด `บันทึก` | แถวย้ายไปอยู่ใต้หัวข้อพับ `ปิดแล้ว 1 เป้า` ขึ้นข้อความ `ปิดเป้า เที่ยวญี่ปุ่น แล้ว` |
| 5 | เปิดหัวข้อ `ปิดแล้ว 1 เป้า` แตะแถวนั้น เอาติ๊ก `ปิดเป้านี้` ออก แล้วกด `บันทึก` | แถวกลับมาอยู่ในรายการเป้าที่เปิด (เปิดไว้สำหรับ LINE check ของ Task 6 และ 10) |

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/app.dom.test.mjs` object `RESPONSES` เพิ่มต่อจาก `'/api/recurring': { rules: [] },`:

```js
  '/api/goals': {
    goals: [
      { id: 'g-1', name: 'เที่ยวญี่ปุ่น', targetAmount: 50000, targetDate: '2026-12-31', closed: false, saved: 6000, contributionCount: 2 },
      { id: 'g-2', name: 'กองทุนฉุกเฉิน', targetAmount: 10000, targetDate: null, closed: false, saved: 12000, contributionCount: 3 },
      { id: 'g-3', name: 'มือถือใหม่', targetAmount: 30000, targetDate: null, closed: true, saved: 30000, contributionCount: 5 },
    ],
  },
```

ในเทสต์ `starts every JS-controlled loading and error element hidden` เพิ่ม id ต่อจาก `'bill-dialog-busy',`:

```js
      'goals-loading',
      'goals-skeleton',
      'goals-error',
      'goals-body',
      'goals-empty',
      'goals-closed',
      'goal-editor-closed-row',
      'goal-editor-busy',
      'goal-editor-error',
```

ท้ายไฟล์เพิ่ม:

```js
describe('LIFF goals tab', () => {
  const rowsOf = (id = 'goal-rows') => [...byId(id).querySelectorAll('.goal-row')];
  const namesOf = (id) => rowsOf(id).map((row) => row.querySelector('.budget-label').textContent);
  const submitEditor = () => byId('goal-editor-form').dispatchEvent(new Event('submit', { cancelable: true }));
  const openGoalEditor = async (index) => {
    rowsOf()[index].querySelector('button').click();
  };

  // เก็บ body ที่ส่งไว้ตรวจ route คืน override แบบเดียวกับ makeFetch หรือ undefined เพื่อใช้ค่าเริ่มต้น
  function captureFetch(route = () => undefined) {
    const calls = [];
    const fallback = makeFetch({});
    vi.stubGlobal('fetch', async (url, options = {}) => {
      const path = new URL(url, 'http://localhost').pathname;
      const method = options.method ?? 'GET';
      calls.push({ call: `${method} ${path}`, body: options.body ? JSON.parse(options.body) : undefined });
      const override = route(method, path);
      return override === undefined ? fallback(url, options) : makeFetch({ [path]: override })(url, options);
    });
    return calls;
  }

  async function openTab(options) {
    const liff = await boot(options);
    clickTab('goals');
    await settle();
    return liff;
  }

  it('loads the goals only when the tab opens and shows the open goals with their progress', async () => {
    const liff = await boot();
    expect(liff.fetched).not.toContain('/api/goals');

    clickTab('goals');
    await settle();

    expect(liff.fetched).toContain('/api/goals');
    const rows = rowsOf();
    expect(namesOf()).toEqual(['เที่ยวญี่ปุ่น', 'กองทุนฉุกเฉิน']);
    expect(rows[0].querySelector('.budget-value').textContent).toBe('ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)');
    expect(rows[0].querySelector('.budget-fill').dataset.width).toBe('12');
    expect(rows[0].querySelector('.goal-date').textContent).toBe('อยากถึงเป้า 31 ธ.ค. 2569');
    expect(rows[1].classList.contains('reached')).toBe(true);
    expect(rows[1].querySelector('.budget-fill').dataset.width).toBe('100');
    expect(rows[1].querySelector('.goal-date')).toBeNull();
    expect(byId('goals-closed').hidden).toBe(false);
    expect(byId('goals-closed-count').textContent).toBe('ปิดแล้ว 1 เป้า');
    expect(namesOf('goal-closed-rows')).toEqual(['มือถือใหม่']);
    expect(byId('goals-empty').hidden).toBe(true);
    expect(byId('goal-add').disabled).toBe(false);
  });

  it('shows the empty note when there are no goals', async () => {
    await openTab({ overrides: { '/api/goals': { goals: [] } } });

    expect(rowsOf()).toHaveLength(0);
    expect(byId('goals-empty').hidden).toBe(false);
    expect(byId('goals-closed').hidden).toBe(true);
  });

  it('shows an error with retry when the goals fail to load, and the retry loads them', async () => {
    await openTab({ overrides: { '/api/goals': { status: 500 } } });

    expect(byId('goals-error').hidden).toBe(false);
    expect(byId('goals-error-text').textContent).toBe('โหลดเป้าออมไม่สำเร็จ');
    expect(byId('goals-retry').hidden).toBe(false);
    expect(byId('goals-body').hidden).toBe(true);

    captureFetch();
    byId('goals-retry').click();
    await settle();

    expect(byId('goals-error').hidden).toBe(true);
    expect(rowsOf()).toHaveLength(2);
  });

  it('asks to reopen from LINE without a retry on a 401', async () => {
    await openTab({ overrides: { '/api/goals': { status: 401 } } });

    expect(byId('goals-error-text').textContent).toBe('กรุณาเปิดหน้านี้จากแอป LINE อีกครั้ง');
    expect(byId('goals-retry').hidden).toBe(true);
  });

  // ผู้ใช้อาจออมผ่านแชตระหว่างที่หน้าเว็บเปิดอยู่
  it('reloads the goals every time the tab opens again', async () => {
    await openTab();
    const calls = captureFetch();

    clickTab('list');
    clickTab('goals');
    await settle();

    expect(calls.map((entry) => entry.call)).toEqual(['GET /api/goals']);
  });

  it('creates a goal without a date and reloads the list', async () => {
    await openTab();
    const calls = captureFetch((method, path) => (method === 'POST' && path === '/api/goals' ? { goal: { id: 'g-9' } } : undefined));

    byId('goal-add').click();
    expect(byId('goal-editor').hasAttribute('open')).toBe(true);
    expect(byId('goal-editor-title').textContent).toBe('สร้างเป้าใหม่');
    expect(byId('goal-editor-closed-row').hidden).toBe(true);
    byId('goal-editor-name').value = '  คอนโด  ';
    byId('goal-editor-target').value = '1500000';
    submitEditor();
    await settle();

    expect(calls).toEqual([
      { call: 'POST /api/goals', body: { name: 'คอนโด', targetAmount: 1500000, targetDate: null } },
      { call: 'GET /api/goals', body: undefined },
    ]);
    expect(byId('goal-editor').hasAttribute('open')).toBe(false);
    expect(byId('goals-status').textContent).toBe('สร้างเป้า คอนโด แล้ว');
  });

  it('keeps the editor open with the reason when the name is taken', async () => {
    await openTab();
    captureFetch((method) => (method === 'POST' ? { status: 409, error: 'Duplicate name' } : undefined));

    byId('goal-add').click();
    byId('goal-editor-name').value = 'เที่ยวญี่ปุ่น';
    byId('goal-editor-target').value = '1000';
    submitEditor();
    await settle();

    expect(byId('goal-editor').hasAttribute('open')).toBe(true);
    expect(byId('goal-editor-error').hidden).toBe(false);
    expect(byId('goal-editor-error').textContent).toBe('มีเป้าชื่อนี้อยู่แล้ว');
    expect(byId('goal-editor-save').disabled).toBe(false);
  });

  it('fills the editor with the goal and sends only the changed field when closing it', async () => {
    await openTab();
    const calls = captureFetch((method) => (method === 'PATCH' ? { goal: { id: 'g-1' } } : undefined));

    await openGoalEditor(0);
    expect(byId('goal-editor-title').textContent).toBe('แก้เป้า');
    expect(byId('goal-editor-name').value).toBe('เที่ยวญี่ปุ่น');
    expect(byId('goal-editor-target').value).toBe('50000');
    expect(byId('goal-editor-date').value).toBe('2026-12-31');
    expect(byId('goal-editor-closed-row').hidden).toBe(false);
    byId('goal-editor-closed').checked = true;
    submitEditor();
    await settle();

    expect(calls.find((entry) => entry.call.startsWith('PATCH'))).toEqual({ call: 'PATCH /api/goals/g-1', body: { closed: true } });
    expect(byId('goals-status').textContent).toBe('ปิดเป้า เที่ยวญี่ปุ่น แล้ว');
  });

  it('closes the editor without a request when nothing changed', async () => {
    await openTab();
    const calls = captureFetch();

    await openGoalEditor(0);
    submitEditor();
    await settle();

    expect(calls.filter((entry) => entry.call.startsWith('PATCH'))).toEqual([]);
    expect(byId('goal-editor').hasAttribute('open')).toBe(false);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: FAIL `starts every JS-controlled loading and error element hidden` (หา `goals-loading` ไม่เจอ) และทุกเทสต์ใน `LIFF goals tab` ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 3: เพิ่ม markup**

ใน `public/liff/index.html` ภายใน `section#goals` ต่อจาก `<p class="goals-hint">...</p>`:

```html
        <p id="goals-status" class="goals-status" role="status" aria-live="polite"></p>
        <p id="goals-loading" class="sr-only" role="status" hidden>กำลังโหลดเป้าออม...</p>
        <ul id="goals-skeleton" class="skeleton-list" aria-hidden="true" hidden></ul>
        <div id="goals-error" class="budgets-error" hidden>
          <p id="goals-error-text" role="alert"></p>
          <button type="button" id="goals-retry">ลองใหม่</button>
        </div>
        <div id="goals-body" hidden>
          <ul id="goal-rows" class="goal-rows"></ul>
          <p id="goals-empty" class="goals-empty" hidden>ยังไม่มีเป้าออม กดปุ่มด้านล่างเพื่อสร้างเป้าแรก</p>
          <details id="goals-closed" class="goals-closed" hidden>
            <summary id="goals-closed-count"></summary>
            <ul id="goal-closed-rows" class="goal-rows"></ul>
          </details>
        </div>
        <button type="button" id="goal-add" class="categories-open goal-add" disabled><svg class="icon"
            aria-hidden="true" focusable="false">
            <use href="#icon-plus"></use>
          </svg>สร้างเป้าใหม่</button>
```

ต่อจาก `</dialog>` ของ `<dialog id="recurring-confirm-delete" ...>`:

```html
  <dialog id="goal-editor" aria-labelledby="goal-editor-title">
    <form id="goal-editor-form">
      <h2 id="goal-editor-title" tabindex="-1"></h2>
      <button type="button" id="goal-editor-close" class="dialog-close" aria-label="ปิด"><svg class="icon"
          aria-hidden="true" focusable="false">
          <use href="#icon-close"></use>
        </svg></button>
      <label>ชื่อเป้า
        <input id="goal-editor-name" type="text" maxlength="30" required>
      </label>
      <label>ยอดเป้า (บาท)
        <input id="goal-editor-target" type="number" inputmode="decimal" step="0.01" min="0.01" max="10000000" required>
      </label>
      <label>อยากถึงเป้าภายในวันที่ (ไม่บังคับ)
        <input id="goal-editor-date" type="date">
      </label>
      <label id="goal-editor-closed-row" class="check" hidden>
        <input id="goal-editor-closed" type="checkbox"> ปิดเป้านี้ (ไม่รับยอดออมเพิ่ม และไม่ขึ้นในแชต)
      </label>
      <p id="goal-editor-busy" class="confirm-detail" role="status" hidden>กำลังบันทึก...</p>
      <p id="goal-editor-error" class="error" role="alert" hidden></p>
      <div class="actions">
        <button type="submit" id="goal-editor-save" class="primary">บันทึก</button>
      </div>
    </form>
  </dialog>
```

ใน `public/liff/style.css` ต่อจากกฎ `.goals-hint { ... }`:

```css
.goals-status { margin: 8px 0 0; font-size: 14px; color: var(--muted); }
.goals-status:empty { display: none; }
.goal-rows { list-style: none; margin: 4px 0 0; padding: 0; }
.goal-row .budget-fill { background: var(--primary); }
.goal-row.reached .budget-fill { background: var(--income); }
.goal-date { grid-column: 1 / -1; font-size: 13px; color: var(--muted); }
.goals-empty { margin: 12px 0 0; color: var(--muted); }
.goals-closed { margin-top: 12px; }
.goals-closed summary { display: flex; align-items: center; min-height: 44px; color: var(--primary); font-weight: 700; cursor: pointer; }
.goal-add { margin-top: 16px; }
```

ต่อจากกฎ `#recurring-editor .check input { ... }`:

```css
#goal-editor .check { display: flex; align-items: center; gap: 8px; min-height: 44px; }
#goal-editor .check input { width: auto; min-height: 0; margin: 0; flex: none; }
```

- [ ] **Step 4: เขียน goals panel**

สร้าง `public/liff/goals-panel.mjs`:

```js
import { ApiError } from './api.mjs';
import { createLoadingIndicator } from './skeleton.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';
import { splitGoals, describeGoalError } from './goals-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);
const errorOf = (err) => (err instanceof ApiError ? err.error : undefined);
const ROW_ACTION_LABEL = 'แก้เป้า';

// แท็บออม: โหลดตอนเข้าแท็บเท่านั้น และโหลดใหม่ทุกครั้งเพราะผู้ใช้อาจออมผ่านแชตระหว่างนั้น
export function createGoalsPanel({ doc, els, getApi }) {
  let goals = [];
  let loaded = false;
  let loading = null;
  let editorBusy = false;
  let editorOpen = false;
  // เป้าที่กำลังแก้ ถ้าเป็น null แปลว่ากำลังสร้างเป้าใหม่
  let editing = null;
  const loadingIndicator = createLoadingIndicator({ doc, textEl: els.loadingText, skeletonEl: els.skeleton, count: 3, variant: 'budget' });

  function onRowClick(row) {
    openEditor(row);
  }

  function renderRow(row) {
    const item = doc.createElement('li');
    item.className = row.reached ? 'goal-row reached' : 'goal-row';
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'budget-button';
    button.dataset.goalId = row.id;
    const name = doc.createElement('span');
    name.className = 'budget-label';
    name.textContent = row.name;
    const action = doc.createElement('span');
    action.className = 'budget-edit';
    action.textContent = ROW_ACTION_LABEL;
    const value = doc.createElement('span');
    value.className = 'budget-value';
    value.textContent = row.text;
    // ใช้ span เพราะใน button ใส่ div ไม่ได้
    const track = doc.createElement('span');
    track.className = 'budget-track';
    const fill = doc.createElement('span');
    fill.className = 'budget-fill';
    fill.style.width = `${row.width}%`;
    fill.dataset.width = String(row.width);
    track.append(fill);
    button.append(name, action, value, track);
    if (row.dateText) {
      const date = doc.createElement('span');
      date.className = 'goal-date';
      date.textContent = row.dateText;
      button.append(date);
    }
    button.addEventListener('click', () => onRowClick(row));
    item.append(button);
    return item;
  }

  function render() {
    const { open, closed } = splitGoals(goals);
    els.rows.replaceChildren(...open.map(renderRow));
    els.empty.hidden = open.length > 0;
    els.closed.hidden = closed.length === 0;
    els.closedCount.textContent = `ปิดแล้ว ${closed.length} เป้า`;
    els.closedRows.replaceChildren(...closed.map(renderRow));
    loadingIndicator.set(false);
    els.error.hidden = true;
    els.body.hidden = false;
  }

  function showLoadError(err) {
    loadingIndicator.set(false);
    // โหลดซ้ำหลังบันทึกแล้วพัง ยังแสดงรายการเดิมไว้
    if (!loaded) els.body.hidden = true;
    const loginRequired = statusOf(err) === 401;
    els.errorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : 'โหลดเป้าออมไม่สำเร็จ';
    // เข้าสู่ระบบใหม่ไม่ได้แก้ด้วยการลองโหลดซ้ำ
    els.retry.hidden = loginRequired;
    els.error.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.error.hidden = true;
    if (!loaded) loadingIndicator.set(true);
    loading = api
      .listGoals()
      .then((result) => {
        goals = result.goals;
        loaded = true;
        els.add.disabled = false;
        render();
      }, showLoadError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function refresh() {
    return loading || load();
  }

  function setEditorBusy(next) {
    editorBusy = next;
    for (const el of [els.editorSave, els.editorClose, els.editorName, els.editorTarget, els.editorDate, els.editorClosed]) {
      el.disabled = next;
    }
    els.editorBusy.hidden = !next;
  }

  function setEditorError(text) {
    els.editorError.textContent = text;
    els.editorError.hidden = !text;
  }

  function openEditor(goal) {
    editing = goal;
    editorOpen = true;
    els.editorTitle.textContent = goal ? 'แก้เป้า' : 'สร้างเป้าใหม่';
    els.editorName.value = goal ? goal.name : '';
    els.editorTarget.value = goal ? String(goal.targetAmount) : '';
    els.editorDate.value = goal && goal.targetDate ? goal.targetDate : '';
    els.editorClosed.checked = goal ? goal.closed : false;
    els.editorClosedRow.hidden = !goal;
    setEditorError('');
    els.editor.showModal();
    // แก้เป้าเดิมไม่ควรเด้งคีย์บอร์ดทันที จึงโฟกัสหัวข้อ เว้นแต่สร้างเป้าใหม่
    (goal ? els.editorTitle : els.editorName).focus();
  }

  function closeEditor() {
    editorOpen = false;
    editing = null;
    els.editor.close();
  }

  function readEditor() {
    return {
      name: els.editorName.value.trim(),
      targetAmount: Number(els.editorTarget.value),
      targetDate: els.editorDate.value || null,
    };
  }

  function changesFor(goal, input) {
    const changes = {};
    if (input.name !== goal.name) changes.name = input.name;
    if (input.targetAmount !== goal.targetAmount) changes.targetAmount = input.targetAmount;
    if (input.targetDate !== goal.targetDate) changes.targetDate = input.targetDate;
    if (els.editorClosed.checked !== goal.closed) changes.closed = els.editorClosed.checked;
    return changes;
  }

  function savedMessage(goal, body, name) {
    if (!goal) return `สร้างเป้า ${name} แล้ว`;
    if (body.closed === true) return `ปิดเป้า ${name} แล้ว`;
    if (body.closed === false) return `เปิดเป้า ${name} อีกครั้งแล้ว`;
    return `บันทึกเป้า ${name} แล้ว`;
  }

  async function submitEditor() {
    const goal = editing;
    const input = readEditor();
    const body = goal ? changesFor(goal, input) : input;
    if (goal && Object.keys(body).length === 0) {
      closeEditor();
      return;
    }
    setEditorError('');
    setEditorBusy(true);
    try {
      if (goal) await getApi().updateGoal(goal.id, body);
      else await getApi().createGoal(body);
    } catch (err) {
      setEditorError(describeGoalError(statusOf(err), errorOf(err)));
      return;
    } finally {
      setEditorBusy(false);
    }
    els.status.textContent = savedMessage(goal, body, input.name);
    closeEditor();
    await load();
    els.title.focus();
  }

  els.add.addEventListener('click', () => openEditor(null));
  els.retry.addEventListener('click', () => {
    if (!loading) load();
  });
  els.editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (editorBusy || !editorOpen) return;
    await submitEditor();
  });
  els.editorClose.addEventListener('click', () => {
    if (!editorBusy) closeEditor();
  });
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.editor.addEventListener('cancel', (event) => {
    if (editorBusy) event.preventDefault();
  });
  els.editor.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (editorBusy) {
      els.editor.showModal();
      return;
    }
    editorOpen = false;
    editing = null;
  });

  return { refresh };
}
```

- [ ] **Step 5: ต่อ panel เข้า app.mjs**

ใน `public/liff/app.mjs` ต่อจาก `import { createBillForm } from './bill-form.mjs';` เพิ่ม:

```js
import { createGoalsPanel } from './goals-panel.mjs';
```

ก่อนบรรทัด `const tabController = createTabController({` เพิ่ม:

```js
const goalsPanel = createGoalsPanel({
  doc: document,
  els: {
    title: document.getElementById('goals-title'),
    status: document.getElementById('goals-status'),
    loadingText: document.getElementById('goals-loading'),
    skeleton: document.getElementById('goals-skeleton'),
    error: document.getElementById('goals-error'),
    errorText: document.getElementById('goals-error-text'),
    retry: document.getElementById('goals-retry'),
    body: document.getElementById('goals-body'),
    rows: document.getElementById('goal-rows'),
    empty: document.getElementById('goals-empty'),
    closed: document.getElementById('goals-closed'),
    closedCount: document.getElementById('goals-closed-count'),
    closedRows: document.getElementById('goal-closed-rows'),
    add: document.getElementById('goal-add'),
    editor: document.getElementById('goal-editor'),
    editorForm: document.getElementById('goal-editor-form'),
    editorTitle: document.getElementById('goal-editor-title'),
    editorClose: document.getElementById('goal-editor-close'),
    editorName: document.getElementById('goal-editor-name'),
    editorTarget: document.getElementById('goal-editor-target'),
    editorDate: document.getElementById('goal-editor-date'),
    editorClosedRow: document.getElementById('goal-editor-closed-row'),
    editorClosed: document.getElementById('goal-editor-closed'),
    editorBusy: document.getElementById('goal-editor-busy'),
    editorError: document.getElementById('goal-editor-error'),
    editorSave: document.getElementById('goal-editor-save'),
  },
  getApi: () => api,
});
```

ใน `onChange` ของ `createTabController` ต่อจาก `if (id === 'budgets') playBars(window, els.budgetRows);` เพิ่ม:

```js
    // ผู้ใช้อาจออมผ่านแชตระหว่างที่หน้าเว็บเปิดอยู่ จึงโหลดใหม่ทุกครั้งที่เข้าแท็บ
    if (id === 'goals') goalsPanel.refresh();
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสองไฟล์ (รวมเทสต์ `has no font size below 13px`)

- [ ] **Step 7: Commit**

```bash
git add public/liff/goals-panel.mjs public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: list, create and close savings goals in the web page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 10: รายละเอียดเป้า ออมเพิ่ม ประวัติ และลบรายการออม

**Depends on:** Task 9

**Files:**
- Modify: `public/liff/goals-panel.mjs`
- Modify: `public/liff/index.html` (dialog `#goal-detail` ต่อจาก dialog `#goal-editor`)
- Modify: `public/liff/style.css` (กฎใหม่ต่อจากกฎ `.goal-add`)
- Modify: `public/liff/app.mjs` (els ของ `createGoalsPanel`)
- Test: `public/liff/app.dom.test.mjs` (`RESPONSES`, รายการ id ที่ต้องเริ่มด้วย hidden, helper `openGoalEditor` และเทสต์ใหม่ใน `LIFF goals tab`)

**Interfaces:**
- Consumes: `goalRow`, `contributionRows`, `describeGoalError` (Task 7); `api.listGoalContributions`, `api.addGoalContribution`, `api.deleteGoalContribution` (Task 7); `onRowClick`, `ROW_ACTION_LABEL`, `openEditor`, `load` ใน `goals-panel.mjs` (Task 9); `currentDate`, `formatBaht` จาก `format.mjs`
- Produces: แตะแถวเป้าเปิด dialog `#goal-detail` (แทนการเปิดตัวแก้เป้าโดยตรง) ซึ่งมีปุ่ม `#goal-detail-edit` เปิดตัวแก้เป้า; คำกระทำในแถวเปลี่ยนเป็น `ออมเพิ่ม`

**Browser check in LINE app:** *(ทำหลังผู้ใช้รัน `supabase/023_savings_goals.sql` แล้ว merge+push และ Render deploy และหลัง Browser check ของ Task 9)*
- Preconditions: มีเป้าที่เปิดอยู่ `เที่ยวญี่ปุ่น` ยอดเป้า 50,000 ยังไม่มีรายการออม

| # | Action | Expected |
|---|---|---|
| 1 | แท็บ `ออม` แตะแถว `เที่ยวญี่ปุ่น` | dialog ชื่อ `เที่ยวญี่ปุ่น` บอก `ออมแล้ว 0 บาท จาก 50,000 บาท (0%)` ช่องวันที่เป็นวันนี้ หัวข้อ `ประวัติการออม` บอก `ยังไม่มีรายการออม` |
| 2 | ใส่ `1000` ในช่อง `ออมเพิ่ม (บาท)` แล้วกด `ออมเพิ่ม` | ขึ้น `ออมเพิ่ม 1,000 บาท แล้ว` ยอดใน dialog เป็น `ออมแล้ว 1,000 บาท จาก 50,000 บาท (2%)` ประวัติมีแถว `<วันนี้> · 1,000 บาท` ช่องจำนวนเงินว่าง และหลอดในแถวเป้าด้านหลังขยับ |
| 3 | กด `ลบ` ที่แถวประวัตินั้น | ขึ้น `ลบรายการออมแล้ว` ประวัติกลับเป็น `ยังไม่มีรายการออม` ยอดกลับเป็น 0 บาท |
| 4 | พิมพ์ `ออม เที่ยวญี่ปุ่น 500` ในแชต แล้วกลับมาหน้าเว็บ แตะแท็บอื่นแล้วแตะ `ออม` อีกครั้ง | แถวเป้าบอก `ออมแล้ว 500 บาท ...` (โหลดใหม่ตอนเข้าแท็บ) |
| 5 | แตะแถวเป้า กด `แก้เป้า` | dialog รายละเอียดปิด ตัวแก้เป้าเปิดพร้อมชื่อ `เที่ยวญี่ปุ่น` |

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/app.dom.test.mjs` object `RESPONSES` เพิ่มต่อจาก `'/api/goals': { ... },`:

```js
  '/api/goals/g-1/contributions': {
    contributions: [
      { id: 'gc-2', amount: 1000, occurredOn: '2026-10-14' },
      { id: 'gc-1', amount: 5000, occurredOn: '2026-10-01' },
    ],
  },
  '/api/goals/g-3/contributions': { contributions: [] },
```

ในเทสต์ `starts every JS-controlled loading and error element hidden` เพิ่มต่อจาก `'goal-editor-error',`:

```js
      'goal-detail-closed-note',
      'goal-detail-busy',
      'goal-detail-error',
      'goal-history-loading',
      'goal-history-error',
      'goal-history-empty',
      'goal-history-limit',
```

ใน `describe('LIFF goals tab', ...)` เปลี่ยน helper `openGoalEditor` เป็น (ตัวแก้เป้าเปิดจาก dialog รายละเอียดแล้ว):

```js
  const openGoalEditor = async (index) => {
    rowsOf()[index].querySelector('button').click();
    await settle();
    byId('goal-detail-edit').click();
  };
```

และเพิ่มเทสต์ท้าย describe เดียวกัน:

```js
  const openDetailOf = async (id, index) => {
    rowsOf(id)[index].querySelector('button').click();
    await settle();
  };
  const historyTexts = () => [...byId('goal-history').querySelectorAll('li > span')].map((el) => el.textContent);
  const submitDetail = () => byId('goal-detail-form').dispatchEvent(new Event('submit', { cancelable: true }));

  it('labels each goal row with the save action', async () => {
    await openTab();

    expect(rowsOf()[0].querySelector('.budget-edit').textContent).toBe('ออมเพิ่ม');
  });

  it('opens the goal detail with its progress, today as the date and the history', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);

    expect(byId('goal-detail').hasAttribute('open')).toBe(true);
    expect(byId('goal-detail-title').textContent).toBe('เที่ยวญี่ปุ่น');
    expect(byId('goal-detail-progress').textContent).toBe('ออมแล้ว 6,000 บาท จาก 50,000 บาท (12%)');
    expect(byId('goal-detail-date').value).toBe('2026-10-15');
    expect(byId('goal-detail-form').hidden).toBe(false);
    expect(historyTexts()).toEqual(['14 ต.ค. 2569 · 1,000 บาท', '1 ต.ค. 2569 · 5,000 บาท']);
    expect(byId('goal-history-empty').hidden).toBe(true);
    expect(byId('goal-history-limit').hidden).toBe(true);
  });

  it('adds a contribution and refreshes the goal and its history', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method, path) =>
      method === 'POST' && path === '/api/goals/g-1/contributions' ? { contribution: { id: 'gc-3' }, saved: 6500 } : undefined
    );

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(calls.map((entry) => entry.call)).toEqual([
      'POST /api/goals/g-1/contributions',
      'GET /api/goals',
      'GET /api/goals/g-1/contributions',
    ]);
    expect(calls[0].body).toEqual({ amount: 500, occurredOn: '2026-10-15' });
    expect(byId('goal-detail-status').textContent).toBe('ออมเพิ่ม 500 บาท แล้ว');
    expect(byId('goal-detail-amount').value).toBe('');
  });

  it('shows why adding failed and keeps the amount', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    captureFetch((method) => (method === 'POST' ? { status: 409, error: 'Goal closed' } : undefined));

    byId('goal-detail-amount').value = '500';
    submitDetail();
    await settle();

    expect(byId('goal-detail-error').hidden).toBe(false);
    expect(byId('goal-detail-error').textContent).toBe('เป้านี้ปิดแล้ว เปิดเป้าอีกครั้งก่อนออมเพิ่ม');
    expect(byId('goal-detail-amount').value).toBe('500');
    expect(byId('goal-detail-save').disabled).toBe(false);
  });

  it('deletes a contribution from the history and reloads', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);
    const calls = captureFetch((method) => (method === 'DELETE' ? {} : undefined));

    const remove = byId('goal-history').querySelector('.friend-remove');
    expect(remove.getAttribute('aria-label')).toBe('ลบรายการออม 1,000 บาท วันที่ 14 ต.ค. 2569');
    remove.click();
    await settle();

    expect(calls.map((entry) => entry.call)).toEqual([
      'DELETE /api/goals/g-1/contributions/gc-2',
      'GET /api/goals',
      'GET /api/goals/g-1/contributions',
    ]);
    expect(byId('goal-detail-status').textContent).toBe('ลบรายการออมแล้ว');
  });

  it('hides the add form of a closed goal and explains how to reopen it', async () => {
    await openTab();
    await openDetailOf('goal-closed-rows', 0);

    expect(byId('goal-detail-title').textContent).toBe('มือถือใหม่');
    expect(byId('goal-detail-form').hidden).toBe(true);
    expect(byId('goal-detail-closed-note').hidden).toBe(false);
    expect(byId('goal-history-empty').hidden).toBe(false);
  });

  it('says only the latest entries are shown when the goal has more', async () => {
    const goals = RESPONSES['/api/goals'].goals.map((goal) => (goal.id === 'g-1' ? { ...goal, contributionCount: 150 } : goal));
    await openTab({ overrides: { '/api/goals': { goals } } });
    await openDetailOf('goal-rows', 0);

    expect(byId('goal-history-limit').hidden).toBe(false);
  });

  it('shows a history load failure inside the detail', async () => {
    await openTab({ overrides: { '/api/goals/g-1/contributions': { status: 500 } } });
    await openDetailOf('goal-rows', 0);

    expect(byId('goal-history-error').hidden).toBe(false);
    expect(byId('goal-history-error').textContent).toBe('โหลดประวัติการออมไม่สำเร็จ');
  });

  it('opens the goal editor from the detail', async () => {
    await openTab();
    await openDetailOf('goal-rows', 0);

    byId('goal-detail-edit').click();

    expect(byId('goal-detail').hasAttribute('open')).toBe(false);
    expect(byId('goal-editor').hasAttribute('open')).toBe(true);
    expect(byId('goal-editor-name').value).toBe('เที่ยวญี่ปุ่น');
  });
```

(ระบบเวลาของเทสต์คือ `2026-10-15T05:00:00Z` = วันที่ 2026-10-15 ตามเวลาไทย)

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: FAIL `starts every JS-controlled loading and error element hidden`, เทสต์ใหม่ทั้งหมด และ `fills the editor with the goal ...` / `closes the editor without a request ...` (หา `goal-detail-edit` ไม่เจอ)

- [ ] **Step 3: เพิ่ม markup และ CSS**

ใน `public/liff/index.html` ต่อจาก `</dialog>` ของ `<dialog id="goal-editor" ...>`:

```html
  <dialog id="goal-detail" aria-labelledby="goal-detail-title">
    <h2 id="goal-detail-title" tabindex="-1"></h2>
    <button type="button" id="goal-detail-close" class="dialog-close" aria-label="ปิด"><svg class="icon"
        aria-hidden="true" focusable="false">
        <use href="#icon-close"></use>
      </svg></button>
    <p id="goal-detail-progress" class="confirm-detail"></p>
    <button type="button" id="goal-detail-edit" class="goal-detail-edit">แก้เป้า</button>
    <p id="goal-detail-closed-note" class="confirm-detail" hidden>เป้านี้ปิดแล้ว ถ้าจะออมเพิ่ม กด แก้เป้า แล้วเอาติ๊ก ปิดเป้านี้ ออก</p>
    <form id="goal-detail-form">
      <label>ออมเพิ่ม (บาท)
        <input id="goal-detail-amount" type="number" inputmode="decimal" step="0.01" min="0.01" max="10000000" required>
      </label>
      <label>วันที่
        <input id="goal-detail-date" type="date" required>
      </label>
      <div class="actions">
        <button type="submit" id="goal-detail-save" class="primary">ออมเพิ่ม</button>
      </div>
    </form>
    <p id="goal-detail-busy" class="confirm-detail" role="status" hidden>กำลังบันทึก...</p>
    <p id="goal-detail-status" class="goals-status" role="status" aria-live="polite"></p>
    <p id="goal-detail-error" class="error" role="alert" hidden></p>
    <h3 class="goal-history-title">ประวัติการออม</h3>
    <p id="goal-history-loading" class="confirm-detail" role="status" hidden>กำลังโหลดประวัติ...</p>
    <p id="goal-history-error" class="error" role="alert" hidden></p>
    <ul id="goal-history" class="friend-rows"></ul>
    <p id="goal-history-empty" class="confirm-detail" hidden>ยังไม่มีรายการออม</p>
    <p id="goal-history-limit" class="confirm-detail" hidden>แสดง 100 รายการล่าสุด</p>
  </dialog>
```

ใน `public/liff/style.css` ต่อจากกฎ `.goal-add { ... }`:

```css
.goal-detail-edit { min-height: 44px; padding: 0; border: none; background: none; font: inherit; font-weight: 700; color: var(--primary); cursor: pointer; }
.goal-history-title { margin: 20px 0 0; font-size: 16px; font-weight: 800; }
```

- [ ] **Step 4: เพิ่มรายละเอียดเป้าใน goals-panel.mjs**

ใน `public/liff/goals-panel.mjs`:

เปลี่ยน import ของ `format.mjs` และ `goals-format.mjs` เป็น:

```js
import { LOGIN_REQUIRED_MESSAGE, currentDate, formatBaht } from './format.mjs';
import { splitGoals, goalRow, contributionRows, describeGoalError } from './goals-format.mjs';
```

เปลี่ยน `const ROW_ACTION_LABEL = 'แก้เป้า';` เป็น:

```js
const ROW_ACTION_LABEL = 'ออมเพิ่ม';
```

ต่อจาก `let editing = null;` เพิ่ม:

```js
  let detailOpen = false;
  let detailBusy = false;
  // จำ id แทนตัวเป้า เพราะหลังโหลดใหม่ต้องใช้ยอดล่าสุดของเป้าเดิม
  let viewing = null;
```

เปลี่ยน function `onRowClick` เป็น:

```js
  function onRowClick(row) {
    openDetail(row);
  }
```

ต่อจาก function `submitEditor` เพิ่ม:

```js
  function currentGoal() {
    return goals.find((goal) => goal.id === viewing) ?? null;
  }

  function setDetailBusy(next) {
    detailBusy = next;
    for (const el of [els.detailAmount, els.detailDate, els.detailSave, els.detailClose, els.detailEdit]) el.disabled = next;
    for (const button of els.history.querySelectorAll('button')) button.disabled = next;
    els.detailBusy.hidden = !next;
  }

  function setDetailError(text) {
    els.detailError.textContent = text;
    els.detailError.hidden = !text;
  }

  function renderDetailHead() {
    const goal = currentGoal();
    if (!goal) return;
    const row = goalRow(goal);
    els.detailTitle.textContent = row.name;
    els.detailProgress.textContent = row.text;
    els.detailForm.hidden = row.closed;
    els.detailClosedNote.hidden = !row.closed;
  }

  function renderHistoryRow(row) {
    const item = doc.createElement('li');
    item.className = 'friend-row';
    const text = doc.createElement('span');
    text.textContent = row.text;
    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'friend-remove';
    remove.textContent = 'ลบ';
    remove.setAttribute('aria-label', row.label);
    remove.addEventListener('click', () => removeContribution(row.id));
    item.append(text, remove);
    return item;
  }

  function renderHistory(contributions) {
    const rows = contributionRows(contributions);
    els.history.replaceChildren(...rows.map(renderHistoryRow));
    els.historyEmpty.hidden = rows.length > 0;
    const goal = currentGoal();
    els.historyLimit.hidden = !goal || goal.contributionCount <= rows.length;
  }

  async function loadHistory() {
    const id = viewing;
    els.historyLoading.hidden = false;
    els.historyError.hidden = true;
    try {
      const result = await getApi().listGoalContributions(id);
      if (viewing === id) renderHistory(result.contributions);
    } catch (err) {
      if (viewing !== id) return;
      els.historyError.textContent = statusOf(err) === 401 ? LOGIN_REQUIRED_MESSAGE : 'โหลดประวัติการออมไม่สำเร็จ';
      els.historyError.hidden = false;
    } finally {
      if (viewing === id) els.historyLoading.hidden = true;
    }
  }

  function openDetail(goal) {
    viewing = goal.id;
    detailOpen = true;
    els.detailAmount.value = '';
    els.detailDate.value = currentDate(new Date());
    els.detailStatus.textContent = '';
    setDetailError('');
    els.history.replaceChildren();
    els.historyEmpty.hidden = true;
    els.historyLimit.hidden = true;
    renderDetailHead();
    els.detail.showModal();
    els.detailTitle.focus();
    loadHistory();
  }

  function closeDetail() {
    detailOpen = false;
    viewing = null;
    els.detail.close();
  }

  // หลังบันทึกโหลดทั้งรายการเป้าและประวัติใหม่ เพื่อให้ยอดมาจาก SQL เสมอ
  async function runDetail(request, message) {
    setDetailError('');
    els.detailStatus.textContent = '';
    setDetailBusy(true);
    try {
      await request();
    } catch (err) {
      setDetailError(describeGoalError(statusOf(err), errorOf(err)));
      return false;
    } finally {
      setDetailBusy(false);
    }
    els.detailStatus.textContent = message;
    await load();
    renderDetailHead();
    await loadHistory();
    return true;
  }

  async function addContribution() {
    const amount = Number(els.detailAmount.value);
    const occurredOn = els.detailDate.value;
    const saved = await runDetail(() => getApi().addGoalContribution(viewing, { amount, occurredOn }), `ออมเพิ่ม ${formatBaht(amount)} แล้ว`);
    if (saved) els.detailAmount.value = '';
  }

  function removeContribution(id) {
    if (detailBusy) return;
    runDetail(() => getApi().deleteGoalContribution(viewing, id), 'ลบรายการออมแล้ว');
  }
```

ก่อน `return { refresh };` เพิ่ม:

```js
  els.detailForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (detailBusy || !detailOpen) return;
    await addContribution();
  });
  els.detailClose.addEventListener('click', () => {
    if (!detailBusy) closeDetail();
  });
  els.detailEdit.addEventListener('click', () => {
    const goal = currentGoal();
    if (detailBusy || !goal) return;
    closeDetail();
    openEditor(goal);
  });
  // กัน Esc ปิด dialog ระหว่างรอ request ไม่งั้นข้อผิดพลาดที่ตามมาจะไม่มีที่แสดง
  els.detail.addEventListener('cancel', (event) => {
    if (detailBusy) event.preventDefault();
  });
  els.detail.addEventListener('close', () => {
    // browser บางตัวปิด dialog แม้ preventDefault แล้ว จึงเปิดกลับ
    if (detailBusy) {
      els.detail.showModal();
      return;
    }
    detailOpen = false;
    viewing = null;
  });
```

- [ ] **Step 5: ส่ง element ของ dialog รายละเอียดจาก app.mjs**

ใน `public/liff/app.mjs` object `els` ของ `createGoalsPanel` ต่อจาก `editorSave: document.getElementById('goal-editor-save'),` เพิ่ม:

```js
    detail: document.getElementById('goal-detail'),
    detailTitle: document.getElementById('goal-detail-title'),
    detailClose: document.getElementById('goal-detail-close'),
    detailProgress: document.getElementById('goal-detail-progress'),
    detailEdit: document.getElementById('goal-detail-edit'),
    detailClosedNote: document.getElementById('goal-detail-closed-note'),
    detailForm: document.getElementById('goal-detail-form'),
    detailAmount: document.getElementById('goal-detail-amount'),
    detailDate: document.getElementById('goal-detail-date'),
    detailSave: document.getElementById('goal-detail-save'),
    detailBusy: document.getElementById('goal-detail-busy'),
    detailStatus: document.getElementById('goal-detail-status'),
    detailError: document.getElementById('goal-detail-error'),
    history: document.getElementById('goal-history'),
    historyLoading: document.getElementById('goal-history-loading'),
    historyError: document.getElementById('goal-history-error'),
    historyEmpty: document.getElementById('goal-history-empty'),
    historyLimit: document.getElementById('goal-history-limit'),
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 7: Commit**

```bash
git add public/liff/goals-panel.mjs public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: add, list and delete goal contributions in the web page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 11: เอกสารและ STATE

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8, Task 9, Task 10

**Files:**
- Modify: `README.md` (ส่วน ความสามารถ ต่อจาก bullet **เตือนลืมจด:**, bullet เว็บ LIFF และ sub-bullet จัดการงบ บรรทัด 15-19, ขั้นตอนรัน SQL บรรทัด 95, ประโยค deploy "ไฟล์ล่าสุด" บรรทัด 104)
- Modify: `SPEC.md` (ฟังก์ชันข้อใหม่ 13 ต่อจากข้อ 12, ข้อ 3 เว็บ LIFF บรรทัด 31, ข้อ 9 บรรทัด 49, ย่อหน้า API, Database, ลำดับการทำข้อ 17 ต่อจากข้อ 16)
- Modify: `docs/superpowers/plans/2026-10-18-roadmap-b.md` (บรรทัดสถานะและตารางลำดับ)
- Modify: `work-memory/STATE.md`

**Interfaces:**
- Consumes: พฤติกรรมจาก Task 1-10; ข้อความ README/SPEC ที่แผน `2026-10-19-weekly-summary.md` (Task 9) และ `2026-10-19-daily-reminder.md` (Task 7) ทิ้งไว้: bullet **สรุปรายสัปดาห์:** และ **เตือนลืมจด:** ต่อจาก **รายการประจำ:**, `` `002` ถึง `022` ``, ประโยค deploy ที่ขึ้นต้นด้วย `(ไฟล์ล่าสุดตอนนี้คือ `022_daily_reminder.sql` ต้องรันก่อน push เพราะ`, SPEC ข้อ 11-12 และลำดับการทำข้อ 15-16 (ถ้าข้อความจริงต่างจากนี้ ให้หยุดและตรวจสองแผนนั้นก่อน)

- [ ] **Step 1: อัปเดต README**

- ส่วน ความสามารถ ต่อจาก bullet **เตือนลืมจด:** (ที่แผนเตือนลืมจดเพิ่มต่อจาก **สรุปรายสัปดาห์:**) เพิ่ม:

```markdown
- **เป้าหมายการออม:** สร้างเป้า (ชื่อ ยอดเป้า วันที่อยากถึงเป้า ไม่บังคับ) ในแท็บ ออม ของหน้าเว็บ ออมเข้าเป้าจากหน้าเว็บ หรือพิมพ์ในแชต `ออม เที่ยวญี่ปุ่น 1000` (ไม่เรียก Claude ไม่นับ rate limit ชื่อเป้าไม่สนตัวพิมพ์ มีปุ่ม "ยกเลิก" ใช้ได้เฉพาะเมื่อมีเป้าที่เปิดอยู่ ถ้าไม่มี ข้อความที่ขึ้นต้นด้วย ออม เช่น `ออมสิน 1000` ถูกบันทึกเป็นรายการตามปกติ) ดูหลอดความคืบหน้าและประวัติ ลบรายการออมที่ใส่ผิด (ลบได้แม้เป้าปิดแล้ว) และปิด/เปิดเป้า (เปิดอยู่ได้ไม่เกิน 20 เป้า เป้าที่ปิดรับยอดออมเพิ่มไม่ได้ ไม่มีการลบเป้า) ยอดออมแยกจากรายรับรายจ่าย ไม่กระทบยอดคงเหลือ
```

- bullet **เว็บ LIFF 5 แท็บ** เปลี่ยนเป็น **เว็บ LIFF 6 แท็บ**, sub-bullet `  - จัดการงบ: ตั้งงบต่อหมวดต่อเดือน ...` เปลี่ยนคำนำหน้า `  - จัดการงบ:` เป็น `  - งบ:` (ข้อความหลังโคลอนคงเดิม) และเพิ่ม sub-bullet ระหว่าง `  - รอบเดือน: ...` กับ `  - โปรไฟล์: ...`:

```markdown
  - ออม: เป้าหมายการออม หลอดความคืบหน้า แตะเป้าเพื่อออมเพิ่ม ดูประวัติ (ลบได้) และแก้/ปิดเป้า
```

- ขั้นตอนรัน SQL: เปลี่ยน `` `002` ถึง `022` `` เป็น `` `002` ถึง `023` ``
- ประโยค deploy: เปลี่ยน `(ไฟล์ล่าสุดตอนนี้คือ `022_daily_reminder.sql` ต้องรันก่อน push เพราะ` เป็นข้อความด้านล่าง (ข้อความหลังจากนั้นของ 022 และไฟล์ก่อนหน้าคงไว้ทั้งหมด):

```
(ไฟล์ล่าสุดตอนนี้คือ `023_savings_goals.sql` ต้องรันก่อน push เพราะแท็บ ออม และข้อความที่ขึ้นต้นด้วย ออม ในแชตอ่านตาราง savings_goals และเรียก function `goal_progress` ถ้ายังไม่รัน แท็บ ออม จะโหลดไม่สำเร็จ และทุกข้อความที่ตรงรูปแบบ `ออม <ชื่อ> <ยอด>` (รวม `ออมสิน 1000` ของคนที่ไม่มีเป้า) จะได้ข้อความระบบมีปัญหา ส่วนการบันทึกรายการอื่นยังใช้ได้; `022_daily_reminder.sql` ก็ต้องรันก่อน เพราะ
```

ตรวจทุกประโยคกับโค้ดจริงก่อน commit (`grep -n "022\|023\|5 แท็บ\|6 แท็บ\|จัดการงบ" README.md` ต้องไม่เหลือ `5 แท็บ` และ `  - จัดการงบ:`)

- [ ] **Step 2: อัปเดต SPEC**

- ส่วนฟังก์ชัน ต่อจากย่อหน้าข้อ 12 (ขึ้นต้นด้วย `12\. เตือนลืมจด:` ที่แผนเตือนลืมจดเพิ่ม) เพิ่มย่อหน้า (เว้นบรรทัดว่างคั่นเหมือนข้ออื่น):

```markdown
13\. เป้าหมายการออม: ผู้ใช้สร้างเป้าในแท็บ ออม (ชื่อ 1-30 ตัวอักษร ห้ามซ้ำแบบไม่สนตัวพิมพ์ ยอดเป้า 0.01-10,000,000 บาท วันที่อยากถึงเป้าไม่บังคับ เปิดอยู่ได้ไม่เกิน 20 เป้า) ออมเข้าเป้าจากหน้าเว็บ (เลือกวันที่ได้) หรือพิมพ์ในแชต `ออม <ชื่อเป้า> <ยอด>` เช่น `ออม เที่ยวญี่ปุ่น 1000` (regex ไม่เรียก Claude ทำหลังจอง event และก่อนปุ่มเมนู ไม่นับ rate limit จับเป็นคำสั่งออมเฉพาะเมื่อผู้ใช้มีเป้าที่เปิดอยู่อย่างน้อยหนึ่งเป้า ถ้าไม่มี ข้อความไปทางปกติ เช่น `ออมสิน 1000` ถูกบันทึกเป็นรายการ หาเป้าที่เปิดอยู่จากชื่อแบบไม่สนตัวพิมพ์ ไม่เจอตอบรายชื่อเป้าที่เปิดอยู่) บอทตอบยอดสะสมกับเปอร์เซ็นต์พร้อมปุ่ม "ยกเลิก" (postback `undo_saving` ลบรายการออมของข้อความนั้น) ยอดสะสมคำนวณด้วย SQL function `goal_progress` และออมผ่าน `add_goal_contribution` ที่ปฏิเสธเป้าที่ปิดแล้ว (`023_savings_goals.sql`) ลบรายการออมได้ ปิด/เปิดเป้าได้ ไม่มีการลบเป้าและการถอนในเฟสนี้ ยอดออมแยกจาก transactions ไม่กระทบยอดคงเหลือสะสม
```

- ข้อ 3 เว็บ LIFF: เปลี่ยน `แท็บล่าง 6 แท็บ (` เป็น `แท็บล่าง 6 แท็บ และหน้าหารบิลแยก (`, เปลี่ยน `จัดการงบ ตั้งงบต่อหมวดต่อเดือน และปุ่ม เพิ่มหมวดของฉัน ล่างสุดของแท็บจัดการงบ` เป็น `งบ (หัวหน้า จัดการงบประมาณ) ตั้งงบต่อหมวดต่อเดือน และปุ่ม เพิ่มหมวดของฉัน ล่างสุดของแท็บงบ` และเปลี่ยน `รอบเดือน = จัดการรายการประจำ;` เป็น `รอบเดือน = จัดการรายการประจำ; ออม = เป้าหมายการออม หลอดความคืบหน้า ออมเพิ่ม ประวัติ และแก้/ปิดเป้า;`
- ข้อ 9: เปลี่ยน `(เปิดจากปุ่มล่างสุดของแท็บจัดการงบ` เป็น `(เปิดจากปุ่มล่างสุดของแท็บงบ`
- ต่อจากย่อหน้า `API หารบิล ...` เพิ่มย่อหน้า:

```markdown
API เป้าหมายการออม (หลัง ID token ทุกเส้น): `GET /api/goals` (เป้าทั้งหมดพร้อม `saved` และ `contributionCount` จาก SQL เป้าที่เปิดก่อน), `POST /api/goals` `{ name, targetAmount, targetDate? }` (409 `Too many goals` เมื่อเปิดอยู่ 20 เป้า, 409 `Duplicate name`), `PATCH /api/goals/:id` `{ name?, targetAmount?, targetDate?, closed? }`, `GET /api/goals/:id/contributions` (ใหม่สุดก่อน ไม่เกิน 100 รายการ), `POST /api/goals/:id/contributions` `{ amount, occurredOn }` (ตอบ `{ contribution: { id }, saved }`, 409 `Goal closed`), `DELETE /api/goals/:id/contributions/:contributionId`
```

- ส่วน Database ก่อน bullet `\- ทุกตารางมี user\_id ...` เพิ่ม (เว้นบรรทัดว่างคั่นเหมือน bullet อื่น):

```markdown
\- savings\_goals: id, user\_id, name (1-30 ตัวอักษร ห้ามซ้ำแบบไม่สนตัวพิมพ์ต่อผู้ใช้), target\_amount, target\_date (null ได้), closed, created\_at (unique id+user\_id ให้ goal\_contributions อ้างอิง) ใช้ SQL `023_savings_goals.sql` พร้อม function `goal_progress` และ `add_goal_contribution`

\- goal\_contributions: id, goal\_id, user\_id, amount, occurred\_on, line\_event\_id (null เมื่อออมจากหน้าเว็บ ใช้กับปุ่มยกเลิกในแชต), created\_at (FK goal\_id+user\_id ไป savings\_goals กันออมเข้าเป้าของคนอื่น ลบเป้าหรือผู้ใช้แล้วลบตาม)
```

- ส่วนลำดับการทำ ต่อจากข้อสุดท้าย (ข้อ 16 ของเตือนลืมจด) เพิ่ม:

```markdown
17\. เป้าหมายการออม (roadmap ทิศทาง ข ข้อ 5: docs/superpowers/plans/2026-10-19-savings-goals.md)
```

- [ ] **Step 3: อัปเดต roadmap และ STATE**

- `docs/superpowers/plans/2026-10-18-roadmap-b.md`: ในตารางลำดับ แถวลำดับ 5 เปลี่ยนสถานะเป็น `เสร็จบน branch รอ push` และแถวลำดับ 6 เป็น `ยังไม่เริ่ม (ถัดไป)`; บรรทัด **สถานะ** ด้านบนเพิ่มประโยค `ข้อ 5 เสร็จบน branch feat/savings-goals (แผน 2026-10-19-savings-goals.md) แท็บ ออม เป็นแท็บที่ 6 ของแถบล่าง`
- `work-memory/STATE.md` ส่วน Next เพิ่มบรรทัดบนสุด: `` - [ ] `next` เป้าหมายการออม (แผน docs/superpowers/plans/2026-10-19-savings-goals.md) Task 1-11 เสร็จบน branch feat/savings-goals ยังไม่ merge/push: ผู้ใช้ต้องรัน `supabase/023_savings_goals.sql` ก่อน push และทำ LINE check ของ Task 6, 8, 9, 10 (ดูแถบล่าง 6 แท็บบนจอเล็กด้วย) `` และแก้บรรทัด Updated ด้านบนเป็นวันที่ทำ

- [ ] **Step 4: ตรวจทั้งหมดแล้ว commit**

Run: `npm test`, `npm run lint`, `node --check index.js`, `node --check public/liff/app.mjs`
Expected: ผ่านทั้งหมด (ถ้า `scripts/try-parse.test.js` timeout ตอนรันพร้อมกัน ให้รันเดี่ยวด้วย `npx vitest run scripts/try-parse.test.js` ก่อนสรุปว่าพัง)

```bash
git add README.md SPEC.md docs/superpowers/plans/2026-10-18-roadmap-b.md work-memory/STATE.md
git commit -m "docs: describe savings goals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```
