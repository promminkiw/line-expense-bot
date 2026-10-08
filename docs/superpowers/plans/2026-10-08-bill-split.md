# Bill Split (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เจ้าของบิลสร้างบิลในแท็บใหม่ "หารบิล" ของหน้า LIFF เลือกเพื่อน หารเท่าหรือแก้ยอดรายคน ระบบบันทึกส่วนของเจ้าของทันที บอท push การ์ดให้เพื่อนกดยืนยัน/ปฏิเสธ (หรือยืนยันในเว็บ) ยืนยันแล้วบันทึกเป็นรายจ่ายของเพื่อน เจ้าของติ๊ก "คืนแล้ว" และยกเลิกบิลได้

**Architecture:** DB เพิ่มตาราง `bills` และ `bill_members` กับ SQL function `create_bill`, `confirm_bill_share`, `decline_bill_share` ที่ทำงานแบบ atomic (migration `013_bills.sql`) และเพิ่ม `'bill'` ใน `transactions.source` ฝั่ง server เพิ่ม `src/bills/` (ตรวจ input, service, flex card, router) mount ที่ `/api/bills` หลัง middleware ตรวจ ID token และให้ `src/bot.js` รับ postback `bill_confirm`/`bill_decline` จากการ์ด ฝั่งหน้าเว็บเพิ่มแท็บ `bills` คุมด้วยโมดูล `bills-panel.mjs` (รายการ) และ `bill-form.mjs` (ฟอร์มสร้าง)

**Tech Stack:** Node.js 22 (CommonJS), Express 5, supabase-js, PGlite (เทสต์ SQL), @line/bot-sdk (push Flex), LIFF v2, vitest + jsdom

**Branch:** `feat/bill-split` (สร้างจาก `main` แล้ว)

## Global Constraints

- ผู้ใช้ตัดสินแล้ว: เพื่อนที่ push ไม่ถึง (ยังไม่เพิ่มบอท) ยืนยันในเว็บได้ และหน้าบิลของเจ้าของบอก "แจ้งเตือนไม่ถึง" พร้อมปุ่มส่งลิงก์บิล; สร้างแล้วแก้บิลไม่ได้ (ยกเลิกแล้วสร้างใหม่); ยกเลิกบิลแล้วเพื่อนที่ยังไม่ตอบกดยืนยันไม่ได้ และไม่ push แจ้ง; ยังไม่ทำระบบบล็อก; สถานะการตอบแสดงในหน้าบิลอย่างเดียว ไม่ push กลับหาเจ้าของ; เจ้าของบันทึกเฉพาะส่วนของตัวเอง; หมวดเลือกตอนสร้าง ค่าเริ่มต้น `อาหาร`
- หารเท่ากันคิดเป็นสตางค์: `base = floor(totalSatang / n)` ทุกคน และเศษ `totalSatang - base * n` ให้เจ้าของ (n = เพื่อนที่เลือก + เจ้าของ)
- ตรวจ input ของการสร้างบิล: `title` ตัดช่องว่างหัวท้าย ยาว 1-60 ตัว (นับ code point); `total` > 0, ≤ 10,000,000, ทศนิยมไม่เกิน 2 ตำแหน่ง; `occurredOn` เป็น `YYYY-MM-DD` ที่เป็นวันจริง; `categoryId` เป็นหมวดรายจ่ายของเจ้าของ; `members` 1-20 คน ไม่ซ้ำ ไม่ใช่ตัวเอง และต้องเป็นเพื่อนอยู่; `share` ของแต่ละคน > 0 ทศนิยมไม่เกิน 2; `ownerShare` ≥ 0 ทศนิยมไม่เกิน 2; ผลรวม `ownerShare + shares` (เป็นสตางค์) เท่ากับ `total`
- สถานะของบิล: `open` | `cancelled`; สถานะของสมาชิก: `pending` | `confirmed` | `declined`; `paid` boolean (เจ้าของติ๊ก); `notified` boolean (push สำเร็จ)
- รายการของเพื่อนที่ยืนยัน: `type 'expense'`, หมวดของเพื่อนที่ชื่อเดียวกับหมวดของบิล ถ้าไม่มีใช้ `อื่นๆ`, `amount = share`, `note = title`, `occurred_on = occurredOn ของบิล`, `source 'bill'`
- API (ทุกเส้นอยู่หลัง ID token, ใช้ `req.userId` เท่านั้น):
  - `GET /api/bills` → 200 `{ owned: OwnedBill[], incoming: IncomingBill[] }` (อย่างละไม่เกิน 50 ใบ ใหม่สุดก่อน)
  - `POST /api/bills` body `{ title, total, occurredOn, categoryId, ownerShare, members: [{ userId, share }] }` → 201 `{ id, notNotified: string[] }` | 400 `{ error: '<code>' }` (code จากตัวตรวจ input หรือ `Not friends` / `Invalid category`) | 429 `Too many requests`
  - `POST /api/bills/:id/cancel` → 200 `{ status: 'cancelled' }` | 404
  - `POST /api/bills/:id/members/:userId/paid` body `{ paid: boolean }` → 200 `{ paid }` | 400 `Invalid body` | 404
  - `POST /api/bills/:id/confirm` และ `/decline` → 200 `{ status: 'confirmed' | 'declined' | 'cancelled' }` | 404
  - id ที่ไม่ใช่ UUID ได้ 404 ก่อนถึง service
  - `OwnedBill = { id, title, total, occurredOn, categoryName, status, ownerShare, createdAt, members: [{ userId, displayName, share, status, paid, notified }] }`
  - `IncomingBill = { id, title, total, occurredOn, categoryName, status, ownerName, myShare, myStatus, paid }`
- rate limit การสร้างบิล 10 ใบ/ชั่วโมง/ผู้ใช้ (แต่ละใบใช้โควตา push ตามจำนวนเพื่อน)
- การ์ดใน LINE: ปุ่ม postback `action=bill_confirm&bill=<id>` ("ยืนยัน") และ `action=bill_decline&bill=<id>` ("ปฏิเสธ") กับปุ่ม uri "ดูในเว็บ" ไปที่ `<liffUrl>?bill=<id>`
- ข้อความตอบ postback: ยืนยัน `บันทึกส่วนของคุณ <ยอด> บาท ในหมวด <หมวด> แล้ว`; ปฏิเสธ `ปฏิเสธบิลนี้แล้ว`; บิลถูกยกเลิก `บิลนี้ถูกยกเลิกแล้ว`; เคยยืนยันแล้ว `คุณยืนยันบิลนี้ไปแล้ว`; เคยปฏิเสธแล้ว `คุณปฏิเสธบิลนี้ไปแล้ว`; ไม่พบ `ไม่พบบิลนี้`
- ชื่อที่แสดง: ใช้ `FALLBACK_DISPLAY_NAME` (`ผู้ใช้ LINE`) จาก `src/friends/service.js` เมื่อชื่อเป็น null
- log ห้ามมีชื่อผู้ใช้ ชื่อบิล หรือยอดเงิน (ใส่ได้แค่ id)
- migration `supabase/013_bills.sql` ผู้ใช้รันเองใน Supabase SQL Editor
- ห้ามเพิ่ม npm dependency; โค้ดใน `src/` เป็น CommonJS ไฟล์เทสต์เป็น ESM; หน้า LIFF เป็น ES module ไม่มี build
- คอมเมนต์สั้นบรรทัดเดียว ภาษาไทย อธิบาย "ทำไม" เท่านั้น; ชื่อตัวแปร/function/log เป็นภาษาอังกฤษ; ห้าม emoji ในโค้ด คอมเมนต์ log และ commit message
- ห้าม commit `.env`; ห้าม start server
- รันเทสต์ด้วย `npx vitest run <file>`; ก่อนจบทุก task รัน `npm test` และ `npm run lint` ให้ผ่าน
- ทุก commit ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

---

### Task 1: Bills migration and SQL functions

**Depends on:** none

**Files:**
- Create: `supabase/013_bills.sql`
- Modify: `supabase/schema.sql:1` (บรรทัดลำดับ migration)
- Test: `src/db/sql-functions.test.js`

**Interfaces:**
- Produces: ตาราง `bills(id, owner_id, title, total, category_id, occurred_on, owner_share, status, owner_transaction_id, created_at)`, `bill_members(bill_id, user_id, share, status, paid, notified, transaction_id, responded_at, created_at)`; functions `create_bill(p_owner uuid, p_title text, p_total numeric, p_category uuid, p_date date, p_owner_share numeric, p_members jsonb) returns uuid`, `confirm_bill_share(p_bill uuid, p_user uuid, p_category uuid) returns text`, `decline_bill_share(p_bill uuid, p_user uuid) returns text`; `transactions.source` รับ `'bill'`

- [ ] **Step 1: Write the failing tests**

ใน `src/db/sql-functions.test.js` เพิ่ม `'013_bills.sql'` ต่อท้าย `MIGRATIONS` แล้วเพิ่ม describe นี้ก่อน `describe('function permissions'`:

```js
describe('013_bills.sql', () => {
  async function setupBill({ ownerShare = 100, shares = [150, 150] } = {}) {
    const owner = await createUser('U1');
    const friends = [];
    for (const [index] of shares.entries()) friends.push(await createUser(`F${index}`));
    const food = await createCategory(owner, 'อาหาร', 'expense');
    const total = ownerShare + shares.reduce((sum, share) => sum + share, 0);
    const members = JSON.stringify(friends.map((userId, index) => ({ user_id: userId, share: shares[index] })));
    const bill = (
      await one('select create_bill($1, $2, $3, $4, $5, $6, $7) as id', [owner, 'เนื้อย่าง', total, food, '2026-10-08', ownerShare, members])
    ).id;
    return { owner, friends, food, bill, total };
  }

  it('creates the bill, the owner transaction and one pending row per member in one call', async () => {
    const { owner, friends, bill } = await setupBill();

    const saved = await one('select owner_id, title, total, status, owner_share, owner_transaction_id from bills where id = $1', [bill]);
    expect(numbers(saved)).toMatchObject({ owner_id: owner, title: 'เนื้อย่าง', total: 400, status: 'open', owner_share: 100 });
    const ownerTx = await one('select user_id, type, amount, note, occurred_on::text, source from transactions where id = $1', [
      saved.owner_transaction_id,
    ]);
    expect(numbers(ownerTx)).toEqual({ user_id: owner, type: 'expense', amount: 100, note: 'เนื้อย่าง', occurred_on: '2026-10-08', source: 'bill' });
    const members = await rows('select user_id, share, status, paid, notified from bill_members where bill_id = $1 order by share', [bill]);
    expect(members.map(numbers).map((row) => row.user_id).sort()).toEqual([...friends].sort());
    expect(members.every((row) => row.status === 'pending' && row.paid === false && row.notified === false)).toBe(true);
  });

  it('records no owner transaction when the owner share is zero', async () => {
    const { bill } = await setupBill({ ownerShare: 0, shares: [200] });

    expect((await one('select owner_transaction_id from bills where id = $1', [bill])).owner_transaction_id).toBeNull();
    expect(Number((await one('select count(*) from transactions')).count)).toBe(0);
  });

  it('confirms a pending share once, recording the friend expense in the given category', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');

    const first = await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood]);
    const again = await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood]);

    expect([first.status, again.status]).toEqual(['confirmed', 'confirmed']);
    const member = await one('select status, transaction_id, responded_at from bill_members where bill_id = $1 and user_id = $2', [bill, friends[0]]);
    expect(member.status).toBe('confirmed');
    expect(member.responded_at).not.toBeNull();
    const tx = await one('select user_id, category_id, amount, note, source from transactions where id = $1', [member.transaction_id]);
    expect(numbers(tx)).toEqual({ user_id: friends[0], category_id: friendFood, amount: 150, note: 'เนื้อย่าง', source: 'bill' });
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(1);
  });

  it('declines a pending share and reports earlier answers without changing them', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');

    expect((await one('select decline_bill_share($1, $2) as status', [bill, friends[1]])).status).toBe('declined');
    expect((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status).toBe('confirmed');
    expect((await one('select decline_bill_share($1, $2) as status', [bill, friends[0]])).status).toBe('confirmed');
    expect((await one('select status from bill_members where bill_id = $1 and user_id = $2', [bill, friends[1]])).status).toBe('declined');
  });

  it('refuses to confirm or decline once the bill is cancelled, and reports a stranger as not found', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');
    const stranger = await createUser('S1');
    await db.query("update bills set status = 'cancelled' where id = $1", [bill]);

    expect((await one('select confirm_bill_share($1, $2, $3) as status', [bill, friends[0], friendFood])).status).toBe('cancelled');
    expect((await one('select decline_bill_share($1, $2) as status', [bill, friends[1]])).status).toBe('cancelled');
    expect((await one('select decline_bill_share($1, $2) as status', [bill, stranger])).status).toBe('not_found');
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(0);
  });

  it('rejects a non-positive share, an unknown status and the same member twice', async () => {
    const { friends, bill } = await setupBill();

    for (const sql of [
      ['update bill_members set share = 0 where bill_id = $1', [bill]],
      ["update bill_members set status = 'maybe' where bill_id = $1", [bill]],
      ["update bills set status = 'paid' where id = $1", [bill]],
      ['insert into bill_members (bill_id, user_id, share) values ($1, $2, 10)', [bill, friends[0]]],
    ]) {
      await db.exec('savepoint bad');
      await expect(db.query(sql[0], sql[1])).rejects.toThrow();
      await db.exec('rollback to savepoint bad');
    }
  });

  it('removes the members with the bill and keeps a confirmed expense when the bill is deleted', async () => {
    const { friends, bill } = await setupBill();
    const friendFood = await createCategory(friends[0], 'อาหาร', 'expense');
    await one('select confirm_bill_share($1, $2, $3)', [bill, friends[0], friendFood]);

    await db.query('delete from bills where id = $1', [bill]);

    expect(Number((await one('select count(*) from bill_members')).count)).toBe(0);
    expect(Number((await one('select count(*) from transactions where user_id = $1', [friends[0]])).count)).toBe(1);
  });
});
```

ใน `describe('function permissions'` เพิ่ม 3 รายการใน array `calls`:

```js
    ['create_bill', "select create_bill(gen_random_uuid(), 'x', 1, gen_random_uuid(), '2026-10-08', 0, '[]'::jsonb)"],
    ['confirm_bill_share', 'select confirm_bill_share(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())'],
    ['decline_bill_share', 'select decline_bill_share(gen_random_uuid(), gen_random_uuid())'],
```

และในเทสต์ `lets service_role call %s` เปลี่ยนเงื่อนไขพิเศษเป็น:

```js
    if (name === 'apply_recurring_rule') {
      await expect(query).rejects.toThrow('invalid recurring event id');
    } else if (name === 'create_bill') {
      // owner และหมวดสุ่มขึ้นมาจึงชน FK แต่ต้องผ่านการตรวจสิทธิ์มาก่อน
      await expect(query).rejects.toThrow('foreign key');
    } else {
      await expect(query).resolves.toBeDefined();
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: FAIL — `ENOENT ... supabase\013_bills.sql`

- [ ] **Step 3: Write the migration**

`supabase/013_bills.sql`:

```sql
-- รันใน Supabase SQL Editor ต่อจาก 012 เพื่อเปิดใช้การหารบิล (เฟส 2)

-- รายการที่มาจากบิลหารต้องแยกที่มาได้
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions
  add constraint transactions_source_check check (source in ('text', 'slip', 'recurring', 'bill'));

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  total numeric(12, 2) not null check (total > 0 and total <= 10000000),
  category_id uuid not null,
  occurred_on date not null,
  owner_share numeric(12, 2) not null default 0 check (owner_share >= 0),
  status text not null default 'open' check (status in ('open', 'cancelled')),
  owner_transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (category_id, owner_id) references public.categories (id, user_id)
);

create index bills_owner_created_idx on public.bills (owner_id, created_at desc);

