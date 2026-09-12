-- Paste into Supabase → SQL Editor → Run.
-- Expenses, Income, Owner Draws, settings, and receipt storage.

create table if not exists public.studio_settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.studio_settings enable row level security;
drop policy if exists studio_settings_select on public.studio_settings;
drop policy if exists studio_settings_insert on public.studio_settings;
drop policy if exists studio_settings_update on public.studio_settings;
drop policy if exists studio_settings_delete on public.studio_settings;
create policy studio_settings_select on public.studio_settings for select using (auth.uid() = user_id);
create policy studio_settings_insert on public.studio_settings for insert with check (auth.uid() = user_id);
create policy studio_settings_update on public.studio_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy studio_settings_delete on public.studio_settings for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.studio_settings to authenticated;
revoke all on public.studio_settings from anon;

create table if not exists public.business_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  amount numeric(12,2) not null default 0,
  year int not null,
  date date not null default current_date,
  is_recurring boolean not null default false,
  recurrence text not null default 'none',
  recurring_month_count int not null default 0,
  receipt_path text not null default '',
  receipt_file_name text not null default '',
  notes text not null default '',
  series_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_expenses_user_year on public.business_expenses (user_id, year, date desc);

create table if not exists public.business_expense_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_id uuid not null,
  year int not null,
  unique (user_id, series_id, year)
);

create table if not exists public.business_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  amount numeric(12,2) not null default 0,
  year int not null,
  date date not null default current_date,
  is_recurring boolean not null default false,
  recurrence text not null default 'none',
  recurring_month_count int not null default 0,
  receipt_path text not null default '',
  receipt_file_name text not null default '',
  notes text not null default '',
  source_invoice_number text not null default '',
  source_payment_key text not null default '',
  series_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_incomes_user_year on public.business_incomes (user_id, year, date desc);

create table if not exists public.business_income_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  series_id uuid not null,
  year int not null,
  unique (user_id, series_id, year)
);

create table if not exists public.owner_draws (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric(12,2) not null default 0,
  reason text not null default '',
  date date not null default current_date,
  year int not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists owner_draws_user_year on public.owner_draws (user_id, year, date desc);

drop trigger if exists business_expenses_touch on public.business_expenses;
create trigger business_expenses_touch before update on public.business_expenses
for each row execute procedure public.set_updated_at();

drop trigger if exists business_incomes_touch on public.business_incomes;
create trigger business_incomes_touch before update on public.business_incomes
for each row execute procedure public.set_updated_at();

drop trigger if exists owner_draws_touch on public.owner_draws;
create trigger owner_draws_touch before update on public.owner_draws
for each row execute procedure public.set_updated_at();

alter table public.business_expenses enable row level security;
alter table public.business_expense_skips enable row level security;
alter table public.business_incomes enable row level security;
alter table public.business_income_skips enable row level security;
alter table public.owner_draws enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'business_expenses',
    'business_expense_skips',
    'business_incomes',
    'business_income_skips',
    'owner_draws'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select using (auth.uid() = user_id)', t, t);
    execute format('create policy %I_insert on public.%I for insert with check (auth.uid() = user_id)', t, t);
    execute format('create policy %I_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
    execute format('create policy %I_delete on public.%I for delete using (auth.uid() = user_id)', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

insert into storage.buckets (id, name, public)
values ('ledger-receipts', 'ledger-receipts', false)
on conflict (id) do nothing;

drop policy if exists ledger_receipts_select on storage.objects;
drop policy if exists ledger_receipts_insert on storage.objects;
drop policy if exists ledger_receipts_update on storage.objects;
drop policy if exists ledger_receipts_delete on storage.objects;

create policy ledger_receipts_select on storage.objects for select
  using (bucket_id = 'ledger-receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy ledger_receipts_insert on storage.objects for insert
  with check (bucket_id = 'ledger-receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy ledger_receipts_update on storage.objects for update
  using (bucket_id = 'ledger-receipts' and auth.uid()::text = (storage.foldername(name))[1]);
create policy ledger_receipts_delete on storage.objects for delete
  using (bucket_id = 'ledger-receipts' and auth.uid()::text = (storage.foldername(name))[1]);
