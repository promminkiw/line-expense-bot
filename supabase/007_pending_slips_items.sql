-- รันใน Supabase SQL Editor ต่อจาก 006_pending_slips.sql เพื่อให้แถวพักสลิปเก็บหลายรายการ

alter table public.pending_slips rename column item to items;

-- แถวเดิมเป็นออบเจ็กต์เดียว ห่อเป็นอาร์เรย์ก่อนบังคับชนิด
update public.pending_slips
set items = jsonb_build_array(items)
where jsonb_typeof(items) = 'object';

alter table public.pending_slips
  add constraint pending_slips_items_is_array check (jsonb_typeof(items) = 'array');
