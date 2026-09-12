-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.calendar_day_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day date not null,
  body text not null default '',
  updated_at timestamptz not null default now(),
  constraint calendar_day_notes_user_day unique (user_id, day)
);

create index if not exists calendar_day_notes_user_day_idx
  on public.calendar_day_notes (user_id, day);

drop trigger if exists calendar_day_notes_touch on public.calendar_day_notes;
create trigger calendar_day_notes_touch
before update on public.calendar_day_notes
for each row execute procedure public.set_updated_at();

alter table public.calendar_day_notes enable row level security;

drop policy if exists calendar_day_notes_select on public.calendar_day_notes;
drop policy if exists calendar_day_notes_insert on public.calendar_day_notes;
drop policy if exists calendar_day_notes_update on public.calendar_day_notes;
drop policy if exists calendar_day_notes_delete on public.calendar_day_notes;

create policy calendar_day_notes_select
  on public.calendar_day_notes for select
  using (auth.uid() = user_id);

create policy calendar_day_notes_insert
  on public.calendar_day_notes for insert
  with check (auth.uid() = user_id);

create policy calendar_day_notes_update
  on public.calendar_day_notes for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy calendar_day_notes_delete
  on public.calendar_day_notes for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.calendar_day_notes to authenticated;
revoke all on public.calendar_day_notes from anon;
