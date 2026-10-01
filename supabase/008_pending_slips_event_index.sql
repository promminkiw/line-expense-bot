-- รันใน Supabase SQL Editor ต่อจาก 007_pending_slips_items.sql เพื่อให้ cascade ตอนลบ line_events ไม่ต้องสแกนทั้งตาราง

create index pending_slips_line_event_id_idx on public.pending_slips (line_event_id);
