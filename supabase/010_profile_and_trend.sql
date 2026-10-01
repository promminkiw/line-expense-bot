-- รันใน Supabase SQL Editor ต่อจาก 009 สำหรับหน้าโปรไฟล์ (ยอดสะสม) และกราฟแนวโน้มรายเดือนในหน้า LIFF

-- aggregate ที่ไม่มี group by คืนหนึ่งแถวเสมอ แม้ผู้ใช้ยังไม่มีรายการ (income/expense = 0, first_date = null)
create or replace function public.lifetime_totals(p_user_id uuid)
returns table (income numeric, expense numeric, entry_count bigint, first_date date)
language sql
stable
set search_path = public
as $$
  select
    coalesce(sum(t.amount) filter (where t.type = 'income'), 0),
    coalesce(sum(t.amount) filter (where t.type = 'expense'), 0),
    count(*),
    min(t.occurred_on)
  from public.transactions t
  where t.user_id = p_user_id
$$;

create or replace function public.monthly_totals(p_user_id uuid, p_from date, p_to date)
returns table (month text, type text, total numeric)
language sql
stable
set search_path = public
as $$
  select to_char(t.occurred_on, 'YYYY-MM'), t.type, sum(t.amount)
  from public.transactions t
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
  group by 1, 2
  order by 1, 2
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นนอกจาก RLS และต้องคงไว้ถ้าเปลี่ยนเป็น security definer
revoke execute on function public.lifetime_totals(uuid) from public, anon, authenticated;
grant execute on function public.lifetime_totals(uuid) to service_role;
revoke execute on function public.monthly_totals(uuid, date, date) from public, anon, authenticated;
grant execute on function public.monthly_totals(uuid, date, date) to service_role;
