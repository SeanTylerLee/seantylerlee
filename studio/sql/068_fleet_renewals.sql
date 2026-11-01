-- Permit Path Supabase. Run once in the SQL editor after 063 and 064.
-- Renewals extend the codes a company selects. They do not create new codes
-- and they do not turn a paid code off. Access stops on the seat date by itself.

alter table public.permitpath_fleet_seats
  add column if not exists source_session text not null default '';

update public.permitpath_fleet_seats
set source_session = label,
    label = ''
where label like 'cs_%'
  and source_session = '';

alter table public.fleet_payments
  add column if not exists purpose text not null default 'purchase';

alter table public.fleet_payments
  add column if not exists code_list text not null default '';

update public.fleet_payments p
set code_list = sub.list
from (
  select s.source_session as sid,
    string_agg(
      s.code || ' through ' || coalesce(s.paid_through::text, ''),
      ', ' order by s.code
    ) as list
  from public.permitpath_fleet_seats s
  where s.source_session <> ''
  group by s.source_session
) sub
where p.stripe_session_id = sub.sid
  and coalesce(p.code_list, '') = '';

create table if not exists public.fleet_checkout_drafts (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid not null references public.permitpath_fleets (id) on delete cascade,
  purpose text not null,
  months integer not null,
  seats integer not null default 0,
  plan text not null default '',
  created_at timestamptz not null default now(),
  constraint fleet_checkout_drafts_purpose_chk check (purpose in ('purchase', 'renewal'))
);

alter table public.fleet_checkout_drafts enable row level security;
revoke all on public.fleet_checkout_drafts from anon, authenticated;

create or replace function public.claim_fleet_seat(
  p_code text,
  p_install_id text,
  p_platform text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
  v_install text := left(trim(coalesce(p_install_id, '')), 80);
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_seat public.permitpath_fleet_seats%rowtype;
  v_fleet public.permitpath_fleets%rowtype;
  v_until date;
begin
  if length(v_install) < 8 then
    return jsonb_build_object('ok', false, 'error', 'This device could not be identified.');
  end if;
  if v_platform not in ('ios', 'android') then
    v_platform := 'ios';
  end if;

  select * into v_seat
  from public.permitpath_fleet_seats
  where upper(code) = v_code
  limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'That code was not found.');
  end if;

  select * into v_fleet from public.permitpath_fleets where id = v_seat.fleet_id;

  if v_fleet.id is null or not v_fleet.active or not v_seat.active then
    return jsonb_build_object('ok', false, 'error', 'That company code is not active.');
  end if;

  if coalesce(v_seat.billing, 'paid') = 'trial' then
    v_until := v_seat.trial_until;
    if v_until is null or v_until < current_date then
      return jsonb_build_object('ok', false, 'error', 'That trial code has ended.');
    end if;
  else
    v_until := coalesce(v_seat.paid_through, v_fleet.paid_through);
    if v_until is null or v_until < current_date then
      return jsonb_build_object('ok', false, 'error', 'That company code has expired. Your company needs to renew it.');
    end if;
  end if;

  if v_seat.install_id is not null and v_seat.install_id <> v_install then
    return jsonb_build_object('ok', false, 'error', 'That code is already on another device.');
  end if;

  update public.permitpath_fleet_seats
  set install_id = v_install,
      platform = v_platform,
      last_seen = now(),
      first_seen = case when install_id is null then now() else first_seen end
  where id = v_seat.id;

  return jsonb_build_object(
    'ok', true,
    'company', v_fleet.company_name,
    'paid_through', v_until
  );
end;
$$;

create or replace function public.fleet_portal_account(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fleet_id uuid;
  v_fleet public.permitpath_fleets%rowtype;
  v_paid int;
  v_rate numeric;
  v_codes jsonb;
  v_payments jsonb;
begin
  select fleet_id into v_fleet_id
  from public.fleet_portal_sessions
  where token = trim(coalesce(p_token, ''))
    and expires_at > now();
  if v_fleet_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in again.');
  end if;
  select * into v_fleet from public.permitpath_fleets where id = v_fleet_id;
  select count(*) into v_paid
  from public.permitpath_fleet_seats
  where fleet_id = v_fleet.id
    and active
    and coalesce(billing, 'paid') <> 'trial'
    and coalesce(paid_through, v_fleet.paid_through) >= current_date;
  v_rate := case when v_paid >= 21 then 3.39 else 3.99 end;
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', coalesce(s.code, ''),
    'billing', coalesce(s.billing, 'paid'),
    'trial_until', s.trial_until,
    'paid_through', case
      when coalesce(s.billing, 'paid') = 'trial' then s.trial_until
      else coalesce(s.paid_through, v_fleet.paid_through)
    end,
    'used', s.install_id is not null,
    'active', s.active,
    'visible', true
  ) order by s.active desc, coalesce(
    case when coalesce(s.billing, 'paid') = 'trial' then s.trial_until else coalesce(s.paid_through, v_fleet.paid_through) end,
    '1900-01-01'::date
  ) asc, s.first_seen), '[]'::jsonb)
  into v_codes
  from public.permitpath_fleet_seats s
  where s.fleet_id = v_fleet.id
    and coalesce(s.code, '') <> '';
  select coalesce(jsonb_agg(jsonb_build_object(
    'paid_at', p.paid_at,
    'amount', p.amount,
    'months', p.months,
    'seats', p.seats,
    'purpose', coalesce(p.purpose, 'purchase'),
    'code_list', coalesce(p.code_list, ''),
    'paid_through', p.paid_through,
    'payer_email', coalesce(p.payer_email, ''),
    'receipt_url', coalesce(p.receipt_url, ''),
    'receipt_number', coalesce(p.receipt_number, '')
  ) order by p.paid_at desc), '[]'::jsonb)
  into v_payments
  from public.fleet_payments p
  where p.fleet_id = v_fleet.id;
  return jsonb_build_object(
    'ok', true,
    'company', v_fleet.company_name,
    'paid_through', v_fleet.paid_through,
    'active', v_fleet.active,
    'paid_seats', v_paid,
    'rate', v_rate,
    'monthly', round(v_paid * v_rate, 2),
    'trial_request_seats', v_fleet.trial_request_seats,
    'codes', v_codes,
    'payments', v_payments
  );
end;
$$;

revoke all on function public.claim_fleet_seat(text, text, text) from public;
grant execute on function public.claim_fleet_seat(text, text, text) to anon, authenticated, service_role;
revoke all on function public.fleet_portal_account(text) from public;
grant execute on function public.fleet_portal_account(text) to anon, authenticated, service_role;
