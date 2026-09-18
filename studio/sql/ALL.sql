-- =============================================================================
-- STL Studio · ALL Supabase SQL (run once in SQL Editor)
-- Order: 001 → 013. Safe to re-run (IF NOT EXISTS / drop policy if exists).
-- Requires: Authentication enabled; you already have your studio user.
-- Note: 012 needs 011 (managed_apps) first because support_tickets.app_id FKs it.
-- Note: 013 (inventory) needs set_updated_at() from 003.
-- =============================================================================


-- --------------------------------------------------------------------------
-- FILE: sql/001_billing.sql
-- --------------------------------------------------------------------------

-- Paste this into Supabase → SQL Editor → New query → Run.
-- Only your signed-in user can read or write these rows.

create table if not exists public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('quote', 'invoice')),
  number text not null,
  client_name text not null default '',
  client_email text not null default '',
  project_name text not null default '',
  status text not null default 'draft',
  amount numeric(12,2) not null default 0,
  issued_on date,
  due_on date,
  paid_on date,
  notes text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_documents_user_kind_number
  on public.billing_documents (user_id, kind, number);

create index if not exists billing_documents_user_updated
  on public.billing_documents (user_id, updated_at desc);

create or replace function public.billing_documents_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists billing_documents_touch on public.billing_documents;
create trigger billing_documents_touch
before update on public.billing_documents
for each row
execute procedure public.billing_documents_touch();

alter table public.billing_documents enable row level security;

drop policy if exists billing_documents_select on public.billing_documents;
drop policy if exists billing_documents_insert on public.billing_documents;
drop policy if exists billing_documents_update on public.billing_documents;
drop policy if exists billing_documents_delete on public.billing_documents;

create policy billing_documents_select
  on public.billing_documents for select
  using (auth.uid() = user_id);

create policy billing_documents_insert
  on public.billing_documents for insert
  with check (auth.uid() = user_id);

create policy billing_documents_update
  on public.billing_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy billing_documents_delete
  on public.billing_documents for delete
  using (auth.uid() = user_id);

revoke all on public.billing_documents from anon;
grant select, insert, update, delete on public.billing_documents to authenticated;


-- --------------------------------------------------------------------------
-- FILE: sql/002_notes.sql
-- --------------------------------------------------------------------------

-- Paste this into Supabase → SQL Editor → New query → Run.
-- One private notepad per signed-in user.

create table if not exists public.studio_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now(),
  constraint studio_notes_one_per_user unique (user_id)
);

create or replace function public.studio_notes_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists studio_notes_touch on public.studio_notes;
create trigger studio_notes_touch
before update on public.studio_notes
for each row
execute procedure public.studio_notes_touch();

alter table public.studio_notes enable row level security;

drop policy if exists studio_notes_select on public.studio_notes;
drop policy if exists studio_notes_insert on public.studio_notes;
drop policy if exists studio_notes_update on public.studio_notes;
drop policy if exists studio_notes_delete on public.studio_notes;

create policy studio_notes_select
  on public.studio_notes for select
  using (auth.uid() = user_id);

create policy studio_notes_insert
  on public.studio_notes for insert
  with check (auth.uid() = user_id);

create policy studio_notes_update
  on public.studio_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy studio_notes_delete
  on public.studio_notes for delete
  using (auth.uid() = user_id);

revoke all on public.studio_notes from anon;
grant select, insert, update, delete on public.studio_notes to authenticated;


-- --------------------------------------------------------------------------
-- FILE: sql/003_projects.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.
-- Private project workspace: projects + logins, costs, hours, issues, handoff, meetings.

create table if not exists public.client_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  link_id uuid not null default gen_random_uuid(),
  name text not null default '',
  company_name text not null default '',
  linked_client_id text not null default '',
  information text not null default '',
  discovery_json text not null default '',
  due_date date,
  timer_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_projects_link_id_unique unique (link_id)
);

create index if not exists client_projects_user_updated
  on public.client_projects (user_id, updated_at desc);

