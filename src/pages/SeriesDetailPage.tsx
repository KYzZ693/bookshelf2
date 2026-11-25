import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowRight, BookOpen, ChevronDown, ExternalLink, Gem, Layers, Palette, Sparkles } from 'lucide-react'
import { creditNames, useSeries, useSeriesBooks } from '@/api/catalog'
import { itemKey, useStatusMap } from '@/api/collection'
import { useAuth } from '@/contexts/AuthContext'
import { CoverImage } from '@/components/CoverImage'
import { BookCard, type ItemCardData } from '@/components/cards/BookCard'
import { CategoryBadge, StatusBadge } from '@/components/ui/Badge'
import { Skeleton, SkeletonDetail, SkeletonGrid } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/layout/PageContainer'
import NotFoundPage from './NotFoundPage'
import { bookCategory, EDITION_LABEL } from '@/lib/labels'
import { cn, errorMessage, formatDate, pluralize, splitParagraphs } from '@/lib/utils'
import type { BookListItem, SeriesOverview } from '@/types/db'

export default function SeriesDetailPage() {
  const { id } = useParams()
  const series = useSeries(id)
  const books = useSeriesBooks(id)

  if (series.isPending) {
    return (
      <PageContainer>
        <SkeletonDetail />
        <div className="mt-12">
          <SkeletonGrid count={6} />
        </div>
      </PageContainer>
    )
  }
  if (series.isError) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title="This series didn't load"
          description={errorMessage(series.error)}
          action={<Button onClick={() => series.refetch()}>Try again</Button>}
        />
      </PageContainer>
    )
  }
  if (!series.data) return <NotFoundPage title="Series not found" />

  const s = series.data
  const all = books.data ?? []
  // Regular volumes are the main list. Special editions are reached from their volume's page,
  // so only editions whose regular volume isn't in the catalog get a card of their own here.
  const regular = all.filter((b) => b.edition_type === 'regular' && b.item_type !== 'artbook')
  const artbooks = all.filter((b) => b.item_type === 'artbook')
  const regularIds = new Set(regular.map((b) => b.id))
  const specials = all.filter((b) => b.edition_type !== 'regular' && b.item_type !== 'artbook')
  const specialCount = new Map<string, number>()
  for (const b of specials) if (b.regular_book_id) specialCount.set(b.regular_book_id, (specialCount.get(b.regular_book_id) ?? 0) + 1)
  const standalone = specials.filter((b) => !b.regular_book_id || !regularIds.has(b.regular_book_id))
  const toCard = (b: BookListItem) => bookToCard(b, s, specialCount.get(b.id) ?? 0)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <SeriesHeader s={s} regular={regular} />

      <SectionNav
        seriesId={s.id}
        merchCount={s.merchandise_count}
        items={[
          { id: 'volumes', label: 'Volumes', n: books.isPending ? null : regular.length },
          ...(artbooks.length ? [{ id: 'artbooks', label: 'Artbooks', n: artbooks.length }] : []),
          ...(standalone.length ? [{ id: 'other-editions', label: 'Other editions', n: standalone.length }] : []),
        ]}
      />

      <div className="space-y-14">
        <ItemSection
          id="volumes"
          title="Regular Volumes"
          subtitle={specials.length > standalone.length ? 'Volumes marked “Special” also come as a special edition — open the volume to see it' : undefined}
          icon={<Layers className="size-5" />}
          loading={books.isPending}
          error={books.error}
          items={regular.map(toCard)}
          empty={artbooks.length ? 'This series only has artbooks so far.' : 'No regular volumes have been added yet.'}
        />
        {artbooks.length > 0 && (
          <ItemSection
            id="artbooks"
            title="Artbooks"
            subtitle="Illustration collections and visual books"
            icon={<Palette className="size-5" />}
            loading={false}
            error={null}
            items={artbooks.map(toCard)}
            empty=""
            wide
          />
        )}
        {standalone.length > 0 && (
          <ItemSection
            id="other-editions"
            title="Other editions"
            subtitle="Special editions and sets whose regular volume isn't in the catalog"
            icon={<Sparkles className="size-5" />}
            loading={false}
            error={null}
            items={standalone.map(toCard)}
            empty=""
            wide
          />
        )}
        {s.merchandise_count > 0 && (
          <Link
            to={`/merchandise?series=${s.id}`}
            className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-merch/50"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-merch-soft text-merch">
              <Gem className="size-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-serif text-xl text-ink">Merchandise from this series</span>
              <span className="block text-sm text-muted">{pluralize(s.merchandise_count, 'item')} in the Merchandise gallery — figures, acrylic stands, keychains and more</span>
            </span>
            <ArrowRight className="size-5 text-muted transition-transform group-hover:translate-x-1 group-hover:text-merch" />
          </Link>
        )}
      </div>
    </div>
  )
}

