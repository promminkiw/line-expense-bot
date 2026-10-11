-- รันใน Supabase SQL Editor ต่อจาก 013 รันซ้ำได้ ไม่เปลี่ยนข้อมูล

-- ลบรายการแล้ว Postgres ต้องหาแถวบิลที่อ้างถึงเพื่อตั้งเป็น null ไม่มี index จะสแกนทั้งตารางทุกครั้ง
create index if not exists bills_owner_transaction_idx on public.bills (owner_transaction_id);
create index if not exists bill_members_transaction_idx on public.bill_members (transaction_id);

-- ลบหมวดต้องตรวจว่ามีบิลอ้างถึงหรือไม่
create index if not exists bills_category_owner_idx on public.bills (category_id, owner_id);