create table if not exists public.project_logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.client_projects (id) on delete cascade,
  site_name text not null default '',
  url text not null default '',
  username text not null default '',
  password text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists project_logins_project on public.project_logins (project_id);

create table if not exists public.project_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.client_projects (id) on delete cascade,
  title text not null default '',
  amount numeric(12,2) not null default 0,
  notes text not null default '',
  date date not null default current_date
);

create index if not exists project_costs_project on public.project_costs (project_id);

create table if not exists public.project_hour_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.client_projects (id) on delete cascade,
  date date not null default current_date,
  hours numeric(10,2) not null default 0,
  notes text not null default '',
  is_billed boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz
);

create index if not exists project_hour_entries_project on public.project_hour_entries (project_id);

create table if not exists public.project_handoff_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.client_projects (id) on delete cascade,
  title text not null default '',
  is_done boolean not null default false,
  notes text not null default '',
  sort_order int not null default 0,
  done_at timestamptz
);

create index if not exists project_handoff_items_project on public.project_handoff_items (project_id);

create table if not exists public.project_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid not null references public.client_projects (id) on delete cascade,
  title text not null default '',
  details text not null default '',
  status text not null default 'open',
  priority text not null default 'normal',
  platform text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_issues_project on public.project_issues (project_id);

create table if not exists public.meeting_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  meeting_date date not null default current_date,
  attendees text not null default '',
  topic text not null default '',
  notes text not null default '',
  linked_project_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_logs_user_project
  on public.meeting_logs (user_id, linked_project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_projects_touch on public.client_projects;
create trigger client_projects_touch
before update on public.client_projects
for each row execute procedure public.set_updated_at();

drop trigger if exists project_logins_touch on public.project_logins;
create trigger project_logins_touch
before update on public.project_logins
for each row execute procedure public.set_updated_at();

drop trigger if exists project_issues_touch on public.project_issues;
create trigger project_issues_touch
before update on public.project_issues
for each row execute procedure public.set_updated_at();

drop trigger if exists meeting_logs_touch on public.meeting_logs;
create trigger meeting_logs_touch
before update on public.meeting_logs
for each row execute procedure public.set_updated_at();

alter table public.client_projects enable row level security;
alter table public.project_logins enable row level security;
alter table public.project_costs enable row level security;
alter table public.project_hour_entries enable row level security;
alter table public.project_handoff_items enable row level security;
alter table public.project_issues enable row level security;
alter table public.meeting_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'client_projects',
    'project_logins',
    'project_costs',
    'project_hour_entries',
    'project_handoff_items',
    'project_issues',
    'meeting_logs'
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


-- --------------------------------------------------------------------------
-- FILE: sql/003b_projects_grants.sql
-- --------------------------------------------------------------------------

-- Fix Projects permissions. Paste into Supabase SQL Editor and Run.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.client_projects to authenticated;
grant select, insert, update, delete on public.project_logins to authenticated;
grant select, insert, update, delete on public.project_costs to authenticated;
grant select, insert, update, delete on public.project_hour_entries to authenticated;
grant select, insert, update, delete on public.project_handoff_items to authenticated;
grant select, insert, update, delete on public.project_issues to authenticated;
grant select, insert, update, delete on public.meeting_logs to authenticated;

alter table public.client_projects enable row level security;
alter table public.project_logins enable row level security;
alter table public.project_costs enable row level security;
alter table public.project_hour_entries enable row level security;
alter table public.project_handoff_items enable row level security;
alter table public.project_issues enable row level security;
alter table public.meeting_logs enable row level security;


-- --------------------------------------------------------------------------
-- FILE: sql/004_clients.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.studio_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  link_id uuid not null default gen_random_uuid(),
  name text not null default '',
  company_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  notes text not null default '',
  comms_channel text not null default 'email',
  comms_best_time text not null default 'anytime',
  comms_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_clients_link_id_unique unique (link_id)
);

