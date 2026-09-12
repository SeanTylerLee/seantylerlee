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
