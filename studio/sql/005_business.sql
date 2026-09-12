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