create index if not exists studio_clients_user_updated
  on public.studio_clients (user_id, updated_at desc);

drop trigger if exists studio_clients_touch on public.studio_clients;
create trigger studio_clients_touch
before update on public.studio_clients
for each row execute procedure public.set_updated_at();

alter table public.studio_clients enable row level security;

drop policy if exists studio_clients_select on public.studio_clients;
drop policy if exists studio_clients_insert on public.studio_clients;
drop policy if exists studio_clients_update on public.studio_clients;
drop policy if exists studio_clients_delete on public.studio_clients;

create policy studio_clients_select
  on public.studio_clients for select
  using (auth.uid() = user_id);

create policy studio_clients_insert
  on public.studio_clients for insert
  with check (auth.uid() = user_id);

create policy studio_clients_update
  on public.studio_clients for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy studio_clients_delete
  on public.studio_clients for delete
  using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.studio_clients to authenticated;
revoke all on public.studio_clients from anon;


-- --------------------------------------------------------------------------
-- FILE: sql/005_business.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.business_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  contact text not null default '',
  signer_title text not null default '',
  email text not null default '',
  phone text not null default '',
  website text not null default '',
  tax_id text not null default '',
  duns_number text not null default '',
  address text not null default '',
  formation_state text not null default '',
  governing_state text not null default '',
  bank_name text not null default '',
  bank_routing text not null default '',
  bank_account text not null default '',
  bank_address text not null default '',
  portal_url text not null default '',
  portal_username text not null default '',
  portal_password text not null default '',
  payment_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_profile_one_per_user unique (user_id)
);

drop trigger if exists business_profile_touch on public.business_profile;
create trigger business_profile_touch
before update on public.business_profile
for each row execute procedure public.set_updated_at();

alter table public.business_profile enable row level security;

drop policy if exists business_profile_select on public.business_profile;
drop policy if exists business_profile_insert on public.business_profile;
drop policy if exists business_profile_update on public.business_profile;
drop policy if exists business_profile_delete on public.business_profile;

create policy business_profile_select
  on public.business_profile for select
  using (auth.uid() = user_id);

create policy business_profile_insert
  on public.business_profile for insert
  with check (auth.uid() = user_id);

create policy business_profile_update
  on public.business_profile for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy business_profile_delete
  on public.business_profile for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.business_profile to authenticated;
revoke all on public.business_profile from anon;

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  storage_path text not null default '',
  file_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_documents_user
  on public.business_documents (user_id, created_at desc);

drop trigger if exists business_documents_touch on public.business_documents;
create trigger business_documents_touch
before update on public.business_documents
for each row execute procedure public.set_updated_at();

alter table public.business_documents enable row level security;

drop policy if exists business_documents_select on public.business_documents;
drop policy if exists business_documents_insert on public.business_documents;
drop policy if exists business_documents_update on public.business_documents;
drop policy if exists business_documents_delete on public.business_documents;

create policy business_documents_select
  on public.business_documents for select
  using (auth.uid() = user_id);

create policy business_documents_insert
  on public.business_documents for insert
  with check (auth.uid() = user_id);

create policy business_documents_update
  on public.business_documents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy business_documents_delete
  on public.business_documents for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.business_documents to authenticated;
revoke all on public.business_documents from anon;

insert into storage.buckets (id, name, public)
values ('business-docs', 'business-docs', false)
on conflict (id) do nothing;

drop policy if exists business_docs_select on storage.objects;
drop policy if exists business_docs_insert on storage.objects;
drop policy if exists business_docs_update on storage.objects;
drop policy if exists business_docs_delete on storage.objects;

