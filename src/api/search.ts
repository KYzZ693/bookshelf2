import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import type { CollectionStatus, CompletionStatus, ItemCategory, SearchRow } from '@/types/db'
import { qk } from './keys'

export interface SearchParamsState {
  q: string
  publishers: string[]
  types: ItemCategory[]
  genres: string[]
  status: CompletionStatus[]
  collection: CollectionStatus[]
  authors: string[]
  illustrators: string[]
  translators: string[]
}

export const FILTER_KEYS = [
  'publishers',
  'types',
  'genres',
  'status',
  'collection',
  'authors',
  'illustrators',
  'translators',
] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

export const EMPTY_SEARCH: SearchParamsState = {
  q: '',
  publishers: [],
  types: [],
  genres: [],
  status: [],
  collection: [],
  authors: [],
  illustrators: [],
  translators: [],
}

/** URL <-> state. Multi-value filters are stored comma-separated. */
export function parseSearchParams(sp: URLSearchParams): SearchParamsState {
  const list = (k: string) =>
    (sp.get(k) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  return {
    q: sp.get('q') ?? '',
    publishers: list('publishers'),
    types: list('types') as ItemCategory[],
    genres: list('genres'),
    status: list('status') as CompletionStatus[],
    collection: list('collection') as CollectionStatus[],
    authors: list('authors'),
    illustrators: list('illustrators'),
    translators: list('translators'),
  }
}

export function toSearchParams(s: SearchParamsState): URLSearchParams {
  const sp = new URLSearchParams()
  if (s.q.trim()) sp.set('q', s.q)
  for (const k of FILTER_KEYS) if (s[k].length) sp.set(k, [...s[k]].join(','))
  return sp
}

export function countActiveFilters(s: SearchParamsState) {
  return FILTER_KEYS.reduce((n, k) => n + s[k].length, 0)
}

const nullIfEmpty = <T,>(a: T[]) => (a.length ? a : null)

async function runSearch(p: SearchParamsState, limit: number): Promise<SearchRow[]> {
  const rows = unwrap(
    await supabase.rpc('search_catalog', {
      p_query: p.q.trim(),
      p_publisher_ids: nullIfEmpty(p.publishers),
      p_item_types: nullIfEmpty(p.types),
      p_genre_ids: nullIfEmpty(p.genres),
      p_statuses: nullIfEmpty(p.status),
      p_collection: nullIfEmpty(p.collection),
      p_author_ids: nullIfEmpty(p.authors),
      p_illustrator_ids: nullIfEmpty(p.illustrators),
      p_translator_ids: nullIfEmpty(p.translators),
      p_limit: limit,
    }),
  )
  return (rows ?? []) as SearchRow[]
}

export interface GroupedResults {
  series: SearchRow[]
  books: SearchRow[]
  merchandise: SearchRow[]
  people: SearchRow[]
  publishers: SearchRow[]
  totals: { series: number; books: number; merchandise: number; people: number; publishers: number }
}

export function groupResults(rows: SearchRow[]): GroupedResults {
  const g: GroupedResults = {
    series: [],
    books: [],
    merchandise: [],
    people: [],
    publishers: [],
    totals: { series: 0, books: 0, merchandise: 0, people: 0, publishers: 0 },
  }
  for (const r of rows) {
    switch (r.kind) {
      case 'series':
        g.series.push(r)
        g.totals.series = Number(r.kind_total)
        break
      case 'book':
        g.books.push(r)
        g.totals.books = Number(r.kind_total)
        break
      case 'merchandise':
        g.merchandise.push(r)
        g.totals.merchandise = Number(r.kind_total)
        break
      case 'publisher':
        g.publishers.push(r)
        g.totals.publishers = Number(r.kind_total)
        break
      default:
        g.people.push(r)
    }
  }
  g.people.sort((a, b) => b.score - a.score)
  g.totals.people = g.people.length
  return g
}

export function useCatalogSearch(params: SearchParamsState, limit: number) {
  const { user } = useAuth()
  return useQuery({
    queryKey: qk.search(params, limit, user?.id),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: async () => groupResults(await runSearch(params, limit)),
  })
}

/** Small, fast query used by the navbar's instant-results dropdown. */
export function useQuickSearch(q: string) {
  const term = q.trim()
  return useQuery({
    queryKey: qk.quickSearch(term),
    enabled: term.length >= 1,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    meta: { progress: false },
    queryFn: async () => groupResults(await runSearch({ ...EMPTY_SEARCH, q: term }, 4)),
  })
}
