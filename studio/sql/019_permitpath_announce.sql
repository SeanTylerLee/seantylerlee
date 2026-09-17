-- Paste into Studio Supabase → SQL Editor → Run.
-- Adds Permit Path publish credentials to studio_secrets (used by studio-proxy / Mac sync).

alter table public.studio_secrets
  add column if not exists permitpath_supabase_url text not null default '',
  add column if not exists permitpath_service_role_key text not null default '';
