# สรุปรายสัปดาห์ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้เปิดสวิตช์ "ส่งสรุปทุกวันอาทิตย์" ในแท็บโปรไฟล์ของหน้า LIFF แล้วทุกวันอาทิตย์ 19:00 บอท push การ์ดสรุปสัปดาห์นั้น (จันทร์-อาทิตย์) ให้ โดยไม่ส่งซ้ำและไม่ส่งสัปดาห์ที่ไม่มีรายการ

**Architecture:** migration `021_notification_settings.sql` เพิ่มสวิตช์สองตัวในตาราง `users` (ของข้อนี้และของเตือนลืมจด) และตาราง `notification_log` สำหรับจองก่อน push; API `GET/PATCH /api/settings` อ่าน/เขียนสวิตช์ผ่านตารางคู่ชื่อใน `src/notifications/settings.js`; endpoint cron ใหม่ `POST /internal/notifications/weekly` ใช้ helper ตรวจ secret ที่แยกออกมาจาก `src/recurring/router.js` แล้วเรียก runner ที่ใช้ `buildSummary` + `buildSummaryFlex` เดิมโดยไม่เรียก Claude; หน้า LIFF มี module ใหม่ `public/liff/settings-panel.mjs` แสดงสวิตช์ในแท็บโปรไฟล์

**Tech Stack:** Node.js 24 + Express 5, @line/bot-sdk, Supabase Postgres, LIFF (vanilla JS ES modules), vitest + PGlite + jsdom

## คำถามถึงผู้ใช้ก่อนเริ่ม

1. **ถ้างาน cron สรุปรายสัปดาห์ถูกเรียกในวันที่ไม่ใช่วันอาทิตย์ (เช่น กดทดสอบวันพุธ) ให้ทำอย่างไร**
   - ก. ส่งสรุปตั้งแต่วันจันทร์ถึงวันนั้นตามปกติ (แผนนี้เขียนแบบนี้) ข้อเสีย: ทดสอบกลางสัปดาห์แล้วจะใช้สิทธิ์ส่งของสัปดาห์นั้นไป วันอาทิตย์คนที่ได้การ์ดแล้วจะไม่ได้อีก (period คือวันจันทร์ของสัปดาห์)
   - ข. ส่งเฉพาะวันอาทิตย์ตามเวลาไทย วันอื่นตอบ 200 `{ eligible: 0, sent: 0, skipped: 0, failed: 0 }` โดยไม่อ่านอะไรเลย ข้อเสีย: LINE check ของ Task 9 ทำได้เฉพาะวันอาทิตย์ ถ้าเลือกข้อนี้ ใน Task 5 Step 3 ให้ใส่บรรทัดนี้ต่อจาก `const range = ...` และเพิ่มเทสต์ที่ใช้ `now` เป็น `new Date('2026-10-14T12:00:00Z')` (วันพุธ) แล้วคาดว่าได้ศูนย์ทั้งหมดและ `listWeeklySummaryUsers` ไม่ถูกเรียก:
     ```js
     // วันอื่นไม่ส่ง กันสัปดาห์ที่ยังไม่จบใช้สิทธิ์ส่งของสัปดาห์นั้นไปก่อน
     if (new Date(`${range.to}T00:00:00Z`).getUTCDay() !== 0) return { eligible: 0, sent: 0, skipped: 0, failed: 0 };
     ```
   - **คำแนะนำ: ก.** ตรงกับแผนใหญ่ (ใช้ช่วง `week` ของ `getPeriodRange` ตรงๆ) ทดสอบได้ทันทีหลัง deploy และการจองต่อสัปดาห์กันส่งซ้ำอยู่แล้ว ความเสี่ยงเดียวคือตั้ง cron ผิดวัน ซึ่ง README และ Task 9 บอกเวลาไว้ชัด

## Global Constraints

- ตามแผนใหญ่ `docs/superpowers/plans/2026-10-18-roadmap-b.md` ข้อ 3 และเพิ่มรายละเอียดที่แผนใหญ่ไม่ได้ระบุ 5 จุดหลังอ่านโค้ดจริง: (1) `notification_log` มี check ของ `kind` (`weekly_summary`, `daily_reminder`) และรูปแบบ `period` (YYYY-MM-DD) เพราะทั้งสองงานใช้วันที่เป็น period (2) API settings ของแผนนี้รู้จักแค่ `weeklySummary` ส่วน `dailyReminder` เติมในแผน `2026-10-19-daily-reminder.md` ตามที่แผนใหญ่บอก ("ข้อ 6 เติม field") แม้คอลัมน์ทั้งสองจะสร้างใน 021 (3) helper ตรวจ secret อยู่ที่ `src/utils/cron-auth.js` และ router ใหม่ `src/notifications/router.js` mount ที่ `/internal` ผ่าน parameter ใหม่ `notificationsRouter` ของ `createApp` (4) ถ้า push พังหลังจองแล้ว ไม่ลบการจอง เพราะ LINE อาจส่งถึงแล้วแม้ client ได้ error (ดู Learned ใน STATE เรื่องสถานะ "ไม่ทราบผล") คนนั้นจึงไม่ได้การ์ดสัปดาห์นั้น และ cron ตอบ 500 ให้รู้ (5) หน้า LIFF โหลดสวิตช์เมื่อเข้าแท็บโปรไฟล์เท่านั้น (เหมือนส่วนเพื่อน) ไม่ให้หน้าแรกยิง request เพิ่ม
- branch `feat/weekly-summary` แตกจาก main ล่าสุด, TDD (เขียน test ให้ fail ก่อน), commit ทีละ task, merge เข้า main ในเครื่องด้วย `--no-ff` เมื่อจบ
- ห้าม `git push`, ห้ามรัน SQL ใน Supabase, ห้ามแก้ `.env`, ห้ามติดตั้งแพ็กเกจใหม่, ห้ามเปิด/ปิด server
- migration ใหม่คือ `021_notification_settings.sql` (ไฟล์ล่าสุดตอนนี้คือ `020_query_totals.sql`; ไม่มีไฟล์ 016) รันซ้ำได้ (`add column if not exists`, `create table if not exists`) เพิ่มชื่อไฟล์ใน `MIGRATIONS` ของ `src/db/sql-functions.test.js` หัวไฟล์ `supabase/schema.sql` ขั้นตอนรัน SQL และประโยค "ไฟล์ล่าสุด" ใน README
- ตารางใหม่เปิด RLS ไม่มี policy (ใช้ผ่าน service role); migration นี้ไม่มี SQL function ใหม่
- push message นับโควตา LINE OA: สวิตช์ค่าตั้งต้นปิด (`default false`), สัปดาห์ที่ไม่มีรายการไม่ส่ง, ไม่เกินสัปดาห์ละครั้งต่อคน
- ไม่เรียก Claude เขียนคอมเมนต์ในการ์ด (คุมเวลาให้ทัน timeout 30 วินาทีของ cron-job.org และคุมค่าใช้จ่าย)
- ตัวเลขทุกตัวคำนวณด้วย SQL (`summarize_transactions` เดิม) server กรอง user_id ทุก query
- คอมเมนต์ในโค้ดภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log ภาษาอังกฤษ; ไม่มี emoji ในโค้ด คอมเมนต์ log commit
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย; ไม่แก้ `HELP_REPLY` (เทสต์ใน `src/menu/fixed-replies.test.js` pin ข้อความทั้งก้อน)
- ไฟล์ใหม่ใช้ CRLF เหมือนไฟล์เดิม (git autocrlf=true จัดการให้ตอน commit)
- ก่อนจบ: `npm test`, `npm run lint`, `node --check index.js`, `node --check public/liff/app.mjs` ผ่านทั้งหมด
- commit message ภาษาอังกฤษ ลงท้ายด้วยบรรทัดว่างและ `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (ใช้ `-m` ตัวที่สองตามตัวอย่างในแต่ละ task)
- แผน `2026-10-19-daily-reminder.md` ใช้ชื่อและ signature ใน Interfaces ของแผนนี้ตรงตัว ถ้าเปลี่ยนชื่อระหว่างทำ ต้องแก้แผนนั้นด้วย

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/021_notification_settings.sql` (ใหม่) | คอลัมน์ `users.weekly_summary_enabled`, `users.daily_reminder_enabled` และตาราง `notification_log` |
| `src/notifications/settings.js` (ใหม่) | ตารางคู่ชื่อ field ของ API กับคอลัมน์ใน `users` และตัวแปลงไปกลับ |
| `src/db/repository.js` | `getNotificationSettings`, `updateNotificationSettings`, `listWeeklySummaryUsers`, `reserveNotification` |
| `src/api/validate.js` | `validateSettingsUpdate(body)` |
| `src/api/router.js` | `GET /api/settings`, `PATCH /api/settings` |
| `src/utils/cron-auth.js` (ใหม่) | `safeEqual`, `requireCronSecret`, `hasCronSecret` ใช้ร่วมกันทุก endpoint cron |
| `src/recurring/router.js` | เปลี่ยนไปใช้ helper จาก `cron-auth.js` (พฤติกรรมเดิม) |
| `src/notifications/weekly.js` (ใหม่) | runner ส่งการ์ดสรุปสัปดาห์ |
| `src/notifications/router.js` (ใหม่) | `POST /notifications/weekly` |
| `src/app.js` | mount `notificationsRouter` ที่ `/internal` |
| `index.js` | สร้าง runner และ router แล้วส่งให้ `createApp` |
| `public/liff/api.mjs` | `getSettings()`, `updateSettings(body)` |
| `public/liff/settings-panel.mjs` (ใหม่) | โหลดและบันทึกสวิตช์การแจ้งเตือน |
| `public/liff/index.html`, `public/liff/style.css`, `public/liff/app.mjs` | ส่วน "การแจ้งเตือน" ในแท็บโปรไฟล์ |

---

### Task 1: migration 021 (สวิตช์และ notification_log)

**Depends on:** none

**Files:**
- Create: `supabase/021_notification_settings.sql`
- Modify: `supabase/schema.sql:1` (บรรทัดหัวไฟล์ที่บอกลำดับการรัน)
- Test: `src/db/sql-functions.test.js` (เพิ่มใน `MIGRATIONS`, describe ใหม่ก่อน `describe('function permissions', ...)`)

**Interfaces:**
- Produces:
  - `public.users.weekly_summary_enabled boolean not null default false`
  - `public.users.daily_reminder_enabled boolean not null default false`
  - ตาราง `public.notification_log (user_id uuid not null references users on delete cascade, kind text not null check in ('weekly_summary','daily_reminder'), period text not null check (period ~ '^\d{4}-\d{2}-\d{2}$'), created_at timestamptz not null default now(), primary key (user_id, kind, period))` เปิด RLS ไม่มี policy

- [ ] **Step 1: เพิ่มไฟล์ใน MIGRATIONS และเขียนเทสต์ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่ม `'021_notification_settings.sql'` ต่อจาก `'020_query_totals.sql'` ใน `MIGRATIONS`:

```js
  '020_query_totals.sql',
  '021_notification_settings.sql',
];
```

เพิ่ม describe ใหม่ต่อจาก `describe('019_delete_category.sql', ...)` (ก่อน `describe('function permissions', ...)`):

