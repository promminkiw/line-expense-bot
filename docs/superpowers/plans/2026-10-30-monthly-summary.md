# Monthly Summary Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทุกวันที่ 1 เวลา 08:00 (เวลาไทย) บอท push การ์ดสรุปเดือนที่เพิ่งจบให้ผู้ใช้ทุกคนที่ยังไม่ unfollow หน้าตาแบบ "A + เฮียว่า" (https://claude.ai/artifact/8trSPoxjf5o79wUYihrnob) ข้อความเฮียเป็นข้อความสำเร็จรูปตามเงื่อนไข เดือนที่ไม่มีรายการส่งข้อความชวนกลับมาจด และปุ่ม "เปิดหน้าสรุป" เปิดแท็บสรุปของเดือนที่การ์ดสรุป

**Architecture:** ใช้โครงเดียวกับสรุปรายสัปดาห์ (`src/notifications/weekly.js`): cron-job.org เรียก `POST /internal/notifications/monthly` runner วนทีละคน รวมยอดด้วย `summarizeTransactions` จองใน `notification_log` ก่อน push แล้วส่งการ์ดจาก `buildSummaryFlex` ที่มีกล่อง "เฮียว่า" อยู่แล้ว ข้อความเฮียมาจาก pure function ไม่เรียก Claude ไม่มีสวิตช์ในหน้าเว็บ แต่มีคอลัมน์ซ่อน `users.monthly_summary_enabled` (ค่าตั้งต้น true) ที่ unfollow ตั้งเป็น false และ follow ตั้งกลับเป็น true

**Tech Stack:** Node 24, Express 5, CommonJS, Supabase (Postgres), vitest, PGlite (เทสต์ SQL), LIFF ES modules + jsdom

## Global Constraints

- ส่งวันที่ 1 เวลา 08:00 Asia/Bangkok สรุปเดือนก่อนหน้าทั้งเดือน (วันที่ 1 ถึงวันสุดท้าย)
- ไม่มีสวิตช์ในหน้าเว็บ ส่งทุกคนที่ `monthly_summary_enabled = true`; unfollow ตั้ง false, follow ตั้ง true
- ข้อความเฮียเป็นข้อความสำเร็จรูป ห้ามเรียก Claude
- เดือนที่ `entryCount === 0` ส่งข้อความ text ชวนกลับมาจดแทนการ์ด
- จองใน `notification_log` (kind `monthly_summary`, period = วันที่ 1 ของเดือนที่สรุป เช่น `2026-10-01`) ก่อน push เสมอ push ที่พังไม่ลองซ้ำ
- ไม่ log ยอดเงินหรือ err ทั้งก้อน log แค่ `userId` และ `reason`
- คอมเมนต์ในโค้ด: ภาษาไทย บรรทัดเดียว อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปรและ log เป็นภาษาอังกฤษ; ห้าม emoji
- commit message ภาษาอังกฤษแบบ conventional ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; ห้าม push โดยไม่ได้รับอนุญาต
- ไฟล์ `.sql` ใหม่ต้องให้ผู้ใช้รันเองใน Supabase ก่อน push โค้ดที่ใช้มัน

## ข้อความสำเร็จรูป (ผู้ใช้อนุมัติแล้ว 2026-10-30)

`{M}` = ชื่อเดือนเต็มของเดือนที่สรุป (เช่น `ตุลาคม`), `{X}` = จำนวนเงินจาก `formatAmount`, `{cat}`/`{p}` = หมวดที่จ่ายมากสุดและสัดส่วนของรายจ่าย (ปัดเป็นจำนวนเต็มเหมือนในการ์ด), `{r}` = net / รายรับ เป็น % ปัดลง เลือกข้อแรกที่ตรง:

| # | เงื่อนไข | ข้อความ |
|---|---|---|
| 1 | รายรับ = 0 | `เดือน{M}ยังไม่มีรายรับเลย ถ้ามีเงินเข้าอย่าลืมจดด้วยนะ ยอดคงเหลือจะได้ตรง` |
| 2 | net < 0 | `เดือน{M}จ่ายเกินรับไป {X} บาท ตัวหนักสุดคือ{cat} ({p}%) เดือนหน้าลองคุมหมวดนี้ดูนะ` |
| 3 | รายจ่าย = 0 | `เดือน{M}ไม่มีรายจ่ายเลย เก็บได้เต็มๆ {X} บาท` |
| 4 | หมวดที่จ่ายมากสุด ≥ 40% | `เก็บได้ {X} บาท แต่{cat}กินไป {p}% ของรายจ่ายทั้งเดือน ลองตั้งงบหมวดนี้ดูไหม` |
| 5 | {r} ≥ 20 | `เก็บได้ {X} บาท ({r}% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ` |
| 6 | อื่นๆ | `เก็บได้ {X} บาท ({r}% ของรายรับ) เดือนหน้าลองเก็บให้ถึง 20% ดูนะ` |

เดือนที่ไม่มีรายการ (text ธรรมดา): `เดือน{M}ยังไม่ได้จดรายการเลยนะ เดือน{N}เริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย` (`{N}` = ชื่อเดือนที่เพิ่งเริ่ม)

## File Structure

```
supabase/026_monthly_summary.sql          ใหม่: kind monthly_summary ใน check ของ notification_log + users.monthly_summary_enabled
src/summary/period.js                     เพิ่ม getPreviousMonthRange(now)
src/notifications/monthly-comment.js      ใหม่: pickMonthlyComment(summary, monthName), buildEmptyMonthText(range)
src/db/domains/notifications.js           เพิ่ม listMonthlySummaryUsers(), resumeMonthlySummary(lineUserId); disableNotifications ปิด monthly ด้วย
src/chat/bot.js                           follow เรียก resumeMonthlySummary
src/notifications/monthly.js              ใหม่: createMonthlySummaryRunner, MONTHLY_SUMMARY_KIND
src/chat/urls.js + public/liff/app.mjs    ปุ่มเปิดหน้าสรุปพาไปเดือนที่สรุป
src/notifications/router.js + index.js    mount /notifications/monthly
README.md, SPEC.md, supabase/README.md, supabase/schema.sql:1, work-memory/STATE.md   เอกสาร
```

