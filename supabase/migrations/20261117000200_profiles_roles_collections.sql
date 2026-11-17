-- =============================================================================
-- Book Shelf :: 0200 :: Profiles, roles and personal collections
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users, created automatically by trigger)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name   text check (display_name is null or char_length(display_name) between 1 and 50),
  avatar_url     text check (public.is_http_url(avatar_url)),
  bio            text check (bio is null or char_length(bio) <= 500),
  accent_color   text not null default 'emerald'
                 check (accent_color in ('emerald', 'violet', 'amber', 'rose', 'sky', 'slate')),
  banner_pattern text not null default 'spines'
                 check (banner_pattern in ('spines', 'dots', 'plain')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

create or replace function public.normalize_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.username := btrim(new.username);
  new.display_name := public.clean_text(new.display_name);
  new.bio := public.clean_text(new.bio);
  new.avatar_url := public.clean_text(new.avatar_url);
  return new;
end;
$$;

create trigger profiles_normalize before insert or update on public.profiles
  for each row execute function public.normalize_profile();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile for every new auth user (email sign-up and Google OAuth).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_base     text;
  v_username text;
  v_display  text;
  v_avatar   text;
  v_try      integer := 0;
begin
  v_base := coalesce(
    v_meta ->> 'username',
    v_meta ->> 'preferred_username',
    v_meta ->> 'user_name',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_base := left(regexp_replace(coalesce(v_base, ''), '[^A-Za-z0-9_]', '', 'g'), 18);
  if char_length(v_base) < 3 then
    v_base := 'reader' || v_base;
  end if;

  v_username := v_base;
  while exists (select 1 from public.profiles p where lower(p.username) = lower(v_username)) loop
    v_try := v_try + 1;
    v_username := v_base || '_' || substr(md5(random()::text || clock_timestamp()::text), 1, 5);
    if v_try > 20 then
      raise exception 'Could not allocate a unique username';
    end if;
  end loop;

  v_display := nullif(btrim(left(coalesce(
    v_meta ->> 'display_name', v_meta ->> 'full_name', v_meta ->> 'name', ''), 50)), '');

  v_avatar := coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture');
  if v_avatar is not null and not public.is_http_url(v_avatar) then
    v_avatar := null;
  end if;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, v_username, v_display, v_avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Username availability check usable before sign-up (anon) and when editing a profile.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_username ~ '^[A-Za-z0-9_]{3,24}$'
     and not exists (
       select 1 from public.profiles p
       where lower(p.username) = lower(btrim(p_username))
         and p.id is distinct from auth.uid()
     )
$$;

-- -----------------------------------------------------------------------------
-- Roles. Roles live in their own table (never on profiles) so users can never
-- grant themselves admin through a profile update. Grant admin with:
--   insert into public.user_roles (user_id, role) values ('<auth user uuid>', 'admin');
-- -----------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       public.app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  )
$$;

-- -----------------------------------------------------------------------------
-- Personal collections.
-- An "exclusive arc": each row references exactly one catalog item through a
-- real foreign key (book OR merchandise), so every entry is guaranteed to point
-- at an existing item and is removed automatically if the item is deleted.
-- One row per (user, item) makes Owned / Want mutually exclusive by design.
-- -----------------------------------------------------------------------------
create table public.user_collections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id        uuid references public.books (id) on delete cascade,
  merchandise_id uuid references public.merchandise (id) on delete cascade,
  status         public.collection_status not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint user_collections_exactly_one_item check (num_nonnulls(book_id, merchandise_id) = 1),
  constraint user_collections_user_book_key unique (user_id, book_id),
  constraint user_collections_user_merch_key unique (user_id, merchandise_id)
);
create index user_collections_user_status_idx on public.user_collections (user_id, status, created_at desc);
create index user_collections_book_idx on public.user_collections (book_id) where book_id is not null;
create index user_collections_merch_idx on public.user_collections (merchandise_id) where merchandise_id is not null;

create trigger user_collections_updated_at before update on public.user_collections
  for each row execute function public.set_updated_at();
