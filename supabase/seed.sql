-- =============================================================================
-- Book Shelf :: OPTIONAL demo catalog
-- Fictional series used to try the app before entering a real catalog.
-- Run after the migrations (SQL editor, or `supabase db reset` runs it locally).
-- Remove later with:  delete from public.series where description like '[demo]%';
-- =============================================================================

do $$
declare
  v_pub_phoenix uuid := (select id from public.publishers where name = 'Phoenix Next');
  v_pub_luckpim uuid := (select id from public.publishers where name = 'Luckpim');
  v_pub_dex     uuid := (select id from public.publishers where name = 'DEX');
  v_pub_siam    uuid := (select id from public.publishers where name = 'Siam Inter Comics');
  v_pub_animag  uuid := (select id from public.publishers where name = 'Animag');
  v_series uuid;
  v_book   uuid;
  v_author uuid;
  v_illus  uuid;
  v_trans  uuid;
  i int;
  rec record;
begin
  if exists (select 1 from public.series where description like '[demo]%') then
    raise notice 'Demo data already present, skipping';
    return;
  end if;

  for rec in
    select * from (values
      ('The Lantern Keeper of Ashvale',  'light_novel', 'ongoing',   v_pub_phoenix, 'Mira Tsukishiro',  'Haru Ren',        'Ploy S.',     7, array['fantasy','adventure'],            'A young archivist inherits a lantern that remembers every road it has lit.'),
      ('Clockwork Tea at Half Past Never','light_novel', 'completed', v_pub_luckpim, 'Sora Kanzaki',     'Yui Morimoto',    'Nok W.',      5, array['mystery','fantasy','comedy'],     'Tea-shop detective work in a city where clocks disagree about the time.'),
      ('Paper Moons Over Kirishima',     'manga',       'ongoing',   v_pub_siam,    'Aki Hoshino',      'Aki Hoshino',     'Ton P.',      9, array['romance','slice-of-life','school'],'Two rival origami club captains fold their way toward an unexpected truce.'),
      ('Signal From the Glass Orbit',    'novel',       'hiatus',    v_pub_dex,     'Elena Varga',      null,              'Fah K.',      3, array['science-fiction','psychological'],'A lone relay station receives messages from a ship that left a century ago.'),
      ('The Quiet Hours of Inspector Rue','novel',      'completed', v_pub_animag,  'Theo Marchetti',   null,              'Ploy S.',     4, array['detective','mystery','drama'],    'Cold cases solved only between midnight and dawn.'),
      ('Bladesong of the Ninth Gate',    'light_novel', 'ongoing',   v_pub_phoenix, 'Ren Kurogane',     'Haru Ren',        'Bank T.',     6, array['action','fantasy','isekai'],      'Summoned as a swordsmith rather than a hero, Kai forges his own legend.'),
      ('Whispers in the Lacquer Hall',   'manga',       'cancelled', v_pub_siam,    'Mio Shirakawa',    'Kei Asano',       'Ton P.',      2, array['horror','supernatural'],          'An old music hall where every instrument still plays at night.'),
      ('Atlas of Small Kindnesses',      'artbook',     'completed', v_pub_luckpim, 'Various Artists',  'Yui Morimoto',    null,          1, array['slice-of-life'],                  'Illustrations celebrating ordinary days.')
    ) as t(title, stype, status, pub, author, illus, trans, vols, genres, blurb)
  loop
    insert into public.series (title, description, publisher_id, series_type, completion_status)
    values (rec.title, '[demo] ' || rec.blurb, rec.pub, rec.stype::public.book_format, rec.status::public.completion_status)
    returning id into v_series;

    insert into public.series_genres (series_id, genre_id)
    select v_series, g.id from public.genres g where g.slug = any (rec.genres);

    v_author := null; v_illus := null; v_trans := null;
    select id into v_author from public.authors where lower(name) = lower(rec.author);
    if v_author is null then insert into public.authors (name) values (rec.author) returning id into v_author; end if;
    if rec.illus is not null then
      select id into v_illus from public.illustrators where lower(name) = lower(rec.illus);
      if v_illus is null then insert into public.illustrators (name) values (rec.illus) returning id into v_illus; end if;
    end if;
    if rec.trans is not null then
      select id into v_trans from public.translators where lower(name) = lower(rec.trans);
      if v_trans is null then insert into public.translators (name) values (rec.trans) returning id into v_trans; end if;
    end if;

    for i in 1 .. rec.vols loop
      insert into public.books (series_id, title, volume_number, item_type, edition_type, synopsis, price, publisher_id, publication_date)
      values (
        v_series,
        rec.title || case when rec.vols > 1 then ' Vol. ' || i else '' end,
        case when rec.vols > 1 then i end,
        rec.stype::public.book_format,
        'regular',
        'Volume ' || i || ' of ' || rec.title || '.' || E'\n\n' || rec.blurb || E'\n\n' ||
          'This is demo synopsis text so you can see how longer descriptions and paragraph breaks are displayed.',
        case rec.stype when 'manga' then 95 when 'artbook' then 690 else 285 end + (i % 3) * 10,
        rec.pub,
        date '2023-01-15' + (i * 75)
      )
      returning id into v_book;
      insert into public.book_authors (book_id, author_id) values (v_book, v_author);
      if v_illus is not null then insert into public.book_illustrators (book_id, illustrator_id) values (v_book, v_illus); end if;
      if v_trans is not null then insert into public.book_translators (book_id, translator_id) values (v_book, v_trans); end if;
    end loop;

    if rec.vols >= 5 then
      insert into public.books (series_id, title, volume_number, item_type, edition_type, edition_notes, synopsis, price, publisher_id, publication_date)
      values (v_series, rec.title || ' Vol. 1 Special Set', 1, rec.stype::public.book_format, 'special',
              'Includes a slipcase, two postcards and an acrylic bookmark.',
              'A special release of volume 1 with bonus extras.', 590, rec.pub, date '2023-02-01')
      returning id into v_book;
      insert into public.book_authors (book_id, author_id) values (v_book, v_author);

      insert into public.merchandise (series_id, title, merch_type, description, price, publisher_id)
      values
        (v_series, rec.title || ' Acrylic Stand', 'acrylic_stand', 'Double-sided acrylic stand, 15 cm.', 350, rec.pub),
        (v_series, rec.title || ' B2 Poster', 'poster', 'Folded B2 poster featuring the volume 1 cover art.', 150, rec.pub);
    end if;
  end loop;
end;
$$;
