-- =============================================================================
-- Book Shelf :: 20261125 0200 :: Special editions linked to their volume,
-- merchandise 3D preview metadata, models bucket, merch-only series off the shelves
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Special editions -> regular volume
-- -----------------------------------------------------------------------------
-- A special / limited / box-set edition is an alternative package of a regular volume.
-- regular_book_id points at that volume (same series, same volume number) and is filled
-- in automatically; admins can also set it by hand.
alter table public.books
  add column regular_book_id uuid references public.books (id) on delete set null,
  add column bonus_items text[] not null default '{}'
    check (cardinality(bonus_items) <= 30),
  add constraint books_regular_not_self check (regular_book_id is null or regular_book_id <> id);

create index books_regular_book_idx on public.books (regular_book_id) where regular_book_id is not null;

create or replace function public.books_link_regular_before()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_target public.books%rowtype;
begin
  if new.edition_type = 'regular' then
    new.regular_book_id := null;
    return new;
  end if;

  if new.regular_book_id is not null then
    select * into v_target from public.books where id = new.regular_book_id;
    if v_target.id is null or v_target.edition_type <> 'regular' or v_target.series_id <> new.series_id then
      raise exception 'regular_book_id must point to a regular volume of the same series' using errcode = '23514';
    end if;
  elsif new.volume_number is not null then
    select id into new.regular_book_id
      from public.books
     where series_id = new.series_id
       and edition_type = 'regular'
       and volume_number = new.volume_number
       and id <> new.id
     order by (edition_notes is null) desc, publication_date nulls last, created_at
     limit 1;
  end if;

  -- Bonus items: trimmed, blanks removed
  new.bonus_items := coalesce(
    (select array_agg(left(btrim(x), 300)) from unnest(new.bonus_items) x where btrim(x) <> ''),
    '{}');
  return new;
end;
$$;

create trigger books_link_regular
  before insert or update of edition_type, series_id, volume_number, regular_book_id, bonus_items on public.books
  for each row execute function public.books_link_regular_before();

-- When a regular volume appears (or its number changes), adopt its waiting special editions.
create or replace function public.books_adopt_specials_after()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.edition_type = 'regular' and new.volume_number is not null then
    update public.books
       set regular_book_id = new.id
     where series_id = new.series_id
       and edition_type <> 'regular'
       and volume_number = new.volume_number
       and regular_book_id is null;
  end if;
  return null;
end;
$$;

create trigger books_adopt_specials
  after insert or update of edition_type, series_id, volume_number on public.books
  for each row execute function public.books_adopt_specials_after();

revoke execute on function public.books_link_regular_before() from public, anon, authenticated;
revoke execute on function public.books_adopt_specials_after() from public, anon, authenticated;

-- Backfill existing special editions.
update public.books s
   set regular_book_id = (
     select r.id from public.books r
      where r.series_id = s.series_id and r.edition_type = 'regular' and r.volume_number = s.volume_number
      order by (r.edition_notes is null) desc, r.publication_date nulls last, r.created_at
      limit 1)
 where s.edition_type <> 'regular' and s.regular_book_id is null and s.volume_number is not null;

-- Server-side helper for the importer: bonus items per book (matched by source_ref).
create or replace function public.import_book_extras(p_items jsonb)
returns integer
language sql
set search_path = ''
as $$
  with src as (
    select x ->> 'ref' as ref,
           coalesce((select array_agg(v) from jsonb_array_elements_text(x -> 'bonus_items') v), '{}') as items
      from jsonb_array_elements(p_items) x
  ), upd as (
    update public.books b set bonus_items = src.items
      from src
     where b.source_ref = src.ref and b.bonus_items is distinct from src.items
    returning 1
  )
  select count(*)::integer from upd;
$$;
revoke execute on function public.import_book_extras(jsonb) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.import_book_extras(jsonb) to service_role;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Merchandise: 3D preview metadata
-- -----------------------------------------------------------------------------
-- model_format 'glb' / 'gltf'  : a real model file (model_url, e.g. in the "models" bucket)
-- model_format 'procedural'    : the viewer builds a simulated model in the browser from the
--                                product photo, using model_params written by
--                                scripts/reconstruct-merch.mjs (an approximation, never official)
alter table public.merchandise
  add column model_url             text check (public.is_http_url(model_url)),
  add column model_format          text check (model_format is null or model_format in ('glb', 'gltf', 'procedural')),
  add column model_source          text check (model_source is null or char_length(model_source) <= 500),
  add column model_params          jsonb check (model_params is null or jsonb_typeof(model_params) = 'object'),
  add column reference_urls        text[] not null default '{}' check (cardinality(reference_urls) <= 20),
  add column reconstruction_status text not null default 'not_started'
    check (reconstruction_status in ('not_started', 'researching', 'modeling', 'completed', 'failed')),
  add column reconstruction_notes  text check (reconstruction_notes is null or char_length(reconstruction_notes) <= 2000),
  add column preview_available     boolean not null default false,
  add constraint merchandise_preview_consistent check (
    not preview_available
    or (model_format in ('glb', 'gltf') and model_url is not null)
    or (model_format = 'procedural' and model_params is not null)
  );

