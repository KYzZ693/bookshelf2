-- =============================================================================
-- Book Shelf :: 0100 :: Catalog schema
-- Extensions, enums, shared helpers and the normalized catalog tables.
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.book_format as enum ('light_novel', 'manga', 'novel', 'artbook', 'other');
create type public.edition_type as enum ('regular', 'special', 'limited', 'exclusive', 'boxset', 'other');
create type public.merch_type as enum (
  'acrylic_stand', 'poster', 'keychain', 'figure', 'art_collection',
  'postcard', 'bookmark', 'tapestry', 'other'
);
create type public.completion_status as enum ('ongoing', 'completed', 'hiatus', 'cancelled');
create type public.collection_status as enum ('owned', 'want');
create type public.app_role as enum ('admin');

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Trims text columns and turns blank strings into NULL so validation is consistent
-- no matter which client wrote the row.
create or replace function public.clean_text(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(btrim(p), '')
$$;

-- Lightweight URL validator used by check constraints.
create or replace function public.is_http_url(p text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p is null or (p ~* '^https?://[^\s/$.?#].[^\s]*$' and char_length(p) <= 2048)
$$;

-- -----------------------------------------------------------------------------
-- Publishers & people
-- -----------------------------------------------------------------------------
create table public.publishers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  logo_url    text check (public.is_http_url(logo_url)),
  website_url text check (public.is_http_url(website_url)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index publishers_name_key on public.publishers (lower(name));
create index publishers_name_trgm on public.publishers using gin (lower(name) extensions.gin_trgm_ops);

create table public.authors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index authors_name_key on public.authors (lower(name));
create index authors_name_trgm on public.authors using gin (lower(name) extensions.gin_trgm_ops);

create table public.illustrators (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index illustrators_name_key on public.illustrators (lower(name));
create index illustrators_name_trgm on public.illustrators using gin (lower(name) extensions.gin_trgm_ops);

create table public.translators (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index translators_name_key on public.translators (lower(name));
create index translators_name_trgm on public.translators using gin (lower(name) extensions.gin_trgm_ops);

create table public.genres (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 60),
  slug       text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index genres_name_key on public.genres (lower(name));
create unique index genres_slug_key on public.genres (slug);

-- -----------------------------------------------------------------------------
-- Series
-- -----------------------------------------------------------------------------
create table public.series (
  id                uuid primary key default gen_random_uuid(),
  title             text not null check (char_length(title) between 1 and 300),
  original_title    text check (original_title is null or char_length(original_title) <= 300),
  description       text check (description is null or char_length(description) <= 10000),
  cover_url         text check (public.is_http_url(cover_url)),
  publisher_id      uuid references public.publishers (id) on delete set null,
  series_type       public.book_format not null default 'light_novel',
  completion_status public.completion_status not null default 'ongoing',
  search_tsv        tsvector generated always as (
                      to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(original_title, ''))
                    ) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index series_publisher_idx on public.series (publisher_id);
create index series_type_idx on public.series (series_type);
create index series_status_idx on public.series (completion_status);
create index series_created_idx on public.series (created_at desc);
create index series_title_trgm on public.series using gin (lower(title) extensions.gin_trgm_ops);
create index series_original_title_trgm on public.series using gin (lower(original_title) extensions.gin_trgm_ops);
create index series_tsv_idx on public.series using gin (search_tsv);

create table public.series_genres (
  series_id uuid not null references public.series (id) on delete cascade,
  genre_id  uuid not null references public.genres (id) on delete cascade,
  primary key (series_id, genre_id)
);
create index series_genres_genre_idx on public.series_genres (genre_id);

-- -----------------------------------------------------------------------------
-- Books (regular volumes and special editions)
-- -----------------------------------------------------------------------------
create table public.books (
  id                    uuid primary key default gen_random_uuid(),
  series_id             uuid not null references public.series (id) on delete cascade,
  title                 text not null check (char_length(title) between 1 and 300),
  volume_number         numeric(6, 1) check (volume_number is null or volume_number >= 0),
  item_type             public.book_format not null default 'light_novel',
  edition_type          public.edition_type not null default 'regular',
  edition_notes         text check (edition_notes is null or char_length(edition_notes) <= 1000),
  cover_url             text check (public.is_http_url(cover_url)),
  synopsis              text check (synopsis is null or char_length(synopsis) <= 20000),
  price                 numeric(10, 2) check (price is null or price >= 0),
  currency              text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  publisher_id          uuid references public.publishers (id) on delete set null,
  publisher_product_url text check (public.is_http_url(publisher_product_url)),
  publication_date      date,
  isbn                  text check (isbn is null or isbn ~ '^[0-9Xx-]{10,17}$'),
  page_count            integer check (page_count is null or page_count between 1 and 20000),
  search_tsv            tsvector generated always as (
                          to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(isbn, ''))
                        ) stored,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index books_series_order_idx on public.books (series_id, edition_type, volume_number nulls last, publication_date);
create index books_publisher_idx on public.books (publisher_id);
create index books_item_type_idx on public.books (item_type);
create index books_edition_idx on public.books (edition_type);
create index books_created_idx on public.books (created_at desc);
create index books_title_trgm on public.books using gin (lower(title) extensions.gin_trgm_ops);
create index books_tsv_idx on public.books using gin (search_tsv);

create table public.book_authors (
  book_id   uuid not null references public.books (id) on delete cascade,
  author_id uuid not null references public.authors (id) on delete cascade,
  position  smallint not null default 0,
  primary key (book_id, author_id)
);
create index book_authors_author_idx on public.book_authors (author_id);

create table public.book_illustrators (
  book_id        uuid not null references public.books (id) on delete cascade,
  illustrator_id uuid not null references public.illustrators (id) on delete cascade,
  position       smallint not null default 0,
  primary key (book_id, illustrator_id)
);
create index book_illustrators_illustrator_idx on public.book_illustrators (illustrator_id);

create table public.book_translators (
  book_id       uuid not null references public.books (id) on delete cascade,
  translator_id uuid not null references public.translators (id) on delete cascade,
  position      smallint not null default 0,
  primary key (book_id, translator_id)
);
create index book_translators_translator_idx on public.book_translators (translator_id);

-- -----------------------------------------------------------------------------
-- Merchandise
-- -----------------------------------------------------------------------------
create table public.merchandise (
  id           uuid primary key default gen_random_uuid(),
  series_id    uuid not null references public.series (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 300),
  merch_type   public.merch_type not null default 'other',
  description  text check (description is null or char_length(description) <= 10000),
  image_url    text check (public.is_http_url(image_url)),
  price        numeric(10, 2) check (price is null or price >= 0),
  currency     text not null default 'THB' check (currency ~ '^[A-Z]{3}$'),
  publisher_id uuid references public.publishers (id) on delete set null,
  product_url  text check (public.is_http_url(product_url)),
  release_date date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index merchandise_series_idx on public.merchandise (series_id, merch_type);
create index merchandise_publisher_idx on public.merchandise (publisher_id);
create index merchandise_title_trgm on public.merchandise using gin (lower(title) extensions.gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- Normalisation triggers: trim text, blank -> NULL (runs before CHECKs)
-- -----------------------------------------------------------------------------
create or replace function public.normalize_catalog_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  case tg_table_name
    when 'publishers' then
      new.name := btrim(new.name);
      new.logo_url := public.clean_text(new.logo_url);
      new.website_url := public.clean_text(new.website_url);
    when 'authors', 'illustrators', 'translators' then
      new.name := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
    when 'genres' then
      new.name := btrim(new.name);
      new.slug := lower(btrim(new.slug));
    when 'series' then
      new.title := btrim(new.title);
      new.original_title := public.clean_text(new.original_title);
      new.description := public.clean_text(new.description);
      new.cover_url := public.clean_text(new.cover_url);
    when 'books' then
      new.title := btrim(new.title);
      new.edition_notes := public.clean_text(new.edition_notes);
      new.synopsis := public.clean_text(new.synopsis);
      new.cover_url := public.clean_text(new.cover_url);
      new.publisher_product_url := public.clean_text(new.publisher_product_url);
      new.isbn := public.clean_text(new.isbn);
      new.currency := upper(btrim(new.currency));
    when 'merchandise' then
      new.title := btrim(new.title);
      new.description := public.clean_text(new.description);
      new.image_url := public.clean_text(new.image_url);
      new.product_url := public.clean_text(new.product_url);
      new.currency := upper(btrim(new.currency));
    else
      null;
  end case;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'publishers', 'authors', 'illustrators', 'translators', 'genres',
    'series', 'books', 'merchandise'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.normalize_catalog_row()',
      t || '_normalize', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_updated_at', t);
  end loop;
end;
$$;
