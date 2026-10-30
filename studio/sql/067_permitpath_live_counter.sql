-- Permit Path Supabase. Run once in the SQL editor.
-- The homepage reads this. Miles count only on and after October 29, 2026.

create or replace function public.permitpath_live_counter()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ios integer := 0;
  v_android integer := 0;
  v_miles numeric := 0;
begin
  select
    count(*) filter (where platform = 'ios'),
    count(*) filter (where platform = 'android')
  into v_ios, v_android
  from public.direct_app_installs
  where last_seen > now() - interval '15 minutes';

  if to_regclass('public.direct_app_days') is not null then
    select coalesce(sum(miles_driven), 0)
    into v_miles
    from public.direct_app_days
    where day >= date '2026-10-29';
  end if;

  return jsonb_build_object(
    'ios_now', v_ios,
    'android_now', v_android,
    'users_now', v_ios + v_android,
    'miles', round(v_miles),
    'reset_on', '2026-10-29',
    'reset_note', 'Mileage counter reset October 29, 2026.'
  );
end;
$$;

revoke all on function public.permitpath_live_counter() from public;
grant execute on function public.permitpath_live_counter() to anon, authenticated, service_role;
