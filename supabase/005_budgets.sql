-- รันใน Supabase SQL Editor ต่อจาก 004 เพื่อเปิดใช้งบประมาณรายเดือนต่อหมวด

-- แถวหนึ่งคืองบตั้งแต่เดือนนั้นเป็นต้นไป amount เป็น null แปลว่ายกเลิกงบตั้งแต่เดือนนั้น (check เดิมผ่านเมื่อค่าเป็น null)
alter table public.budgets alter column amount drop not null;

create or replace function public.budget_status(p_user_id uuid, p_month date)
returns table (category_id uuid, category text, budget numeric, spent numeric)
language sql
stable
set search_path = public
as $$
  select c.id, c.name, b.amount, coalesce(s.spent, 0)
  from public.categories c
  left join lateral (
    select b.amount
    from public.budgets b
    where b.user_id = p_user_id
      and b.category_id = c.id
      and b.month <= p_month
    order by b.month desc
    limit 1
  ) b on true
  left join lateral (
    select sum(t.amount) as spent
    from public.transactions t
    where t.user_id = p_user_id
      and t.category_id = c.id
      and t.type = 'expense'
      and t.occurred_on >= p_month
      and t.occurred_on < (p_month + interval '1 month')::date
  ) s on true
  where c.user_id = p_user_id
    and c.type = 'expense'
  order by c.name
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นเหมือน summarize_transactions
revoke execute on function public.budget_status(uuid, date) from public, anon, authenticated;
grant execute on function public.budget_status(uuid, date) to service_role;
