import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { unwrap } from '@/lib/utils'
import type { Merchandise, MerchType } from '@/types/db'
import { MERCH_COLUMNS } from './catalog'

export const MERCH_PAGE_SIZE = 40

export type MerchSort = 'newest' | 'name' | 'price_asc' | 'price_desc' | 'series'

export interface MerchFilters {
  q: string
  types: MerchType[]
  series: string | null
  sort: MerchSort
}

export type MerchListItem = Merchandise & {
  series: { id: string; title: string } | null
  publisher: { id: string; name: string } | null
}

/** Light list of every merchandise item, for type counts and the series filter. */
export function useMerchFacets() {
  return useQuery({
    queryKey: ['catalog', 'merch', 'facets'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = unwrap(
        await supabase.from('merchandise').select('merch_type, series:series(id, title)').limit(10000),
      ) as unknown as { merch_type: MerchType; series: { id: string; title: string } | null }[]
      const types = new Map<MerchType, number>()
      const series = new Map<string, { id: string; title: string; count: number }>()
      for (const r of rows) {
        types.set(r.merch_type, (types.get(r.merch_type) ?? 0) + 1)
        if (r.series) {
          const s = series.get(r.series.id) ?? { ...r.series, count: 0 }
          s.count++
          series.set(r.series.id, s)
        }
      }
      return {
        total: rows.length,
        types,
        series: [...series.values()].sort((a, b) => a.title.localeCompare(b.title, 'th')),
      }
    },
  })
}

export function useMerchCatalog(f: MerchFilters) {
  return useInfiniteQuery({
    queryKey: ['catalog', 'merch', 'list', f],
    initialPageParam: 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    meta: { progress: true },
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from('merchandise')
        .select(`${MERCH_COLUMNS}, series:series(id, title), publisher:publishers(id, name)`, { count: 'exact' })
      if (f.types.length) q = q.in('merch_type', f.types)
      if (f.series) q = q.eq('series_id', f.series)
      const term = f.q.trim()
      if (term) q = q.ilike('title', `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
      switch (f.sort) {
        case 'name':
          q = q.order('title')
          break
        case 'price_asc':
          q = q.order('price', { ascending: true, nullsFirst: false })
          break
        case 'price_desc':
          q = q.order('price', { ascending: false, nullsFirst: false })
          break
        case 'series':
          q = q.order('series_id').order('merch_type').order('title')
          break
        default:
          q = q.order('created_at', { ascending: false }).order('title')
      }
      const from = pageParam * MERCH_PAGE_SIZE
      const { data, error, count } = await q.range(from, from + MERCH_PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as unknown as MerchListItem[], count: count ?? 0, page: pageParam }
    },
    getNextPageParam: (last) => ((last.page + 1) * MERCH_PAGE_SIZE < last.count ? last.page + 1 : undefined),
  })
}