create table public.bill_members (
  bill_id uuid not null references public.bills (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  share numeric(12, 2) not null check (share > 0 and share <= 10000000),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  paid boolean not null default false,
  notified boolean not null default false,
  transaction_id uuid references public.transactions (id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (bill_id, user_id)
);

create index bill_members_user_created_idx on public.bill_members (user_id, created_at desc);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.bills enable row level security;
alter table public.bill_members enable row level security;

-- สร้างบิล รายการของเจ้าของ และแถวสมาชิกใน transaction เดียว ถ้าส่วนไหนพังจะไม่เหลือบิลครึ่งๆ กลางๆ
create or replace function public.create_bill(
  p_owner uuid, p_title text, p_total numeric, p_category uuid, p_date date, p_owner_share numeric, p_members jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_bill uuid;
  owner_tx uuid;
begin
  insert into public.bills (owner_id, title, total, category_id, occurred_on, owner_share)
  values (p_owner, p_title, p_total, p_category, p_date, p_owner_share)
  returning id into new_bill;

  if p_owner_share > 0 then
    insert into public.transactions (user_id, type, category_id, amount, note, occurred_on, source)
    values (p_owner, 'expense', p_category, p_owner_share, p_title, p_date, 'bill')
    returning id into owner_tx;
    update public.bills set owner_transaction_id = owner_tx where id = new_bill;
  end if;

  insert into public.bill_members (bill_id, user_id, share)
  select new_bill, m.user_id, m.share
  from jsonb_to_recordset(p_members) as m(user_id uuid, share numeric);

  return new_bill;
end
$$;

-- for update กันการกดยืนยันซ้อนกันสองครั้งจนบันทึกซ้ำ
create or replace function public.confirm_bill_share(p_bill uuid, p_user uuid, p_category uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  m public.bill_members%rowtype;
  b public.bills%rowtype;
  tx uuid;
begin
  select * into m from public.bill_members where bill_id = p_bill and user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  if m.status <> 'pending' then
    return m.status;
  end if;
  select * into b from public.bills where id = p_bill;
  if b.status = 'cancelled' then
    return 'cancelled';
  end if;

  insert into public.transactions (user_id, type, category_id, amount, note, occurred_on, source)
  values (p_user, 'expense', p_category, m.share, b.title, b.occurred_on, 'bill')
  returning id into tx;
  update public.bill_members
  set status = 'confirmed', transaction_id = tx, responded_at = now()
  where bill_id = p_bill and user_id = p_user;
  return 'confirmed';
end
$$;

create or replace function public.decline_bill_share(p_bill uuid, p_user uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  m public.bill_members%rowtype;
  bill_status text;
begin
  select * into m from public.bill_members where bill_id = p_bill and user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  if m.status <> 'pending' then
    return m.status;
  end if;
  select status into bill_status from public.bills where id = p_bill;
  if bill_status = 'cancelled' then
    return 'cancelled';
  end if;
  update public.bill_members set status = 'declined', responded_at = now() where bill_id = p_bill and user_id = p_user;
  return 'declined';
end
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นเหมือน function อื่น
revoke execute on function public.create_bill(uuid, text, numeric, uuid, date, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.create_bill(uuid, text, numeric, uuid, date, numeric, jsonb) to service_role;
revoke execute on function public.confirm_bill_share(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_bill_share(uuid, uuid, uuid) to service_role;
revoke execute on function public.decline_bill_share(uuid, uuid) from public, anon, authenticated;
grant execute on function public.decline_bill_share(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
```

แก้บรรทัดที่ 1 ของ `supabase/schema.sql` จาก `... 011_slip_category.sql และ 012_friends.sql ต่อตามลำดับ` เป็น `... 011_slip_category.sql, 012_friends.sql และ 013_bills.sql ต่อตามลำดับ`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/sql-functions.test.js`
Expected: PASS ทั้งหมด (ถ้าชื่อ constraint เดิมไม่ใช่ `transactions_source_check` การ drop จะ error ให้หยุดแล้วรายงาน NEEDS_CONTEXT พร้อมชื่อที่เจอจาก `select conname from pg_constraint where conrelid = 'transactions'::regclass`)

- [ ] **Step 5: Commit**

```bash
git add supabase/013_bills.sql supabase/schema.sql src/db/sql-functions.test.js
git commit -m "feat: add bills tables and atomic create, confirm and decline functions"
```

---

### Task 2: Bill input validation and split helpers

**Depends on:** none

**Files:**
- Create: `src/bills/validate.js`
- Test: `src/bills/validate.test.js`

**Interfaces:**
- Produces: `toSatang(amount: number): number | null` (null เมื่อไม่ใช่จำนวนบวก/ศูนย์ที่มีทศนิยมไม่เกิน 2), `splitEvenly(totalSatang: number, count: number): { base: number, remainder: number }`, `validateBillInput(body: unknown, ownerId: string): { ok: true, value: { title, total, occurredOn, categoryId, ownerShare, members: [{ userId, share }] } } | { ok: false, error: string }`, `MAX_BILL_MEMBERS = 20`, `MAX_BILL_TITLE = 60`
- error codes: `Invalid title`, `Invalid total`, `Invalid date`, `Invalid category`, `Invalid members`, `Invalid share`, `Shares do not add up`

- [ ] **Step 1: Write the failing test**

`src/bills/validate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { toSatang, splitEvenly, validateBillInput, MAX_BILL_MEMBERS } from './validate.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const F1 = '22222222-2222-2222-2222-222222222222';
const F2 = '33333333-3333-3333-3333-333333333333';
const CATEGORY = '44444444-4444-4444-4444-444444444444';

function body(overrides = {}) {
  return {
    title: ' เนื้อย่าง ',
    total: 1000,
    occurredOn: '2026-10-08',
    categoryId: CATEGORY,
    ownerShare: 333.34,
    members: [
      { userId: F1, share: 333.33 },
      { userId: F2, share: 333.33 },
    ],
    ...overrides,
  };
}

describe('toSatang', () => {
  it('turns baht with up to two decimals into whole satang', () => {
    expect(toSatang(1000)).toBe(100000);
    expect(toSatang(333.33)).toBe(33333);
    expect(toSatang(0.1 + 0.2)).toBe(30);
    expect(toSatang(0)).toBe(0);
  });

  it('rejects negatives, more than two decimals and non-numbers', () => {
    for (const value of [-1, 1.005, '10', NaN, Infinity, null]) {
      expect(toSatang(value)).toBeNull();
    }
  });
});

describe('splitEvenly', () => {
  it('gives everyone the floor and keeps the leftover satang apart', () => {
    expect(splitEvenly(100000, 3)).toEqual({ base: 33333, remainder: 1 });
    expect(splitEvenly(90000, 3)).toEqual({ base: 30000, remainder: 0 });
  });
});

describe('validateBillInput', () => {
  it('accepts a valid bill and trims the title', () => {
    const result = validateBillInput(body(), OWNER);

    expect(result).toEqual({
      ok: true,
      value: {
        title: 'เนื้อย่าง',
        total: 1000,
        occurredOn: '2026-10-08',
        categoryId: CATEGORY,
        ownerShare: 333.34,
        members: [
          { userId: F1, share: 333.33 },
          { userId: F2, share: 333.33 },
        ],
      },
    });
  });

  it('allows the owner share to be zero', () => {
    const result = validateBillInput(body({ ownerShare: 0, members: [{ userId: F1, share: 1000 }] }), OWNER);

    expect(result.ok).toBe(true);
  });

  it.each([
    ['a missing or empty title', { title: '   ' }, 'Invalid title'],
    ['a title over 60 characters', { title: 'ก'.repeat(61) }, 'Invalid title'],
    ['a zero total', { total: 0 }, 'Invalid total'],
    ['a total over the limit', { total: 10000000.01 }, 'Invalid total'],
    ['a total with three decimals', { total: 1000.001 }, 'Invalid total'],
    ['a date that does not exist', { occurredOn: '2026-02-30' }, 'Invalid date'],
    ['a date in another format', { occurredOn: '08/10/2026' }, 'Invalid date'],
    ['a category that is not a uuid', { categoryId: 'food' }, 'Invalid category'],
    ['no members', { members: [] }, 'Invalid members'],
    ['the owner as a member', { members: [{ userId: OWNER, share: 666.66 }] }, 'Invalid members'],
    ['the same member twice', { members: [{ userId: F1, share: 333.33 }, { userId: F1, share: 333.33 }] }, 'Invalid members'],
    ['a member id that is not a uuid', { members: [{ userId: 'x', share: 666.66 }] }, 'Invalid members'],
    ['a zero share', { members: [{ userId: F1, share: 0 }, { userId: F2, share: 666.66 }] }, 'Invalid share'],
    ['a negative owner share', { ownerShare: -1 }, 'Invalid share'],
    ['shares that miss the total by one satang', { ownerShare: 333.33 }, 'Shares do not add up'],
  ])('rejects %s', (name, overrides, error) => {
    expect(validateBillInput(body(overrides), OWNER)).toEqual({ ok: false, error });
  });

  it('rejects more than the member limit and a body that is not an object', () => {
    const members = Array.from({ length: MAX_BILL_MEMBERS + 1 }, (_, index) => ({
      userId: `55555555-5555-5555-5555-${String(index).padStart(12, '0')}`,
      share: 1,
    }));

    expect(validateBillInput(body({ total: members.length, ownerShare: 0, members }), OWNER)).toEqual({ ok: false, error: 'Invalid members' });
    expect(validateBillInput(null, OWNER)).toEqual({ ok: false, error: 'Invalid title' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bills/validate.test.js`
Expected: FAIL — `Failed to load url ./validate.js`

- [ ] **Step 3: Write minimal implementation**

`src/bills/validate.js`:

```js
const { isValidCalendarDate } = require('../utils/date');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BILL_MEMBERS = 20;
const MAX_BILL_TITLE = 60;
// เพดานเดียวกับ check constraint ของยอดเงินใน supabase
const MAX_SATANG = 10000000 * 100;

// คิดเป็นสตางค์เพื่อเทียบผลรวมได้แม่น ไม่ให้ทศนิยมลอยตัวทำให้ยอดไม่ลงตัว
function toSatang(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
    return null;
  }
  const satang = Math.round(amount * 100);
  return Math.abs(satang - amount * 100) < 1e-6 ? satang : null;
}

function splitEvenly(totalSatang, count) {
  const base = Math.floor(totalSatang / count);
  return { base, remainder: totalSatang - base * count };
}

function fail(error) {
  return { ok: false, error };
}

function validateBillInput(body, ownerId) {
  const input = body && typeof body === 'object' ? body : {};
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const titleLength = Array.from(title).length;
  if (titleLength < 1 || titleLength > MAX_BILL_TITLE) return fail('Invalid title');
  const totalSatang = toSatang(input.total);
  if (!totalSatang || totalSatang > MAX_SATANG) return fail('Invalid total');
  if (typeof input.occurredOn !== 'string' || !isValidCalendarDate(input.occurredOn)) return fail('Invalid date');
  if (typeof input.categoryId !== 'string' || !UUID_PATTERN.test(input.categoryId)) return fail('Invalid category');
  const members = Array.isArray(input.members) ? input.members : [];
  const ids = members.map((member) => (member && typeof member.userId === 'string' ? member.userId : ''));
  if (
    members.length < 1 ||
    members.length > MAX_BILL_MEMBERS ||
    ids.some((id) => !UUID_PATTERN.test(id) || id === ownerId) ||
    new Set(ids).size !== ids.length
  ) {
    return fail('Invalid members');
  }
  const shareSatang = members.map((member) => toSatang(member.share));
  const ownerSatang = toSatang(input.ownerShare);
  if (ownerSatang === null || shareSatang.some((satang) => !satang || satang > MAX_SATANG)) return fail('Invalid share');
  if (ownerSatang + shareSatang.reduce((sum, satang) => sum + satang, 0) !== totalSatang) return fail('Shares do not add up');
  return {
    ok: true,
    value: {
      title,
      total: totalSatang / 100,
      occurredOn: input.occurredOn,
      categoryId: input.categoryId,
      ownerShare: ownerSatang / 100,
      members: members.map((member, index) => ({ userId: member.userId, share: shareSatang[index] / 100 })),
    },
  };
}

module.exports = { toSatang, splitEvenly, validateBillInput, MAX_BILL_MEMBERS, MAX_BILL_TITLE };
```

ก่อนใช้ `isValidCalendarDate` ให้เปิด `src/utils/date.js` ยืนยันว่า export ชื่อนี้และรับ `YYYY-MM-DD` แล้วคืน false สำหรับ `2026-02-30` และ `08/10/2026` (ถ้าไม่ตรง หยุดแล้วรายงาน NEEDS_CONTEXT)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bills/validate.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bills/validate.js src/bills/validate.test.js
git commit -m "feat: add bill input validation and even split helpers"
```

---

### Task 3: Repository methods for bills

**Depends on:** Task 1

**Files:**
- Modify: `src/db/repository.js` (เพิ่ม method และใส่ในวัตถุที่ return)
- Test: `src/db/repository.test.js`

**Interfaces:**
- Consumes: ตารางและ function จาก Task 1
- Produces (บน object ของ `createRepository`):
  - `createBill({ ownerId, title, total, occurredOn, categoryId, ownerShare, members: [{ userId, share }] }): Promise<string>` (bill id)
  - `markBillMemberNotified(billId, userId): Promise<void>`
  - `listOwnedBills(ownerId): Promise<OwnedBillRow[]>` โดย `OwnedBillRow = { id, title, total, occurredOn, categoryName, status, ownerShare, createdAt, members: [{ userId, displayName: string|null, share, status, paid, notified }] }`
  - `listIncomingBills(userId): Promise<IncomingBillRow[]>` โดย `IncomingBillRow = { id, title, total, occurredOn, categoryName, status, ownerName: string|null, myShare, myStatus, paid }`
  - `getBillShare(billId, userId): Promise<{ share: number, categoryName: string } | null>`
  - `confirmBillShare(billId, userId, categoryId): Promise<string>` และ `declineBillShare(billId, userId): Promise<string>` (สถานะจาก SQL function)
  - `cancelBill(billId, ownerId): Promise<boolean>` (true เมื่อบิลเปิดอยู่และเป็นของ owner)
  - `isBillOwner(billId, ownerId): Promise<boolean>`
  - `setBillMemberPaid(billId, userId, paid): Promise<boolean>`
  - `getLineUserIds(userIds: string[]): Promise<Map<string, string>>` (user id → line user id)

- [ ] **Step 1: Write the failing tests**

เพิ่มท้าย `src/db/repository.test.js`:

```js
describe('repository bills', () => {
  const BILL = 'b1';

  it('creates a bill through the create_bill function', async () => {
    const { supabase, calls } = fakeSupabase({ data: 'bill-1', error: null });

    const id = await createRepository(supabase).createBill({
      ownerId: 'user-1',
      title: 'เนื้อย่าง',
      total: 400,
      occurredOn: '2026-10-08',
      categoryId: 'c1',
      ownerShare: 100,
      members: [{ userId: 'user-2', share: 300 }],
    });

    expect(id).toBe('bill-1');
    expect(calls).toEqual([
      [
        'rpc',
        'create_bill',
        {
          p_owner: 'user-1',
          p_title: 'เนื้อย่าง',
          p_total: 400,
          p_category: 'c1',
          p_date: '2026-10-08',
          p_owner_share: 100,
          p_members: [{ user_id: 'user-2', share: 300 }],
        },
      ],
    ]);
  });

  it('marks a member as notified', async () => {
    const { supabase, calls } = fakeSupabase({ data: null, error: null });

    await createRepository(supabase).markBillMemberNotified(BILL, 'user-2');

    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['update', { notified: true }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
  });

  it('lists the owner bills newest first with members, names and numbers', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        {
          id: BILL,
          title: 'เนื้อย่าง',
          total: '400.00',
          occurred_on: '2026-10-08',
          status: 'open',
          owner_share: '100.00',
          created_at: '2026-10-08T10:00:00+00:00',
          categories: { name: 'อาหาร' },
          bill_members: [
            { user_id: 'user-2', share: '300.00', status: 'pending', paid: false, notified: true, users: { display_name: 'บี' } },
          ],
        },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listOwnedBills('user-1')).toEqual([
      {
        id: BILL,
        title: 'เนื้อย่าง',
        total: 400,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerShare: 100,
        createdAt: '2026-10-08T10:00:00+00:00',
        members: [{ userId: 'user-2', displayName: 'บี', share: 300, status: 'pending', paid: false, notified: true }],
      },
    ]);
    expect(calls).toEqual([
      ['from', 'bills'],
      [
        'select',
        'id, title, total, occurred_on, status, owner_share, created_at, categories(name), bill_members(user_id, share, status, paid, notified, users(display_name))',
      ],
      ['eq', 'owner_id', 'user-1'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 50],
    ]);
  });

  it('lists the bills shared with a user newest first', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        {
          share: '150.00',
          status: 'pending',
          paid: false,
          bills: {
            id: BILL,
            title: 'เนื้อย่าง',
            total: '400.00',
            occurred_on: '2026-10-08',
            status: 'open',
            categories: { name: 'อาหาร' },
            users: { display_name: null },
          },
        },
      ],
      error: null,
    });

    expect(await createRepository(supabase).listIncomingBills('user-2')).toEqual([
      {
        id: BILL,
        title: 'เนื้อย่าง',
        total: 400,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerName: null,
        myShare: 150,
        myStatus: 'pending',
        paid: false,
      },
    ]);
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, status, paid, bills(id, title, total, occurred_on, status, categories(name), users(display_name))'],
      ['eq', 'user_id', 'user-2'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 50],
    ]);
  });

  it('reads one member share with the bill category, or null', async () => {
    const { supabase, calls } = fakeSupabase({ data: { share: '150.00', bills: { categories: { name: 'อาหาร' } } }, error: null });

    expect(await createRepository(supabase).getBillShare(BILL, 'user-2')).toEqual({ share: 150, categoryName: 'อาหาร' });
    expect(calls).toEqual([
      ['from', 'bill_members'],
      ['select', 'share, bills(categories(name))'],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
      ['maybeSingle'],
    ]);
    const missing = fakeSupabase({ data: null, error: null });
    expect(await createRepository(missing.supabase).getBillShare(BILL, 'user-2')).toBeNull();
  });

  it('confirms and declines through the SQL functions', async () => {
    const confirm = fakeSupabase({ data: 'confirmed', error: null });
    const decline = fakeSupabase({ data: 'cancelled', error: null });

    expect(await createRepository(confirm.supabase).confirmBillShare(BILL, 'user-2', 'c2')).toBe('confirmed');
    expect(confirm.calls).toEqual([['rpc', 'confirm_bill_share', { p_bill: BILL, p_user: 'user-2', p_category: 'c2' }]]);
    expect(await createRepository(decline.supabase).declineBillShare(BILL, 'user-2')).toBe('cancelled');
    expect(decline.calls).toEqual([['rpc', 'decline_bill_share', { p_bill: BILL, p_user: 'user-2' }]]);
  });

  it('cancels only an open bill of the owner', async () => {
    const { supabase, calls } = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(supabase).cancelBill(BILL, 'user-1')).toBe(true);
    expect(calls).toEqual([
      ['from', 'bills'],
      ['update', { status: 'cancelled' }, { count: 'exact' }],
      ['eq', 'id', BILL],
      ['eq', 'owner_id', 'user-1'],
      ['eq', 'status', 'open'],
    ]);
  });

  it('checks the owner and sets the paid flag of one member', async () => {
    const owner = fakeSupabase({ data: { id: BILL }, error: null });
    const paid = fakeSupabase({ count: 1, error: null });

    expect(await createRepository(owner.supabase).isBillOwner(BILL, 'user-1')).toBe(true);
    expect(owner.calls).toEqual([['from', 'bills'], ['select', 'id'], ['eq', 'id', BILL], ['eq', 'owner_id', 'user-1'], ['maybeSingle']]);
    expect(await createRepository(paid.supabase).setBillMemberPaid(BILL, 'user-2', true)).toBe(true);
    expect(paid.calls).toEqual([
      ['from', 'bill_members'],
      ['update', { paid: true }, { count: 'exact' }],
      ['eq', 'bill_id', BILL],
      ['eq', 'user_id', 'user-2'],
    ]);
  });

  it('maps user ids to LINE user ids', async () => {
    const { supabase, calls } = fakeSupabase({
      data: [
        { id: 'user-2', line_user_id: 'U2' },
        { id: 'user-3', line_user_id: 'U3' },
      ],
      error: null,
    });

    const ids = await createRepository(supabase).getLineUserIds(['user-2', 'user-3']);

    expect([...ids]).toEqual([
      ['user-2', 'U2'],
      ['user-3', 'U3'],
    ]);
    expect(calls).toEqual([['from', 'users'], ['select', 'id, line_user_id'], ['in', 'id', ['user-2', 'user-3']]]);
  });

  it('throws DatabaseError when a bill query fails', async () => {
    const failing = () => fakeSupabase({ data: null, count: null, error: { message: 'boom' } }).supabase;

    await expect(createRepository(failing()).listOwnedBills('user-1')).rejects.toThrow('Database listOwnedBills failed: boom');
    await expect(createRepository(failing()).confirmBillShare(BILL, 'u', 'c')).rejects.toThrow('Database confirmBillShare failed: boom');
    await expect(createRepository(failing()).cancelBill(BILL, 'u')).rejects.toThrow('Database cancelBill failed: boom');
  });
});
```

`fakeSupabase` เดิมยังไม่มี method `in` ให้เพิ่ม `'in'` ใน array รายชื่อ method ของ builder (บรรทัดที่ประกาศ `['select', 'eq', 'upsert', ...]`)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/db/repository.test.js`
Expected: FAIL — `createRepository(...).createBill is not a function` และอื่นๆ