create policy business_docs_select
  on storage.objects for select
  using (bucket_id = 'business-docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy business_docs_insert
  on storage.objects for insert
  with check (bucket_id = 'business-docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy business_docs_update
  on storage.objects for update
  using (bucket_id = 'business-docs' and auth.uid()::text = (storage.foldername(name))[1]);

create policy business_docs_delete
  on storage.objects for delete
  using (bucket_id = 'business-docs' and auth.uid()::text = (storage.foldername(name))[1]);


-- --------------------------------------------------------------------------
-- FILE: sql/006_vault.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.vault_logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic text not null default '',
  url text not null default '',
  username text not null default '',
  password text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vault_logins_user_topic
  on public.vault_logins (user_id, topic);

drop trigger if exists vault_logins_touch on public.vault_logins;
create trigger vault_logins_touch
before update on public.vault_logins
for each row execute procedure public.set_updated_at();

alter table public.vault_logins enable row level security;

drop policy if exists vault_logins_select on public.vault_logins;
drop policy if exists vault_logins_insert on public.vault_logins;
drop policy if exists vault_logins_update on public.vault_logins;
drop policy if exists vault_logins_delete on public.vault_logins;

create policy vault_logins_select
  on public.vault_logins for select
  using (auth.uid() = user_id);

create policy vault_logins_insert
  on public.vault_logins for insert
  with check (auth.uid() = user_id);

create policy vault_logins_update
  on public.vault_logins for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy vault_logins_delete
  on public.vault_logins for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.vault_logins to authenticated;
revoke all on public.vault_logins from anon;


-- --------------------------------------------------------------------------
-- FILE: sql/007_calendar.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.calendar_day_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  constraint calendar_day_notes_user_day unique (user_id, day)
);

create index if not exists calendar_day_notes_user_day_idx
  on public.calendar_day_notes (user_id, day);

drop trigger if exists calendar_day_notes_touch on public.calendar_day_notes;
create trigger calendar_day_notes_touch
before update on public.calendar_day_notes
for each row execute procedure public.set_updated_at();

alter table public.calendar_day_notes enable row level security;

drop policy if exists calendar_day_notes_select on public.calendar_day_notes;
drop policy if exists calendar_day_notes_insert on public.calendar_day_notes;
drop policy if exists calendar_day_notes_update on public.calendar_day_notes;
drop policy if exists calendar_day_notes_delete on public.calendar_day_notes;

create policy calendar_day_notes_select
  on public.calendar_day_notes for select
  using (auth.uid() = user_id);

create policy calendar_day_notes_insert
  on public.calendar_day_notes for insert
  with check (auth.uid() = user_id);

create policy calendar_day_notes_update
  on public.calendar_day_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy calendar_day_notes_delete
  on public.calendar_day_notes for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.calendar_day_notes to authenticated;
revoke all on public.calendar_day_notes from anon;


-- --------------------------------------------------------------------------
-- FILE: sql/008_renewals.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.renewal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  category text not null default 'other',
  due_date date not null default current_date,
  notes text not null default '',
  remind_days_before int not null default 30,
  notification_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renewal_items_user_due
  on public.renewal_items (user_id, due_date);

drop trigger if exists renewal_items_touch on public.renewal_items;
create trigger renewal_items_touch
before update on public.renewal_items
for each row execute procedure public.set_updated_at();

alter table public.renewal_items enable row level security;

drop policy if exists renewal_items_select on public.renewal_items;
drop policy if exists renewal_items_insert on public.renewal_items;
drop policy if exists renewal_items_update on public.renewal_items;
drop policy if exists renewal_items_delete on public.renewal_items;

create policy renewal_items_select
  on public.renewal_items for select
  using (auth.uid() = user_id);

create policy renewal_items_insert
  on public.renewal_items for insert
  with check (auth.uid() = user_id);

create policy renewal_items_update
  on public.renewal_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy renewal_items_delete
  on public.renewal_items for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.renewal_items to authenticated;
revoke all on public.renewal_items from anon;


-- --------------------------------------------------------------------------
-- FILE: sql/009_money.sql
-- --------------------------------------------------------------------------

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


-- --------------------------------------------------------------------------
-- FILE: sql/010_sop.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.sop_guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seed_key text not null default '',
  title text not null default '',
  summary text not null default '',
  category text not null default 'other',
  steps jsonb not null default '[]'::jsonb,
  link_title text not null default '',
  link_url text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sop_guides_user_sort
  on public.sop_guides (user_id, sort_order, title);

drop trigger if exists sop_guides_touch on public.sop_guides;
create trigger sop_guides_touch
before update on public.sop_guides
for each row execute procedure public.set_updated_at();

alter table public.sop_guides enable row level security;

drop policy if exists sop_guides_select on public.sop_guides;
drop policy if exists sop_guides_insert on public.sop_guides;
drop policy if exists sop_guides_update on public.sop_guides;
drop policy if exists sop_guides_delete on public.sop_guides;

create policy sop_guides_select on public.sop_guides for select using (auth.uid() = user_id);
create policy sop_guides_insert on public.sop_guides for insert with check (auth.uid() = user_id);
create policy sop_guides_update on public.sop_guides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sop_guides_delete on public.sop_guides for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.sop_guides to authenticated;
revoke all on public.sop_guides from anon;


-- --------------------------------------------------------------------------
-- FILE: sql/011_apps.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.managed_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  summary text not null default '',
  status text not null default 'Idea',
  platforms jsonb not null default '["iOS"]'::jsonb,
  bundle_identifier text not null default '',
  apple_app_id text not null default '',
  google_package_name text not null default '',
  apple_version text not null default '',
  apple_build_number text not null default '',
  google_play_version text not null default '',
  notes text not null default '',
  website_url text not null default '',
  accent_hex text not null default 'E8822E',
  icon_path text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists managed_apps_user_name
  on public.managed_apps (user_id, name);

create table if not exists public.app_logins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id uuid not null references public.managed_apps (id) on delete cascade,
  site_name text not null default '',
  url text not null default '',
  username text not null default '',
  password text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create index if not exists app_logins_app on public.app_logins (app_id);

create table if not exists public.app_issues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id uuid not null references public.managed_apps (id) on delete cascade,
  title text not null default '',
  details text not null default '',
  status text not null default 'open',
  priority text not null default 'normal',
  platform text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_issues_app on public.app_issues (app_id);

drop trigger if exists managed_apps_touch on public.managed_apps;
create trigger managed_apps_touch before update on public.managed_apps
for each row execute procedure public.set_updated_at();

drop trigger if exists app_logins_touch on public.app_logins;
create trigger app_logins_touch before update on public.app_logins
for each row execute procedure public.set_updated_at();

drop trigger if exists app_issues_touch on public.app_issues;
create trigger app_issues_touch before update on public.app_issues
for each row execute procedure public.set_updated_at();

alter table public.managed_apps enable row level security;
alter table public.app_logins enable row level security;
alter table public.app_issues enable row level security;

do $$
declare t text;
begin
  foreach t in array array['managed_apps', 'app_logins', 'app_issues']
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


-- --------------------------------------------------------------------------
-- FILE: sql/012_support_emails_leads.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

-- Leads
create table if not exists public.studio_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  company_name text not null default '',
  email text not null default '',
  phone text not null default '',
  source text not null default '',
  notes text not null default '',
  status text not null default 'warm',
  last_touch date,
  follow_up date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_leads_user_status on public.studio_leads (user_id, status, updated_at desc);

-- Support tickets
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id uuid references public.managed_apps (id) on delete set null,
  ticket_number text not null default '001',
  title text not null default '',
  details text not null default '',
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  platform text not null default 'iOS',
  app_version text not null default '',
  os_version text not null default '',
  device text not null default '',
  source text not null default 'email',
  category text not null default 'bug',
  priority text not null default 'normal',
  status text not null default 'open',
  next_step text not null default '',
  resolution text not null default '',
  internal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_tickets_user_status on public.support_tickets (user_id, status, updated_at desc);

-- Email lists / contacts / templates
create table if not exists public.email_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  source_file_name text not null default '',
  column_names jsonb not null default '["Email","Name","Company","Phone","Notes"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_id uuid not null references public.email_lists (id) on delete cascade,
  cells jsonb not null default '[]'::jsonb,
  email text not null default '',
  name text not null default '',
  company text not null default '',
  phone text not null default '',
  notes text not null default '',
  is_sent boolean not null default false,
  sent_at timestamptz,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists email_contacts_list on public.email_contacts (list_id, sort_order);

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists studio_leads_touch on public.studio_leads;
create trigger studio_leads_touch before update on public.studio_leads
for each row execute procedure public.set_updated_at();

drop trigger if exists support_tickets_touch on public.support_tickets;
create trigger support_tickets_touch before update on public.support_tickets
for each row execute procedure public.set_updated_at();

drop trigger if exists email_lists_touch on public.email_lists;
create trigger email_lists_touch before update on public.email_lists
for each row execute procedure public.set_updated_at();

drop trigger if exists email_contacts_touch on public.email_contacts;
create trigger email_contacts_touch before update on public.email_contacts
for each row execute procedure public.set_updated_at();

drop trigger if exists email_templates_touch on public.email_templates;
create trigger email_templates_touch before update on public.email_templates
for each row execute procedure public.set_updated_at();

alter table public.studio_leads enable row level security;
alter table public.support_tickets enable row level security;
alter table public.email_lists enable row level security;
alter table public.email_contacts enable row level security;
alter table public.email_templates enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'studio_leads',
    'support_tickets',
    'email_lists',
    'email_contacts',
    'email_templates'
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


-- --------------------------------------------------------------------------
-- FILE: sql/013_inventory.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  purpose text not null default '',
  purchased_on date,
  amount numeric(12, 2) not null default 0,
  serial_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_purchased
  on public.inventory_items (user_id, purchased_on desc nulls last);

drop trigger if exists inventory_items_touch on public.inventory_items;
create trigger inventory_items_touch
before update on public.inventory_items
for each row execute procedure public.set_updated_at();

alter table public.inventory_items enable row level security;

drop policy if exists inventory_items_select on public.inventory_items;
drop policy if exists inventory_items_insert on public.inventory_items;
drop policy if exists inventory_items_update on public.inventory_items;
drop policy if exists inventory_items_delete on public.inventory_items;

create policy inventory_items_select
  on public.inventory_items for select
  using (auth.uid() = user_id);

create policy inventory_items_insert
  on public.inventory_items for insert
  with check (auth.uid() = user_id);

create policy inventory_items_update
  on public.inventory_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy inventory_items_delete
  on public.inventory_items for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.inventory_items to authenticated;
revoke all on public.inventory_items from anon;


-- --------------------------------------------------------------------------
-- FILE: sql/014_app_icons.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.
-- App icon uploads for the Apps page.

insert into storage.buckets (id, name, public)
values ('app-icons', 'app-icons', false)
on conflict (id) do nothing;

drop policy if exists app_icons_select on storage.objects;
drop policy if exists app_icons_insert on storage.objects;
drop policy if exists app_icons_update on storage.objects;
drop policy if exists app_icons_delete on storage.objects;

create policy app_icons_select
  on storage.objects for select
  using (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);

create policy app_icons_insert
  on storage.objects for insert
  with check (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);

create policy app_icons_update
  on storage.objects for update
  using (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);

create policy app_icons_delete
  on storage.objects for delete
  using (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);


-- --------------------------------------------------------------------------
-- FILE: sql/015_ledger_proofs.sql
-- --------------------------------------------------------------------------

-- Paste into Supabase → SQL Editor → Run.
-- Multiple compressed proof images on expenses and income.

alter table public.business_expenses
  add column if not exists proofs jsonb not null default '[]'::jsonb;

alter table public.business_incomes
  add column if not exists proofs jsonb not null default '[]'::jsonb;

-- Paste into Supabase → SQL Editor → Run.
-- Editable price book (Pricing popup + quote/invoice picker).

create table if not exists public.studio_pricing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  detail text not null default '',
  rate numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_pricing_items_user_sort
  on public.studio_pricing_items (user_id, sort_order, name);

create table if not exists public.studio_pricing_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  deposit_percent numeric(5, 2) not null default 50,
  valid_days integer not null default 14,
  updated_at timestamptz not null default now()
);

