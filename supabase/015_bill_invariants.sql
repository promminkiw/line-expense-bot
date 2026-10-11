-- รันใน Supabase SQL Editor ต่อจาก 014 รันซ้ำได้
-- server ตรวจกฎเหล่านี้ใน JS อยู่แล้ว ส่วนนี้กันข้อมูลผิดถ้าเรียก function ตรงหรือ JS มีบั๊ก

alter table public.bills drop constraint if exists bills_owner_share_within_total;
alter table public.bills add constraint bills_owner_share_within_total check (owner_share <= total);

create or replace function public.create_bill(
  p_owner uuid, p_title text, p_total numeric, p_category uuid, p_date date, p_owner_share numeric, p_members jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  new_bill uuid;
  owner_tx uuid;
  member_count integer;
  member_sum numeric;
begin
  if not exists (select 1 from public.categories where id = p_category and user_id = p_owner and type = 'expense') then
    raise exception 'Bill category must be an expense category' using errcode = 'check_violation';
  end if;
  select count(*), coalesce(sum(m.share), 0) into member_count, member_sum
  from jsonb_to_recordset(coalesce(p_members, '[]'::jsonb)) as m(user_id uuid, share numeric);
  if member_count < 1 then
    raise exception 'Bill needs at least one member' using errcode = 'check_violation';
  end if;
  if p_owner_share + member_sum <> p_total then
    raise exception 'Bill shares must add up to the total' using errcode = 'check_violation';
  end if;

  insert into public.bills (owner_id, title, total, category_id, occurred_on, owner_share)
  values (p_owner, p_title, p_total, p_category, p_date, p_owner_share)
  returning id into new_bill;

  if p_owner_share > 0 then
    insert into public.transactions (user_id, type, category_id, amount, note, occurred_on, source)
    values (p_owner, 'expense', p_category, p_owner_share, p_title, p_date, 'bill')
    returning id into owner_tx;
    update public.bills set owner_transaction_id = owner_tx where id = new_bill;
  end if;

  insert into public.bill_members (bill_id, user_id, share)
  select new_bill, m.user_id, m.share
  from jsonb_to_recordset(p_members) as m(user_id uuid, share numeric);

  return new_bill;
end
$$;
