-- Paste into Supabase → SQL Editor → Run.
-- Editable price book (Pricing popup + quote/invoice picker).

create table if not exists public.studio_pricing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  detail text not null default '',
  rate numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_pricing_items_user_sort
  on public.studio_pricing_items (user_id, sort_order, name);

create table if not exists public.studio_pricing_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  deposit_percent numeric(5, 2) not null default 50,
  valid_days integer not null default 14,
  updated_at timestamptz not null default now()
);

drop trigger if exists studio_pricing_items_touch on public.studio_pricing_items;
create trigger studio_pricing_items_touch
before update on public.studio_pricing_items
for each row execute procedure public.set_updated_at();

alter table public.studio_pricing_items enable row level security;
alter table public.studio_pricing_settings enable row level security;

drop policy if exists studio_pricing_items_select on public.studio_pricing_items;
drop policy if exists studio_pricing_items_insert on public.studio_pricing_items;
drop policy if exists studio_pricing_items_update on public.studio_pricing_items;
drop policy if exists studio_pricing_items_delete on public.studio_pricing_items;
drop policy if exists studio_pricing_settings_select on public.studio_pricing_settings;
drop policy if exists studio_pricing_settings_insert on public.studio_pricing_settings;
drop policy if exists studio_pricing_settings_update on public.studio_pricing_settings;
drop policy if exists studio_pricing_settings_delete on public.studio_pricing_settings;

create policy studio_pricing_items_select
  on public.studio_pricing_items for select using (auth.uid() = user_id);
create policy studio_pricing_items_insert
  on public.studio_pricing_items for insert with check (auth.uid() = user_id);
create policy studio_pricing_items_update
  on public.studio_pricing_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy studio_pricing_items_delete
  on public.studio_pricing_items for delete using (auth.uid() = user_id);

create policy studio_pricing_settings_select
  on public.studio_pricing_settings for select using (auth.uid() = user_id);
create policy studio_pricing_settings_insert
  on public.studio_pricing_settings for insert with check (auth.uid() = user_id);
create policy studio_pricing_settings_update
  on public.studio_pricing_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy studio_pricing_settings_delete
  on public.studio_pricing_settings for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.studio_pricing_items to authenticated;
grant select, insert, update, delete on public.studio_pricing_settings to authenticated;
revoke all on public.studio_pricing_items from anon;
revoke all on public.studio_pricing_settings from anon;
