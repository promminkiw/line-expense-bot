-- รันใน Supabase SQL Editor ต่อจาก 025 ก่อน push โค้ดสรุปรายเดือน รันซ้ำได้

-- สรุปรายเดือนจองใน notification_log เหมือนสรุปรายสัปดาห์ จึงต้องเพิ่ม kind ใน check เดิม
alter table public.notification_log drop constraint if exists notification_log_kind_check;
alter table public.notification_log
  add constraint notification_log_kind_check check (kind in ('weekly_summary', 'daily_reminder', 'monthly_summary'));

-- ไม่มีสวิตช์ในหน้าเว็บ คอลัมน์นี้มีไว้หยุดส่งให้คนที่ unfollow ไม่ให้เสียโควตา push
alter table public.users add column if not exists monthly_summary_enabled boolean not null default true;
