-- รันใน Supabase SQL Editor ต่อจาก 005_budgets.sql เพื่อพักรายการที่อ่านจากสลิปไว้รอผู้ใช้กดยืนยัน

create table public.pending_slips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- event ของรูป ใช้เป็น line_event_id ของรายการที่บันทึก เพื่อให้ปุ่มยกเลิกรายการเดิมใช้ได้
  line_event_id text not null references public.line_events (webhook_event_id) on delete cascade,
  item jsonb not null,
  created_at timestamptz not null default now()
);

-- ให้ลบ user แล้ว cascade และลบของหมดอายุของผู้ใช้ได้เร็ว
create index pending_slips_user_id_idx on public.pending_slips (user_id);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.pending_slips enable row level security;