## ลำดับ

Task 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 ทำทีละ task ใน checkout เดียว ห้ามทำขนาน (รันเทสต์สองชุดพร้อมกัน RAM ไม่พอ ดู `vitest.config.mjs`)

---

### Task 1: SQL ของสรุปรายเดือน

**Depends on:** none

**Files:**
- Create: `supabase/026_monthly_summary.sql`
- Modify: `supabase/schema.sql:1` (คอมเมนต์รายการไฟล์ เติม `025_wallet_name_case.sql` และ `026_monthly_summary.sql`)
- Modify: `supabase/README.md` (บรรทัดลำดับ `002` ถึง `025` -> `026` และแถวตาราง 026 ต่อจากแถว 025 ที่บรรทัด 31)
- Test: `src/db/sql-functions.test.js` (เพิ่มไฟล์ใน `MIGRATIONS` และ describe ใหม่ท้ายไฟล์)

**Interfaces:**
- Produces: `notification_log.kind` รับ `'monthly_summary'`; `users.monthly_summary_enabled boolean not null default true`

- [ ] **Step 1: Write the failing test**

ใน `src/db/sql-functions.test.js` เติม `'026_monthly_summary.sql',` ต่อท้าย `MIGRATIONS` (หลัง `'025_wallet_name_case.sql',`) แล้วต่อท้ายไฟล์:

```js
describe('026_monthly_summary.sql', () => {
  it('accepts the monthly summary kind next to the existing kinds', async () => {
    const user = await createUser('U1');

    for (const kind of ['weekly_summary', 'daily_reminder', 'monthly_summary']) {
      expect(await rows('insert into notification_log (user_id, kind, period) values ($1, $2, $3) returning kind', [user, kind, '2026-10-01'])).toEqual([{ kind }]);
    }
  });

  it('still refuses an unknown kind', async () => {
    const user = await createUser('U1');

    await expect(db.query("insert into notification_log (user_id, kind, period) values ($1, 'monthly', '2026-10-01')", [user])).rejects.toThrow('check constraint');
  });

  it('sends the monthly summary to every user by default and refuses null', async () => {
    const user = await createUser('U1');

    expect(await one('select monthly_summary_enabled from users where id = $1', [user])).toEqual({ monthly_summary_enabled: true });
    await db.exec('savepoint null_monthly');
    await expect(db.query('update users set monthly_summary_enabled = null where id = $1', [user])).rejects.toThrow('monthly_summary_enabled');
    await db.exec('rollback to savepoint null_monthly');
  });

  it('can run again without failing', async () => {
    await expect(db.exec(readMigration('026_monthly_summary.sql'))).resolves.toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL ตอน `beforeAll` เพราะอ่าน `026_monthly_summary.sql` ไม่เจอ (ENOENT)

- [ ] **Step 3: Write the migration**

`supabase/026_monthly_summary.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 025 ก่อน push โค้ดสรุปรายเดือน รันซ้ำได้

-- สรุปรายเดือนจองใน notification_log เหมือนสรุปรายสัปดาห์ จึงต้องเพิ่ม kind ใน check เดิม
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log
  add constraint notification_log_kind_check check (kind in ('weekly_summary', 'daily_reminder', 'monthly_summary'));

-- ไม่มีสวิตช์ในหน้าเว็บ คอลัมน์นี้มีไว้หยุดส่งให้คนที่ unfollow ไม่ให้เสียโควตา push
alter table public.users add column if not exists monthly_summary_enabled boolean not null default true;
```

แก้คอมเมนต์บรรทัด 1 ของ `supabase/schema.sql` ให้รายการไฟล์ลงท้าย `..., 023_savings_goals.sql, 024_wallets.sql, 025_wallet_name_case.sql และ 026_monthly_summary.sql ต่อตามลำดับ (ไม่มี 016 เพราะถูกถอยออก)`

ใน `supabase/README.md` แก้ `002` ถึง `025` เป็น `002` ถึง `026` และต่อแถวหลังแถว `025_wallet_name_case.sql`:

```
| `026_monthly_summary.sql` | สรุปรายเดือน: จองใน notification_log และคอลัมน์ users.monthly_summary_enabled (ค่าตั้งต้นเปิด unfollow ปิด) | ก่อน push โค้ดสรุปรายเดือน | รันต่อจาก 025 รันซ้ำได้ |
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งไฟล์ รวมเทสต์เดิมของ `021_notification_settings.sql`

- [ ] **Step 5: Commit**

```bash
git add supabase/026_monthly_summary.sql supabase/schema.sql supabase/README.md src/db/sql-functions.test.js
git commit -m "feat(db): add the monthly summary log kind and a per-user send flag"
```

---

### Task 2: ช่วงของเดือนก่อนหน้า

**Depends on:** none

**Files:**
- Modify: `src/summary/period.js`
- Test: `src/summary/period.test.js`

**Interfaces:**
- Produces: `getPreviousMonthRange(now: Date) -> { from: 'YYYY-MM-01', to: 'YYYY-MM-DD' (วันสุดท้าย), month: 'YYYY-MM', monthName: 'ตุลาคม', nextMonthName: 'พฤศจิกายน', label: 'เดือนตุลาคม 2569' }` ใช้วันที่ตามเวลาไทย

- [ ] **Step 1: Write the failing test**

ต่อท้าย `src/summary/period.test.js` (เพิ่ม `getPreviousMonthRange` ใน import บรรทัดบน):

