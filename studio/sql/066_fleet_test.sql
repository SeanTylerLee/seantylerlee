-- Permit Path Supabase. Run once in the SQL editor.
-- A test company stays in Fleet Management but is left out of the money totals.

alter table public.permitpath_fleets
  add column if not exists is_test boolean not null default false;
