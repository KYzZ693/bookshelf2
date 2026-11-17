import { useMemo, useState, type ReactNode } from 'react'
import { Check, Lock, Plus, RotateCcw, Search, X } from 'lucide-react'
import { useGenres, usePeople, usePublishers } from '@/api/catalog'
import { countActiveFilters, type SearchParamsState } from '@/api/search'
import { useAuth } from '@/contexts/AuthContext'
import { openLogin } from '@/components/auth/openLogin'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORY_LABEL, CATEGORY_ORDER, ROLE_LABEL, STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { cn } from '@/lib/utils'
import type { CollectionStatus, PersonRole } from '@/types/db'

type Patch = (next: Partial<SearchParamsState>) => void

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * Compact filter panel. Every change applies immediately (no Apply button);
 * values within a group are OR-ed, groups are AND-ed.
 */
export function FilterPanel({ state, onChange, onClear, resultCount }: { state: SearchParamsState; onChange: Patch; onClear: () => void; resultCount?: number }) {
  const publishers = usePublishers()
  const genres = useGenres()
  const { user } = useAuth()
  const active = countActiveFilters(state)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          Filters
          {resultCount !== undefined && <span className="ml-2 font-normal text-muted">{resultCount.toLocaleString()} results</span>}
        </p>
        <button
          onClick={onClear}
          disabled={!active}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <RotateCcw className="size-3.5" /> Clear{active ? ` (${active})` : ''}
        </button>
      </div>

      <Group label="Publisher">
        {publishers.isPending ? (
          <ChipSkeletons />
        ) : (
          publishers.data?.map((p) => (
            <Chip key={p.id} active={state.publishers.includes(p.id)} onClick={() => onChange({ publishers: toggle(state.publishers, p.id) })}>
              {p.name}
            </Chip>
          ))
        )}
      </Group>

      <Group label="Item type">
        {CATEGORY_ORDER.map((c) => (
          <Chip key={c} active={state.types.includes(c)} onClick={() => onChange({ types: toggle(state.types, c) })}>
            {CATEGORY_LABEL[c]}
          </Chip>
        ))}
      </Group>

      <Group label="Genre">
        {genres.isPending ? (
          <ChipSkeletons />
        ) : (
          genres.data?.map((g) => (
            <Chip key={g.id} active={state.genres.includes(g.id)} onClick={() => onChange({ genres: toggle(state.genres, g.id) })}>
              {g.name}
            </Chip>
          ))
        )}
      </Group>

      <Group label="Completion status">
        {STATUS_ORDER.map((s) => (
          <Chip key={s} active={state.status.includes(s)} onClick={() => onChange({ status: toggle(state.status, s) })}>
            {STATUS_LABEL[s]}
          </Chip>
        ))}
      </Group>

      <Group label="My collection">
        {(['owned', 'want'] as CollectionStatus[]).map((s) => (
          <Chip
            key={s}
            active={state.collection.includes(s)}
            onClick={() => (user ? onChange({ collection: toggle(state.collection, s) }) : openLogin('Sign in to filter by your collection.'))}
          >
            {!user && <Lock className="size-3" />}
            {s === 'owned' ? 'Owned' : 'Want'}
          </Chip>
        ))}
      </Group>

      <div className="grid gap-4 sm:grid-cols-3">
        <PeopleFilter role="author" selected={state.authors} onChange={(v) => onChange({ authors: v })} />
        <PeopleFilter role="illustrator" selected={state.illustrators} onChange={(v) => onChange({ illustrators: v })} />
        <PeopleFilter role="translator" selected={state.translators} onChange={(v) => onChange({ translators: v })} />
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition-colors',
        active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface text-ink hover:border-accent hover:text-accent',
      )}
    >
      {active && <Check className="size-3.5" />}
      {children}
    </button>
  )
}

function ChipSkeletons() {
  return (
    <>
      {[72, 96, 64, 88, 70].map((w, i) => (
        <div key={i} style={{ width: w }}>
          <Skeleton className="h-8 rounded-full" />
        </div>
      ))}
    </>
  )
}

/** Type-ahead multi-select for authors / illustrators / translators. */
function PeopleFilter({ role, selected, onChange }: { role: PersonRole; selected: string[]; onChange: (ids: string[]) => void }) {
  const { data, isPending } = usePeople(role)
  const [q, setQ] = useState('')
  const byId = useMemo(() => new Map((data ?? []).map((p) => [p.id, p])), [data])
  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term || !data) return []
    return data.filter((p) => !selected.includes(p.id) && p.name.toLowerCase().includes(term)).slice(0, 6)
  }, [q, data, selected])

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{ROLE_LABEL[role]}</p>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={isPending ? 'Loading…' : `Find ${ROLE_LABEL[role].toLowerCase()}…`}
          aria-label={`Filter by ${ROLE_LABEL[role].toLowerCase()}`}
          className="h-8 w-full rounded-lg border border-line bg-surface pr-2 pl-8 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-line bg-surface shadow-lift">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    onChange([...selected, p.id])
                    setQ('')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface-2"
                >
                  <Plus className="size-3.5 text-faint" /> {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {q.trim() && !isPending && matches.length === 0 && (
          <p className="mt-1 text-[11px] text-faint">No matching {ROLE_LABEL[role].toLowerCase()}s.</p>
        )}
      </div>
      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pr-1 pl-2.5 text-xs font-medium text-accent">
              {byId.get(id)?.name ?? '…'}
              <button
                onClick={() => onChange(selected.filter((s) => s !== id))}
                className="grid size-4 place-items-center rounded-full hover:bg-accent/15"
                aria-label={`Remove ${byId.get(id)?.name ?? 'filter'}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
