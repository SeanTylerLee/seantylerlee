-- Paste into Supabase → SQL Editor → Run.
-- Studio notification history (compose shell stores sends here; delivery comes later).

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  app_id uuid references public.managed_apps (id) on delete set null,
  app_name text not null default '',
  subject text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created
  on public.app_notifications (user_id, created_at desc);

alter table public.app_notifications enable row level security;

drop policy if exists app_notifications_select on public.app_notifications;
drop policy if exists app_notifications_insert on public.app_notifications;
drop policy if exists app_notifications_update on public.app_notifications;
drop policy if exists app_notifications_delete on public.app_notifications;

create policy app_notifications_select
  on public.app_notifications for select
  using (auth.uid() = user_id);

create policy app_notifications_insert
  on public.app_notifications for insert
  with check (auth.uid() = user_id);

create policy app_notifications_update
  on public.app_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy app_notifications_delete
  on public.app_notifications for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.app_notifications to authenticated;
revoke all on public.app_notifications from anon;
