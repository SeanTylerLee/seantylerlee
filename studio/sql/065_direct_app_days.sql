-- Permit Path Supabase. Run once after sql/021_direct_app_analytics_more.sql.
-- One row per day and phone type. The all-time install totals stay on direct_app_installs.
-- Days before this runs are not rebuilt.

create table if not exists public.direct_app_days (
  day date not null,
  platform text not null,
  opens integer not null default 0,
  routes_built integer not null default 0,
  navigations_started integer not null default 0,
  permits_imported integer not null default 0,
  routes_shared integer not null default 0,
  arrivals integer not null default 0,
  miles_driven numeric not null default 0,
  off_route_trips integer not null default 0,
  navigations_official integer not null default 0,
  navigations_built integer not null default 0,
  paywall_shown integer not null default 0,
  subscribe_tapped integer not null default 0,
  restore_tapped integer not null default 0,
  waypoint_cap integer not null default 0,
  import_locked integer not null default 0,
  free_tier_chosen integer not null default 0,
  imports_pdf integer not null default 0,
  imports_qr integer not null default 0,
  saved_routes_opened integer not null default 0,
  primary key (day, platform),
  constraint direct_app_days_platform_chk check (platform in ('ios', 'android'))
);

alter table public.direct_app_days enable row level security;
revoke all on public.direct_app_days from anon, authenticated;