- [ ] **Step 3: Write minimal implementation**

ใน `src/db/repository.js` เพิ่ม helper ระดับ module ใต้ `toTransaction`:

```js
function toOwnedBill(row) {
  return {
    id: row.id,
    title: row.title,
    total: Number(row.total),
    occurredOn: row.occurred_on,
    categoryName: row.categories ? row.categories.name : '',
    status: row.status,
    ownerShare: Number(row.owner_share),
    createdAt: row.created_at,
    members: (row.bill_members || []).map((member) => ({
      userId: member.user_id,
      displayName: member.users ? member.users.display_name : null,
      share: Number(member.share),
      status: member.status,
      paid: member.paid,
      notified: member.notified,
    })),
  };
}

function toIncomingBill(row) {
  const bill = row.bills;
  return {
    id: bill.id,
    title: bill.title,
    total: Number(bill.total),
    occurredOn: bill.occurred_on,
    categoryName: bill.categories ? bill.categories.name : '',
    status: bill.status,
    ownerName: bill.users ? bill.users.display_name : null,
    myShare: Number(row.share),
    myStatus: row.status,
    paid: row.paid,
  };
}
```

และใต้ `const UNIQUE_VIOLATION = '23505';` เพิ่ม:

```js
// รายการบิลในหน้าเว็บแสดงเฉพาะของล่าสุด กันหน้าโหลดช้าเมื่อใช้ไปนาน
const BILL_LIST_LIMIT = 50;
```

เพิ่ม method เหล่านี้ใน `createRepository` (ต่อจาก `removeFriendship`):

```js
  async function createBill({ ownerId, title, total, occurredOn, categoryId, ownerShare, members }) {
    const { data, error } = await supabase.rpc('create_bill', {
      p_owner: ownerId,
      p_title: title,
      p_total: total,
      p_category: categoryId,
      p_date: occurredOn,
      p_owner_share: ownerShare,
      p_members: members.map((member) => ({ user_id: member.userId, share: member.share })),
    });
    throwIfError('createBill', error);
    return data;
  }

  async function markBillMemberNotified(billId, userId) {
    const { error } = await supabase.from('bill_members').update({ notified: true }).eq('bill_id', billId).eq('user_id', userId);
    throwIfError('markBillMemberNotified', error);
  }

  async function listOwnedBills(ownerId) {
    const { data, error } = await supabase
      .from('bills')
      .select(
        'id, title, total, occurred_on, status, owner_share, created_at, categories(name), bill_members(user_id, share, status, paid, notified, users(display_name))'
      )
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(BILL_LIST_LIMIT);
    throwIfError('listOwnedBills', error);
    return data.map(toOwnedBill);
  }

  async function listIncomingBills(userId) {
    const { data, error } = await supabase
      .from('bill_members')
      .select('share, status, paid, bills(id, title, total, occurred_on, status, categories(name), users(display_name))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(BILL_LIST_LIMIT);
    throwIfError('listIncomingBills', error);
    return data.map(toIncomingBill);
  }

  async function getBillShare(billId, userId) {
    const { data, error } = await supabase
      .from('bill_members')
      .select('share, bills(categories(name))')
      .eq('bill_id', billId)
      .eq('user_id', userId)
      .maybeSingle();
    throwIfError('getBillShare', error);
    if (!data) return null;
    const category = data.bills && data.bills.categories ? data.bills.categories.name : '';
    return { share: Number(data.share), categoryName: category };
  }

  async function confirmBillShare(billId, userId, categoryId) {
    const { data, error } = await supabase.rpc('confirm_bill_share', { p_bill: billId, p_user: userId, p_category: categoryId });
    throwIfError('confirmBillShare', error);
    return data;
  }

  async function declineBillShare(billId, userId) {
    const { data, error } = await supabase.rpc('decline_bill_share', { p_bill: billId, p_user: userId });
    throwIfError('declineBillShare', error);
    return data;
  }

  async function cancelBill(billId, ownerId) {
    const { count, error } = await supabase
      .from('bills')
      .update({ status: 'cancelled' }, { count: 'exact' })
      .eq('id', billId)
      .eq('owner_id', ownerId)
      .eq('status', 'open');
    throwIfError('cancelBill', error);
    return count > 0;
  }

  async function isBillOwner(billId, ownerId) {
    const { data, error } = await supabase.from('bills').select('id').eq('id', billId).eq('owner_id', ownerId).maybeSingle();
    throwIfError('isBillOwner', error);
    return Boolean(data);
  }

  async function setBillMemberPaid(billId, userId, paid) {
    const { count, error } = await supabase
      .from('bill_members')
      .update({ paid }, { count: 'exact' })
      .eq('bill_id', billId)
      .eq('user_id', userId);
    throwIfError('setBillMemberPaid', error);
    return count > 0;
  }

  async function getLineUserIds(userIds) {
    const { data, error } = await supabase.from('users').select('id, line_user_id').in('id', userIds);
    throwIfError('getLineUserIds', error);
    return new Map(data.map((row) => [row.id, row.line_user_id]));
  }
```

แล้วเพิ่มชื่อทั้ง 12 method ใน object ที่ return

หมายเหตุสำหรับผู้ทำ: ก่อนเขียนให้ดูวิธีเรียก `update(..., { count: 'exact' })` ใน supabase-js ที่ `node_modules/@supabase/postgrest-js` (method `update(values, { count })`) ถ้า signature ต่างจากนี้ให้หยุดรายงาน NEEDS_CONTEXT

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/db/repository.test.js`
Expected: PASS ทั้งไฟล์

- [ ] **Step 5: Commit**

```bash
git add src/db/repository.js src/db/repository.test.js
git commit -m "feat: add repository methods for bills"
```

---

### Task 4: Bill request card and push helper

**Depends on:** none

**Files:**
- Create: `src/bills/flex.js`
- Test: `src/bills/flex.test.js`
- Modify: `src/line-reply.js` (เพิ่ม `createPushFlex`)
- Test: `src/line-reply.test.js`

**Interfaces:**
- Produces: `buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, liffUrl }): FlexMessage`; `BILL_CONFIRM_ACTION = 'bill_confirm'`, `BILL_DECLINE_ACTION = 'bill_decline'`; `createPushFlex(client)` คืน `pushFlex(to, flexMessage): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/bills/flex.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } from './flex.js';

const ARGS = {
  billId: '11111111-1111-1111-1111-111111111111',
  title: 'เนื้อย่าง',
  ownerName: 'เอ',
  share: 1250.5,
  occurredOn: '2026-10-08',
  liffUrl: 'https://liff.line.me/liff-1',
};

function texts(node) {
  if (!node || typeof node !== 'object') return [];
  return [...(node.type === 'text' ? [node.text] : []), ...Object.values(node).flatMap((value) => (Array.isArray(value) ? value.flatMap(texts) : texts(value)))];
}

describe('buildBillRequestFlex', () => {
  it('names the owner, the bill, the date and the share', () => {
    const flex = buildBillRequestFlex(ARGS);

    expect(flex.type).toBe('flex');
    expect(flex.altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 1,250.5 บาท');
    expect(texts(flex)).toEqual(expect.arrayContaining(['เอ ขอให้ยืนยันส่วนแบ่งบิล', 'เนื้อย่าง', 'ส่วนของคุณ 1,250.5 บาท', '08/10']));
  });

  it('offers confirm and decline postbacks and a link to the bill on the web page', () => {
    const buttons = buildBillRequestFlex(ARGS).contents.footer.contents.map((button) => button.action);

    expect(buttons).toEqual([
      { type: 'postback', label: 'ยืนยัน', data: `action=${BILL_CONFIRM_ACTION}&bill=${ARGS.billId}`, displayText: 'ยืนยัน' },
      { type: 'postback', label: 'ปฏิเสธ', data: `action=${BILL_DECLINE_ACTION}&bill=${ARGS.billId}`, displayText: 'ปฏิเสธ' },
      { type: 'uri', label: 'ดูในเว็บ', uri: `https://liff.line.me/liff-1?bill=${ARGS.billId}` },
    ]);
  });

  it('keeps the alt text within the LINE limit for a long title', () => {
    expect(buildBillRequestFlex({ ...ARGS, title: 'ก'.repeat(60), ownerName: 'ข'.repeat(400) }).altText.length).toBeLessThanOrEqual(400);
  });
});
```

เพิ่มใน `src/line-reply.test.js` (เพิ่ม `createPushFlex` ใน import ด้วย):

```js
describe('createPushFlex', () => {
  it('pushes the flex message to the user', async () => {
    const client = { pushMessage: vi.fn().mockResolvedValue({}) };
    const flex = { type: 'flex', altText: 'x', contents: {} };

    await createPushFlex(client)('U1', flex);

    expect(client.pushMessage).toHaveBeenCalledWith({ to: 'U1', messages: [flex] });
  });
});
```

(ถ้า `vi` ยังไม่ถูก import ในไฟล์นั้น ให้เพิ่มใน import ของ vitest)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bills/flex.test.js src/line-reply.test.js`
Expected: FAIL — `Failed to load url ./flex.js` และ `createPushFlex is not a function`

- [ ] **Step 3: Write minimal implementation**

`src/bills/flex.js`:

```js
const { formatAmount } = require('../parser/format-reply');

const BILL_CONFIRM_ACTION = 'bill_confirm';
const BILL_DECLINE_ACTION = 'bill_decline';
// LINE จำกัด altText ที่ 400 ตัวอักษร
const ALT_TEXT_MAX = 400;
const MUTED = '#707070';
const PRIMARY = '#0071E3';

function shortDate(isoDate) {
  const [, month, day] = isoDate.split('-');
  return `${day}/${month}`;
}

function postback(label, action, billId) {
  return { type: 'postback', label, data: new URLSearchParams({ action, bill: billId }).toString(), displayText: label };
}

function buildBillRequestFlex({ billId, title, ownerName, share, occurredOn, liffUrl }) {
  const heading = `${ownerName} ขอให้ยืนยันส่วนแบ่งบิล`;
  const altText = `${heading} ${title} ${formatAmount(share)} บาท`;
  const url = new URL(liffUrl);
  url.searchParams.set('bill', billId);
  return {
    type: 'flex',
    altText: altText.length <= ALT_TEXT_MAX ? altText : `${altText.slice(0, ALT_TEXT_MAX - 3)}...`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: heading, size: 'xs', color: MUTED, wrap: true },
          { type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true },
          { type: 'text', text: shortDate(occurredOn), size: 'xs', color: MUTED },
          { type: 'text', text: `ส่วนของคุณ ${formatAmount(share)} บาท`, weight: 'bold', size: 'md', margin: 'md' },
          { type: 'text', text: 'ยืนยันแล้วจะบันทึกเป็นรายจ่ายของคุณ', size: 'xs', color: MUTED, wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', color: PRIMARY, height: 'sm', action: postback('ยืนยัน', BILL_CONFIRM_ACTION, billId) },
          { type: 'button', style: 'secondary', height: 'sm', action: postback('ปฏิเสธ', BILL_DECLINE_ACTION, billId) },
          { type: 'button', style: 'link', height: 'sm', action: { type: 'uri', label: 'ดูในเว็บ', uri: url.toString() } },
        ],
      },
    },
  };
}

module.exports = { buildBillRequestFlex, BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION };
```

ก่อนใช้ให้เปิด `src/parser/format-reply.js` ยืนยันว่า `formatAmount(1250.5)` คืน `'1,250.5'` (export อยู่แล้ว)

ใน `src/line-reply.js` เพิ่มก่อน `module.exports`:

```js
function createPushFlex(client) {
  return async function pushFlex(to, flexMessage) {
    await client.pushMessage({ to, messages: [flexMessage] });
  };
}
```

และเพิ่ม `createPushFlex` ใน `module.exports`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bills/flex.test.js src/line-reply.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bills/flex.js src/bills/flex.test.js src/line-reply.js src/line-reply.test.js
git commit -m "feat: add the bill request card and a flex push helper"
```

---

### Task 5: Bill service

**Depends on:** Task 2, Task 3, Task 4

**Files:**
- Create: `src/bills/service.js`
- Test: `src/bills/service.test.js`

**Interfaces:**
- Consumes: `validateBillInput` (Task 2), repository methods (Task 3) + `listCategories`, `listFriends`, `getDisplayName` ที่มีอยู่, `buildBillRequestFlex` (Task 4), `users.loadCategoryIds` (src/users.js), `categoryKey` (src/db/transaction-rows.js), `FALLBACK_DISPLAY_NAME` (src/friends/service.js), `FALLBACK_CATEGORY` (src/parser/categories.js)
- Produces: `createBillService({ repository, users, pushFlex, liffUrl, logger? })` คืน
  - `create(ownerId, body): Promise<{ status: 'ok', id, notNotified: string[] } | { status: 'invalid', error: string }>`
  - `list(userId): Promise<{ owned: OwnedBill[], incoming: IncomingBill[] }>` (ชื่อ null แทนด้วย `FALLBACK_DISPLAY_NAME`)
  - `cancel(ownerId, billId): Promise<boolean>`
  - `setPaid(ownerId, billId, memberId, paid): Promise<boolean>`
  - `respond(userId, billId, answer: 'confirm' | 'decline'): Promise<{ status: string, share?: number, categoryName?: string }>`

- [ ] **Step 1: Write the failing test**

`src/bills/service.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { createBillService } from './service.js';

const OWNER = '11111111-1111-1111-1111-111111111111';
const F1 = '22222222-2222-2222-2222-222222222222';
const F2 = '33333333-3333-3333-3333-333333333333';
const FOOD = '44444444-4444-4444-4444-444444444444';
const BILL = '55555555-5555-5555-5555-555555555555';

function body(overrides = {}) {
  return {
    title: 'เนื้อย่าง',
    total: 900,
    occurredOn: '2026-10-08',
    categoryId: FOOD,
    ownerShare: 300,
    members: [
      { userId: F1, share: 300 },
      { userId: F2, share: 300 },
    ],
    ...overrides,
  };
}

function setup(overrides = {}) {
  const repository = {
    listCategories: vi.fn().mockResolvedValue([
      { id: FOOD, name: 'อาหาร', type: 'expense' },
      { id: 'salary', name: 'เงินเดือน', type: 'income' },
    ]),
    listFriends: vi.fn().mockResolvedValue([
      { id: F1, displayName: 'บี' },
      { id: F2, displayName: 'ซี' },
    ]),
    getDisplayName: vi.fn().mockResolvedValue('เอ'),
    createBill: vi.fn().mockResolvedValue(BILL),
    getLineUserIds: vi.fn().mockResolvedValue(new Map([[F1, 'U-F1'], [F2, 'U-F2']])),
    markBillMemberNotified: vi.fn().mockResolvedValue(),
    listOwnedBills: vi.fn().mockResolvedValue([]),
    listIncomingBills: vi.fn().mockResolvedValue([]),
    cancelBill: vi.fn().mockResolvedValue(true),
    isBillOwner: vi.fn().mockResolvedValue(true),
    setBillMemberPaid: vi.fn().mockResolvedValue(true),
    getBillShare: vi.fn().mockResolvedValue({ share: 300, categoryName: 'อาหาร' }),
    confirmBillShare: vi.fn().mockResolvedValue('confirmed'),
    declineBillShare: vi.fn().mockResolvedValue('declined'),
    ...overrides,
  };
  const users = { loadCategoryIds: vi.fn().mockResolvedValue(new Map([['expense:อาหาร', 'f1-food'], ['expense:อื่นๆ', 'f1-other']])) };
  const pushFlex = vi.fn().mockResolvedValue();
  const logger = { error: vi.fn() };
  const service = createBillService({ repository, users, pushFlex, liffUrl: 'https://liff.line.me/liff-1', logger });
  return { repository, users, pushFlex, logger, service };
}

describe('billService.create', () => {
  it('creates the bill, pushes a card to every member and marks them notified', async () => {
    const { service, repository, pushFlex } = setup();

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [] });
    expect(repository.createBill).toHaveBeenCalledWith({ ownerId: OWNER, ...body() });
    expect(pushFlex.mock.calls.map(([to]) => to)).toEqual(['U-F1', 'U-F2']);
    expect(pushFlex.mock.calls[0][1].altText).toBe('เอ ขอให้ยืนยันส่วนแบ่งบิล เนื้อย่าง 300 บาท');
    expect(repository.markBillMemberNotified.mock.calls).toEqual([
      [BILL, F1],
      [BILL, F2],
    ]);
  });

  it('keeps the bill and reports members the push could not reach, logging only ids', async () => {
    const { service, repository, pushFlex, logger } = setup();
    pushFlex.mockRejectedValueOnce(new Error('not a friend of the bot'));

    expect(await service.create(OWNER, body())).toEqual({ status: 'ok', id: BILL, notNotified: [F1] });
    expect(repository.markBillMemberNotified.mock.calls).toEqual([[BILL, F2]]);
    expect(logger.error).toHaveBeenCalledWith('Failed to push bill request', { billId: BILL, memberId: F1 });
  });

  it('rejects invalid input, a category that is not the owner expense category, and strangers', async () => {
    const { service, repository } = setup();

    expect(await service.create(OWNER, body({ title: '' }))).toEqual({ status: 'invalid', error: 'Invalid title' });
    expect(await service.create(OWNER, body({ categoryId: '66666666-6666-6666-6666-666666666666' }))).toEqual({
      status: 'invalid',
      error: 'Invalid category',
    });
    repository.listFriends.mockResolvedValueOnce([{ id: F1, displayName: 'บี' }]);
    expect(await service.create(OWNER, body())).toEqual({ status: 'invalid', error: 'Not friends' });
    expect(repository.createBill).not.toHaveBeenCalled();
  });

  it('uses the fallback name on the card when the owner has no name', async () => {
    const { service, pushFlex } = setup({ getDisplayName: vi.fn().mockResolvedValue(null) });

    await service.create(OWNER, body());

    expect(pushFlex.mock.calls[0][1].altText).toContain('ผู้ใช้ LINE ขอให้ยืนยัน');
  });
});

