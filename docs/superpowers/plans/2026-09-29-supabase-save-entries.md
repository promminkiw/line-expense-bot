# Supabase Tables + Save Entries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำขั้นที่ 3 ของ `SPEC.md`: สร้างตาราง Supabase ครบ 5 ตาราง (+ ตาราง `line_events` สำหรับกันบันทึกซ้ำ) พร้อม RLS, สมัครผู้ใช้อัตโนมัติเมื่อเพิ่มเพื่อนหรือส่งข้อความแรก, บันทึกรายการที่ Claude แยกได้ลง `transactions` จริง แล้วตอบ "บันทึกแล้ว" พร้อม Quick Reply "ยกเลิก" ที่ลบรายการชุดนั้นได้

**Architecture:** ใช้แนวเดิมของขั้นที่ 1-2 คือส่ง dependency ทุกตัวเข้าไปจากข้างนอก (dependency injection) `src/db/repository.js` เป็นที่เดียวที่เรียก Supabase และรับ client เข้ามา เทสต์จึงใช้ fake query builder แทนได้ `src/users.js` ดูแลการสมัครผู้ใช้กับหมวดหมู่ default ส่วน `src/bot.js` เลือกว่าแต่ละ event (follow / text / postback) ต้องทำอะไร แล้วคืนข้อความที่จะตอบเป็นค่า ให้ `handleEvent` ตอบ LINE ครั้งเดียวที่ท้ายสุด ส่วน `index.js` ยังเป็นที่เดียวที่สร้างของจริง (Supabase client, LINE client, rate limiter) แล้วต่อเข้าด้วยกัน

**Tech Stack:** Node.js 22 (CommonJS), Express 5.2.1, @line/bot-sdk 11.2.0, @anthropic-ai/sdk 0.129.0, @supabase/supabase-js 2.117.2 (ใหม่), Supabase Postgres + RLS, Vitest 5.0.2

## Global Constraints

- ผู้ใช้ใช้ Windows: ทุกคำสั่งในแผนต้องรันได้ใน PowerShell (ใช้ `curl.exe` ไม่ใช่ `curl`)
- โปรเจกต์เป็น `"type": "commonjs"`: source ใช้ `require` / `module.exports`
- ไฟล์เทสต์ต้องใช้ `import` เท่านั้น เพราะ `require('vitest')` จะ throw ใน CommonJS
- ห้ามใช้ `vi.mock` กับ module ที่ถูก `require` — ใช้ dependency injection + fake object แทน
- เทสต์วางคู่กับไฟล์: `src/foo.js` → `src/foo.test.js`
- dependency ใหม่ตัวเดียวคือ `@supabase/supabase-js` `^2.117.2` ติดตั้งแบบ local (ไม่ใช่ global)
- คอมเมนต์ในโค้ดสั้น บรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log message เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม commit `.env` หรือ secret ใดๆ; agent ห้ามแก้ `.env` เอง (ผู้ใช้เพิ่ม key เอง)
- ห้าม agent start/restart/kill server เอง ขั้นที่ต้องรัน `npm start` / `ngrok` เป็นหน้าที่ของผู้ใช้
- ตาราง Supabase สร้างด้วยการวาง `supabase/schema.sql` ใน SQL Editor บนเว็บ Supabase (ไม่ใช้ Supabase CLI)
- Server ใช้ service role key และ filter `user_id` ทุก query ที่อ่าน/ลบข้อมูลของผู้ใช้; เปิด RLS ทุกตารางโดยไม่มี policy (anon key อ่านอะไรไม่ได้)
- เพดานจำนวนเงินต่อรายการ: `10000000` บาท (ตรงกันทั้งใน parser และ check constraint ของ DB)
- rate limit: ผู้ใช้หนึ่งคนเรียก Claude ได้ไม่เกิน 10 ข้อความต่อ 60 วินาที
- รับเฉพาะ event จากแชต 1:1 (`event.source.type === 'user'`) event จาก group/room ไม่ตอบ
- ข้อความตอบเมื่อระบบมีปัญหา: `ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง`
- commit message ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `supabase/schema.sql` | สร้างตารางทั้งหมด + RLS (รันครั้งเดียวใน SQL Editor) | 1 |
| `src/config.js` | เพิ่ม `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 2 |
| `.env.example` | เพิ่มตัวอย่าง key ของ Supabase | 2 |
| `package.json`, `package-lock.json` | เพิ่ม `@supabase/supabase-js` | 2 |
| `src/parser/parse-message.js` | เพดานจำนวนเงิน | 3 |
| `src/rate-limit.js` | นับจำนวนครั้งต่อผู้ใช้ในหน่วยความจำ | 4 |
| `src/line-reply.js` | รองรับ Quick Reply | 5 |
| `src/parser/format-reply.js` | ข้อความ "บันทึกแล้ว" | 5, 8 |
| `src/db/transaction-rows.js` | แปลงรายการที่แยกได้เป็นแถวของ `transactions` | 6 |
| `src/db/repository.js` | query ทั้งหมดที่คุยกับ Supabase | 6 |
| `src/users.js` | สมัครผู้ใช้ + หมวดหมู่ default | 7 |
| `src/bot.js` | ตัดสินใจว่าแต่ละ event ต้องทำอะไรและตอบอะไร | 8 |
| `index.js` | สร้างของจริงแล้วต่อเข้าด้วยกัน | 9 |

## Dependency Graph

- Task 1, 2, 3, 4, 5, 6 ทำขนานกันได้ (Task 2 เป็น task เดียวที่แตะ `package.json` / `package-lock.json`; Task 1 มีส่วนที่ผู้ใช้ต้องทำเองบนเว็บ Supabase)
- Task 7 รอ Task 6 (ใช้ interface ของ repository)
- Task 8 รอ Task 5, 6, 7
- Task 9 รอทุก task (1-8)

---

### Task 1: Schema ของ Supabase + สร้าง project

**Depends on:** none

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Consumes: ไม่มี
- Produces: ตารางและคอลัมน์ที่ Task 6 ใช้
  - `users(id uuid, line_user_id text unique, display_name text, created_at)`
  - `categories(id uuid, user_id uuid, name text, type text, created_at)` unique `(user_id, type, name)`
  - `line_events(webhook_event_id text primary key, user_id uuid, created_at)`
  - `transactions(id uuid, user_id uuid, type text, category_id uuid, amount numeric(12,2), note text, occurred_on date, source text, line_event_id text, created_at)`
  - `budgets(...)` และ `recurring_rules(...)` ยังไม่มีโค้ดใช้ในขั้นนี้

- [ ] **Step 1: เขียน `supabase/schema.sql`**

```sql
-- รันครั้งเดียวใน Supabase SQL Editor เพื่อสร้างตารางทั้งหมดของขั้นที่ 3

create table public.users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, type, name),
  -- ให้ตารางอื่นอ้างอิง (id, user_id) คู่กันได้ กันการใช้หมวดของผู้ใช้คนอื่น
  unique (id, user_id)
);

