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

-- ล็อกบิลก่อนสมาชิก (for share) กัน cancel แทรก และ for update กันกดซ้ำจนบันทึกซ้ำ
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
  select * into b from public.bills where id = p_bill for share;
  if not found then
    return 'not_found';
  end if;
  select * into m from public.bill_members where bill_id = p_bill and user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  -- แยกคำตอบเดิมออกจากคำตอบใหม่ บอทกับหน้าเว็บจะได้ไม่บอกว่าบันทึกซ้ำ
  if m.status <> 'pending' then
    return 'already_' || m.status;
  end if;
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
  select status into bill_status from public.bills where id = p_bill for share;
  if not found then
    return 'not_found';
  end if;
  select * into m from public.bill_members where bill_id = p_bill and user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  -- แยกคำตอบเดิมออกจากคำตอบใหม่ บอทกับหน้าเว็บจะได้ไม่บอกว่าบันทึกซ้ำ
  if m.status <> 'pending' then
    return 'already_' || m.status;
  end if;
  if bill_status = 'cancelled' then
    return 'cancelled';
  end if;
  update public.bill_members set status = 'declined', responded_at = now() where bill_id = p_bill and user_id = p_user;
  return 'declined';
end
$$;

-- ล็อกแถวบิลก่อนเหมือน confirm/decline แล้วลบรายการส่วนของเจ้าของในคราวเดียว ไม่ให้เหลือรายจ่ายของบิลที่ยกเลิกแล้ว
create or replace function public.cancel_bill(p_bill uuid, p_owner uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  b public.bills%rowtype;
begin
  select * into b from public.bills where id = p_bill and owner_id = p_owner and status = 'open' for update;
  if not found then
    return false;
  end if;
  update public.bills set status = 'cancelled' where id = p_bill;
  if b.owner_transaction_id is not null then
    delete from public.transactions where id = b.owner_transaction_id and user_id = p_owner;
  end if;
  return true;
end
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นเหมือน function อื่น
revoke execute on function public.create_bill(uuid, text, numeric, uuid, date, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.create_bill(uuid, text, numeric, uuid, date, numeric, jsonb) to service_role;
revoke execute on function public.confirm_bill_share(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_bill_share(uuid, uuid, uuid) to service_role;
revoke execute on function public.decline_bill_share(uuid, uuid) from public, anon, authenticated;
grant execute on function public.decline_bill_share(uuid, uuid) to service_role;
revoke execute on function public.cancel_bill(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_bill(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
