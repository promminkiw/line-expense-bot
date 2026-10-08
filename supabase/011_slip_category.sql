-- รันใน Supabase SQL Editor ต่อจาก 010 เพื่อเพิ่มหมวดรายจ่าย "ใบเสร็จ/สลิปโอนเงิน" ให้ผู้ใช้ที่สมัครไว้แล้ว
-- ผู้ใช้ใหม่ได้หมวดนี้จาก DEFAULT_CATEGORIES ในโค้ดอยู่แล้ว รันซ้ำได้เพราะข้ามหมวดที่มีอยู่

insert into public.categories (user_id, type, name)
select u.id, 'expense', 'ใบเสร็จ/สลิปโอนเงิน'
from public.users u
on conflict (user_id, type, name) do nothing;
