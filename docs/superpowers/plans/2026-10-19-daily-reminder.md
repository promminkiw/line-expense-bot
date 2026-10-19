# เตือนลืมจด Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้เปิดสวิตช์ "เตือนถ้าวันนี้ยังไม่ได้จด" ในแท็บโปรไฟล์ แล้วถ้าถึง 21:00 วันนั้นยังไม่มีรายการที่ผู้ใช้จดเอง บอท push ข้อความเตือนสั้นๆ วันละไม่เกินครั้ง

**Architecture:** ต่อยอดโครงจากแผน `2026-10-19-weekly-summary.md` ทั้งหมด: คอลัมน์ `users.daily_reminder_enabled` และตาราง `notification_log` มีจาก `021` แล้ว แผนนี้เพิ่มแค่ SQL function `users_to_remind(p_day)` ใน `supabase/022_daily_reminder.sql`, field `dailyReminder` ในตารางคู่ชื่อ `src/notifications/settings.js` (API settings และ LIFF panel รู้จักเอง), runner `src/notifications/daily-reminder.js` ที่จองด้วย `reserveNotification` ก่อน push, route `POST /internal/notifications/daily-reminder` ใน `src/notifications/router.js` และสวิตช์แถวที่สองในส่วน "การแจ้งเตือน" ของหน้า LIFF

**Tech Stack:** Node.js 24 + Express 5, @line/bot-sdk, Supabase Postgres, LIFF (vanilla JS ES modules), vitest + PGlite + jsdom

## คำถามถึงผู้ใช้ก่อนเริ่ม

1. **รายการจากบิลหาร (source `bill`) ให้นับว่า "จดเอง" ไหม** -- **ตอบแล้ว (ผู้ใช้ตัดสิน 2026-10-19): ข. นับ** เพราะแถว `bill` เกิดจากการกระทำของผู้ใช้เองเสมอ (`create_bill` ตอนเจ้าของสร้างบิล และ `confirm_bill_share` ตอนเพื่อนกดยืนยัน) กติกาจึงเป็น `source in ('text', 'slip', 'bill')` ส่วนรายการประจำ (`recurring`) ยังไม่นับ แผนนี้เขียนตามคำตอบนี้แล้ว (Task 1 SQL และเทสต์, Task 6 คำอธิบายสวิตช์, Task 7 README/SPEC)

ไม่มีคำถามค้าง

## Global Constraints

- **ทำหลังจาก `feat/weekly-summary` (แผน `docs/superpowers/plans/2026-10-19-weekly-summary.md`) merge เข้า main แล้วเท่านั้น** แผนนี้ใช้ของจากแผนนั้นตรงตัว: `021_notification_settings.sql`, `src/notifications/settings.js`, `repository.reserveNotification`, `src/utils/cron-auth.js`, `src/notifications/router.js` (`mountJob`), `public/liff/settings-panel.mjs` และ element `notify-*` ในแท็บโปรไฟล์ ก่อนเริ่มให้ตรวจว่าชื่อใน Interfaces ด้านล่างตรงกับโค้ดบน main ถ้าไม่ตรงให้หยุดแล้วแก้แผนก่อน
- ตามแผนใหญ่ `docs/superpowers/plans/2026-10-18-roadmap-b.md` ข้อ 4 เปลี่ยน 1 จุดตามที่ผู้ใช้ตัดสิน 2026-10-19: รายการ source `bill` นับว่าจดแล้ว (แผนใหญ่นับเฉพาะ `text` และ `slip`); รายละเอียดที่แผนใหญ่ไม่ได้ระบุ: (1) ถ้า push พังหลังจองแล้ว ไม่ลบการจองและไม่ลองซ้ำ (LINE อาจส่งถึงแล้วแม้ client ได้ error) นับใน `pushFailed` และไม่ทำให้ cron ตอบ 500 (ผู้ใช้ตัดสิน 2026-10-19 แบบเดียวกับสรุปรายสัปดาห์และ `src/recurring/run.js`) cron ตอบ 500 เฉพาะเมื่อ `failed > 0` คือจองไม่สำเร็จ (2) ข้อความเตือนไม่มีปุ่ม และไม่นับรายการที่ถูกลบไปแล้ว (คนที่จดแล้วกดยกเลิกจนไม่เหลือรายการจะได้ข้อความเตือน) (3) ผู้ใช้ที่ unfollow บอทถูกปิด `daily_reminder_enabled` อยู่แล้วจาก Task 9 ของแผน weekly-summary แผนนี้ไม่ต้องแก้ส่วนนั้น
- "จดเอง" = transactions ที่ `source in ('text', 'slip', 'bill')` และ `created_at` อยู่ในวันนั้นตามเวลา Asia/Bangkok (ไม่ใช่ `occurred_on`) คำนวณใน SQL; `recurring` ไม่นับ
- branch `feat/daily-reminder` แตกจาก main ล่าสุด (หลัง merge weekly summary), TDD (เขียน test ให้ fail ก่อน), commit ทีละ task, merge เข้า main ในเครื่องด้วย `--no-ff` เมื่อจบ
- ห้าม `git push`, ห้ามรัน SQL ใน Supabase, ห้ามแก้ `.env`, ห้ามติดตั้งแพ็กเกจใหม่, ห้ามเปิด/ปิด server
- migration ใหม่คือ `022_daily_reminder.sql` (ไฟล์ล่าสุดตอนนั้นคือ `021_notification_settings.sql`; ไม่มีไฟล์ 016) มีเฉพาะ function รันซ้ำได้ (`create or replace`) เพิ่มชื่อไฟล์ใน `MIGRATIONS` ของ `src/db/sql-functions.test.js` หัวไฟล์ `supabase/schema.sql` ขั้นตอนรัน SQL และประโยค "ไฟล์ล่าสุด" ใน README
- function SQL ใหม่ revoke จาก `public, anon, authenticated` แล้ว grant ให้ `service_role` และเพิ่มในเทสต์ `function permissions`
- push message นับโควตา LINE OA: สวิตช์ค่าตั้งต้นปิด (มีจาก 021), วันละไม่เกินครั้งต่อคน (จองใน `notification_log` kind `daily_reminder` period = วันนั้น)
- server กรองตามผู้ใช้ทุก query (function คืนเฉพาะคนที่เปิดสวิตช์ และ push ไปที่ `line_user_id` ของแถวนั้น)
- คอมเมนต์ในโค้ดภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log ภาษาอังกฤษ; ไม่มี emoji ในโค้ด คอมเมนต์ log commit
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย; ไม่แก้ `HELP_REPLY` (เทสต์ใน `src/menu/fixed-replies.test.js` pin ข้อความทั้งก้อน); ไม่แตะ `src/query/` (การ์ดคำตอบถามยอด merge เข้า main แล้วใน 18ee475 แผนนี้ไม่ขึ้นกับมัน)
- ไฟล์ใหม่ใช้ CRLF เหมือนไฟล์เดิม (git autocrlf=true จัดการให้ตอน commit)
- ก่อนจบ: `npm test`, `npm run lint`, `node --check index.js`, `node --check public/liff/app.mjs` ผ่านทั้งหมด
- commit message ภาษาอังกฤษ ลงท้ายด้วยบรรทัดว่างแล้วสองบรรทัด `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` และ `Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC` (ใช้ `-m` ตัวที่สองที่มีสองบรรทัดนี้ติดกันตามตัวอย่างในแต่ละ task)

## Interfaces ที่ใช้จากแผน weekly-summary (ต้องมีบน main แล้ว)

