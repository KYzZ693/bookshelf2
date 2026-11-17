import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Building2, Loader2, PenLine, Search, X } from 'lucide-react'
import { useQuickSearch } from '@/api/search'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { cn, formatVolume } from '@/lib/utils'
import { CATEGORY_LABEL, MERCH_LABEL, ROLE_LABEL } from '@/lib/labels'
import { Highlight } from '@/components/search/Highlight'
import { resultHref } from '@/components/search/resultHref'
import { CoverImage } from '@/components/CoverImage'
import type { BookFormat, MerchType, PersonRole, SearchRow } from '@/types/db'

/** Navbar search with an instant-results dropdown. Enter opens the full search page. */
export function QuickSearch({ className }: { className?: string }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const debounced = useDebouncedValue(value, 250)
  const { data, isFetching } = useQuickSearch(debounced)

  const flat = useMemo<SearchRow[]>(() => {
    if (!data || !debounced.trim()) return []
    return [...data.series, ...data.books.slice(0, 4), ...data.merchandise.slice(0, 2), ...data.people.slice(0, 3), ...data.publishers.slice(0, 2)]
  }, [data, debounced])

  // "/" or Ctrl/Cmd+K focuses search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = /input|textarea|select/i.test(target.tagName) || target.isContentEditable
      if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => setActive(-1), [debounced])

  function go(href: string) {
    setOpen(false)
    setValue('')
    inputRef.current?.blur()
    navigate(href)
  }

  function submit() {
    if (active >= 0 && flat[active]) return go(resultHref(flat[active]))
    const q = value.trim()
    go(q ? `/search?q=${encodeURIComponent(q)}` : '/search')
  }

  const showPanel = open && value.trim().length > 0

  return (
    <div ref={boxRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(flat.length - 1, i + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(-1, i - 1))
            } else if (e.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            }
          }}
          placeholder="Search titles, authors, publishers…"
          aria-label="Search the catalog"
          aria-expanded={showPanel}
          aria-controls="quick-search-results"
          role="combobox"
          aria-autocomplete="list"
          className="h-9 w-full rounded-full border border-line bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none"
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              setValue('')
              inputRef.current?.focus()
            }}
            className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-faint hover:text-ink"
            aria-label="Clear search"
          >
            {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </button>
        ) : (
          <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-faint lg:block">
            /
          </kbd>
        )}
      </form>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            id="quick-search-results"
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 mt-2 w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
          >
            <div className="max-h-[70vh] overflow-y-auto p-1.5">
              {!data && isFetching && <p className="px-3 py-6 text-center text-sm text-muted">Searching…</p>}
              {data && flat.length === 0 && !isFetching && (
                <p className="px-3 py-6 text-center text-sm text-muted">
                  No close matches for “{debounced}”.
                </p>
              )}
              {flat.map((row, i) => (
                <QuickRow key={`${row.kind}-${row.id}`} row={row} query={debounced} active={i === active} onSelect={() => go(resultHref(row))} />
              ))}
            </div>
            <button
              onClick={submit}
              className="flex w-full items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2.5 text-sm font-medium text-accent hover:bg-surface-2"
            >
              See all results for “{value.trim()}”
              <ArrowRight className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuickRow({ row, query, active, onSelect }: { row: SearchRow; query: string; active: boolean; onSelect: () => void }) {
  const isPerson = row.kind === 'author' || row.kind === 'illustrator' || row.kind === 'translator'
  let meta = ''
  if (row.kind === 'series') meta = `Series · ${CATEGORY_LABEL[row.item_type as BookFormat] ?? ''}`
  else if (row.kind === 'book')
    meta = [row.series_title, row.volume_number != null ? `Vol. ${formatVolume(row.volume_number)}` : null].filter(Boolean).join(' · ')
  else if (row.kind === 'merchandise') meta = `${MERCH_LABEL[row.item_type as MerchType] ?? 'Merchandise'} · ${row.series_title ?? ''}`
  else if (isPerson) meta = `${ROLE_LABEL[row.kind as PersonRole]} · ${row.subtitle ?? 0} books`
  else if (row.kind === 'publisher') meta = `Publisher · ${row.subtitle ?? 0} series`

  return (
    <button
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors', active ? 'bg-surface-2' : 'hover:bg-surface-2')}
    >
      {isPerson || row.kind === 'publisher' ? (
        <span className="grid h-11 w-8 shrink-0 place-items-center rounded-md bg-surface-2 text-muted">
          {row.kind === 'publisher' ? <Building2 className="size-4" /> : <PenLine className="size-4" />}
        </span>
      ) : (
        <CoverImage
          src={row.image_url}
          title={row.title}
          category={row.kind === 'merchandise' ? 'merchandise' : ((row.item_type as BookFormat) ?? 'other')}
          className="w-8 shrink-0"
          rounded="rounded-md"
          sizes="32px"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-sm font-medium text-ink">
          <Highlight text={row.title} query={query} />
        </span>
        <span className="line-clamp-1 text-xs text-muted">{meta}</span>
      </span>
    </button>
  )
}
