-- รันใน Supabase SQL Editor ต่อจาก 015 ก่อน deploy โค้ดที่ลบรายการเมื่อผู้ใช้ยกเลิกการส่งข้อความ รันซ้ำได้
-- unsend event ของ LINE ส่งมาแค่ message id จึงต้องจำว่าข้อความไหนมาจาก event ไหน

alter table public.line_events add column if not exists message_id text;

create index if not exists line_events_user_message_idx on public.line_events (user_id, message_id);
