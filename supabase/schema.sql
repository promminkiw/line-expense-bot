-- รันครั้งเดียวใน Supabase SQL Editor เพื่อสร้างตารางทั้งหมดของขั้นที่ 3

create table public.users (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now(),
  unique (user_id, type, name),
  -- ให้ตารางอื่นอ้างอิง (id, user_id) คู่กันได้ กันการใช้หมวดของผู้ใช้คนอื่น
  unique (id, user_id)
);

-- จำ webhookEventId ที่ประมวลผลแล้ว เพราะ LINE ส่ง event เดิมซ้ำได้
create table public.line_events (
  webhook_event_id text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  note text not null default '',
  occurred_on date not null,
  source text not null default 'text' check (source in ('text', 'slip', 'recurring')),
  line_event_id text references public.line_events (webhook_event_id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

create index transactions_user_occurred_on_idx on public.transactions (user_id, occurred_on);
create index transactions_line_event_id_idx on public.transactions (line_event_id);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  category_id uuid not null,
  amount numeric(12, 2) not null check (amount > 0 and amount <= 10000000),
  note text not null default '',
  day_of_month integer not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  last_run_on date,
  created_at timestamptz not null default now(),
  foreign key (category_id, user_id) references public.categories (id, user_id)
);

-- ไม่สร้าง policy: anon key จึงอ่าน/เขียนไม่ได้เลย ส่วน server ใช้ service role ที่ข้าม RLS
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.line_events enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_rules enable row level security;