```js
describe('getPreviousMonthRange', () => {
  it('covers the whole month that just ended in Bangkok time', () => {
    // 2026-11-01 08:00 เวลาไทย
    expect(getPreviousMonthRange(new Date('2026-11-01T01:00:00Z'))).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
      month: '2026-10',
      monthName: 'ตุลาคม',
      nextMonthName: 'พฤศจิกายน',
      label: 'เดือนตุลาคม 2569',
    });
  });

  it('uses the Bangkok date, not UTC, right after midnight', () => {
    // 2026-10-31 17:30 UTC คือ 2026-11-01 00:30 เวลาไทย
    expect(getPreviousMonthRange(new Date('2026-10-31T17:30:00Z')).month).toBe('2026-10');
  });

  it('crosses the year and handles February', () => {
    expect(getPreviousMonthRange(new Date('2027-01-01T01:00:00Z'))).toMatchObject({ from: '2026-12-01', to: '2026-12-31', label: 'เดือนธันวาคม 2569', nextMonthName: 'มกราคม' });
    expect(getPreviousMonthRange(new Date('2028-03-01T01:00:00Z'))).toMatchObject({ from: '2028-02-01', to: '2028-02-29' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/summary/period.test.js`
Expected: FAIL `getPreviousMonthRange is not a function`

- [ ] **Step 3: Implement**

ใน `src/summary/period.js` เพิ่มก่อน `module.exports` แล้วแทน `module.exports`:

```js
const THAI_MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

function getPreviousMonthRange(now) {
  const firstOfThisMonth = `${toBangkokDateString(now).slice(0, 8)}01`;
  const to = addDays(firstOfThisMonth, -1);
  const [year, month] = to.split('-').map(Number);
  return {
    from: `${to.slice(0, 8)}01`,
    to,
    month: to.slice(0, 7),
    monthName: THAI_MONTH_NAMES[month - 1],
    nextMonthName: THAI_MONTH_NAMES[month % 12],
    label: `เดือน${THAI_MONTH_NAMES[month - 1]} ${year + 543}`,
  };
}

module.exports = { getPeriodRange, getPreviousMonthRange };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/summary/period.test.js`
Expected: PASS รวมเทสต์เดิมของ `getPeriodRange`

- [ ] **Step 5: Commit**

```bash
git add src/summary/period.js src/summary/period.test.js
git commit -m "feat(summary): add the previous month range in Bangkok time"
```

---

### Task 3: ข้อความเฮียสำเร็จรูปและข้อความเดือนว่าง

**Depends on:** Task 2

**Files:**
- Create: `src/notifications/monthly-comment.js`
- Test: `src/notifications/monthly-comment.test.js`

**Interfaces:**
- Consumes: summary จาก `buildSummary` (`incomeTotal`, `expenseTotal`, `net`, `topExpenses[{category,total}]`); range จาก Task 2
- Produces: `pickMonthlyComment(summary, monthName) -> string`, `buildEmptyMonthText({ monthName, nextMonthName }) -> string`

- [ ] **Step 1: Write the failing test**

`src/notifications/monthly-comment.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pickMonthlyComment, buildEmptyMonthText } from './monthly-comment.js';

function summary({ income, expense, top = [] }) {
  return { incomeTotal: income, expenseTotal: expense, net: income - expense, topExpenses: top, otherExpenseTotal: 0 };
}

describe('pickMonthlyComment', () => {
  it('asks for income when the month has none', () => {
    expect(pickMonthlyComment(summary({ income: 0, expense: 500, top: [{ category: 'อาหาร', total: 500 }] }), 'ตุลาคม')).toBe(
      'เดือนตุลาคมยังไม่มีรายรับเลย ถ้ามีเงินเข้าอย่าลืมจดด้วยนะ ยอดคงเหลือจะได้ตรง',
    );
  });

  it('names the biggest category when spending beat income', () => {
    const value = summary({ income: 10000, expense: 12000, top: [{ category: 'ช้อปปิ้ง', total: 6000 }, { category: 'อาหาร', total: 6000 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เดือนตุลาคมจ่ายเกินรับไป 2,000 บาท ตัวหนักสุดคือช้อปปิ้ง (50%) เดือนหน้าลองคุมหมวดนี้ดูนะ');
  });

  it('praises a month with no spending', () => {
    expect(pickMonthlyComment(summary({ income: 25000, expense: 0 }), 'ตุลาคม')).toBe('เดือนตุลาคมไม่มีรายจ่ายเลย เก็บได้เต็มๆ 25,000 บาท');
  });

  it('suggests a budget when one category takes 40% or more', () => {
    const value = summary({ income: 25000, expense: 10000, top: [{ category: 'อาหาร', total: 4000 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 15,000 บาท แต่อาหารกินไป 40% ของรายจ่ายทั้งเดือน ลองตั้งงบหมวดนี้ดูไหม');
  });

  it('praises saving 20% or more of income', () => {
    const value = summary({ income: 25000, expense: 18460, top: [{ category: 'อาหาร', total: 6200 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 6,540 บาท (26% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ');
  });

  it('nudges toward 20% otherwise, rounding the rate down', () => {
    const value = summary({ income: 25000, expense: 20100, top: [{ category: 'อาหาร', total: 6200 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 4,900 บาท (19% ของรายรับ) เดือนหน้าลองเก็บให้ถึง 20% ดูนะ');
  });

  // 0.57 * 100 ใน JavaScript ได้ 56.99... ถ้าหารก่อนคูณจะปัดลงเหลือ 56
  it('does not lose a percent to floating point', () => {
    const value = summary({ income: 100, expense: 43, top: [{ category: 'อาหาร', total: 15 }, { category: 'เดินทาง', total: 14 }, { category: 'ช้อปปิ้ง', total: 14 }] });

    expect(pickMonthlyComment(value, 'ตุลาคม')).toBe('เก็บได้ 57 บาท (57% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ');
  });
});

describe('buildEmptyMonthText', () => {
  it('invites the user back for the new month', () => {
    expect(buildEmptyMonthText({ monthName: 'ตุลาคม', nextMonthName: 'พฤศจิกายน' })).toBe(
      'เดือนตุลาคมยังไม่ได้จดรายการเลยนะ เดือนพฤศจิกายนเริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย',
    );
  });
});
```


- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifications/monthly-comment.test.js`
Expected: FAIL `Cannot find module './monthly-comment.js'`

- [ ] **Step 3: Implement**

`src/notifications/monthly-comment.js`:

```js
const { formatAmount } = require('../parser/format-reply');

const TOP_SHARE_WARNING = 40;
const GOOD_SAVING_RATE = 20;

