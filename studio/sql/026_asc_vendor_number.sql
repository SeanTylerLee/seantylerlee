-- Paste into Studio Supabase → SQL Editor → Run.
-- Apple Sales and Trends vendor number for the Subscribed page.

alter table public.studio_secrets
  add column if not exists asc_vendor_number text not null default '';
