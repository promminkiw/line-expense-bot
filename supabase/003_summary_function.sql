-- รันใน Supabase SQL Editor ต่อจาก 002 เพื่อให้บอทคำนวณยอดสรุปใน Postgres แทนการคิดเลขใน Claude

create or replace function public.summarize_transactions(p_user_id uuid, p_from date, p_to date)
returns table (type text, category text, total numeric, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select t.type, c.name, sum(t.amount), count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
  group by t.type, c.name
  order by t.type, sum(t.amount) desc, c.name
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นนอกจาก RLS และต้องคงไว้ถ้าเปลี่ยนเป็น security definer
revoke execute on function public.summarize_transactions(uuid, date, date) from public, anon, authenticated;
grant execute on function public.summarize_transactions(uuid, date, date) to service_role;