// ไม่เรียก Claude เพื่อไม่เสียค่าใช้จ่ายและให้ทัน timeout 30 วินาทีของ cron-job.org
function pickMonthlyComment(summary, monthName) {
  const top = summary.topExpenses[0];
  const topShare = top && summary.expenseTotal > 0 ? Math.round((top.total / summary.expenseTotal) * 100) : 0;
  if (summary.incomeTotal === 0) {
    return `เดือน${monthName}ยังไม่มีรายรับเลย ถ้ามีเงินเข้าอย่าลืมจดด้วยนะ ยอดคงเหลือจะได้ตรง`;
  }
  if (summary.net < 0) {
    return `เดือน${monthName}จ่ายเกินรับไป ${formatAmount(-summary.net)} บาท ตัวหนักสุดคือ${top.category} (${topShare}%) เดือนหน้าลองคุมหมวดนี้ดูนะ`;
  }
  if (summary.expenseTotal === 0) {
    return `เดือน${monthName}ไม่มีรายจ่ายเลย เก็บได้เต็มๆ ${formatAmount(summary.net)} บาท`;
  }
  const saved = formatAmount(summary.net);
  if (topShare >= TOP_SHARE_WARNING) {
    return `เก็บได้ ${saved} บาท แต่${top.category}กินไป ${topShare}% ของรายจ่ายทั้งเดือน ลองตั้งงบหมวดนี้ดูไหม`;
  }
  // คูณก่อนหาร ไม่งั้นทศนิยมของ JavaScript ทำให้ปัดลงหาย 1%
  const rate = Math.floor((summary.net * 100) / summary.incomeTotal);
  if (rate >= GOOD_SAVING_RATE) {
    return `เก็บได้ ${saved} บาท (${rate}% ของรายรับ) เยี่ยมเลย ทำแบบนี้ต่อไปนะ`;
  }
  return `เก็บได้ ${saved} บาท (${rate}% ของรายรับ) เดือนหน้าลองเก็บให้ถึง ${GOOD_SAVING_RATE}% ดูนะ`;
}

function buildEmptyMonthText({ monthName, nextMonthName }) {
  return `เดือน${monthName}ยังไม่ได้จดรายการเลยนะ เดือน${nextMonthName}เริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย`;
}

module.exports = { pickMonthlyComment, buildEmptyMonthText };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifications/monthly-comment.test.js`
Expected: PASS 8 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/notifications/monthly-comment.js src/notifications/monthly-comment.test.js
git commit -m "feat(notifications): add canned monthly comments and the empty-month text"
```

---

### Task 4: repository และ follow/unfollow

**Depends on:** Task 1

**Files:**
- Modify: `src/db/domains/notifications.js`
- Test: `src/db/domains/notifications.test.js`
- Modify: `src/db/repository-surface.test.js` (เพิ่ม 2 ชื่อ และ `toHaveLength(75)` -> `toHaveLength(77)` ที่บรรทัด 24)
- Modify: `src/chat/bot.js:74-77` (follow)
- Test: `src/chat/bot.test.js` (fake repository บรรทัด ~136 และ describe `bot follow event` บรรทัด ~629)

**Interfaces:**
- Produces: `repository.listMonthlySummaryUsers() -> Promise<[{ userId, lineUserId }]>` (เฉพาะ `monthly_summary_enabled = true` เรียงตาม id); `repository.resumeMonthlySummary(lineUserId) -> Promise<void>`; `disableNotifications` ปิด `monthly_summary_enabled` ด้วย

- [ ] **Step 1: Write the failing tests**

`src/db/domains/notifications.test.js`: ใน describe `repository.disableNotifications` แก้ expectation ของ `update` เป็น

```js
      ['update', { weekly_summary_enabled: false, daily_reminder_enabled: false, monthly_summary_enabled: false }],
```

และเปลี่ยนชื่อเทสต์เป็น `'turns off every notification of that LINE user'` แล้วต่อจาก describe ของ `listWeeklySummaryUsers`:

```js
describe('repository.listMonthlySummaryUsers', () => {
  it('lists users who still follow the bot ordered by id', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ id: 'user-1', line_user_id: 'U1' }], error: null });

    expect(await createNotificationsRepository(supabase).listMonthlySummaryUsers()).toEqual([{ userId: 'user-1', lineUserId: 'U1' }]);
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id, line_user_id'],
      ['eq', 'monthly_summary_enabled', true],
      ['order', 'id'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createNotificationsRepository(supabase).listMonthlySummaryUsers()).rejects.toThrow('Database listMonthlySummaryUsers failed: boom');
  });
});

describe('repository.resumeMonthlySummary', () => {
  it('turns the monthly summary back on for that LINE user', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await expect(createNotificationsRepository(supabase).resumeMonthlySummary('U1')).resolves.toBeUndefined();
    expect(calls).toEqual([
      ['from', 'users'],
      ['update', { monthly_summary_enabled: true }],
      ['eq', 'line_user_id', 'U1'],
    ]);
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    await expect(createNotificationsRepository(supabase).resumeMonthlySummary('U1')).rejects.toThrow('Database resumeMonthlySummary failed: boom');
  });
});
```

`src/db/repository-surface.test.js`: เติม `'listMonthlySummaryUsers', 'resumeMonthlySummary',` ที่ไหนก็ได้ในรายการ (เทสต์ sort ก่อนเทียบ) และแก้ `toHaveLength(75)` เป็น `toHaveLength(77)`

`src/chat/bot.test.js`: ใน fake repository ที่บรรทัด ~136 เติม `resumeMonthlySummary: vi.fn().mockResolvedValue(),` ต่อจาก `disableNotifications` และใน describe `bot follow event` เทสต์แรก เติมหลัง `expect(deps.users.ensureUser)...`:

```js
    expect(deps.repository.resumeMonthlySummary).toHaveBeenCalledWith('U1');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/domains/notifications.test.js src/db/repository-surface.test.js src/chat/bot.test.js`