```js
describe('021_notification_settings.sql', () => {
  it('adds both notification switches to users, off by default', async () => {
    const user = await createUser('U1');

    expect(await one('select weekly_summary_enabled, daily_reminder_enabled from users where id = $1', [user])).toEqual({
      weekly_summary_enabled: false,
      daily_reminder_enabled: false,
    });
  });

  it('refuses a null switch', async () => {
    const user = await createUser('U1');

    for (const column of ['weekly_summary_enabled', 'daily_reminder_enabled']) {
      await db.exec('savepoint null_switch');
      await expect(db.query(`update users set ${column} = null where id = $1`, [user])).rejects.toThrow(column);
      await db.exec('rollback to savepoint null_switch');
    }
  });

  // งาน cron จองด้วย insert on conflict do nothing ถ้าไม่ได้แถวกลับมาแปลว่าเคยส่งแล้ว
  it('keeps one log row per user, kind and period', async () => {
    const user = await createUser('U1');
    const reserve = (kind, period) =>
      rows('insert into notification_log (user_id, kind, period) values ($1, $2, $3) on conflict do nothing returning user_id', [
        user,
        kind,
        period,
      ]);

    expect(await reserve('weekly_summary', '2026-10-12')).toHaveLength(1);
    expect(await reserve('weekly_summary', '2026-10-12')).toHaveLength(0);
    expect(await reserve('weekly_summary', '2026-10-19')).toHaveLength(1);
    expect(await reserve('daily_reminder', '2026-10-12')).toHaveLength(1);
  });

  it('refuses an unknown kind and a period that is not a date', async () => {
    const user = await createUser('U1');

    for (const [kind, period] of [
      ['monthly', '2026-10-01'],
      ['weekly_summary', 'last week'],
    ]) {
      await db.exec('savepoint bad_log');
      await expect(db.query('insert into notification_log (user_id, kind, period) values ($1, $2, $3)', [user, kind, period])).rejects.toThrow(
        'check constraint',
      );
      await db.exec('rollback to savepoint bad_log');
    }
  });

  it('removes the log rows of a deleted user and keeps row level security on', async () => {
    const user = await createUser('U1');
    await db.query("insert into notification_log (user_id, kind, period) values ($1, 'weekly_summary', '2026-10-12')", [user]);

    await db.query('delete from users where id = $1', [user]);

    expect(Number((await one('select count(*) from notification_log')).count)).toBe(0);
    expect((await one("select relrowsecurity from pg_class where oid = 'public.notification_log'::regclass")).relrowsecurity).toBe(true);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('021_notification_settings.sql'))).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL ตอน `beforeAll` เพราะอ่านไฟล์ `supabase/021_notification_settings.sql` ไม่เจอ (ENOENT)

- [ ] **Step 3: เขียน migration**

สร้าง `supabase/021_notification_settings.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 020 ก่อน push โค้ดที่มีสวิตช์แจ้งเตือน รันซ้ำได้
-- สร้างสวิตช์ของสรุปรายสัปดาห์และเตือนลืมจดไว้ที่นี่ครั้งเดียว ค่าตั้งต้นปิดเพราะ push นับโควตา LINE OA

alter table public.users add column if not exists weekly_summary_enabled boolean not null default false;
alter table public.users add column if not exists daily_reminder_enabled boolean not null default false;

-- งาน cron จองแถวก่อน push เพื่อให้การเรียกซ้ำไม่ส่งข้อความเดิมสองครั้ง period เป็นวันที่ (วันจันทร์ของสัปดาห์ หรือวันนั้น)
create table if not exists public.notification_log (
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('weekly_summary', 'daily_reminder')),
  period text not null check (period ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, period)
);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.notification_log enable row level security;
```

ใน `supabase/schema.sql` บรรทัดแรก เปลี่ยน `019_delete_category.sql และ 020_query_totals.sql ต่อตามลำดับ` เป็น:

```
019_delete_category.sql, 020_query_totals.sql และ 021_notification_settings.sql ต่อตามลำดับ
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งไฟล์ รวม `021_notification_settings.sql` 6 เทสต์

- [ ] **Step 5: Commit**

```bash
git add supabase/021_notification_settings.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add notification switches and a send log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: settings mapping และ repository

**Depends on:** none (ใช้ชื่อตารางและคอลัมน์ตาม Interfaces ของ Task 1)

**Files:**
- Create: `src/notifications/settings.js`
- Test: `src/notifications/settings.test.js`
- Modify: `src/db/repository.js` (require ด้านบน; function ใหม่ต่อจาก `getDisplayName` ราวบรรทัด 307-311 และต่อจาก `applyRecurringRule` ราวบรรทัด 751-759; ชื่อใน object ที่ return ราวบรรทัด 761-819)
- Test: `src/db/repository.test.js` (describe ใหม่ต่อจาก `repository.getDisplayName` ราวบรรทัด 1411-1436)

**Interfaces:**
- Consumes: ตาราง `users` คอลัมน์ `weekly_summary_enabled`, ตาราง `notification_log` (Task 1)
- Produces:
  - `src/notifications/settings.js`: `NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled' }` (object ชื่อ field ของ API -> ชื่อคอลัมน์), `SETTINGS_COLUMNS: string` (ชื่อคอลัมน์คั่นด้วย `, `), `toNotificationSettings(row: object | null) => { weeklySummary: boolean }` (row เป็น null ได้ทุก field เป็น false), `toSettingsColumns(changes: { weeklySummary?: boolean }) => object`
  - `repository.getNotificationSettings(userId: string) => Promise<{ weeklySummary: boolean }>`
  - `repository.updateNotificationSettings(userId: string, changes: { weeklySummary?: boolean }) => Promise<{ weeklySummary: boolean }>` (คืนค่าที่บันทึกแล้วทุก field)
  - `repository.listWeeklySummaryUsers() => Promise<Array<{ userId: string, lineUserId: string }>>` (เฉพาะคนที่ `weekly_summary_enabled` เป็น true เรียงตาม id)
  - `repository.reserveNotification({ userId: string, kind: 'weekly_summary' | 'daily_reminder', period: 'YYYY-MM-DD' }) => Promise<boolean>` (true = จองได้ ส่งได้; false = เคยจองแล้ว)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/notifications/settings.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { NOTIFICATION_SETTINGS, SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns } from './settings.js';

describe('notification settings', () => {
  it('maps each API field to its users column', () => {
    expect(NOTIFICATION_SETTINGS).toEqual({ weeklySummary: 'weekly_summary_enabled' });
    expect(SETTINGS_COLUMNS).toBe('weekly_summary_enabled');
  });

  it('reads a users row into API fields, and a missing row as everything off', () => {
    expect(toNotificationSettings({ weekly_summary_enabled: true })).toEqual({ weeklySummary: true });
    expect(toNotificationSettings(null)).toEqual({ weeklySummary: false });
  });

  it('turns API fields into users columns', () => {
    expect(toSettingsColumns({ weeklySummary: false })).toEqual({ weekly_summary_enabled: false });
  });
});
```

ใน `src/db/repository.test.js` เพิ่ม import ใต้ `import { createRepository, DatabaseError } from './repository.js';`:

```js
import { SETTINGS_COLUMNS } from '../notifications/settings.js';
```

และต่อจาก describe `repository.getDisplayName`:

```js
describe('repository notification settings', () => {
  it('reads the switches of this user', async () => {
    const { supabase, calls } = fakeSupabase({ data: { weekly_summary_enabled: true }, error: null });

    expect(await createRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: true });
    expect(calls).toEqual([['from', 'users'], ['select', SETTINGS_COLUMNS], ['eq', 'id', 'user-1'], ['maybeSingle']]);
  });

  it('treats a missing user row as everything off', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: false });
  });

  it('updates only the given switches of this user and returns the saved values', async () => {
    const { supabase, calls } = fakeSupabase({ data: { weekly_summary_enabled: true }, error: null });

    expect(await createRepository(supabase).updateNotificationSettings('user-1', { weeklySummary: true })).toEqual({ weeklySummary: true });
    expect(calls).toEqual([
      ['from', 'users'],
      ['update', { weekly_summary_enabled: true }],
      ['eq', 'id', 'user-1'],
      ['select', SETTINGS_COLUMNS],
      ['maybeSingle'],
    ]);
  });

  it('throws DatabaseError when reading or saving fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });
    const repository = createRepository(supabase);

    await expect(repository.getNotificationSettings('user-1')).rejects.toThrow('Database getNotificationSettings failed: boom');
    await expect(repository.updateNotificationSettings('user-1', { weeklySummary: true })).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('repository.listWeeklySummaryUsers', () => {
  it('lists only users who turned the weekly summary on', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'user-1', line_user_id: 'U1' }], error: null });

    expect(await createRepository(supabase).listWeeklySummaryUsers()).toEqual([{ userId: 'user-1', lineUserId: 'U1' }]);
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, line_user_id'],
      ['eq', 'weekly_summary_enabled', true],
      ['order', 'id'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).listWeeklySummaryUsers()).rejects.toThrow('Database listWeeklySummaryUsers failed: boom');
  });
});

describe('repository.reserveNotification', () => {
  const reservation = { userId: 'user-1', kind: 'weekly_summary', period: '2026-10-12' };

  it('returns true when the log row was inserted', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1' }], error: null });

    expect(await createRepository(supabase).reserveNotification(reservation)).toBe(true);
    expect(calls).toEqual([
      ['from', 'notification_log'],
      [
        'upsert',
        { user_id: 'user-1', kind: 'weekly_summary', period: '2026-10-12' },
        { onConflict: 'user_id,kind,period', ignoreDuplicates: true },
      ],
      ['select', 'user_id'],
    ]);
  });

  it('returns false when this notification was already reserved', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).reserveNotification(reservation)).toBe(false);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createRepository(supabase).reserveNotification(reservation)).rejects.toThrow('Database reserveNotification failed: boom');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/notifications/settings.test.js src/db/repository.test.js`
Expected: FAIL `Cannot find module './settings.js'` (settings.test) และ `Cannot find module '../notifications/settings.js'` (repository.test ทั้งไฟล์)

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/notifications/settings.js`:

```js
// ชื่อ field ของ API คู่กับคอลัมน์ใน users เพิ่มสวิตช์ใหม่ที่นี่ที่เดียว validate repository และ API จะรู้จักเอง
const NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled' };
const SETTINGS_COLUMNS = Object.values(NOTIFICATION_SETTINGS).join(', ');

function toNotificationSettings(row) {
  return Object.fromEntries(
    Object.entries(NOTIFICATION_SETTINGS).map(([field, column]) => [field, row ? row[column] === true : false]),
  );
}

function toSettingsColumns(changes) {
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => [NOTIFICATION_SETTINGS[field], value]));
}

module.exports = { NOTIFICATION_SETTINGS, SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns };
```

ใน `src/db/repository.js` ต่อจาก `const { lastDayOf, monthStartOf } = require('../recurring/schedule');` เพิ่ม:

```js
const { SETTINGS_COLUMNS, toNotificationSettings, toSettingsColumns } = require('../notifications/settings');
```

ต่อจาก function `getDisplayName` เพิ่ม:

```js
  async function getNotificationSettings(userId) {
    const { data, error } = await supabase.from('users').select(SETTINGS_COLUMNS).eq('id', userId).maybeSingle();
    throwIfError('getNotificationSettings', error);
    return toNotificationSettings(data);
  }

  async function updateNotificationSettings(userId, changes) {
    const { data, error } = await supabase
      .from('users')
      .update(toSettingsColumns(changes))
      .eq('id', userId)
      .select(SETTINGS_COLUMNS)
      .maybeSingle();
    throwIfError('updateNotificationSettings', error);
    return toNotificationSettings(data);
  }
```

ต่อจาก function `applyRecurringRule` เพิ่ม:

```js
  async function listWeeklySummaryUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('id, line_user_id')
      .eq('weekly_summary_enabled', true)
      .order('id');
    throwIfError('listWeeklySummaryUsers', error);
    return data.map((row) => ({ userId: row.id, lineUserId: row.line_user_id }));
  }

  // ignoreDuplicates คืนเฉพาะแถวที่เพิ่ง insert ได้ แถวว่างแปลว่าเคยจองแล้ว จึงไม่ push ซ้ำ
  async function reserveNotification({ userId, kind, period }) {
    const { data, error } = await supabase
      .from('notification_log')
      .upsert({ user_id: userId, kind, period }, { onConflict: 'user_id,kind,period', ignoreDuplicates: true })
      .select('user_id');
    throwIfError('reserveNotification', error);
    return data.length > 0;
  }
```

ใน object ที่ return ท้ายไฟล์ เพิ่ม `listWeeklySummaryUsers,` และ `reserveNotification,` ต่อจาก `applyRecurringRule,` และเพิ่ม `getNotificationSettings,` และ `updateNotificationSettings,` ต่อจาก `getDisplayName,`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/notifications/settings.test.js src/db/repository.test.js`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/notifications/settings.js src/notifications/settings.test.js src/db/repository.js src/db/repository.test.js
git commit -m "feat: let the repository read and save notification switches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: API settings

**Depends on:** Task 2

**Files:**
- Modify: `src/api/validate.js` (require ด้านบน, function ใหม่ต่อจาก `validateCategoryUpdate`, `module.exports`)
- Test: `src/api/validate.test.js` (import และ describe ใหม่ท้ายไฟล์)
- Modify: `src/api/router.js` (import `validateSettingsUpdate` ราวบรรทัด 3-10, route ใหม่ต่อจาก `GET /profile` ราวบรรทัด 223-238)
- Test: `src/api/router.test.js` (mock ใน `setup` ราวบรรทัด 24-64, describe ใหม่ต่อจาก `GET /api/profile` ราวบรรทัด 1261-1299)

**Interfaces:**
- Consumes: `NOTIFICATION_SETTINGS` (Task 2), `repository.getNotificationSettings(userId)`, `repository.updateNotificationSettings(userId, changes)` (Task 2)
- Produces:
  - `validateSettingsUpdate(body) => { ok: true, value: { weeklySummary?: boolean } } | { ok: false, error: 'Invalid body' | 'Invalid <field>' }` (field ที่ไม่รู้จักถูกตัดทิ้ง ไม่มี field ที่รู้จักเลยได้ `Invalid body`)
  - `GET /api/settings` -> 200 `{ weeklySummary: boolean }`
  - `PATCH /api/settings` body `{ weeklySummary?: boolean }` -> 200 `{ weeklySummary: boolean }` (ค่าที่บันทึกแล้ว) หรือ 400 `{ error }`

- [ ] **Step 1: เขียนเทสต์ที่ fail ใน validate.test.js**

ใน `src/api/validate.test.js` เพิ่ม `validateSettingsUpdate,` ใน import ต่อจาก `validateCategoryUpdate,` แล้วเพิ่มท้ายไฟล์:

```js
describe('validateSettingsUpdate', () => {
  it('keeps a known boolean switch and drops unknown fields', () => {
    expect(validateSettingsUpdate({ weeklySummary: true, isAdmin: true })).toEqual({ ok: true, value: { weeklySummary: true } });
    expect(validateSettingsUpdate({ weeklySummary: false })).toEqual({ ok: true, value: { weeklySummary: false } });
  });

  it.each([[null], ['on'], [{}], [{ isAdmin: true }], [[true]]])('refuses %j without a known switch', (body) => {
    expect(validateSettingsUpdate(body)).toEqual({ ok: false, error: 'Invalid body' });
  });

  it('refuses a switch that is not a boolean', () => {
    expect(validateSettingsUpdate({ weeklySummary: 'true' })).toEqual({ ok: false, error: 'Invalid weeklySummary' });
  });
});
```

- [ ] **Step 2: เขียนเทสต์ที่ fail ใน router.test.js**

ใน `src/api/router.test.js` ฟังก์ชัน `setup` object `repository:` เพิ่มต่อจาก `getDisplayName: vi.fn().mockResolvedValue('สมชาย'),`:

```js
      getNotificationSettings: vi.fn().mockResolvedValue({ weeklySummary: false }),
      updateNotificationSettings: vi.fn().mockImplementation(async (userId, changes) => ({ weeklySummary: false, ...changes })),
```

เพิ่ม describe ใหม่ต่อจาก `describe('GET /api/profile', ...)`:

```js
describe('notification settings API', () => {
  it('returns the switches of the logged in user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklySummary: false });
    expect(deps.repository.getNotificationSettings).toHaveBeenCalledWith('user-1');
  });

  it('saves a known switch and returns the saved values', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings', { method: 'PATCH', body: { weeklySummary: true, isAdmin: true } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklySummary: true });
    expect(deps.repository.updateNotificationSettings).toHaveBeenCalledWith('user-1', { weeklySummary: true });
  });

  it.each([
    [{}, 'Invalid body'],
    [{ isAdmin: true }, 'Invalid body'],
    [{ weeklySummary: 'yes' }, 'Invalid weeklySummary'],
  ])('refuses %j with 400', async (body, error) => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings', { method: 'PATCH', body });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(deps.repository.updateNotificationSettings).not.toHaveBeenCalled();
  });

  it('requires login', async () => {
    const base = await start(setup());

    expect((await call(base, '/settings', { token: null })).status).toBe(401);
    expect((await call(base, '/settings', { token: null, method: 'PATCH', body: { weeklySummary: true } })).status).toBe(401);
  });
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/api/validate.test.js src/api/router.test.js`
Expected: FAIL `validateSettingsUpdate is not a function` และเทสต์ใน `notification settings API` ได้ 404 แทน 200/400 ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 4: เขียนโค้ด**

ใน `src/api/validate.js` ต่อจาก `const { MAX_CATEGORY_NAME_LENGTH, CATEGORY_ICONS, isReservedCategoryName } = require('../parser/categories');` เพิ่ม:

```js
const { NOTIFICATION_SETTINGS } = require('../notifications/settings');
```

ต่อจาก function `validateCategoryUpdate` เพิ่ม:

```js
// รับเฉพาะสวิตช์ที่รู้จัก field อื่นตัดทิ้ง เพื่อไม่ให้ client เขียนคอลัมน์อื่นของ users ได้
function validateSettingsUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const value = {};
  for (const field of Object.keys(NOTIFICATION_SETTINGS)) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== 'boolean') {
      return { ok: false, error: `Invalid ${field}` };
    }
    value[field] = body[field];
  }
  if (Object.keys(value).length === 0) {
    return { ok: false, error: 'Invalid body' };
  }
  return { ok: true, value };
}
```

ใน `module.exports` เพิ่ม `validateSettingsUpdate,` ต่อจาก `validateCategoryUpdate,`

ใน `src/api/router.js` import จาก `./validate` เพิ่ม `validateSettingsUpdate,` ต่อจาก `validateCategoryUpdate,` แล้วต่อจาก route `router.get('/profile', ...)` เพิ่ม:

```js
  router.get('/settings', async (req, res) => {
    res.json(await repository.getNotificationSettings(req.userId));
  });

  router.patch('/settings', async (req, res) => {
    const result = validateSettingsUpdate(req.body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(await repository.updateNotificationSettings(req.userId, result.value));
  });
```

- [ ] **Step 5: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/api/validate.test.js src/api/router.test.js`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 6: Commit**

```bash
git add src/api/validate.js src/api/validate.test.js src/api/router.js src/api/router.test.js
git commit -m "feat: add an API to read and save notification switches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: helper ตรวจ secret ของ cron ที่ใช้ร่วมกัน

**Depends on:** none

**Files:**
- Create: `src/utils/cron-auth.js`
- Test: `src/utils/cron-auth.test.js`
- Modify: `src/recurring/router.js` (ทั้งไฟล์ ส่วนบนถึงการตรวจ token)
- Test: `src/recurring/router.test.js` (ไม่แก้ ใช้เป็น regression)

**Interfaces:**
- Produces:
  - `safeEqual(a: string, b: string) => boolean`
  - `requireCronSecret(cronSecret: unknown, owner: string) => void` throw `TypeError('<owner> requires cronSecret')` เมื่อไม่ใช่ string ที่ไม่ว่าง
  - `hasCronSecret(req: express.Request, cronSecret: string) => boolean` true เมื่อ header เป็น `Authorization: Bearer <cronSecret>` ตรงตัว (Bearer ตัว B ใหญ่ เหมือนเดิม)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/utils/cron-auth.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { safeEqual, requireCronSecret, hasCronSecret } from './cron-auth.js';

function request(authorization) {
  return { get: (name) => (name.toLowerCase() === 'authorization' ? authorization : undefined) };
}

describe('safeEqual', () => {
  it('matches only the same text', () => {
    expect(safeEqual('s3cret', 's3cret')).toBe(true);
    expect(safeEqual('s3cret', 's3cret-longer')).toBe(false);
    expect(safeEqual('', 's3cret')).toBe(false);
  });
});

describe('requireCronSecret', () => {
  it.each([[''], [undefined], [12345]])('throws for %j with the owner name', (secret) => {
    expect(() => requireCronSecret(secret, 'createThing')).toThrow('createThing requires cronSecret');
  });

  it('accepts a non-empty string', () => {
    expect(() => requireCronSecret('s3cret', 'createThing')).not.toThrow();
  });
});

describe('hasCronSecret', () => {
  it('accepts the matching bearer token', () => {
    expect(hasCronSecret(request('Bearer s3cret'), 's3cret')).toBe(true);
  });

  it.each([[undefined], [''], ['Bearer '], ['Bearer wrong'], ['bearer s3cret'], ['s3cret']])('refuses %j', (header) => {
    expect(hasCronSecret(request(header), 's3cret')).toBe(false);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/utils/cron-auth.test.js`
Expected: FAIL `Cannot find module './cron-auth.js'`

- [ ] **Step 3: เขียน helper และเปลี่ยน recurring router ไปใช้**

สร้าง `src/utils/cron-auth.js`:

```js
const crypto = require('node:crypto');

// เทียบ hash เพื่อให้ timingSafeEqual ได้ความยาวเท่ากันเสมอ และไม่เปิดเผยความยาวของ secret
function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(a).digest();
  const right = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(left, right);
}

// throw ตอนสร้าง router เพื่อไม่ให้ endpoint cron เปิดโล่งเมื่อลืมตั้ง secret
function requireCronSecret(cronSecret, owner) {
  if (typeof cronSecret !== 'string' || cronSecret.length === 0) {
    throw new TypeError(`${owner} requires cronSecret`);
  }
}

function hasCronSecret(req, cronSecret) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return token !== '' && safeEqual(token, cronSecret);
}

module.exports = { safeEqual, requireCronSecret, hasCronSecret };
```

ใน `src/recurring/router.js` เปลี่ยนส่วนบนตั้งแต่ `const crypto = require('node:crypto');` ถึงบรรทัด `}` ที่ปิดการตรวจ token (ก่อน `try {`) เป็น:

```js
const express = require('express');
const { requireCronSecret, hasCronSecret } = require('../utils/cron-auth');

function createRecurringRouter({ cronSecret, run, logger = console }) {
  requireCronSecret(cronSecret, 'createRecurringRouter');
  const router = express.Router();

  router.post('/recurring/run', async (req, res) => {
    if (!hasCronSecret(req, cronSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
```

ส่วน `try { ... } catch { ... }`, `return router;` และ `module.exports` คงเดิม

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/utils/cron-auth.test.js src/recurring/router.test.js`
Expected: PASS ทั้งสองไฟล์ (เทสต์ recurring เดิมทั้ง 7 ตัวยังผ่านโดยไม่แก้ รวม `requires cronSecret`)

- [ ] **Step 5: Commit**

```bash
git add src/utils/cron-auth.js src/utils/cron-auth.test.js src/recurring/router.js
git commit -m "refactor: share the cron secret check between cron routers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: runner สรุปรายสัปดาห์

**Depends on:** none (ใช้ชื่อ repository ตาม Interfaces ของ Task 2 ผ่าน mock)

**Files:**
- Create: `src/notifications/weekly.js`
- Test: `src/notifications/weekly.test.js`

**Interfaces:**
- Consumes: `repository.listWeeklySummaryUsers()`, `repository.reserveNotification({ userId, kind, period })` (Task 2), `repository.summarizeTransactions(userId, from, to)` เดิม (คืน `[{ type, category, total, entryCount }]`), `getPeriodRange('week', now)` จาก `src/summary/period.js`, `buildSummary(rows, label)` จาก `src/summary/summary.js`, `buildSummaryFlex(summary, comment)` จาก `src/summary/flex.js`, `pushFlex(to, flexMessage)` จาก `createPushFlex` ใน `src/line-reply.js`
- Produces:
  - `createWeeklySummaryRunner({ repository, pushFlex, now = () => new Date(), logger = console }) => run(): Promise<{ eligible: number, sent: number, skipped: number, failed: number }>`
  - `WEEKLY_SUMMARY_KIND = 'weekly_summary'`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/notifications/weekly.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createWeeklySummaryRunner, WEEKLY_SUMMARY_KIND } from './weekly.js';
