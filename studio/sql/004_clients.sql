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
