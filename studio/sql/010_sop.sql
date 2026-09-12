-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.sop_guides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  seed_key text not null default '',
  title text not null default '',
  summary text not null default '',
  category text not null default 'other',
  steps jsonb not null default '[]'::jsonb,
  link_title text not null default '',
  link_url text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sop_guides_user_sort
  on public.sop_guides (user_id, sort_order, title);

drop trigger if exists sop_guides_touch on public.sop_guides;
create trigger sop_guides_touch
before update on public.sop_guides
for each row execute procedure public.set_updated_at();

alter table public.sop_guides enable row level security;

drop policy if exists sop_guides_select on public.sop_guides;
drop policy if exists sop_guides_insert on public.sop_guides;
drop policy if exists sop_guides_update on public.sop_guides;
drop policy if exists sop_guides_delete on public.sop_guides;

create policy sop_guides_select on public.sop_guides for select using (auth.uid() = user_id);
create policy sop_guides_insert on public.sop_guides for insert with check (auth.uid() = user_id);
create policy sop_guides_update on public.sop_guides for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy sop_guides_delete on public.sop_guides for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.sop_guides to authenticated;
revoke all on public.sop_guides from anon;