- `supabase/021_notification_settings.sql`: `users.daily_reminder_enabled boolean not null default false`; ตาราง `notification_log (user_id, kind in ('weekly_summary','daily_reminder'), period text YYYY-MM-DD, created_at, primary key (user_id, kind, period))`
- `src/notifications/settings.js`: `NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled' }`, `SETTINGS_COLUMNS`, `toNotificationSettings(row)`, `toSettingsColumns(changes)`
- `repository.getNotificationSettings(userId) => Promise<{ weeklySummary }>`, `repository.updateNotificationSettings(userId, changes) => Promise<{ weeklySummary }>`, `repository.reserveNotification({ userId, kind, period }) => Promise<boolean>`, `repository.disableNotifications(lineUserId)` (เรียกจาก event `unfollow` ใน `src/bot.js` ปิดทั้ง `weekly_summary_enabled` และ `daily_reminder_enabled` แล้ว แผนนี้ไม่แก้)
- runner ของ weekly คืน `{ eligible, sent, skipped, failed, pushFailed }` (`failed` = อ่าน/จองไม่สำเร็จ, `pushFailed` = push พังหลังจอง) และ router ตอบ 500 เฉพาะ `failed > 0`
- `validateSettingsUpdate(body)` ใน `src/api/validate.js` (วนตาม key ของ `NOTIFICATION_SETTINGS`), `GET/PATCH /api/settings`
- `src/utils/cron-auth.js`: `requireCronSecret(cronSecret, owner)`, `hasCronSecret(req, cronSecret)`
- `src/notifications/router.js`: `createNotificationsRouter({ cronSecret, runWeeklySummary, logger = console })` ภายในมี `mountJob(path, run, failureLog)`; `src/notifications/router.test.js` มี helper `deps(overrides)` และ `post(base, path, token)`
- `createApp({ ..., notificationsRouter })` mount ที่ `/internal`
- `public/liff/settings-panel.mjs`: `createSettingsPanel({ els: { section, loadingText, error, errorText, retry, body, status, switches }, getApi })` โดย `switches` เป็น `{ [field]: HTMLInputElement }`; บันทึกแล้วตั้งเฉพาะสวิตช์ที่บันทึก; ข้อความ `บันทึกแล้ว` / `บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง`
- `public/liff/index.html`: `<div id="notify-body" class="notify-body" hidden>` ที่มี `<label class="notify-switch">` ของ `notify-weekly-summary`
- `public/liff/app.dom.test.mjs`: `RESPONSES['/api/settings'] = { weeklySummary: false }` และ `describe('LIFF notification settings', ...)`

---

## File Structure

| ไฟล์ | หน้าที่ |
|---|---|
| `supabase/022_daily_reminder.sql` (ใหม่) | SQL function `users_to_remind(p_day date)` |
| `src/notifications/settings.js` | เพิ่ม `dailyReminder: 'daily_reminder_enabled'` |
| `src/db/repository.js` | `listUsersToRemind(day)` เรียก RPC |
| `src/notifications/daily-reminder.js` (ใหม่) | runner ส่งข้อความเตือน |
| `src/notifications/router.js` | route `POST /notifications/daily-reminder` |
| `index.js` | สร้าง runner แล้วส่งให้ `createNotificationsRouter` |
| `public/liff/index.html`, `public/liff/app.mjs` | สวิตช์ "เตือนถ้าวันนี้ยังไม่ได้จด" |

---

### Task 1: SQL function users_to_remind (022)

**Depends on:** none

**Files:**
- Create: `supabase/022_daily_reminder.sql`
- Modify: `supabase/schema.sql:1` (บรรทัดหัวไฟล์ที่บอกลำดับการรัน)
- Test: `src/db/sql-functions.test.js` (เพิ่มใน `MIGRATIONS`, describe ใหม่ต่อจาก `describe('021_notification_settings.sql', ...)`, แถวใน `function permissions`)

**Interfaces:**
- Consumes: `users.daily_reminder_enabled` (021), `transactions.source`, `transactions.created_at`
- Produces: `public.users_to_remind(p_day date)` returns table `(user_id uuid, line_user_id text)` เรียงตาม `user_id` คือคนที่ `daily_reminder_enabled` เป็น true และไม่มี transactions ที่ `source in ('text','slip','bill')` และ `created_at` อยู่ในช่วง `[p_day 00:00, p_day+1 00:00)` เวลา Asia/Bangkok

- [ ] **Step 1: เพิ่มไฟล์ใน MIGRATIONS และเขียนเทสต์ที่ fail**

ใน `src/db/sql-functions.test.js` เพิ่ม `'022_daily_reminder.sql'` ต่อจาก `'021_notification_settings.sql'` ใน `MIGRATIONS`:

```js
  '021_notification_settings.sql',
  '022_daily_reminder.sql',
];
```

เพิ่ม describe ใหม่ต่อจาก `describe('021_notification_settings.sql', ...)`:

```js
describe('users_to_remind', () => {
  // วันที่ 2026-10-19 ตามเวลาไทยเริ่มที่ 2026-10-18T17:00:00Z และจบก่อน 2026-10-19T17:00:00Z
  async function addEntry(userId, categoryId, source, createdAt) {
    await db.query(
      "insert into transactions (user_id, category_id, type, amount, occurred_on, source, created_at) values ($1, $2, 'expense', 50, '2026-10-19', $3, $4)",
      [userId, categoryId, source, createdAt],
    );
  }

  async function enable(userId) {
    await db.query('update users set daily_reminder_enabled = true where id = $1', [userId]);
  }

  const remind = (day = '2026-10-19') => rows('select * from users_to_remind($1)', [day]);

  it('lists users who turned the reminder on and wrote nothing today', async () => {
    const quiet = await createUser('U1');
    await enable(quiet);
    await createUser('U2');

    expect(await remind()).toEqual([{ user_id: quiet, line_user_id: 'U1' }]);
  });

  it('leaves out a user who typed or sent a slip today in Bangkok time', async () => {
    const typed = await createUser('U1');
    const slip = await createUser('U2');
    await enable(typed);
    await enable(slip);
    const food = await createCategory(typed, 'อาหาร', 'expense');
    const receipt = await createCategory(slip, 'ใบเสร็จ/สลิปโอนเงิน', 'expense');
    await addEntry(typed, food, 'text', '2026-10-18T17:00:00Z');
    await addEntry(slip, receipt, 'slip', '2026-10-19T16:59:59Z');

    expect(await remind()).toEqual([]);
  });

  // บิลเกิดจากผู้ใช้สร้างหรือยืนยันเอง จึงนับว่าจดแล้ว (ผู้ใช้ตัดสิน 2026-10-19)
  it('leaves out a user whose bill entry was saved today', async () => {
    const user = await createUser('U1');
    await enable(user);
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addEntry(user, food, 'bill', '2026-10-19T03:00:00Z');

    expect(await remind()).toEqual([]);
  });

  // รายการประจำไม่นับว่าจดเอง และวันตัดตามเวลาไทยไม่ใช่ UTC
  it('still reminds when the only entries today came from recurring rules, or fall outside the Bangkok day', async () => {
    const user = await createUser('U1');
    await enable(user);
    const food = await createCategory(user, 'อาหาร', 'expense');
    await addEntry(user, food, 'recurring', '2026-10-19T02:00:00Z');
    await addEntry(user, food, 'bill', '2026-10-18T16:59:59Z');
    await addEntry(user, food, 'text', '2026-10-18T16:59:59Z');
    await addEntry(user, food, 'text', '2026-10-19T17:00:00Z');

    expect(await remind()).toEqual([{ user_id: user, line_user_id: 'U1' }]);
  });

  it('does not let another user entries hide a quiet user', async () => {
    const quiet = await createUser('U1');
    const busy = await createUser('U2');
    await enable(quiet);
    const busyFood = await createCategory(busy, 'อาหาร', 'expense');
    await addEntry(busy, busyFood, 'text', '2026-10-19T05:00:00Z');

    expect(await remind()).toEqual([{ user_id: quiet, line_user_id: 'U1' }]);
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('022_daily_reminder.sql'))).resolves.toBeDefined();
  });
});
```

