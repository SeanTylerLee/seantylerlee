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
