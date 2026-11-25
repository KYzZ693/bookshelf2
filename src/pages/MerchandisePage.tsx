import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, Gem, Loader2, PackageSearch, Search, X } from 'lucide-react'
import { MERCH_PAGE_SIZE, useMerchCatalog, useMerchFacets, type MerchFilters, type MerchListItem, type MerchSort } from '@/api/merch'
import { BookCard, type ItemCardData } from '@/components/cards/BookCard'
import { Chip } from '@/components/search/FilterPanel'
import { SelectField } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/PageContainer'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { MERCH_LABEL, MERCH_ORDER } from '@/lib/labels'
import { errorMessage, formatDate, pluralize } from '@/lib/utils'
import type { MerchType } from '@/types/db'

const SORTS: { value: MerchSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name' },
  { value: 'series', label: 'Series' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
]

function readFilters(p: URLSearchParams): MerchFilters {
  const types = (p.get('type') ?? '').split(',').filter((t): t is MerchType => t in MERCH_LABEL)
  const sort = (p.get('sort') ?? 'newest') as MerchSort
  return {
    q: p.get('q') ?? '',
    types,
    series: p.get('series') || null,
    sort: SORTS.some((s) => s.value === sort) ? sort : 'newest',
  }
}

export function merchToCard(m: MerchListItem): ItemCardData {
  return {
    id: m.id,
    kind: 'merchandise',
    title: m.title,
    image_url: m.image_url,
    category: 'merchandise',
    merch_type: m.merch_type,
    price: m.price,
    currency: m.currency,
    series_title: m.series?.title ?? null,
    publisher_name: m.publisher?.name ?? null,
    date_label: m.release_date ? formatDate(m.release_date, { year: 'numeric', month: 'short' }) : null,
  }
}

/** Standalone merchandise gallery: filter by type and series, search by name. */
export default function MerchandisePage() {
  const [params, setParams] = useSearchParams()
  const filters = readFilters(params)
  const [text, setText] = useState(filters.q)
  const debounced = useDebouncedValue(text, 300)

  const patch = (next: Partial<MerchFilters>) => {
    const f = { ...filters, ...next }
    const p = new URLSearchParams()
    if (f.q.trim()) p.set('q', f.q.trim())
    if (f.types.length) p.set('type', f.types.join(','))
    if (f.series) p.set('series', f.series)
    if (f.sort !== 'newest') p.set('sort', f.sort)
    setParams(p, { replace: true })
  }

  // Debounced search box -> URL
  useEffect(() => {
    if (debounced.trim() !== filters.q) patch({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const facets = useMerchFacets()
  const list = useMerchCatalog(filters)
  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.rows) ?? [], [list.data])
  const total = list.data?.pages[0]?.count ?? 0
  const seriesName = facets.data?.series.find((s) => s.id === filters.series)?.title
  const activeCount = filters.types.length + (filters.series ? 1 : 0) + (filters.q ? 1 : 0)

  // Infinite scroll
  const sentinel = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && !isFetchingNextPage && fetchNextPage(), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const toggleType = (t: MerchType) =>
    patch({ types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t] })

  return (
    <PageContainer wide>
      <PageHeader
        eyebrow="Collectibles"
        title={
          <span className="inline-flex items-center gap-3">
            <Gem className="size-7 text-merch" /> Merchandise
          </span>
        }
        description="Figures, acrylic stands, keychains, posters, wall scrolls and other goods from your favourite series. Open an item to inspect it in 3D when a preview is available."
      />

      <div className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="relative block flex-1">
            <span className="sr-only">Search merchandise</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search merchandise by name…"
              className="h-11 w-full rounded-xl border border-line bg-paper pr-9 pl-9 text-sm text-ink outline-none placeholder:text-faint focus:border-accent"
            />
            {text && (
              <button onClick={() => setText('')} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-ink" aria-label="Clear search">
                <X className="size-4" />
              </button>
            )}
          </label>
          <SelectField
            label="Series"
            wrapperClassName="md:w-72"
            value={filters.series ?? ''}
            onChange={(e) => patch({ series: e.target.value || null })}
          >
            <option value="">All series</option>
            {facets.data?.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.count})
              </option>
            ))}
          </SelectField>
          <SelectField label="Sort" wrapperClassName="md:w-52" value={filters.sort} onChange={(e) => patch({ sort: e.target.value as MerchSort })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Merchandise type">
          <Chip active={filters.types.length === 0} onClick={() => patch({ types: [] })}>
            All types {facets.data && <span className="opacity-70">{facets.data.total}</span>}
          </Chip>
          {facets.isPending
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-24 rounded-full" />)
            : MERCH_ORDER.filter((t) => facets.data?.types.get(t)).map((t) => (
                <Chip key={t} active={filters.types.includes(t)} onClick={() => toggleType(t)}>
                  {MERCH_LABEL[t]} <span className="opacity-70">{facets.data?.types.get(t)}</span>
                </Chip>
              ))}
        </div>
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted" aria-live="polite">
          {list.isPending ? 'Loading…' : pluralize(total, 'item')}
        </span>
        {filters.types.map((t) => (
          <ActiveChip key={t} label={MERCH_LABEL[t]} onRemove={() => toggleType(t)} />
        ))}
        {filters.series && <ActiveChip label={seriesName ?? 'Series'} onRemove={() => patch({ series: null })} />}
        {filters.q && <ActiveChip label={`“${filters.q}”`} onRemove={() => { setText(''); patch({ q: '' }) }} />}
        {activeCount > 0 && (
          <button onClick={() => { setText(''); setParams(new URLSearchParams(), { replace: true }) }} className="ml-1 text-xs font-medium text-accent hover:underline">
            Clear all
          </button>
        )}
      </div>

      {list.isPending ? (
        <MerchGridSkeleton />
      ) : list.isError ? (
        <EmptyState icon={AlertCircle} title="Merchandise didn't load" description={errorMessage(list.error)} action={<Button onClick={() => list.refetch()}>Try again</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={activeCount ? 'No merchandise matches these filters' : 'No merchandise yet'}
          description={activeCount ? 'Try another type or series, or clear the filters.' : 'Merchandise added by an admin or the importer appears here.'}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-5">
            {rows.map((m, i) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i % MERCH_PAGE_SIZE, 10) * 0.025 }}>
                <BookCard item={merchToCard(m)} query={filters.q} />
              </motion.div>
            ))}
          </div>
          <div ref={sentinel} className="flex justify-center py-10">
            {isFetchingNextPage ? (
              <Loader2 className="size-5 animate-spin text-muted" />
            ) : hasNextPage ? (
              <Button variant="secondary" onClick={() => fetchNextPage()}>Load more</Button>
            ) : (
              rows.length > MERCH_PAGE_SIZE && <span className="text-xs text-faint">That's everything.</span>
            )}
          </div>
        </>
      )}
    </PageContainer>
  )
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-merch-soft py-0.5 pr-1 pl-2.5 text-xs font-medium text-merch">
      <span className="max-w-[16rem] truncate">{label}</span>
      <button onClick={onRemove} className="grid size-5 place-items-center rounded-full hover:bg-merch/15" aria-label={`Remove filter ${label}`}>
        <X className="size-3" />
      </button>
    </span>
  )
}

function MerchGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-5" aria-busy="true">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="mt-3 h-3.5 w-11/12" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  )
}