describe('billService.list', () => {
  it('fills missing names with the fallback', async () => {
    const { service } = setup({
      listOwnedBills: vi.fn().mockResolvedValue([{ id: BILL, members: [{ userId: F1, displayName: null }] }]),
      listIncomingBills: vi.fn().mockResolvedValue([{ id: 'b2', ownerName: null }]),
    });

    expect(await service.list(OWNER)).toEqual({
      owned: [{ id: BILL, members: [{ userId: F1, displayName: 'ผู้ใช้ LINE' }] }],
      incoming: [{ id: 'b2', ownerName: 'ผู้ใช้ LINE' }],
    });
  });
});

describe('billService.cancel and setPaid', () => {
  it('cancels through the repository', async () => {
    const { service, repository } = setup({ cancelBill: vi.fn().mockResolvedValue(false) });

    expect(await service.cancel(OWNER, BILL)).toBe(false);
    expect(repository.cancelBill).toHaveBeenCalledWith(BILL, OWNER);
  });

  it('sets paid only on a bill the user owns', async () => {
    const owned = setup();
    const notOwned = setup({ isBillOwner: vi.fn().mockResolvedValue(false) });

    expect(await owned.service.setPaid(OWNER, BILL, F1, true)).toBe(true);
    expect(owned.repository.setBillMemberPaid).toHaveBeenCalledWith(BILL, F1, true);
    expect(await notOwned.service.setPaid(F2, BILL, F1, true)).toBe(false);
    expect(notOwned.repository.setBillMemberPaid).not.toHaveBeenCalled();
  });
});

describe('billService.respond', () => {
  it('confirms into the friend category with the same name and returns the share', async () => {
    const { service, repository } = setup();

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', share: 300, categoryName: 'อาหาร' });
    expect(repository.confirmBillShare).toHaveBeenCalledWith(BILL, F1, 'f1-food');
  });

  it('falls back to the other category when the friend has no category with that name', async () => {
    const { service, repository } = setup({ getBillShare: vi.fn().mockResolvedValue({ share: 300, categoryName: 'ปาร์ตี้' }) });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'confirmed', share: 300, categoryName: 'อื่นๆ' });
    expect(repository.confirmBillShare).toHaveBeenCalledWith(BILL, F1, 'f1-other');
  });

  it('reports a bill the user is not part of as not found without writing', async () => {
    const { service, repository } = setup({ getBillShare: vi.fn().mockResolvedValue(null) });

    expect(await service.respond(F1, BILL, 'confirm')).toEqual({ status: 'not_found' });
    expect(repository.confirmBillShare).not.toHaveBeenCalled();
  });

  it('declines through the repository and passes other statuses through', async () => {
    const { service, repository } = setup({ declineBillShare: vi.fn().mockResolvedValue('cancelled') });

    expect(await service.respond(F1, BILL, 'decline')).toEqual({ status: 'cancelled' });
    expect(repository.declineBillShare).toHaveBeenCalledWith(BILL, F1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bills/service.test.js`
Expected: FAIL — `Failed to load url ./service.js`

- [ ] **Step 3: Write minimal implementation**

`src/bills/service.js`:

```js
const { validateBillInput } = require('./validate');
const { buildBillRequestFlex } = require('./flex');
const { FALLBACK_DISPLAY_NAME } = require('../friends/service');
const { FALLBACK_CATEGORY } = require('../parser/categories');
const { categoryKey } = require('../db/transaction-rows');

function createBillService({ repository, users, pushFlex, liffUrl, logger = console }) {
  // บิลถูกบันทึกแล้วก่อน push ถ้า push ไม่ถึงเพื่อนยังเข้ามายืนยันในเว็บได้
  async function notifyMembers(billId, ownerId, bill) {
    const [ownerName, lineIds] = await Promise.all([
      repository.getDisplayName(ownerId),
      repository.getLineUserIds(bill.members.map((member) => member.userId)),
    ]);
    const notNotified = [];
    for (const member of bill.members) {
      try {
        const flex = buildBillRequestFlex({
          billId,
          title: bill.title,
          ownerName: ownerName || FALLBACK_DISPLAY_NAME,
          share: member.share,
          occurredOn: bill.occurredOn,
          liffUrl,
        });
        await pushFlex(lineIds.get(member.userId), flex);
        await repository.markBillMemberNotified(billId, member.userId);
      } catch {
        logger.error('Failed to push bill request', { billId, memberId: member.userId });
        notNotified.push(member.userId);
      }
    }
    return notNotified;
  }

  async function create(ownerId, body) {
    const checked = validateBillInput(body, ownerId);
    if (!checked.ok) {
      return { status: 'invalid', error: checked.error };
    }
    const bill = checked.value;
    const [categories, friends] = await Promise.all([repository.listCategories(ownerId), repository.listFriends(ownerId)]);
    if (!categories.some((category) => category.id === bill.categoryId && category.type === 'expense')) {
      return { status: 'invalid', error: 'Invalid category' };
    }
    const friendIds = new Set(friends.map((friend) => friend.id));
    if (!bill.members.every((member) => friendIds.has(member.userId))) {
      return { status: 'invalid', error: 'Not friends' };
    }
    const id = await repository.createBill({ ownerId, ...bill });
    return { status: 'ok', id, notNotified: await notifyMembers(id, ownerId, bill) };
  }

  async function list(userId) {
    const [owned, incoming] = await Promise.all([repository.listOwnedBills(userId), repository.listIncomingBills(userId)]);
    return {
      owned: owned.map((bill) => ({
        ...bill,
        members: bill.members.map((member) => ({ ...member, displayName: member.displayName || FALLBACK_DISPLAY_NAME })),
      })),
      incoming: incoming.map((bill) => ({ ...bill, ownerName: bill.ownerName || FALLBACK_DISPLAY_NAME })),
    };
  }

  function cancel(ownerId, billId) {
    return repository.cancelBill(billId, ownerId);
  }

  async function setPaid(ownerId, billId, memberId, paid) {
    if (!(await repository.isBillOwner(billId, ownerId))) {
      return false;
    }
    return repository.setBillMemberPaid(billId, memberId, paid);
  }

  async function respond(userId, billId, answer) {
    if (answer === 'decline') {
      return { status: await repository.declineBillShare(billId, userId) };
    }
    const share = await repository.getBillShare(billId, userId);
    if (!share) {
      return { status: 'not_found' };
    }
    // หมวดของเพื่อนเป็นคนละแถวกับของเจ้าของ จึงจับคู่ด้วยชื่อ ไม่มีชื่อนั้นใช้ อื่นๆ
    const categoryIds = await users.loadCategoryIds(userId);
    const sameName = categoryIds.get(categoryKey('expense', share.categoryName));
    const categoryId = sameName || categoryIds.get(categoryKey('expense', FALLBACK_CATEGORY));
    const categoryName = sameName ? share.categoryName : FALLBACK_CATEGORY;
    const status = await repository.confirmBillShare(billId, userId, categoryId);
    return status === 'confirmed' ? { status, share: share.share, categoryName } : { status };
  }

  return { create, list, cancel, setPaid, respond };
}

module.exports = { createBillService };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bills/service.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bills/service.js src/bills/service.test.js
git commit -m "feat: add bill service for create, notify, list, cancel, paid and respond"
```

---

### Task 6: Bills API, card postbacks and wiring

**Depends on:** Task 5

**Files:**
- Create: `src/bills/router.js`
- Test: `src/bills/router.test.js`
- Modify: `src/api/router.js` (รับ `billsRouter` แบบบังคับ และ mount ที่ `/bills` หลัง ID token ต่อจาก `/friends`)
- Modify: `src/api/router.test.js`, `src/app.test.js` (ใส่ `billsRouter` ใน fixture)
- Modify: `src/bot.js` (postback `bill_confirm` / `bill_decline`, dependency `bills`)
- Test: `src/bot.test.js`
- Modify: `index.js`

**Interfaces:**
- Consumes: `createBillService` (Task 5), `createPushFlex` และ `BILL_CONFIRM_ACTION`/`BILL_DECLINE_ACTION` (Task 4)
- Produces: `createBillsRouter({ bills, allowBillCreate })` (throw `TypeError` ที่มีคำว่า `allowBillCreate` ถ้าไม่ส่ง); `createApiRouter` ต้องได้ `billsRouter` (throw ที่มีคำว่า `billsRouter`); `createBot` รับ `bills` (service) และตอบ postback ตาม Global Constraints; export `BILL_REPLIES` จาก `src/bot.js`

- [ ] **Step 1: Write the failing tests**

`src/bills/router.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import { createBillsRouter } from './router.js';

const BILL = '55555555-5555-5555-5555-555555555555';
const F1 = '22222222-2222-2222-2222-222222222222';
let server;

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

function setup(overrides = {}) {
  const bills = {
    list: vi.fn().mockResolvedValue({ owned: [], incoming: [] }),
    create: vi.fn().mockResolvedValue({ status: 'ok', id: BILL, notNotified: [F1] }),
    cancel: vi.fn().mockResolvedValue(true),
    setPaid: vi.fn().mockResolvedValue(true),
    respond: vi.fn().mockResolvedValue({ status: 'confirmed', share: 300, categoryName: 'อาหาร' }),
    ...overrides,
  };
  return { bills, allowBillCreate: vi.fn().mockReturnValue(true) };
}

async function start(deps) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.userId = 'user-1';
    next();
  });
  app.use('/bills', createBillsRouter(deps));
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  return `http://127.0.0.1:${server.address().port}/bills`;
}

function call(url, { method = 'GET', body } = {}) {
  return fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe('createBillsRouter', () => {
  it('refuses to build without a create limiter', () => {
    expect(() => createBillsRouter({ bills: setup().bills })).toThrow('allowBillCreate');
  });

  it('lists the bills of this user', async () => {
    const deps = setup();
    const base = await start(deps);

    const res = await call(base);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owned: [], incoming: [] });
    expect(deps.bills.list).toHaveBeenCalledWith('user-1');
  });

  it('creates a bill and answers 400 with the validation error', async () => {
    const deps = setup();
    const base = await start(deps);

    const created = await call(base, { method: 'POST', body: { title: 'x' } });
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ id: BILL, notNotified: [F1] });
    expect(deps.bills.create).toHaveBeenCalledWith('user-1', { title: 'x' });

    deps.bills.create.mockResolvedValueOnce({ status: 'invalid', error: 'Not friends' });
    const rejected = await call(base, { method: 'POST', body: {} });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toEqual({ error: 'Not friends' });
  });

  it('answers 429 when the user creates too many bills', async () => {
    const deps = setup();
    deps.allowBillCreate.mockReturnValue(false);
    const base = await start(deps);

    const res = await call(base, { method: 'POST', body: {} });

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(deps.bills.create).not.toHaveBeenCalled();
  });

  it('cancels an owned bill and answers 404 otherwise', async () => {
    const deps = setup();
    const base = await start(deps);

    const ok = await call(`${base}/${BILL}/cancel`, { method: 'POST' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ status: 'cancelled' });
    expect(deps.bills.cancel).toHaveBeenCalledWith('user-1', BILL);
    deps.bills.cancel.mockResolvedValueOnce(false);
    expect((await call(`${base}/${BILL}/cancel`, { method: 'POST' })).status).toBe(404);
  });

  it('sets the paid flag and checks the body', async () => {
    const deps = setup();
    const base = await start(deps);

    const ok = await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: true } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ paid: true });
    expect(deps.bills.setPaid).toHaveBeenCalledWith('user-1', BILL, F1, true);
    expect((await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: 'yes' } })).status).toBe(400);
    deps.bills.setPaid.mockResolvedValueOnce(false);
    expect((await call(`${base}/${BILL}/members/${F1}/paid`, { method: 'POST', body: { paid: false } })).status).toBe(404);
  });

  it('confirms and declines a share, with 404 for a bill the user is not part of', async () => {
    const deps = setup();
    const base = await start(deps);

    const confirmed = await call(`${base}/${BILL}/confirm`, { method: 'POST' });
    expect(await confirmed.json()).toEqual({ status: 'confirmed' });
    expect(deps.bills.respond).toHaveBeenCalledWith('user-1', BILL, 'confirm');
    deps.bills.respond.mockResolvedValueOnce({ status: 'declined' });
    expect(await (await call(`${base}/${BILL}/decline`, { method: 'POST' })).json()).toEqual({ status: 'declined' });
    expect(deps.bills.respond).toHaveBeenLastCalledWith('user-1', BILL, 'decline');
    deps.bills.respond.mockResolvedValueOnce({ status: 'not_found' });
    expect((await call(`${base}/${BILL}/confirm`, { method: 'POST' })).status).toBe(404);
  });

  it('answers 404 for ids that are not UUIDs without touching the service', async () => {
    const deps = setup();
    const base = await start(deps);

    for (const path of ['/x/cancel', `/${BILL}/members/x/paid`, '/x/confirm', '/x/decline']) {
      expect((await call(`${base}${path}`, { method: 'POST', body: { paid: true } })).status).toBe(404);
    }
    expect(deps.bills.cancel).not.toHaveBeenCalled();
    expect(deps.bills.setPaid).not.toHaveBeenCalled();
    expect(deps.bills.respond).not.toHaveBeenCalled();
  });
});
```

ใน `src/api/router.test.js`:
- เพิ่ม `billsRouter: express.Router(),` ใน `deps` ของ `setup` (ต่อจาก `friendsRouter`)
- เพิ่มเทสต์ใน `describe('createApiRouter', ...)`:

```js
  it('refuses to build without the bills router', () => {
    // eslint-disable-next-line no-unused-vars
    const { billsRouter, ...deps } = setup();

    expect(() => createApiRouter(deps)).toThrow('billsRouter');
  });
```

- เพิ่ม describe ท้ายไฟล์:

```js
describe('/api/bills', () => {
  it('reaches the bills router only after the ID token check, with the user id set', async () => {
    const billsRouter = express.Router();
    billsRouter.get('/', (req, res) => res.json({ userId: req.userId }));
    const base = await start(setup({ billsRouter }));

    expect((await call(base, '/bills', { token: null })).status).toBe(401);
    expect(await (await call(base, '/bills')).json()).toEqual({ userId: 'user-1' });
  });
});
```

ใน `src/app.test.js` ใน `buildApiRouter()` เพิ่ม `billsRouter: express.Router(),`

ใน `src/bot.test.js`:
- ใน `setup` เพิ่ม dependency `bills: { respond: vi.fn().mockResolvedValue({ status: 'confirmed', share: 300, categoryName: 'อาหาร' }) },` ใน object deps ที่ส่งให้ `createBot` (ดูโครง `setup` เดิมของไฟล์แล้วเพิ่มให้เข้ากัน รวมถึงรับ override ได้)
- เพิ่ม import `BILL_REPLIES` จาก `./bot.js`
- เพิ่ม describe:

```js
describe('bot bill card buttons', () => {
  const BILL = '55555555-5555-5555-5555-555555555555';

  it('confirms the share from the card and says where it was saved', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent(`action=bill_confirm&bill=${BILL}`));

    expect(deps.bills.respond).toHaveBeenCalledWith('user-1', BILL, 'confirm');
    expect(deps.replyText).toHaveBeenCalledWith('r1', 'บันทึกส่วนของคุณ 300 บาท ในหมวด อาหาร แล้ว', undefined);
  });

  it('answers every other outcome with its own message', async () => {
    for (const [action, status, reply] of [
      ['bill_decline', 'declined', BILL_REPLIES.declined],
      ['bill_confirm', 'cancelled', BILL_REPLIES.cancelled],
      ['bill_confirm', 'not_found', BILL_REPLIES.not_found],
    ]) {
      const { deps, bot } = setup();
      deps.bills.respond.mockResolvedValue({ status });

      await bot.handleEvent(postbackEvent(`action=${action}&bill=${BILL}`));

      expect(deps.replyText).toHaveBeenCalledWith('r1', reply, undefined);
    }
  });

  it('says the earlier answer when the user taps again', async () => {
    const { deps, bot } = setup();
    deps.bills.respond.mockResolvedValue({ status: 'confirmed' });

    await bot.handleEvent(postbackEvent(`action=bill_decline&bill=${BILL}`));

    expect(deps.replyText).toHaveBeenCalledWith('r1', BILL_REPLIES.already_confirmed, undefined);
  });

  it('ignores a bill id that is not a UUID', async () => {
    const { deps, bot } = setup();

    await bot.handleEvent(postbackEvent('action=bill_confirm&bill=x'));

    expect(deps.bills.respond).not.toHaveBeenCalled();
    expect(deps.replyText).not.toHaveBeenCalled();
  });
});