-- จำ webhookEventId ที่ประมวลผลแล้ว เพราะ LINE ส่ง event เดิมซ้ำได้
create table public.line_events (
  webhook_event_id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  note text not null default '',
  occurred_on date not null,
  source text not null default 'text' check (source in ('text', 'slip', 'recurring')),
  line_event_id text references public.line_events (webhook_event_id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create index transactions_user_occurred_on_idx on public.transactions (user_id, occurred_on);
create index transactions_line_event_id_idx on public.transactions (line_event_id);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  note text not null default '',
  day_of_month integer not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  last_run_on date,
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

-- ไม่สร้าง policy: anon key จึงอ่าน/เขียนไม่ได้เลย ส่วน server ใช้ service role ที่ข้าม RLS
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.line_events enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_rules enable row level security;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add Supabase schema with RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: (ผู้ใช้) สร้าง Supabase project แล้วรัน schema**

**Manual check (ผู้ใช้เป็นคนทำ — agent ห้ามแก้ `.env`):**
- Preconditions: มีบัญชี Supabase (สมัครฟรีที่ `https://supabase.com` ด้วย GitHub หรืออีเมล)

| # | Action | Expected |
|---|---|---|
| 1 | เว็บ Supabase > กด `New project` ตั้งชื่อ `line-expense-bot` ตั้ง Database Password (เก็บไว้) เลือก Region `Southeast Asia (Singapore)` แล้วกด `Create new project` | รอ 1-2 นาที แล้วเห็นหน้า dashboard ของ project |
| 2 | เมนูซ้าย `SQL Editor` > `New query` > วางเนื้อหาทั้งไฟล์ `supabase/schema.sql` > กด `Run` | ขึ้น `Success. No rows returned` |
| 3 | ใน SQL Editor รัน `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;` | 6 แถว: `budgets`, `categories`, `line_events`, `recurring_rules`, `transactions`, `users` และทุกแถว `rowsecurity` = `true` |
| 4 | ใน SQL Editor กด New query แล้ววางและ Run สคริปต์ตรวจ cascade ด้านล่างทั้งก้อน (สคริปต์สร้างข้อมูลทดสอบของ user ชื่อ cascade-test แล้วลบ user นั้น) | ตารางผลลัพธ์ 1 แถว ทุกคอลัมน์ (categories, line_events, transactions, budgets, recurring_rules) เป็น 0 และไม่มี error |
| 5 | ใน SQL Editor รัน `select table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges from information_schema.role_table_grants where grantee = 'service_role' and table_schema = 'public' group by table_name order by table_name;` | 6 แถว (ตารางเดียวกับข้อ 3) และทุกแถวในคอลัมน์ privileges มี DELETE, INSERT, SELECT, UPDATE — ถ้าไม่ครบ ให้รัน grant select, insert, update, delete on all tables in schema public to service_role; แล้วรันข้อ 5 ซ้ำ |
| 6 | กดปุ่ม `Connect` ด้านบน (หรือ `Project Settings` > `Data API`) copy `Project URL` | ได้ค่ารูปแบบ `https://<ref>.supabase.co` |
| 7 | `Project Settings` > `API Keys` copy key ฝั่ง server: `Secret key` (ขึ้นต้น `sb_secret_`) หรือ `service_role` ในแท็บ Legacy | ได้ key ยาว 1 ค่า (ห้ามส่งให้ใคร ห้าม commit) |
| 8 | เปิด `.env` เพิ่ม 2 บรรทัด `SUPABASE_URL=<ค่าจากข้อ 6>` และ `SUPABASE_SERVICE_ROLE_KEY=<ค่าจากข้อ 7>` แล้ว save | `.env` มีครบ 7 key; `git status` ไม่แสดง `.env` |

สคริปต์ตรวจ cascade สำหรับข้อ 4:

```sql
insert into public.users (line_user_id, display_name) values ('cascade-test', 'cascade-test');
insert into public.categories (user_id, name, type)
  select id, 'cascade-test', 'expense' from public.users where line_user_id = 'cascade-test';
insert into public.line_events (webhook_event_id, user_id)
  select 'cascade-test-event', id from public.users where line_user_id = 'cascade-test';
insert into public.transactions (user_id, type, category_id, amount, note, occurred_on, line_event_id)
  select c.user_id, 'expense', c.id, 1, 'cascade-test', current_date, 'cascade-test-event'
  from public.categories c where c.name = 'cascade-test';
insert into public.budgets (user_id, category_id, month, amount)
  select c.user_id, c.id, date_trunc('month', current_date)::date, 1
  from public.categories c where c.name = 'cascade-test';
insert into public.recurring_rules (user_id, type, category_id, amount, note, day_of_month)
  select c.user_id, 'expense', c.id, 1, 'cascade-test', 1
  from public.categories c where c.name = 'cascade-test';

delete from public.users where line_user_id = 'cascade-test';

select
  (select count(*) from public.categories where name = 'cascade-test') as categories,
  (select count(*) from public.line_events where webhook_event_id = 'cascade-test-event') as line_events,
  (select count(*) from public.transactions where note = 'cascade-test') as transactions,
  (select count(*) from public.budgets b where not exists (select 1 from public.users u where u.id = b.user_id)) as budgets,
  (select count(*) from public.recurring_rules where note = 'cascade-test') as recurring_rules;
```

---

### Task 2: Config ของ Supabase + ติดตั้ง supabase-js

**Depends on:** none

**Files:**
- Modify: `src/config.js`
- Modify: `.env.example`
- Modify: `package.json`, `package-lock.json` (ผ่าน `npm install`)
- Test: `src/config.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `loadConfig(env)` คืน `{ port, lineChannelSecret, lineChannelAccessToken, anthropicApiKey, claudeModel, supabaseUrl: string, supabaseServiceRoleKey: string }` และ throw `Missing environment variables: ...` ถ้าขาด `SUPABASE_URL` หรือ `SUPABASE_SERVICE_ROLE_KEY`

- [ ] **Step 1: Write the failing test**

แทนที่ทั้งไฟล์ `src/config.test.js`

```js
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config.js';

const VALID_ENV = {
  LINE_CHANNEL_SECRET: 'secret-123',
  LINE_CHANNEL_ACCESS_TOKEN: 'token-456',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test',
};

describe('loadConfig', () => {
  it('returns LINE, Claude and Supabase settings from env', () => {
    const config = loadConfig({ ...VALID_ENV, PORT: '4000', CLAUDE_MODEL: 'claude-sonnet-5-5' });

    expect(config).toEqual({
      port: 4000,
      lineChannelSecret: 'secret-123',
      lineChannelAccessToken: 'token-456',
      anthropicApiKey: 'sk-ant-test',
      claudeModel: 'claude-sonnet-5-5',
      supabaseUrl: 'https://abc.supabase.co',
      supabaseServiceRoleKey: 'sb_secret_test',
    });
  });

  it('defaults port to 3000 and model to claude-haiku-4-5', () => {
    const config = loadConfig(VALID_ENV);

    expect(config.port).toBe(3000);
    expect(config.claudeModel).toBe('claude-haiku-4-5');
  });

  it('throws listing every missing key', () => {
    expect(() => loadConfig({})).toThrow(
      'Missing environment variables: LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'
    );
  });

  it('treats empty string as missing', () => {
    expect(() => loadConfig({ ...VALID_ENV, SUPABASE_SERVICE_ROLE_KEY: '' })).toThrow(
      'Missing environment variables: SUPABASE_SERVICE_ROLE_KEY'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.js`
Expected: FAIL 2 tests (`returns LINE, Claude and Supabase settings from env` ไม่มี `supabaseUrl`, `throws listing every missing key` ข้อความไม่มี `SUPABASE_URL`)

- [ ] **Step 3: Write minimal implementation**

แทนที่ทั้งไฟล์ `src/config.js`

```js
const REQUIRED_KEYS = [
  'LINE_CHANNEL_SECRET',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];
const DEFAULT_CLAUDE_MODEL = 'claude-haiku-4-5';

function loadConfig(env) {
  const missing = REQUIRED_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }

  return {
    port: Number(env.PORT) || 3000,
    lineChannelSecret: env.LINE_CHANNEL_SECRET,
    lineChannelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    claudeModel: env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
    supabaseUrl: env.SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

module.exports = { loadConfig };
```

แทนที่ทั้งไฟล์ `.env.example`

```
PORT=3000
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.js`
Expected: PASS 4 tests

- [ ] **Step 5: ติดตั้ง supabase-js**

Run: `npm install @supabase/supabase-js@^2.117.2`
Expected: `package.json` มี `"@supabase/supabase-js": "^2.117.2"` ใน `dependencies` และคำสั่ง `node -e "console.log(typeof require('@supabase/supabase-js').createClient)"` พิมพ์ `function`

- [ ] **Step 6: Run full suite**

Run: `npm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 7: Commit**

```bash
git add src/config.js src/config.test.js .env.example package.json package-lock.json
git commit -m "feat: add Supabase config and client dependency

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: เพดานจำนวนเงินใน parser

**Depends on:** none

**Files:**
- Modify: `src/parser/parse-message.js` (ค่าคงที่ด้านบน, `toParseResult`, `module.exports`)
- Test: `src/parser/parse-message.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `MAX_AMOUNT = 10000000` export จาก `src/parser/parse-message.js`; `parseMessage` คืน `{ status: 'clarify', question: DEFAULT_CLARIFY_QUESTION }` เมื่อมีรายการใด `amount > MAX_AMOUNT`

- [ ] **Step 1: Write the failing test**

ใน `src/parser/parse-message.test.js` แก้ import ด้านบนเป็น

```js
import {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  DEFAULT_CLARIFY_QUESTION,
  MAX_AMOUNT,
} from './parse-message.js';
```

แล้วเพิ่มสองเทสต์นี้ต่อจากเทสต์ `asks to clarify when any amount is not positive` (อยู่ใน `describe` เดียวกัน)

```js
  it('asks to clarify when any amount is above the maximum', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ amount: MAX_AMOUNT + 1 })])),
      model: 'm',
      now: NOW,
    });

    expect(await parse('ซื้อบ้าน 10000001')).toEqual({
      status: 'clarify',
      question: DEFAULT_CLARIFY_QUESTION,
    });
  });

  it('accepts amount equal to the maximum', async () => {
    const parse = createMessageParser({
      client: fakeClient(okPayload([item({ amount: MAX_AMOUNT })])),
      model: 'm',
      now: NOW,
    });

    const result = await parse('ซื้อบ้าน 10000000');

    expect(result.status).toBe('ok');
    expect(MAX_AMOUNT).toBe(10000000);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: FAIL `asks to clarify when any amount is above the maximum` (ได้ `status: 'ok'`) และ `accepts amount equal to the maximum` (`MAX_AMOUNT` เป็น `undefined`)

- [ ] **Step 3: Write minimal implementation**

ใน `src/parser/parse-message.js` เพิ่มค่าคงที่ต่อจากบรรทัด `const ISO_DATE_PATTERN = ...`

```js
// กันตัวเลขที่ Claude อ่านผิดจนใหญ่ผิดปกติ ค่าเดียวกับ check constraint ใน supabase/schema.sql
const MAX_AMOUNT = 10000000;
```

แก้ `hasInvalidAmount` ใน `toParseResult` เป็น

```js
  const hasInvalidAmount = data.items.some(
    (item) => !Number.isFinite(item.amount) || item.amount <= 0 || item.amount > MAX_AMOUNT
  );
```

แก้บรรทัดสุดท้ายเป็น

```js
module.exports = {
  createMessageParser,
  ParseError,
  PARSE_SCHEMA,
  DEFAULT_CLARIFY_QUESTION,
  MAX_AMOUNT,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/parser/parse-message.test.js`
Expected: PASS ทุกเทสต์ในไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/parser/parse-message.js src/parser/parse-message.test.js
git commit -m "feat: reject amounts above ten million baht

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Rate limiter ต่อผู้ใช้

**Depends on:** none

**Files:**
- Create: `src/rate-limit.js`
- Test: `src/rate-limit.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces: `createRateLimiter({ limit: number, windowMs: number, now?: () => number }) => (key: string) => boolean` — คืน `true` และนับครั้งนี้ถ้ายังไม่เกิน `limit` ภายใน `windowMs` ที่ผ่านมา, คืน `false` (ไม่นับเพิ่ม) ถ้าเกิน

- [ ] **Step 1: Write the failing test**

`src/rate-limit.test.js`

```js
import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

function fakeClock(start = 0) {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

describe('createRateLimiter', () => {
  it('allows up to the limit and blocks the next call', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 2, windowMs: 1000, now: clock.now });

    expect(allow('U1')).toBe(true);
    expect(allow('U1')).toBe(true);
    expect(allow('U1')).toBe(false);
  });

  it('counts each key separately', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(allow('U1')).toBe(true);
    expect(allow('U2')).toBe(true);
    expect(allow('U1')).toBe(false);
  });

  it('allows again after the window has passed', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    expect(allow('U1')).toBe(true);
    clock.advance(999);
    expect(allow('U1')).toBe(false);
    clock.advance(1);
    expect(allow('U1')).toBe(true);
  });

  it('does not count blocked calls', () => {
    const clock = fakeClock();
    const allow = createRateLimiter({ limit: 1, windowMs: 1000, now: clock.now });

    allow('U1');
    clock.advance(500);
    allow('U1');
    clock.advance(500);

    expect(allow('U1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rate-limit.test.js`
Expected: FAIL เพราะหาไฟล์ `./rate-limit.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/rate-limit.js`

```js
function createRateLimiter({ limit, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  return function allowRequest(key) {
    const current = now();
    const recent = (hits.get(key) || []).filter((time) => current - time < windowMs);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(current);
    hits.set(key, recent);
    return true;
  };
}

module.exports = { createRateLimiter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rate-limit.test.js`
Expected: PASS 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/rate-limit.js src/rate-limit.test.js
git commit -m "feat: add in-memory per-user rate limiter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Quick Reply ใน reply wrapper + ข้อความ "บันทึกแล้ว"

**Depends on:** none

**Files:**
- Modify: `src/line-reply.js`
- Modify: `src/parser/format-reply.js`
- Test: `src/line-reply.test.js`
- Test: `src/parser/format-reply.test.js`

**Interfaces:**
- Consumes: ไม่มี
- Produces:
  - `replyText(replyToken: string, text: string, quickReplyItems?: object[]) => Promise<void>` — ถ้ามี `quickReplyItems` (ไม่ว่าง) จะใส่ `quickReply: { items }` ในข้อความ
  - `formatSavedReply(items: Array<{ type, category, amount, date, note }>) => string` — บรรทัดแรก `บันทึกแล้ว` ตามด้วยบรรทัดละรายการรูปแบบเดียวกับ `formatParseReply` เดิม
  - `formatParseReply` ยังอยู่ (Task 8 จะลบ)

- [ ] **Step 1: Write the failing tests**

เพิ่มเทสต์นี้ใน `describe('createReplyText', ...)` ของ `src/line-reply.test.js`

```js
  it('attaches quick reply items when given', async () => {
    const client = { replyMessage: vi.fn().mockResolvedValue({}) };
    const replyText = createReplyText(client);
    const items = [
      { type: 'action', action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=e1' } },
    ];

    await replyText('token-1', 'saved', items);

    expect(client.replyMessage).toHaveBeenCalledWith({
      replyToken: 'token-1',
      messages: [{ type: 'text', text: 'saved', quickReply: { items } }],
    });
  });
```

ใน `src/parser/format-reply.test.js` แก้ import เป็น

```js
import { formatParseReply, formatSavedReply } from './format-reply.js';
```

แล้วเพิ่ม `describe` นี้ท้ายไฟล์

```js
describe('formatSavedReply', () => {
  it('starts with saved header and lists every item', () => {
    const reply = formatSavedReply([
      { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' },
      { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: '' },
    ]);

    expect(reply).toBe(
      [
        'บันทึกแล้ว',
        '- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
        '- รายรับ | เงินเดือน | 25,000 บาท | 01/09',
      ].join('\n')
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/line-reply.test.js src/parser/format-reply.test.js`
Expected: FAIL `attaches quick reply items when given` (ไม่มี `quickReply`) และ `starts with saved header and lists every item` (`formatSavedReply is not a function`)

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

module.exports = { createReplyText };
```

ใน `src/parser/format-reply.js` เพิ่ม function นี้ต่อจาก `formatParseReply`

```js
function formatSavedReply(items) {
  return ['บันทึกแล้ว', ...items.map(formatItem)].join('\n');
}
```

และแก้บรรทัดสุดท้ายเป็น

```js
module.exports = { formatParseReply, formatSavedReply };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/line-reply.test.js src/parser/format-reply.test.js`
Expected: PASS ทุกเทสต์ในสองไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/line-reply.js src/line-reply.test.js src/parser/format-reply.js src/parser/format-reply.test.js
git commit -m "feat: support quick reply and saved entries message

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Repository ของ Supabase + แปลงรายการเป็นแถว

**Depends on:** none (ใช้ชื่อตาราง/คอลัมน์ตาม Task 1 แต่ไม่ต้องรอ เพราะเทสต์ใช้ fake client)

**Files:**
- Create: `src/db/transaction-rows.js`
- Create: `src/db/repository.js`
- Test: `src/db/transaction-rows.test.js`
- Test: `src/db/repository.test.js`

**Interfaces:**
- Consumes: `DEFAULT_CATEGORIES`, `FALLBACK_CATEGORY` จาก `src/parser/categories.js` (มีอยู่แล้ว)
- Produces:
  - `categoryKey(type: string, name: string) => string` — รูปแบบ `"<type>:<name>"`
  - `toTransactionRows({ items, categoryIds: Map<string, string>, userId: string, webhookEventId: string }) => Array<{ user_id, type, category_id, amount, note, occurred_on, source: 'text', line_event_id }>` — ใช้หมวด `อื่นๆ` ของ type เดียวกันถ้าหาหมวดไม่เจอ, throw `Error('No category for <type>:<name>')` ถ้าไม่มีทั้งคู่
  - `DatabaseError` (มี `name = 'DatabaseError'`, message `Database <operation> failed: <message>`)
  - `createRepository(supabase)` คืน object ที่มี:
    - `findUserIdByLineId(lineUserId: string) => Promise<string | null>`
    - `createUser({ lineUserId: string, displayName: string | null }) => Promise<string>` (คืน user id)
    - `seedDefaultCategories(userId: string) => Promise<void>` (ไม่สร้างซ้ำถ้ามีอยู่แล้ว)
    - `getCategoryIds(userId: string) => Promise<Map<string, string>>` (key จาก `categoryKey`)
    - `claimEvent(webhookEventId: string, userId: string) => Promise<boolean>` (`true` ถ้าเพิ่งจองได้, `false` ถ้าเคยมีแล้ว)
    - `insertTransactions(rows: object[]) => Promise<void>`
    - `deleteTransactionsByEvent(userId: string, webhookEventId: string) => Promise<number>` (จำนวนแถวที่ลบ)
  - ทุก method throw `DatabaseError` เมื่อ Supabase คืน `error`

- [ ] **Step 1: Write the failing tests**

`src/db/transaction-rows.test.js`

```js
import { describe, it, expect } from 'vitest';
import { categoryKey, toTransactionRows } from './transaction-rows.js';

const CATEGORY_IDS = new Map([
  ['expense:อาหาร', 'cat-food'],
  ['expense:อื่นๆ', 'cat-expense-other'],
]);

function item(overrides = {}) {
  return { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว', ...overrides };
}

describe('toTransactionRows', () => {
  it('maps items to transaction rows linked to the event', () => {
    const rows = toTransactionRows({
      items: [item()],
      categoryIds: CATEGORY_IDS,
      userId: 'user-1',
      webhookEventId: 'ev1',
    });

    expect(rows).toEqual([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 60,
        note: 'กินข้าว',
        occurred_on: '2026-09-29',
        source: 'text',
        line_event_id: 'ev1',
      },
    ]);
  });

  it('falls back to the other category of the same type', () => {
    const rows = toTransactionRows({
      items: [item({ category: 'เดินทาง' })],
      categoryIds: CATEGORY_IDS,
      userId: 'user-1',
      webhookEventId: 'ev1',
    });

    expect(rows[0].category_id).toBe('cat-expense-other');
  });

  it('throws when neither the category nor the fallback exists', () => {
    expect(() =>
      toTransactionRows({
        items: [item({ type: 'income', category: 'เงินเดือน' })],
        categoryIds: CATEGORY_IDS,
        userId: 'user-1',
        webhookEventId: 'ev1',
      })
    ).toThrow('No category for income:เงินเดือน');
  });

  it('builds category keys as type and name', () => {
    expect(categoryKey('income', 'เงินเดือน')).toBe('income:เงินเดือน');
  });
});
```

`src/db/repository.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createRepository, DatabaseError } from './repository.js';

// จำลอง query builder ของ supabase-js: ทุก method คืนตัวเอง และ await ได้ผล result
function fakeSupabase(result) {
  const calls = [];
  const builder = {};
  for (const method of ['select', 'eq', 'upsert', 'insert', 'delete']) {
    builder[method] = vi.fn((...args) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  for (const method of ['single', 'maybeSingle']) {
    builder[method] = vi.fn(() => {
      calls.push([method]);
      return Promise.resolve(result);
    });
  }
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  const supabase = {
    from: vi.fn((table) => {
      calls.push(['from', table]);
      return builder;
    }),
  };
  return { supabase, calls };
}

describe('repository.findUserIdByLineId', () => {
  it('returns the user id when found', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-1' }, error: null });

    const id = await createRepository(supabase).findUserIdByLineId('U1');

    expect(id).toBe('user-1');
    expect(calls).toEqual([
      ['from', 'users'],
      ['select', 'id'],
      ['eq', 'line_user_id', 'U1'],
      ['maybeSingle'],
    ]);
  });

  it('returns null when not found', async () => {
    const { supabase } = fakeSupabase({ data: null, error: null });

    expect(await createRepository(supabase).findUserIdByLineId('U1')).toBeNull();
  });

  it('throws DatabaseError when Supabase returns an error', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boom' } });

    const promise = createRepository(supabase).findUserIdByLineId('U1');

    await expect(promise).rejects.toBeInstanceOf(DatabaseError);
    await expect(promise).rejects.toThrow('Database findUserIdByLineId failed: boom');
  });
});

describe('repository.createUser', () => {
  it('upserts by line_user_id and returns the id', async () => {
    const { supabase, calls } = fakeSupabase({ data: { id: 'user-1' }, error: null });

    const id = await createRepository(supabase).createUser({ lineUserId: 'U1', displayName: 'Aom' });

    expect(id).toBe('user-1');
    expect(calls).toEqual([
      ['from', 'users'],
      ['upsert', { line_user_id: 'U1', display_name: 'Aom' }, { onConflict: 'line_user_id' }],
      ['select', 'id'],
      ['single'],
    ]);
  });
});

describe('repository.seedDefaultCategories', () => {
  it('inserts every default category and ignores existing ones', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).seedDefaultCategories('user-1');

    const [, upsertCall] = calls;
    const [method, rows, options] = upsertCall;
    expect(calls[0]).toEqual(['from', 'categories']);
    expect(method).toBe('upsert');
    expect(options).toEqual({ onConflict: 'user_id,type,name', ignoreDuplicates: true });
    expect(rows).toHaveLength(10);
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'expense', name: 'อาหาร' });
    expect(rows).toContainEqual({ user_id: 'user-1', type: 'income', name: 'อื่นๆ' });
  });
});

describe('repository.getCategoryIds', () => {
  it('returns a map keyed by type and name for this user only', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { id: 'c1', type: 'expense', name: 'อาหาร' },
        { id: 'c2', type: 'income', name: 'อื่นๆ' },
      ],
      error: null,
    });

    const ids = await createRepository(supabase).getCategoryIds('user-1');

    expect(ids).toEqual(
      new Map([
        ['expense:อาหาร', 'c1'],
        ['income:อื่นๆ', 'c2'],
      ])
    );
    expect(calls).toEqual([
      ['from', 'categories'],
      ['select', 'id, type, name'],
      ['eq', 'user_id', 'user-1'],
    ]);
  });
});