Expected: FAIL (`listMonthlySummaryUsers is not a function`, `resumeMonthlySummary` ไม่ถูกเรียก, update ไม่มี `monthly_summary_enabled`, surface ยาวไม่ตรง)

- [ ] **Step 3: Implement**

`src/db/domains/notifications.js`:
- ใน `disableNotifications` แก้ `.update(...)` เป็น `.update({ weekly_summary_enabled: false, daily_reminder_enabled: false, monthly_summary_enabled: false })`
- เพิ่มต่อจาก `listWeeklySummaryUsers` และเติมทั้งสองชื่อใน object ที่ return:

```js
  // สรุปรายเดือนไม่มีสวิตช์ในหน้าเว็บ คอลัมน์นี้ปิดเฉพาะตอน unfollow
  async function listMonthlySummaryUsers() {
    const { data, error } = await supabase.from('users').select('id, line_user_id').eq('monthly_summary_enabled', true).order('id');
    throwIfError('listMonthlySummaryUsers', error);
    return data.map((row) => ({ userId: row.id, lineUserId: row.line_user_id }));
  }

  // กลับมา follow แล้วส่งสรุปรายเดือนต่อได้เอง เพราะผู้ใช้ไม่มีสวิตช์ให้เปิด
  async function resumeMonthlySummary(lineUserId) {
    const { error } = await supabase.from('users').update({ monthly_summary_enabled: true }).eq('line_user_id', lineUserId);
    throwIfError('resumeMonthlySummary', error);
  }
```

`src/chat/bot.js` ในกิ่ง `event.type === 'follow'` แทน

```js
      await users.ensureUser(lineUserId);
      return null;
```

ด้วย

```js
      await users.ensureUser(lineUserId);
      await repository.resumeMonthlySummary(lineUserId);
      return null;
```

(`src/db/repository.js` ประกอบ repository ด้วยการ spread domain อยู่แล้ว ไม่ต้องแก้)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/domains/notifications.test.js src/db/repository-surface.test.js src/db/repository.test.js src/chat/bot.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/domains/notifications.js src/db/domains/notifications.test.js src/db/repository-surface.test.js src/chat/bot.js src/chat/bot.test.js
git commit -m "feat(db): track who still receives the monthly summary across follow and unfollow"
```

---

### Task 5: runner สรุปรายเดือน

**Depends on:** Task 2, Task 3, Task 4

**Files:**
- Create: `src/notifications/monthly.js`
- Test: `src/notifications/monthly.test.js`

**Interfaces:**
- Consumes: `getPreviousMonthRange`, `pickMonthlyComment`, `buildEmptyMonthText`, `repository.listMonthlySummaryUsers/summarizeTransactions/reserveNotification`, `buildSummary`, `buildSummaryFlex`
- Produces: `createMonthlySummaryRunner({ repository, pushFlex, pushText, buildSummaryUrl, now, logger }) -> run(): Promise<{ eligible, sent, nudged, skipped, failed, pushFailed }>`; `MONTHLY_SUMMARY_KIND = 'monthly_summary'`. `buildSummaryUrl(month)` คืน URL ของปุ่มหรือ `undefined`

- [ ] **Step 1: Write the failing test**

`src/notifications/monthly.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createMonthlySummaryRunner, MONTHLY_SUMMARY_KIND } from './monthly.js';
import { buildSummary } from '../summary/summary.js';
import { buildSummaryFlex } from '../summary/flex.js';
import { pickMonthlyComment } from './monthly-comment.js';

// 2026-11-01 08:00 เวลาไทย สรุปเดือนตุลาคม
const NOW = new Date('2026-11-01T01:00:00Z');
const LABEL = 'เดือนตุลาคม 2569';
const SUMMARY_URL = 'https://liff.line.me/liff-1?tab=summary&m=2026-10';
const ROWS = [
  { type: 'expense', category: 'อาหาร', total: 6200, entryCount: 30 },
  { type: 'expense', category: 'เดินทาง', total: 3100, entryCount: 10 },
  { type: 'income', category: 'เงินเดือน', total: 25000, entryCount: 1 },
];

function setup({ users = [{ userId: 'user-1', lineUserId: 'U1' }], rows = ROWS } = {}) {
  const repository = {
    listMonthlySummaryUsers: vi.fn().mockResolvedValue(users),
    summarizeTransactions: vi.fn().mockResolvedValue(rows),
    reserveNotification: vi.fn().mockResolvedValue(true),
  };
  const pushFlex = vi.fn().mockResolvedValue();
  const pushText = vi.fn().mockResolvedValue();
  const buildSummaryUrl = vi.fn(() => SUMMARY_URL);
  const logger = { error: vi.fn() };
  const run = createMonthlySummaryRunner({ repository, pushFlex, pushText, buildSummaryUrl, now: () => NOW, logger });
  return { repository, pushFlex, pushText, buildSummaryUrl, logger, run };
}

