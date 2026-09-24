-- Paste into Studio Supabase → SQL Editor → Run.
-- Adds quote payload storage and lets website quotes land in Inbox.

alter table public.studio_inbox
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.studio_inbox
  add column if not exists billing_id uuid;

drop function if exists public.submit_studio_inbox(text, text, text, text, text);

create or replace function public.submit_studio_inbox(
  p_source text,
  p_name text,
  p_email text,
  p_message text,
  p_site text default 'permitpathnav.com',
  p_payload jsonb default '{}'::jsonb
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
  payload jsonb;
begin
  src := lower(trim(coalesce(p_source, 'contact')));
  if src not in ('contact', 'release_notify', 'quote') then
    src := 'contact';
  end if;

  em := lower(trim(coalesce(p_email, '')));
  nm := trim(coalesce(p_name, ''));
  msg := trim(coalesce(p_message, ''));
  site := nullif(trim(coalesce(p_site, '')), '');
  if site is null then
    site := 'permitpathnav.com';
  end if;
  payload := coalesce(p_payload, '{}'::jsonb);
  if jsonb_typeof(payload) <> 'object' then
    payload := '{}'::jsonb;
  end if;

  if em = '' or em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email is required';
  end if;
  if src = 'contact' and nm = '' then
    raise exception 'A name is required';
  end if;
  if src in ('contact', 'quote') and msg = '' then
    raise exception 'A message is required';
  end if;
  if src = 'quote' and nm = '' then
    nm := 'Website quote';
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

  insert into public.studio_inbox (source, site, name, email, message, status, payload)
  values (src, site, nm, em, msg, 'unread', payload)
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.submit_studio_inbox(text, text, text, text, text, jsonb) from public;
grant execute on function public.submit_studio_inbox(text, text, text, text, text, jsonb) to anon, authenticated, service_role;
