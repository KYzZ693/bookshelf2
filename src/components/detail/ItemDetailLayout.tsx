import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, ExternalLink, Info, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SynopsisPanel } from './SynopsisPanel'

export interface InfoRow {
  label: string
  value: ReactNode
  /** Rows with null/undefined/'' values are hidden automatically. */
  wide?: boolean
}

export interface Crumb {
  label: string
  to?: string
}

/**
 * Item page with Information / Synopsis tabs. Tab state lives in the URL
 * (?tab=synopsis) so it survives refresh and is shareable. Omit `synopsis` when the
 * synopsis is shown elsewhere (e.g. inside an OpenableBook); the page then shows the
 * information panel only.
 */
export function ItemDetailLayout({
  crumbs,
  cover,
  eyebrow,
  title,
  subtitle,
  badges,
  actions,
  rows,
  synopsis,
  synopsisLabel = 'Synopsis',
  footer,
  wideCover = false,
}: {
  /** Larger media column (merchandise 3D preview / gallery). */
  wideCover?: boolean
  crumbs: Crumb[]
  cover: ReactNode
  eyebrow?: ReactNode
  title: string
  subtitle?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
  rows: InfoRow[]
  synopsis?: string | null
  synopsisLabel?: string
  footer?: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const hasTabs = synopsis !== undefined
  const tab = hasTabs && params.get('tab') === 'synopsis' ? 'synopsis' : 'info'
  const [dir, setDir] = useState(1)

  function setTab(next: 'info' | 'synopsis') {
    setDir(next === 'synopsis' ? 1 : -1)
    const p = new URLSearchParams(params)
    if (next === 'synopsis') p.set('tab', 'synopsis')
    else p.delete('tab')
    setParams(p, { replace: true })
  }

  const visibleRows = rows.filter((r) => r.value !== null && r.value !== undefined && r.value !== '' && r.value !== false)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex min-w-0 items-center gap-1 text-xs text-muted sm:mb-7">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="size-3 shrink-0 text-faint" />}
            {c.to ? (
              <Link to={c.to} className="truncate hover:text-accent">
                {c.label}
              </Link>
            ) : (
              <span className="truncate text-ink">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div
        className={cn(
          'grid gap-7',
          wideCover
            ? 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12'
            : 'md:grid-cols-[260px_1fr] md:gap-10 lg:grid-cols-[320px_1fr] lg:gap-14',
        )}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            wideCover ? 'w-full lg:sticky lg:top-24 lg:self-start' : 'mx-auto w-48 sm:w-56 md:sticky md:top-24 md:w-full md:self-start',
          )}
        >
          {cover}
        </motion.div>

        <div className="min-w-0">
          {eyebrow && <div className="mb-2 text-sm text-muted">{eyebrow}</div>}
          <h1 className="font-serif text-[1.9rem] leading-[1.15] text-ink text-balance sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
          {badges && <div className="mt-3 flex flex-wrap gap-1.5">{badges}</div>}
          {actions && <div className="mt-5">{actions}</div>}

          {hasTabs ? (
            <div role="tablist" aria-label="Item details" className="mt-8 flex gap-1 border-b border-line">
              <TabButton active={tab === 'info'} onClick={() => setTab('info')} icon={<Info className="size-4" />}>
                Information
              </TabButton>
              <TabButton active={tab === 'synopsis'} onClick={() => setTab('synopsis')} icon={<ScrollText className="size-4" />}>
                {synopsisLabel}
              </TabButton>
            </div>
          ) : (
            <h2 className="mt-8 flex items-center gap-2 border-b border-line pb-2.5 text-sm font-medium text-ink">
              <Info className="size-4" /> Information
            </h2>
          )}

          <div className="relative pt-6">
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={tab}
                role={hasTabs ? 'tabpanel' : undefined}
                custom={dir}
                initial={{ opacity: 0, x: 16 * dir }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 * dir }}
                transition={{ duration: 0.2 }}
              >
                {tab === 'info' ? (
                  <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    {visibleRows.map((r) => (
                      <div key={r.label} className={cn('min-w-0 border-b border-line/70 pb-3', r.wide && 'sm:col-span-2')}>
                        <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{r.label}</dt>
                        <dd className="mt-1 text-sm break-words text-ink">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <SynopsisPanel text={synopsis} title={title} label={synopsisLabel} onBack={() => setTab('info')} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {footer && <div className="mt-10">{footer}</div>}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'relative -mb-px inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-ink' : 'text-muted hover:text-ink',
      )}
    >
      {icon}
      {children}
      {active && <motion.span layoutId="detail-tab" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
    </button>
  )
}

export function PublisherLinkButton({ href, label = 'View publisher website' }: { href: string | null | undefined; label?: string }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors hover:border-violet hover:text-violet"
    >
      <ExternalLink className="size-4" />
      {label}
    </a>
  )
}