drop trigger if exists studio_pricing_items_touch on public.studio_pricing_items;
create trigger studio_pricing_items_touch
before update on public.studio_pricing_items
for each row execute procedure public.set_updated_at();

alter table public.studio_pricing_items enable row level security;
alter table public.studio_pricing_settings enable row level security;

drop policy if exists studio_pricing_items_select on public.studio_pricing_items;
drop policy if exists studio_pricing_items_insert on public.studio_pricing_items;
drop policy if exists studio_pricing_items_update on public.studio_pricing_items;
drop policy if exists studio_pricing_items_delete on public.studio_pricing_items;
drop policy if exists studio_pricing_settings_select on public.studio_pricing_settings;
drop policy if exists studio_pricing_settings_insert on public.studio_pricing_settings;
drop policy if exists studio_pricing_settings_update on public.studio_pricing_settings;
drop policy if exists studio_pricing_settings_delete on public.studio_pricing_settings;

create policy studio_pricing_items_select
  on public.studio_pricing_items for select using (auth.uid() = user_id);
create policy studio_pricing_items_insert
  on public.studio_pricing_items for insert with check (auth.uid() = user_id);
create policy studio_pricing_items_update
  on public.studio_pricing_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy studio_pricing_items_delete
  on public.studio_pricing_items for delete using (auth.uid() = user_id);

