-- =============================================================================
-- Book Shelf :: 0700 :: Publisher imports and automatic series covers
--
-- 1. source_ref: a stable external key ("phoenixnext:LN0844-01") on series, books and
--    merchandise so an importer can be re-run without creating duplicates.
-- 2. Automatic series cover: a series shows the cover of its first regular volume
--    (volume 1, or the lowest volume available). A cover an admin uploaded for the
--    series itself is never overwritten.
-- 3. import_catalog(): one call per batch from scripts/import-phoenixnext.mjs.
--    Only the service_role (server-side secret key) can execute it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. External keys
-- -----------------------------------------------------------------------------
alter table public.series
  add column source_ref text check (source_ref is null or char_length(source_ref) between 3 and 200);
alter table public.books
  add column source_ref text check (source_ref is null or char_length(source_ref) between 3 and 200);
alter table public.merchandise
  add column source_ref text check (source_ref is null or char_length(source_ref) between 3 and 200);

-- Plain unique constraints (NULLs are distinct) so ON CONFLICT (source_ref) works.
alter table public.series      add constraint series_source_ref_key      unique (source_ref);
alter table public.books       add constraint books_source_ref_key       unique (source_ref);
alter table public.merchandise add constraint merchandise_source_ref_key unique (source_ref);

-- Server-side scripts use the service_role. Supabase grants it by default; being explicit
-- keeps imports working on projects whose default privileges were changed.
do $$
declare
  t text;
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach t in array array[
      'publishers', 'authors', 'illustrators', 'translators', 'genres', 'series', 'series_genres',
      'books', 'book_authors', 'book_illustrators', 'book_translators', 'merchandise'
    ] loop
      execute format('grant select, insert, update, delete on public.%I to service_role', t);
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Automatic series cover = first regular volume's cover
-- -----------------------------------------------------------------------------
-- The series cover is "automatic" while it is empty or equal to one of its own books'
-- covers (or the cover of the book that was just changed/removed). Anything else is a
-- custom cover chosen by an admin and is left alone.
create or replace function public.refresh_series_cover(p_series_id uuid, p_previous_cover text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.series s
     set cover_url = d.url
    from (
      select b.cover_url as url
        from public.books b
       where b.series_id = p_series_id
         and b.cover_url is not null
       order by (b.edition_type <> 'regular'), b.volume_number nulls last,
                b.publication_date nulls last, b.created_at, b.id
       limit 1
    ) d
   where s.id = p_series_id
     and s.cover_url is distinct from d.url
     and (
       s.cover_url is null
       or s.cover_url = p_previous_cover
       or exists (select 1 from public.books b2 where b2.series_id = p_series_id and b2.cover_url = s.cover_url)
     );
$$;
revoke execute on function public.refresh_series_cover(uuid, text) from public, anon, authenticated;

create or replace function public.books_refresh_series_cover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_series_cover(new.series_id, null);
  elsif tg_op = 'DELETE' then
    perform public.refresh_series_cover(old.series_id, old.cover_url);
  else
    if new.series_id is distinct from old.series_id then
      perform public.refresh_series_cover(old.series_id, old.cover_url);
    end if;
    perform public.refresh_series_cover(new.series_id, old.cover_url);
  end if;
  return null;
end;
$$;
revoke execute on function public.books_refresh_series_cover() from public, anon, authenticated;

create trigger books_series_cover
  after insert or delete or update of cover_url, series_id, volume_number, edition_type, publication_date
  on public.books
  for each row execute function public.books_refresh_series_cover();

-- Backfill existing series.
select public.refresh_series_cover(id) from public.series;

-- -----------------------------------------------------------------------------
-- 3. Batch importer
-- -----------------------------------------------------------------------------
-- Payload:
-- {
--   "publisher": "Phoenix Next",
--   "series": [{
--     "ref": "phoenixnext:series:hachinan", "title": "...", "original_title": "...",
--     "series_type": "light_novel", "genres": ["Fantasy", "Isekai"],
--     "books": [{ "ref": "phoenixnext:LN0048-01", "title": "...", "volume_number": 2,
--                 "item_type": "light_novel", "edition_type": "regular", "edition_notes": null,
--                 "cover_url": "https://...", "synopsis": "...", "price": 270.75,
--                 "currency": "THB", "isbn": "9786164640054", "product_url": "https://...",
--                 "page_count": 320, "authors": ["..."], "illustrators": ["..."], "translators": ["..."] }],
--     "merchandise": [{ "ref": "...", "title": "...", "merch_type": "acrylic_stand",
--                       "description": "...", "image_url": "...", "price": 390, "product_url": "..." }]
--   }]
-- }
--
-- New rows are inserted completely. For rows that already exist (matched by ref), only
-- the publisher-owned facts are refreshed: cover, price, synopsis, product link, ISBN.
-- Titles, volume numbers, editions, series details and genres an admin corrected are kept,
-- unless p_overwrite is true. Credits (authors/illustrators/translators) are only filled in
-- when the book has none of that kind yet.
create or replace function public.import_catalog(p_payload jsonb, p_overwrite boolean default false)
returns jsonb
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pub_id      uuid;
  v_series      jsonb;
  v_item        jsonb;
  v_series_id   uuid;
  v_genre       text;
  v_genre_id    uuid;
  v_slug        text;
  v_inserted    boolean;
  v_book_id     uuid;
  v_kind        text[];
  v_name        text;
  v_pos         bigint;
  v_person_id   uuid;
  v_stats       jsonb := jsonb_build_object(
                  'series_created', 0, 'series_updated', 0,
                  'books_created', 0, 'books_updated', 0,
                  'merchandise_created', 0, 'merchandise_updated', 0,
                  'genres_created', 0);
begin
  if jsonb_typeof(p_payload -> 'series') is distinct from 'array' then
    raise exception 'payload.series must be an array' using errcode = '22023';
  end if;

  -- Publisher (created if missing)
  if public.clean_text(p_payload ->> 'publisher') is not null then
    select id into v_pub_id from public.publishers where lower(name) = lower(btrim(p_payload ->> 'publisher'));
    if v_pub_id is null then
      insert into public.publishers (name) values (btrim(p_payload ->> 'publisher')) returning id into v_pub_id;
    end if;
  end if;

  for v_series in select * from jsonb_array_elements(p_payload -> 'series') loop
    if public.clean_text(v_series ->> 'ref') is null or public.clean_text(v_series ->> 'title') is null then
      raise exception 'every series needs a ref and a title' using errcode = '22023';
    end if;

    insert into public.series as s (source_ref, title, original_title, description, publisher_id, series_type)
    values (
      v_series ->> 'ref',
      left(btrim(v_series ->> 'title'), 300),
      left(public.clean_text(v_series ->> 'original_title'), 300),
      left(public.clean_text(v_series ->> 'description'), 10000),
      v_pub_id,
      coalesce(nullif(v_series ->> 'series_type', ''), 'light_novel')::public.book_format
    )
    on conflict (source_ref) do update set
      title          = case when p_overwrite then excluded.title else s.title end,
      original_title = case when p_overwrite then excluded.original_title
                            else coalesce(s.original_title, excluded.original_title) end,
      description    = case when p_overwrite then excluded.description
                            else coalesce(s.description, excluded.description) end,
      publisher_id   = coalesce(s.publisher_id, excluded.publisher_id),
      series_type    = case when p_overwrite then excluded.series_type else s.series_type end
    returning s.id, (xmax = 0) into v_series_id, v_inserted;

    v_stats := jsonb_set(v_stats, array[case when v_inserted then 'series_created' else 'series_updated' end],
                         to_jsonb((v_stats ->> case when v_inserted then 'series_created' else 'series_updated' end)::int + 1));

    -- Genres: matched by name (case-insensitive), created when missing; only ever added.
    if jsonb_typeof(v_series -> 'genres') = 'array' then
      for v_genre in select btrim(x) from jsonb_array_elements_text(v_series -> 'genres') x where btrim(x) <> '' loop
        select id into v_genre_id from public.genres where lower(name) = lower(v_genre);
        if v_genre_id is null then
          v_slug := left(btrim(regexp_replace(lower(v_genre), '[^a-z0-9]+', '-', 'g'), '-'), 50);
          if v_slug = '' or exists (select 1 from public.genres where slug = v_slug) then
            v_slug := left(coalesce(nullif(v_slug, ''), 'genre'), 40) || '-' || left(md5(v_genre), 6);
          end if;
          insert into public.genres (name, slug) values (left(v_genre, 60), v_slug) returning id into v_genre_id;
          v_stats := jsonb_set(v_stats, '{genres_created}', to_jsonb((v_stats ->> 'genres_created')::int + 1));
        end if;
        insert into public.series_genres (series_id, genre_id) values (v_series_id, v_genre_id)
        on conflict do nothing;
      end loop;
    end if;

    -- Books
    for v_item in select * from jsonb_array_elements(coalesce(v_series -> 'books', '[]'::jsonb)) loop
      insert into public.books as b (
        source_ref, series_id, title, volume_number, item_type, edition_type, edition_notes,
        cover_url, synopsis, price, currency, publisher_id, publisher_product_url, isbn, page_count)
      values (
        v_item ->> 'ref',
        v_series_id,
        left(btrim(v_item ->> 'title'), 300),
        nullif(v_item ->> 'volume_number', '')::numeric,
        coalesce(nullif(v_item ->> 'item_type', ''), 'light_novel')::public.book_format,
        coalesce(nullif(v_item ->> 'edition_type', ''), 'regular')::public.edition_type,
        left(public.clean_text(v_item ->> 'edition_notes'), 1000),
        public.clean_text(v_item ->> 'cover_url'),
        left(public.clean_text(v_item ->> 'synopsis'), 20000),
        nullif(v_item ->> 'price', '')::numeric,
        coalesce(nullif(v_item ->> 'currency', ''), 'THB'),
        v_pub_id,
        public.clean_text(v_item ->> 'product_url'),
        public.clean_text(v_item ->> 'isbn'),
        nullif(v_item ->> 'page_count', '')::integer
      )
      on conflict (source_ref) do update set
        series_id             = case when p_overwrite then excluded.series_id else b.series_id end,
        title                 = case when p_overwrite then excluded.title else b.title end,
        volume_number         = case when p_overwrite then excluded.volume_number else b.volume_number end,
        item_type             = case when p_overwrite then excluded.item_type else b.item_type end,
        edition_type          = case when p_overwrite then excluded.edition_type else b.edition_type end,
        edition_notes         = case when p_overwrite then excluded.edition_notes else b.edition_notes end,
        cover_url             = coalesce(excluded.cover_url, b.cover_url),
        synopsis              = coalesce(excluded.synopsis, b.synopsis),
        price                 = coalesce(excluded.price, b.price),
        currency              = excluded.currency,
        publisher_id          = coalesce(b.publisher_id, excluded.publisher_id),
        publisher_product_url = coalesce(excluded.publisher_product_url, b.publisher_product_url),
        isbn                  = coalesce(b.isbn, excluded.isbn),
        page_count            = coalesce(b.page_count, excluded.page_count)
      returning b.id, (xmax = 0) into v_book_id, v_inserted;

      v_stats := jsonb_set(v_stats, array[case when v_inserted then 'books_created' else 'books_updated' end],
                           to_jsonb((v_stats ->> case when v_inserted then 'books_created' else 'books_updated' end)::int + 1));

      -- Credits: {payload key, people table, junction table, junction column}
      foreach v_kind slice 1 in array array[
        array['authors', 'authors', 'book_authors', 'author_id'],
        array['illustrators', 'illustrators', 'book_illustrators', 'illustrator_id'],
        array['translators', 'translators', 'book_translators', 'translator_id']
      ] loop
        continue when jsonb_typeof(v_item -> v_kind[1]) is distinct from 'array'
                   or jsonb_array_length(v_item -> v_kind[1]) = 0;
        execute format('select exists (select 1 from public.%I where book_id = $1)', v_kind[3])
          into v_inserted using v_book_id;
        continue when v_inserted;  -- already credited (possibly by an admin): keep it
        for v_name, v_pos in
          select left(regexp_replace(btrim(x), '\s+', ' ', 'g'), 160), ord - 1
            from jsonb_array_elements_text(v_item -> v_kind[1]) with ordinality as t(x, ord)
           where btrim(x) <> ''
        loop
          execute format('select id from public.%I where lower(name) = lower($1)', v_kind[2])
            into v_person_id using v_name;
          if v_person_id is null then
            execute format('insert into public.%I (name) values ($1) returning id', v_kind[2])
              into v_person_id using v_name;
          end if;
          execute format('insert into public.%I (book_id, %I, position) values ($1, $2, $3) on conflict do nothing',
                         v_kind[3], v_kind[4])
            using v_book_id, v_person_id, least(v_pos, 32767)::smallint;
        end loop;
      end loop;
    end loop;

    -- Merchandise
    for v_item in select * from jsonb_array_elements(coalesce(v_series -> 'merchandise', '[]'::jsonb)) loop
      insert into public.merchandise as m (
        source_ref, series_id, title, merch_type, description, image_url, price, currency, publisher_id, product_url)
      values (
        v_item ->> 'ref',
        v_series_id,
        left(btrim(v_item ->> 'title'), 300),
        coalesce(nullif(v_item ->> 'merch_type', ''), 'other')::public.merch_type,
        left(public.clean_text(v_item ->> 'description'), 10000),
        public.clean_text(v_item ->> 'image_url'),
        nullif(v_item ->> 'price', '')::numeric,
        coalesce(nullif(v_item ->> 'currency', ''), 'THB'),
        v_pub_id,
        public.clean_text(v_item ->> 'product_url')
      )
      on conflict (source_ref) do update set
        series_id   = case when p_overwrite then excluded.series_id else m.series_id end,
        title       = case when p_overwrite then excluded.title else m.title end,
        merch_type  = case when p_overwrite then excluded.merch_type else m.merch_type end,
        description = coalesce(excluded.description, m.description),
        image_url   = coalesce(excluded.image_url, m.image_url),
        price       = coalesce(excluded.price, m.price),
        currency    = excluded.currency,
        publisher_id = coalesce(m.publisher_id, excluded.publisher_id),
        product_url = coalesce(excluded.product_url, m.product_url)
      returning (xmax = 0) into v_inserted;

      v_stats := jsonb_set(v_stats, array[case when v_inserted then 'merchandise_created' else 'merchandise_updated' end],
                           to_jsonb((v_stats ->> case when v_inserted then 'merchandise_created' else 'merchandise_updated' end)::int + 1));
    end loop;
  end loop;

  return v_stats;
end;
$$;

revoke execute on function public.import_catalog(jsonb, boolean) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.import_catalog(jsonb, boolean) to service_role;
  end if;
end;
$$;
