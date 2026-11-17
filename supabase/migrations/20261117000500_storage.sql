-- =============================================================================
-- Book Shelf :: 0500 :: Supabase Storage buckets and policies
--   covers  : book covers, series covers, merchandise images, publisher logos
--             public read, admin-only write
--   avatars : profile pictures, stored as <user id>/<file>
--             public read, each user writes only inside their own folder
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers',  'covers',  true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']),
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- covers ----------------------------------------------------------------------
create policy "covers: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'covers');

create policy "covers: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'covers' and (select public.is_admin()));

create policy "covers: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()))
  with check (bucket_id = 'covers' and (select public.is_admin()));

create policy "covers: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'covers' and (select public.is_admin()));

-- avatars ---------------------------------------------------------------------
create policy "avatars: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars: owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars: owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
