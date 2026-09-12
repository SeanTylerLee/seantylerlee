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
