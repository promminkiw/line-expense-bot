-- รันใน Supabase SQL Editor ต่อจาก 011 เพื่อเปิดใช้ระบบเพื่อน (เฟส 1 ของการหารบิล)

-- รหัสสร้างตอนผู้ใช้เปิดส่วนเพื่อนครั้งแรก ผู้ใช้เดิมจึงเป็น null ได้
alter table public.users
  add column friend_code text unique check (friend_code ~ '^[A-HJ-NP-Z2-9]{8}$');

-- เก็บสองแถวต่อคู่ (A->B และ B->A) เพื่ออ่านรายชื่อเพื่อนของใครก็ได้ด้วยเงื่อนไข user_id อย่างเดียว
create table public.friendships (
  user_id uuid not null references public.users (id) on delete cascade,
  friend_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  -- ตั้งชื่อเองเพราะ supabase-js ต้องอ้างชื่อ FK ตอน embed ข้อมูลของเพื่อนจากตาราง users
  constraint friendships_friend_id_fkey foreign key (friend_id) references public.users (id) on delete cascade,
  check (user_id <> friend_id)
);

create index friendships_friend_id_idx on public.friendships (friend_id);

-- ไม่สร้าง policy เหมือนตารางอื่น: anon key เข้าถึงไม่ได้ ส่วน server ใช้ service role
alter table public.friendships enable row level security;
