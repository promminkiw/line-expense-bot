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