create index merchandise_type_idx on public.merchandise (merch_type);
create index merchandise_created_idx on public.merchandise (created_at desc);

create or replace function public.normalize_merch_preview()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.model_url := public.clean_text(new.model_url);
  new.model_source := public.clean_text(new.model_source);
  new.reconstruction_notes := public.clean_text(new.reconstruction_notes);
  new.reference_urls := coalesce(
    (select array_agg(btrim(u)) from unnest(new.reference_urls) u where public.clean_text(u) is not null and public.is_http_url(btrim(u))),
    '{}');
  return new;
end;
$$;
create trigger merchandise_normalize_preview
  before insert or update on public.merchandise
  for each row execute function public.normalize_merch_preview();
revoke execute on function public.normalize_merch_preview() from public, anon, authenticated;

-- Existing rows: the product page is the first reference.
update public.merchandise
   set reference_urls = array[product_url]
 where product_url is not null and cardinality(reference_urls) = 0;

-- Re-classify merchandise that was imported as "other" into the new types.
update public.merchandise m
   set merch_type = c.t::public.merch_type
  from (
    select id,
      case
        when lower(title) ~ '(nendoroid|figma|figure|q posket|luminasta|hello! ?good ?smile|full mechanics|\mrg\M|\mhg\M|model kit|tenitol)' then 'figure'
        when lower(title) ~ '(tapestry|wall scroll)' then 'tapestry'
        when lower(title) ~ '(acrylic (character )?stand|sns plate|diorama|standee)' then 'acrylic_stand'
        when lower(title) ~ '(key ?chain|key ?holder|pendant|charm|strap)' then 'keychain'
        when lower(title) ~ '(shikishi|bromide|art print|art board|illustration board|canvas)' then 'art_print'
        when lower(title) ~ '(poster)' then 'poster'
        when lower(title) ~ '(post ?card)' then 'postcard'
        when lower(title) ~ '(plush|nui|doll|blind box|mascot)' then 'collectible'
        when lower(title) ~ '(badge|button|clear (file|folder)|sticker|t-shirt|\mtee\M|bag|pouch|case|mouse ?pad|pillow|towel|magnet|card|ticket|clip|mask|note|mug|coaster|plate|panel)' then 'character_goods'
      end as t
      from public.merchandise
     where merch_type = 'other'
  ) c
 where m.id = c.id and c.t is not null;

-- -----------------------------------------------------------------------------
-- 3. Storage bucket for 3D models (public read, admin write)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 31457280,
        array['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "models: public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'models');
create policy "models: admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'models' and (select public.is_admin()));
create policy "models: admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'models' and (select public.is_admin()))
  with check (bucket_id = 'models' and (select public.is_admin()));
create policy "models: admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'models' and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 4. Home shelves: only series that have books (merchandise-only series live
--    under /merchandise now)
-- -----------------------------------------------------------------------------
create or replace function public.get_genre_shelves(
  p_per_genre integer default 24,
  p_group_by  text default 'author'
)
returns table (
  genre_id    uuid,
  genre_name  text,
  genre_slug  text,
  genre_total bigint,
  series      jsonb
)
language sql
stable
set search_path = public
as $$
  with shelf_series as (
    select so.* from public.series_overview so
     where so.regular_volume_count + so.special_volume_count > 0
  ),
  base as (
    select g.id as gid, g.name as gname, g.slug as gslug, g.sort_order as gsort, so as srow
      from public.genres g
      join public.series_genres sg on sg.genre_id = g.id
      join shelf_series so on so.id = sg.series_id
    union all
    select null::uuid, 'Uncategorized', 'uncategorized', 2147483647, so
      from shelf_series so
     where cardinality(so.genre_ids) = 0
  ),
  keyed as (
    select b.*,
           case p_group_by
             when 'translator'  then (b.srow).translator_names[1]
             when 'publisher'   then (b.srow).publisher_name
             when 'illustrator' then (b.srow).illustrator_names[1]
             else (b.srow).author_names[1]
           end as group_key
      from base b
  ),
  ranked as (
    select k.*,
           row_number() over (
             partition by k.gid
             order by lower(k.group_key) nulls last,
                      lower((k.srow).author_names[1]) nulls last,
                      lower((k.srow).translator_names[1]) nulls last,
                      lower((k.srow).publisher_name) nulls last,
                      lower((k.srow).illustrator_names[1]) nulls last,
                      lower((k.srow).title)
           ) as rn
      from keyed k
  )
  select r.gid, r.gname, r.gslug, count(*) as genre_total,
         coalesce(
           jsonb_agg(to_jsonb(r.srow) || jsonb_build_object('group_key', r.group_key) order by r.rn)
             filter (where r.rn <= least(greatest(p_per_genre, 1), 100)),
           '[]'::jsonb)
    from ranked r
   group by r.gid, r.gname, r.gslug, r.gsort
   order by r.gsort, r.gname;
$$;