create policy studio_pricing_settings_select
  on public.studio_pricing_settings for select using (auth.uid() = user_id);
create policy studio_pricing_settings_insert
  on public.studio_pricing_settings for insert with check (auth.uid() = user_id);
create policy studio_pricing_settings_update
  on public.studio_pricing_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy studio_pricing_settings_delete
  on public.studio_pricing_settings for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.studio_pricing_items to authenticated;
grant select, insert, update, delete on public.studio_pricing_settings to authenticated;
revoke all on public.studio_pricing_items from anon;
revoke all on public.studio_pricing_settings from anon;
-- Paste into Supabase → SQL Editor → Run.
-- Private keys for Bank / Apple / Play. Only your login can read them.
-- The website never puts these in public files.

create table if not exists public.studio_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mercury_token text not null default '',
  asc_issuer_id text not null default '',
  asc_key_id text not null default '',
  asc_private_key text not null default '',
  play_service_account_json text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.studio_secrets enable row level security;

drop policy if exists studio_secrets_select on public.studio_secrets;
drop policy if exists studio_secrets_insert on public.studio_secrets;
drop policy if exists studio_secrets_update on public.studio_secrets;
drop policy if exists studio_secrets_delete on public.studio_secrets;

create policy studio_secrets_select
  on public.studio_secrets for select using (auth.uid() = user_id);
