-- รันใน Supabase SQL Editor ต่อจาก 020 ก่อน push โค้ดที่มีสวิตช์แจ้งเตือน รันซ้ำได้
-- สร้างสวิตช์ของสรุปรายสัปดาห์และเตือนลืมจดไว้ที่นี่ครั้งเดียว ค่าตั้งต้นปิดเพราะ push นับโควตา LINE OA

alter table public.users add column if not exists weekly_summary_enabled boolean not null default false;
alter table public.users add column if not exists daily_reminder_enabled boolean not null default false;

-- งาน cron จองแถวก่อน push เพื่อให้การเรียกซ้ำไม่ส่งข้อความเดิมสองครั้ง period เป็นวันที่ (วันจันทร์ของสัปดาห์ หรือวันนั้น)
create table if not exists public.notification_log (
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('weekly_summary', 'daily_reminder')),
  period text not null check (period ~ '^\d{4}-\d{2}-\d{2}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, kind, period)
);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.notification_log enable row level security;
