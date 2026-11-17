-- =============================================================================
-- Book Shelf :: 0300 :: Row Level Security and grants
-- Catalog: readable by everyone, writable only by admins (checked in the DB).
-- Profiles: readable by everyone, writable only by their owner.
-- Collections & roles: visible only to their owner.
-- =============================================================================

grant usage on schema public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Shared catalog tables
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'publishers', 'authors', 'illustrators', 'translators', 'genres',
    'series', 'series_genres', 'books', 'book_authors', 'book_illustrators',
    'book_translators', 'merchandise'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('grant insert, update, delete on public.%I to authenticated', t);

    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || ': public read', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))',
      t || ': admin insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
      t || ': admin update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))',
      t || ': admin delete', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

create policy "profiles: public read" on public.profiles
  for select to anon, authenticated using (true);
create policy "profiles: owner insert" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles: owner update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Roles (read-only for the owner; managed via SQL editor / service role only)
-- -----------------------------------------------------------------------------
alter table public.user_roles enable row level security;
grant select on public.user_roles to authenticated;

create policy "user_roles: owner read" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Collections
-- -----------------------------------------------------------------------------
alter table public.user_collections enable row level security;
grant select, insert, update, delete on public.user_collections to authenticated;
-- anon needs the SELECT privilege only because search_catalog (security invoker) references
-- this table; no policy targets anon, so RLS still returns zero rows to signed-out users.
grant select on public.user_collections to anon;

create policy "collections: owner read" on public.user_collections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "collections: owner insert" on public.user_collections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "collections: owner update" on public.user_collections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "collections: owner delete" on public.user_collections
  for delete to authenticated using (user_id = (select auth.uid()));