create policy studio_secrets_insert
  on public.studio_secrets for insert with check (auth.uid() = user_id);
create policy studio_secrets_update
  on public.studio_secrets for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy studio_secrets_delete
  on public.studio_secrets for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.studio_secrets to authenticated;
revoke all on public.studio_secrets from anon;

-- FILE: sql/018_notifications.sql
-- Paste into Supabase → SQL Editor → Run.
-- Studio notification history (compose shell stores sends here; delivery comes later).

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id uuid references public.managed_apps (id) on delete set null,
  app_name text not null default '',
  subject text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_select on public.app_notifications;
drop policy if exists app_notifications_insert on public.app_notifications;
drop policy if exists app_notifications_update on public.app_notifications;
drop policy if exists app_notifications_delete on public.app_notifications;

create policy app_notifications_select
  on public.app_notifications for select
  using (auth.uid() = user_id);

create policy app_notifications_insert
  on public.app_notifications for insert
  with check (auth.uid() = user_id);

create policy app_notifications_update
  on public.app_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy app_notifications_delete
  on public.app_notifications for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.app_notifications to authenticated;
revoke all on public.app_notifications from anon;

-- FILE: sql/019_permitpath_announce.sql
-- Paste into Studio Supabase → SQL Editor → Run.
-- Adds Permit Path publish credentials to studio_secrets (used by studio-proxy / Mac sync).

