-- Paste into Studio Supabase → SQL Editor → Run.
-- Promo / free-trial log per managed app (iOS and Android store offers).

create table if not exists public.app_promos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id uuid references public.managed_apps (id) on delete set null,
  app_name text not null default '',
  platform text not null default 'iOS',
  kind text not null default 'free_trial',
  title text not null default '',
  duration text not null default '1 month',
  eligibility text not null default 'new',
  status text not null default 'draft',
  start_date date,
  end_date date,
  store_ref text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_promos_user_app
  on public.app_promos (user_id, app_id, start_date desc);

drop trigger if exists app_promos_touch on public.app_promos;
create trigger app_promos_touch before update on public.app_promos
for each row execute procedure public.set_updated_at();

alter table public.app_promos enable row level security;

drop policy if exists app_promos_select on public.app_promos;
drop policy if exists app_promos_insert on public.app_promos;
drop policy if exists app_promos_update on public.app_promos;
drop policy if exists app_promos_delete on public.app_promos;

create policy app_promos_select on public.app_promos
  for select using (auth.uid() = user_id);
create policy app_promos_insert on public.app_promos
  for insert with check (auth.uid() = user_id);
create policy app_promos_update on public.app_promos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy app_promos_delete on public.app_promos
  for delete using (auth.uid() = user_id);

revoke all on public.app_promos from anon;
grant select, insert, update, delete on public.app_promos to authenticated;
