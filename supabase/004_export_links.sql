-- รันใน Supabase SQL Editor ต่อจาก 003 เพื่อเก็บลิงก์ดาวน์โหลด CSV ที่ใช้ได้ครั้งเดียว

create table public.export_links (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ให้ลบ user แล้ว cascade มาลบลิงก์ได้เร็ว
create index export_links_user_id_idx on public.export_links (user_id);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.export_links enable row level security;
