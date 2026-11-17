import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Building2, ChevronDown, PenLine, SearchX, X } from 'lucide-react'
import {
  countActiveFilters,
  EMPTY_SEARCH,
  parseSearchParams,
  toSearchParams,
  useCatalogSearch,
  type SearchParamsState,
} from '@/api/search'
import { useGenres, usePeople, usePublishers } from '@/api/catalog'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { SearchBar } from '@/components/search/SearchBar'
import { FilterPanel } from '@/components/search/FilterPanel'
import { Highlight } from '@/components/search/Highlight'
import { resultHref } from '@/components/search/resultHref'
import { SeriesCard } from '@/components/cards/SeriesCard'
import { BookCard, type ItemCardData } from '@/components/cards/BookCard'
import { SkeletonGrid } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { CATEGORY_LABEL, ROLE_LABEL, STATUS_LABEL } from '@/lib/labels'
import { cn, errorMessage } from '@/lib/utils'
import type { BookFormat, EditionType, ItemCategory, MerchType, PersonRole, SearchRow } from '@/types/db'

const PAGE = 24

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => parseSearchParams(params), [params])
  const [text, setText] = useState(state.q)
  const debounced = useDebouncedValue(text, 300)
  const lastPushed = useRef(state.q)
  const [limit, setLimit] = useState(PAGE)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [filtersOpen, setFiltersOpen] = useState(() => countActiveFilters(state) > 0 && window.innerWidth >= 768)
  const inputRef = useRef<HTMLInputElement>(null)

  function update(patch: Partial<SearchParamsState>) {
    const next = { ...state, ...patch }
    if (patch.q !== undefined) lastPushed.current = patch.q
    setParams(toSearchParams(next), { replace: true })
  }

  // Debounced text -> URL
  useEffect(() => {
    if (debounced !== state.q) update({ q: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // URL -> text (only when the change came from outside, e.g. navbar search)
  useEffect(() => {
    if (state.q !== lastPushed.current) {
      lastPushed.current = state.q
      setText(state.q)
    }
  }, [state.q])

  // Reset pagination whenever the question changes
  const signature = params.toString()
  useEffect(() => setLimit(PAGE), [signature])

  const { data, isPending, isFetching, isError, error, refetch, isPlaceholderData } = useCatalogSearch(state, limit)
  const filterCount = countActiveFilters(state)
  const hasQuery = state.q.trim().length > 0
  const browsing = !hasQuery && filterCount === 0
  const total = data ? data.totals.series + data.totals.books + data.totals.merchandise : 0

  function clearFilters() {
    // Keeps the current query text.
    update({ ...EMPTY_SEARCH, q: state.q })
  }

  const panel = <FilterPanel state={state} onChange={update} onClear={clearFilters} resultCount={data ? total : undefined} />

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mb-5">
        <h1 className="font-serif text-3xl text-ink sm:text-4xl">Search</h1>
        <p className="mt-1 text-sm text-muted">Find series, volumes, merchandise, creators and publishers. Typos are fine.</p>
      </div>

      <div className="sticky top-16 z-20 -mx-4 bg-paper/90 px-4 pt-2 pb-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <SearchBar
          ref={inputRef}
          value={text}
          onChange={setText}
          onSubmit={() => {
            update({ q: text })
            inputRef.current?.blur()
          }}
          loading={isFetching && !isPending}
          filterCount={filterCount}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((o) => !o)}
          autoFocus={!state.q && isDesktop}
        />
        <ActiveFilters state={state} onChange={update} onClear={clearFilters} />
      </div>

      {/* Desktop: inline panel. Mobile: bottom sheet. */}
      {isDesktop ? (
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              id="search-filters"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="mt-2 mb-6 rounded-2xl border border-line bg-surface p-5 shadow-card">{panel}</div>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <Modal
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          title="Filters"
          footer={
            <Button className="w-full" onClick={() => setFiltersOpen(false)}>
              Show {data ? total.toLocaleString() : ''} results
            </Button>
          }
        >
          {panel}
        </Modal>
      )}

      <div className="mt-4">
        {isPending ? (
          <SkeletonGrid count={12} />
        ) : isError ? (
          <EmptyState
            icon={AlertCircle}
            title="Search is unavailable right now"
            description={errorMessage(error)}
            action={<Button onClick={() => refetch()}>Try again</Button>}
          />
        ) : total === 0 && data.people.length === 0 && data.publishers.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={hasQuery ? `Nothing on the shelf matches “${state.q}”` : 'No results for these filters'}
            description={
              filterCount
                ? 'Try removing a filter or two — filters combine to narrow the results.'
                : 'Check the spelling, try fewer words, or search by author, illustrator or publisher.'
            }
            action={
              <>
                {filterCount > 0 && <Button onClick={clearFilters}>Clear filters</Button>}
                {hasQuery && (
                  <Button variant="secondary" onClick={() => setText('')}>
                    Clear search
                  </Button>
                )}
              </>
            }
          />
        ) : (
          <div className={cn('space-y-12 transition-opacity', isPlaceholderData && 'opacity-60')}>
            <p className="text-sm text-muted" aria-live="polite">
              {browsing ? (
                <>Browsing the full catalog · <span className="font-medium text-ink">{data.totals.series.toLocaleString()}</span> series</>
              ) : (
                <>
                  <span className="font-medium text-ink">{total.toLocaleString()}</span> {total === 1 ? 'result' : 'results'}
                  {hasQuery && <> for “<span className="text-ink">{state.q}</span>”</>}
                  {data.series[0] && data.series[0].score < 0.75 && data.books[0]?.score !== undefined && data.books[0].score < 0.75 && hasQuery && (
                    <span className="ml-1 text-faint">· showing closest matches</span>
                  )}
                </>
              )}
            </p>

            {(data.people.length > 0 || data.publishers.length > 0) && (
              <div className="grid gap-6 lg:grid-cols-2">
                {data.people.length > 0 && (
                  <ResultSection title="Authors & creators" count={data.people.length}>
                    <EntityList rows={data.people} query={state.q} />
                  </ResultSection>
                )}
                {data.publishers.length > 0 && (
                  <ResultSection title="Publishers" count={data.totals.publishers}>
                    <EntityList rows={data.publishers} query={state.q} />
                  </ResultSection>
                )}
              </div>
            )}

            {data.series.length > 0 && (
              <ResultSection title="Series" count={data.totals.series} more={data.totals.series > data.series.length} onMore={() => setLimit((l) => l + PAGE)} loadingMore={isFetching}>
                <Grid>
                  {data.series.map((r, i) => (
                    <SeriesCard
                      key={r.id}
                      query={state.q}
                      eager={i < 6}
                      series={{
                        id: r.id,
                        title: r.title,
                        cover_url: r.image_url,
                        series_type: (r.item_type as BookFormat) ?? 'other',
                        completion_status: r.completion_status ?? 'ongoing',
                        genre_names: r.genre_names,
                        publisher_name: r.publisher_name,
                      }}
                    />
                  ))}
                </Grid>
              </ResultSection>
            )}

            {!browsing && data.books.length > 0 && (
              <ResultSection title="Books" count={data.totals.books} more={data.totals.books > data.books.length} onMore={() => setLimit((l) => l + PAGE)} loadingMore={isFetching}>
                <Grid>
                  {data.books.map((r) => (
                    <BookCard key={r.id} query={state.q} item={rowToItem(r)} />
                  ))}
                </Grid>
              </ResultSection>
            )}

            {!browsing && data.merchandise.length > 0 && (
              <ResultSection
                title="Merchandise"
                count={data.totals.merchandise}
                more={data.totals.merchandise > data.merchandise.length}
                onMore={() => setLimit((l) => l + PAGE)}
                loadingMore={isFetching}
              >
                <Grid>
                  {data.merchandise.map((r) => (
                    <BookCard key={r.id} query={state.q} item={rowToItem(r)} />
                  ))}
                </Grid>
              </ResultSection>
            )}

            {browsing && (
              <p className="text-center text-sm text-faint">Type a title, author or publisher — or open the filters — to search individual books and merchandise.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function rowToItem(r: SearchRow): ItemCardData {
  const isMerch = r.kind === 'merchandise'
  const category: ItemCategory = isMerch
    ? 'merchandise'
    : r.edition_type && (r.edition_type as EditionType) !== 'regular'
      ? 'special_edition'
      : ((r.item_type as BookFormat) ?? 'other')
  return {
    id: r.id,
    kind: isMerch ? 'merchandise' : 'book',
    title: r.title,
    image_url: r.image_url,
    category,
    series_title: r.series_title,
    volume_number: r.volume_number,
    price: r.price,
    merch_type: isMerch ? (r.item_type as MerchType) : null,
  }
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{children}</div>
}

function ResultSection({
  title,
  count,
  children,
  more,
  onMore,
  loadingMore,
}: {
  title: string
  count: number
  children: ReactNode
  more?: boolean
  onMore?: () => void
  loadingMore?: boolean
}) {
  return (
    <section>
      <h2 className="mb-4 flex items-baseline gap-2 font-serif text-2xl text-ink">
        {title} <span className="font-sans text-sm text-muted">{count.toLocaleString()}</span>
      </h2>
      {children}
      {more && onMore && (
        <div className="mt-6 flex justify-center">
          <Button variant="secondary" onClick={onMore} loading={loadingMore} rightIcon={<ChevronDown className="size-4" />}>
            Show more
          </Button>
        </div>
      )}
    </section>
  )
}

function EntityList({ rows, query }: { rows: SearchRow[]; query: string }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {rows.map((r) => {
        const isPublisher = r.kind === 'publisher'
        const Icon = isPublisher ? Building2 : PenLine
        const meta = isPublisher
          ? `${r.subtitle ?? 0} series`
          : `${ROLE_LABEL[r.kind as PersonRole]} · ${r.subtitle ?? 0} ${Number(r.subtitle) === 1 ? 'book' : 'books'}`
        return (
          <li key={`${r.kind}-${r.id}`}>
            <Link to={resultHref(r)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 text-muted">
                {isPublisher && r.image_url ? <img src={r.image_url} alt="" className="size-full object-cover" /> : <Icon className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  <Highlight text={r.title} query={query} />
                </span>
                <span className="block text-xs text-muted">{meta}</span>
              </span>
              <span className="text-xs font-medium text-accent">View works</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** Selected filters stay visible as removable chips under the search bar. */
function ActiveFilters({ state, onChange, onClear }: { state: SearchParamsState; onChange: (p: Partial<SearchParamsState>) => void; onClear: () => void }) {
  const count = countActiveFilters(state)
  const publishers = usePublishers()
  const genres = useGenres()
  const authors = usePeople('author', state.authors.length > 0)
  const illustrators = usePeople('illustrator', state.illustrators.length > 0)
  const translators = usePeople('translator', state.translators.length > 0)
  if (!count) return null

  const name = (list: { id: string; name: string }[] | undefined, id: string) => list?.find((x) => x.id === id)?.name ?? '…'
  const chips: { key: string; label: string; remove: () => void }[] = [
    ...state.publishers.map((id) => ({ key: `p${id}`, label: name(publishers.data, id), remove: () => onChange({ publishers: state.publishers.filter((x) => x !== id) }) })),
    ...state.types.map((t) => ({ key: `t${t}`, label: CATEGORY_LABEL[t] ?? t, remove: () => onChange({ types: state.types.filter((x) => x !== t) }) })),
    ...state.genres.map((id) => ({ key: `g${id}`, label: name(genres.data, id), remove: () => onChange({ genres: state.genres.filter((x) => x !== id) }) })),
    ...state.status.map((s) => ({ key: `s${s}`, label: STATUS_LABEL[s] ?? s, remove: () => onChange({ status: state.status.filter((x) => x !== s) }) })),
    ...state.collection.map((c) => ({ key: `c${c}`, label: c === 'owned' ? 'Owned' : 'Want', remove: () => onChange({ collection: state.collection.filter((x) => x !== c) }) })),
    ...state.authors.map((id) => ({ key: `a${id}`, label: `Author: ${name(authors.data, id)}`, remove: () => onChange({ authors: state.authors.filter((x) => x !== id) }) })),
    ...state.illustrators.map((id) => ({ key: `i${id}`, label: `Illustrator: ${name(illustrators.data, id)}`, remove: () => onChange({ illustrators: state.illustrators.filter((x) => x !== id) }) })),
    ...state.translators.map((id) => ({ key: `r${id}`, label: `Translator: ${name(translators.data, id)}`, remove: () => onChange({ translators: state.translators.filter((x) => x !== id) }) })),
  ]

  return (
    <div className="no-scrollbar mt-3 flex items-center gap-1.5 overflow-x-auto">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent-soft py-1 pr-1 pl-3 text-xs font-medium text-accent">
          {c.label}
          <button onClick={c.remove} className="grid size-5 place-items-center rounded-full hover:bg-accent/15" aria-label={`Remove filter ${c.label}`}>
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button onClick={onClear} className="shrink-0 px-2 text-xs font-semibold text-muted underline-offset-2 hover:text-ink hover:underline">
        Clear all
      </button>
    </div>
  )
}
