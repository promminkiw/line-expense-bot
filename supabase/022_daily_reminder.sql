-- รันใน Supabase SQL Editor ต่อจาก 021 ก่อน push โค้ดที่มีงาน cron เตือนลืมจด รันซ้ำได้
-- นับเฉพาะรายการที่ผู้ใช้ทำเอง (พิมพ์ ส่งสลิป หรือสร้าง/ยืนยันบิล) รายการประจำไม่นับ และตัดวันตามเวลาไทยจาก created_at

create or replace function public.users_to_remind(p_day date)
returns table (user_id uuid, line_user_id text)
language sql
stable
set search_path = public
as $$
  select u.id, u.line_user_id
  from public.users u
  where u.daily_reminder_enabled
    and not exists (
      select 1
      from public.transactions t
      where t.user_id = u.id
        and t.source in ('text', 'slip', 'bill')
        and t.created_at >= (p_day::timestamp at time zone 'Asia/Bangkok')
        and t.created_at < ((p_day + 1)::timestamp at time zone 'Asia/Bangkok')
    )
  order by u.id
$$;

revoke execute on function public.users_to_remind(date) from public, anon, authenticated;
grant execute on function public.users_to_remind(date) to service_role;