import { buildSummary } from '../summary/summary.js';
import { buildSummaryFlex } from '../summary/flex.js';

// 2026-10-18 19:00 เวลาไทย (วันอาทิตย์) สัปดาห์คือ 12-18 ต.ค.
const NOW = new Date('2026-10-18T12:00:00Z');
const LABEL = 'สัปดาห์นี้ (12/10 - 18/10)';
const ROWS = [
  { type: 'expense', category: 'อาหาร', total: 160, entryCount: 3 },
  { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
];

function setup(users = [{ userId: 'user-1', lineUserId: 'U1' }]) {
  const repository = {
    listWeeklySummaryUsers: vi.fn().mockResolvedValue(users),
    summarizeTransactions: vi.fn().mockResolvedValue(ROWS),
    reserveNotification: vi.fn().mockResolvedValue(true),
  };
  const pushFlex = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const run = createWeeklySummaryRunner({ repository, pushFlex, now: () => NOW, logger });
  return { repository, pushFlex, logger, run };
}

describe('createWeeklySummaryRunner', () => {
  it('pushes the Monday to Sunday summary card without a comment and reserves the week first', async () => {
    const { repository, pushFlex, run } = setup();

    const result = await run();

    expect(repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-10-12', '2026-10-18');
    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: WEEKLY_SUMMARY_KIND, period: '2026-10-12' });
    expect(pushFlex).toHaveBeenCalledWith('U1', buildSummaryFlex(buildSummary(ROWS, LABEL), ''));
    const flex = pushFlex.mock.calls[0][1];
    expect(flex.altText).toBe('สรุปสัปดาห์นี้ (12/10 - 18/10): รายรับ 25,000 บาท รายจ่าย 160 บาท');
    // คอมเมนต์เป็นข้อความเดียวในการ์ดที่ wrap
    expect(JSON.stringify(flex)).not.toContain('"wrap":true');
    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushFlex.mock.invocationCallOrder[0]);
    expect(result).toEqual({ eligible: 1, sent: 1, skipped: 0, failed: 0 });
  });

  it('skips a week without entries without reserving or pushing', async () => {
    const { repository, pushFlex, run } = setup();
    repository.summarizeTransactions.mockResolvedValue([]);

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 1, failed: 0 });
    expect(repository.reserveNotification).not.toHaveBeenCalled();
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('skips a user whose summary for this week was already sent', async () => {
    const { repository, pushFlex, run } = setup();
    repository.reserveNotification.mockResolvedValue(false);

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 1, failed: 0 });
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('keeps going after one user fails and logs only the reason', async () => {
    const { repository, pushFlex, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    repository.summarizeTransactions.mockRejectedValueOnce(new Error('db down'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 1 });
    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(pushFlex.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to send weekly summary', { userId: 'user-1', reason: 'db down' });
  });

  // จองไว้แล้วไม่ลบ เพราะ LINE อาจส่งถึงแล้วแม้ client ได้ error
  it('counts a failed push as failed and keeps the reservation', async () => {
    const { pushFlex, run } = setup();
    pushFlex.mockRejectedValue(new Error('LINE 500'));

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 0, failed: 1 });
  });

  it('returns zero counts when nobody turned the summary on', async () => {
    const { repository, run } = setup([]);

    expect(await run()).toEqual({ eligible: 0, sent: 0, skipped: 0, failed: 0 });
    expect(repository.summarizeTransactions).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/notifications/weekly.test.js`
Expected: FAIL `Cannot find module './weekly.js'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/notifications/weekly.js`:

```js
const { getPeriodRange } = require('../summary/period');
const { buildSummary } = require('../summary/summary');
const { buildSummaryFlex } = require('../summary/flex');

const WEEKLY_SUMMARY_KIND = 'weekly_summary';

function createWeeklySummaryRunner({ repository, pushFlex, now = () => new Date(), logger = console }) {
  return async function run() {
    const range = getPeriodRange('week', now());
    const users = await repository.listWeeklySummaryUsers();
    const result = { eligible: users.length, sent: 0, skipped: 0, failed: 0 };
    // ส่งทีละคน push พังของคนหนึ่งไม่หยุดคนอื่น
    for (const user of users) {
      try {
        const rows = await repository.summarizeTransactions(user.userId, range.from, range.to);
        const summary = buildSummary(rows, range.label);
        // สัปดาห์ที่ไม่มีรายการไม่ส่ง เพื่อไม่เสียโควตา push
        if (summary.entryCount === 0) {
          result.skipped += 1;
          continue;
        }
        // period คือวันจันทร์ของสัปดาห์ จองก่อน push เพื่อให้ cron ที่ถูกเรียกซ้ำไม่ส่งซ้ำ
        const reserved = await repository.reserveNotification({
          userId: user.userId,
          kind: WEEKLY_SUMMARY_KIND,
          period: range.from,
        });
        if (!reserved) {
          result.skipped += 1;
          continue;
        }
        // ไม่เรียก Claude เขียนคอมเมนต์ ให้ทัน timeout 30 วินาทีของ cron-job.org และไม่เสียค่า Claude
        await pushFlex(user.lineUserId, buildSummaryFlex(summary, ''));
        result.sent += 1;
      } catch (err) {
        // ไม่ลบการจองเพราะ LINE อาจส่งถึงแล้ว และไม่ log err ทั้งก้อนเพราะ cause อาจมียอดเงิน
        logger.error('Failed to send weekly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.failed += 1;
      }
    }
    return result;
  };
}

module.exports = { createWeeklySummaryRunner, WEEKLY_SUMMARY_KIND };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/notifications/weekly.test.js`
Expected: PASS ทั้งไฟล์ 6 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/notifications/weekly.js src/notifications/weekly.test.js
git commit -m "feat: send the weekly summary card to users who opted in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: endpoint cron `/internal/notifications/weekly`

**Depends on:** Task 2, Task 4, Task 5

**Files:**
- Create: `src/notifications/router.js`
- Test: `src/notifications/router.test.js`
- Modify: `src/app.js` (parameter ของ `createApp` บรรทัด 7 และ mount ต่อจาก `recurringRouter` ราวบรรทัด 26-28)
- Test: `src/app.test.js` (`start` บรรทัด 16-17 และ describe ใหม่ท้ายไฟล์)
- Modify: `index.js` (require ราวบรรทัด 23-24, สร้าง router ต่อจาก `recurringRouter` ราวบรรทัด 125-128, `createApp` ราวบรรทัด 129-135)

**Interfaces:**
- Consumes: `requireCronSecret`, `hasCronSecret` (Task 4), `createWeeklySummaryRunner` (Task 5), `createPushFlex(lineClient)` เดิม
- Produces:
  - `createNotificationsRouter({ cronSecret: string, runWeeklySummary: () => Promise<{ failed: number, ... }>, logger = console }) => express.Router` มี `POST /notifications/weekly` (401 `{ error: 'Unauthorized' }` เมื่อ secret ผิด, 200 หรือ 500 พร้อมผลของ runner ตาม `failed > 0`, 500 `{ error: 'Internal error' }` เมื่อ runner throw)
  - ภายใน router มี `mountJob(path, run, failureLog)` สำหรับเพิ่มงานถัดไป (แผน daily-reminder เรียก `mountJob('/notifications/daily-reminder', runDailyReminder, 'Daily reminder run failed')`)
  - `createApp({ ..., notificationsRouter })` mount ที่ `/internal`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/notifications/router.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createNotificationsRouter } from './router.js';

const COUNTS = { eligible: 2, sent: 1, skipped: 1, failed: 0 };

let server;

function deps(overrides = {}) {
  return {
    cronSecret: 's3cret',
    runWeeklySummary: vi.fn().mockResolvedValue(COUNTS),
    logger: { error: vi.fn() },
    ...overrides,
  };
}

async function start(options) {
  const app = express();
  app.use('/internal', createNotificationsRouter(options));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/internal`;
}

function post(base, path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${base}${path}`, { method: 'POST', headers });
}

afterEach(async () => {
  if (!server) return;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
});

describe('createNotificationsRouter', () => {
  it('refuses to build without a secret so the endpoint is never open', () => {
    expect(() => createNotificationsRouter(deps({ cronSecret: '' }))).toThrow('createNotificationsRouter requires cronSecret');
  });

  it('refuses to build without the weekly job', () => {
    expect(() => createNotificationsRouter(deps({ runWeeklySummary: undefined }))).toThrow('runWeeklySummary');
  });
});

describe('POST /internal/notifications/weekly', () => {
  it('runs the weekly summary and returns the counts when the bearer secret matches', async () => {
    const options = deps();
    const base = await start(options);

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COUNTS);
    expect(options.runWeeklySummary).toHaveBeenCalledTimes(1);
  });

  it('returns 500 with the counts when any push failed', async () => {
    const counts = { eligible: 2, sent: 1, skipped: 0, failed: 1 };
    const base = await start(deps({ runWeeklySummary: vi.fn().mockResolvedValue(counts) }));

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(counts);
  });

  it('returns 401 and does not run for a missing or wrong secret', async () => {
    const options = deps();
    const base = await start(options);

    expect((await post(base, '/notifications/weekly')).status).toBe(401);
    expect((await post(base, '/notifications/weekly', 'wrong')).status).toBe(401);
    expect(options.runWeeklySummary).not.toHaveBeenCalled();
  });

  it('returns 500 and logs only the reason when the job throws', async () => {
    const options = deps({ runWeeklySummary: vi.fn().mockRejectedValue(new Error('db down')) });
    const base = await start(options);

    const res = await post(base, '/notifications/weekly', 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
    expect(options.logger.error).toHaveBeenCalledWith('Weekly summary run failed', { reason: 'db down' });
  });

  it('answers only POST', async () => {
    const base = await start(deps());

    const res = await fetch(`${base}/notifications/weekly`, { headers: { Authorization: 'Bearer s3cret' } });

    expect(res.status).toBe(404);
  });
});
```

ใน `src/app.test.js` เปลี่ยน function `start` เป็น:

```js
async function start(handleEvents, logger = { error: vi.fn() }, apiRouter, exportRouter, recurringRouter, notificationsRouter) {
  const app = createApp({ channelSecret: SECRET, handleEvents, logger, apiRouter, exportRouter, recurringRouter, notificationsRouter });
```

(บรรทัดที่เหลือของ `start` คงเดิม) แล้วเพิ่มท้ายไฟล์:

```js
describe('notifications router', () => {
  it('mounts the router under /internal next to the recurring router', async () => {
    const recurringRouter = express.Router();
    recurringRouter.post('/recurring/run', (req, res) => res.json({ job: 'recurring' }));
    const notificationsRouter = express.Router();
    notificationsRouter.post('/notifications/weekly', (req, res) => res.json({ job: 'weekly' }));
    const baseUrl = await start(vi.fn(), undefined, undefined, undefined, recurringRouter, notificationsRouter);

    const weekly = await fetch(`${baseUrl}/internal/notifications/weekly`, { method: 'POST' });
    const recurring = await fetch(`${baseUrl}/internal/recurring/run`, { method: 'POST' });

    expect(await weekly.json()).toEqual({ job: 'weekly' });
    expect(await recurring.json()).toEqual({ job: 'recurring' });
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/notifications/router.test.js src/app.test.js`
Expected: FAIL `Cannot find module './router.js'` (router.test) และ `mounts the router under /internal next to the recurring router` ได้ 404 (body ไม่ใช่ JSON) ส่วนเทสต์เดิมของ app ยังผ่าน

- [ ] **Step 3: เขียน router และต่อเข้า app**

สร้าง `src/notifications/router.js`:

```js
const express = require('express');
const { requireCronSecret, hasCronSecret } = require('../utils/cron-auth');

function createNotificationsRouter({ cronSecret, runWeeklySummary, logger = console }) {
  requireCronSecret(cronSecret, 'createNotificationsRouter');
  if (typeof runWeeklySummary !== 'function') {
    throw new TypeError('createNotificationsRouter requires runWeeklySummary');
  }
  const router = express.Router();

  function mountJob(path, run, failureLog) {
    router.post(path, async (req, res) => {
      if (!hasCronSecret(req, cronSecret)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      try {
        const result = await run();
        // ให้ cron-job.org แจ้งเตือนเมื่อส่งไม่สำเร็จอย่างน้อยหนึ่งคน
        res.status(result.failed > 0 ? 500 : 200).json(result);
      } catch (err) {
        // ไม่ log err ทั้งก้อนเพราะ cause อาจมีข้อมูลของผู้ใช้
        logger.error(failureLog, { reason: err?.message ?? String(err) });
        res.status(500).json({ error: 'Internal error' });
      }
    });
  }

  mountJob('/notifications/weekly', runWeeklySummary, 'Weekly summary run failed');

  return router;
}

module.exports = { createNotificationsRouter };
```

ใน `src/app.js` เปลี่ยน signature เป็น:

```js
function createApp({ channelSecret, handleEvents, apiRouter, exportRouter, recurringRouter, notificationsRouter, logger = console }) {
```

และต่อจาก block `if (recurringRouter) { ... }` เพิ่ม:

```js
  if (notificationsRouter) {
    app.use('/internal', notificationsRouter);
  }
```

ใน `index.js` ต่อจาก `const { createRecurringRouter } = require('./src/recurring/router');` เพิ่ม:

```js
const { createWeeklySummaryRunner } = require('./src/notifications/weekly');
const { createNotificationsRouter } = require('./src/notifications/router');
```

ต่อจาก block `const recurringRouter = createRecurringRouter({ ... });` เพิ่ม:

```js
const notificationsRouter = createNotificationsRouter({
  cronSecret: config.cronSecret,
  runWeeklySummary: createWeeklySummaryRunner({ repository, pushFlex: createPushFlex(lineClient) }),
});
```

ใน `createApp({ ... })` เพิ่ม `notificationsRouter,` ต่อจาก `recurringRouter,`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/notifications/router.test.js src/app.test.js`
Expected: PASS ทั้งสองไฟล์

Run: `node --check index.js`
Expected: ไม่มี output (syntax ถูกต้อง)

- [ ] **Step 5: Commit**

```bash
git add src/notifications/router.js src/notifications/router.test.js src/app.js src/app.test.js index.js
git commit -m "feat: add the weekly summary cron endpoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: LIFF api และ settings panel

**Depends on:** none (ใช้สัญญา API ตาม Interfaces ของ Task 3)

**Files:**
- Modify: `public/liff/api.mjs` (object ที่ return ต่อจาก `getProfile` ราวบรรทัด 47)
- Test: `public/liff/api.test.mjs` (เทสต์ใหม่ต่อจาก `asks for the trend of a month and the profile` ราวบรรทัด 159-167)
- Create: `public/liff/settings-panel.mjs`
- Test: `public/liff/settings-panel.test.mjs`

**Interfaces:**
- Consumes: `GET /api/settings` -> `{ weeklySummary }`, `PATCH /api/settings` (Task 3); `ApiError` จาก `public/liff/api.mjs`; `LOGIN_REQUIRED_MESSAGE` จาก `public/liff/format.mjs`
- Produces:
  - `api.getSettings() => Promise<{ weeklySummary: boolean }>`, `api.updateSettings(body: { weeklySummary?: boolean }) => Promise<{ weeklySummary: boolean }>`
  - `createSettingsPanel({ els: { section, loadingText, error, errorText, retry, body, status, switches: { [field: string]: HTMLInputElement } }, getApi: () => api | null }) => { ensureLoaded(): Promise<void> }` โดย key ของ `switches` คือชื่อ field ของ API (แผน daily-reminder เพิ่ม `dailyReminder` ใน `switches` โดยไม่ต้องแก้ไฟล์นี้)
  - ข้อความ: โหลดพัง `โหลดการตั้งค่าไม่สำเร็จ`, บันทึกสำเร็จ `บันทึกแล้ว`, บันทึกพัง `บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง`, 401 ใช้ `LOGIN_REQUIRED_MESSAGE`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/api.test.mjs` ต่อจากเทสต์ `asks for the trend of a month and the profile`:

```js
  it('reads and saves the notification settings', async () => {
    const fetchImpl = fakeFetch(200, { weeklySummary: true });
    const api = setup(fetchImpl);

    expect(await api.getSettings()).toEqual({ weeklySummary: true });
    await api.updateSettings({ weeklySummary: true });

    expect(fetchImpl.mock.calls.map(([url, options]) => [url, options.method ?? 'GET', options.body])).toEqual([
      ['/api/settings', 'GET', undefined],
      ['/api/settings', 'PATCH', JSON.stringify({ weeklySummary: true })],
    ]);
  });
```

สร้าง `public/liff/settings-panel.test.mjs`:

```js
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createSettingsPanel } from './settings-panel.mjs';
import { ApiError } from './api.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

const byId = (id) => document.getElementById(id);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(api) {
  document.body.innerHTML = `
    <section id="notify" hidden>
      <p id="notify-loading" hidden></p>
      <div id="notify-error" hidden><p id="notify-error-text"></p><button type="button" id="notify-retry"></button></div>
      <div id="notify-body" hidden><input id="notify-weekly-summary" type="checkbox"></div>
      <p id="notify-status"></p>
    </section>`;
  return createSettingsPanel({
    els: {
      section: byId('notify'),
      loadingText: byId('notify-loading'),
      error: byId('notify-error'),
      errorText: byId('notify-error-text'),
      retry: byId('notify-retry'),
      body: byId('notify-body'),
      status: byId('notify-status'),
      switches: { weeklySummary: byId('notify-weekly-summary') },
    },
    getApi: () => api,
  });
}

function toggle(input, checked) {
  input.checked = checked;
  input.dispatchEvent(new Event('change'));
}

describe('createSettingsPanel', () => {
  it('does nothing before login', async () => {
    const panel = setup(null);

    await panel.ensureLoaded();

    expect(byId('notify').hidden).toBe(true);
  });

  it('loads the switches once and shows them', async () => {
    const api = { getSettings: vi.fn().mockResolvedValue({ weeklySummary: true }) };
    const panel = setup(api);

    await panel.ensureLoaded();
    await panel.ensureLoaded();

    expect(api.getSettings).toHaveBeenCalledTimes(1);
    expect(byId('notify').hidden).toBe(false);
    expect(byId('notify-loading').hidden).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
    expect(byId('notify-weekly-summary').checked).toBe(true);
  });

  it('shows the loading text while waiting', () => {
    setup({ getSettings: () => new Promise(() => {}) }).ensureLoaded();

    expect(byId('notify').hidden).toBe(false);
    expect(byId('notify-loading').hidden).toBe(false);
    expect(byId('notify-body').hidden).toBe(true);
  });

  it('shows a retry when loading fails and loads again from it', async () => {
    const api = {
      getSettings: vi.fn().mockRejectedValueOnce(new ApiError(500)).mockResolvedValueOnce({ weeklySummary: false }),
    };
    const panel = setup(api);

    await panel.ensureLoaded();

    expect(byId('notify-error').hidden).toBe(false);
    expect(byId('notify-error-text').textContent).toBe('โหลดการตั้งค่าไม่สำเร็จ');
    expect(byId('notify-retry').hidden).toBe(false);
    expect(byId('notify-loading').hidden).toBe(true);

    byId('notify-retry').click();
    await flush();

    expect(byId('notify-error').hidden).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
  });

  it('asks to reopen from LINE without a retry when login expired', async () => {
    const panel = setup({ getSettings: vi.fn().mockRejectedValue(new ApiError(401)) });

    await panel.ensureLoaded();

    expect(byId('notify-error-text').textContent).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(byId('notify-retry').hidden).toBe(true);
  });

  it('saves a switch, locks it while saving and shows the saved value', async () => {
    let finish;
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: false }),
      updateSettings: vi.fn(() => new Promise((resolve) => (finish = resolve))),
    };
    const panel = setup(api);
    await panel.ensureLoaded();
    const box = byId('notify-weekly-summary');

    toggle(box, true);

    expect(api.updateSettings).toHaveBeenCalledWith({ weeklySummary: true });
    expect(box.disabled).toBe(true);
    finish({ weeklySummary: true });
    await flush();
    expect(box.disabled).toBe(false);
    expect(box.checked).toBe(true);
    expect(byId('notify-status').textContent).toBe('บันทึกแล้ว');
  });

  it('puts the switch back when saving fails', async () => {
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: false }),
      updateSettings: vi.fn().mockRejectedValue(new ApiError(500)),
    };
    const panel = setup(api);
    await panel.ensureLoaded();
    const box = byId('notify-weekly-summary');

    toggle(box, true);
    await flush();

    expect(box.checked).toBe(false);
    expect(box.disabled).toBe(false);
    expect(byId('notify-status').textContent).toBe('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('asks to reopen from LINE when saving needs a new login', async () => {
    const api = {
      getSettings: vi.fn().mockResolvedValue({ weeklySummary: true }),
      updateSettings: vi.fn().mockRejectedValue(new ApiError(401)),
    };
    const panel = setup(api);
    await panel.ensureLoaded();

    toggle(byId('notify-weekly-summary'), false);
    await flush();

    expect(byId('notify-weekly-summary').checked).toBe(true);
    expect(byId('notify-status').textContent).toBe(LOGIN_REQUIRED_MESSAGE);
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/api.test.mjs public/liff/settings-panel.test.mjs`
Expected: FAIL `api.getSettings is not a function` และ `Failed to load url ./settings-panel.mjs` (หรือ `Cannot find module`)

- [ ] **Step 3: เขียนโค้ด**

ใน `public/liff/api.mjs` ต่อจาก `getProfile: () => request('/profile'),` เพิ่ม:

```js
    getSettings: () => request('/settings'),
    updateSettings: (body) => request('/settings', { method: 'PATCH', body: JSON.stringify(body) }),
```

สร้าง `public/liff/settings-panel.mjs`:

```js
import { ApiError } from './api.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

const LOAD_FAILED_MESSAGE = 'โหลดการตั้งค่าไม่สำเร็จ';
const SAVE_FAILED_MESSAGE = 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง';
const SAVED_MESSAGE = 'บันทึกแล้ว';

const isLoginRequired = (err) => err instanceof ApiError && err.status === 401;

// สวิตช์การแจ้งเตือนในแท็บโปรไฟล์: โหลดเมื่อเข้าแท็บครั้งแรก ไม่ให้หน้าแรกยิง request เพิ่ม
export function createSettingsPanel({ els, getApi }) {
  let loaded = false;
  let loading = null;
  const fields = Object.keys(els.switches);

  function render(settings) {
    for (const field of fields) els.switches[field].checked = settings[field] === true;
  }

  function showLoadError(err) {
    els.loadingText.hidden = true;
    const loginRequired = isLoginRequired(err);
    els.errorText.textContent = loginRequired ? LOGIN_REQUIRED_MESSAGE : LOAD_FAILED_MESSAGE;
    // 401 ต้องเปิดจาก LINE ใหม่ กดลองใหม่ก็ได้ผลเดิม
    els.retry.hidden = loginRequired;
    els.error.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.section.hidden = false;
    els.error.hidden = true;
    els.loadingText.hidden = false;
    loading = api
      .getSettings()
      .then((settings) => {
        loaded = true;
        render(settings);
        els.loadingText.hidden = true;
        els.body.hidden = false;
      }, showLoadError)
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function ensureLoaded() {
    if (loading) return loading;
    if (loaded) return Promise.resolve();
    return load();
  }

  async function save(field) {
    const input = els.switches[field];
    const wanted = input.checked;
    input.disabled = true;
    els.status.textContent = '';
    try {
      render(await getApi().updateSettings({ [field]: wanted }));
      els.status.textContent = SAVED_MESSAGE;
    } catch (err) {
      // ถือว่า server ยังไม่เปลี่ยน ถ้าที่จริงเปลี่ยนแล้ว เปิดหน้าใหม่จะเห็นค่าจริง
      input.checked = !wanted;
      els.status.textContent = isLoginRequired(err) ? LOGIN_REQUIRED_MESSAGE : SAVE_FAILED_MESSAGE;
    } finally {
      input.disabled = false;
    }
  }

  els.retry.addEventListener('click', () => {
    ensureLoaded();
  });
  for (const field of fields) {
    els.switches[field].addEventListener('change', () => save(field));
  }

  return { ensureLoaded };
}
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/api.test.mjs public/liff/settings-panel.test.mjs`
Expected: PASS ทั้งสองไฟล์

- [ ] **Step 5: Commit**

```bash
git add public/liff/api.mjs public/liff/api.test.mjs public/liff/settings-panel.mjs public/liff/settings-panel.test.mjs
git commit -m "feat: add a LIFF panel that loads and saves notification switches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: ส่วน "การแจ้งเตือน" ในแท็บโปรไฟล์

**Depends on:** Task 3, Task 7

**Files:**
- Modify: `public/liff/index.html` (section ใหม่ระหว่าง `</section>` ของ `profile-card` กับ `<section id="friends"` ราวบรรทัด 437-439)
- Modify: `public/liff/style.css` (กฎใหม่ต่อจาก `.profile-stale` ราวบรรทัด 272)
- Test: `public/liff/style.test.mjs` (describe ใหม่ท้ายไฟล์)
- Modify: `public/liff/app.mjs` (import ราวบรรทัด 34, สร้าง panel ก่อน `const categoriesPanel` ราวบรรทัด 238, `onChange` ของแท็บโปรไฟล์ ราวบรรทัด 1490-1494, `boot` ราวบรรทัด 1616)
- Test: `public/liff/app.dom.test.mjs` (`RESPONSES` ราวบรรทัด 89, static invariant ใหม่ใน `describe('index.html static invariants', ...)`, describe ใหม่ต่อจาก `describe('LIFF profile picture', ...)` ราวบรรทัด 1940)

**Interfaces:**
- Consumes: `createSettingsPanel` (Task 7), `GET/PATCH /api/settings` (Task 3)
- Produces: element id `notify`, `notify-title`, `notify-loading`, `notify-error`, `notify-error-text`, `notify-retry`, `notify-body`, `notify-weekly-summary`, `notify-status`; class `notify-switch` / `notify-switch-text` สำหรับแถวสวิตช์ (แผน daily-reminder เพิ่ม `<label class="notify-switch">` แถวที่สองใน `notify-body` และ key `dailyReminder` ใน `switches` ของ `createSettingsPanel` ใน `app.mjs`)

**Browser check in LINE app:** *(ทำหลังผู้ใช้รัน `supabase/021_notification_settings.sql` ใน Supabase แล้ว merge+push และ Render deploy เสร็จ หน้า LIFF ต้องล็อกอิน LINE จึงทดสอบอัตโนมัติไม่ได้)*
- Preconditions: เปิดแอป LINE บนมือถือ บัญชีที่เพิ่มบอทแล้ว เปิดหน้าเว็บจาก Rich Menu ปุ่ม "เว็บไซต์"

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "โปรไฟล์" ที่แถบล่าง | ใต้การ์ดยอดเงินมีกล่อง "การแจ้งเตือน" มีแถว "ส่งสรุปทุกวันอาทิตย์" พร้อมคำอธิบายเล็ก และสวิตช์สีเทา (ปิด) |
| 2 | แตะสวิตช์ "ส่งสรุปทุกวันอาทิตย์" | สวิตช์เลื่อนไปขวาเป็นสีน้ำเงิน ใต้กล่องขึ้น "บันทึกแล้ว" |
| 3 | ปิดหน้าเว็บ แล้วเปิดจาก Rich Menu ใหม่ แตะแท็บ "โปรไฟล์" | สวิตช์ยังเป็นสีน้ำเงิน (เปิด) |
| 4 | แตะสวิตช์อีกครั้ง | สวิตช์กลับเป็นสีเทา ขึ้น "บันทึกแล้ว" |
| 5 | ปิดเน็ต (โหมดเครื่องบิน) แล้วแตะสวิตช์ | สวิตช์เด้งกลับค่าเดิม ขึ้น "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" |

- [ ] **Step 1: เขียนเทสต์ที่ fail ใน app.dom.test.mjs**

ใน `RESPONSES` เพิ่มต่อจากบรรทัด `'/api/profile': { ... },`:

```js
  '/api/settings': { weeklySummary: false },
```

ใน `describe('index.html static invariants', ...)` ต่อจากเทสต์ `starts every JS-controlled loading and error element hidden` เพิ่ม:

```js
  it('starts the notification section hidden and gives each switch a visible label', () => {
    for (const id of ['notify', 'notify-loading', 'notify-error', 'notify-body']) {
      expect(doc.getElementById(id).hasAttribute('hidden'), id).toBe(true);
    }
    const box = doc.getElementById('notify-weekly-summary');
    expect(box.getAttribute('role')).toBe('switch');
    expect(box.closest('label.notify-switch').textContent).toContain('ส่งสรุปทุกวันอาทิตย์');
    expect(doc.getElementById('notify').closest('#panel-profile')).not.toBeNull();
    expect(doc.getElementById('notify').closest('#profile-card')).toBeNull();
  });
```

เพิ่ม describe ใหม่ต่อจาก `describe('LIFF profile picture', ...)`:

```js
describe('LIFF notification settings', () => {
  it('does not ask for the settings before the profile tab opens', async () => {
    const liff = await boot();

    expect(liff.fetched).not.toContain('/api/settings');
    expect(byId('notify').hidden).toBe(true);
  });

  it('loads the switches when the profile tab opens', async () => {
    const liff = await boot();

    clickTab('profile');
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/settings')).toHaveLength(1);
    expect(byId('notify').hidden).toBe(false);
    expect(byId('notify-body').hidden).toBe(false);
    expect(byId('notify-weekly-summary').checked).toBe(false);
  });

  it('loads the switches after boot when a link opens the profile tab', async () => {
    const liff = await boot({ search: '?tab=profile' });
    await settle();

    expect(liff.fetched.filter((path) => path === '/api/settings')).toHaveLength(1);
    expect(byId('notify-body').hidden).toBe(false);
  });

  it('saves the weekly summary switch', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const calls = routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { weeklySummary: true } : undefined));
    const box = byId('notify-weekly-summary');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('PATCH /api/settings');
    expect(box.checked).toBe(true);
    expect(byId('notify-status').textContent).toBe('บันทึกแล้ว');
  });

  it('puts the switch back when saving fails', async () => {
    await boot();
    clickTab('profile');
    await settle();
    routeFetch((method, path) => (method === 'PATCH' && path === '/api/settings' ? { status: 500 } : undefined));
    const box = byId('notify-weekly-summary');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(box.checked).toBe(false);
    expect(byId('notify-status').textContent).toBe('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('shows a retry when the settings fail to load, and loads them from it', async () => {
    await boot({ overrides: { '/api/settings': { status: 500 } } });
    clickTab('profile');
    await settle();

    expect(byId('notify-error').hidden).toBe(false);
    expect(byId('notify-error-text').textContent).toBe('โหลดการตั้งค่าไม่สำเร็จ');

    routeFetch(() => undefined);
    byId('notify-retry').click();
    await settle();

    expect(byId('notify-error').hidden).toBe(true);
    expect(byId('notify-body').hidden).toBe(false);
  });
});
```

- [ ] **Step 2: เขียนเทสต์ที่ fail ใน style.test.mjs**

เพิ่มท้าย `public/liff/style.test.mjs`:

```js
describe('style.css notification switches', () => {
  // ใช้หน้าตาเดียวกับสวิตช์ซ่อนหมวด ไม่ใช่ checkbox สี่เหลี่ยมของ browser
  it('draws the notification checkbox as a pill switch', () => {
    const rule = declarations('.notify-switch input[type="checkbox"]');

    expect(rule).toMatch(/(?:^|;)\s*appearance:\s*none/);
    expect(rule).toMatch(/border-radius:\s*var\(--radius-pill\)/);
    expect(declarations('.notify-switch input[type="checkbox"]:checked')).toMatch(/background:\s*var\(--primary\)/);
  });

  it('gives the notification card the same frame as the friends card', () => {
    expect(declarations('.notify-settings')).toMatch(/box-shadow:\s*var\(--shadow-card\)/);
  });
});
```

- [ ] **Step 3: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs`
Expected: FAIL เทสต์ `starts the notification section hidden ...` (`notify` เป็น null), เทสต์ใน `LIFF notification settings` และ `style.css notification switches` ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 4: เพิ่ม HTML และ CSS**

ใน `public/liff/index.html` ระหว่าง:

```html
        <button type="button" id="profile-close" class="profile-close" hidden>กลับไปแชต</button>
      </section>
```

กับ `<section id="friends" class="friends" aria-labelledby="friends-title" hidden>` เพิ่ม:

```html
      <section id="notify" class="notify-settings" aria-labelledby="notify-title" hidden>
        <h2 id="notify-title">การแจ้งเตือน</h2>
        <p class="notify-hint">บอทส่งข้อความหาคุณเองตามเวลา เปิดเฉพาะที่อยากได้</p>
        <p id="notify-loading" class="notify-loading" role="status" hidden>กำลังโหลดการตั้งค่า...</p>
        <div id="notify-error" class="budgets-error" hidden>
          <p id="notify-error-text" role="alert"></p>
          <button type="button" id="notify-retry">ลองใหม่</button>
        </div>
        <div id="notify-body" class="notify-body" hidden>
          <label class="notify-switch"><span class="notify-switch-text"><span>ส่งสรุปทุกวันอาทิตย์</span><small>การ์ดสรุปสัปดาห์
                จันทร์-อาทิตย์ ส่งเวลา 19:00 สัปดาห์ที่ไม่มีรายการจะไม่ส่ง</small></span><input id="notify-weekly-summary"
              type="checkbox" role="switch"></label>
        </div>
        <p id="notify-status" class="notify-status" role="status" aria-live="polite"></p>
      </section>
```

ใน `public/liff/style.css` ต่อจากบรรทัด `.profile-stale { ... }` เพิ่ม:

```css
.notify-settings { margin: 12px 16px 0; padding: 20px; background: var(--surface); border-radius: var(--radius-card); box-shadow: var(--shadow-card); }
.notify-settings h2 { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.3; }
.notify-hint, .notify-loading { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.notify-body { margin-top: 8px; }
.notify-switch { display: flex; align-items: center; gap: 12px; min-height: 52px; margin: 0; padding: 8px 0; }
.notify-switch + .notify-switch { border-top: 1px solid var(--border); }
.notify-switch-text { display: flex; flex: 1; flex-direction: column; font-size: 16px; font-weight: 700; }
.notify-switch-text small { font-size: 13px; font-weight: 400; color: var(--muted); }
.notify-switch input[type="checkbox"] { -webkit-appearance: none; appearance: none; position: relative; flex: none; width: 52px; height: 32px; min-height: 0; margin: 0; padding: 0; border: none; border-radius: var(--radius-pill); background: var(--outline); cursor: pointer; }
.notify-switch input[type="checkbox"]::before { content: ""; position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: var(--surface); transition: transform 0.15s; }
.notify-switch input[type="checkbox"]:checked { background: var(--primary); }
.notify-switch input[type="checkbox"]:checked::before { transform: translateX(20px); }
.notify-switch input[type="checkbox"]:disabled { opacity: 0.5; cursor: wait; }
.notify-switch input[type="checkbox"]:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.notify-status { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
.notify-status:empty { display: none; }
```

- [ ] **Step 5: ต่อ panel ใน app.mjs**

ต่อจาก `import { createFriendsPanel } from './friends-panel.mjs';` เพิ่ม:

```js
import { createSettingsPanel } from './settings-panel.mjs';
```

ต่อจาก block `const friendsPanel = createFriendsPanel({ ... });` (ก่อน `const categoriesPanel = createCategoriesPanel({`) เพิ่ม:

```js
const settingsPanel = createSettingsPanel({
  els: {
    section: document.getElementById('notify'),
    loadingText: document.getElementById('notify-loading'),
    error: document.getElementById('notify-error'),
    errorText: document.getElementById('notify-error-text'),
    retry: document.getElementById('notify-retry'),
    body: document.getElementById('notify-body'),
    status: document.getElementById('notify-status'),
    switches: { weeklySummary: document.getElementById('notify-weekly-summary') },
  },
  getApi: () => api,
});
```

ใน `onChange` ของ `createTabController` เปลี่ยน:

```js
    if (id === 'profile') {
      refreshProfileOnEntry();
      // เพื่อนอาจเพิ่มเราจากอีกเครื่องระหว่างนั้น จึงโหลดรายชื่อใหม่ทุกครั้งที่เข้าแท็บ
      friendsPanel.refresh();
    }
```

เป็น:

```js
    if (id === 'profile') {
      refreshProfileOnEntry();
      // เพื่อนอาจเพิ่มเราจากอีกเครื่องระหว่างนั้น จึงโหลดรายชื่อใหม่ทุกครั้งที่เข้าแท็บ
      friendsPanel.refresh();
      settingsPanel.ensureLoaded();
    }
```

ใน `boot` เปลี่ยน:

```js
    // เปิดแท็บโปรไฟล์ก่อน boot เสร็จ ตอนนั้นยังไม่มี api จึงต้องโหลดเพื่อนตอนนี้
    if (tabController.current === 'profile') friendsPanel.ensureLoaded();
```

เป็น:

```js
    // เปิดแท็บโปรไฟล์ก่อน boot เสร็จ ตอนนั้นยังไม่มี api จึงต้องโหลดเพื่อนและสวิตช์ตอนนี้
    if (tabController.current === 'profile') {
      friendsPanel.ensureLoaded();
      settingsPanel.ensureLoaded();
    }
```

- [ ] **Step 6: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/style.test.mjs public/liff/settings-panel.test.mjs`
Expected: PASS ทั้งสามไฟล์

Run: `node --check public/liff/app.mjs`
Expected: ไม่มี output

- [ ] **Step 7: Commit**

```bash
git add public/liff/index.html public/liff/style.css public/liff/style.test.mjs public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: show the weekly summary switch in the profile tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: เอกสาร งาน cron และ STATE

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6, Task 7, Task 8

**Files:**
- Modify: `README.md` (ความสามารถ ราวบรรทัด 13 และ 19, mermaid ราวบรรทัด 39-41, ตารางเส้นทาง ราวบรรทัด 50, ขั้นตอนรัน SQL ราวบรรทัด 95, ประโยค deploy ราวบรรทัด 104, งาน cron-job.org ราวบรรทัด 107-109, ความปลอดภัย ราวบรรทัด 127, ข้อจำกัด ราวบรรทัด 137)
- Modify: `SPEC.md` (ฟังก์ชันข้อ 3 ราวบรรทัด 31, ข้อใหม่ 11 ต่อจากข้อ 10 ราวบรรทัด 51, Database ราวบรรทัด 57 และ 73, Deploy ราวบรรทัด 101-103, ลำดับการทำข้อ 15 ต่อจากข้อ 14 ราวบรรทัด 135)
- Modify: `docs/superpowers/plans/2026-10-18-roadmap-b.md` (บรรทัดสถานะ และตารางลำดับแถว 2-4)
- Modify: `work-memory/STATE.md`

**Interfaces:**
- Consumes: พฤติกรรมจาก Task 1-8

**LINE check (งาน cron):** *(ทำหลัง Browser check ของ Task 8 และหลังผู้ใช้เพิ่มงานใน cron-job.org ตาม Step 1)*
- Preconditions: รัน `021_notification_settings.sql` แล้ว, deploy แล้ว, สวิตช์ "ส่งสรุปทุกวันอาทิตย์" ของบัญชีผู้ใช้เปิดอยู่, สัปดาห์นี้ (ตั้งแต่วันจันทร์) มีรายการอย่างน้อย 1 รายการ, มีค่า `CRON_SECRET` จากหน้า Environment ของ Render

| # | Action | Expected |
|---|---|---|
| 1 | ใน cron-job.org เปิดงาน `POST .../internal/notifications/weekly` แล้วกดรันทดสอบ (หรือใน Git Bash รัน `curl -i -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<URL ของ Render>/internal/notifications/weekly`) | ได้ HTTP 200 body เช่น `{"eligible":1,"sent":1,"skipped":0,"failed":0}` และในแชต LINE ได้การ์ดหัวข้อ `สรุปสัปดาห์นี้ (<วันจันทร์> - <วันนี้>)` มีรายรับ รายจ่าย คงเหลือ ไม่มีย่อหน้าคอมเมนต์ท้ายการ์ด |
| 2 | รันซ้ำแบบข้อ 1 | ได้ 200 body `"sent":0,"skipped":1` และไม่มีการ์ดใบที่สองในแชต |
| 3 | รันแบบข้อ 1 แต่ใส่ secret ผิด | ได้ HTTP 401 `{"error":"Unauthorized"}` |
| 4 | (ไม่บังคับ) ใน Supabase SQL Editor รัน `select kind, period, created_at from notification_log order by created_at desc limit 5;` | มีแถว `weekly_summary` period เป็นวันจันทร์ของสัปดาห์นี้ |

หมายเหตุ: ถ้าทดสอบในวันที่ไม่ใช่วันอาทิตย์ (คำถามข้อ 1 ตอบ ก.) การ์ดจะสรุปจันทร์ถึงวันนั้น และวันอาทิตย์นี้จะไม่ส่งซ้ำ

- [ ] **Step 1: อัปเดต README**

- ส่วน ความสามารถ ต่อจาก bullet **รายการประจำ:** เพิ่ม:

```markdown
- **สรุปรายสัปดาห์:** เปิดสวิตช์ `ส่งสรุปทุกวันอาทิตย์` ในแท็บโปรไฟล์ (ค่าตั้งต้นปิด) แล้วทุกวันอาทิตย์ 19:00 บอท push การ์ดสรุปสัปดาห์นั้น (จันทร์-อาทิตย์) แบบเดียวกับ `สรุปสัปดาห์นี้` แต่ไม่มีคอมเมนต์จาก Claude สัปดาห์ที่ไม่มีรายการไม่ส่ง และไม่ส่งเกินสัปดาห์ละครั้งต่อคน
```

- bullet โปรไฟล์ของเว็บ LIFF: เปลี่ยนท้าย `สำหรับหารบิล` เป็น `สำหรับหารบิล และส่วนการแจ้งเตือน (สวิตช์ส่งสรุปทุกวันอาทิตย์)`
- mermaid: ต่อจากบรรทัด `Cron -->|GET ทุก 10 นาที| Health` เพิ่ม:

```
  Cron -->|POST ทุกวันอาทิตย์ 19:00| Weekly["/internal/notifications/weekly"]
  Weekly --> Express
```

- ตารางเส้นทาง: ต่อจากแถว `POST /internal/recurring/run` เพิ่ม:

```markdown
| `POST /internal/notifications/weekly` | ส่งการ์ดสรุปสัปดาห์ให้ผู้ใช้ที่เปิดสวิตช์ (ต้องมี `Authorization: Bearer <CRON_SECRET>`) |
```

- ขั้นตอนรัน SQL: เปลี่ยน `` `002` ถึง `020` `` เป็น `` `002` ถึง `021` ``
- ประโยค deploy: เปลี่ยน `(ไฟล์ล่าสุดตอนนี้คือ `020_query_totals.sql` ต้องรันก่อน push เพราะบอทเรียก function `query_totals` เมื่อผู้ใช้ถามยอด ถ้ายังไม่รัน คำถามยอดจะได้ข้อความระบบมีปัญหา ส่วนการบันทึกรายการยังใช้ได้;` เป็น:

```
(ไฟล์ล่าสุดตอนนี้คือ `021_notification_settings.sql` ต้องรันก่อน push เพราะแท็บโปรไฟล์อ่านสวิตช์จากคอลัมน์ `weekly_summary_enabled` และงาน cron สรุปรายสัปดาห์เขียนตาราง `notification_log` ถ้ายังไม่รัน ส่วนการแจ้งเตือนในแท็บโปรไฟล์จะโหลดไม่สำเร็จ และงาน cron สรุปรายสัปดาห์จะตอบ 500 ส่วนอื่นยังใช้ได้; `020_query_totals.sql` ก็ต้องรันก่อน เพราะบอทเรียก function `query_totals` เมื่อผู้ใช้ถามยอด ถ้ายังไม่รัน คำถามยอดจะได้ข้อความระบบมีปัญหา ส่วนการบันทึกรายการยังใช้ได้;
```

- ขั้นตอน deploy ข้อ 4: เปลี่ยน `ตั้ง cron-job.org 2 งาน:` เป็น `ตั้ง cron-job.org 3 งาน:` และต่อจาก bullet `POST <URL>/internal/recurring/run ...` เพิ่ม:

```markdown
   - `POST <URL>/internal/notifications/weekly` ทุกวันอาทิตย์ 19:00 (ตั้งเขตเวลาของงานเป็น `Asia/Bangkok`) พร้อม header `Authorization: Bearer <CRON_SECRET>` แบบเดียวกับงานรายการประจำ และเปิดแจ้งเตือนเมื่อล้มเหลว (ตอบ 500 เมื่อส่งไม่สำเร็จอย่างน้อยหนึ่งคน) ทดสอบด้วยการรันมือได้ แต่ถ้ารันวันอื่นการ์ดจะสรุปจันทร์ถึงวันนั้น และสัปดาห์นั้นจะไม่ส่งซ้ำ
```

- ความปลอดภัย: เปลี่ยน `- endpoint cron `/internal/recurring/run` ป้องกันด้วย secret` เป็น `- endpoint cron `/internal/recurring/run` และ `/internal/notifications/weekly` ป้องกันด้วย secret`
- ข้อจำกัด: เปลี่ยน `- ข้อความ push (รายการประจำ) นับโควตาของแพ็กเกจ LINE ส่วนข้อความตอบกลับ (reply) ไม่นับ` เป็น:

```markdown
- ข้อความ push (รายการประจำ และสรุปรายสัปดาห์ของคนที่เปิดสวิตช์ สัปดาห์ละไม่เกิน 1 ข้อความต่อคน) นับโควตาของแพ็กเกจ LINE ส่วนข้อความตอบกลับ (reply) ไม่นับ
- สรุปรายสัปดาห์ส่งทีละคน ถ้าคนที่เปิดสวิตช์มีมาก งาน cron อาจเกิน timeout 30 วินาทีของ cron-job.org (server ยังส่งต่อจนครบ แต่ cron-job.org จะแจ้งว่าล้มเหลว) และถ้า push ของใครพัง คนนั้นจะไม่ได้การ์ดสัปดาห์นั้น (ไม่ลองซ้ำ เพราะ LINE อาจส่งถึงแล้ว)
```

ตรวจทุกประโยคกับโค้ดจริงก่อน commit (`grep -n "020\|021\|notifications" README.md`)

- [ ] **Step 2: อัปเดต SPEC**

- ฟังก์ชันข้อ 3: เปลี่ยน `รายชื่อเพื่อน ลบเพื่อน เปลี่ยนรหัส (แท็บโปรไฟล์ไม่มีส่วนหมวดแล้ว)` เป็น `รายชื่อเพื่อน ลบเพื่อน เปลี่ยนรหัส และส่วนการแจ้งเตือน (สวิตช์ส่งสรุปทุกวันอาทิตย์) (แท็บโปรไฟล์ไม่มีส่วนหมวดแล้ว)`
- ต่อจากย่อหน้าฟังก์ชันข้อ 10 (ขึ้นต้นด้วย `10\. ถามยอดด้วยภาษาธรรมชาติ:`) เพิ่มย่อหน้าใหม่ (เว้นบรรทัดว่างคั่นเหมือนข้ออื่น):

```markdown
11\. สรุปรายสัปดาห์: ผู้ใช้เปิดสวิตช์ "ส่งสรุปทุกวันอาทิตย์" ในแท็บโปรไฟล์ (ค่าตั้งต้นปิด เพราะ push นับโควตา LINE OA; API `GET /api/settings` คืน `{ weeklySummary }`, `PATCH /api/settings` รับ boolean เฉพาะ field ที่รู้จัก field อื่นตัดทิ้ง) งาน cron `POST /internal/notifications/weekly` ทุกวันอาทิตย์ 19:00 ส่งการ์ดสรุปช่วง `week` (วันจันทร์ถึงวันที่รัน) ด้วย `buildSummary` + `buildSummaryFlex` เดิม ไม่เรียก Claude เขียนคอมเมนต์ สัปดาห์ที่ไม่มีรายการไม่ส่ง กันส่งซ้ำด้วยการจองแถวใน `notification_log` (kind `weekly_summary`, period = วันจันทร์ของสัปดาห์) ก่อน push ส่งทีละคน push พังของคนหนึ่งไม่หยุดคนอื่นและไม่ลองซ้ำ ตอบ `{ eligible, sent, skipped, failed }` และ 500 เมื่อ failed > 0
```

- Database: บรรทัด `\- users: ...` ต่อท้ายด้วย `, weekly\_summary\_enabled และ daily\_reminder\_enabled (boolean ค่าตั้งต้น false ใช้ SQL `021_notification_settings.sql`)` และต่อจากบรรทัด `\- bill\_members: ...` เพิ่ม (เว้นบรรทัดว่างคั่น):

```markdown
\- notification\_log: user\_id, kind (weekly\_summary/daily\_reminder), period (YYYY-MM-DD), created\_at (primary key user\_id+kind+period; จองก่อน push กันส่งซ้ำ; ลบ user แล้วลบแถวตามด้วย cascade; เปิด RLS ไม่มี policy ใช้ผ่าน service role เท่านั้น) ใช้ SQL `021_notification_settings.sql`
```

- Deploy: ต่อท้ายบรรทัดที่ขึ้นต้นด้วย `\- รายการประจำและแจ้งเตือน:` ด้วย ` สัญญาของสรุปรายสัปดาห์คือ `POST /internal/notifications/weekly` header เดียวกัน ทุกวันอาทิตย์ 19:00 (Asia/Bangkok) ตอบ JSON { eligible, sent, skipped, failed }, 401 เมื่อ token ผิด, 500 เมื่อส่งไม่สำเร็จอย่างน้อยหนึ่งคน`; บรรทัด Push message เปลี่ยน `(รายการประจำที่บันทึกแล้วใช้ push 1 ครั้งต่อรายการ)` เป็น `(รายการประจำที่บันทึกแล้วใช้ push 1 ครั้งต่อรายการ สรุปรายสัปดาห์ใช้ไม่เกิน 1 ครั้งต่อคนต่อสัปดาห์ เฉพาะคนที่เปิดสวิตช์)`
- ส่วนลำดับการทำ ต่อจากข้อ 14 เพิ่ม (เว้นบรรทัดว่างคั่น):

```markdown
15\. สรุปรายสัปดาห์ (roadmap ทิศทาง ข ข้อ 3: docs/superpowers/plans/2026-10-19-weekly-summary.md)
```

- [ ] **Step 3: อัปเดต roadmap และ STATE**

- `docs/superpowers/plans/2026-10-18-roadmap-b.md`: ในตารางลำดับ แถวลำดับ 2 เปลี่ยนสถานะเป็น `เสร็จ push แล้ว` (ตรงกับ STATE: merge 95734a1 push แล้ว), แถวลำดับ 3 เป็น `เสร็จบน branch รอ push`, แถวลำดับ 4 เป็น `ยังไม่เริ่ม (ถัดไป)`; บรรทัด **สถานะ** ด้านบนเพิ่มประโยค `ข้อ 3 เสร็จบน branch feat/weekly-summary รอผู้ใช้รัน `021_notification_settings.sql` แล้ว push (แผน 2026-10-19-weekly-summary.md)`
- `work-memory/STATE.md` ส่วน Next เพิ่มบรรทัดบนสุด: `` - [ ] `next` สรุปรายสัปดาห์ (แผน docs/superpowers/plans/2026-10-19-weekly-summary.md) Task 1-9 เสร็จบน branch feat/weekly-summary ยังไม่ merge/push: ผู้ใช้ต้องรัน `supabase/021_notification_settings.sql` ก่อน push, เพิ่มงาน cron-job.org `POST /internal/notifications/weekly` ทุกวันอาทิตย์ 19:00 Asia/Bangkok แล้วทำ Browser check ของ Task 8 และ LINE check ของ Task 9; ถัดไปคือแผน 2026-10-19-daily-reminder.md (ทำหลัง merge) ``

- [ ] **Step 4: ตรวจทั้งหมดแล้ว commit**

Run: `npm test`, `npm run lint`, `node --check index.js`, `node --check public/liff/app.mjs`
Expected: ผ่านทั้งหมด (ถ้า `scripts/try-parse.test.js` timeout ตอนรันพร้อมกัน ให้รันเดี่ยวด้วย `npx vitest run scripts/try-parse.test.js` ก่อนสรุปว่าพัง)

```bash
git add README.md SPEC.md docs/superpowers/plans/2026-10-18-roadmap-b.md work-memory/STATE.md
git commit -m "docs: describe the weekly summary and its cron job" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
