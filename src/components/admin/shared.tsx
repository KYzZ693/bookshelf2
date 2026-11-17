import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Link2, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, errorMessage, isValidHttpUrl, unwrap } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from '@/lib/image'
import { toast } from '@/lib/toast'
import { uploadCatalogImage } from '@/api/storage'
import { CoverImage } from '@/components/CoverImage'
import { Button } from '@/components/ui/Button'
import { FieldWrapper, inputClass } from '@/components/ui/Field'
import { useDebouncedValue } from '@/hooks/useDebounce'
import type { ItemCategory, Person, PersonRole } from '@/types/db'
import { usePeople } from '@/api/catalog'

// ---------------------------------------------------------------------------
// Validation helpers (mirror the database CHECK constraints)
// ---------------------------------------------------------------------------
export type Errors<T extends string = string> = Partial<Record<T, string>>

export const validate = {
  title(v: string, label = 'Title', max = 300): string | undefined {
    const t = v.trim()
    if (!t) return `${label} is required.`
    if (t.length > max) return `${label} must be ${max} characters or fewer.`
  },
  maxLen(v: string, max: number, label = 'This field'): string | undefined {
    if (v.trim().length > max) return `${label} must be ${max} characters or fewer.`
  },
  url(v: string): string | undefined {
    const t = v.trim()
    if (!t) return
    if (!isValidHttpUrl(t) || t.length > 2048) return 'Enter a full http(s):// URL.'
  },
  nonNegative(v: string, label = 'Value'): string | undefined {
    const t = v.trim()
    if (!t) return
    const n = Number(t)
    if (!Number.isFinite(n)) return `${label} must be a number.`
    if (n < 0) return `${label} cannot be negative.`
  },
  positiveInt(v: string, label = 'Value', max = 20000): string | undefined {
    const t = v.trim()
    if (!t) return
    const n = Number(t)
    if (!Number.isInteger(n) || n < 1 || n > max) return `${label} must be a whole number between 1 and ${max}.`
  },
  isbn(v: string): string | undefined {
    const t = v.trim()
    if (!t) return
    if (!/^[0-9Xx-]{10,17}$/.test(t)) return 'ISBN must be 10–17 digits, hyphens or X.'
  },
  slug(v: string): string | undefined {
    const t = v.trim()
    if (!t) return 'Slug is required.'
    if (t.length > 60 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t)) return 'Use lowercase letters, numbers and single hyphens.'
  },
  currency(v: string): string | undefined {
    if (!/^[A-Z]{3}$/.test(v.trim().toUpperCase())) return 'Use a 3-letter currency code, e.g. THB.'
  },
}

export function hasErrors(e: Record<string, string | undefined>) {
  return Object.values(e).some(Boolean)
}

export const toNull = (v: string) => (v.trim() ? v.trim() : null)
export const toNumber = (v: string) => (v.trim() === '' ? null : Number(v))

export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/** Escape characters with meaning inside a PostgREST ilike / or() filter. */
export function ilikeTerm(s: string) {
  return s.trim().replace(/[%_,()\\*]/g, ' ')
}

// ---------------------------------------------------------------------------
// Series options (used by book & merch forms and filters)
// ---------------------------------------------------------------------------
export interface SeriesOption {
  id: string
  title: string
  series_type: string
  publisher_id: string | null
}

export function useSeriesOptions() {
  return useQuery({
    queryKey: ['admin', 'series-options'],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase.from('series').select('id, title, series_type, publisher_id').order('title').limit(5000),
      ) as SeriesOption[],
  })
}

// ---------------------------------------------------------------------------
// Searchable single select (combobox)
// ---------------------------------------------------------------------------
export interface Option {
  value: string
  label: string
  hint?: string
}

