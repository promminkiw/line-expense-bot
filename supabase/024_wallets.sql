-- รันใน Supabase SQL Editor ต่อจาก 023 ก่อน push โค้ดกระเป๋าเงิน รันซ้ำได้ และโค้ดเดิมที่ deploy อยู่ยังใช้ได้หลังรัน
-- ไม่ backfill transactions.wallet_id: null คือกระเป๋าตั้งต้น "เงินสด" จึงไม่ต้องเขียนทับทั้งตาราง

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name),
  -- ให้ transactions อ้างอิง (id, user_id) คู่กันได้ กันการใช้กระเป๋าของผู้ใช้คนอื่น
  unique (id, user_id)
);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.wallets enable row level security;

-- ผู้ใช้เดิมได้กระเป๋าตั้งต้นทันที wallet_totals จะได้เห็นแถว เงินสด โดยไม่ต้องรอให้โค้ดซ่อม
insert into public.wallets (user_id, name)
select id, 'เงินสด' from public.users
on conflict (user_id, name) do nothing;

alter table public.transactions add column if not exists wallet_id uuid;

alter table public.transactions drop constraint if exists transactions_wallet_fkey;
alter table public.transactions
  add constraint transactions_wallet_fkey foreign key (wallet_id, user_id) references public.wallets (id, user_id);

-- กระเป๋าที่ยังไม่มีรายการก็ต้องขึ้น จึงเริ่มจาก wallets แล้ว left join
create or replace function public.wallet_totals(p_user_id uuid)
returns table (wallet_id uuid, name text, hidden boolean, income numeric, expense numeric, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select
    w.id,
    w.name,
    w.hidden,
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(t.id)
  from public.wallets w
  left join public.transactions t
    on t.user_id = w.user_id
    -- wallet_id null คือกระเป๋าตั้งต้น ชื่อต้องตรงกับ DEFAULT_WALLET_NAME ใน src/wallets/wallets.js
    and (t.wallet_id = w.id or (t.wallet_id is null and w.name = 'เงินสด'))
  where w.user_id = p_user_id
  group by w.id, w.name, w.hidden, w.created_at
  order by w.name <> 'เงินสด', w.created_at, w.name
$$;

-- create or replace ที่เพิ่มพารามิเตอร์จะได้ overload ใหม่ จึงลบตัว 6 พารามิเตอร์ก่อน
drop function if exists public.query_totals(uuid, date, date, text, text, text);

-- p_wallet มีค่า default ให้โค้ดเดิมที่เรียก 6 พารามิเตอร์ยังใช้ได้ระหว่างรัน SQL ก่อน push
create or replace function public.query_totals(
  p_user_id uuid,
  p_from date,
  p_to date,
  p_type text,
  p_category text,
  p_keyword text,
  p_wallet text default ''
)
returns table (type text, total numeric, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select t.type, sum(t.amount), count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  left join public.wallets w on w.id = t.wallet_id and w.user_id = t.user_id
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
    and (p_type = 'both' or t.type = p_type)
    and (p_category = '' or c.name = p_category)
    -- คำค้นมาจากข้อความผู้ใช้ จึง escape \ % _ ให้เป็นตัวอักษรธรรมดา (ilike ใช้ \ เป็น escape โดยค่าเริ่มต้น)
    and (
      p_keyword = ''
      or t.note ilike '%' || replace(replace(replace(p_keyword, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    -- wallet_id null คือกระเป๋าตั้งต้น ชื่อต้องตรงกับ DEFAULT_WALLET_NAME ใน src/wallets/wallets.js
    and (p_wallet = '' or coalesce(w.name, 'เงินสด') = p_wallet)
  group by t.type
  order by t.type
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นเหมือน function อื่น
revoke execute on function public.wallet_totals(uuid) from public, anon, authenticated;
grant execute on function public.wallet_totals(uuid) to service_role;
revoke execute on function public.query_totals(uuid, date, date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.query_totals(uuid, date, date, text, text, text, text) to service_role;

notify pgrst, 'reload schema';