alter table public.studio_secrets
  add column if not exists permitpath_supabase_url text not null default '',
  add column if not exists permitpath_service_role_key text not null default '';
-- Paste into Supabase → SQL Editor → Run.
-- Amount on renewals + link when you log one as an expense.

alter table public.renewal_items
  add column if not exists amount numeric(12,2) not null default 0;

alter table public.renewal_items
  add column if not exists logged_expense_id uuid;

comment on column public.renewal_items.amount is 'Expected renewal cost; used when logging into Expenses.';
comment on column public.renewal_items.logged_expense_id is 'business_expenses.id created by Log as expense, if any.';

-- Paste into Supabase → SQL Editor → Run.
-- Business mileage / trip log for tax records.

create table if not exists public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_date date not null default current_date,
  purpose text not null default '',
  start_place text not null default '',
  end_place text not null default '',
  miles numeric(10,1) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mileage_trips_user_date
  on public.mileage_trips (user_id, trip_date desc);

drop trigger if exists mileage_trips_touch on public.mileage_trips;
create trigger mileage_trips_touch
before update on public.mileage_trips
for each row execute procedure public.set_updated_at();

alter table public.mileage_trips enable row level security;

drop policy if exists mileage_trips_select on public.mileage_trips;
drop policy if exists mileage_trips_insert on public.mileage_trips;
drop policy if exists mileage_trips_update on public.mileage_trips;
drop policy if exists mileage_trips_delete on public.mileage_trips;

create policy mileage_trips_select
  on public.mileage_trips for select
  using (auth.uid() = user_id);

create policy mileage_trips_insert
  on public.mileage_trips for insert
  with check (auth.uid() = user_id);

create policy mileage_trips_update
  on public.mileage_trips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy mileage_trips_delete
  on public.mileage_trips for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.mileage_trips to authenticated;
revoke all on public.mileage_trips from anon;

-- Paste into Supabase → SQL Editor → Run.
-- Amount on renewals + link when you log one as an expense.

alter table public.renewal_items
  add column if not exists amount numeric(12,2) not null default 0;

alter table public.renewal_items
  add column if not exists logged_expense_id uuid;

comment on column public.renewal_items.amount is 'Expected renewal cost; used when logging into Expenses.';
comment on column public.renewal_items.logged_expense_id is 'business_expenses.id created by Log as expense, if any.';

-- Paste into Supabase → SQL Editor → Run.
-- Business mileage / trip log for tax records.

create table if not exists public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_date date not null default current_date,
  purpose text not null default '',
  start_place text not null default '',
  end_place text not null default '',
  miles numeric(10,1) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mileage_trips_user_date
  on public.mileage_trips (user_id, trip_date desc);

drop trigger if exists mileage_trips_touch on public.mileage_trips;
create trigger mileage_trips_touch
before update on public.mileage_trips
for each row execute procedure public.set_updated_at();

alter table public.mileage_trips enable row level security;

drop policy if exists mileage_trips_select on public.mileage_trips;
drop policy if exists mileage_trips_insert on public.mileage_trips;
drop policy if exists mileage_trips_update on public.mileage_trips;
drop policy if exists mileage_trips_delete on public.mileage_trips;

create policy mileage_trips_select
  on public.mileage_trips for select
  using (auth.uid() = user_id);

create policy mileage_trips_insert
  on public.mileage_trips for insert
  with check (auth.uid() = user_id);

create policy mileage_trips_update
  on public.mileage_trips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy mileage_trips_delete
  on public.mileage_trips for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.mileage_trips to authenticated;
revoke all on public.mileage_trips from anon;
