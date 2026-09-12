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
