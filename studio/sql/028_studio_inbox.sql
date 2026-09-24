-- Paste into Studio Supabase → SQL Editor → Run.
-- Website contact / notify-me forms write here via submit_studio_inbox().
-- Signed-in Studio users read the Inbox page. The public cannot read rows.

create table if not exists public.studio_inbox (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'contact',
  site text not null default 'permitpathnav.com',
  name text not null default '',
  email text not null default '',
  message text not null default '',
  status text not null default 'unread',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio_inbox_status_created
  on public.studio_inbox (status, created_at desc);

drop trigger if exists studio_inbox_touch on public.studio_inbox;
create trigger studio_inbox_touch before update on public.studio_inbox
for each row execute procedure public.set_updated_at();

alter table public.studio_inbox enable row level security;

drop policy if exists studio_inbox_select on public.studio_inbox;
drop policy if exists studio_inbox_insert on public.studio_inbox;
drop policy if exists studio_inbox_update on public.studio_inbox;
drop policy if exists studio_inbox_delete on public.studio_inbox;

create policy studio_inbox_select on public.studio_inbox
  for select to authenticated using (true);
create policy studio_inbox_update on public.studio_inbox
  for update to authenticated using (true) with check (true);
create policy studio_inbox_delete on public.studio_inbox
  for delete to authenticated using (true);

revoke all on public.studio_inbox from anon;
revoke all on public.studio_inbox from public;
grant select, update, delete on public.studio_inbox to authenticated;

create or replace function public.submit_studio_inbox(
  p_source text,
  p_name text,
  p_email text,
  p_message text,
  p_site text default 'permitpathnav.com'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  src text;
  em text;
  nm text;
  msg text;
  site text;
begin
  src := lower(trim(coalesce(p_source, 'contact')));
  if src not in ('contact', 'release_notify') then
    src := 'contact';
  end if;

  em := lower(trim(coalesce(p_email, '')));
  nm := trim(coalesce(p_name, ''));
  msg := trim(coalesce(p_message, ''));
  site := nullif(trim(coalesce(p_site, '')), '');
  if site is null then
    site := 'permitpathnav.com';
  end if;

  if em = '' or em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email is required';
  end if;
  if src = 'contact' and nm = '' then
    raise exception 'A name is required';
  end if;
  if src = 'contact' and msg = '' then
    raise exception 'A message is required';
  end if;

  if src = 'release_notify' then
    if nm = '' then
      nm := 'Release notification signup';
    end if;
    if msg = '' then
      msg := 'Launch notification signup — email: ' || em;
    end if;
  end if;

  if char_length(em) > 320 then
    raise exception 'Email is too long';
  end if;
  if char_length(nm) > 200 then
    nm := left(nm, 200);
  end if;
  if char_length(msg) > 8000 then
    msg := left(msg, 8000);
  end if;
  if char_length(site) > 120 then
    site := left(site, 120);
  end if;

  insert into public.studio_inbox (source, site, name, email, message, status)
  values (src, site, nm, em, msg, 'unread')
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.submit_studio_inbox(text, text, text, text, text) from public;
grant execute on function public.submit_studio_inbox(text, text, text, text, text) to anon, authenticated, service_role;