describe('createMonthlySummaryRunner', () => {
  it('pushes last month with the canned comment after reserving the month', async () => {
    const { repository, pushFlex, pushText, buildSummaryUrl, run } = setup();

    const result = await run();

    const summary = buildSummary(ROWS, LABEL);
    expect(repository.summarizeTransactions).toHaveBeenCalledWith('user-1', '2026-10-01', '2026-10-31');
    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: MONTHLY_SUMMARY_KIND, period: '2026-10-01' });
    expect(buildSummaryUrl).toHaveBeenCalledWith('2026-10');
    expect(pushFlex).toHaveBeenCalledWith('U1', buildSummaryFlex(summary, pickMonthlyComment(summary, 'ตุลาคม'), { summaryUrl: SUMMARY_URL }));
    const flex = pushFlex.mock.calls[0][1];
    expect(flex.altText).toBe('สรุปเดือนตุลาคม 2569: รายรับ 25,000 บาท รายจ่าย 9,300 บาท');
    expect(JSON.stringify(flex)).toContain('เฮียว่า');
    expect(repository.reserveNotification.mock.invocationCallOrder[0]).toBeLessThan(pushFlex.mock.invocationCallOrder[0]);
    expect(pushText).not.toHaveBeenCalled();
    expect(result).toEqual({ eligible: 1, sent: 1, nudged: 0, skipped: 0, failed: 0, pushFailed: 0 });
  });

  it('sends the comeback text instead of a card for a month without entries', async () => {
    const { pushFlex, pushText, repository, run } = setup({ rows: [] });

    const result = await run();

    expect(repository.reserveNotification).toHaveBeenCalledWith({ userId: 'user-1', kind: MONTHLY_SUMMARY_KIND, period: '2026-10-01' });
    expect(pushText).toHaveBeenCalledWith('U1', 'เดือนตุลาคมยังไม่ได้จดรายการเลยนะ เดือนพฤศจิกายนเริ่มใหม่กัน พิมพ์ เช่น "กาแฟ 60" ส่งมาได้เลย');
    expect(pushFlex).not.toHaveBeenCalled();
    expect(result).toEqual({ eligible: 1, sent: 0, nudged: 1, skipped: 0, failed: 0, pushFailed: 0 });
  });

  it('skips a user whose month was already reserved', async () => {
    const { repository, pushFlex, run } = setup();
    repository.reserveNotification.mockResolvedValue(false);

    expect(await run()).toEqual({ eligible: 1, sent: 0, nudged: 0, skipped: 1, failed: 0, pushFailed: 0 });
    expect(pushFlex).not.toHaveBeenCalled();
  });

  it('keeps going after one user fails to load and logs no amounts', async () => {
    const { repository, pushFlex, logger, run } = setup({ users: [{ userId: 'user-1', lineUserId: 'U1' }, { userId: 'user-2', lineUserId: 'U2' }] });
    repository.summarizeTransactions.mockRejectedValueOnce(new Error('db down'));

    const result = await run();

    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(pushFlex.mock.calls[0][0]).toBe('U2');
    expect(logger.error).toHaveBeenCalledWith('Failed to prepare monthly summary', { userId: 'user-1', reason: 'db down' });
    expect(result).toEqual({ eligible: 2, sent: 1, nudged: 0, skipped: 0, failed: 1, pushFailed: 0 });
  });

  it('counts a failed push separately and does not retry it', async () => {
    const { pushFlex, logger, run } = setup();
    pushFlex.mockRejectedValue(new Error('blocked'));

    const result = await run();

    expect(pushFlex).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to push monthly summary', { userId: 'user-1', reason: 'blocked' });
    expect(result).toEqual({ eligible: 1, sent: 0, nudged: 0, skipped: 0, failed: 0, pushFailed: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifications/monthly.test.js`
Expected: FAIL `Cannot find module './monthly.js'`

- [ ] **Step 3: Implement**

`src/notifications/monthly.js`:

```js
const { getPreviousMonthRange } = require('../summary/period');
const { buildSummary } = require('../summary/summary');
const { buildSummaryFlex } = require('../summary/flex');
const { pickMonthlyComment, buildEmptyMonthText } = require('./monthly-comment');

const MONTHLY_SUMMARY_KIND = 'monthly_summary';

function createMonthlySummaryRunner({ repository, pushFlex, pushText, buildSummaryUrl, now = () => new Date(), logger = console }) {
  return async function run() {
    const range = getPreviousMonthRange(now());
    const users = await repository.listMonthlySummaryUsers();
    const result = { eligible: users.length, sent: 0, nudged: 0, skipped: 0, failed: 0, pushFailed: 0 };
    // ส่งทีละคน ความผิดพลาดของคนหนึ่งไม่หยุดคนอื่น
    for (const user of users) {
      let summary;
      try {
        const rows = await repository.summarizeTransactions(user.userId, range.from, range.to);
        summary = buildSummary(rows, range.label);
        // period คือวันที่ 1 ของเดือนที่สรุป จองก่อน push เพื่อให้ cron ที่ถูกเรียกซ้ำหรือช้าไม่ส่งซ้ำ
        const reserved = await repository.reserveNotification({ userId: user.userId, kind: MONTHLY_SUMMARY_KIND, period: range.from });
        if (!reserved) {
          result.skipped += 1;
          continue;
        }
      } catch (err) {
        // ไม่ log err ทั้งก้อนเพราะ cause อาจมียอดเงิน
        logger.error('Failed to prepare monthly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.failed += 1;
        continue;
      }
      try {
        if (summary.entryCount === 0) {
          await pushText(user.lineUserId, buildEmptyMonthText(range));
          result.nudged += 1;
        } else {
          const comment = pickMonthlyComment(summary, range.monthName);
          await pushFlex(user.lineUserId, buildSummaryFlex(summary, comment, { summaryUrl: buildSummaryUrl(range.month) }));
          result.sent += 1;
        }
      } catch (err) {
        // ไม่ลบการจองและไม่ลองซ้ำเพราะ LINE อาจส่งถึงแล้ว
        logger.error('Failed to push monthly summary', { userId: user.userId, reason: err?.message ?? String(err) });
        result.pushFailed += 1;
      }
    }
    return result;
  };
}

module.exports = { createMonthlySummaryRunner, MONTHLY_SUMMARY_KIND };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/notifications/monthly.test.js`
Expected: PASS 5 เทสต์

- [ ] **Step 5: Commit**

```bash
git add src/notifications/monthly.js src/notifications/monthly.test.js
git commit -m "feat(notifications): push last month's summary card on the first of the month"
```

---

### Task 6: ปุ่ม "เปิดหน้าสรุป" พาไปเดือนที่สรุป

**Depends on:** none

**ปัญหา:** ปุ่มของการ์ดชี้ `?tab=summary` ซึ่งเปิดเดือนปัจจุบัน (พ.ย.) ไม่ใช่เดือนที่การ์ดสรุป (ต.ค.) และหน้าเว็บตอนนี้ถ้าลิงก์มี `m=` จะสลับไปแท็บรายการเสมอ (`public/liff/app.mjs` ใน `boot()` บรรทัด `const listFilter = ...` และ `els.month.value = ...`)

**Files:**
- Modify: `src/chat/urls.js` (`MONTH_PATTERN` ที่หัวไฟล์ข้าง `ISO_DATE_PATTERN`, `buildSummaryUrl(month)`)
- Test: `src/chat/urls.test.js` (describe `createUrlBuilders buildSummaryUrl` บรรทัด ~85)
- Modify: `public/liff/app.mjs` (ใน `boot()` สองบรรทัดที่ระบุ)
- Test: `public/liff/app.core.dom.test.mjs` (describe `LIFF page opened from a totals answer card` บรรทัด ~849)

**Interfaces:**
- Produces: `createUrlBuilders({ liffUrl }).buildSummaryUrl(month?)` ใส่ `m=` เมื่อ month ตรง `YYYY-MM` ไม่งั้นคืน `?tab=summary` เหมือนเดิม; หน้าเว็บที่เปิดจาก `?tab=summary&m=YYYY-MM` แสดงแท็บสรุปของเดือนนั้น

**Browser check:** ไม่มีแบบอัตโนมัติ เพราะนอกแอป LINE หน้าเว็บเด้งไป LINE Login ก่อนถึงแท็บ (ผล hawk 2026-10-30) ใช้ DOM test แทน และให้ผู้ใช้กดปุ่มจากการ์ดจริงในแอป LINE (Task 8 STATE)

- [ ] **Step 1: Write the failing tests**

`src/chat/urls.test.js` ใน describe `createUrlBuilders buildSummaryUrl`:

```js
  it('adds the month for a monthly summary card and ignores a bad month', () => {
    const { buildSummaryUrl } = createUrlBuilders({ liffUrl: LIFF_URL });

    expect(buildSummaryUrl('2026-10')).toBe(`${LIFF_URL}?tab=summary&m=2026-10`);
    expect(buildSummaryUrl('2026-13')).toBe(`${LIFF_URL}?tab=summary`);
  });
```

`public/liff/app.core.dom.test.mjs` ใน describe `LIFF page opened from a totals answer card` ต่อจากเทสต์แรก:

```js
  it('opens the summary tab on the month named in a monthly summary link', async () => {
    await boot({ search: '?tab=summary&m=2026-09' });
    await settle();

    expect(byId('month').value).toBe('2026-09');
    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('summary');
    expect(byId('panel-summary').hidden).toBe(false);
    expect(byId('panel-list').hidden).toBe(true);
    expect(byId('search').value).toBe('');
  });

  it('still opens the list for a list link that only names a month', async () => {
    await boot({ search: '?tab=list&m=2026-09' });
    await settle();

    expect(byId('month').value).toBe('2026-09');
    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('list');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/chat/urls.test.js public/liff/app.core.dom.test.mjs -t "monthly summary|only names a month"`
Expected: FAIL เทสต์ urls (ไม่มี `m=`) และเทสต์ summary link (แท็บที่เปิดคือ `list`); เทสต์ `only names a month` ผ่านอยู่แล้ว (เป็น regression guard)

- [ ] **Step 3: Implement**

`src/chat/urls.js` เพิ่มใต้บรรทัด `const ISO_DATE_PATTERN = ...`:

```js
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
```

และแทน `buildSummaryUrl` เดิม:

```js
  // การ์ดสรุปรายเดือนส่งหลังข้ามเดือนแล้ว จึงต้องบอกเดือนให้หน้าเว็บเปิดเดือนที่การ์ดสรุป
  function buildSummaryUrl(month) {
    const base = buildTabUrl('summary');
    if (!base || !MONTH_PATTERN.test(month ?? '')) return base;
    const url = new URL(base);
    url.searchParams.set('m', month);
    return url.toString();
  }
```

`public/liff/app.mjs` ใน `boot()` แทนบรรทัด

```js
    const listFilter = !link && !friendCode ? listLink : null;
    els.month.value = link && link.date ? link.date.slice(0, 7) : (listFilter && listFilter.month) || currentMonth(new Date());
```

ด้วย

```js
    // ลิงก์เปิดแท็บอื่นที่มีแค่เดือน (การ์ดสรุปรายเดือน) ใช้เดือนอย่างเดียว ไม่ใช่ตัวกรองแท็บรายการ
    const monthOnlyTabLink = Boolean(!link && !friendCode && tabId && tabId !== 'list' && listLink
      && !listLink.query && !listLink.category && !listLink.wallet && !listLink.type);
    const listFilter = !link && !friendCode && !monthOnlyTabLink ? listLink : null;
    const linkedMonth = (listFilter || (monthOnlyTabLink ? listLink : null))?.month;
    els.month.value = link && link.date ? link.date.slice(0, 7) : linkedMonth || currentMonth(new Date());
```

(คอมเมนต์ "ลิงก์แก้ไขรายการและลิงก์ชวนเพื่อนมาก่อน..." ที่อยู่เหนือบรรทัดเดิมคงไว้)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chat/urls.test.js public/liff/app.core.dom.test.mjs public/liff/deep-link.test.mjs public/liff/month-rollover.test.mjs`
Expected: PASS รวมเทสต์เดิมของลิงก์การ์ดตอบยอด ลิงก์แก้ไขรายการ และการเปลี่ยนเดือนเอง

- [ ] **Step 5: Commit**

```bash
git add src/chat/urls.js src/chat/urls.test.js public/liff/app.mjs public/liff/app.core.dom.test.mjs
git commit -m "feat(liff): open the summary tab on the month a monthly card links to"
```

---

### Task 7: endpoint และการต่อสาย

**Depends on:** Task 5, Task 6

**Files:**
- Modify: `src/notifications/router.js`
- Test: `src/notifications/router.test.js`
- Modify: `index.js` (shared file)

**Interfaces:**
- Produces: `POST /internal/notifications/monthly` ต้องมี `Authorization: Bearer <CRON_SECRET>` ตอบ 200 พร้อมผล run หรือ 500 เมื่อ `failed > 0`

- [ ] **Step 1: Write the failing test**

`src/notifications/router.test.js`: ใน `deps()` (บรรทัด 10-17) เติม `runMonthlySummary: vi.fn().mockResolvedValue(COUNTS),` ต่อจาก `runDailyReminder` ใน describe `createNotificationsRouter` เติม:

```js
  it('refuses to build without the monthly job', () => {
    expect(() => createNotificationsRouter(deps({ runMonthlySummary: undefined }))).toThrow('runMonthlySummary');
  });
```

และต่อท้ายไฟล์:

```js
describe('POST /internal/notifications/monthly', () => {
  it('runs the monthly summary and returns the counts when the bearer secret matches', async () => {
    const options = deps();
    const base = await start(options);

    const res = await post(base, '/notifications/monthly', 's3cret');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(COUNTS);
    expect(options.runMonthlySummary).toHaveBeenCalledTimes(1);
    expect(options.runWeeklySummary).not.toHaveBeenCalled();
  });

  it('returns 401 and does not run for a missing or wrong secret', async () => {
    const options = deps();
    const base = await start(options);

    expect((await post(base, '/notifications/monthly')).status).toBe(401);
    expect((await post(base, '/notifications/monthly', 'wrong')).status).toBe(401);
    expect(options.runMonthlySummary).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/notifications/router.test.js`
Expected: FAIL (`/notifications/monthly` ตอบ 404 และไม่โยน error เมื่อไม่มี `runMonthlySummary`)

- [ ] **Step 3: Implement**

`src/notifications/router.js`: เพิ่ม `runMonthlySummary` ใน parameter ของ `createNotificationsRouter` ตรวจต่อจากการตรวจ `runDailyReminder`:

```js
  if (typeof runMonthlySummary !== 'function') {
    throw new TypeError('createNotificationsRouter requires runMonthlySummary');
  }
```

และต่อจาก `mountJob('/notifications/daily-reminder', ...)`:

```js
  mountJob('/notifications/monthly', runMonthlySummary, 'Monthly summary run failed');
```

`index.js`:
- require `const { createMonthlySummaryRunner } = require('./src/notifications/monthly');` ต่อจาก require ของ weekly
- ก่อน `const notificationsRouter = ...` เพิ่ม `const urlBuilders = createUrlBuilders({ liffUrl });` แล้วแก้ `summaryUrl: createUrlBuilders({ liffUrl }).buildSummaryUrl()` ของ weekly เป็น `summaryUrl: urlBuilders.buildSummaryUrl()`
- ใน `createNotificationsRouter({...})` ต่อจาก `runDailyReminder`:

```js
  runMonthlySummary: createMonthlySummaryRunner({
    repository,
    pushFlex: createPushFlex(lineClient),
    pushText: createPushText(lineClient),
    buildSummaryUrl: urlBuilders.buildSummaryUrl,
  }),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/notifications` แล้ว `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/notifications/router.js src/notifications/router.test.js index.js
git commit -m "feat(notifications): add the monthly summary cron endpoint"
```

---

### Task 8: เอกสารและสิ่งที่ผู้ใช้ต้องทำ

**Depends on:** Task 7

**Files:**
- Modify: `README.md`
- Modify: `SPEC.md`
- Modify: `work-memory/STATE.md`

- [ ] **Step 1: README** แก้ทุกจุดต่อไปนี้ให้ตรงกับโค้ด
  - แผนภาพ cron (~บรรทัด 41-44): เพิ่มเส้น `Cron -->|POST วันที่ 1 08:00| Monthly["/internal/notifications/monthly"]`
  - ตาราง endpoint (~56): `งาน cron 3 งาน` -> `งาน cron 4 งาน`
  - ขั้นตั้ง cron-job.org (~108-110): `cron-job.org 4 งาน` -> `5 งาน` และเพิ่ม `POST /internal/notifications/monthly` วันที่ 1 เวลา 08:00 (Custom)
  - ข้อควรระวัง (~131): บอกว่าสรุปรายเดือนวนทุกคนที่ยัง follow จึงเกิน timeout 30 วินาทีได้เมื่อผู้ใช้เยอะ งานยังทำต่อจนจบและการจองกันส่งซ้ำ แต่ cron-job.org จะแจ้งว่าล้มเหลว
- [ ] **Step 2: SPEC** เพิ่มหัวข้อ `### 15. สรุปรายเดือน` ต่อจากหัวข้อ 14 (ส่งทุกคนที่ยัง follow ไม่มีสวิตช์ในเว็บ, unfollow หยุด follow กลับมาส่งต่อ, cron วันที่ 1 08:00 สรุปเดือนก่อนหน้า, ข้อความเฮียสำเร็จรูป 6 แบบ ไม่เรียก Claude, เดือนว่างส่งข้อความชวน, จอง kind `monthly_summary` period วันที่ 1, ปุ่มเปิดแท็บสรุปของเดือนนั้น) แก้บรรทัด endpoint (~127) ให้รวม `.../monthly` ที่ตอบ `{ eligible, sent, nudged, skipped, failed, pushFailed }` และบรรทัดโควตา (~129) เพิ่ม "สรุปรายเดือน 1 ต่อคนต่อเดือน" และบรรทัด "unfollow แล้วปิดสวิตช์ทุกตัว" (~79) ให้รวมสรุปรายเดือน
- [ ] **Step 3: Check** `grep -n "3 งาน\|4 งาน" README.md` ต้องเหลือเฉพาะจำนวนใหม่
- [ ] **Step 4: STATE** เพิ่ม Done และ "รอผู้ใช้ทำ": (ก) รัน `supabase/026_monthly_summary.sql` ใน Supabase SQL Editor ก่อน push (ข) เพิ่มงานใน cron-job.org: `POST /internal/notifications/monthly` เขตเวลา Asia/Bangkok วันที่ 1 เวลา 08:00 header `Authorization: Bearer <CRON_SECRET>` (ค) วันที่ 1 ถัดไปดูการ์ดในแอป LINE และกดปุ่ม เปิดหน้าสรุป ต้องเปิดแท็บสรุปของเดือนที่การ์ดสรุป; ตาม STATE กติกาเรื่อง Done 5 รายการ
- [ ] **Step 5: Commit**

```bash
git add README.md SPEC.md work-memory/STATE.md
git commit -m "docs: document the monthly summary push and its cron job"
```