ใน `describe('function permissions', ...)` เพิ่มแถวท้าย array `calls` (ต่อจาก `query_totals`):

```js
    ['users_to_remind', "select * from users_to_remind('2026-10-19')"],
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL ตอน `beforeAll` เพราะอ่านไฟล์ `supabase/022_daily_reminder.sql` ไม่เจอ (ENOENT)

- [ ] **Step 3: เขียน migration**

สร้าง `supabase/022_daily_reminder.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 021 ก่อน push โค้ดที่มีงาน cron เตือนลืมจด รันซ้ำได้
-- นับเฉพาะรายการที่ผู้ใช้ทำเอง (พิมพ์ ส่งสลิป หรือสร้าง/ยืนยันบิล) รายการประจำไม่นับ และตัดวันตามเวลาไทยจาก created_at

create or replace function public.users_to_remind(p_day date)
returns table (user_id uuid, line_user_id text)
language sql
stable
set search_path = public
as $$
  select u.id, u.line_user_id
  from public.users u
  where u.daily_reminder_enabled
    and not exists (
      select 1
      from public.transactions t
      where t.user_id = u.id
        and t.source in ('text', 'slip', 'bill')
        and t.created_at >= (p_day::timestamp at time zone 'Asia/Bangkok')
        and t.created_at < ((p_day + 1)::timestamp at time zone 'Asia/Bangkok')
    )
  order by u.id
$$;

revoke execute on function public.users_to_remind(date) from public, anon, authenticated;
grant execute on function public.users_to_remind(date) to service_role;
```

ใน `supabase/schema.sql` บรรทัดแรก เปลี่ยน `020_query_totals.sql และ 021_notification_settings.sql ต่อตามลำดับ` เป็น:

```
020_query_totals.sql, 021_notification_settings.sql และ 022_daily_reminder.sql ต่อตามลำดับ
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งไฟล์ รวม `users_to_remind` 6 เทสต์ และ `does not let anon or authenticated call users_to_remind` / `lets service_role call users_to_remind`

- [ ] **Step 5: Commit**

```bash
git add supabase/022_daily_reminder.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add a function that finds users to remind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 2: สวิตช์ dailyReminder ใน settings API

**Depends on:** none

**Files:**
- Modify: `src/notifications/settings.js` (บรรทัด `NOTIFICATION_SETTINGS`)
- Test: `src/notifications/settings.test.js`
- Test: `src/db/repository.test.js` (describe `repository notification settings` ที่แผน weekly-summary เพิ่ม)
- Test: `src/api/validate.test.js` (describe `validateSettingsUpdate`)
- Test: `src/api/router.test.js` (describe `notification settings API`)

**Interfaces:**
- Consumes: `NOTIFICATION_SETTINGS` และฟังก์ชันที่วนตามมัน (จากแผน weekly-summary)
- Produces: `NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled', dailyReminder: 'daily_reminder_enabled' }`; `GET /api/settings` -> `{ weeklySummary: boolean, dailyReminder: boolean }`; `PATCH /api/settings` รับ `{ weeklySummary?: boolean, dailyReminder?: boolean }` คืนทั้งสอง field; `repository.getNotificationSettings` / `updateNotificationSettings` คืนทั้งสอง field

- [ ] **Step 1: แก้เทสต์ให้คาดหวัง field ใหม่ (ต้อง fail)**

`src/notifications/settings.test.js` เปลี่ยนทั้ง describe เป็น:

```js
describe('notification settings', () => {
  it('maps each API field to its users column', () => {
    expect(NOTIFICATION_SETTINGS).toEqual({ weeklySummary: 'weekly_summary_enabled', dailyReminder: 'daily_reminder_enabled' });
    expect(SETTINGS_COLUMNS).toBe('weekly_summary_enabled, daily_reminder_enabled');
  });

  it('reads a users row into API fields, and a missing row as everything off', () => {
    expect(toNotificationSettings({ weekly_summary_enabled: true, daily_reminder_enabled: false })).toEqual({
      weeklySummary: true,
      dailyReminder: false,
    });
    expect(toNotificationSettings(null)).toEqual({ weeklySummary: false, dailyReminder: false });
  });

  it('turns API fields into users columns', () => {
    expect(toSettingsColumns({ dailyReminder: true })).toEqual({ daily_reminder_enabled: true });
  });
});
```

`src/db/repository.test.js` ใน describe `repository notification settings`:
- เปลี่ยน `expect(await createRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: true });` เป็น `expect(await createRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: true, dailyReminder: false });`
- เปลี่ยน `expect(await createRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: false });` เป็น `expect(await createRepository(supabase).getNotificationSettings('user-1')).toEqual({ weeklySummary: false, dailyReminder: false });`
- เปลี่ยน `expect(await createRepository(supabase).updateNotificationSettings('user-1', { weeklySummary: true })).toEqual({ weeklySummary: true });` เป็น `expect(await createRepository(supabase).updateNotificationSettings('user-1', { weeklySummary: true })).toEqual({ weeklySummary: true, dailyReminder: false });`
- เพิ่มเทสต์ท้าย describe:

```js
  it('saves the daily reminder switch to its own column', async () => {
    const { supabase, calls } = fakeSupabase({ data: { weekly_summary_enabled: false, daily_reminder_enabled: true }, error: null });

    expect(await createRepository(supabase).updateNotificationSettings('user-1', { dailyReminder: true })).toEqual({
      weeklySummary: false,
      dailyReminder: true,
    });
    expect(calls[1]).toEqual(['update', { daily_reminder_enabled: true }]);
  });
```

`src/api/validate.test.js` ใน describe `validateSettingsUpdate` เพิ่ม:

```js
  it('keeps the daily reminder switch together with the weekly one', () => {
    expect(validateSettingsUpdate({ dailyReminder: true })).toEqual({ ok: true, value: { dailyReminder: true } });
    expect(validateSettingsUpdate({ weeklySummary: false, dailyReminder: true })).toEqual({
      ok: true,
      value: { weeklySummary: false, dailyReminder: true },
    });
  });

  it('refuses a daily reminder switch that is not a boolean', () => {
    expect(validateSettingsUpdate({ dailyReminder: 1 })).toEqual({ ok: false, error: 'Invalid dailyReminder' });
  });
```

`src/api/router.test.js` ใน `setup` เปลี่ยน mock เป็น:

```js
      getNotificationSettings: vi.fn().mockResolvedValue({ weeklySummary: false, dailyReminder: false }),
      updateNotificationSettings: vi
        .fn()
        .mockImplementation(async (userId, changes) => ({ weeklySummary: false, dailyReminder: false, ...changes })),
```

ใน describe `notification settings API`: เทสต์ `returns the switches of the logged in user` เปลี่ยน `expect(await res.json()).toEqual({ weeklySummary: false });` เป็น `expect(await res.json()).toEqual({ weeklySummary: false, dailyReminder: false });` และเทสต์ `saves a known switch and returns the saved values` เปลี่ยน `expect(await res.json()).toEqual({ weeklySummary: true });` เป็น `expect(await res.json()).toEqual({ weeklySummary: true, dailyReminder: false });` แล้วเพิ่มท้าย describe:

```js
  it('saves the daily reminder switch', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base, '/settings', { method: 'PATCH', body: { dailyReminder: true } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ weeklySummary: false, dailyReminder: true });
    expect(deps.repository.updateNotificationSettings).toHaveBeenCalledWith('user-1', { dailyReminder: true });
  });
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/notifications/settings.test.js src/db/repository.test.js src/api/validate.test.js src/api/router.test.js`
Expected: FAIL เทสต์ที่คาด `dailyReminder` ใน settings.test, repository.test และ validate.test (เช่น `expected { ok: false, error: 'Invalid body' } to equal { ok: true, ... }`) และ `saves the daily reminder switch` ใน router.test ได้ 400; เทสต์ที่แก้เฉพาะค่าที่ mock คืนใน router.test ผ่านอยู่แล้ว