describe('repository.claimEvent', () => {
  it('returns true when the event row was inserted', async () => {
    const { supabase, calls } = fakeSupabase({ data: [{ webhook_event_id: 'ev1' }], error: null });

    expect(await createRepository(supabase).claimEvent('ev1', 'user-1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'line_events'],
      [
        'upsert',
        { webhook_event_id: 'ev1', user_id: 'user-1' },
        { onConflict: 'webhook_event_id', ignoreDuplicates: true },
      ],
      ['select', 'webhook_event_id'],
    ]);
  });

  it('returns false when the event was already claimed', async () => {
    const { supabase } = fakeSupabase({ data: [], error: null });

    expect(await createRepository(supabase).claimEvent('ev1', 'user-1')).toBe(false);
  });
});

describe('repository.insertTransactions', () => {
  it('inserts all rows in one call', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });
    const rows = [{ user_id: 'user-1', amount: 60 }];

    await createRepository(supabase).insertTransactions(rows);

    expect(calls).toEqual([
      ['from', 'transactions'],
      ['insert', rows],
    ]);
  });

  it('throws DatabaseError when insert fails', async () => {
    const { supabase } = fakeSupabase({ data: null, error: { message: 'check violation' } });

    await expect(createRepository(supabase).insertTransactions([])).rejects.toThrow(
      'Database insertTransactions failed: check violation'
    );
  });
});

