-- รันใน Supabase SQL Editor ต่อจาก 019 ก่อน push โค้ดที่ให้บอทตอบคำถามยอด รันซ้ำได้
-- รับชื่อหมวดแทน id เพราะคำถามแบบ both อาจหมายถึงหมวดชื่อเดียวกันทั้งรายรับและรายจ่าย เช่น อื่นๆ

create or replace function public.query_totals(
  p_user_id uuid,
  p_from date,
  p_to date,
  p_type text,
  p_category text,
  p_keyword text
)
returns table (type text, total numeric, entry_count bigint)
language sql
stable
set search_path = public
as $$
  select t.type, sum(t.amount), count(*)
  from public.transactions t
  join public.categories c on c.id = t.category_id and c.user_id = t.user_id
  where t.user_id = p_user_id
    and t.occurred_on between p_from and p_to
    and (p_type = 'both' or t.type = p_type)
    and (p_category = '' or c.name = p_category)
    -- คำค้นมาจากข้อความผู้ใช้ จึง escape \ % _ ให้เป็นตัวอักษรธรรมดา (ilike ใช้ \ เป็น escape โดยค่าเริ่มต้น)
    and (
      p_keyword = ''
      or t.note ilike '%' || replace(replace(replace(p_keyword, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  group by t.type
  order by t.type
$$;

revoke execute on function public.query_totals(uuid, date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.query_totals(uuid, date, date, text, text, text) to service_role;
