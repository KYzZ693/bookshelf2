-- =============================================================================
-- Book Shelf :: 0400 :: Views and database functions
--   * series_overview         aggregated series card data
--   * my_collection           flat view of the caller's collection
--   * text_match_score        ranking helper (exact > prefix > contains > fuzzy)
--   * search_catalog          universal search + filters
--   * get_genre_shelves       Netflix-style genre rows
--   * set_collection_status   idempotent Owned / Want / remove
--   * toggle_collection_status
--   * get_collection_stats
--   * admin_save_series / admin_save_book / admin_ensure_person
-- =============================================================================

-- -----------------------------------------------------------------------------
-- series_overview
-- -----------------------------------------------------------------------------
create or replace view public.series_overview
with (security_invoker = true)
as
select
  s.id,
  s.title,
  s.original_title,
  s.description,
  s.cover_url,
  s.series_type,
  s.completion_status,
  s.publisher_id,
  p.name        as publisher_name,
  p.website_url as publisher_website,
  s.created_at,
  s.updated_at,
  coalesce(g.genre_ids, '{}')            as genre_ids,
  coalesce(g.genre_names, '{}')          as genre_names,
  coalesce(g.genre_slugs, '{}')          as genre_slugs,
  coalesce(b.regular_count, 0)::integer  as regular_volume_count,
  coalesce(b.special_count, 0)::integer  as special_volume_count,
  coalesce(m.merch_count, 0)::integer    as merchandise_count,
  b.latest_publication_date,
  coalesce(au.names, '{}')               as author_names,
  coalesce(il.names, '{}')               as illustrator_names,
  coalesce(tr.names, '{}')               as translator_names
from public.series s
left join public.publishers p on p.id = s.publisher_id
left join lateral (
  select array_agg(gn.id order by gn.sort_order, gn.name)   as genre_ids,
         array_agg(gn.name order by gn.sort_order, gn.name) as genre_names,
         array_agg(gn.slug order by gn.sort_order, gn.name) as genre_slugs
  from public.series_genres sg
  join public.genres gn on gn.id = sg.genre_id
  where sg.series_id = s.id
) g on true
left join lateral (
  select count(*) filter (where bk.edition_type = 'regular')  as regular_count,
         count(*) filter (where bk.edition_type <> 'regular') as special_count,
         max(bk.publication_date)                             as latest_publication_date
  from public.books bk
  where bk.series_id = s.id
) b on true
left join lateral (
  select count(*) as merch_count from public.merchandise mm where mm.series_id = s.id
) m on true
left join lateral (
  select array_agg(x.name order by x.n desc, x.name) as names
  from (
    select a.name, count(*) as n
    from public.books bk
    join public.book_authors ba on ba.book_id = bk.id
    join public.authors a on a.id = ba.author_id
    where bk.series_id = s.id
    group by a.name
  ) x
) au on true
left join lateral (
  select array_agg(x.name order by x.n desc, x.name) as names
  from (
    select i.name, count(*) as n
    from public.books bk
    join public.book_illustrators bi on bi.book_id = bk.id
    join public.illustrators i on i.id = bi.illustrator_id
    where bk.series_id = s.id
    group by i.name
  ) x
) il on true
left join lateral (
  select array_agg(x.name order by x.n desc, x.name) as names
  from (
    select t.name, count(*) as n
    from public.books bk
    join public.book_translators bt on bt.book_id = bk.id
    join public.translators t on t.id = bt.translator_id
    where bk.series_id = s.id
    group by t.name
  ) x
) tr on true;

grant select on public.series_overview to anon, authenticated;

