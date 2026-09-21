-- Paste into Studio Supabase → SQL Editor → Run.
-- Google Play Cloud Storage bucket for the Subscribed page.

alter table public.studio_secrets
  add column if not exists play_gcs_bucket text not null default '';
