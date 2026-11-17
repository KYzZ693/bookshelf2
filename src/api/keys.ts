import type { SearchParamsState } from './search'

/**
 * Query keys. Everything user-specific lives under ['me', ...] so it can be
 * dropped in one call on sign-out.
 */
export const qk = {
  genres: ['catalog', 'genres'] as const,
  publishers: ['catalog', 'publishers'] as const,
  people: (role: string) => ['catalog', 'people', role] as const,
  shelves: (groupBy: string) => ['catalog', 'shelves', groupBy] as const,
  recentSeries: ['catalog', 'recent-series'] as const,
  series: (id: string) => ['catalog', 'series', id] as const,
  seriesBooks: (id: string) => ['catalog', 'series', id, 'books'] as const,
  seriesMerch: (id: string) => ['catalog', 'series', id, 'merch'] as const,
  book: (id: string) => ['catalog', 'book', id] as const,
  merch: (id: string) => ['catalog', 'merch', id] as const,
  search: (p: SearchParamsState, limit: number, uid: string | undefined) => ['catalog', 'search', p, limit, uid ?? null] as const,
  quickSearch: (q: string) => ['catalog', 'quick-search', q] as const,

  profile: (uid: string | undefined) => ['me', uid ?? null, 'profile'] as const,
  isAdmin: (uid: string | undefined) => ['me', uid ?? null, 'is-admin'] as const,
  statusMap: (uid: string | undefined) => ['me', uid ?? null, 'status-map'] as const,
  myCollection: (uid: string | undefined, filters: unknown) => ['me', uid ?? null, 'collection', filters] as const,
  myCollectionAll: (uid: string | undefined) => ['me', uid ?? null, 'collection'] as const,
  stats: (uid: string | undefined) => ['me', uid ?? null, 'stats'] as const,
}
