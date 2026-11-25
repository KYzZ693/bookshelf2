import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/utils'
import type {
  BookDetail,
  BookListItem,
  Genre,
  GenreShelf,
  Merchandise,
  MerchandiseDetail,
  Person,
  PersonRole,
  Publisher,
  SeriesOverview,
} from '@/types/db'
import { qk } from './keys'

/** Explicit column lists keep generated search columns out of responses. */
export const BOOK_COLUMNS =
  'id, series_id, title, volume_number, item_type, edition_type, edition_notes, cover_url, synopsis, price, currency, publisher_id, publisher_product_url, publication_date, isbn, page_count, regular_book_id, bonus_items, created_at, updated_at'
export const CREDIT_COLUMNS =
  'book_authors(position, author:authors(id, name)), book_illustrators(position, illustrator:illustrators(id, name)), book_translators(position, translator:translators(id, name))'
export const MERCH_COLUMNS =
  'id, series_id, title, merch_type, description, image_url, price, currency, publisher_id, product_url, release_date, model_url, model_format, model_source, model_params, reference_urls, reconstruction_status, reconstruction_notes, preview_available, created_at, updated_at'

const PEOPLE_TABLE: Record<PersonRole, 'authors' | 'illustrators' | 'translators'> = {
  author: 'authors',
  illustrator: 'illustrators',
  translator: 'translators',
}

// ---------------------------------------------------------------------------
// Reference data (small, cached for a long time)
// ---------------------------------------------------------------------------
export function useGenres() {
  return useQuery({
    queryKey: qk.genres,
    staleTime: 30 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.from('genres').select('id, name, slug, sort_order').order('sort_order').order('name')) as Genre[],
  })
}

export function usePublishers() {
  return useQuery({
    queryKey: qk.publishers,
    staleTime: 30 * 60_000,
    queryFn: async () => unwrap(await supabase.from('publishers').select('*').order('name')) as Publisher[],
  })
}

export function usePeople(role: PersonRole, enabled = true) {
  return useQuery({
    queryKey: qk.people(role),
    enabled,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.from(PEOPLE_TABLE[role]).select('id, name').order('name').limit(2000)) as Person[],
  })
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------
export type ShelfGrouping = 'author' | 'translator' | 'publisher' | 'illustrator'

export function useGenreShelves(groupBy: ShelfGrouping) {
  return useQuery({
    queryKey: qk.shelves(groupBy),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    meta: { progress: true },
    queryFn: async () =>
      unwrap(await supabase.rpc('get_genre_shelves', { p_per_genre: 30, p_group_by: groupBy })) as GenreShelf[],
  })
}

export function useRecentSeries(limit = 16) {
  return useQuery({
    queryKey: qk.recentSeries,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('series_overview')
          .select('*')
          // merchandise-only series live in the Merchandise gallery, not on the shelf
          .or('regular_volume_count.gt.0,special_volume_count.gt.0')
          .order('created_at', { ascending: false })
          .limit(limit),
      ) as SeriesOverview[],
  })
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------
export function useSeries(id: string | undefined) {
  return useQuery({
    queryKey: qk.series(id ?? ''),
    enabled: !!id,
    meta: { progress: true },
    queryFn: async () =>
      unwrap(await supabase.from('series_overview').select('*').eq('id', id!).maybeSingle()) as SeriesOverview | null,
  })
}

export function useSeriesBooks(seriesId: string | undefined) {
  return useQuery({
    queryKey: qk.seriesBooks(seriesId ?? ''),
    enabled: !!seriesId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('books')
          .select(`${BOOK_COLUMNS}, ${CREDIT_COLUMNS}`)
          .eq('series_id', seriesId!)
          .order('volume_number', { ascending: true, nullsFirst: false })
          .order('publication_date', { ascending: true, nullsFirst: false })
          .order('title'),
      ) as unknown as BookListItem[],
  })
}

export function useSeriesMerch(seriesId: string | undefined) {
  return useQuery({
    queryKey: qk.seriesMerch(seriesId ?? ''),
    enabled: !!seriesId,
    queryFn: async () =>
      unwrap(
        await supabase.from('merchandise').select(MERCH_COLUMNS).eq('series_id', seriesId!).order('merch_type').order('title'),
      ) as Merchandise[],
  })
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: qk.book(id ?? ''),
    enabled: !!id,
    meta: { progress: true },
    queryFn: async () =>
      unwrap(
        await supabase
          .from('books')
          .select(
            `${BOOK_COLUMNS}, ${CREDIT_COLUMNS},
             publisher:publishers(id, name, website_url, logo_url),
             series:series(id, title, cover_url, completion_status, series_type,
               publisher:publishers(id, name, website_url),
               series_genres(genre:genres(id, name, slug)))`,
          )
          .eq('id', id!)
          .maybeSingle(),
      ) as unknown as BookDetail | null,
  })
}

export function useMerch(id: string | undefined) {
  return useQuery({
    queryKey: qk.merch(id ?? ''),
    enabled: !!id,
    meta: { progress: true },
    queryFn: async () =>
      unwrap(
        await supabase
          .from('merchandise')
          .select(
            `${MERCH_COLUMNS},
             publisher:publishers(id, name, website_url, logo_url),
             series:series(id, title, completion_status, publisher:publishers(id, name, website_url))`,
          )
          .eq('id', id!)
          .maybeSingle(),
      ) as unknown as MerchandiseDetail | null,
  })
}

export type EditionBrief = Pick<
  BookListItem,
  'id' | 'title' | 'volume_number' | 'edition_type' | 'edition_notes' | 'cover_url' | 'price' | 'currency' | 'bonus_items'
>
const EDITION_BRIEF = 'id, title, volume_number, edition_type, edition_notes, cover_url, price, currency, bonus_items'

/** Special editions packaging a regular volume (books.regular_book_id). */
export function useSpecialEditions(regularId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: [...qk.book(regularId ?? ''), 'specials'],
    enabled: !!regularId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase.from('books').select(EDITION_BRIEF).eq('regular_book_id', regularId!).order('edition_type').order('title'),
      ) as unknown as EditionBrief[],
  })
}

/** The regular volume a special edition belongs to. */
export function useRegularVolume(id: string | null | undefined) {
  return useQuery({
    queryKey: [...qk.book(id ?? ''), 'brief'],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.from('books').select(EDITION_BRIEF).eq('id', id!).maybeSingle()) as unknown as EditionBrief | null,
  })
}

/** Sibling volumes for prev / next navigation on the book page. */
export function useSeriesVolumeNav(seriesId: string | undefined) {
  return useQuery({
    queryKey: [...qk.seriesBooks(seriesId ?? ''), 'nav'],
    enabled: !!seriesId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('books')
          .select('id, title, volume_number, edition_type')
          .eq('series_id', seriesId!)
          .eq('edition_type', 'regular')
          .order('volume_number', { ascending: true, nullsFirst: false })
          .order('publication_date', { ascending: true, nullsFirst: false }),
      ) as { id: string; title: string; volume_number: number | null; edition_type: string }[],
  })
}

export function creditNames(item: BookListItem | BookDetail) {
  const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position
  return {
    authors: [...(item.book_authors ?? [])].sort(byPos).map((x) => x.author).filter(Boolean) as Person[],
    illustrators: [...(item.book_illustrators ?? [])].sort(byPos).map((x) => x.illustrator).filter(Boolean) as Person[],
    translators: [...(item.book_translators ?? [])].sort(byPos).map((x) => x.translator).filter(Boolean) as Person[],
  }
}