describe('repository.deleteTransactionsByEvent', () => {
  it('deletes only this user rows for the event and returns the count', async () => {
    const { supabase, calls } = fakeSupabase({ count: 2, error: null });

    const count = await createRepository(supabase).deleteTransactionsByEvent('user-1', 'ev1');

    expect(count).toBe(2);
    expect(calls).toEqual([
      ['from', 'transactions'],
      ['delete', { count: 'exact' }],
      ['eq', 'user_id', 'user-1'],
      ['eq', 'line_event_id', 'ev1'],
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db`
Expected: FAIL เพราะหาไฟล์ `./transaction-rows.js` และ `./repository.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/db/transaction-rows.js`

```js
const { FALLBACK_CATEGORY } = require('../parser/categories');

function categoryKey(type, name) {
  return `${type}:${name}`;
}

function findCategoryId(categoryIds, item) {
  const categoryId =
    categoryIds.get(categoryKey(item.type, item.category)) ||
    categoryIds.get(categoryKey(item.type, FALLBACK_CATEGORY));
  if (!categoryId) {
    throw new Error(`No category for ${categoryKey(item.type, item.category)}`);
  }
  return categoryId;
}

function toTransactionRows({ items, categoryIds, userId, webhookEventId }) {
  return items.map((item) => ({
    user_id: userId,
    type: item.type,
    category_id: findCategoryId(categoryIds, item),
    amount: item.amount,
    note: item.note,
    occurred_on: item.date,
    source: 'text',
    line_event_id: webhookEventId,
  }));
}

module.exports = { categoryKey, toTransactionRows };
```

`src/db/repository.js`

```js
const { DEFAULT_CATEGORIES } = require('../parser/categories');
const { categoryKey } = require('./transaction-rows');

class DatabaseError extends Error {
  constructor(operation, cause) {
    super(`Database ${operation} failed: ${cause.message}`);
    this.name = 'DatabaseError';
    this.cause = cause;
  }
}

function throwIfError(operation, error) {
  if (error) {
    throw new DatabaseError(operation, error);
  }
}

function createRepository(supabase) {
  async function findUserIdByLineId(lineUserId) {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    throwIfError('findUserIdByLineId', error);
    return data ? data.id : null;
  }

  async function createUser({ lineUserId, displayName }) {
    // upsert กันกรณี event แรกของผู้ใช้ใหม่มาพร้อมกันหลายอัน
    const { data, error } = await supabase
      .from('users')
      .upsert({ line_user_id: lineUserId, display_name: displayName }, { onConflict: 'line_user_id' })
      .select('id')
      .single();
    throwIfError('createUser', error);
    return data.id;
  }

  async function seedDefaultCategories(userId) {
    const rows = Object.entries(DEFAULT_CATEGORIES).flatMap(([type, names]) =>
      names.map((name) => ({ user_id: userId, type, name }))
    );
    const { error } = await supabase
      .from('categories')
      .upsert(rows, { onConflict: 'user_id,type,name', ignoreDuplicates: true });
    throwIfError('seedDefaultCategories', error);
  }

  async function getCategoryIds(userId) {
    const { data, error } = await supabase
      .from('categories')
      .select('id, type, name')
      .eq('user_id', userId);
    throwIfError('getCategoryIds', error);
    return new Map(data.map((row) => [categoryKey(row.type, row.name), row.id]));
  }

  async function claimEvent(webhookEventId, userId) {
    // ignoreDuplicates คืนเฉพาะแถวที่เพิ่ง insert ได้ แถวว่างแปลว่าเคยประมวลผลแล้ว
    const { data, error } = await supabase
      .from('line_events')
      .upsert(
        { webhook_event_id: webhookEventId, user_id: userId },
        { onConflict: 'webhook_event_id', ignoreDuplicates: true }
      )
      .select('webhook_event_id');
    throwIfError('claimEvent', error);
    return data.length > 0;
  }

  async function insertTransactions(rows) {
    const { error } = await supabase.from('transactions').insert(rows);
    throwIfError('insertTransactions', error);
  }

  async function deleteTransactionsByEvent(userId, webhookEventId) {
    const { count, error } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', userId)
      .eq('line_event_id', webhookEventId);
    throwIfError('deleteTransactionsByEvent', error);
    return count;
  }

  return {
    findUserIdByLineId,
    createUser,
    seedDefaultCategories,
    getCategoryIds,
    claimEvent,
    insertTransactions,
    deleteTransactionsByEvent,
  };
}

module.exports = { createRepository, DatabaseError };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db`
Expected: PASS ทุกเทสต์ใน `src/db/transaction-rows.test.js` และ `src/db/repository.test.js`

- [ ] **Step 5: Commit**

```bash
git add src/db
git commit -m "feat: add Supabase repository and transaction row mapping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: สมัครผู้ใช้ + หมวดหมู่ default

**Depends on:** Task 6

**Files:**
- Create: `src/users.js`
- Test: `src/users.test.js`

**Interfaces:**
- Consumes: จาก Task 6 — `repository.findUserIdByLineId`, `repository.createUser`, `repository.seedDefaultCategories`, `repository.getCategoryIds`
- Produces: `createUserService({ repository, getDisplayName: (lineUserId) => Promise<string>, logger? })` คืน
  - `ensureUser(lineUserId: string) => Promise<string>` — คืน user id; ถ้ายังไม่มีจะดึงชื่อจาก LINE (ดึงไม่ได้ใช้ `null`), สร้างผู้ใช้ และสร้างหมวดหมู่ default
  - `loadCategoryIds(userId: string) => Promise<Map<string, string>>` — ถ้าผู้ใช้ยังไม่มีหมวดเลย จะสร้างหมวด default แล้วโหลดใหม่

- [ ] **Step 1: Write the failing test**

`src/users.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import { createUserService } from './users.js';

function setup(repositoryOverrides = {}, getDisplayName = vi.fn().mockResolvedValue('Aom')) {
  const repository = {
    findUserIdByLineId: vi.fn().mockResolvedValue(null),
    createUser: vi.fn().mockResolvedValue('user-1'),
    seedDefaultCategories: vi.fn().mockResolvedValue(),
    getCategoryIds: vi.fn().mockResolvedValue(new Map([['expense:อาหาร', 'c1']])),
    ...repositoryOverrides,
  };
  const logger = { error: vi.fn() };
  const service = createUserService({ repository, getDisplayName, logger });
  return { repository, getDisplayName, logger, service };
}

describe('userService.ensureUser', () => {
  it('returns the existing id without calling LINE or creating anything', async () => {
    const { repository, getDisplayName, service } = setup({
      findUserIdByLineId: vi.fn().mockResolvedValue('user-9'),
    });

    expect(await service.ensureUser('U1')).toBe('user-9');
    expect(getDisplayName).not.toHaveBeenCalled();
    expect(repository.createUser).not.toHaveBeenCalled();
  });

  it('creates a new user with LINE display name and default categories', async () => {
    const { repository, service } = setup();

    expect(await service.ensureUser('U1')).toBe('user-1');
    expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: 'Aom' });
    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1');
  });

  it('still creates the user with null name when LINE profile fails', async () => {
    const { repository, logger, service } = setup({}, vi.fn().mockRejectedValue(new Error('404')));

    expect(await service.ensureUser('U1')).toBe('user-1');
    expect(repository.createUser).toHaveBeenCalledWith({ lineUserId: 'U1', displayName: null });
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to fetch LINE profile',
      { lineUserId: 'U1' },
      expect.any(Error)
    );
  });
});

describe('userService.loadCategoryIds', () => {
  it('returns categories when the user already has them', async () => {
    const { repository, service } = setup();

    const ids = await service.loadCategoryIds('user-1');

    expect(ids.get('expense:อาหาร')).toBe('c1');
    expect(repository.seedDefaultCategories).not.toHaveBeenCalled();
  });

  it('seeds default categories and reloads when the user has none', async () => {
    const getCategoryIds = vi
      .fn()
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(new Map([['expense:อาหาร', 'c1']]));
    const { repository, service } = setup({ getCategoryIds });

    const ids = await service.loadCategoryIds('user-1');

    expect(repository.seedDefaultCategories).toHaveBeenCalledWith('user-1');
    expect(ids.get('expense:อาหาร')).toBe('c1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/users.test.js`
Expected: FAIL เพราะหาไฟล์ `./users.js` ไม่เจอ

- [ ] **Step 3: Write minimal implementation**

`src/users.js`

```js
function createUserService({ repository, getDisplayName, logger = console }) {
  async function fetchDisplayName(lineUserId) {
    try {
      return await getDisplayName(lineUserId);
    } catch (err) {
      // ชื่อเป็นแค่ข้อมูลประกอบ ดึงไม่ได้ก็ยังสมัครผู้ใช้ต่อได้
      logger.error('Failed to fetch LINE profile', { lineUserId }, err);
      return null;
    }
  }

  async function ensureUser(lineUserId) {
    const existingId = await repository.findUserIdByLineId(lineUserId);
    if (existingId) {
      return existingId;
    }
    const displayName = await fetchDisplayName(lineUserId);
    const userId = await repository.createUser({ lineUserId, displayName });
    await repository.seedDefaultCategories(userId);
    return userId;
  }

  async function loadCategoryIds(userId) {
    const categoryIds = await repository.getCategoryIds(userId);
    if (categoryIds.size > 0) {
      return categoryIds;
    }
    // ซ่อมกรณีสร้างผู้ใช้สำเร็จแต่สร้างหมวดไม่สำเร็จ
    await repository.seedDefaultCategories(userId);
    return repository.getCategoryIds(userId);
  }

  return { ensureUser, loadCategoryIds };
}

module.exports = { createUserService };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/users.test.js`
Expected: PASS 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/users.js src/users.test.js
git commit -m "feat: register users with default categories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: บอทบันทึกรายการ + ยกเลิก + สมัครเมื่อเพิ่มเพื่อน

**Depends on:** Task 5, Task 6, Task 7

**Files:**
- Modify: `src/bot.js` (แทนที่ทั้งไฟล์)
- Modify: `src/parser/format-reply.js` (ลบ `formatParseReply`)
- Test: `src/bot.test.js` (แทนที่ทั้งไฟล์)
- Test: `src/parser/format-reply.test.js` (ลบ `describe('formatParseReply', ...)`)

**Interfaces:**
- Consumes:
  - Task 5: `replyText(replyToken, text, quickReplyItems?)`, `formatSavedReply(items)`
  - Task 6: `toTransactionRows({ items, categoryIds, userId, webhookEventId })`, `repository.claimEvent`, `repository.insertTransactions`, `repository.deleteTransactionsByEvent`
  - Task 7: `users.ensureUser(lineUserId)`, `users.loadCategoryIds(userId)`
  - Task 4 (ผ่าน injection): `allowRequest(lineUserId) => boolean`
- Produces: `createBot({ replyText, parseMessage, repository, users, allowRequest, logger? })` คืน `{ handleEvent, handleEvents }`; export ค่าคงที่ `SYSTEM_ERROR_REPLY`, `RATE_LIMITED_REPLY`, `UNDO_DONE_REPLY`, `UNDO_NOT_FOUND_REPLY`
- พฤติกรรม:
  - event ที่ `source.type !== 'user'` → ไม่ทำอะไร
  - `follow` → `ensureUser` ไม่ตอบ
  - ข้อความ text → `ensureUser` → `claimEvent` (ซ้ำ = เงียบ) → `allowRequest` (เกิน = `RATE_LIMITED_REPLY`) → `parseMessage` → clarify ตอบคำถาม / ok บันทึกแล้วตอบ `formatSavedReply` + Quick Reply "ยกเลิก" (postback data `action=undo&event=<webhookEventId>`)
  - `postback` ที่ data เป็น undo → ลบรายการของผู้ใช้คนนี้ที่ผูกกับ event นั้น → `UNDO_DONE_REPLY` หรือ `UNDO_NOT_FOUND_REPLY`
  - error ใดๆ ระหว่างประมวลผล → log `Failed to process event` พร้อม `{ lineUserId, eventType }` แล้วตอบ `SYSTEM_ERROR_REPLY` (ยกเว้น follow ไม่ตอบ)

- [ ] **Step 1: Write the failing test**

แทนที่ทั้งไฟล์ `src/bot.test.js`

```js
import { describe, it, expect, vi } from 'vitest';
import {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
} from './bot.js';

const FOOD_ITEM = { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' };

const UNDO_QUICK_REPLY = [
  {
    type: 'action',
    action: { type: 'postback', label: 'ยกเลิก', data: 'action=undo&event=ev1', displayText: 'ยกเลิก' },
  },
];

function textEvent(text, { replyToken = 'r1', eventId = 'ev1', source = { type: 'user', userId: 'U1' } } = {}) {
  return { type: 'message', webhookEventId: eventId, replyToken, source, message: { type: 'text', text } };
}

function postbackEvent(data) {
  return {
    type: 'postback',
    webhookEventId: 'ev2',
    replyToken: 'r2',
    source: { type: 'user', userId: 'U1' },
    postback: { data },
  };
}

function followEvent() {
  return { type: 'follow', webhookEventId: 'ev3', replyToken: 'r3', source: { type: 'user', userId: 'U1' } };
}

function setup(overrides = {}) {
  const deps = {
    replyText: vi.fn().mockResolvedValue(),
    parseMessage: vi.fn().mockResolvedValue({ status: 'ok', items: [FOOD_ITEM] }),
    repository: {
      claimEvent: vi.fn().mockResolvedValue(true),
      insertTransactions: vi.fn().mockResolvedValue(),
      deleteTransactionsByEvent: vi.fn().mockResolvedValue(2),
    },
    users: {
      ensureUser: vi.fn().mockResolvedValue('user-1'),
      loadCategoryIds: vi.fn().mockResolvedValue(
        new Map([
          ['expense:อาหาร', 'cat-food'],
          ['expense:อื่นๆ', 'cat-other'],
        ])
      ),
    },
    allowRequest: vi.fn().mockReturnValue(true),
    logger: { error: vi.fn() },
    ...overrides,
  };
  return { deps, bot: createBot(deps) };
}

describe('bot text message', () => {
  it('saves parsed items and replies with saved summary and undo button', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.repository.claimEvent).toHaveBeenCalledWith('ev1', 'user-1');
    expect(deps.parseMessage).toHaveBeenCalledWith('กินข้าว 60');
    expect(deps.repository.insertTransactions).toHaveBeenCalledWith([
      {
        user_id: 'user-1',
        type: 'expense',
        category_id: 'cat-food',
        amount: 60,
        note: 'กินข้าว',
        occurred_on: '2026-09-29',
        source: 'text',
        line_event_id: 'ev1',
      },
    ]);
    expect(deps.replyText).toHaveBeenCalledWith(
      'r1',
      'บันทึกแล้ว\n- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
      UNDO_QUICK_REPLY
    );
  });

  it('replies with the clarification question without saving', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'กี่บาท?' });
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('ซื้อของ'));

    expect(deps.repository.insertTransactions).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', 'กี่บาท?', undefined);
  });

  it('ignores a redelivered event that was already claimed', async () => {
    const { deps, bot } = setup();
    deps.repository.claimEvent.mockResolvedValue(false);

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('replies rate limited message without calling Claude', async () => {
    const { deps, bot } = setup({ allowRequest: vi.fn().mockReturnValue(false) });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.allowRequest).toHaveBeenCalledWith('U1');
    expect(deps.parseMessage).not.toHaveBeenCalled();
    expect(deps.replyText).toHaveBeenCalledWith('r1', RATE_LIMITED_REPLY, undefined);
  });

  it('replies system error and logs user id when parse fails', async () => {
    const parseMessage = vi.fn().mockRejectedValue(new Error('overloaded'));
    const { deps, bot } = setup({ parseMessage });

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'message' },
      expect.any(Error)
    );
  });

  it('replies system error when saving fails', async () => {
    const { deps, bot } = setup();
    deps.repository.insertTransactions.mockRejectedValue(new Error('db down'));

    await bot.handleEvent(textEvent('กินข้าว 60'));

    expect(deps.replyText).toHaveBeenCalledWith('r1', SYSTEM_ERROR_REPLY, undefined);
  });

  it('ignores messages from a group', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(textEvent('กินข้าว 60', { source: { type: 'group', groupId: 'G1', userId: 'U1' } }));

    expect(deps.users.ensureUser).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('ignores sticker messages without touching the database', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent({
      type: 'message',
      webhookEventId: 'ev1',
      replyToken: 'r1',
      source: { type: 'user', userId: 'U1' },
      message: { type: 'sticker' },
    });

    expect(deps.users.ensureUser).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('uses the agreed wording for the system error message', () => {
    expect(SYSTEM_ERROR_REPLY).toBe('ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง');
  });
});

describe('bot follow event', () => {
  it('registers the user without replying', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(followEvent());

    expect(deps.users.ensureUser).toHaveBeenCalledWith('U1');
    expect(deps.replyText).not.toHaveBeenCalled();
  });

  it('logs but does not reply when registration fails', async () => {
    const users = { ensureUser: vi.fn().mockRejectedValue(new Error('db down')), loadCategoryIds: vi.fn() };
    const { deps, bot } = setup({ users });

    await bot.handleEvent(followEvent());

    expect(deps.logger.error).toHaveBeenCalledWith(
      'Failed to process event',
      { lineUserId: 'U1', eventType: 'follow' },
      expect.any(Error)
    );
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot undo postback', () => {
  it('deletes the entries of that event for this user and confirms', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));

    expect(deps.repository.deleteTransactionsByEvent).toHaveBeenCalledWith('user-1', 'ev1');
    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_DONE_REPLY, undefined);
  });

  it('tells the user when nothing was deleted', async () => {
    const { deps, bot } = setup();
    deps.repository.deleteTransactionsByEvent.mockResolvedValue(0);

    await bot.handleEvent(postbackEvent('action=undo&event=ev1'));

    expect(deps.replyText).toHaveBeenCalledWith('r2', UNDO_NOT_FOUND_REPLY, undefined);
  });

  it('ignores postback data it does not know', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=other'));

    expect(deps.repository.deleteTransactionsByEvent).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('bot.handleEvents', () => {
  it('keeps processing other events when one reply fails and logs the failure', async () => {
    const parseMessage = vi.fn().mockResolvedValue({ status: 'clarify', question: 'q' });
    const replyText = vi.fn((replyToken) =>
      replyToken === 'r1' ? Promise.reject(new Error('reply failed')) : Promise.resolve()
    );
    const { deps, bot } = setup({ parseMessage, replyText });

    await bot.handleEvents([
      textEvent('a', { replyToken: 'r1', eventId: 'e1' }),
      textEvent('b', { replyToken: 'r2', eventId: 'e2' }),
    ]);

    expect(replyText).toHaveBeenCalledWith('r2', 'q', undefined);
    expect(deps.logger.error).toHaveBeenCalledWith('Failed to handle event', expect.any(Error));
  });
});
```

ใน `src/parser/format-reply.test.js` ลบทั้งบล็อก `describe('formatParseReply', () => { ... });` และแก้ import เป็น

```js
import { formatSavedReply } from './format-reply.js';
```

แล้วย้ายเทสต์ที่ยังต้องเก็บไว้เข้า `describe('formatSavedReply', ...)` ให้ไฟล์ทั้งไฟล์เป็นดังนี้

```js
import { describe, it, expect } from 'vitest';
import { formatSavedReply } from './format-reply.js';

describe('formatSavedReply', () => {
  it('starts with saved header and lists every item', () => {
    const reply = formatSavedReply([
      { type: 'expense', category: 'อาหาร', amount: 60, date: '2026-09-29', note: 'กินข้าว' },
      { type: 'income', category: 'เงินเดือน', amount: 25000, date: '2026-09-01', note: '' },
    ]);

    expect(reply).toBe(
      [
        'บันทึกแล้ว',
        '- รายจ่าย | อาหาร | 60 บาท | 29/09 | กินข้าว',
        '- รายรับ | เงินเดือน | 25,000 บาท | 01/09',
      ].join('\n')
    );
  });

  it('keeps up to two decimal places', () => {
    const reply = formatSavedReply([
      { type: 'expense', category: 'อาหาร', amount: 1250.5, date: '2026-09-29', note: 'x' },
    ]);

    expect(reply).toContain('1,250.5 บาท');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bot.test.js src/parser/format-reply.test.js`
Expected: `src/bot.test.js` FAIL หลายเทสต์ (เช่น `SYSTEM_ERROR_REPLY` เป็น `undefined`, `insertTransactions` ไม่ถูกเรียก); `src/parser/format-reply.test.js` PASS (ใช้ `formatSavedReply` จาก Task 5)

- [ ] **Step 3: Write minimal implementation**

แทนที่ทั้งไฟล์ `src/bot.js`

```js
const { formatSavedReply } = require('./parser/format-reply');
const { toTransactionRows } = require('./db/transaction-rows');

const SYSTEM_ERROR_REPLY = 'ขออภัยส่งข้อความไม่สำเร็จเนื่องจากระบบมีปัญหา รบกวนมาใช้บริการใหม่ภายหลัง';
const RATE_LIMITED_REPLY = 'ส่งข้อความถี่เกินไป รอสักครู่แล้วลองใหม่อีกครั้ง';
const UNDO_DONE_REPLY = 'ยกเลิกรายการแล้ว';
const UNDO_NOT_FOUND_REPLY = 'ไม่พบรายการที่จะยกเลิก อาจถูกยกเลิกไปแล้ว';
const UNDO_ACTION = 'undo';

function isFromUser(event) {
  return Boolean(event.source && event.source.type === 'user' && event.source.userId);
}

function isTextMessage(event) {
  return event.type === 'message' && event.message && event.message.type === 'text';
}

function buildUndoQuickReply(webhookEventId) {
  return [
    {
      type: 'action',
      action: {
        type: 'postback',
        label: 'ยกเลิก',
        data: new URLSearchParams({ action: UNDO_ACTION, event: webhookEventId }).toString(),
        displayText: 'ยกเลิก',
      },
    },
  ];
}

function createBot({ replyText, parseMessage, repository, users, allowRequest, logger = console }) {
  async function handleText(event, lineUserId) {
    const userId = await users.ensureUser(lineUserId);
    // LINE ส่ง event เดิมซ้ำได้ (redelivery) จึงจอง event ก่อนเพื่อไม่ให้บันทึกซ้ำ
    const claimed = await repository.claimEvent(event.webhookEventId, userId);
    if (!claimed) {
      return null;
    }
    if (!allowRequest(lineUserId)) {
      return { text: RATE_LIMITED_REPLY };
    }
    const result = await parseMessage(event.message.text);
    if (result.status === 'clarify') {
      return { text: result.question };
    }
    const categoryIds = await users.loadCategoryIds(userId);
    const rows = toTransactionRows({
      items: result.items,
      categoryIds,
      userId,
      webhookEventId: event.webhookEventId,
    });
    await repository.insertTransactions(rows);
    return {
      text: formatSavedReply(result.items),
      quickReply: buildUndoQuickReply(event.webhookEventId),
    };
  }

  async function handleUndo(event, lineUserId) {
    const params = new URLSearchParams(event.postback.data);
    const webhookEventId = params.get('event');
    if (params.get('action') !== UNDO_ACTION || !webhookEventId) {
      return null;
    }
    const userId = await users.ensureUser(lineUserId);
    const deleted = await repository.deleteTransactionsByEvent(userId, webhookEventId);
    return { text: deleted > 0 ? UNDO_DONE_REPLY : UNDO_NOT_FOUND_REPLY };
  }

  async function buildReply(event, lineUserId) {
    if (event.type === 'follow') {
      await users.ensureUser(lineUserId);
      return null;
    }
    if (isTextMessage(event)) {
      return handleText(event, lineUserId);
    }
    if (event.type === 'postback') {
      return handleUndo(event, lineUserId);
    }
    return null;
  }

  async function handleEvent(event) {
    // รับเฉพาะแชต 1:1 เพราะต้องรู้ว่าบันทึกให้ผู้ใช้คนไหน
    if (!isFromUser(event)) {
      return;
    }
    const lineUserId = event.source.userId;
    let reply;
    try {
      reply = await buildReply(event, lineUserId);
    } catch (err) {
      logger.error('Failed to process event', { lineUserId, eventType: event.type }, err);
      reply = event.type === 'follow' ? null : { text: SYSTEM_ERROR_REPLY };
    }
    if (reply) {
      await replyText(event.replyToken, reply.text, reply.quickReply);
    }
  }

  async function handleEvents(events) {
    // ใช้ allSettled เพื่อ log error ของทุก event ที่พัง (Promise.all จะเก็บแค่ error แรก)
    const results = await Promise.allSettled(events.map(handleEvent));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error('Failed to handle event', result.reason);
      }
    }
  }

  return { handleEvent, handleEvents };
}

module.exports = {
  createBot,
  SYSTEM_ERROR_REPLY,
  RATE_LIMITED_REPLY,
  UNDO_DONE_REPLY,
  UNDO_NOT_FOUND_REPLY,
};
```

แทนที่ทั้งไฟล์ `src/parser/format-reply.js`

```js
const TYPE_LABELS = { expense: 'รายจ่าย', income: 'รายรับ' };

function formatAmount(amount) {
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function formatItem(item) {
  const parts = [
    TYPE_LABELS[item.type],
    item.category,
    `${formatAmount(item.amount)} บาท`,
    formatDate(item.date),
  ];
  if (item.note) {
    parts.push(item.note);
  }
  return `- ${parts.join(' | ')}`;
}

function formatSavedReply(items) {
  return ['บันทึกแล้ว', ...items.map(formatItem)].join('\n');
}

module.exports = { formatSavedReply };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bot.test.js src/parser/format-reply.test.js`
Expected: PASS ทุกเทสต์ในสองไฟล์

- [ ] **Step 5: ตรวจว่าไม่มีที่อื่นใช้ของที่ลบไป**

Run: `git grep -n "formatParseReply\|PARSE_FAILED_REPLY" -- src scripts index.js`
Expected: ไม่มีผลลัพธ์ (exit code 1)

- [ ] **Step 6: Commit**

```bash
git add src/bot.js src/bot.test.js src/parser/format-reply.js src/parser/format-reply.test.js
git commit -m "feat: save parsed entries with undo and register users on follow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: ประกอบ `index.js` + ทดสอบกับ Supabase และ LINE จริง

**Depends on:** Task 1, 2, 3, 4, 5, 6, 7, 8

**Files:**
- Modify: `index.js` (แทนที่ทั้งไฟล์)

**Interfaces:**
- Consumes: `loadConfig` (Task 2), `createRateLimiter` (Task 4), `createReplyText` (Task 5), `createRepository` (Task 6), `createUserService` (Task 7), `createBot` (Task 8), `createClient` จาก `@supabase/supabase-js`, `lineClient.getProfile(userId)` คืน `{ displayName }`
- Produces: server ที่บันทึกข้อมูลลง Supabase จริง

ไฟล์นี้ไม่มี unit test เพราะเป็นแค่จุดประกอบ logic ทั้งหมดถูกเทสต์ใน Task 2-8 แล้ว ตรวจด้วย Manual check แทน

- [ ] **Step 1: เขียน `index.js`**

```js
require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { messagingApi } = require('@line/bot-sdk');
const { createClient } = require('@supabase/supabase-js');
const { loadConfig } = require('./src/config');
const { createApp } = require('./src/app');
const { createBot } = require('./src/bot');
const { createReplyText } = require('./src/line-reply');
const { createMessageParser } = require('./src/parser/parse-message');
const { createRepository } = require('./src/db/repository');
const { createUserService } = require('./src/users');
const { createRateLimiter } = require('./src/rate-limit');

const RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 };

const config = loadConfig(process.env);

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: config.lineChannelAccessToken,
});
const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });
const parseMessage = createMessageParser({ client: anthropic, model: config.claudeModel });

// server ใช้ service role key ตรงๆ ไม่มีการ login จึงไม่ต้องเก็บหรือต่ออายุ session
const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const repository = createRepository(supabase);
const users = createUserService({
  repository,
  getDisplayName: async (lineUserId) => (await lineClient.getProfile(lineUserId)).displayName,
});
// ตัวนับอยู่ในหน่วยความจำ พอสำหรับ server instance เดียว
const allowRequest = createRateLimiter(RATE_LIMIT);

const bot = createBot({
  replyText: createReplyText(lineClient),
  parseMessage,
  repository,
  users,
  allowRequest,
});
const app = createApp({
  channelSecret: config.lineChannelSecret,
  handleEvents: bot.handleEvents,
});

app.listen(config.port, (err) => {
  if (err) {
    console.error('Failed to start server', err);
    process.exitCode = 1;
    return;
  }
  console.log(`Server listening on port ${config.port}`);
});
```

- [ ] **Step 2: ตรวจ syntax และ require ทั้งหมด**

Run: `node --check index.js`
Expected: ไม่มี output (exit code 0)

Run: `node -e "require('./src/db/repository'); require('./src/users'); require('./src/rate-limit'); require('@supabase/supabase-js'); console.log('ok')"`
Expected: พิมพ์ `ok`

- [ ] **Step 3: Run full suite**

Run: `npm test`
Expected: PASS ทุกไฟล์ (12 ไฟล์เทสต์)

- [ ] **Step 4: Commit**

```bash
git add index.js
git commit -m "feat: wire Supabase repository, user service and rate limiter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: (ผู้ใช้) ทำ Manual check ข้อ 1-9 ให้ผ่านทุกข้อ**

**Manual check (ผู้ใช้เป็นคนทำ — agent ห้าม start server เอง):**
- Preconditions: Task 1 Step 3 ผ่านครบ (ตารางมีแล้ว, `.env` มี `SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY`), หยุด `npm start` ตัวเก่าแล้ว `npm start` ใหม่ที่ port 3000, `ngrok http 3000` รันอยู่ และ Webhook URL ใน LINE Developers Console ชี้ไปที่ URL ngrok ปัจจุบัน
- ดูข้อมูลในตารางได้ที่เว็บ Supabase > เมนูซ้าย `Table Editor` > เลือกชื่อตาราง
- ทุกข้อที่ส่งข้อความถึง Claude มีค่าใช้จ่าย API เล็กน้อย

| # | Action | Expected |
|---|---|---|
| 1 | ในแอป LINE ส่ง `กินข้าว 60 กาแฟ 45` | บอทตอบ `บันทึกแล้ว` ตามด้วย 2 บรรทัด รายจ่ายหมวดอาหาร 60 บาท และ 45 บาท และมีปุ่ม `ยกเลิก` ลอยอยู่ใต้ข้อความ |
| 2 | Supabase `Table Editor` > `users` | มี 1 แถว `display_name` เป็นชื่อ LINE ของคุณ |
| 3 | `Table Editor` > `categories` | มี 10 แถวของ user นั้น (รายจ่าย 7 รายรับ 3) |
| 4 | `Table Editor` > `transactions` | มี 2 แถว `amount` = `60` และ `45` `source` = `text` และ `line_event_id` ของทั้งสองแถวเป็นค่าเดียวกัน |
| 5 | กลับไปแอป LINE กดปุ่ม `ยกเลิก` จากข้อ 1 | ในแชตขึ้นข้อความ `ยกเลิก` จากฝั่งคุณ แล้วบอทตอบ `ยกเลิกรายการแล้ว`; กด refresh ตาราง `transactions` แล้วไม่เหลือ 2 แถวนั้น |
| 6 | ส่ง `ซื้อของ` | บอทตอบเป็นคำถามสั้นๆ ภาษาไทย ไม่มีปุ่มยกเลิก และ `transactions` ไม่มีแถวใหม่ |
| 7 | ส่ง `ซื้อรถ 20000000` | บอทตอบเป็นคำถามให้บอกรายการและจำนวนเงินอีกครั้ง และ `transactions` ไม่มีแถวใหม่ |
| 8 | ตรวจว่า anon key อ่านข้อมูลไม่ได้: ส่ง `กาแฟ 50` ให้มีข้อมูล 1 แถวก่อน แล้วใน PowerShell รัน `curl.exe "<SUPABASE_URL>/rest/v1/transactions?select=*" -H "apikey: <publishable หรือ anon key>"` (key จาก `Project Settings` > `API Keys` ฝั่ง publishable/anon ไม่ใช่ secret) | ได้ผลลัพธ์ `[]` แม้ใน `Table Editor` จะเห็นแถวของ `กาแฟ 50` |
| 9 | สมัครเมื่อเพิ่มเพื่อน: ใน `Table Editor` > `users` ลบแถวของคุณ (ข้อมูลทดสอบทั้งหมดของคุณจะถูกลบตาม) แล้วในแอป LINE บล็อกบอท และเลิกบล็อก | refresh `users` แล้วมีแถวของคุณกลับมาพร้อม `display_name` และ `categories` มี 10 แถวใหม่ บอทไม่ส่งข้อความ error และ terminal ของ `npm start` ไม่มี log `Failed to process event` |

---

## ข้อจำกัดที่ตั้งใจเลื่อนไปขั้นถัดไป

- ปุ่ม "แก้ไข" ของ Quick Reply ย้ายไปทำในขั้นที่ 6 (หน้าเว็บ LIFF) ขั้นนี้มีแค่ "ยกเลิก"
- การถามกลับยังไม่จำบริบท: คำตอบของผู้ใช้หลังบอทถามจะถูกแยกเป็นข้อความใหม่
- parser ยังใช้หมวด default จากโค้ด (ชุดเดียวกับที่ seed ให้ผู้ใช้) การให้ผู้ใช้เพิ่มหมวดเองต้องรอหน้าเว็บ LIFF
- rate limiter อยู่ในหน่วยความจำ รีสตาร์ต server แล้วตัวนับเริ่มใหม่ และไม่ลบ key ของผู้ใช้ที่ไม่ได้ใช้แล้ว (พอสำหรับผู้ใช้จำนวนน้อย)
- ตาราง `line_events` โตขึ้นเรื่อยๆ หนึ่งแถวต่อข้อความ ยังไม่มีงานลบของเก่า
- `npm run try-parse` ต้องมี key ของ Supabase ใน `.env` ด้วย เพราะใช้ `loadConfig` ตัวเดียวกัน
- การกันบันทึกซ้ำจาก redelivery ทดสอบได้แค่ด้วย unit test เพราะสั่งให้ LINE ส่ง event ซ้ำเองไม่ได้
- event จาก group/room ถูกข้ามโดยไม่ตอบอะไร
