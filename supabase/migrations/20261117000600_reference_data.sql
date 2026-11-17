-- =============================================================================
-- Book Shelf :: 0600 :: Initial reference data (publishers and genres)
-- Safe to re-run: existing rows are left untouched.
-- =============================================================================

insert into public.publishers (name)
values
  ('Phoenix Next'),
  ('Luckpim'),
  ('Animag'),
  ('Zenshu'),
  ('Vibulkij'),
  ('DEX'),
  ('Siam Inter Comics'),
  ('First Page Pro'),
  ('Gift Book'),
  ('Bongkoch'),
  ('Burapat'),
  ('Punica')
on conflict do nothing;

insert into public.genres (name, slug, sort_order)
values
  ('Fantasy',         'fantasy',         10),
  ('Romance',         'romance',         20),
  ('Mystery',         'mystery',         30),
  ('Detective',       'detective',       40),
  ('Action',          'action',          50),
  ('Adventure',       'adventure',       60),
  ('Comedy',          'comedy',          70),
  ('Drama',           'drama',           80),
  ('Science Fiction', 'science-fiction', 90),
  ('Horror',          'horror',          100),
  ('Slice of Life',   'slice-of-life',   110),
  ('Isekai',          'isekai',          120),
  ('School',          'school',          130),
  ('Psychological',   'psychological',   140),
  ('Supernatural',    'supernatural',    150),
  ('Historical',      'historical',      160)
on conflict do nothing;
