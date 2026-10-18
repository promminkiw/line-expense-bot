-- รันใน Supabase SQL Editor ต่อจาก 017 ก่อน push โค้ดที่ให้ผู้ใช้เลือกไอคอนหมวด รันซ้ำได้
-- null = ใช้ไอคอนตั้งต้นตามชื่อหมวด ส่วนรายชื่อไอคอนที่ใช้ได้ server ตรวจเอง เพิ่มไอคอนใหม่จะได้ไม่ต้องแก้ SQL

alter table public.categories add column if not exists icon text;

alter table public.categories drop constraint if exists categories_icon_format;
alter table public.categories add constraint categories_icon_format check (icon is null or icon ~ '^[a-z]{2,20}$');