describe('BILL_REPLIES', () => {
  it('uses the agreed wording', () => {
    expect(BILL_REPLIES).toEqual({
      declined: 'ปฏิเสธบิลนี้แล้ว',
      cancelled: 'บิลนี้ถูกยกเลิกแล้ว',
      already_confirmed: 'คุณยืนยันบิลนี้ไปแล้ว',
      already_declined: 'คุณปฏิเสธบิลนี้ไปแล้ว',
      not_found: 'ไม่พบบิลนี้',
    });
  });
});
```

(ถ้าไฟล์ยังไม่มี helper `postbackEvent(data)` ให้ใช้ helper เดิมที่สร้าง postback event ของการกด "ยกเลิก" ในไฟล์นั้น โดยดูชื่อจริงก่อนใช้ และ `users.ensureUser` ใน setup คืน `'user-1'`)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bills/router.test.js src/api/router.test.js src/app.test.js src/bot.test.js`
Expected: FAIL — `Failed to load url ./router.js`, `billsRouter` ไม่ throw, `BILL_REPLIES` undefined

- [ ] **Step 3: Write minimal implementation**

`src/bills/router.js`:

```js
const express = require('express');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(res) {
  res.status(404).json({ error: 'Not found' });
}

// ต้อง mount หลัง middleware ตรวจ ID token ของ /api เพราะใช้ req.userId
function createBillsRouter({ bills, allowBillCreate }) {
  // ไม่มี default เพราะถ้าลืมส่ง limit การสร้างบิลจะเผาโควตา push ได้ไม่จำกัด
  if (typeof allowBillCreate !== 'function') {
    throw new TypeError('createBillsRouter requires allowBillCreate');
  }
  const router = express.Router();

  router.get('/', async (req, res) => {
    res.json(await bills.list(req.userId));
  });

  router.post('/', async (req, res) => {
    if (!allowBillCreate(req.userId)) {
      res.status(429).json({ error: 'Too many requests' });
      return;
    }
    const result = await bills.create(req.userId, req.body);
    if (result.status !== 'ok') {
      res.status(400).json({ error: result.error });
      return;
    }
    res.status(201).json({ id: result.id, notNotified: result.notNotified });
  });

  router.post('/:id/cancel', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id) || !(await bills.cancel(req.userId, req.params.id))) {
      notFound(res);
      return;
    }
    res.json({ status: 'cancelled' });
  });

  router.post('/:id/members/:memberId/paid', async (req, res) => {
    if (!UUID_PATTERN.test(req.params.id) || !UUID_PATTERN.test(req.params.memberId)) {
      notFound(res);
      return;
    }
    const paid = req.body && req.body.paid;
    if (typeof paid !== 'boolean') {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    if (!(await bills.setPaid(req.userId, req.params.id, req.params.memberId, paid))) {
      notFound(res);
      return;
    }
    res.json({ paid });
  });

  for (const answer of ['confirm', 'decline']) {
    router.post(`/:id/${answer}`, async (req, res) => {
      if (!UUID_PATTERN.test(req.params.id)) {
        notFound(res);
        return;
      }
      const result = await bills.respond(req.userId, req.params.id, answer);
      if (result.status === 'not_found') {
        notFound(res);
        return;
      }
      res.json({ status: result.status });
    });
  }

  return router;
}

module.exports = { createBillsRouter };
```

ใน `src/api/router.js`:
- เพิ่ม `billsRouter,` ในพารามิเตอร์ (ต่อจาก `friendsRouter,`)
- ต่อจาก guard ของ `friendsRouter` เพิ่ม:

```js
  if (!billsRouter) {
    throw new TypeError('createApiRouter requires billsRouter');
  }
```

- ต่อจาก `router.use('/friends', friendsRouter);` เพิ่ม `router.use('/bills', billsRouter);`

ใน `src/bot.js`:
- เพิ่ม require: `const { BILL_CONFIRM_ACTION, BILL_DECLINE_ACTION } = require('./bills/flex');` และ `const { formatAmount } = require('./parser/format-reply');` (ถ้ายังไม่มี)
- ใต้ค่าคงที่ reply อื่นๆ เพิ่ม:

```js
const BILL_REPLIES = {
  declined: 'ปฏิเสธบิลนี้แล้ว',
  cancelled: 'บิลนี้ถูกยกเลิกแล้ว',
  already_confirmed: 'คุณยืนยันบิลนี้ไปแล้ว',
  already_declined: 'คุณปฏิเสธบิลนี้ไปแล้ว',
  not_found: 'ไม่พบบิลนี้',
};
```

- เพิ่ม `bills,` ในพารามิเตอร์ของ `createBot` (ต่อจาก `users,`)
- เพิ่มฟังก์ชันใน `createBot` (ก่อน `handlePostback`):

```js
  // การ์ดบิลอาจถูกกดซ้ำหรือกดอีกปุ่มทีหลัง จึงตอบตามสถานะที่ DB คืนมาเสมอ
  async function handleBillAnswer(params, lineUserId, answer) {
    const userId = await users.ensureUser(lineUserId);
    const result = await bills.respond(userId, params.get('bill'), answer);
    if (result.status === 'confirmed' && result.share !== undefined) {
      return { text: `บันทึกส่วนของคุณ ${formatAmount(result.share)} บาท ในหมวด ${result.categoryName} แล้ว` };
    }
    if (result.status === 'confirmed') return { text: BILL_REPLIES.already_confirmed };
    if (result.status === 'declined' && answer === 'confirm') return { text: BILL_REPLIES.already_declined };
    return { text: BILL_REPLIES[result.status] || BILL_REPLIES.not_found };
  }
```

- ใน `handlePostback` ก่อน `return null;` สุดท้าย เพิ่ม:

```js
    if (action === BILL_CONFIRM_ACTION || action === BILL_DECLINE_ACTION) {
      if (!UUID_PATTERN.test(params.get('bill') || '')) {
        return null;
      }
      return handleBillAnswer(params, lineUserId, action === BILL_CONFIRM_ACTION ? 'confirm' : 'decline');
    }
```

  หมายเหตุ: ถ้ากด "ปฏิเสธ" แล้ว DB คืน `declined` นั่นคือปฏิเสธสำเร็จ (`BILL_REPLIES.declined`); ถ้ากด "ยืนยัน" แล้ว DB คืน `declined` แปลว่าเคยปฏิเสธไว้ (`already_declined`) ซึ่งโค้ดด้านบนครอบแล้ว
- เพิ่ม `BILL_REPLIES` ใน `module.exports` ของ `src/bot.js`

ใน `index.js`:
- เพิ่ม require `createPushFlex` จาก `./src/line-reply`, `createBillService` จาก `./src/bills/service`, `createBillsRouter` จาก `./src/bills/router`
- ใต้ `FRIEND_LOOKUP_RATE_LIMIT` เพิ่ม:

```js
// แต่ละบิล push หาเพื่อนทุกคน จำกัดไว้กันโควตาข้อความหมด
const BILL_CREATE_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };
```

- ก่อน `createBot(...)` สร้าง:

```js
const bills = createBillService({
  repository,
  users,
  pushFlex: createPushFlex(lineClient),
  liffUrl: `https://liff.line.me/${config.liffId}`,
});
```

- ส่ง `bills,` ใน `createBot({ ... })`
- ใน `createApiRouter({ ... })` เพิ่ม `billsRouter: createBillsRouter({ bills, allowBillCreate: createRateLimiter(BILL_CREATE_RATE_LIMIT) }),`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bills src/api/router.test.js src/app.test.js src/bot.test.js` แล้ว `node --check index.js`
Expected: PASS ทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add src/bills/router.js src/bills/router.test.js src/api/router.js src/api/router.test.js src/app.test.js src/bot.js src/bot.test.js index.js
git commit -m "feat: add bills API and answer bill card buttons in the bot"
```

---

### Task 7: LIFF bill helpers, API calls, bill link and the new tab

**Depends on:** none (สัญญา HTTP อยู่ใน Global Constraints)

**Files:**
- Create: `public/liff/bills-format.mjs`
- Test: `public/liff/bills-format.test.mjs`
- Modify: `public/liff/api.mjs`, Test: `public/liff/api.test.mjs`
- Modify: `public/liff/deep-link.mjs`, Test: `public/liff/deep-link.test.mjs`
- Modify: `public/liff/tabs.mjs`, Test: `public/liff/tabs.test.mjs`
- Modify: `public/liff/index.html` (symbol `tab-bill` และ `<div id="panel-bills" class="panel" hidden></div>` ต่อจาก `#panel-recurring`)
- Modify: `public/liff/app.dom.test.mjs` (รายชื่อแท็บ 6 แท็บ)

**Interfaces:**
- Produces:
  - `bills-format.mjs`: `toSatang(amount)`, `splitEvenly(totalSatang, count)` (ผลแบบเดียวกับ server), `buildEqualShares(total, memberCount): { ownerShare, memberShare } | null`, `sumShortfall(total, ownerShare, shares): number` (บาท, บวก = ยังขาด, ลบ = เกิน), `outstandingAmount(bill: OwnedBill): number`, `MEMBER_STATUS_LABELS`, `BILL_ERROR_MESSAGES`, `describeBillError(status, action: 'load'|'create'|'cancel'|'paid'|'respond', error?)`, `buildBillUrl(liffId, billId)`
  - `api.mjs`: `listBills()`, `createBill(body)`, `cancelBill(id)`, `setBillPaid(id, memberId, paid)`, `confirmBill(id)`, `declineBill(id)`
  - `deep-link.mjs`: `parseBillLink(search): string | null` (UUID เท่านั้น)
  - `tabs.mjs`: แท็บใหม่ `{ id: 'bills', label: 'หารบิล', title: 'หารบิล', icon: 'tab-bill', showMonth: false }` ลำดับที่ 5 (ก่อน `profile`)

- [ ] **Step 1: Write the failing tests**

`public/liff/bills-format.test.mjs`:

```js
import { describe, it, expect } from 'vitest';
import {
  toSatang,
  splitEvenly,
  buildEqualShares,
  sumShortfall,
  outstandingAmount,
  MEMBER_STATUS_LABELS,
  describeBillError,
  buildBillUrl,
} from './bills-format.mjs';
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

describe('split helpers', () => {
  it('match the server rounding', () => {
    expect(toSatang(333.33)).toBe(33333);
    expect(toSatang(1.005)).toBeNull();
    expect(splitEvenly(100000, 3)).toEqual({ base: 33333, remainder: 1 });
  });

  it('builds equal shares with the leftover satang on the owner', () => {
    expect(buildEqualShares(1000, 2)).toEqual({ ownerShare: 333.34, memberShare: 333.33 });
    expect(buildEqualShares(900, 2)).toEqual({ ownerShare: 300, memberShare: 300 });
    expect(buildEqualShares(0, 2)).toBeNull();
    expect(buildEqualShares(1000, 0)).toBeNull();
  });

  it('says how far the shares are from the total', () => {
    expect(sumShortfall(1000, 300, [300, 300])).toBe(100);
    expect(sumShortfall(1000, 400, [300, 300.01])).toBe(-0.01);
    expect(sumShortfall(1000, 400, [300, 300])).toBe(0);
  });

  it('counts what friends still owe, skipping declined and paid members', () => {
    const bill = {
      status: 'open',
      members: [
        { share: 300, status: 'confirmed', paid: false },
        { share: 200, status: 'pending', paid: false },
        { share: 100, status: 'declined', paid: false },
        { share: 50, status: 'confirmed', paid: true },
      ],
    };

    expect(outstandingAmount(bill)).toBe(500);
    expect(outstandingAmount({ ...bill, status: 'cancelled' })).toBe(300);
  });
});

describe('labels and messages', () => {
  it('labels member statuses in Thai', () => {
    expect(MEMBER_STATUS_LABELS).toEqual({ pending: 'รอตอบ', confirmed: 'ยืนยันแล้ว', declined: 'ปฏิเสธ' });
  });

  it('explains failures per action', () => {
    expect(describeBillError(401, 'create')).toBe(LOGIN_REQUIRED_MESSAGE);
    expect(describeBillError(400, 'create', 'Not friends')).toBe('มีคนที่ไม่ได้เป็นเพื่อนกันแล้ว โหลดรายชื่อใหม่แล้วลองอีกครั้ง');
    expect(describeBillError(400, 'create', 'Shares do not add up')).toBe('ยอดของทุกคนรวมกันไม่เท่ากับยอดบิล');
    expect(describeBillError(400, 'create', 'Invalid title')).toBe('ข้อมูลบิลไม่ถูกต้อง ตรวจชื่อบิล ยอด และวันที่อีกครั้ง');
    expect(describeBillError(429, 'create')).toBe('สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่');
    expect(describeBillError(500, 'create')).toBe('สร้างบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBillError(500, 'load')).toBe('โหลดบิลไม่สำเร็จ');
    expect(describeBillError(404, 'respond')).toBe('ไม่พบบิลนี้แล้ว');
    expect(describeBillError(500, 'respond')).toBe('ตอบบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBillError(500, 'cancel')).toBe('ยกเลิกบิลไม่สำเร็จ ลองใหม่อีกครั้ง');
    expect(describeBillError(500, 'paid')).toBe('บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('builds the link to a bill on the web page', () => {
    expect(buildBillUrl('liff-1', 'b-1')).toBe('https://liff.line.me/liff-1?bill=b-1');
  });
});
```

เพิ่มใน `public/liff/api.test.mjs`:

```js
  it('reads, creates, cancels, marks paid and answers bills', async () => {
    const fetchImpl = fakeFetch(200, {});
    const api = setup(fetchImpl);

    await api.listBills();
    await api.createBill({ title: 'x' });
    await api.cancelBill('b/1');
    await api.setBillPaid('b1', 'm1', true);
    await api.confirmBill('b1');
    await api.declineBill('b1');

    expect(fetchImpl.mock.calls.map(([url, options]) => [options.method ?? 'GET', url])).toEqual([
      ['GET', '/api/bills'],
      ['POST', '/api/bills'],
      ['POST', '/api/bills/b%2F1/cancel'],
      ['POST', '/api/bills/b1/members/m1/paid'],
      ['POST', '/api/bills/b1/confirm'],
      ['POST', '/api/bills/b1/decline'],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ title: 'x' });
    expect(JSON.parse(fetchImpl.mock.calls[3][1].body)).toEqual({ paid: true });
  });
```

เพิ่มใน `public/liff/deep-link.test.mjs` (และ import `parseBillLink`):

```js
describe('parseBillLink', () => {
  const BILL = '55555555-5555-5555-5555-555555555555';

  it('reads a bill id from the query or from liff.state', () => {
    expect(parseBillLink(`?bill=${BILL}`)).toBe(BILL);
    expect(parseBillLink(`?liff.state=${encodeURIComponent(`?bill=${BILL}`)}`)).toBe(BILL);
  });

  it('ignores anything that is not a UUID', () => {
    expect(parseBillLink('?bill=abc')).toBeNull();
    expect(parseBillLink('')).toBeNull();
  });
});
```

ใน `public/liff/tabs.test.mjs` แก้เทสต์ `has the five tabs in order` เป็น:

```js
  it('has the six tabs in order', () => {
    expect(TABS.map((tab) => tab.id)).toEqual(['list', 'summary', 'budgets', 'recurring', 'bills', 'profile']);
    expect(TABS.map((tab) => tab.label)).toEqual(['รายการ', 'สรุป', 'จัดการงบ', 'รอบเดือน', 'หารบิล', 'โปรไฟล์']);
    expect(DEFAULT_TAB).toBe('list');
  });
```

ใน `public/liff/app.dom.test.mjs` แก้เทสต์ `renders the five bottom tabs with the list tab selected`: ชื่อเป็น `renders the six bottom tabs with the list tab selected` และ array labels เป็น `['รายการ', 'สรุป', 'จัดการงบ', 'รอบเดือน', 'หารบิล', 'โปรไฟล์']`; ถ้าเทสต์นั้นวนตรวจ panel ของแท็บอื่น (`for (const id of ['summary', 'budgets', 'recurring', 'profile'])`) ให้เพิ่ม `'bills'`; และเทสต์ sprite ของแท็บ (`defines a sprite symbol for every bottom tab icon`) จะครอบ `tab-bill` อัตโนมัติ

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run public/liff/bills-format.test.mjs public/liff/api.test.mjs public/liff/deep-link.test.mjs public/liff/tabs.test.mjs public/liff/app.dom.test.mjs`
Expected: FAIL — module ไม่มี, method ไม่มี, แท็บมี 5

- [ ] **Step 3: Write minimal implementation**

`public/liff/bills-format.mjs`:

```js
import { LOGIN_REQUIRED_MESSAGE } from './format.mjs';

// ตรงกับ src/bills/validate.js ฝั่ง server เพื่อให้ยอดที่หน้าเว็บแบ่งผ่านการตรวจเสมอ
export function toSatang(amount) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
  const satang = Math.round(amount * 100);
  return Math.abs(satang - amount * 100) < 1e-6 ? satang : null;
}

export function splitEvenly(totalSatang, count) {
  const base = Math.floor(totalSatang / count);
  return { base, remainder: totalSatang - base * count };
}

// เศษสตางค์ให้เจ้าของบิล ตามที่ตกลงไว้
export function buildEqualShares(total, memberCount) {
  const totalSatang = toSatang(total);
  if (!totalSatang || memberCount < 1) return null;
  const { base, remainder } = splitEvenly(totalSatang, memberCount + 1);
  return { ownerShare: (base + remainder) / 100, memberShare: base / 100 };
}

export function sumShortfall(total, ownerShare, shares) {
  const sum = [ownerShare, ...shares].reduce((acc, amount) => acc + (toSatang(amount) ?? 0), 0);
  return ((toSatang(total) ?? 0) - sum) / 100;
}

// บิลที่ยกเลิกแล้ว คนที่ยังไม่ตอบไม่ต้องจ่าย เหลือแค่คนที่ยืนยันไปแล้ว
export function outstandingAmount(bill) {
  const owing = bill.members.filter(
    (member) => !member.paid && (member.status === 'confirmed' || (member.status === 'pending' && bill.status === 'open'))
  );
  return owing.reduce((sum, member) => sum + Math.round(member.share * 100), 0) / 100;
}

