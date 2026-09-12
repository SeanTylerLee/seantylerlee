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
