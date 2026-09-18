-- Paste into Supabase → SQL Editor → Run.
-- Business mileage / trip log for tax records.

create table if not exists public.mileage_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_date date not null default current_date,
  purpose text not null default '',
  start_place text not null default '',
  end_place text not null default '',
  miles numeric(10,1) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mileage_trips_user_date
  on public.mileage_trips (user_id, trip_date desc);

drop trigger if exists mileage_trips_touch on public.mileage_trips;
create trigger mileage_trips_touch
before update on public.mileage_trips
for each row execute procedure public.set_updated_at();

alter table public.mileage_trips enable row level security;

drop policy if exists mileage_trips_select on public.mileage_trips;
drop policy if exists mileage_trips_insert on public.mileage_trips;
drop policy if exists mileage_trips_update on public.mileage_trips;
drop policy if exists mileage_trips_delete on public.mileage_trips;

create policy mileage_trips_select
  on public.mileage_trips for select
  using (auth.uid() = user_id);

create policy mileage_trips_insert
  on public.mileage_trips for insert
  with check (auth.uid() = user_id);

create policy mileage_trips_update
  on public.mileage_trips for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy mileage_trips_delete
  on public.mileage_trips for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.mileage_trips to authenticated;
revoke all on public.mileage_trips from anon;
