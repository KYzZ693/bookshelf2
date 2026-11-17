import { forwardRef } from 'react'
import { Loader2, Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Large search input with an integrated filter toggle. */
export const SearchBar = forwardRef<
  HTMLInputElement,
  {
    value: string
    onChange: (v: string) => void
    onSubmit?: () => void
    loading?: boolean
    filterCount: number
    filtersOpen: boolean
    onToggleFilters: () => void
    autoFocus?: boolean
  }
>(function SearchBar({ value, onChange, onSubmit, loading, filterCount, filtersOpen, onToggleFilters, autoFocus }, ref) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
      className="relative flex items-center gap-2"
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-faint" />
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          type="search"
          enterKeyHint="search"
          placeholder="Series, books, authors, illustrators, translators, publishers…"
          aria-label="Search the catalog"
          className="h-13 w-full rounded-2xl border border-line bg-surface pr-12 pl-12 text-base text-ink shadow-card placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent/12 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center">
          {loading ? (
            <Loader2 className="size-4 animate-spin text-faint" aria-label="Searching" />
          ) : value ? (
            <button
              type="button"
              onClick={() => onChange('')}
              className="grid size-7 place-items-center rounded-full text-faint hover:bg-surface-2 hover:text-ink"
              aria-label="Clear search text"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onToggleFilters}
        aria-expanded={filtersOpen}
        aria-controls="search-filters"
        aria-label={`Filters${filterCount ? ` (${filterCount} active)` : ''}`}
        className={cn(
          'relative grid size-13 shrink-0 place-items-center rounded-2xl border shadow-card transition-colors',
          filtersOpen || filterCount ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-muted hover:text-ink',
        )}
      >
        <SlidersHorizontal className="size-5" />
        {filterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] leading-5 font-bold text-accent-ink">
            {filterCount}
          </span>
        )}
      </button>
    </form>
  )
})