export const MEMBER_STATUS_LABELS = { pending: 'รอตอบ', confirmed: 'ยืนยันแล้ว', declined: 'ปฏิเสธ' };

export function describeBillError(status, action, error) {
  if (status === 401) return LOGIN_REQUIRED_MESSAGE;
  if (action === 'create') {
    if (status === 400 && error === 'Not friends') return 'มีคนที่ไม่ได้เป็นเพื่อนกันแล้ว โหลดรายชื่อใหม่แล้วลองอีกครั้ง';
    if (status === 400 && error === 'Shares do not add up') return 'ยอดของทุกคนรวมกันไม่เท่ากับยอดบิล';
    if (status === 400) return 'ข้อมูลบิลไม่ถูกต้อง ตรวจชื่อบิล ยอด และวันที่อีกครั้ง';
    if (status === 429) return 'สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่';
    return 'สร้างบิลไม่สำเร็จ ลองใหม่อีกครั้ง';
  }
  if (action === 'respond') return status === 404 ? 'ไม่พบบิลนี้แล้ว' : 'ตอบบิลไม่สำเร็จ ลองใหม่อีกครั้ง';
  if (action === 'cancel') return 'ยกเลิกบิลไม่สำเร็จ ลองใหม่อีกครั้ง';
  if (action === 'paid') return 'บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง';
  return 'โหลดบิลไม่สำเร็จ';
}

export function buildBillUrl(liffId, billId) {
  return `https://liff.line.me/${liffId}?bill=${billId}`;
}
```

ใน `public/liff/api.mjs` เพิ่มใน object ที่ return:

```js
    listBills: () => request('/bills'),
    createBill: (body) => request('/bills', { method: 'POST', body: JSON.stringify(body) }),
    cancelBill: (id) => request(`/bills/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
    setBillPaid: (id, memberId, paid) =>
      request(`/bills/${encodeURIComponent(id)}/members/${encodeURIComponent(memberId)}/paid`, {
        method: 'POST',
        body: JSON.stringify({ paid }),
      }),
    confirmBill: (id) => request(`/bills/${encodeURIComponent(id)}/confirm`, { method: 'POST' }),
    declineBill: (id) => request(`/bills/${encodeURIComponent(id)}/decline`, { method: 'POST' }),
```

ใน `public/liff/deep-link.mjs` เพิ่ม:

```js
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ลิงก์บิลจากการ์ดหรือที่เจ้าของส่งให้คือ ?bill=<id>
export function parseBillLink(search) {
  const id = readLinkParams(search).get('bill');
  return id && UUID_PATTERN.test(id) ? id : null;
}
```

ใน `public/liff/tabs.mjs` แทรกแท็บใน `TABS` ก่อนรายการ `profile`:

```js
  { id: 'bills', label: 'หารบิล', title: 'หารบิล', icon: 'tab-bill', showMonth: false },
```

ใน `public/liff/index.html`:
- ใน `<svg>` sprite ต่อจาก `<symbol id="tab-repeat" ...>` เพิ่ม:

```html
    <symbol id="tab-bill" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M12 7v8M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6-1 1.4-2.5 1.4-2.5.5-2.5 1.5 1 1.5 2.5 1.5 2.5-.5 2.5-1.5"/></symbol>
```

- ต่อจาก `</div>` ที่ปิด `#panel-recurring` เพิ่ม `<div id="panel-bills" class="panel" hidden></div>` (Task 8 เติมเนื้อหา)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด (แถบล่างมี 6 ปุ่ม)

- [ ] **Step 5: Commit**

```bash
git add public/liff/bills-format.mjs public/liff/bills-format.test.mjs public/liff/api.mjs public/liff/api.test.mjs public/liff/deep-link.mjs public/liff/deep-link.test.mjs public/liff/tabs.mjs public/liff/tabs.test.mjs public/liff/index.html public/liff/app.dom.test.mjs
git commit -m "feat: add LIFF bill helpers, API calls, bill links and the bills tab"
```

---

### Task 8: Bills tab: lists and actions

**Depends on:** Task 7

**Files:**
- Create: `public/liff/bills-panel.mjs`
- Modify: `public/liff/index.html` (เนื้อหาใน `#panel-bills` และ `<dialog id="bill-dialog">`)
- Modify: `public/liff/style.css`
- Modify: `public/liff/app.mjs` (สร้าง panel, โหลดเมื่อเข้าแท็บ, ลิงก์ `?bill=`)
- Test: `public/liff/app.dom.test.mjs`

**Interfaces:**
- Consumes: ทุกอย่างจาก Task 7, `formatBaht`, `formatThaiDate` จาก `format.mjs`, `createLoadingIndicator` จาก `skeleton.mjs`
- Produces: `createBillsPanel({ doc, els, getApi, liff, getLiffId, clipboard })` คืน `{ ensureLoaded(): Promise<void>, reload(): Promise<void>, focusBill(id): Promise<void> }` (Task 9 เรียก `reload` หลังสร้างบิล)

**Browser check:**
- Preconditions: deploy branch นี้ และรัน `013_bills.sql` แล้ว; บัญชี LINE A และ B เป็นเพื่อนกันในบอทแล้ว และ B เพิ่มบอทแล้ว; มีบิลที่ A สร้างให้ B อย่างน้อย 1 ใบ (สร้างหลัง Task 9 หรือสร้างผ่าน API)
- Base URL: ลิงก์ LIFF ของบอทเปิดจากแอป LINE

| # | Action | Expected |
|---|---|---|
| 1 | B: เปิดหน้าเว็บ แตะแท็บ "หารบิล" | หัวข้อ "รอฉันยืนยัน" มีบิลของ A แสดงชื่อบิล ชื่อ A วันที่ และ "ส่วนของคุณ ... บาท" พร้อมปุ่ม "ยืนยัน" "ปฏิเสธ" |
| 2 | B: แตะ "ยืนยัน" | สถานะของบิลเปลี่ยนเป็น "ยืนยันแล้ว" ปุ่มหายไป และแท็บรายการของเดือนนั้นมีรายจ่ายชื่อบิล |
| 3 | A: แท็บ "หารบิล" | หัวข้อ "บิลที่ฉันสร้าง" มีบิลนั้น B มีสถานะ "ยืนยันแล้ว" และ "ค้างรับ ... บาท" |
| 4 | A: ติ๊ก "คืนแล้ว" ของ B | ยอดค้างรับลดลงเป็น 0 บาท |
| 5 | A: แตะ "ยกเลิกบิล" ของอีกบิลที่ยังมีคนรอตอบ แล้วยืนยัน | บิลมีป้าย "ยกเลิกแล้ว" และเพื่อนที่ยังไม่ตอบกดยืนยันไม่ได้ (ฝั่งเพื่อนเห็นป้าย "ยกเลิกแล้ว" ไม่มีปุ่ม) |

- [ ] **Step 1: Write the failing DOM tests**

ใน `public/liff/app.dom.test.mjs` เพิ่มใน `RESPONSES`:

```js
  '/api/bills': {
    owned: [
      {
        id: 'b-own',
        title: 'เนื้อย่าง',
        total: 900,
        occurredOn: '2026-10-08',
        categoryName: 'อาหาร',
        status: 'open',
        ownerShare: 300,
        createdAt: '2026-10-08T10:00:00+00:00',
        members: [
          { userId: 'f-1', displayName: 'บี', share: 300, status: 'confirmed', paid: false, notified: true },
          { userId: 'f-2', displayName: 'ซี', share: 300, status: 'pending', paid: false, notified: false },
        ],
      },
    ],
    incoming: [
      {
        id: 'b-in',
        title: 'ชาบู',
        total: 600,
        occurredOn: '2026-10-07',
        categoryName: 'อาหาร',
        status: 'open',
        ownerName: 'ดี',
        myShare: 200,
        myStatus: 'pending',
        paid: false,
      },
    ],
  },
```

เพิ่ม `'bills-error', 'bills-skeleton', 'bill-dialog-busy'` ในรายการ ids ของเทสต์ `starts every JS-controlled loading and error element hidden`

เพิ่ม describe ท้ายไฟล์:

```js
describe('LIFF bills tab', () => {
  async function openBills({ route } = {}) {
    await boot();
    const calls = route ? routeFetch(route) : routeFetch(() => undefined);
    clickTab('bills');
    await settle();
    return calls;
  }

  const incomingCard = () => document.querySelector('#bills-incoming .bill-card');
  const ownedCard = () => document.querySelector('#bills-owned .bill-card');

  it('loads the bills when the tab opens and shows both lists', async () => {
    await openBills();

    expect(incomingCard().querySelector('.bill-title').textContent).toBe('ชาบู');
    expect(incomingCard().querySelector('.bill-meta').textContent).toBe('ดี · 07/10');
    expect(incomingCard().querySelector('.bill-share').textContent).toBe('ส่วนของคุณ 200 บาท');
    expect(ownedCard().querySelector('.bill-title').textContent).toBe('เนื้อย่าง');
    expect(ownedCard().querySelector('.bill-outstanding').textContent).toBe('ค้างรับ 600 บาท');
    const members = [...ownedCard().querySelectorAll('.bill-member')];
    expect(members.map((row) => row.querySelector('.bill-member-name').textContent)).toEqual(['บี', 'ซี']);
    expect(members.map((row) => row.querySelector('.bill-member-status').textContent)).toEqual(['ยืนยันแล้ว', 'รอตอบ']);
  });

  it('shows the empty notes when there are no bills', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { owned: [], incoming: [] } : undefined) });

    expect(byId('bills-incoming-empty').hidden).toBe(false);
    expect(byId('bills-incoming-empty').textContent).toBe('ยังไม่มีบิลที่รอคุณยืนยัน');
    expect(byId('bills-owned-empty').hidden).toBe(false);
    expect(byId('bills-owned-empty').textContent).toBe('ยังไม่มีบิลที่คุณสร้าง');
  });

  it('shows an error with retry when the bills fail to load', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills' ? { status: 500 } : undefined) });

    expect(byId('bills-error').hidden).toBe(false);
    expect(byId('bills-error-text').textContent).toBe('โหลดบิลไม่สำเร็จ');
    routeFetch(() => undefined);
    byId('bills-retry').click();
    await settle();
    expect(byId('bills-error').hidden).toBe(true);
    expect(incomingCard()).not.toBeNull();
  });

  it('confirms an incoming bill and reloads', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 'confirmed' } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/confirm');
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
    expect(byId('bills-status').textContent).toBe('ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ');
  });

  it('declines an incoming bill after confirming in the dialog', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-in/decline' ? { status: 'declined' } : undefined) });

    incomingCard().querySelector('.bill-decline').click();
    expect(byId('bill-dialog-text').textContent).toBe('ปฏิเสธบิล ชาบู ของ ดี?');
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-in/decline');
    expect(byId('bill-dialog').hasAttribute('open')).toBe(false);
  });

  it('shows why answering failed', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-in/confirm' ? { status: 404 } : undefined) });

    incomingCard().querySelector('.bill-confirm').click();
    await settle();

    expect(byId('bills-status').textContent).toBe('ไม่พบบิลนี้แล้ว');
  });

  it('marks a member as paid back and lowers the outstanding amount', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { paid: true } : undefined) });

    const paidBox = ownedCard().querySelector('.bill-member input[type="checkbox"]');
    paidBox.checked = true;
    paidBox.dispatchEvent(new Event('change'));
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/members/f-1/paid');
    expect(ownedCard().querySelector('.bill-outstanding').textContent).toBe('ค้างรับ 300 บาท');
  });

  it('puts the checkbox back when marking paid fails', async () => {
    await openBills({ route: (method, path) => (path === '/api/bills/b-own/members/f-1/paid' ? { status: 500 } : undefined) });

    const paidBox = ownedCard().querySelector('.bill-member input[type="checkbox"]');
    paidBox.checked = true;
    paidBox.dispatchEvent(new Event('change'));
    await settle();

    expect(ownedCard().querySelector('.bill-member input[type="checkbox"]').checked).toBe(false);
    expect(byId('bills-status').textContent).toBe('บันทึกการคืนเงินไม่สำเร็จ ลองใหม่อีกครั้ง');
  });

  it('cancels an owned bill after confirming in the dialog', async () => {
    const calls = await openBills({ route: (method, path) => (path === '/api/bills/b-own/cancel' ? { status: 'cancelled' } : undefined) });

    ownedCard().querySelector('.bill-cancel').click();
    expect(byId('bill-dialog-text').textContent).toBe('ยกเลิกบิล เนื้อย่าง? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ ส่วนที่บันทึกไปแล้วยังอยู่');
    byId('bill-dialog-ok').click();
    await settle();

    expect(calls).toContain('POST /api/bills/b-own/cancel');
  });

  it('flags members the push did not reach and shares the bill link with them', async () => {
    const writeText = vi.fn().mockResolvedValue();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await openBills();

    const unreached = [...ownedCard().querySelectorAll('.bill-member')][1];
    expect(unreached.querySelector('.bill-member-note').textContent).toBe('แจ้งเตือนไม่ถึง (ยังไม่ได้เพิ่มบอท)');
    unreached.querySelector('.bill-share-link').click();
    await settle();

    expect(writeText).toHaveBeenCalledWith('https://liff.line.me/liff-1?bill=b-own');
    expect(byId('bills-status').textContent).toBe('คัดลอกลิงก์บิลแล้ว ส่งให้เพื่อนได้เลย');
  });

  it('shows a cancelled bill without actions', async () => {
    await openBills({
      route: (method, path) =>
        path === '/api/bills'
          ? {
              owned: [],
              incoming: [{ ...RESPONSES['/api/bills'].incoming[0], status: 'cancelled' }],
            }
          : undefined,
    });

    expect(incomingCard().querySelector('.bill-badge').textContent).toBe('ยกเลิกแล้ว');
    expect(incomingCard().querySelector('.bill-confirm')).toBeNull();
  });

  it('opens the bills tab at the linked bill', async () => {
    await boot({ search: '?bill=55555555-5555-5555-5555-555555555555' });
    await settle();

    expect(document.querySelector('#bottom-nav [aria-current="page"]').dataset.tab).toBe('bills');
    expect(window.location.search).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run public/liff/app.dom.test.mjs`
Expected: FAIL — ไม่มี `#bills-incoming` ฯลฯ

- [ ] **Step 3: Add the markup and styles**

ใน `public/liff/index.html` แทน `<div id="panel-bills" class="panel" hidden></div>` ด้วย:

```html
    <div id="panel-bills" class="panel" hidden>
      <div class="bills-toolbar">
        <button type="button" id="bill-new" class="bill-new">สร้างบิล</button>
      </div>
      <p id="bills-status" class="export-status bills-status" role="status" aria-live="polite"></p>
      <p id="bills-loading" class="sr-only" role="status" hidden>กำลังโหลดบิล...</p>
      <ul id="bills-skeleton" class="skeleton-list skeleton-padded" aria-hidden="true" hidden></ul>
      <div id="bills-error" class="budgets-error bills-error" role="alert" hidden>
        <p id="bills-error-text"></p>
        <button type="button" id="bills-retry">ลองใหม่</button>
      </div>
      <div id="bills-body" hidden>
        <section class="bills-section" aria-labelledby="bills-incoming-title">
          <h2 id="bills-incoming-title">รอฉันยืนยัน</h2>
          <ul id="bills-incoming" class="bill-list"></ul>
          <p id="bills-incoming-empty" class="bills-empty" hidden>ยังไม่มีบิลที่รอคุณยืนยัน</p>
        </section>
        <section class="bills-section" aria-labelledby="bills-owned-title">
          <h2 id="bills-owned-title">บิลที่ฉันสร้าง</h2>
          <ul id="bills-owned" class="bill-list"></ul>
          <p id="bills-owned-empty" class="bills-empty" hidden>ยังไม่มีบิลที่คุณสร้าง</p>
        </section>
      </div>
    </div>
```

และต่อจาก `<dialog id="friend-dialog" ...>...</dialog>` เพิ่ม:

```html
  <dialog id="bill-dialog" aria-labelledby="bill-dialog-title">
    <h2 id="bill-dialog-title"></h2>
    <p id="bill-dialog-text" class="confirm-detail"></p>
    <p id="bill-dialog-busy" class="confirm-detail" role="status" hidden>กำลังดำเนินการ...</p>
    <p id="bill-dialog-error" class="error" role="alert"></p>
    <div class="actions">
      <button type="button" id="bill-dialog-cancel">ยกเลิก</button>
      <button type="button" id="bill-dialog-ok" class="danger-solid"></button>
    </div>
  </dialog>
```

ต่อท้าย `public/liff/style.css`:

```css
.bills-toolbar { display: flex; justify-content: flex-end; margin: 12px 16px 0; }
.bill-new, #bills-retry { font: inherit; min-height: 44px; padding: 8px 20px; font-size: 15px; border: 1px solid var(--primary); border-radius: 9999px; background: var(--primary); color: var(--on-primary); }
#bills-retry { background: var(--surface); color: var(--primary); border-color: var(--outline); }
.bills-status { margin: 8px 16px 0; overflow-wrap: anywhere; }
.bills-error { margin: 12px 16px 0; }
.bills-section { margin: 12px 16px 0; padding: 20px; background: var(--surface); border-radius: 28px; }
.bills-section h2 { margin: 0; font-size: 19px; font-weight: 600; }
.bill-list { list-style: none; margin: 4px 0 0; padding: 0; }
.bill-card { padding: 12px 0; border-bottom: 1px solid var(--border); }
.bill-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.bill-title { font-weight: 600; overflow-wrap: anywhere; }
.bill-badge { flex: none; font-size: 12px; color: var(--muted); }
.bill-meta { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
.bill-share, .bill-outstanding { margin: 4px 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.bill-actions { display: flex; gap: 8px; margin-top: 8px; }
.bill-actions button, .bill-share-link { font: inherit; min-height: 44px; padding: 8px 16px; font-size: 14px; border: 1px solid var(--outline); border-radius: 9999px; background: var(--surface); color: var(--text); }
.bill-actions .bill-confirm { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.bill-actions .bill-cancel, .bill-actions .bill-decline { color: var(--danger); }
.bill-members { list-style: none; margin: 8px 0 0; padding: 0; }
.bill-member { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; padding: 6px 0; font-size: 14px; }
.bill-member-name { overflow-wrap: anywhere; }
.bill-member-status { color: var(--muted); white-space: nowrap; }
.bill-member-paid { display: flex; align-items: center; gap: 6px; min-height: 44px; }
.bill-member-note { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--warn); }
.bills-empty { margin: 12px 0 0; font-size: 13px; color: var(--muted); }
#bill-dialog h2 { margin: 0; font-size: 18px; }
#bill-dialog .error:empty { display: none; }
```

- [ ] **Step 4: Write the panel module**

`public/liff/bills-panel.mjs`:

```js
import { ApiError } from './api.mjs';
import { formatBaht, formatThaiDate } from './format.mjs';
import { createLoadingIndicator } from './skeleton.mjs';
import { MEMBER_STATUS_LABELS, outstandingAmount, describeBillError, buildBillUrl } from './bills-format.mjs';

const statusOf = (err) => (err instanceof ApiError ? err.status : 0);

// แท็บหารบิลโหลดเมื่อเข้าแท็บครั้งแรก และโหลดใหม่หลังทุกการกระทำ เพราะสถานะของเพื่อนเปลี่ยนจากฝั่งอื่นได้
export function createBillsPanel({ doc, els, getApi, liff, getLiffId, clipboard }) {
  let data = null;
  let loading = null;
  let dialogAction = null;
  let dialogBusy = false;
  const loadingIndicator = createLoadingIndicator({
    doc,
    textEl: els.loadingText,
    skeletonEl: els.skeleton,
    variants: ['bill-card', 'bill-card'],
  });

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(className, text, onClick) {
    const node = el('button', className, text);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function renderIncoming(bill) {
    const item = el('li', 'bill-card');
    item.dataset.id = bill.id;
    const head = el('div', 'bill-head');
    head.append(el('span', 'bill-title', bill.title));
    if (bill.status === 'cancelled') head.append(el('span', 'bill-badge', 'ยกเลิกแล้ว'));
    else if (bill.myStatus !== 'pending') head.append(el('span', 'bill-badge', MEMBER_STATUS_LABELS[bill.myStatus]));
    item.append(head, el('p', 'bill-meta', `${bill.ownerName} · ${formatThaiDate(bill.occurredOn)}`));
    item.append(el('p', 'bill-share', `ส่วนของคุณ ${formatBaht(bill.myShare)}`));
    if (bill.status === 'open' && bill.myStatus === 'pending') {
      const actions = el('div', 'bill-actions');
      actions.append(
        button('bill-confirm', 'ยืนยัน', () => respond(bill, 'confirm')),
        button('bill-decline', 'ปฏิเสธ', () => askDecline(bill))
      );
      item.append(actions);
    }
    return item;
  }

  function renderMember(bill, member) {
    const row = el('li', 'bill-member');
    row.append(el('span', 'bill-member-name', member.displayName), el('span', 'bill-member-status', `${MEMBER_STATUS_LABELS[member.status]} · ${formatBaht(member.share)}`));
    if (member.status !== 'declined') {
      const label = el('label', 'bill-member-paid');
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.checked = member.paid;
      box.addEventListener('change', () => setPaid(bill, member, box));
      label.append(box, doc.createTextNode('คืนแล้ว'));
      row.append(label);
    }
    if (!member.notified && member.status === 'pending' && bill.status === 'open') {
      row.append(el('p', 'bill-member-note', 'แจ้งเตือนไม่ถึง (ยังไม่ได้เพิ่มบอท)'));
      row.append(button('bill-share-link', 'ส่งลิงก์บิล', () => shareBill(bill)));
    }
    return row;
  }

  function renderOwned(bill) {
    const item = el('li', 'bill-card');
    item.dataset.id = bill.id;
    const head = el('div', 'bill-head');
    head.append(el('span', 'bill-title', bill.title));
    if (bill.status === 'cancelled') head.append(el('span', 'bill-badge', 'ยกเลิกแล้ว'));
    item.append(head, el('p', 'bill-meta', `${formatThaiDate(bill.occurredOn)} · ${bill.categoryName} · รวม ${formatBaht(bill.total)}`));
    item.append(el('p', 'bill-outstanding', `ค้างรับ ${formatBaht(outstandingAmount(bill))}`));
    const members = el('ul', 'bill-members');
    members.append(...bill.members.map((member) => renderMember(bill, member)));
    item.append(members);
    if (bill.status === 'open') {
      const actions = el('div', 'bill-actions');
      actions.append(button('bill-cancel', 'ยกเลิกบิล', () => askCancel(bill)));
      item.append(actions);
    }
    return item;
  }

  function render() {
    els.incoming.replaceChildren(...data.incoming.map(renderIncoming));
    els.owned.replaceChildren(...data.owned.map(renderOwned));
    els.incomingEmpty.hidden = data.incoming.length > 0;
    els.ownedEmpty.hidden = data.owned.length > 0;
    loadingIndicator.set(false);
    els.error.hidden = true;
    els.body.hidden = false;
  }

  function load() {
    const api = getApi();
    if (!api) return Promise.resolve();
    els.error.hidden = true;
    if (!data) loadingIndicator.set(true);
    loading = api
      .listBills()
      .then(
        (result) => {
          data = result;
          render();
        },
        (err) => {
          loadingIndicator.set(false);
          // โหลดใหม่ที่พังไม่ลบรายการที่แสดงอยู่ แค่บอกผ่านบรรทัดสถานะ
          if (data) {
            els.status.textContent = describeBillError(statusOf(err), 'load');
            return;
          }
          els.body.hidden = true;
          els.errorText.textContent = describeBillError(statusOf(err), 'load');
          els.error.hidden = false;
        }
      )
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  function ensureLoaded() {
    if (loading) return loading;
    if (data) return Promise.resolve();
    return load();
  }

  async function respond(bill, answer) {
    els.status.textContent = '';
    try {
      await (answer === 'confirm' ? getApi().confirmBill(bill.id) : getApi().declineBill(bill.id));
    } catch (err) {
      els.status.textContent = describeBillError(statusOf(err), 'respond');
      return false;
    }
    els.status.textContent = answer === 'confirm' ? 'ยืนยันแล้ว บันทึกเป็นรายจ่ายของคุณ' : 'ปฏิเสธบิลแล้ว';
    await load();
    return true;
  }

  async function setPaid(bill, member, box) {
    els.status.textContent = '';
    box.disabled = true;
    try {
      await getApi().setBillPaid(bill.id, member.userId, box.checked);
      member.paid = box.checked;
      render();
    } catch (err) {
      box.checked = member.paid;
      box.disabled = false;
      els.status.textContent = describeBillError(statusOf(err), 'paid');
    }
  }

  async function shareBill(bill) {
    els.status.textContent = '';
    const url = buildBillUrl(getLiffId(), bill.id);
    if (typeof liff.isApiAvailable === 'function' && liff.isApiAvailable('shareTargetPicker')) {
      try {
        const result = await liff.shareTargetPicker([{ type: 'text', text: `ยืนยันส่วนแบ่งบิล ${bill.title} ได้ที่ลิงก์นี้ ${url}` }]);
        if (result) els.status.textContent = 'ส่งลิงก์บิลแล้ว';
        return;
      } catch {
        // เปิดหน้าเลือกแชตไม่ได้ ใช้การคัดลอกลิงก์แทน
      }
    }
    try {
      await clipboard.writeText(url);
      els.status.textContent = 'คัดลอกลิงก์บิลแล้ว ส่งให้เพื่อนได้เลย';
    } catch {
      els.status.textContent = `ส่งลิงก์นี้ให้เพื่อน: ${url}`;
    }
  }

  function setDialogBusy(busy) {
    dialogBusy = busy;
    els.dialogOk.disabled = busy;
    els.dialogCancel.disabled = busy;
    els.dialogBusy.hidden = !busy;
  }

  // run คืนข้อความ error ที่จะแสดงใน dialog หรือ null เมื่อสำเร็จ
  function openDialog({ title, text, okLabel, run }) {
    els.dialogTitle.textContent = title;
    els.dialogText.textContent = text;
    els.dialogOk.textContent = okLabel;
    els.dialogError.textContent = '';
    setDialogBusy(false);
    dialogAction = run;
    els.dialog.showModal();
  }

  function askDecline(bill) {
    openDialog({
      title: 'ปฏิเสธบิล',
      text: `ปฏิเสธบิล ${bill.title} ของ ${bill.ownerName}?`,
      okLabel: 'ปฏิเสธ',
      run: async () => ((await respond(bill, 'decline')) ? null : els.status.textContent),
    });
  }

  function askCancel(bill) {
    openDialog({
      title: 'ยกเลิกบิล',
      text: `ยกเลิกบิล ${bill.title}? เพื่อนที่ยังไม่ตอบจะยืนยันไม่ได้ ส่วนที่บันทึกไปแล้วยังอยู่`,
      okLabel: 'ยกเลิกบิล',
      run: async () => {
        try {
          await getApi().cancelBill(bill.id);
        } catch (err) {
          return describeBillError(statusOf(err), 'cancel');
        }
        els.status.textContent = 'ยกเลิกบิลแล้ว';
        await load();
        return null;
      },
    });
  }

  async function focusBill(id) {
    await ensureLoaded();
    const card = doc.querySelector(`#panel-bills .bill-card[data-id="${CSS.escape(id)}"]`);
    if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'center' });
  }

  els.dialogOk.addEventListener('click', async () => {
    if (!dialogAction || dialogBusy) return;
    setDialogBusy(true);
    let message;
    try {
      message = await dialogAction();
    } catch {
      message = 'ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง';
    } finally {
      setDialogBusy(false);
    }
    if (message) {
      els.dialogError.textContent = message;
      return;
    }
    els.dialog.close();
  });
  els.dialogCancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('cancel', (event) => {
    if (dialogBusy) event.preventDefault();
  });
  els.dialog.addEventListener('close', () => {
    dialogAction = null;
  });
  els.retry.addEventListener('click', () => load());

  return { ensureLoaded, reload: load, focusBill };
}
```

ก่อนใช้ให้เปิด `public/liff/format.mjs` ยืนยันว่า `formatThaiDate('2026-10-07')` คืน `'07/10'` และ `formatBaht(200)` คืน `'200 บาท'` (ถ้าไม่ตรง ใช้ฟังก์ชันที่ให้ผลตามเทสต์และรายงาน) และ `public/liff/skeleton.mjs` ว่า `createLoadingIndicator` รับ `variants`; เพิ่ม CSS skeleton variant ใน `style.css` ต่อจาก variant อื่น: `.skeleton-bill-card { height: 120px; margin-top: 12px; border-radius: 28px; }` และเพิ่ม `'bill-card'` ในเทสต์ `public/liff/style.test.mjs` ที่ตรวจว่าทุก variant มีความสูงตายตัว (รายการ `it.each([...])`)

- [ ] **Step 5: Wire the panel into app.mjs**

ใน `public/liff/app.mjs`:
- เพิ่ม import `import { createBillsPanel } from './bills-panel.mjs';` และเปลี่ยน import ของ deep link ให้มี `parseBillLink`
- ต่อจากบล็อกที่สร้าง `friendsPanel` เพิ่ม:

```js
const billsPanel = createBillsPanel({
  doc: document,
  els: {
    status: document.getElementById('bills-status'),
    loadingText: document.getElementById('bills-loading'),
    skeleton: document.getElementById('bills-skeleton'),
    error: document.getElementById('bills-error'),
    errorText: document.getElementById('bills-error-text'),
    retry: document.getElementById('bills-retry'),
    body: document.getElementById('bills-body'),
    incoming: document.getElementById('bills-incoming'),
    incomingEmpty: document.getElementById('bills-incoming-empty'),
    owned: document.getElementById('bills-owned'),
    ownedEmpty: document.getElementById('bills-owned-empty'),
    dialog: document.getElementById('bill-dialog'),
    dialogTitle: document.getElementById('bill-dialog-title'),
    dialogText: document.getElementById('bill-dialog-text'),
    dialogBusy: document.getElementById('bill-dialog-busy'),
    dialogError: document.getElementById('bill-dialog-error'),
    dialogOk: document.getElementById('bill-dialog-ok'),
    dialogCancel: document.getElementById('bill-dialog-cancel'),
  },
  getApi: () => api,
  liff,
  getLiffId: () => liffId,
  clipboard: navigator.clipboard,
});
```

- ใน `onChange` ของ `createTabController` เพิ่ม `if (id === 'bills') billsPanel.ensureLoaded();`
- ใน `boot()`:
  - อ่าน `const billId = parseBillLink(window.location.search);` และเปลี่ยนเงื่อนไขล้าง URL เป็น `if (link || friendCode || billId) window.history.replaceState(null, '', window.location.pathname);`
  - ต่อจากบล็อก `if (friendCode) { ... }` (ก่อน `await loadAll()`) เพิ่ม:

```js
    // ลิงก์บิลจากการ์ดหรือที่เจ้าของส่งให้ พาไปที่บิลนั้นในแท็บหารบิล
    if (billId && !friendCode) {
      tabController.select('bills');
      billsPanel.focusBill(billId);
    }
