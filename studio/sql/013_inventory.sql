-- Paste into Supabase → SQL Editor → Run.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  purpose text not null default '',
  purchased_on date,
  amount numeric(12, 2) not null default 0,
  serial_number text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists inventory_items_user_purchased
  on public.inventory_items (user_id, purchased_on desc nulls last);

drop trigger if exists inventory_items_touch on public.inventory_items;
create trigger inventory_items_touch
before update on public.inventory_items
for each row execute procedure public.set_updated_at();

alter table public.inventory_items enable row level security;

drop policy if exists inventory_items_select on public.inventory_items;
drop policy if exists inventory_items_insert on public.inventory_items;
drop policy if exists inventory_items_update on public.inventory_items;
drop policy if exists inventory_items_delete on public.inventory_items;

create policy inventory_items_select
  on public.inventory_items for select
  using (auth.uid() = user_id);

create policy inventory_items_insert
  on public.inventory_items for insert
  with check (auth.uid() = user_id);

create policy inventory_items_update
  on public.inventory_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy inventory_items_delete
  on public.inventory_items for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.inventory_items to authenticated;
revoke all on public.inventory_items from anon;
