import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowRightLeft, Bookmark, Check, Library, Loader2, Search, Trash2 } from 'lucide-react'
import {
  useMyCollection,
  useSetCollectionStatus,
  type CollectionFilters,
  type CollectionSort,
} from '@/api/collection'
import { CoverImage } from '@/components/CoverImage'
import { CategoryBadge } from '@/components/ui/Badge'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { CATEGORY_LABEL, CATEGORY_ORDER, MERCH_LABEL } from '@/lib/labels'
import { cn, errorMessage, formatPrice, formatVolume } from '@/lib/utils'
import type { CollectionEntry, CollectionStatus, ItemCategory } from '@/types/db'

const SORTS: { value: CollectionSort; label: string }[] = [
  { value: 'recent', label: 'Recently added' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'series', label: 'Series & volume' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'price_asc', label: 'Price: low to high' },
]

/**
 * Owned / Wishlist grid with search, category filter, sorting and infinite
 * loading. Each card can switch status or be removed.
 */
export function CollectionGrid({ status, compact }: { status: CollectionStatus; compact?: boolean }) {
  const [category, setCategory] = useState<ItemCategory | 'all'>('all')
  const [sort, setSort] = useState<CollectionSort>('recent')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const filters: CollectionFilters = { status, category, sort, search: debounced }
  const query = useMyCollection(filters)
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? []
  const count = query.data?.pages[0]?.count ?? 0
  const sentinel = useRef<HTMLDivElement>(null)
  const filtered = category !== 'all' || debounced.trim() !== ''

  // Infinite scroll
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const el = sentinel.current
    if (!el || compact || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, compact])

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${status === 'owned' ? 'owned items' : 'wishlist'}…`}
            aria-label="Search this collection"
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-1 lg:px-0">
          {(['all', ...CATEGORY_ORDER] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                category === c ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-muted hover:text-ink',
              )}
            >
              {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as CollectionSort)}
          aria-label="Sort collection"
          className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {query.isPending ? (
        <SkeletonGrid count={compact ? 6 : 12} />
      ) : query.isError ? (
        <EmptyState
          compact
          icon={AlertCircle}
          title="Couldn't load your collection"
          description={errorMessage(query.error)}
          action={<Button onClick={() => query.refetch()}>Try again</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={status === 'owned' ? Library : Bookmark}
          title={filtered ? 'No matches' : status === 'owned' ? 'Nothing owned yet' : 'Your wishlist is empty'}
          description={
            filtered
              ? 'Try another category or search term.'
              : status === 'owned'
                ? 'Open any book and press “Owned” to add it here.'
                : 'Press “Want” on any book or collectible to save it for later.'
          }
          action={
            !filtered && (
              <Link to="/">
                <Button variant="secondary">Browse the bookshelf</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {count.toLocaleString()} {count === 1 ? 'item' : 'items'}
          </p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            <AnimatePresence initial={false}>
              {rows.map((r) => (
                <motion.div key={r.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                  <CollectionItemCard entry={r} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <div ref={sentinel} />
          {query.hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" onClick={() => query.fetchNextPage()} loading={query.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CollectionItemCard({ entry: e }: { entry: CollectionEntry }) {
  const mutation = useSetCollectionStatus()
  const [confirm, setConfirm] = useState(false)
  const pending = mutation.isPending
  const other: CollectionStatus = e.status === 'owned' ? 'want' : 'owned'
  const href = e.item_kind === 'book' ? `/book/${e.item_id}` : `/merch/${e.item_id}`
  const vol = formatVolume(e.volume_number)
  const price = formatPrice(e.price, e.currency ?? 'THB')

  return (
    <div className="group">
      <Link to={href} className="block">
        <div className="relative transition-transform duration-300 group-hover:-translate-y-1">
          <CoverImage
            src={e.image_url}
            title={e.title}
            subtitle={vol ? `Vol. ${vol}` : null}
            category={e.category}
            aspect={e.item_kind === 'merchandise' ? 'aspect-square' : 'aspect-[2/3]'}
            className="group-hover:shadow-lift"
          />
          {vol && (
            <span className="absolute top-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white">{vol}</span>
          )}
        </div>
      </Link>
      <div className="mt-2.5 space-y-1">
        <Link to={href} className="line-clamp-2 text-[13px] leading-snug font-semibold text-ink hover:text-accent">
          {e.title}
        </Link>
        <Link to={`/series/${e.series_id}`} className="block truncate text-[11.5px] text-muted hover:text-accent">
          {e.series_title}
        </Link>
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {e.item_kind === 'merchandise' ? (
            <span className="rounded-md bg-merch-soft px-1.5 py-0.5 text-[11px] leading-4 font-semibold text-merch">{MERCH_LABEL[e.merch_type ?? 'other']}</span>
          ) : (
            <CategoryBadge category={e.category} />
          )}
          {price && <span className="text-[11.5px] text-muted">{price}</span>}
        </div>
        <div className="flex gap-1.5 pt-1.5">
          <button
            onClick={() => mutation.mutate({ kind: e.item_kind, id: e.item_id, status: other, title: e.title })}
            disabled={pending}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-surface text-[11.5px] font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
            title={other === 'owned' ? 'Mark as owned' : 'Move to wishlist'}
          >
            {pending && mutation.variables?.status === other ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : other === 'owned' ? (
              <Check className="size-3.5" />
            ) : (
              <ArrowRightLeft className="size-3.5" />
            )}
            {other === 'owned' ? 'Got it' : 'To wishlist'}
          </button>
          <button
            onClick={() => setConfirm(true)}
            disabled={pending}
            className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
            aria-label={`Remove ${e.title} from your collection`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <ConfirmationDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Remove from collection?"
        description={
          <>
            “{e.title}” will be removed from your {e.status === 'owned' ? 'Owned collection' : 'wishlist'}. You can add it again
            any time.
          </>
        }
        confirmLabel="Remove"
        loading={pending && mutation.variables?.status === null}
        onConfirm={() =>
          mutation.mutate(
            { kind: e.item_kind, id: e.item_id, status: null, title: e.title },
            { onSettled: () => setConfirm(false) },
          )
        }
      />
    </div>
  )
}