- [ ] **Step 3: เพิ่ม field**

ใน `src/notifications/settings.js` เปลี่ยน:

```js
const NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled' };
```

เป็น:

```js
const NOTIFICATION_SETTINGS = { weeklySummary: 'weekly_summary_enabled', dailyReminder: 'daily_reminder_enabled' };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/notifications/settings.test.js src/db/repository.test.js src/api/validate.test.js src/api/router.test.js`
Expected: PASS ทั้งสี่ไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/notifications/settings.js src/notifications/settings.test.js src/db/repository.test.js src/api/validate.test.js src/api/router.test.js
git commit -m "feat: let users save the daily reminder switch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 3: repository.listUsersToRemind

**Depends on:** Task 2 (แก้ `src/db/repository.test.js` ไฟล์เดียวกัน จึงทำต่อจาก Task 2; ใช้ชื่อ RPC และพารามิเตอร์ตาม Interfaces ของ Task 1)

**Files:**
- Modify: `src/db/repository.js` (function ใหม่ต่อจาก `reserveNotification`; ชื่อใน object ที่ return ต่อจาก `reserveNotification,`)
- Test: `src/db/repository.test.js` (describe ใหม่ต่อจาก `repository.reserveNotification`)

**Interfaces:**
- Consumes: RPC `users_to_remind` พารามิเตอร์ `p_day`
- Produces: `repository.listUsersToRemind(day: 'YYYY-MM-DD') => Promise<Array<{ userId: string, lineUserId: string }>>`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/db/repository.test.js` ต่อจาก describe `repository.reserveNotification`:

```js
describe('repository.listUsersToRemind', () => {
  it('calls the SQL function with the Bangkok day and maps the rows', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ user_id: 'user-1', line_user_id: 'U1' }], error: null });

    expect(await createRepository(supabase).listUsersToRemind('2026-10-19')).toEqual([{ userId: 'user-1', lineUserId: 'U1' }]);
    expect(calls).toEqual([['rpc', 'users_to_remind', { p_day: '2026-10-19' }]]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).listUsersToRemind('2026-10-19');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database listUsersToRemind failed: boom');
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/db/repository.test.js -t listUsersToRemind`
Expected: FAIL `createRepository(...).listUsersToRemind is not a function`

- [ ] **Step 3: เขียนโค้ด**

ใน `src/db/repository.js` ต่อจาก function `reserveNotification`:

```js
  async function listUsersToRemind(day) {
    const { data, error } = await supabase.rpc('users_to_remind', { p_day: day });
    throwIfError('listUsersToRemind', error);
    return data.map((row) => ({ userId: row.user_id, lineUserId: row.line_user_id }));
  }
```

ใน object ที่ return ท้ายไฟล์ เพิ่ม `listUsersToRemind,` ต่อจาก `reserveNotification,`

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: let the repository list users to remind" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 4: runner เตือนลืมจด

**Depends on:** none (ใช้ชื่อ repository ตาม Interfaces ของ Task 3 และ `reserveNotification` จากแผน weekly-summary ผ่าน mock)

**Files:**
- Create: `src/notifications/daily-reminder.js`
- Test: `src/notifications/daily-reminder.test.js`

**Interfaces:**
- Consumes: `repository.listUsersToRemind(day)` (Task 3), `repository.reserveNotification({ userId, kind, period })`, `toBangkokDateString(date)` จาก `src/utils/date.js`, `pushText(to, text, quickReplyItems)` จาก `createPushText` ใน `src/line-reply.js`
- Produces:
  - `createDailyReminderRunner({ repository, pushText, now = () => new Date(), logger = console }) => run(): Promise<{ eligible: number, sent: number, skipped: number, failed: number, pushFailed: number }>` โดย `failed` = จองไม่สำเร็จ (ไม่ push คนนั้น), `pushFailed` = จองแล้วแต่ push พัง (เก็บการจองไว้ ไม่ลองซ้ำ)
  - log: `Failed to reserve daily reminder` และ `Failed to push daily reminder` พร้อม `{ userId, reason }`
  - `DAILY_REMINDER_KIND = 'daily_reminder'`, `DAILY_REMINDER_TEXT = 'วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"'`

- [ ] **Step 1: เขียนเทสต์ที่ fail**

สร้าง `src/notifications/daily-reminder.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createDailyReminderRunner, DAILY_REMINDER_KIND, DAILY_REMINDER_TEXT } from './daily-reminder.js';

// 2026-10-19 21:00 เวลาไทย
const NOW = new Date('2026-10-19T14:00:00Z');

function setup(users = [{ userId: 'user-1', lineUserId: 'U1' }]) {
  const repository = {
    listUsersToRemind: vi.fn().mockResolvedValue(users),
    reserveNotification: vi.fn().mockResolvedValue(true),
  };
  const pushText = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const run = createDailyReminderRunner({ repository, pushText, now: () => NOW, logger });
  return { repository, pushText, logger, run };
}

