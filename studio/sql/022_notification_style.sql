-- Paste into Studio Supabase → SQL Editor → Run.
-- Photo + message style for Notifications (Permit Path gate).

alter table public.app_notifications
  add column if not exists image_url text not null default '',
  add column if not exists message_font text not null default 'system',
  add column if not exists message_size text not null default 'medium',
  add column if not exists message_color text not null default '';

insert into storage.buckets (id, name, public)
values ('announcement-images', 'announcement-images', true)
on conflict (id) do update set public = true;

drop policy if exists announcement_images_select on storage.objects;
drop policy if exists announcement_images_insert on storage.objects;
drop policy if exists announcement_images_update on storage.objects;
drop policy if exists announcement_images_delete on storage.objects;

create policy announcement_images_select
  on storage.objects for select
  using (bucket_id = 'announcement-images');

create policy announcement_images_insert
  on storage.objects for insert
  with check (bucket_id = 'announcement-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy announcement_images_update
  on storage.objects for update
  using (bucket_id = 'announcement-images' and auth.uid()::text = (storage.foldername(name))[1]);

create policy announcement_images_delete
  on storage.objects for delete
  using (bucket_id = 'announcement-images' and auth.uid()::text = (storage.foldername(name))[1]);
