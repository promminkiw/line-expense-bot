-- รันใน Supabase SQL Editor ต่อจาก 015 ก่อน push โค้ดที่ให้ผู้ใช้จัดการหมวดเอง รันซ้ำได้
-- ซ่อนแทนการลบ เพราะรายการเก่า งบ รายการประจำ และบิลยังอ้างอิงหมวดนั้นอยู่

alter table public.categories add column if not exists hidden boolean not null default false;