```

  - ต่อจากบรรทัด `if (tabController.current === 'profile') friendsPanel.ensureLoaded();` เพิ่ม `if (tabController.current === 'bills') billsPanel.ensureLoaded();`

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด

- [ ] **Step 7: Commit**

```bash
git add public/liff/bills-panel.mjs public/liff/index.html public/liff/style.css public/liff/style.test.mjs public/liff/app.mjs public/liff/app.dom.test.mjs
git commit -m "feat: add the bills tab with incoming and owned bills and their actions"
```

---

### Task 9: Create bill form and docs

**Depends on:** Task 8

**Files:**
- Create: `public/liff/bill-form.mjs`
- Modify: `public/liff/index.html` (`<dialog id="bill-form-dialog">`)
- Modify: `public/liff/style.css`
- Modify: `public/liff/app.mjs` (สร้างฟอร์ม, ปุ่ม `#bill-new`)
- Test: `public/liff/app.dom.test.mjs`
- Modify: `README.md`, `SPEC.md`, `work-memory/STATE.md`

**Interfaces:**
- Consumes: `buildEqualShares`, `sumShortfall`, `toSatang`, `describeBillError` (Task 7); `billsPanel.reload` (Task 8); `api.getFriends` และ `api.createBill`; `categories` ของ app (array `{ id, name, type }`)
- Produces: `createBillForm({ doc, els, getApi, getCategories, onCreated })` คืน `{ open(): Promise<void> }`

**Browser check:**
- Preconditions: เหมือน Task 8; A มีเพื่อน B และ C ในบอท โดย C ยังไม่ได้เพิ่มบอท
- Base URL: ลิงก์ LIFF ของบอทเปิดจากแอป LINE

| # | Action | Expected |
|---|---|---|
| 1 | A: แท็บ "หารบิล" แตะ "สร้างบิล" | ฟอร์มขึ้นมา มีช่องชื่อบิล ยอดรวม วันที่ (วันนี้) หมวด (อาหาร) และรายชื่อเพื่อนให้ติ๊ก |
| 2 | A: พิมพ์ชื่อ "เนื้อย่าง" ยอด 1000 ติ๊ก B และ C | ช่องส่วนของฉันเป็น 333.34 ส่วนของ B และ C เป็น 333.33 |
| 3 | A: แก้ส่วนของ B เป็น 400 | มีข้อความแดง "ยอดรวมของทุกคนเกินยอดบิล 66.67 บาท" และปุ่ม "หารบิล" กดไม่ได้ |
| 4 | A: แตะ "แบ่งเท่ากัน" | ยอดกลับเป็น 333.34 / 333.33 / 333.33 และข้อความแดงหาย |
| 5 | A: แตะ "หารบิล" | ฟอร์มปิด บิลใหม่อยู่บนสุดของ "บิลที่ฉันสร้าง"; B ได้การ์ดใน LINE; แถวของ C มี "แจ้งเตือนไม่ถึง (ยังไม่ได้เพิ่มบอท)" และปุ่ม "ส่งลิงก์บิล" |
| 6 | B: แตะ "ยืนยัน" ในการ์ด | บอทตอบ "บันทึกส่วนของคุณ 333.33 บาท ในหมวด อาหาร แล้ว" |
| 7 | B: แตะ "ยืนยัน" ในการ์ดเดิมอีกครั้ง | บอทตอบ "คุณยืนยันบิลนี้ไปแล้ว" และไม่มีรายการซ้ำ |

- [ ] **Step 1: Write the failing DOM tests**

เพิ่มใน `describe('LIFF bills tab', ...)` ของ `public/liff/app.dom.test.mjs`:

