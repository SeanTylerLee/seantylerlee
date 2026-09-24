-- Paste into Studio Supabase → SQL Editor → Run.
alter table public.email_lists
  add column if not exists subject text not null default '';
alter table public.email_lists
  add column if not exists notes text not null default '';