-- -----------------------------------------------------------------------------
-- my_collection (only ever returns the caller's rows)
-- -----------------------------------------------------------------------------
create or replace view public.my_collection
with (security_invoker = true)
as
select
  c.id,
  c.user_id,
  c.status,
  c.created_at,
  c.updated_at,
  case when c.book_id is not null then 'book' else 'merchandise' end as item_kind,
  coalesce(c.book_id, c.merchandise_id)                               as item_id,
  coalesce(b.title, m.title)                                          as title,
  s.id                                                                as series_id,
  s.title                                                             as series_title,
  case
    when c.merchandise_id is not null then 'merchandise'
    when b.edition_type <> 'regular' then 'special_edition'
    else b.item_type::text
  end                                                                 as category,
  b.item_type::text                                                   as book_format,
  b.edition_type::text                                                as edition_type,
  m.merch_type::text                                                  as merch_type,
  b.volume_number,
  coalesce(b.cover_url, m.image_url, s.cover_url)                     as image_url,
  coalesce(b.price, m.price)                                          as price,
  coalesce(b.currency, m.currency)                                    as currency,
  pub.name                                                            as publisher_name
from public.user_collections c
left join public.books b on b.id = c.book_id
left join public.merchandise m on m.id = c.merchandise_id
join public.series s on s.id = coalesce(b.series_id, m.series_id)
left join public.publishers pub on pub.id = coalesce(b.publisher_id, m.publisher_id, s.publisher_id)
where c.user_id = auth.uid();

grant select on public.my_collection to authenticated;

-- -----------------------------------------------------------------------------
-- Ranking helper: 1.0 exact, 0.9 prefix, 0.8 substring, else fuzzy (trigram).
-- -----------------------------------------------------------------------------
create or replace function public.text_match_score(p_field text, p_query text)
returns real
language sql
immutable
parallel safe
set search_path = public, extensions
as $$
  select case
    when p_field is null or p_query is null or p_query = '' then 0
    when lower(p_field) = lower(p_query) then 1.0
    when left(lower(p_field), char_length(p_query)) = lower(p_query) then 0.9
    when strpos(lower(p_field), lower(p_query)) > 0 then 0.8
    else greatest(
      extensions.word_similarity(lower(p_query), lower(p_field)),
      extensions.similarity(lower(p_query), lower(p_field))
    ) * 0.7
  end::real
$$;

-- -----------------------------------------------------------------------------
-- Universal search.
--   p_item_types accepts: light_novel, manga, novel, artbook, other,
--                         special_edition, merchandise (union semantics)
--   Groups are AND-ed together; values inside a group are OR-ed.
--   With an empty query and no filters it returns the catalog alphabetically.
-- -----------------------------------------------------------------------------
create or replace function public.search_catalog(
  p_query           text default '',
  p_publisher_ids   uuid[] default null,
  p_item_types      text[] default null,
  p_genre_ids       uuid[] default null,
  p_statuses        public.completion_status[] default null,
  p_collection      public.collection_status[] default null,
  p_author_ids      uuid[] default null,
  p_illustrator_ids uuid[] default null,
  p_translator_ids  uuid[] default null,
  p_limit           integer default 24
)
returns table (
  kind              text,
  id                uuid,
  title             text,
  subtitle          text,
  image_url         text,
  series_id         uuid,
  series_title      text,
  item_type         text,
  edition_type      text,
  volume_number     numeric,
  publisher_name    text,
  completion_status text,
  genre_names       text[],
  price             numeric,
  my_status         text,
  score             real,
  kind_total        bigint
)
language plpgsql
stable
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_q            text := left(lower(btrim(coalesce(p_query, ''))), 100);
  v_has_q        boolean;
  v_pat          text;
  v_tsq          tsquery;
  v_uid          uuid := auth.uid();
  v_limit        integer := least(greatest(coalesce(p_limit, 24), 1), 200);
  v_types_set    boolean := coalesce(cardinality(p_item_types), 0) > 0;
  v_formats      public.book_format[] := '{}';
  v_want_special boolean := false;
  v_want_merch   boolean := true;
  v_people_set   boolean;
  v_min_score    constant real := 0.3;
begin
  v_has_q := char_length(v_q) > 0;
  v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_tsq := case when v_has_q then websearch_to_tsquery('simple', v_q) end;
  perform set_config('pg_trgm.word_similarity_threshold', '0.3', true);
  perform set_config('pg_trgm.similarity_threshold', '0.3', true);

  if coalesce(cardinality(p_publisher_ids), 0) = 0 then p_publisher_ids := null; end if;
  if coalesce(cardinality(p_genre_ids), 0) = 0 then p_genre_ids := null; end if;
  if coalesce(cardinality(p_statuses), 0) = 0 then p_statuses := null; end if;
  if coalesce(cardinality(p_collection), 0) = 0 then p_collection := null; end if;
  if coalesce(cardinality(p_author_ids), 0) = 0 then p_author_ids := null; end if;
  if coalesce(cardinality(p_illustrator_ids), 0) = 0 then p_illustrator_ids := null; end if;
  if coalesce(cardinality(p_translator_ids), 0) = 0 then p_translator_ids := null; end if;
  v_people_set := p_author_ids is not null or p_illustrator_ids is not null or p_translator_ids is not null;

  if v_types_set then
    select coalesce(array_agg(t::public.book_format), '{}')
      into v_formats
      from unnest(p_item_types) as t
     where t in ('light_novel', 'manga', 'novel', 'artbook', 'other');
    v_want_special := 'special_edition' = any (p_item_types);
    v_want_merch := 'merchandise' = any (p_item_types);
  end if;

  return query
  with
  -- People / publishers that match the text query -----------------------------
  mp as (
    select 'author'::text as r, a.id as pid, a.name as pname, public.text_match_score(a.name, v_q) as sc
      from public.authors a
     where v_has_q and (lower(a.name) like v_pat or v_q <% lower(a.name))
    union all
    select 'illustrator', i.id, i.name, public.text_match_score(i.name, v_q)
      from public.illustrators i
     where v_has_q and (lower(i.name) like v_pat or v_q <% lower(i.name))
    union all
    select 'translator', t.id, t.name, public.text_match_score(t.name, v_q)
      from public.translators t
     where v_has_q and (lower(t.name) like v_pat or v_q <% lower(t.name))
  ),
  mpub as (
    select p.id as pid, p.name as pname, public.text_match_score(p.name, v_q) as sc
      from public.publishers p
     where v_has_q and (lower(p.name) like v_pat or v_q <% lower(p.name))
  ),
  -- Best people-match per book
  bps as (
    select x.book_id, max(x.sc) as sc
      from (
        select ba.book_id, mp.sc from mp join public.book_authors ba on mp.r = 'author' and ba.author_id = mp.pid
        union all
        select bi.book_id, mp.sc from mp join public.book_illustrators bi on mp.r = 'illustrator' and bi.illustrator_id = mp.pid
        union all
        select bt.book_id, mp.sc from mp join public.book_translators bt on mp.r = 'translator' and bt.translator_id = mp.pid
      ) x
     group by x.book_id
  ),
  -- Series-level filters shared by every result kind (genre, status) ----------
  s_ok as (
    select s.*
      from public.series s
     where (p_genre_ids is null or exists (
              select 1 from public.series_genres sg
               where sg.series_id = s.id and sg.genre_id = any (p_genre_ids)))
       and (p_statuses is null or s.completion_status = any (p_statuses))
  ),
  -- Books ---------------------------------------------------------------------
  b_cand as (
    select b.id from public.books b where not v_has_q
    union
    select b.id from public.books b
     where v_has_q and (lower(b.title) like v_pat or v_q <% lower(b.title) or b.search_tsv @@ v_tsq
                        or lower(b.isbn) = v_q)
    union
    select b.id from public.books b
      join public.series s on s.id = b.series_id
     where v_has_q and (lower(s.title) like v_pat or v_q <% lower(s.title)
                        or lower(s.original_title) like v_pat or s.search_tsv @@ v_tsq)
    union
    select bps.book_id from bps
    union
    select b.id from public.books b join mpub on mpub.pid = b.publisher_id
  ),
  b_res as (
    select
      b.*,
      s.title as s_title,
      s.completion_status as s_status,
      coalesce(pb.name, ps.name) as pub_name,
      case when not v_has_q then 0::real else greatest(
        public.text_match_score(b.title, v_q),
        case when b.search_tsv @@ v_tsq then 0.75 else 0 end,
        case when lower(b.isbn) = v_q then 1.0 else 0 end,
        public.text_match_score(s.title, v_q) * 0.9,
        public.text_match_score(s.original_title, v_q) * 0.85,
        coalesce(bps.sc, 0) * 0.85,
        public.text_match_score(coalesce(pb.name, ps.name), v_q) * 0.6
      )::real end as sc
    from b_cand c
    join public.books b on b.id = c.id
    join s_ok s on s.id = b.series_id
    left join public.publishers pb on pb.id = b.publisher_id
    left join public.publishers ps on ps.id = s.publisher_id
    left join bps on bps.book_id = b.id
    where (p_publisher_ids is null or coalesce(b.publisher_id, s.publisher_id) = any (p_publisher_ids))
      and (not v_types_set
           or b.item_type = any (v_formats)
           or (v_want_special and b.edition_type <> 'regular'))
      and (p_author_ids is null or exists (
             select 1 from public.book_authors x where x.book_id = b.id and x.author_id = any (p_author_ids)))
      and (p_illustrator_ids is null or exists (
             select 1 from public.book_illustrators x where x.book_id = b.id and x.illustrator_id = any (p_illustrator_ids)))
      and (p_translator_ids is null or exists (
             select 1 from public.book_translators x where x.book_id = b.id and x.translator_id = any (p_translator_ids)))
      and (p_collection is null or (v_uid is not null and exists (
             select 1 from public.user_collections uc
              where uc.user_id = v_uid and uc.book_id = b.id and uc.status = any (p_collection))))
  ),
  -- Series --------------------------------------------------------------------
  s_cand as (
    select s.id from public.series s where not v_has_q
    union
    select s.id from public.series s
     where v_has_q and (lower(s.title) like v_pat or v_q <% lower(s.title)
                        or lower(s.original_title) like v_pat or v_q <% lower(s.original_title)
                        or s.search_tsv @@ v_tsq)
    union
    select b.series_id from bps join public.books b on b.id = bps.book_id
    union
    select s.id from public.series s join mpub on mpub.pid = s.publisher_id
  ),
  s_res as (
    select
      s.*,
      p.name as pub_name,
      case when not v_has_q then 0::real else greatest(
        public.text_match_score(s.title, v_q),
        public.text_match_score(s.original_title, v_q) * 0.95,
        case when s.search_tsv @@ v_tsq then 0.75 else 0 end,
        coalesce((select max(bps.sc) from bps join public.books b on b.id = bps.book_id
                   where b.series_id = s.id), 0) * 0.85,
        public.text_match_score(p.name, v_q) * 0.6
      )::real end as sc
    from s_cand c
    join s_ok s on s.id = c.id
    left join public.publishers p on p.id = s.publisher_id
    where (p_publisher_ids is null or s.publisher_id = any (p_publisher_ids)
           or exists (select 1 from public.books b
                       where b.series_id = s.id and b.publisher_id = any (p_publisher_ids)))
      and (not v_types_set or s.series_type = any (v_formats))
      and (not v_people_set or exists (
             select 1 from public.books b
              where b.series_id = s.id
                and (p_author_ids is null or exists (
                       select 1 from public.book_authors x where x.book_id = b.id and x.author_id = any (p_author_ids)))
                and (p_illustrator_ids is null or exists (
                       select 1 from public.book_illustrators x where x.book_id = b.id and x.illustrator_id = any (p_illustrator_ids)))
                and (p_translator_ids is null or exists (
                       select 1 from public.book_translators x where x.book_id = b.id and x.translator_id = any (p_translator_ids)))))
      and (p_collection is null or (v_uid is not null and exists (
             select 1
               from public.user_collections uc
               left join public.books b on b.id = uc.book_id
               left join public.merchandise m on m.id = uc.merchandise_id
              where uc.user_id = v_uid
                and uc.status = any (p_collection)
                and coalesce(b.series_id, m.series_id) = s.id)))
  ),
  -- Merchandise ---------------------------------------------------------------
  m_res as (
    select
      m.*,
      s.title as s_title,
      s.completion_status as s_status,
      coalesce(pm.name, ps.name) as pub_name,
      case when not v_has_q then 0::real else greatest(
        public.text_match_score(m.title, v_q),
        public.text_match_score(s.title, v_q) * 0.85,
        public.text_match_score(coalesce(pm.name, ps.name), v_q) * 0.6
      )::real end as sc
    from public.merchandise m
    join s_ok s on s.id = m.series_id
    left join public.publishers pm on pm.id = m.publisher_id
    left join public.publishers ps on ps.id = s.publisher_id
    where v_want_merch
      and not v_people_set
      and (not v_has_q
           or lower(m.title) like v_pat or v_q <% lower(m.title)
           or lower(s.title) like v_pat or v_q <% lower(s.title)
           or exists (select 1 from mpub where mpub.pid = coalesce(m.publisher_id, s.publisher_id)))
      and (p_publisher_ids is null or coalesce(m.publisher_id, s.publisher_id) = any (p_publisher_ids))
      and (p_collection is null or (v_uid is not null and exists (
             select 1 from public.user_collections uc
              where uc.user_id = v_uid and uc.merchandise_id = m.id and uc.status = any (p_collection))))
  ),
  results as (
    select 'series'::text as k, s.id as rid, s.title as rtitle, s.original_title as rsub,
           s.cover_url as rimg, s.id as rsid, s.title as rstitle, s.series_type::text as rtype,
           null::text as redition, null::numeric as rvol, s.pub_name as rpub,
           s.completion_status::text as rstatus,
           (select array_agg(g.name order by g.sort_order, g.name)
              from public.series_genres sg join public.genres g on g.id = sg.genre_id
             where sg.series_id = s.id) as rgenres,
           null::numeric as rprice, null::text as rmine, s.sc as rscore,
           lower(s.title) as o1, null::numeric as o2
      from s_res s
     where not v_has_q or s.sc >= v_min_score
    union all
    select 'book', b.id, b.title, b.s_title, b.cover_url, b.series_id, b.s_title, b.item_type::text,
           b.edition_type::text, b.volume_number, b.pub_name, b.s_status::text, null::text[],
           b.price,
           (select uc.status::text from public.user_collections uc where uc.user_id = v_uid and uc.book_id = b.id),
           b.sc, lower(b.s_title), b.volume_number
      from b_res b
     where not v_has_q or b.sc >= v_min_score
    union all
    select 'merchandise', m.id, m.title, m.s_title, m.image_url, m.series_id, m.s_title, m.merch_type::text,
           null, null, m.pub_name, m.s_status::text, null::text[], m.price,
           (select uc.status::text from public.user_collections uc where uc.user_id = v_uid and uc.merchandise_id = m.id),
           m.sc, lower(m.s_title), null
      from m_res m
     where not v_has_q or m.sc >= v_min_score
    union all
    select mp.r, mp.pid, mp.pname,
           (case mp.r
              when 'author' then (select count(*) from public.book_authors x where x.author_id = mp.pid)
              when 'illustrator' then (select count(*) from public.book_illustrators x where x.illustrator_id = mp.pid)
              else (select count(*) from public.book_translators x where x.translator_id = mp.pid)
            end)::text,
           null, null, null, mp.r, null, null, null, null, null, null, null,
           mp.sc, lower(mp.pname), null
      from mp
     where mp.sc >= v_min_score
    union all
    select 'publisher', mpub.pid, mpub.pname,
           ((select count(*) from public.series s where s.publisher_id = mpub.pid))::text,
           (select p.logo_url from public.publishers p where p.id = mpub.pid),
           null, null, null, null, null, null, null, null, null, null,
           mpub.sc, lower(mpub.pname), null
      from mpub
     where mpub.sc >= v_min_score
  ),
  ranked as (
    select r.*,
           row_number() over (partition by r.k order by r.rscore desc, r.o1, r.o2 nulls last, lower(r.rtitle)) as rn,
           count(*) over (partition by r.k) as total
      from results r
  )
  select r.k, r.rid, r.rtitle, r.rsub, r.rimg, r.rsid, r.rstitle, r.rtype, r.redition, r.rvol,
         r.rpub, r.rstatus, r.rgenres, r.rprice, r.rmine, r.rscore, r.total
    from ranked r
   where r.rn <= v_limit
   order by r.k, r.rn;
end;
$$;

grant execute on function public.search_catalog(
  text, uuid[], text[], uuid[], public.completion_status[], public.collection_status[],
  uuid[], uuid[], uuid[], integer
) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Netflix-style shelves: one row per genre (plus "Uncategorized"), each holding
-- up to p_per_genre series ordered by the chosen secondary dimension and then by
-- Author -> Translator -> Publisher -> Illustrator -> Title.
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
  with base as (
    select g.id as gid, g.name as gname, g.slug as gslug, g.sort_order as gsort, so as srow
      from public.genres g
      join public.series_genres sg on sg.genre_id = g.id
      join public.series_overview so on so.id = sg.series_id
    union all
    select null::uuid, 'Uncategorized', 'uncategorized', 2147483647, so
      from public.series_overview so
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

grant execute on function public.get_genre_shelves(integer, text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Collection management
-- -----------------------------------------------------------------------------

-- Sets the caller's status for one item. NULL removes the item from the collection.
create or replace function public.set_collection_status(
  p_book_id        uuid default null,
  p_merchandise_id uuid default null,
  p_status         public.collection_status default null
)
returns public.collection_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'You must be signed in to manage your collection' using errcode = '28000';
  end if;
  if num_nonnulls(p_book_id, p_merchandise_id) <> 1 then
    raise exception 'Exactly one of p_book_id or p_merchandise_id is required' using errcode = '22023';
  end if;

  if p_status is null then
    delete from public.user_collections uc
     where uc.user_id = v_uid
       and (uc.book_id = p_book_id or uc.merchandise_id = p_merchandise_id);
    return null;
  end if;

  if p_book_id is not null then
    insert into public.user_collections (user_id, book_id, status)
    values (v_uid, p_book_id, p_status)
    on conflict (user_id, book_id) do update set status = excluded.status;
  else
    insert into public.user_collections (user_id, merchandise_id, status)
    values (v_uid, p_merchandise_id, p_status)
    on conflict (user_id, merchandise_id) do update set status = excluded.status;
  end if;

  return p_status;
end;
$$;

-- Clicking the active status removes it; clicking the other status switches.
create or replace function public.toggle_collection_status(
  p_book_id        uuid default null,
  p_merchandise_id uuid default null,
  p_status         public.collection_status default 'owned'
)
returns public.collection_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current public.collection_status;
begin
  select uc.status into v_current
    from public.user_collections uc
   where uc.user_id = auth.uid()
     and (uc.book_id = p_book_id or uc.merchandise_id = p_merchandise_id);

  return public.set_collection_status(
    p_book_id, p_merchandise_id,
    case when v_current = p_status then null else p_status end);
end;
$$;

grant execute on function public.set_collection_status(uuid, uuid, public.collection_status) to authenticated;
grant execute on function public.toggle_collection_status(uuid, uuid, public.collection_status) to authenticated;
revoke execute on function public.set_collection_status(uuid, uuid, public.collection_status) from public, anon;
revoke execute on function public.toggle_collection_status(uuid, uuid, public.collection_status) from public, anon;

-- Statistics computed from the caller's real collection rows.
create or replace function public.get_collection_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with uc as (
    select c.status,
           coalesce(b.series_id, m.series_id) as series_id,
           case
             when c.merchandise_id is not null then 'merchandise'
             when b.edition_type <> 'regular' then 'special_edition'
             else b.item_type::text
           end as category,
           coalesce(b.price, m.price) as price
      from public.user_collections c
      left join public.books b on b.id = c.book_id
      left join public.merchandise m on m.id = c.merchandise_id
     where c.user_id = auth.uid()
  ),
  owned_regular as (
    select b.series_id, count(*) as n
      from public.user_collections c
      join public.books b on b.id = c.book_id
     where c.user_id = auth.uid() and c.status = 'owned' and b.edition_type = 'regular'
     group by b.series_id
  ),
  series_regular as (
    select b.series_id, count(*) as n
      from public.books b
     where b.edition_type = 'regular'
       and b.series_id in (select o.series_id from owned_regular o)
     group by b.series_id
  )
  select jsonb_build_object(
    'owned_count',       (select count(*) from uc where uc.status = 'owned'),
    'want_count',        (select count(*) from uc where uc.status = 'want'),
    'series_collected',  (select count(distinct uc.series_id) from uc where uc.status = 'owned'),
    'series_completed',  (select count(*) from owned_regular o join series_regular r using (series_id) where o.n >= r.n),
    'finished_series_owned', (select count(distinct uc.series_id) from uc
                                join public.series s on s.id = uc.series_id
                               where uc.status = 'owned' and s.completion_status = 'completed'),
    'owned_value',       (select coalesce(sum(uc.price), 0) from uc where uc.status = 'owned'),
    'want_value',        (select coalesce(sum(uc.price), 0) from uc where uc.status = 'want'),
    'owned_by_type',     (select coalesce(jsonb_object_agg(t.category, t.n), '{}'::jsonb)
                            from (select uc.category, count(*) as n from uc where uc.status = 'owned' group by uc.category) t),
    'want_by_type',      (select coalesce(jsonb_object_agg(t.category, t.n), '{}'::jsonb)
                            from (select uc.category, count(*) as n from uc where uc.status = 'want' group by uc.category) t)
  )
$$;

grant execute on function public.get_collection_stats() to authenticated;
revoke execute on function public.get_collection_stats() from public, anon;

-- -----------------------------------------------------------------------------
-- Admin helpers (SECURITY INVOKER: RLS still requires is_admin() for writes)
-- -----------------------------------------------------------------------------

-- Find-or-create a person by name. p_role: author | illustrator | translator
create or replace function public.admin_ensure_person(p_role text, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;
  if char_length(v_name) = 0 then
    raise exception 'Name is required' using errcode = '22023';
  end if;

  case p_role
    when 'author' then
      select a.id into v_id from public.authors a where lower(a.name) = lower(v_name);
      if v_id is null then insert into public.authors (name) values (v_name) returning id into v_id; end if;
    when 'illustrator' then
      select a.id into v_id from public.illustrators a where lower(a.name) = lower(v_name);
      if v_id is null then insert into public.illustrators (name) values (v_name) returning id into v_id; end if;
    when 'translator' then
      select a.id into v_id from public.translators a where lower(a.name) = lower(v_name);
      if v_id is null then insert into public.translators (name) values (v_name) returning id into v_id; end if;
    else
      raise exception 'Unknown role %', p_role using errcode = '22023';
  end case;
  return v_id;
end;
$$;

-- Insert or update a series together with its genres in one transaction.
create or replace function public.admin_save_series(p_series jsonb, p_genre_ids uuid[] default '{}')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_series ->> 'id', '')::uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.series (title, original_title, description, cover_url, publisher_id, series_type, completion_status)
    values (
      p_series ->> 'title',
      p_series ->> 'original_title',
      p_series ->> 'description',
      p_series ->> 'cover_url',
      nullif(p_series ->> 'publisher_id', '')::uuid,
      coalesce(nullif(p_series ->> 'series_type', ''), 'light_novel')::public.book_format,
      coalesce(nullif(p_series ->> 'completion_status', ''), 'ongoing')::public.completion_status
    )
    returning id into v_id;
  else
    update public.series s set
      title             = p_series ->> 'title',
      original_title    = p_series ->> 'original_title',
      description       = p_series ->> 'description',
      cover_url         = p_series ->> 'cover_url',
      publisher_id      = nullif(p_series ->> 'publisher_id', '')::uuid,
      series_type       = coalesce(nullif(p_series ->> 'series_type', ''), 'light_novel')::public.book_format,
      completion_status = coalesce(nullif(p_series ->> 'completion_status', ''), 'ongoing')::public.completion_status
    where s.id = v_id;
    if not found then
      raise exception 'Series % not found', v_id using errcode = 'P0002';
    end if;
  end if;

  delete from public.series_genres sg
   where sg.series_id = v_id and not (sg.genre_id = any (coalesce(p_genre_ids, '{}')));
  insert into public.series_genres (series_id, genre_id)
  select v_id, g from unnest(coalesce(p_genre_ids, '{}')) as g
  on conflict do nothing;

  return v_id;
end;
$$;

-- Insert or update a book together with its credited people in one transaction.
create or replace function public.admin_save_book(
  p_book            jsonb,
  p_author_ids      uuid[] default '{}',
  p_illustrator_ids uuid[] default '{}',
  p_translator_ids  uuid[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_book ->> 'id', '')::uuid;
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges required' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.books (
      series_id, title, volume_number, item_type, edition_type, edition_notes, cover_url, synopsis,
      price, currency, publisher_id, publisher_product_url, publication_date, isbn, page_count)
    values (
      (p_book ->> 'series_id')::uuid,
      p_book ->> 'title',
      nullif(p_book ->> 'volume_number', '')::numeric,
      coalesce(nullif(p_book ->> 'item_type', ''), 'light_novel')::public.book_format,
      coalesce(nullif(p_book ->> 'edition_type', ''), 'regular')::public.edition_type,
      p_book ->> 'edition_notes',
      p_book ->> 'cover_url',
      p_book ->> 'synopsis',
      nullif(p_book ->> 'price', '')::numeric,
      coalesce(nullif(p_book ->> 'currency', ''), 'THB'),
      nullif(p_book ->> 'publisher_id', '')::uuid,
      p_book ->> 'publisher_product_url',
      nullif(p_book ->> 'publication_date', '')::date,
      p_book ->> 'isbn',
      nullif(p_book ->> 'page_count', '')::integer
    )
    returning id into v_id;
  else
    update public.books b set
      series_id             = (p_book ->> 'series_id')::uuid,
      title                 = p_book ->> 'title',
      volume_number         = nullif(p_book ->> 'volume_number', '')::numeric,
      item_type             = coalesce(nullif(p_book ->> 'item_type', ''), 'light_novel')::public.book_format,
      edition_type          = coalesce(nullif(p_book ->> 'edition_type', ''), 'regular')::public.edition_type,
      edition_notes         = p_book ->> 'edition_notes',
      cover_url             = p_book ->> 'cover_url',
      synopsis              = p_book ->> 'synopsis',
      price                 = nullif(p_book ->> 'price', '')::numeric,
      currency              = coalesce(nullif(p_book ->> 'currency', ''), 'THB'),
      publisher_id          = nullif(p_book ->> 'publisher_id', '')::uuid,
      publisher_product_url = p_book ->> 'publisher_product_url',
      publication_date      = nullif(p_book ->> 'publication_date', '')::date,
      isbn                  = p_book ->> 'isbn',
      page_count            = nullif(p_book ->> 'page_count', '')::integer
    where b.id = v_id;
    if not found then
      raise exception 'Book % not found', v_id using errcode = 'P0002';
    end if;
  end if;

  delete from public.book_authors where book_id = v_id;
  insert into public.book_authors (book_id, author_id, position)
  select v_id, a, (o - 1)::smallint from unnest(coalesce(p_author_ids, '{}')) with ordinality as t(a, o)
  on conflict do nothing;

  delete from public.book_illustrators where book_id = v_id;
  insert into public.book_illustrators (book_id, illustrator_id, position)
  select v_id, a, (o - 1)::smallint from unnest(coalesce(p_illustrator_ids, '{}')) with ordinality as t(a, o)
  on conflict do nothing;

  delete from public.book_translators where book_id = v_id;
  insert into public.book_translators (book_id, translator_id, position)
  select v_id, a, (o - 1)::smallint from unnest(coalesce(p_translator_ids, '{}')) with ordinality as t(a, o)
  on conflict do nothing;

  return v_id;
end;
$$;

grant execute on function public.admin_ensure_person(text, text) to authenticated;
grant execute on function public.admin_save_series(jsonb, uuid[]) to authenticated;
grant execute on function public.admin_save_book(jsonb, uuid[], uuid[], uuid[]) to authenticated;
revoke execute on function public.admin_ensure_person(text, text) from public, anon;
revoke execute on function public.admin_save_series(jsonb, uuid[]) from public, anon;
revoke execute on function public.admin_save_book(jsonb, uuid[], uuid[], uuid[]) from public, anon;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