function bookToCard(b: BookListItem, s: SeriesOverview, specials: number): ItemCardData {
  const cat = bookCategory(b)
  const credits = creditNames(b)
  return {
    id: b.id,
    kind: 'book',
    title: b.title,
    image_url: b.cover_url,
    category: cat,
    volume_number: b.volume_number,
    price: b.price,
    currency: b.currency,
    edition_label: b.edition_type !== 'regular' ? EDITION_LABEL[b.edition_type] : null,
    series_title: credits.authors[0]?.name ?? null,
    special_count: specials,
    creator: b.item_type === 'artbook' ? (credits.illustrators[0] ?? credits.authors[0])?.name ?? null : null,
    publisher_name: b.item_type === 'artbook' ? s.publisher_name : null,
    date_label: b.item_type === 'artbook' ? formatDate(b.publication_date, { year: 'numeric', month: 'short' }) : null,
  }
}

function SeriesHeader({ s, regular }: { s: SeriesOverview; regular: BookListItem[] }) {
  const { user } = useAuth()
  const statuses = useStatusMap()
  const [expanded, setExpanded] = useState(false)
  const paragraphs = splitParagraphs(s.description)
  const long = (s.description?.length ?? 0) > 420

  const owned = useMemo(() => {
    if (!statuses.data) return 0
    return regular.filter((b) => statuses.data![itemKey('book', b.id)] === 'owned').length
  }, [statuses.data, regular])
  const total = s.regular_volume_count
  const pct = total ? Math.round((owned / total) * 100) : 0

  return (
    <header className="grid gap-7 md:grid-cols-[240px_1fr] md:gap-10 lg:grid-cols-[280px_1fr]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto w-44 sm:w-52 md:w-full">
        <CoverImage src={s.cover_url} title={s.title} subtitle={s.author_names[0]} category={s.series_type} eager rounded="rounded-xl" sizes="280px" />
      </motion.div>

      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted">
          <Link to="/" className="hover:text-accent">Bookshelf</Link> <span className="text-faint">/</span> Series
        </nav>
        <h1 className="font-serif text-[2rem] leading-[1.12] text-ink text-balance sm:text-[2.6rem]">{s.title}</h1>
        {s.original_title && <p className="mt-1 text-sm text-muted">{s.original_title}</p>}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <CategoryBadge category={s.series_type} />
          <StatusBadge status={s.completion_status} />
          {s.genre_names.map((g, i) => (
            <Link
              key={g}
              to={`/search?genres=${s.genre_ids[i]}`}
              className="rounded-md border border-line px-1.5 py-0.5 text-[11px] leading-4 font-medium text-muted hover:border-accent hover:text-accent"
            >
              {g}
            </Link>
          ))}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Meta label="Volumes" value={pluralize(s.regular_volume_count, 'volume')} />
          {s.special_volume_count > 0 && <Meta label="Special editions" value={s.special_volume_count.toLocaleString()} />}
          {s.publisher_name && (
            <Meta label="Publisher" value={<Link to={`/search?publishers=${s.publisher_id}`} className="hover:text-accent">{s.publisher_name}</Link>} />
          )}
          {s.author_names.length > 0 && <Meta label="Author" value={s.author_names.slice(0, 2).join(', ')} />}
          {s.illustrator_names.length > 0 && <Meta label="Illustrator" value={s.illustrator_names.slice(0, 2).join(', ')} />}
          {s.translator_names.length > 0 && <Meta label="Translator" value={s.translator_names.slice(0, 2).join(', ')} />}
        </dl>

        {paragraphs.length > 0 && (
          <div className="mt-5">
            <div className={cn('relative space-y-3 text-[15px] leading-relaxed text-ink/90', long && !expanded && 'max-h-36 overflow-hidden')}>
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {long && !expanded && <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-paper to-transparent" />}
            </div>
            {long && (
              <button onClick={() => setExpanded((e) => !e)} className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-accent">
                {expanded ? 'Show less' : 'Read more'} <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
              </button>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {user && total > 0 && (
            <div className="min-w-[220px] flex-1 rounded-xl border border-line bg-surface px-4 py-3 sm:max-w-sm">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-ink">Your progress</span>
                {statuses.isPending ? <Skeleton className="h-3 w-16" /> : <span className="text-muted">{owned} / {total} owned</span>}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <motion.div className="h-full rounded-full bg-accent" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} />
              </div>
            </div>
          )}
          {s.publisher_website && (
            <a
              href={s.publisher_website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink hover:border-violet hover:text-violet"
            >
              <ExternalLink className="size-4" /> Publisher website
            </a>
          )}
        </div>
      </div>
    </header>
  )
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-ink">{value}</dd>
    </div>
  )
}

function SectionNav({
  items,
  seriesId,
  merchCount,
}: {
  items: { id: string; label: string; n: number | null }[]
  seriesId: string
  merchCount: number
}) {
  return (
    <nav className="sticky top-16 z-20 -mx-4 mt-10 mb-8 border-b border-line bg-paper/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" aria-label="Series sections">
      <div className="no-scrollbar flex gap-1 overflow-x-auto">
        {items.map((it) => (
          <a
            key={it.id}
            href={`#${it.id}`}
            onClick={(e) => {
              e.preventDefault()
              const el = document.getElementById(it.id)
              if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 128, behavior: 'smooth' })
            }}
            className="inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted transition-colors hover:border-accent hover:text-ink"
          >
            {it.label}
            <span className="rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{it.n ?? '–'}</span>
          </a>
        ))}
        {merchCount > 0 && (
          <Link
            to={`/merchandise?series=${seriesId}`}
            className="ml-auto inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-medium text-merch hover:border-merch"
          >
            <Gem className="size-4" /> Merchandise
            <span className="rounded-full bg-merch-soft px-1.5 text-[11px]">{merchCount}</span>
          </Link>
        )}
      </div>
    </nav>
  )
}

function ItemSection({
  id,
  title,
  subtitle,
  icon,
  loading,
  error,
  items,
  empty,
  wide,
}: {
  /** Bigger, square tiles for product photos (special sets, merchandise). */
  wide?: boolean
  id: string
  title: string
  subtitle?: string
  icon: ReactNode
  loading: boolean
  error: unknown
  items: ItemCardData[]
  empty: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32">
      <div className="mb-5 flex items-end gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
        <div>
          <h2 id={`${id}-title`} className="font-serif text-2xl leading-tight text-ink">
            {title}
            {!loading && items.length > 0 && <span className="ml-2 align-middle text-sm text-muted">{items.length}</span>}
          </h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {loading ? (
        <SkeletonGrid count={6} />
      ) : error ? (
        <EmptyState compact icon={AlertCircle} title="Couldn't load this section" description={errorMessage(error)} />
      ) : items.length === 0 ? (
        <EmptyState compact icon={BookOpen} title="Nothing here yet" description={empty} />
      ) : (
        <div
          className={
            wide
              ? 'grid grid-cols-1 gap-x-4 gap-y-8 min-[420px]:grid-cols-2 md:grid-cols-3 md:gap-x-5 xl:grid-cols-4'
              : 'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
          }
        >
          {items.map((it, i) => (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: Math.min(i, 8) * 0.03 }}
            >
              <BookCard item={it} showSeries={it.kind === 'book' && !!it.series_title} />
            </motion.div>
          ))}
        </div>
      )}
    </section>
  )
}