```js
  async function openForm(route) {
    const calls = await openBills({ route });
    byId('bill-new').click();
    await settle();
    return calls;
  }

  const shareInputs = () => [...document.querySelectorAll('#bill-form-members input[type="number"]')];

  it('opens the form with today, the food category and the friends to pick', async () => {
    await openForm();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-date').value).toBe('2026-10-15');
    expect(byId('bill-form-category').selectedOptions[0].textContent).toBe('อาหาร');
    expect([...document.querySelectorAll('#bill-form-members .bill-form-name')].map((el) => el.textContent)).toEqual(['บี']);
  });

  it('splits evenly with the leftover on the owner when friends are picked', async () => {
    await openForm();

    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    expect(byId('bill-form-owner-share').value).toBe('500');
    expect(shareInputs().map((input) => input.value)).toEqual(['500']);
  });

  it('blocks submit and says how far off the shares are', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    shareInputs()[0].value = '600';
    shareInputs()[0].dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('ยอดรวมของทุกคนเกินยอดบิล 100 บาท');
    expect(byId('bill-form-submit').disabled).toBe(true);
    byId('bill-form-even').click();
    expect(byId('bill-form-error').textContent).toBe('');
    expect(byId('bill-form-submit').disabled).toBe(false);
  });

  it('asks to pick at least one friend', async () => {
    await openForm();
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));

    expect(byId('bill-form-error').textContent).toBe('เลือกเพื่อนอย่างน้อย 1 คน');
    expect(byId('bill-form-submit').disabled).toBe(true);
  });

  it('creates the bill, closes the form and reloads the list', async () => {
    let posted;
    const calls = await openForm((method, path) => {
      if (method === 'POST' && path === '/api/bills') return { id: 'b-new', notNotified: [] };
      return undefined;
    });
    vi.stubGlobal('fetch', ((original) => async (url, options = {}) => {
      if ((options.method ?? 'GET') === 'POST' && new URL(url, 'http://localhost').pathname === '/api/bills') posted = JSON.parse(options.body);
      return original(url, options);
    })(globalThis.fetch));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(posted).toEqual({
      title: 'เนื้อย่าง',
      total: 1000,
      occurredOn: '2026-10-15',
      categoryId: 'c-food',
      ownerShare: 500,
      members: [{ userId: 'f-1', share: 500 }],
    });
    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(false);
    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว');
    expect(calls.filter((call) => call === 'GET /api/bills').length).toBeGreaterThanOrEqual(2);
  });

  it('tells the owner when some friends were not notified', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { id: 'b-new', notNotified: ['f-1'] } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bills-status').textContent).toBe('สร้างบิลแล้ว แจ้งเตือนเพื่อนไม่ถึง 1 คน ส่งลิงก์บิลให้เขาได้ในรายการด้านล่าง');
  });

  it('keeps the form open and shows the server error', async () => {
    await openForm((method, path) => (method === 'POST' && path === '/api/bills' ? { status: 429 } : undefined));
    byId('bill-form-title').value = 'เนื้อย่าง';
    byId('bill-form-total').value = '1000';
    byId('bill-form-total').dispatchEvent(new Event('input'));
    const pick = document.querySelector('#bill-form-members input[type="checkbox"]');
    pick.checked = true;
    pick.dispatchEvent(new Event('change'));

    byId('bill-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();

    expect(byId('bill-form-dialog').hasAttribute('open')).toBe(true);
    expect(byId('bill-form-error').textContent).toBe('สร้างบิลบ่อยเกินไป รอสักครู่แล้วลองใหม่');
  });

  it('points to the profile tab when there are no friends yet', async () => {
    await openForm((method, path) => (path === '/api/friends' ? { code: 'ABCD2345', friends: [] } : undefined));

    expect(byId('bill-form-no-friends').hidden).toBe(false);
    expect(byId('bill-form-no-friends').textContent).toBe('ยังไม่มีเพื่อน เพิ่มเพื่อนที่แท็บโปรไฟล์ก่อน');
  });
```

(fixture `CATEGORIES` ในไฟล์มี `{ id: 'c-food', name: 'อาหาร', type: 'expense' }` และ `/api/friends` คืนเพื่อน `f-1` ชื่อ `บี` อยู่แล้ว วันที่ของเทสต์ถูกตั้งเป็น `2026-10-15` ใน `boot`)

เพิ่ม `'bill-form-no-friends'` ในรายการ ids ของเทสต์ `starts every JS-controlled loading and error element hidden`

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run public/liff/app.dom.test.mjs -t "bills tab"`
Expected: FAIL — ไม่มี `#bill-form-dialog`

- [ ] **Step 3: Add markup and styles**

ใน `public/liff/index.html` ต่อจาก `<dialog id="bill-dialog" ...>...</dialog>` เพิ่ม:

```html
  <dialog id="bill-form-dialog" class="bill-form-dialog" aria-labelledby="bill-form-heading">
    <form id="bill-form" novalidate>
      <h2 id="bill-form-heading">สร้างบิล</h2>
      <label>ชื่อบิล
        <input id="bill-form-title" type="text" maxlength="60" placeholder="เช่น เนื้อย่าง" required>
      </label>
      <label>ยอดรวม (บาท)
        <input id="bill-form-total" type="number" inputmode="decimal" step="0.01" min="0.01" max="10000000" required>
      </label>
      <label>วันที่
        <input id="bill-form-date" type="date" required>
      </label>
      <label>หมวด
        <select id="bill-form-category" required></select>
      </label>
      <fieldset class="bill-form-split">
        <legend>หารกับ</legend>
        <p id="bill-form-no-friends" class="bills-empty" hidden>ยังไม่มีเพื่อน เพิ่มเพื่อนที่แท็บโปรไฟล์ก่อน</p>
        <ul id="bill-form-members" class="bill-form-members"></ul>
        <label class="bill-form-owner">ส่วนของฉัน (บาท)
          <input id="bill-form-owner-share" type="number" inputmode="decimal" step="0.01" min="0">
        </label>
        <button type="button" id="bill-form-even" class="bill-form-even">แบ่งเท่ากัน</button>
      </fieldset>
      <p id="bill-form-error" class="error" role="alert"></p>
      <div class="actions">
        <button type="button" id="bill-form-cancel">ยกเลิก</button>
        <button type="submit" id="bill-form-submit" class="primary">หารบิล</button>
      </div>
    </form>
  </dialog>
```

ต่อท้าย `public/liff/style.css`:

```css
.bill-form-dialog { max-height: 90vh; overflow-y: auto; }
#bill-form-heading { margin: 0; font-size: 18px; }
.bill-form-split { margin: 16px 0 0; padding: 0; border: none; }
.bill-form-split legend { padding: 0; font-size: 14px; }
.bill-form-members { list-style: none; margin: 8px 0 0; padding: 0; }
.bill-form-member { display: grid; grid-template-columns: auto minmax(0, 1fr) 110px; align-items: center; gap: 8px; min-height: 44px; }
.bill-form-member input[type="checkbox"] { width: 20px; height: 20px; margin: 0; }
.bill-form-name { overflow-wrap: anywhere; }
.bill-form-member input[type="number"] { margin: 0; }
.bill-form-even { font: inherit; min-height: 44px; margin-top: 8px; padding: 8px 16px; border: 1px solid var(--outline); border-radius: 9999px; background: var(--surface); color: var(--primary); }
#bill-form-error:empty { display: none; }
```

- [ ] **Step 4: Write the form module**

`public/liff/bill-form.mjs`:

```js
import { ApiError } from './api.mjs';
import { buildEqualShares, sumShortfall, toSatang, describeBillError } from './bills-format.mjs';
import { formatBaht, currentMonth } from './format.mjs';

const DEFAULT_CATEGORY = 'อาหาร';

function todayIso() {
  // วันตามเวลาไทยเหมือนวันที่ที่บอทใช้บันทึก
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function createBillForm({ doc, els, getApi, getCategories, onCreated }) {
  let friends = [];
  let submitting = false;

  const amountOf = (input) => (input.value === '' ? NaN : Number(input.value));
  const picked = () => [...els.members.querySelectorAll('.bill-form-member')].filter((row) => row.querySelector('input[type="checkbox"]').checked);

  function fillCategories() {
    const expense = getCategories().filter((category) => category.type === 'expense');
    els.category.replaceChildren(
      ...expense.map((category) => {
        const option = doc.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        option.selected = category.name === DEFAULT_CATEGORY;
        return option;
      })
    );
  }

  function renderFriends() {
    els.noFriends.hidden = friends.length > 0;
    els.members.replaceChildren(
      ...friends.map((friend) => {
        const row = doc.createElement('li');
        row.className = 'bill-form-member';
        row.dataset.id = friend.id;
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.setAttribute('aria-label', `หารกับ ${friend.displayName}`);
        box.addEventListener('change', () => {
          splitEven();
          validate();
        });
        const name = doc.createElement('span');
        name.className = 'bill-form-name';
        name.textContent = friend.displayName;
        const share = doc.createElement('input');
        share.type = 'number';
        share.inputMode = 'decimal';
        share.step = '0.01';
        share.min = '0.01';
        share.setAttribute('aria-label', `ส่วนของ ${friend.displayName} (บาท)`);
        share.disabled = true;
        share.addEventListener('input', validate);
        row.append(box, name, share);
        return row;
      })
    );
  }

  // ยอดเปลี่ยนหรือเลือกคนเพิ่มแล้วเริ่มจากหารเท่าใหม่ทุกครั้ง แก้รายคนทีหลังได้
  function splitEven() {
    const rows = [...els.members.querySelectorAll('.bill-form-member')];
    const chosen = picked();
    for (const row of rows) {
      const share = row.querySelector('input[type="number"]');
      share.disabled = !chosen.includes(row);
      if (share.disabled) share.value = '';
    }
    const even = buildEqualShares(amountOf(els.total), chosen.length);
    if (!even) return;
    els.ownerShare.value = String(even.ownerShare);
    for (const row of chosen) row.querySelector('input[type="number"]').value = String(even.memberShare);
  }

  function validate() {
    let message = '';
    const total = amountOf(els.total);
    const chosen = picked();
    if (!els.title.value.trim() || !toSatang(total)) {
      message = '';
    } else if (chosen.length === 0) {
      message = 'เลือกเพื่อนอย่างน้อย 1 คน';
    } else {
      const shares = chosen.map((row) => amountOf(row.querySelector('input[type="number"]')));
      const shortfall = sumShortfall(total, amountOf(els.ownerShare), shares);
      if (shares.some((share) => !toSatang(share))) message = 'ใส่ยอดของเพื่อนทุกคนที่เลือก';
      else if (shortfall > 0) message = `ยอดรวมของทุกคนยังขาดอีก ${formatBaht(shortfall)}`;
      else if (shortfall < 0) message = `ยอดรวมของทุกคนเกินยอดบิล ${formatBaht(-shortfall)}`;
    }
    els.error.textContent = message;
    els.submit.disabled = submitting || Boolean(message) || !els.title.value.trim() || !toSatang(total) || chosen.length === 0;
  }

  async function open() {
    els.form.reset();
    els.error.textContent = '';
    els.date.value = todayIso();
    fillCategories();
    friends = [];
    renderFriends();
    els.noFriends.hidden = true;
    validate();
    els.dialog.showModal();
    try {
      ({ friends } = await getApi().getFriends());
    } catch (err) {
      els.error.textContent = describeBillError(err instanceof ApiError ? err.status : 0, 'load');
      return;
    }
    renderFriends();
    validate();
  }

  async function submit() {
    validate();
    if (els.submit.disabled) return;
    submitting = true;
    validate();
    els.submit.textContent = 'กำลังสร้าง...';
    const body = {
      title: els.title.value.trim(),
      total: amountOf(els.total),
      occurredOn: els.date.value,
      categoryId: els.category.value,
      ownerShare: amountOf(els.ownerShare),
      members: picked().map((row) => ({ userId: row.dataset.id, share: amountOf(row.querySelector('input[type="number"]')) })),
    };
    try {
      const result = await getApi().createBill(body);
      els.dialog.close();
      await onCreated(result);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      els.error.textContent = describeBillError(status, 'create', err.error);
    } finally {
      submitting = false;
      els.submit.textContent = 'หารบิล';
      validate();
    }
  }

  els.total.addEventListener('input', () => {
    splitEven();
    validate();
  });
  els.title.addEventListener('input', validate);
  els.ownerShare.addEventListener('input', validate);
  els.even.addEventListener('click', () => {
    splitEven();
    validate();
  });
  els.cancel.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('cancel', (event) => {
    if (submitting) event.preventDefault();
  });
  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit();
  });

  return { open };
}
```

หมายเหตุ:
- `currentMonth` ไม่ได้ใช้ ให้ลบออกจาก import ถ้า lint ฟ้อง
- `ApiError` ใน `api.mjs` เก็บแค่ `status` ไม่มีข้อความ error จาก body ทำให้ `err.error` เป็น `undefined` และข้อความ 400 จะเป็นข้อความทั่วไป ให้แก้ `public/liff/api.mjs` ให้อ่าน `{ error }` จาก body ของ response ที่ไม่ ok แล้วเก็บไว้ที่ `ApiError#error` (เพิ่มพารามิเตอร์ที่สองใน constructor; ถ้าอ่าน body ไม่ได้ให้เป็น `undefined`) และเพิ่มเทสต์ใน `public/liff/api.test.mjs`: `it('keeps the error code from the response body', ...)` ที่ `fakeFetch(400, { error: 'Not friends' })` แล้วคาด `rejects` ด้วย `ApiError` ที่ `error === 'Not friends'` และ `status === 400` (เพิ่มสองไฟล์นี้ใน `git add` ของ task)

- [ ] **Step 5: Wire the form into app.mjs**

ใน `public/liff/app.mjs`:
- import `createBillForm` จาก `./bill-form.mjs`
- ต่อจากบล็อก `billsPanel` เพิ่ม:

```js
const billForm = createBillForm({
  doc: document,
  els: {
    dialog: document.getElementById('bill-form-dialog'),
    form: document.getElementById('bill-form'),
    title: document.getElementById('bill-form-title'),
    total: document.getElementById('bill-form-total'),
    date: document.getElementById('bill-form-date'),
    category: document.getElementById('bill-form-category'),
    members: document.getElementById('bill-form-members'),
    noFriends: document.getElementById('bill-form-no-friends'),
    ownerShare: document.getElementById('bill-form-owner-share'),
    even: document.getElementById('bill-form-even'),
    error: document.getElementById('bill-form-error'),
    submit: document.getElementById('bill-form-submit'),
    cancel: document.getElementById('bill-form-cancel'),
  },
  getApi: () => api,
  getCategories: () => categories,
  onCreated: async (result) => {
    const status = document.getElementById('bills-status');
    status.textContent =
      result.notNotified.length > 0
        ? `สร้างบิลแล้ว แจ้งเตือนเพื่อนไม่ถึง ${result.notNotified.length} คน ส่งลิงก์บิลให้เขาได้ในรายการด้านล่าง`
        : 'สร้างบิลแล้ว ส่งให้เพื่อนยืนยันแล้ว';
    await billsPanel.reload();
  },
});
document.getElementById('bill-new').addEventListener('click', () => {
  if (api) billForm.open();
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run public/liff`
Expected: PASS ทั้งหมด

- [ ] **Step 7: Update docs**

`README.md`:
- ใต้ "ความสามารถ" รายการแท็บ เปลี่ยน `เว็บ LIFF 5 แท็บ` เป็น `เว็บ LIFF 6 แท็บ` และเพิ่มบรรทัดก่อนโปรไฟล์: `  - หารบิล: สร้างบิลแล้วเลือกเพื่อน หารเท่าหรือแก้ยอดรายคน บอทส่งการ์ดให้เพื่อนกดยืนยัน (หรือยืนยันในเว็บ) ยืนยันแล้วบันทึกเป็นรายจ่ายของเพื่อน เจ้าของติ๊กคืนแล้วและยกเลิกบิลได้`
- ขั้นติดตั้งข้อ 3 เปลี่ยน `` `002` ถึง `012` `` เป็น `` `002` ถึง `013` ``
- ตารางเส้นทาง `/api/*` ไม่ต้องแก้ (ครอบอยู่แล้ว)
- "หมายเหตุความปลอดภัย" บรรทัด rate limit เพิ่ม `, การสร้างบิลหาร (10 ใบ/ชั่วโมง/ผู้ใช้ เพราะแต่ละใบ push หาเพื่อนทุกคน)` ต่อจากส่วนของเพื่อน
- "ข้อจำกัดที่ทราบ" เพิ่ม: `- การ์ดบิลหาร push หาเพื่อน 1 ข้อความต่อคนต่อบิล นับโควตาข้อความของแพ็กเกจ LINE เพื่อนที่ยังไม่ได้เพิ่มบอทจะไม่ได้การ์ด ต้องเปิดลิงก์บิลแล้วยืนยันในเว็บ`
- บรรทัดโฟลเดอร์ `src/` เพิ่ม `bills`

`SPEC.md`:
- ข้อ 8 (หารบิลกับเพื่อน) แก้ส่วน "(เฟส 2: ...)" เป็นคำอธิบายที่ทำแล้ว: `เฟส 2 (ทำแล้ว): สร้างบิลในแท็บหารบิล เลือกเพื่อน หารเท่า (เศษสตางค์ให้เจ้าของ) หรือแก้ยอดรายคน เจ้าของบันทึกส่วนของตัวเองทันที บอท push การ์ดให้เพื่อนกดยืนยัน/ปฏิเสธ (push ไม่ถึงยืนยันในเว็บได้) ยืนยันแล้วบันทึกเป็นรายจ่ายของเพื่อนในหมวดชื่อเดียวกัน (ไม่มีใช้ อื่นๆ) สร้างแล้วแก้ไม่ได้ ยกเลิกแล้วเพื่อนที่ยังไม่ตอบยืนยันไม่ได้ เจ้าของติ๊กคืนแล้วรายคน`
- หัวข้อ Database เพิ่ม `bills` และ `bill_members` (คอลัมน์ตาม Task 1) และ `transactions.source` มี `bill`
- รายการ API เพิ่ม `/api/bills` ทั้ง 6 เส้น

`work-memory/STATE.md`: เพิ่มบรรทัดแรกใต้ `## Next`:

```
- [ ] หารบิลเฟส 2 (2026-10-08, branch feat/bill-split, แผน docs/superpowers/plans/2026-10-08-bill-split.md): Task 1-9 เสร็จ ยังไม่ merge; ผู้ใช้ต้อง (1) รัน supabase/013_bills.sql ใน Supabase SQL Editor ก่อน deploy (2) ลอง Browser check ของ Task 8 และ 9 ในแอป LINE ด้วย 3 บัญชี (B เพิ่มบอทแล้ว, C ยังไม่เพิ่ม); เฟส 3 (รูปบิลในเว็บ + Rich Menu) ยังไม่เริ่ม
```

- [ ] **Step 8: Run the whole suite and lint**

Run: `npm test` แล้ว `npm run lint` แล้ว `node --check index.js`
Expected: ผ่านทั้งหมด

- [ ] **Step 9: Commit**

```bash
git add public/liff/bill-form.mjs public/liff/index.html public/liff/style.css public/liff/app.mjs public/liff/app.dom.test.mjs public/liff/api.mjs public/liff/api.test.mjs README.md SPEC.md work-memory/STATE.md
git commit -m "feat: add the create bill form and document bill splitting"
```
