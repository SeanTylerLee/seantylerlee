-- Paste into Supabase → SQL Editor → Run.
-- App icon uploads for the Apps page.

insert into storage.buckets (id, name, public)
values ('app-icons', 'app-icons', false)
on conflict (id) do nothing;

drop policy if exists app_icons_select on storage.objects;
drop policy if exists app_icons_insert on storage.objects;
drop policy if exists app_icons_update on storage.objects;
drop policy if exists app_icons_delete on storage.objects;

create policy app_icons_select
  on storage.objects for select
  using (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);

create policy app_icons_insert
  on storage.objects for insert
  with check (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);

create policy app_icons_update
  on storage.objects for update
  using (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);

create policy app_icons_delete
  on storage.objects for delete
  using (bucket_id = 'app-icons' and auth.uid()::text = (storage.foldername(name))[1]);
