-- รันใน Supabase SQL Editor ต่อจาก 018 ก่อน push โค้ดที่ให้ผู้ใช้ลบหมวด รันซ้ำได้
-- ย้ายทุกแถวที่อ้างหมวดไปหมวด อื่นๆ แล้วลบใน transaction เดียว ยอดรวมจึงไม่หายถ้าพังกลางทาง

create or replace function public.delete_category(p_user uuid, p_category uuid)
returns text
language plpgsql
set search_path = public
as $$
declare
  c public.categories;
  fallback uuid;
begin
  select * into c from public.categories where id = p_category and user_id = p_user for update;
  if not found then
    return 'not_found';
  end if;
  -- โค้ดอ้างหมวดระบบด้วยชื่อ ต้องตรงกับ SYSTEM_CATEGORIES ใน src/parser/categories.js
  if c.name = 'อื่นๆ' or (c.type = 'expense' and c.name = 'ใบเสร็จ/สลิปโอนเงิน') then
    return 'system';
  end if;
  select id into fallback from public.categories where user_id = p_user and type = c.type and name = 'อื่นๆ';
  if fallback is null then
    raise exception 'Fallback category is missing';
  end if;

  update public.transactions set category_id = fallback where user_id = p_user and category_id = p_category;
  update public.recurring_rules set category_id = fallback where user_id = p_user and category_id = p_category;
  update public.bills set category_id = fallback where owner_id = p_user and category_id = p_category;
  -- budgets ใช้ on delete cascade งบของหมวดนี้จึงหายไปพร้อมกัน
  delete from public.categories where id = p_category and user_id = p_user;
  return 'deleted';
end
$$;

revoke execute on function public.delete_category(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_category(uuid, uuid) to service_role;
