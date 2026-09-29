-- รันใน Supabase SQL Editor ต่อจาก schema.sql เพื่อให้บอทจำคำถามกลับที่ผู้ใช้ยังตอบไม่จบ

create table public.pending_clarifications (
  user_id uuid primary key references public.users (id) on delete cascade,
  messages jsonb not null,
  updated_at timestamptz not null default now()
);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.pending_clarifications enable row level security;
