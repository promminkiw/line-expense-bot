-- รันใน Supabase SQL Editor ต่อจาก 026 ก่อน push โค้ดภาษาไทย/อังกฤษ รันซ้ำได้

-- null คือยังไม่เลือก (บอทและเว็บถือเป็น th) จึงไม่ตั้ง default เพื่อให้ LIFF เติมจากภาษาแอป LINE ได้ทีหลัง
alter table public.users add column if not exists language text;
alter table public.users drop constraint if exists users_language_check;
alter table public.users add constraint users_language_check check (language in ('th', 'en'));
