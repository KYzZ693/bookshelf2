import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { errorMessage, unwrap } from '@/lib/utils'
import { authModal } from '@/lib/authModal'
import { useAuth } from '@/contexts/AuthContext'
import type { CollectionEntry, CollectionStats, CollectionStatus, ItemCategory, ItemKind } from '@/types/db'
import { qk } from './keys'

/** Map keyed by `book:<id>` / `merchandise:<id>` -> status, for the current user. */
export type StatusMap = Record<string, CollectionStatus>
export const itemKey = (kind: ItemKind, id: string) => `${kind}:${id}`

/**
 * All of the user's statuses in one light query (3 columns per row), so every
 * card and detail page can show Owned / Want badges without extra requests.
 */
export function useStatusMap() {
  const { user } = useAuth()
  return useQuery({
    queryKey: qk.statusMap(user?.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const map: StatusMap = {}
      const pageSize = 1000
      for (let from = 0; ; from += pageSize) {
        const rows = unwrap(
          await supabase
            .from('user_collections')
            .select('book_id, merchandise_id, status')
            .range(from, from + pageSize - 1),
        ) as { book_id: string | null; merchandise_id: string | null; status: CollectionStatus }[]
        for (const r of rows) {
          if (r.book_id) map[itemKey('book', r.book_id)] = r.status
          else if (r.merchandise_id) map[itemKey('merchandise', r.merchandise_id)] = r.status
        }
        if (rows.length < pageSize) break
      }
      return map
    },
  })
}

export function useItemStatus(kind: ItemKind, id: string | undefined): CollectionStatus | null {
  const { data } = useStatusMap()
  if (!id || !data) return null
  return data[itemKey(kind, id)] ?? null
}

interface SetStatusVars {
  kind: ItemKind
  id: string
  status: CollectionStatus | null
  title?: string
}

/**
 * Optimistic Owned / Want / remove. The UI flips immediately; on failure the
 * previous state is restored and an error toast is shown.
 */
export function useSetCollectionStatus() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const key = qk.statusMap(user?.id)

  return useMutation({
    mutationKey: ['set-collection-status'],
    mutationFn: async ({ kind, id, status }: SetStatusVars) => {
      if (!user) throw new Error('not-signed-in')
      const res = await supabase.rpc('set_collection_status', {
        p_book_id: kind === 'book' ? id : null,
        p_merchandise_id: kind === 'merchandise' ? id : null,
        p_status: status,
      })
      return unwrap(res) as CollectionStatus | null
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<StatusMap>(key)
      qc.setQueryData<StatusMap>(key, (old) => {
        const next = { ...(old ?? {}) }
        const k = itemKey(vars.kind, vars.id)
        if (vars.status) next[k] = vars.status
        else delete next[k]
        return next
      })
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous)
      if ((err as Error).message === 'not-signed-in') return
      toast.error('Could not update your collection', errorMessage(err))
    },
    onSuccess: (status, vars) => {
      const label = vars.title ? `“${vars.title}”` : 'Item'
      if (status === 'owned') toast.success(`${label} added to Owned`)
      else if (status === 'want') toast.success(`${label} added to Wishlist`)
      else toast.info(`${label} removed from your collection`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.myCollectionAll(user?.id) })
      qc.invalidateQueries({ queryKey: qk.stats(user?.id) })
      qc.invalidateQueries({ queryKey: ['catalog', 'search'] })
    },
  })
}

/** Convenience wrapper: toggles the given status (click active = remove). */
export function useCollectionToggle(kind: ItemKind, id: string | undefined, title?: string) {
  const { user } = useAuth()
  const current = useItemStatus(kind, id)
  const mutation = useSetCollectionStatus()
  const pendingFor =
    mutation.isPending && mutation.variables?.id === id ? (mutation.variables?.status ?? 'remove') : null

  function toggle(target: CollectionStatus) {
    if (!id) return
    if (!user) {
      authModal.open('login', target === 'owned' ? 'Sign in to track what you own.' : 'Sign in to build your wishlist.')
      return
    }
    mutation.mutate({ kind, id, status: current === target ? null : target, title })
  }

  return { current, toggle, pendingFor, isPending: mutation.isPending && mutation.variables?.id === id }
}

// ---------------------------------------------------------------------------
// Collection listing
// ---------------------------------------------------------------------------
export type CollectionSort = 'recent' | 'oldest' | 'title' | 'series' | 'price_desc' | 'price_asc'

export interface CollectionFilters {
  status: CollectionStatus
  category: ItemCategory | 'all'
  sort: CollectionSort
  search: string
}

export const COLLECTION_PAGE_SIZE = 24

export function useMyCollection(filters: CollectionFilters, enabled = true) {
  const { user } = useAuth()
  return useInfiniteQuery({
    queryKey: qk.myCollection(user?.id, filters),
    enabled: !!user && enabled,
    initialPageParam: 0,
    staleTime: 60_000,
    queryFn: async ({ pageParam }) => {
      let q = supabase.from('my_collection').select('*', { count: 'exact' }).eq('status', filters.status)
      if (filters.category !== 'all') q = q.eq('category', filters.category)
      const term = filters.search.trim()
      if (term) {
        const safe = term.replace(/[%_,()]/g, ' ')
        q = q.or(`title.ilike.%${safe}%,series_title.ilike.%${safe}%`)
      }
      switch (filters.sort) {
        case 'oldest':
          q = q.order('created_at', { ascending: true })
          break
        case 'title':
          q = q.order('title', { ascending: true })
          break
        case 'series':
          q = q.order('series_title').order('volume_number', { ascending: true, nullsFirst: false }).order('title')
          break
        case 'price_desc':
          q = q.order('price', { ascending: false, nullsFirst: false })
          break
        case 'price_asc':
          q = q.order('price', { ascending: true, nullsFirst: false })
          break
        default:
          q = q.order('created_at', { ascending: false })
      }
      const from = pageParam * COLLECTION_PAGE_SIZE
      const { data, error, count } = await q.range(from, from + COLLECTION_PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as CollectionEntry[], count: count ?? 0, page: pageParam }
    },
    getNextPageParam: (last) =>
      (last.page + 1) * COLLECTION_PAGE_SIZE < last.count ? last.page + 1 : undefined,
  })
}

export function useCollectionStats(userId?: string) {
  const { user } = useAuth()
  const uid = userId ?? user?.id
  return useQuery({
    queryKey: qk.stats(uid),
    enabled: !!uid && uid === user?.id,
    staleTime: 60_000,
    queryFn: async () => unwrap(await supabase.rpc('get_collection_stats')) as CollectionStats,
  })
}
