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