export function SearchableSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select…',
  error,
  required,
  allowClear = true,
  loading,
}: {
  label?: ReactNode
  value: string | null
  onChange: (v: string | null) => void
  options: Option[]
  placeholder?: string
  error?: string
  required?: boolean
  allowClear?: boolean
  loading?: boolean
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    return list.slice(0, 80)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => setActive(0), [query])

  function pick(o: Option) {
    onChange(o.value)
    setOpen(false)
    setQuery('')
  }

  return (
    <FieldWrapper label={label} error={error} htmlFor={id} required={required}>
      <div ref={ref} className="relative">
        <div className="relative">
          <input
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-invalid={error ? true : undefined}
            autoComplete="off"
            className={cn(inputClass, 'pr-16')}
            placeholder={selected ? selected.label : placeholder}
            value={open ? query : (selected?.label ?? '')}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setOpen(true)
                setActive((a) => Math.min(a + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter' && open) {
                e.preventDefault()
                if (filtered[active]) pick(filtered[active])
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
          />
          <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
            {loading && <Loader2 className="size-4 animate-spin text-faint" />}
            {allowClear && value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="grid size-6 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-ink"
                aria-label="Clear selection"
              >
                <X className="size-3.5" />
              </button>
            )}
            <ChevronDown className="size-4 text-faint" aria-hidden />
          </div>
        </div>
        {open && (
          <ul
            id={`${id}-list`}
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lift"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted">No matches</li>
            ) : (
              filtered.map((o, i) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                    i === active ? 'bg-surface-2 text-ink' : 'text-ink',
                  )}
                >
                  <span className="min-w-0 truncate">
                    {o.label}
                    {o.hint && <span className="ml-2 text-xs text-faint">{o.hint}</span>}
                  </span>
                  {o.value === value && <Check className="size-4 shrink-0 text-accent" />}
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </FieldWrapper>
  )
}

// ---------------------------------------------------------------------------
// Toggle-chip multi select (genres)
// ---------------------------------------------------------------------------
export function ChipMultiSelect({
  label,
  options,
  value,
  onChange,
  hint,
}: {
  label?: ReactNode
  options: Option[]
  value: string[]
  onChange: (v: string[]) => void
  hint?: ReactNode
}) {
  const set = new Set(value)
  return (
    <FieldWrapper label={label} hint={hint}>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = set.has(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                on
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-surface text-muted hover:border-accent/50 hover:text-ink',
              )}
            >
              {on && <Check className="size-3" />}
              {o.label}
            </button>
          )
        })}
        {options.length === 0 && <span className="text-sm text-faint">Nothing to choose yet.</span>}
      </div>
    </FieldWrapper>
  )
}

// ---------------------------------------------------------------------------
// People picker: pick existing people or type a new name
// ---------------------------------------------------------------------------
export interface PersonPick {
  id: string | null
  name: string
}

export function PeoplePicker({
  role,
  label,
  value,
  onChange,
}: {
  role: PersonRole
  label: ReactNode
  value: PersonPick[]
  onChange: (v: PersonPick[]) => void
}) {
  const id = useId()
  const { data: people = [], isPending } = usePeople(role)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const chosen = new Set(value.map((p) => p.name.toLowerCase()))
  const q = query.trim().toLowerCase()
  const suggestions = useMemo(
    () => people.filter((p) => !chosen.has(p.name.toLowerCase()) && (!q || p.name.toLowerCase().includes(q))).slice(0, 12),
    [people, q, value], // `chosen` is derived from `value`
  )
  const exact = people.find((p) => p.name.toLowerCase() === q)
  const canCreate = q.length > 0 && !exact && !chosen.has(q) && q.length <= 160

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  useEffect(() => setActive(0), [q])

  function add(p: PersonPick) {
    if (chosen.has(p.name.toLowerCase())) return
    onChange([...value, p])
    setQuery('')
  }
  function addFromQuery() {
    const name = query.trim().replace(/\s+/g, ' ')
    if (!name) return
    const existing = people.find((p) => p.name.toLowerCase() === name.toLowerCase())
    add(existing ? { id: existing.id, name: existing.name } : { id: null, name })
  }

  return (
    <FieldWrapper label={label} htmlFor={id} hint="Pick from the list or type a new name and press Enter.">
      <div ref={ref} className="relative">
        <div
          className={cn(inputClass, 'flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5')}
          onClick={() => document.getElementById(id)?.focus()}
        >
          {value.map((p, i) => (
            <span
              key={`${p.name}-${i}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium',
                p.id ? 'bg-surface-2 text-ink' : 'bg-accent-soft text-accent',
              )}
              title={p.id ? undefined : 'Will be created on save'}
            >
              {p.name}
              {!p.id && <span className="text-[10px] uppercase opacity-70">new</span>}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(value.filter((_, j) => j !== i))
                }}
                className="rounded text-muted hover:text-danger"
                aria-label={`Remove ${p.name}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            value={query}
            autoComplete="off"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onKeyDown={(e) => {
              const total = suggestions.length + (canCreate ? 1 : 0)
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                if (active < suggestions.length && suggestions[active] && q) {
                  add({ id: suggestions[active].id, name: suggestions[active].name })
                } else addFromQuery()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, Math.max(total - 1, 0)))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Backspace' && !query && value.length) {
                onChange(value.slice(0, -1))
              } else if (e.key === 'Escape') setOpen(false)
            }}
            placeholder={value.length ? '' : 'Type a name…'}
            className="min-w-28 flex-1 bg-transparent px-1 py-0.5 text-sm text-ink outline-none placeholder:text-faint"
          />
          {isPending && <Loader2 className="size-3.5 animate-spin text-faint" />}
        </div>
        {open && (suggestions.length > 0 || canCreate) && (
          <ul className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-lift">
            {suggestions.map((p, i) => (
              <li
                key={p.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add({ id: p.id, name: p.name })}
                onMouseEnter={() => setActive(i)}
                className={cn('cursor-pointer rounded-lg px-3 py-2 text-sm', i === active && 'bg-surface-2')}
              >
                {p.name}
              </li>
            ))}
            {canCreate && (
              <li
                onMouseDown={(e) => e.preventDefault()}
                onClick={addFromQuery}
                onMouseEnter={() => setActive(suggestions.length)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-accent',
                  active === suggestions.length && 'bg-surface-2',
                )}
              >
                <Plus className="size-3.5" /> Add “{query.trim()}”
              </li>
            )}
          </ul>
        )}
      </div>
    </FieldWrapper>
  )
}

