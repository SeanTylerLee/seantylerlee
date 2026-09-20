-- Paste into Studio Supabase → SQL Editor → Run.
-- Per-line message styles for Notifications.

alter table public.app_notifications
  add column if not exists message_blocks jsonb not null default '[]'::jsonb;
