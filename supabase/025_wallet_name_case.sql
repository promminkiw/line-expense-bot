-- รันใน Supabase SQL Editor ต่อจาก 024 ก่อน push โค้ดที่ตามมา รันซ้ำได้
-- ถ้ามีชื่อกระเป๋าที่ต่างกันแค่ตัวพิมพ์อยู่แล้ว การสร้าง index จะล้ม ให้เปลี่ยนชื่อหนึ่งในนั้นในหน้าเว็บก่อนรันใหม่

-- ชื่อที่ต่างกันแค่ตัวพิมพ์ดูเป็นกระเป๋าเดียวกัน เหมือนชื่อเป้าออม
-- เก็บ unique (user_id, name) เดิมไว้ เพราะการสร้างกระเป๋าเงินสดตั้งต้น upsert โดยอ้าง constraint นั้น
create unique index if not exists wallets_user_lower_name_idx on public.wallets (user_id, lower(name));

-- ลบหรือย้ายกระเป๋าต้องหารายการที่อ้างถึง ไม่มี index จะสแกนทั้งตาราง
create index if not exists transactions_wallet_user_idx on public.transactions (wallet_id, user_id);