describe('createDailyReminderRunner', () => {
  it('uses the agreed reminder text', () => {
    expect(DAILY_REMINDER_TEXT).toBe('วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"');
  });

  it('asks for users to remind today in Bangkok time, reserves the day and pushes the text without buttons', async () => {
    const { repository, pushText, run } = setup();

    const result = await run();

    expect(repository.listUsersToRemind).toHaveBeenCalledWith('2026-10-19');
    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: DAILY_REMINDER_KIND, period: '2026-10-19' });
    expect(pushText).toHaveBeenCalledWith('U1', DAILY_REMINDER_TEXT);
    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushText.mock.invocationCallOrder[0]);
    expect(result).toEqual({ eligible: 1, sent: 1, skipped: 0, failed: 0, pushFailed: 0 });
  });

  // 00:30 ของวันที่ 20 ตามเวลาไทยยังเป็นวันที่ 19 ตาม UTC ต้องได้วันไทย
  it('uses the Bangkok date near midnight', async () => {
    const { repository } = setup([]);
    const run = createDailyReminderRunner({ repository, pushText: vi.fn(), now: () => new Date('2026-10-19T17:30:00Z') });

    await run();

    expect(repository.listUsersToRemind).toHaveBeenCalledWith('2026-10-20');
  });

  it('skips a user who was already reminded today', async () => {
    const { repository, pushText, run } = setup();
    repository.reserveNotification.mockResolvedValue(false);

    expect(await run()).toEqual({ eligible: 1, sent: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(pushText).not.toHaveBeenCalled();
  });

  it('counts a reservation error as failed, does not push to that user and keeps going', async () => {
    const { repository, pushText, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    repository.reserveNotification.mockRejectedValueOnce(new Error('db down'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 1, pushFailed: 0 });
    expect(pushText).toHaveBeenCalledTimes(1);
    expect(pushText).toHaveBeenCalledWith('U2', DAILY_REMINDER_TEXT);
    expect(logger.error).toHaveBeenCalledWith('Failed to reserve daily reminder', { userId: 'user-1', reason: 'db down' });
  });

  // จองไว้แล้วไม่ลบและไม่ลองซ้ำ เพราะ LINE อาจส่งถึงแล้วแม้ client ได้ error
  it('counts a failed push as pushFailed, keeps the reservation and still sends to the next user', async () => {
    const { repository, pushText, logger, run } = setup([
      { userId: 'user-1', lineUserId: 'U1' },
      { userId: 'user-2', lineUserId: 'U2' },
    ]);
    pushText.mockRejectedValueOnce(new Error('LINE 500'));

    expect(await run()).toEqual({ eligible: 2, sent: 1, skipped: 0, failed: 0, pushFailed: 1 });
    expect(repository.reserveNotification).toHaveBeenCalledTimes(2);
    expect(pushText).toHaveBeenLastCalledWith('U2', DAILY_REMINDER_TEXT);
    expect(logger.error).toHaveBeenCalledWith('Failed to push daily reminder', { userId: 'user-1', reason: 'LINE 500' });
  });

  it('returns zero counts when nobody needs a reminder', async () => {
    const { repository, run } = setup([]);

    expect(await run()).toEqual({ eligible: 0, sent: 0, skipped: 0, failed: 0, pushFailed: 0 });
    expect(repository.reserveNotification).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/notifications/daily-reminder.test.js`
Expected: FAIL `Cannot find module './daily-reminder.js'`

- [ ] **Step 3: เขียนโค้ด**

สร้าง `src/notifications/daily-reminder.js`:

```js
const { toBangkokDateString } = require('../utils/date');

const DAILY_REMINDER_KIND = 'daily_reminder';
const DAILY_REMINDER_TEXT = 'วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"';

function createDailyReminderRunner({ repository, pushText, now = () => new Date(), logger = console }) {
  return async function run() {
    const today = toBangkokDateString(now());
    // SQL คัดเฉพาะคนที่เปิดสวิตช์และวันนี้ยังไม่ได้จดเอง
    const users = await repository.listUsersToRemind(today);
    const result = { eligible: users.length, sent: 0, skipped: 0, failed: 0, pushFailed: 0 };
    for (const user of users) {
      try {
        // จองก่อน push เพื่อให้ cron ที่ถูกเรียกซ้ำในวันเดียวกันไม่เตือนซ้ำ
        const reserved = await repository.reserveNotification({ userId: user.userId, kind: DAILY_REMINDER_KIND, period: today });
        if (!reserved) {
          result.skipped += 1;
          continue;
        }
      } catch (err) {
        logger.error('Failed to reserve daily reminder', { userId: user.userId, reason: err?.message ?? String(err) });
        result.failed += 1;
        continue;
      }
      try {
        await pushText(user.lineUserId, DAILY_REMINDER_TEXT);
        result.sent += 1;
      } catch (err) {
        // ไม่ลบการจองและไม่ลองซ้ำเพราะ LINE อาจส่งถึงแล้ว นับแยกจาก failed เพื่อไม่ให้ cron ตอบ 500 เหมือนรายการประจำ
        logger.error('Failed to push daily reminder', { userId: user.userId, reason: err?.message ?? String(err) });
        result.pushFailed += 1;
      }
    }
    return result;
  };
}

module.exports = { createDailyReminderRunner, DAILY_REMINDER_KIND, DAILY_REMINDER_TEXT };
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/notifications/daily-reminder.test.js`
Expected: PASS ทั้งไฟล์ 7 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/notifications/daily-reminder.js src/notifications/daily-reminder.test.js
git commit -m "feat: remind users who have not recorded anything today" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 5: endpoint cron `/internal/notifications/daily-reminder`

**Depends on:** Task 3, Task 4

**Files:**
- Modify: `src/notifications/router.js` (พารามิเตอร์ของ `createNotificationsRouter`, การตรวจ dependency และ `mountJob` ใหม่)
- Test: `src/notifications/router.test.js` (helper `deps`, describe ใหม่)
- Modify: `index.js` (require ต่อจาก `createWeeklySummaryRunner`, `createNotificationsRouter({ ... })`)

**Interfaces:**
- Consumes: `createDailyReminderRunner` (Task 4), `mountJob` และ `hasCronSecret` ที่มีอยู่ใน router, `createPushText(lineClient)` เดิม
- Produces: `createNotificationsRouter({ cronSecret, runWeeklySummary, runDailyReminder, logger = console })` มี `POST /notifications/weekly` และ `POST /notifications/daily-reminder` (สัญญาเดียวกัน: 401 / ผลของ runner ด้วย 500 เมื่อ `failed > 0` ไม่งั้น 200 แม้ `pushFailed > 0` / 500 `{ error: 'Internal error' }` เมื่อ runner throw)

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `src/notifications/router.test.js` helper `deps` เพิ่มต่อจาก `runWeeklySummary: vi.fn().mockResolvedValue(COUNTS),`:

```js
    runDailyReminder: vi.fn().mockResolvedValue(COUNTS),
```

ใน `describe('createNotificationsRouter', ...)` เพิ่ม:

```js
  it('refuses to build without the daily reminder job', () => {
    expect(() => createNotificationsRouter(deps({ runDailyReminder: undefined }))).toThrow('runDailyReminder');
  });
```

เพิ่ม describe ใหม่ท้ายไฟล์:

```js
describe('POST /internal/notifications/daily-reminder', () => {
  it('runs only the daily reminder and returns the counts when the bearer secret matches', async () => {
    const options = deps();
    const base = await start(options);

    const res = await post(base, '/notifications/daily-reminder', 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COUNTS);
    expect(options.runDailyReminder).toHaveBeenCalledTimes(1);
    expect(options.runWeeklySummary).not.toHaveBeenCalled();
  });

  it('returns 500 with the counts when a reservation failed', async () => {
    const counts = { eligible: 1, sent: 0, skipped: 0, failed: 1, pushFailed: 0 };
    const base = await start(deps({ runDailyReminder: vi.fn().mockResolvedValue(counts) }));

    const res = await post(base, '/notifications/daily-reminder', 's3cret');

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual(counts);
  });

  it('returns 200 with the counts when only pushes failed', async () => {
    const counts = { eligible: 2, sent: 1, skipped: 0, failed: 0, pushFailed: 1 };
    const base = await start(deps({ runDailyReminder: vi.fn().mockResolvedValue(counts) }));

    const res = await post(base, '/notifications/daily-reminder', 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(counts);
  });

  it('returns 401 and does not run for a wrong secret', async () => {
    const options = deps();
    const base = await start(options);

    expect((await post(base, '/notifications/daily-reminder', 'wrong')).status).toBe(401);
    expect(options.runDailyReminder).not.toHaveBeenCalled();
  });

  it('returns 500 and logs only the reason when the job throws', async () => {
    const options = deps({ runDailyReminder: vi.fn().mockRejectedValue(new Error('db down')) });
    const base = await start(options);

    const res = await post(base, '/notifications/daily-reminder', 's3cret');

    expect(res.status).toBe(500);
    expect(options.logger.error).toHaveBeenCalledWith('Daily reminder run failed', { reason: 'db down' });
  });
});
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run src/notifications/router.test.js`
Expected: FAIL `refuses to build without the daily reminder job` (ไม่ throw) และเทสต์ใน `POST /internal/notifications/daily-reminder` ได้ 404 แทน 200/500/401 ทั้งห้าตัว ส่วนเทสต์ของ weekly ยังผ่าน

- [ ] **Step 3: เพิ่ม route และต่อใน index.js**

ใน `src/notifications/router.js` เปลี่ยน signature และการตรวจ dependency เป็น:

```js
function createNotificationsRouter({ cronSecret, runWeeklySummary, runDailyReminder, logger = console }) {
  requireCronSecret(cronSecret, 'createNotificationsRouter');
  if (typeof runWeeklySummary !== 'function') {
    throw new TypeError('createNotificationsRouter requires runWeeklySummary');
  }
  if (typeof runDailyReminder !== 'function') {
    throw new TypeError('createNotificationsRouter requires runDailyReminder');
  }
```

และต่อจาก `mountJob('/notifications/weekly', runWeeklySummary, 'Weekly summary run failed');` เพิ่ม:

```js
  mountJob('/notifications/daily-reminder', runDailyReminder, 'Daily reminder run failed');
```

ใน `index.js` ต่อจาก `const { createWeeklySummaryRunner } = require('./src/notifications/weekly');` เพิ่ม:

```js
const { createDailyReminderRunner } = require('./src/notifications/daily-reminder');
```

ใน `createNotificationsRouter({ ... })` ต่อจากบรรทัด `runWeeklySummary: ...` เพิ่ม:

```js
  runDailyReminder: createDailyReminderRunner({ repository, pushText: createPushText(lineClient) }),
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run src/notifications/router.test.js src/app.test.js`
Expected: PASS ทั้งสองไฟล์

Run: `node --check index.js`
Expected: ไม่มี output

- [ ] **Step 5: Commit**

```bash
git add src/notifications/router.js src/notifications/router.test.js index.js
git commit -m "feat: add the daily reminder cron endpoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 6: สวิตช์ "เตือนถ้าวันนี้ยังไม่ได้จด" ในแท็บโปรไฟล์

**Depends on:** Task 2

**Files:**
- Modify: `public/liff/index.html` (แถวสวิตช์ใหม่ใน `notify-body` ต่อจาก label ของ `notify-weekly-summary`)
- Modify: `public/liff/app.mjs` (`switches` ใน `createSettingsPanel({ ... })`)
- Test: `public/liff/app.dom.test.mjs` (`RESPONSES['/api/settings']`, static invariant, เทสต์ใหม่ใน `describe('LIFF notification settings', ...)`)

**Interfaces:**
- Consumes: `createSettingsPanel` (ไม่แก้ไฟล์ panel), `GET/PATCH /api/settings` ที่มี `dailyReminder` (Task 2), class `notify-switch` / `notify-switch-text` เดิม
- Produces: element id `notify-daily-reminder`

**Browser check in LINE app:** *(ทำหลังผู้ใช้รัน `supabase/022_daily_reminder.sql` ใน Supabase แล้ว merge+push และ Render deploy เสร็จ หน้า LIFF ต้องล็อกอิน LINE จึงทดสอบอัตโนมัติไม่ได้)*
- Preconditions: เปิดแอป LINE บนมือถือ บัญชีที่เพิ่มบอทแล้ว เปิดหน้าเว็บจาก Rich Menu ปุ่ม "เว็บไซต์"

| # | Action | Expected |
|---|---|---|
| 1 | แตะแท็บ "โปรไฟล์" | กล่อง "การแจ้งเตือน" มีสองแถว: "ส่งสรุปทุกวันอาทิตย์" และ "เตือนถ้าวันนี้ยังไม่ได้จด" (มีเส้นคั่นระหว่างแถว) สวิตช์ของแถวใหม่สีเทา (ปิด) สวิตช์สรุปรายสัปดาห์คงค่าเดิมที่เคยตั้ง |
| 2 | แตะสวิตช์ "เตือนถ้าวันนี้ยังไม่ได้จด" | สวิตช์เป็นสีน้ำเงิน ขึ้น "บันทึกแล้ว" สวิตช์สรุปรายสัปดาห์ไม่เปลี่ยน |
| 3 | ปิดหน้าเว็บแล้วเปิดใหม่ แตะแท็บ "โปรไฟล์" | สวิตช์เตือนลืมจดยังเปิดอยู่ |

- [ ] **Step 1: เขียนเทสต์ที่ fail**

ใน `public/liff/app.dom.test.mjs` เปลี่ยน `'/api/settings': { weeklySummary: false },` ใน `RESPONSES` เป็น:

```js
  '/api/settings': { weeklySummary: false, dailyReminder: false },
```

ใน `describe('index.html static invariants', ...)` ต่อจากเทสต์ `starts the notification section hidden and gives each switch a visible label` เพิ่ม:

```js
  it('puts the daily reminder switch in the notification section after the weekly one', () => {
    const box = doc.getElementById('notify-daily-reminder');
    const labels = [...doc.querySelectorAll('#notify-body label.notify-switch')];

    expect(box.getAttribute('role')).toBe('switch');
    expect(labels.map((label) => label.querySelector('input').id)).toEqual(['notify-weekly-summary', 'notify-daily-reminder']);
    expect(box.closest('label').textContent).toContain('เตือนถ้าวันนี้ยังไม่ได้จด');
  });
```

ใน `describe('LIFF notification settings', ...)` เพิ่มท้าย describe:

```js
  it('shows each switch from its own field', async () => {
    await boot({ overrides: { '/api/settings': { weeklySummary: true, dailyReminder: false } } });
    clickTab('profile');
    await settle();

    expect(byId('notify-weekly-summary').checked).toBe(true);
    expect(byId('notify-daily-reminder').checked).toBe(false);
  });

  it('saves the daily reminder switch without touching the weekly one', async () => {
    await boot();
    clickTab('profile');
    await settle();
    const calls = routeFetch((method, path) =>
      method === 'PATCH' && path === '/api/settings' ? { weeklySummary: false, dailyReminder: true } : undefined
    );
    const box = byId('notify-daily-reminder');

    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('PATCH /api/settings');
    expect(box.checked).toBe(true);
    expect(byId('notify-weekly-summary').checked).toBe(false);
    expect(byId('notify-status').textContent).toBe('บันทึกแล้ว');
  });
```

- [ ] **Step 2: รันเทสต์ให้เห็นว่า fail**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: FAIL เทสต์ใหม่ทั้งสามตัว (`notify-daily-reminder` เป็น null) ส่วนเทสต์เดิมยังผ่าน

- [ ] **Step 3: เพิ่มสวิตช์**

ใน `public/liff/index.html` ใน `<div id="notify-body" class="notify-body" hidden>` ต่อจาก `</label>` ของ `notify-weekly-summary` เพิ่ม:

```html
          <label class="notify-switch"><span class="notify-switch-text"><span>เตือนถ้าวันนี้ยังไม่ได้จด</span><small>ส่งข้อความเวลา
                21:00 ถ้าวันนั้นยังไม่ได้พิมพ์รายการ ส่งสลิป หรือหารบิล รายการประจำไม่นับ</small></span><input id="notify-daily-reminder"
              type="checkbox" role="switch"></label>
```

ใน `public/liff/app.mjs` ใน `createSettingsPanel({ ... })` เปลี่ยน:

```js
    switches: { weeklySummary: document.getElementById('notify-weekly-summary') },
```

เป็น:

```js
    switches: {
      weeklySummary: document.getElementById('notify-weekly-summary'),
      dailyReminder: document.getElementById('notify-daily-reminder'),
    },
```

- [ ] **Step 4: รันเทสต์ให้ผ่าน**

Run: `npx vitest run public/liff/app.dom.test.mjs public/liff/settings-panel.test.mjs public/liff/style.test.mjs`
Expected: PASS ทั้งสามไฟล์

Run: `node --check public/liff/app.mjs`
Expected: ไม่มี output

- [ ] **Step 5: Commit**

```bash
git add public/liff/index.html public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: show the daily reminder switch in the profile tab" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```

---

### Task 7: เอกสาร งาน cron และ STATE

**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 6

**Files:**
- Modify: `README.md` (ความสามารถ, mermaid, ตารางเส้นทาง, ขั้นตอนรัน SQL, ประโยค deploy, งาน cron-job.org, ความปลอดภัย, ข้อจำกัด)
- Modify: `SPEC.md` (ฟังก์ชันข้อ 3, ข้อใหม่ 12 ต่อจากข้อ 11, Database, Deploy, ลำดับการทำข้อ 16 ต่อจากข้อ 15)
- Modify: `docs/superpowers/plans/2026-10-18-roadmap-b.md` (บรรทัดสถานะ และตารางลำดับแถว 4-5)
- Modify: `work-memory/STATE.md`

**Interfaces:**
- Consumes: พฤติกรรมจาก Task 1-6

**LINE check (งาน cron):** *(ทำหลัง Browser check ของ Task 6 และหลังผู้ใช้เพิ่มงานใน cron-job.org ตาม Step 1)*
- Preconditions: รัน `022_daily_reminder.sql` แล้ว, deploy แล้ว, สวิตช์ "เตือนถ้าวันนี้ยังไม่ได้จด" ของบัญชีผู้ใช้เปิดอยู่, วันนี้ (เวลาไทย) ยังไม่ได้พิมพ์รายการ ส่งสลิป หรือสร้าง/ยืนยันบิล, มีค่า `CRON_SECRET` จากหน้า Environment ของ Render

| # | Action | Expected |
|---|---|---|
| 1 | ใน cron-job.org เปิดงาน `POST .../internal/notifications/daily-reminder` แล้วกดรันทดสอบ (หรือใน Git Bash รัน `curl -i -X POST -H "Authorization: Bearer <CRON_SECRET>" https://<URL ของ Render>/internal/notifications/daily-reminder`) | ได้ HTTP 200 body เช่น `{"eligible":1,"sent":1,"skipped":0,"failed":0,"pushFailed":0}` และในแชตได้ข้อความ `วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"` ไม่มีปุ่ม |
| 2 | รันซ้ำแบบข้อ 1 | ได้ 200 body `"sent":0,"skipped":1` และไม่มีข้อความที่สอง |
| 3 | วันถัดไป พิมพ์ `กินข้าว 60` ในแชตก่อน แล้วรันแบบข้อ 1 | ได้ 200 body `"eligible":0` และไม่มีข้อความเตือน |
| 4 | (ไม่บังคับ) ใน Supabase SQL Editor รัน `select * from users_to_remind((now() at time zone 'Asia/Bangkok')::date);` | ได้แถวของบัญชีที่เปิดสวิตช์และวันนี้ยังไม่ได้จดเอง (เทียบกับข้อ 1 และ 3) |
| 5 | (ไม่บังคับ) อีกวันหนึ่ง ไม่พิมพ์อะไร แต่สร้างบิลในแท็บหารบิล (หรือกดยืนยันบิลที่เพื่อนส่งมา) ก่อน แล้วรันแบบข้อ 1 | ได้ 200 body `"eligible":0` และไม่มีข้อความเตือน (บิลนับว่าจดแล้ว) |

- [ ] **Step 1: อัปเดต README**

- ส่วน ความสามารถ ต่อจาก bullet **สรุปรายสัปดาห์:** เพิ่ม:

```markdown
- **เตือนลืมจด:** เปิดสวิตช์ `เตือนถ้าวันนี้ยังไม่ได้จด` ในแท็บโปรไฟล์ (ค่าตั้งต้นปิด) แล้วถ้าถึง 21:00 วันนั้นยังไม่มีรายการที่พิมพ์ ส่งสลิป หรือสร้าง/ยืนยันบิลเอง (ตามเวลาที่บันทึก เวลาไทย รายการประจำไม่นับ) บอท push ข้อความเตือนสั้นๆ วันละไม่เกินครั้ง
```

- bullet โปรไฟล์ของเว็บ LIFF: เปลี่ยน `และส่วนการแจ้งเตือน (สวิตช์ส่งสรุปทุกวันอาทิตย์)` เป็น `และส่วนการแจ้งเตือน (สวิตช์ส่งสรุปทุกวันอาทิตย์ และเตือนถ้าวันนี้ยังไม่ได้จด)`
- mermaid: ต่อจากบรรทัด `Weekly --> Express` เพิ่ม:

```
  Cron -->|POST ทุกวัน 21:00| Daily["/internal/notifications/daily-reminder"]
  Daily --> Express
```

- ตารางเส้นทาง: ต่อจากแถว `POST /internal/notifications/weekly` เพิ่ม:

```markdown
| `POST /internal/notifications/daily-reminder` | ส่งข้อความเตือนให้ผู้ใช้ที่เปิดสวิตช์และวันนี้ยังไม่ได้จด (ต้องมี `Authorization: Bearer <CRON_SECRET>`) |
```

- ขั้นตอนรัน SQL: เปลี่ยน `` `002` ถึง `021` `` เป็น `` `002` ถึง `022` ``
- ประโยค deploy: เปลี่ยน `(ไฟล์ล่าสุดตอนนี้คือ `021_notification_settings.sql` ต้องรันก่อน push เพราะ` เป็น:

```
(ไฟล์ล่าสุดตอนนี้คือ `022_daily_reminder.sql` ต้องรันก่อน push เพราะงาน cron เตือนลืมจดเรียก function `users_to_remind` ถ้ายังไม่รัน งาน cron เตือนลืมจดจะตอบ 500 ส่วนอื่นยังใช้ได้; `021_notification_settings.sql` ก็ต้องรันก่อน เพราะ
```

- ขั้นตอน deploy ข้อ 4: เปลี่ยน `ตั้ง cron-job.org 3 งาน:` เป็น `ตั้ง cron-job.org 4 งาน:` และต่อจาก bullet `POST <URL>/internal/notifications/weekly ...` เพิ่ม:

```markdown
   - `POST <URL>/internal/notifications/daily-reminder` ทุกวัน 21:00 (ตั้งเขตเวลาของงานเป็น `Asia/Bangkok`) พร้อม header `Authorization: Bearer <CRON_SECRET>` แบบเดียวกับงานอื่น และเปิดแจ้งเตือนเมื่อล้มเหลว (ตอบ 500 เมื่อจองการส่งของใครไม่สำเร็จ ส่วน push ที่ LINE ปฏิเสธนับใน `pushFailed` และยังตอบ 200) รันซ้ำในวันเดียวกันไม่เตือนซ้ำ
```

- ความปลอดภัย: เปลี่ยน `` endpoint cron `/internal/recurring/run` และ `/internal/notifications/weekly` ป้องกันด้วย secret `` เป็น `` endpoint cron `/internal/recurring/run`, `/internal/notifications/weekly` และ `/internal/notifications/daily-reminder` ป้องกันด้วย secret ``
- ข้อจำกัด: เปลี่ยน `(รายการประจำ และสรุปรายสัปดาห์ของคนที่เปิดสวิตช์ สัปดาห์ละไม่เกิน 1 ข้อความต่อคน)` เป็น `(รายการประจำ, สรุปรายสัปดาห์ของคนที่เปิดสวิตช์ สัปดาห์ละไม่เกิน 1 ข้อความต่อคน และเตือนลืมจด วันละไม่เกิน 1 ข้อความต่อคน หรือราว 30 ข้อความต่อคนต่อเดือน)` ในบรรทัดถัดไปเปลี่ยน `- สรุปรายสัปดาห์ส่งทีละคน` เป็น `- สรุปรายสัปดาห์และเตือนลืมจดส่งทีละคน` และในบรรทัดเดียวกันเปลี่ยน `` log `Failed to push weekly summary` `` เป็น `` log `Failed to push weekly summary` / `Failed to push daily reminder` ``; ในบรรทัดที่ขึ้นต้นด้วย `- งาน cron สรุปรายสัปดาห์อ่านรายชื่อ` เปลี่ยน `งาน cron สรุปรายสัปดาห์อ่านรายชื่อ` เป็น `งาน cron สรุปรายสัปดาห์และเตือนลืมจดอ่านรายชื่อ` แล้วต่อจากบรรทัดนั้นเพิ่ม:

```markdown
- เตือนลืมจดใช้ push ได้ถึงราว 30 ข้อความต่อคนที่เปิดสวิตช์ต่อเดือน และใช้โควตาข้อความต่อเดือนของ LINE OA ก้อนเดียวกับการ์ดบิลหาร ข้อความรายการประจำ และสรุปรายสัปดาห์ ถ้าโควตาหมด LINE ตอบ 429 และการ์ดบิลหารจะไม่ถึงเพื่อนจนถึงเดือนถัดไป ก่อนเปิดใช้หลายคนให้ดูจำนวนข้อความต่อเดือนของแพ็กเกจใน LINE Official Account Manager
```

ตรวจทุกประโยคกับโค้ดจริงก่อน commit (`grep -n "021\|022\|daily-reminder\|pushFailed\|429" README.md`)

- [ ] **Step 2: อัปเดต SPEC**

- ฟังก์ชันข้อ 3: เปลี่ยน `ส่วนการแจ้งเตือน (สวิตช์ส่งสรุปทุกวันอาทิตย์)` เป็น `ส่วนการแจ้งเตือน (สวิตช์ส่งสรุปทุกวันอาทิตย์ และเตือนถ้าวันนี้ยังไม่ได้จด)`
- ต่อจากย่อหน้าฟังก์ชันข้อ 11 (ขึ้นต้นด้วย `11\. สรุปรายสัปดาห์:`) เพิ่มย่อหน้าใหม่ (เว้นบรรทัดว่างคั่น):

```markdown
12\. เตือนลืมจด: ผู้ใช้เปิดสวิตช์ "เตือนถ้าวันนี้ยังไม่ได้จด" ในแท็บโปรไฟล์ (ค่าตั้งต้นปิด; API settings คืนและรับ `dailyReminder` เพิ่มจาก `weeklySummary`) งาน cron `POST /internal/notifications/daily-reminder` ทุกวัน 21:00 หาคนที่ต้องเตือนด้วย SQL function `users_to_remind(p_day)` (`022_daily_reminder.sql`: เปิดสวิตช์ และไม่มี transactions ที่ source เป็น text, slip หรือ bill และ created_at อยู่ในวันนั้นตามเวลา Asia/Bangkok รายการประจำไม่นับ) จองแถวใน `notification_log` (kind `daily_reminder`, period = วันนั้น) ก่อน push ข้อความ `วันนี้ยังไม่ได้จดรายการเลย ใช้อะไรไปบ้าง พิมพ์มาได้เลย เช่น "กินข้าว 60"` ไม่มีปุ่ม ส่งทีละคน ความผิดพลาดของคนหนึ่งไม่หยุดคนอื่น จองไม่สำเร็จนับใน failed ส่วน push พังนับใน pushFailed (เก็บการจองไว้ ไม่ลองซ้ำ) ตอบ `{ eligible, sent, skipped, failed, pushFailed }` และ 500 เฉพาะเมื่อ failed > 0; ผู้ใช้ที่ unfollow ถูกปิดสวิตช์นี้ด้วย (ข้อ 11)
```

- Database: ต่อท้ายบรรทัด `\- notification\_log: ...` ด้วย `; function users\_to\_remind ใน `022_daily_reminder.sql` อ่าน users.daily\_reminder\_enabled กับ transactions.source/created\_at`
- Deploy: ต่อท้ายบรรทัดที่ขึ้นต้นด้วย `\- รายการประจำและแจ้งเตือน:` ด้วย ` สัญญาของเตือนลืมจดคือ `POST /internal/notifications/daily-reminder` header เดียวกัน ทุกวัน 21:00 (Asia/Bangkok) ตอบ JSON แบบเดียวกับสรุปรายสัปดาห์`; บรรทัด Push message เปลี่ยน `สรุปรายสัปดาห์ใช้ไม่เกิน 1 ครั้งต่อคนต่อสัปดาห์ เฉพาะคนที่เปิดสวิตช์)` เป็น `สรุปรายสัปดาห์ใช้ไม่เกิน 1 ครั้งต่อคนต่อสัปดาห์ เตือนลืมจดใช้ไม่เกิน 1 ครั้งต่อคนต่อวัน เฉพาะคนที่เปิดสวิตช์)`
- ส่วนลำดับการทำ ต่อจากข้อ 15 เพิ่ม (เว้นบรรทัดว่างคั่น):

```markdown
16\. เตือนลืมจด (roadmap ทิศทาง ข ข้อ 4: docs/superpowers/plans/2026-10-19-daily-reminder.md)
```

- [ ] **Step 3: อัปเดต roadmap และ STATE**

- `docs/superpowers/plans/2026-10-18-roadmap-b.md`: ในตารางลำดับ แถวลำดับ 4 เปลี่ยนสถานะเป็น `เสร็จบน branch รอ push`, แถวลำดับ 5 เป็น `ยังไม่เริ่ม (ถัดไป)` (ถ้าแถวลำดับ 3 ยังเขียนว่ารอ push แต่ STATE บอกว่า push แล้ว ให้แก้เป็น `เสร็จ push แล้ว`); ในบรรทัด **สถานะ** ด้านบน เปลี่ยน (ไม่ใช่ต่อท้าย) `ข้อ 4-6 ยังไม่เริ่ม` เป็น `ข้อ 4 เสร็จบน branch feat/daily-reminder รอผู้ใช้รัน `022_daily_reminder.sql` แล้ว push (แผน 2026-10-19-daily-reminder.md) ข้อ 5-6 ยังไม่เริ่ม` และถ้า STATE บอกว่าสรุปรายสัปดาห์ push แล้ว ให้เปลี่ยนประโยค `ข้อ 3 เสร็จบน branch feat/weekly-summary รอผู้ใช้รัน ... แล้ว push (แผน 2026-10-19-weekly-summary.md)` เป็น `ข้อ 3 เสร็จและ push แล้ว`; เปลี่ยน `(อัปเดต ...)` เป็นวันที่ทำ
- `work-memory/STATE.md` ส่วน Next: แทนที่ (ไม่เพิ่มบรรทัดใหม่) บรรทัด Next ของแผนชุดนี้ที่แผน weekly-summary เขียนไว้ (ขึ้นต้นด้วย `` - [ ] `next` สรุปรายสัปดาห์ ``) ด้วย `` - [ ] `next` เตือนลืมจด (แผน docs/superpowers/plans/2026-10-19-daily-reminder.md) Task 1-7 เสร็จบน branch feat/daily-reminder ยังไม่ merge/push: รัน `supabase/022_daily_reminder.sql` ก่อน push, เพิ่มงาน cron-job.org daily-reminder ทุกวัน 21:00 Asia/Bangkok, Browser check Task 6, LINE check Task 7; ถัดไป ออม แล้วกระเป๋า (แผน 2026-10-19-{savings-goals,wallets}.md) `` ถ้าบรรทัดสรุปรายสัปดาห์ยังมีงานค้าง (Browser check Task 8 / LINE check Task 10 ของแผน weekly ยังไม่ทำ) ให้ต่อท้ายบรรทัดใหม่ด้วย `; สรุปรายสัปดาห์ยังค้าง Browser check Task 8 และ LINE check Task 10` แทนการเก็บสองบรรทัด ถ้าไม่พบบรรทัดนั้น ให้แทนที่บรรทัด Next ที่พูดถึงแผนเหล่านี้ ห้ามมีสองบรรทัดที่พูดถึงแผนเดียวกัน; ส่วน Done ไม่เพิ่ม (ยังไม่ push) แล้วตรวจว่าทั้งไฟล์ไม่เกินราว 60 บรรทัดด้วย `wc -l work-memory/STATE.md`

- [ ] **Step 4: ตรวจทั้งหมดแล้ว commit**

Run: `npm test`, `npm run lint`, `node --check index.js`, `node --check public/liff/app.mjs`
Expected: ผ่านทั้งหมด (ถ้า `scripts/try-parse.test.js` timeout ตอนรันพร้อมกัน ให้รันเดี่ยวด้วย `npx vitest run scripts/try-parse.test.js` ก่อนสรุปว่าพัง)

```bash
git add README.md SPEC.md docs/superpowers/plans/2026-10-18-roadmap-b.md work-memory/STATE.md
git commit -m "docs: describe the daily reminder and its cron job" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01LtK8uZvstjmG8HjLn6PaeC"
```