create or replace function public.record_direct_app_event(
  p_install_id text,
  p_platform text,
  p_app_version text,
  p_is_subscribed boolean,
  p_event text,
  p_is_signed_in boolean default false,
  p_miles numeric default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := left(trim(coalesce(p_install_id, '')), 80);
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_event text := lower(trim(coalesce(p_event, 'open')));
  v_version text := left(trim(coalesce(p_app_version, '')), 40);
  v_miles numeric := greatest(coalesce(p_miles, 0), 0);
  v_today date := (now() at time zone 'utc')::date;
begin
  if length(v_id) < 8 then
    return;
  end if;
  if v_platform not in ('ios', 'android') then
    return;
  end if;
  if v_event not in (
    'open', 'route_built', 'navigation_started', 'permit_imported', 'route_shared',
    'navigation_official', 'navigation_built', 'arrived', 'off_route',
    'paywall_shown', 'subscribe_tapped', 'restore_tapped', 'waypoint_cap',
    'import_locked', 'free_tier_chosen', 'import_pdf', 'import_qr', 'saved_route_opened'
  ) then
    v_event := 'open';
  end if;
  if v_miles > 5000 then
    v_miles := 5000;
  end if;

  insert into public.direct_app_installs as d (
    install_id, platform, app_version, is_subscribed, is_signed_in, last_seen,
    routes_built, navigations_started, permits_imported, routes_shared,
    arrivals, miles_driven, off_route_trips, navigations_official, navigations_built,
    paywall_shown, subscribe_tapped, restore_tapped, waypoint_cap, import_locked,
    free_tier_chosen, imports_pdf, imports_qr, saved_routes_opened,
    days_opened, last_open_date
  ) values (
    v_id, v_platform, v_version, coalesce(p_is_subscribed, false), coalesce(p_is_signed_in, false), now(),
    case when v_event = 'route_built' then 1 else 0 end,
    case when v_event in ('navigation_started', 'navigation_official', 'navigation_built') then 1 else 0 end,
    case when v_event = 'permit_imported' then 1 else 0 end,
    case when v_event = 'route_shared' then 1 else 0 end,
    case when v_event = 'arrived' then 1 else 0 end,
    case when v_event = 'arrived' then v_miles else 0 end,
    case when v_event = 'off_route' then 1 else 0 end,
    case when v_event = 'navigation_official' then 1 else 0 end,
    case when v_event = 'navigation_built' then 1 else 0 end,
    case when v_event = 'paywall_shown' then 1 else 0 end,
    case when v_event = 'subscribe_tapped' then 1 else 0 end,
    case when v_event = 'restore_tapped' then 1 else 0 end,
    case when v_event = 'waypoint_cap' then 1 else 0 end,
    case when v_event = 'import_locked' then 1 else 0 end,
    case when v_event = 'free_tier_chosen' then 1 else 0 end,
    case when v_event = 'import_pdf' then 1 else 0 end,
    case when v_event = 'import_qr' then 1 else 0 end,
    case when v_event = 'saved_route_opened' then 1 else 0 end,
    case when v_event = 'open' then 1 else 0 end,
    case when v_event = 'open' then v_today else null end
  )
  on conflict (install_id) do update set
    platform = excluded.platform,
    app_version = case when excluded.app_version = '' then d.app_version else excluded.app_version end,
    is_subscribed = excluded.is_subscribed,
    is_signed_in = excluded.is_signed_in,
    last_seen = now(),
    routes_built = d.routes_built + excluded.routes_built,
    navigations_started = d.navigations_started + excluded.navigations_started,
    permits_imported = d.permits_imported + excluded.permits_imported,
    routes_shared = d.routes_shared + excluded.routes_shared,
    arrivals = d.arrivals + excluded.arrivals,
    miles_driven = d.miles_driven + excluded.miles_driven,
    off_route_trips = d.off_route_trips + excluded.off_route_trips,
    navigations_official = d.navigations_official + excluded.navigations_official,
    navigations_built = d.navigations_built + excluded.navigations_built,
    paywall_shown = d.paywall_shown + excluded.paywall_shown,
    subscribe_tapped = d.subscribe_tapped + excluded.subscribe_tapped,
    restore_tapped = d.restore_tapped + excluded.restore_tapped,
    waypoint_cap = d.waypoint_cap + excluded.waypoint_cap,
    import_locked = d.import_locked + excluded.import_locked,
    free_tier_chosen = d.free_tier_chosen + excluded.free_tier_chosen,
    imports_pdf = d.imports_pdf + excluded.imports_pdf,
    imports_qr = d.imports_qr + excluded.imports_qr,
    saved_routes_opened = d.saved_routes_opened + excluded.saved_routes_opened,
    days_opened = d.days_opened + case
      when v_event = 'open' and d.last_open_date is distinct from v_today then 1
      else 0
    end,
    last_open_date = case
      when v_event = 'open' then v_today
      else d.last_open_date
    end;

  insert into public.direct_app_days as dayrow (
    day, platform, opens, routes_built, navigations_started, permits_imported, routes_shared,
    arrivals, miles_driven, off_route_trips, navigations_official, navigations_built,
    paywall_shown, subscribe_tapped, restore_tapped, waypoint_cap, import_locked,
    free_tier_chosen, imports_pdf, imports_qr, saved_routes_opened
  ) values (
    v_today, v_platform,
    case when v_event = 'open' then 1 else 0 end,
    case when v_event = 'route_built' then 1 else 0 end,
    case when v_event in ('navigation_started', 'navigation_official', 'navigation_built') then 1 else 0 end,
    case when v_event = 'permit_imported' then 1 else 0 end,
    case when v_event = 'route_shared' then 1 else 0 end,
    case when v_event = 'arrived' then 1 else 0 end,
    case when v_event = 'arrived' then v_miles else 0 end,
    case when v_event = 'off_route' then 1 else 0 end,
    case when v_event = 'navigation_official' then 1 else 0 end,
    case when v_event = 'navigation_built' then 1 else 0 end,
    case when v_event = 'paywall_shown' then 1 else 0 end,
    case when v_event = 'subscribe_tapped' then 1 else 0 end,
    case when v_event = 'restore_tapped' then 1 else 0 end,
    case when v_event = 'waypoint_cap' then 1 else 0 end,
    case when v_event = 'import_locked' then 1 else 0 end,
    case when v_event = 'free_tier_chosen' then 1 else 0 end,
    case when v_event = 'import_pdf' then 1 else 0 end,
    case when v_event = 'import_qr' then 1 else 0 end,
    case when v_event = 'saved_route_opened' then 1 else 0 end
  )
  on conflict (day, platform) do update set
    opens = dayrow.opens + excluded.opens,
    routes_built = dayrow.routes_built + excluded.routes_built,
    navigations_started = dayrow.navigations_started + excluded.navigations_started,
    permits_imported = dayrow.permits_imported + excluded.permits_imported,
    routes_shared = dayrow.routes_shared + excluded.routes_shared,
    arrivals = dayrow.arrivals + excluded.arrivals,
    miles_driven = dayrow.miles_driven + excluded.miles_driven,
    off_route_trips = dayrow.off_route_trips + excluded.off_route_trips,
    navigations_official = dayrow.navigations_official + excluded.navigations_official,
    navigations_built = dayrow.navigations_built + excluded.navigations_built,
    paywall_shown = dayrow.paywall_shown + excluded.paywall_shown,
    subscribe_tapped = dayrow.subscribe_tapped + excluded.subscribe_tapped,
    restore_tapped = dayrow.restore_tapped + excluded.restore_tapped,
    waypoint_cap = dayrow.waypoint_cap + excluded.waypoint_cap,
    import_locked = dayrow.import_locked + excluded.import_locked,
    free_tier_chosen = dayrow.free_tier_chosen + excluded.free_tier_chosen,
    imports_pdf = dayrow.imports_pdf + excluded.imports_pdf,
    imports_qr = dayrow.imports_qr + excluded.imports_qr,
    saved_routes_opened = dayrow.saved_routes_opened + excluded.saved_routes_opened;
end;
$$;

revoke all on function public.record_direct_app_event(text, text, text, boolean, text, boolean, numeric) from public;
grant execute on function public.record_direct_app_event(text, text, text, boolean, text, boolean, numeric) to anon, authenticated, service_role;
