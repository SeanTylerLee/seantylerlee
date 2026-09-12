-- Fix Projects permissions. Paste into Supabase SQL Editor and Run.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.client_projects to authenticated;
grant select, insert, update, delete on public.project_logins to authenticated;
grant select, insert, update, delete on public.project_costs to authenticated;
grant select, insert, update, delete on public.project_hour_entries to authenticated;
grant select, insert, update, delete on public.project_handoff_items to authenticated;
grant select, insert, update, delete on public.project_issues to authenticated;
grant select, insert, update, delete on public.meeting_logs to authenticated;

alter table public.client_projects enable row level security;
alter table public.project_logins enable row level security;
alter table public.project_costs enable row level security;
alter table public.project_hour_entries enable row level security;
alter table public.project_handoff_items enable row level security;
alter table public.project_issues enable row level security;
alter table public.meeting_logs enable row level security;
