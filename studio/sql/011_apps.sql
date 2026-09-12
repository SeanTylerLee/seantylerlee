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
