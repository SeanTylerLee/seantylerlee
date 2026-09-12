-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.renewal_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  category text not null default 'other',
  due_date date not null default current_date,
  notes text not null default '',
  remind_days_before int not null default 30,
  notification_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists renewal_items_user_due
  on public.renewal_items (user_id, due_date);

drop trigger if exists renewal_items_touch on public.renewal_items;
create trigger renewal_items_touch
before update on public.renewal_items
for each row execute procedure public.set_updated_at();

alter table public.renewal_items enable row level security;

drop policy if exists renewal_items_select on public.renewal_items;
drop policy if exists renewal_items_insert on public.renewal_items;
drop policy if exists renewal_items_update on public.renewal_items;
drop policy if exists renewal_items_delete on public.renewal_items;

create policy renewal_items_select
  on public.renewal_items for select
  using (auth.uid() = user_id);

create policy renewal_items_insert
  on public.renewal_items for insert
  with check (auth.uid() = user_id);

create policy renewal_items_update
  on public.renewal_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy renewal_items_delete
  on public.renewal_items for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.renewal_items to authenticated;
revoke all on public.renewal_items from anon;
