-- Photos on journal entries.
-- A nullable photo_path on baby_journal points at a file in the private
-- 'journal-photos' storage bucket. Only the two family accounts (the same
-- public.is_family() check every table uses) can read, add, replace or
-- delete those files; the bucket is not public, so the app shows photos
-- through short-lived signed URLs.

alter table public.baby_journal add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "family read journal photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'journal-photos' and public.is_family());

create policy "family add journal photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'journal-photos' and public.is_family());

create policy "family update journal photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'journal-photos' and public.is_family())
  with check (bucket_id = 'journal-photos' and public.is_family());

create policy "family delete journal photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'journal-photos' and public.is_family());
