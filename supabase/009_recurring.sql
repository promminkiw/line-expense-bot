-- รันใน Supabase SQL Editor ต่อจาก 008_pending_slips_event_index.sql เพื่อเปิดใช้รายการประจำ

-- ทำทีละกฎใน transaction เดียว: จอง event, บันทึกรายการ และอัปเดต last_run_on พร้อมกัน
-- คืน true เมื่อสร้างรายการจริง false เมื่อกฎถูกหยุด/ลบ หรือรอบนี้เคยทำไปแล้ว
create or replace function public.apply_recurring_rule(p_rule_id uuid, p_due date, p_event_id text)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  r public.recurring_rules%rowtype;
  claimed_event text;
begin
  -- for update กันสอง request ที่ยิงพร้อมกันบันทึกซ้ำ
  select * into r from public.recurring_rules where id = p_rule_id and active for update;
  if not found then
    return false;
  end if;

  insert into public.line_events (webhook_event_id, user_id)
  values (p_event_id, r.user_id)
  on conflict (webhook_event_id) do nothing
  returning webhook_event_id into claimed_event;

  update public.recurring_rules set last_run_on = p_due where id = p_rule_id;

  if claimed_event is null then
    return false;
  end if;

  insert into public.transactions (user_id, type, category_id, amount, note, occurred_on, source, line_event_id)
  values (r.user_id, r.type, r.category_id, r.amount, r.note, p_due, 'recurring', p_event_id);
  return true;
end
$$;

-- function ใหม่ใน Postgres เรียกได้ทุก role โดยค่าเริ่มต้น จึงปิดไว้อีกชั้นเหมือน budget_status
revoke execute on function public.apply_recurring_rule(uuid, date, text) from public, anon, authenticated;
grant execute on function public.apply_recurring_rule(uuid, date, text) to service_role;

create index recurring_rules_user_id_idx on public.recurring_rules (user_id);

notify pgrst, 'reload schema';