export function toPersonPicks(list: { position: number; person: Person | null }[]): PersonPick[] {
  return [...list]
    .sort((a, b) => a.position - b.position)
    .map((x) => x.person)
    .filter((p): p is Person => !!p)
    .map((p) => ({ id: p.id, name: p.name }))
}

// ---------------------------------------------------------------------------
// Image upload field
// ---------------------------------------------------------------------------
export function ImageUploadField({
  label = 'Cover image',
  value,
  onChange,
  folder,
  title,
  category = 'light_novel',
  error,
  aspect = 'aspect-[2/3]',
  onUploadingChange,
}: {
  label?: ReactNode
  value: string
  onChange: (url: string) => void
  folder: 'series' | 'books' | 'merchandise' | 'publishers'
  title: string
  category?: ItemCategory
  error?: string
  aspect?: string
  onUploadingChange?: (uploading: boolean) => void
}) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [showUrl, setShowUrl] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    const problem = validateImageFile(file)
    if (problem) {
      toast.error(problem)
      return
    }
    setUploading(true)
    onUploadingChange?.(true)
    try {
      const url = await uploadCatalogImage(file, folder)
      onChange(url)
      toast.success('Image uploaded')
    } catch (err) {
      toast.error('Upload failed', errorMessage(err))
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <FieldWrapper label={label} error={error} htmlFor={inputId}>
      <div className="flex gap-4">
        <div className="relative w-24 shrink-0 sm:w-28">
          <CoverImage src={value || null} title={title || 'Untitled'} category={category} aspect={aspect} />
          {uploading && (
            <div className="absolute inset-0 grid place-items-center rounded-lg bg-black/45 text-white">
              <Loader2 className="size-6 animate-spin" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            className="sr-only"
            id={`${inputId}-file`}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<ImagePlus className="size-3.5" />}
              loading={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {value ? 'Replace image' : 'Upload image'}
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<Link2 className="size-3.5" />} onClick={() => setShowUrl((s) => !s)}>
              Use URL
            </Button>
            {value && (
              <Button variant="ghost" size="sm" leftIcon={<X className="size-3.5" />} onClick={() => onChange('')}>
                Remove
              </Button>
            )}
          </div>
          {(showUrl || (value && !value.includes('/storage/v1/object/public/'))) && (
            <input
              id={inputId}
              type="url"
              inputMode="url"
              placeholder="https://…"
              className={inputClass}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          )}
          <p className="text-xs text-faint">JPG, PNG, WebP or AVIF. Large images are resized automatically.</p>
        </div>
      </div>
    </FieldWrapper>
  )
}

// ---------------------------------------------------------------------------
// List building blocks
// ---------------------------------------------------------------------------
export function ListToolbar({
  search,
  onSearch,
  placeholder = 'Search…',
  children,
  actions,
}: {
  search: string
  onSearch: (v: string) => void
  placeholder?: string
  children?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className={cn(inputClass, 'pl-9')}
            aria-label={placeholder}
          />
        </div>
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="px-2 tabular-nums">
          {page + 1} / {pages}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={page + 1 >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/** A list row that reads as a table row on desktop and a compact card on mobile. */
export function AdminRow({
  thumb,
  title,
  meta,
  badges,
  onEdit,
  onDelete,
  extra,
}: {
  thumb?: ReactNode
  title: ReactNode
  meta?: ReactNode
  badges?: ReactNode
  onEdit?: () => void
  onDelete?: () => void
  extra?: ReactNode
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-3 sm:px-4">
      {thumb && <div className="w-11 shrink-0 sm:w-12">{thumb}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
          <p className="min-w-0 truncate text-sm font-medium text-ink">{title}</p>
          {badges && <div className="flex flex-wrap gap-1">{badges}</div>}
        </div>
        {meta && <div className="mt-0.5 truncate text-xs text-muted">{meta}</div>}
      </div>
      {extra}
      <div className="flex shrink-0 items-center gap-0.5">
        {onEdit && (
          <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="Edit">
            <Pencil className="size-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            aria-label="Delete"
            className="hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  )
}

export function ListCard({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{children}</ul>
}

export function useDebouncedSearch(initial = '') {
  const [search, setSearch] = useState(initial)
  const debounced = useDebouncedValue(search, 300)
  return { search, setSearch, debounced }
}

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>
}

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h3 className="border-b border-line pb-1.5 text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}
