import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowRight, Bookmark, BookOpen, Library, Search, ShieldCheck } from 'lucide-react'
import { useGenreShelves, usePublishers, useRecentSeries, type ShelfGrouping } from '@/api/catalog'
import { useCollectionStats } from '@/api/collection'
import { useAuth } from '@/contexts/AuthContext'
import { GenreSection } from '@/components/GenreSection'
import { SeriesCard } from '@/components/cards/SeriesCard'
import { CarouselItem, HorizontalBookCarousel } from '@/components/HorizontalBookCarousel'
import { Skeleton, SkeletonShelf } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { openLogin } from '@/components/auth/openLogin'
import { cn, errorMessage } from '@/lib/utils'

const GROUPINGS: { value: ShelfGrouping; label: string }[] = [
  { value: 'author', label: 'Author' },
  { value: 'translator', label: 'Translator' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'illustrator', label: 'Illustrator' },
]
const GROUP_KEY = 'bookshelf-shelf-grouping'

function readGrouping(): ShelfGrouping {
  try {
    const v = localStorage.getItem(GROUP_KEY)
    if (v && GROUPINGS.some((g) => g.value === v)) return v as ShelfGrouping
  } catch {
    /* ignore */
  }
  return 'author'
}

function greeting() {
  const h = new Date().getHours()
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export default function HomePage() {
  const [groupBy, setGroupBy] = useState<ShelfGrouping>(readGrouping)
  const shelves = useGenreShelves(groupBy)
  const recent = useRecentSeries()

  function changeGrouping(g: ShelfGrouping) {
    setGroupBy(g)
    try {
      localStorage.setItem(GROUP_KEY, g)
    } catch {
      /* ignore */
    }
  }

  const catalogEmpty = shelves.isSuccess && shelves.data.length === 0

  return (
    <div className="mx-auto max-w-[1600px] space-y-10 pb-10 sm:space-y-12">
      <Hero />
      <PublisherShortcuts />

      {catalogEmpty ? (
        <div className="px-4 sm:px-6 lg:px-8">
          <EmptyCatalog />
        </div>
      ) : (
        <>
          {/* Recently added */}
          <section className="space-y-3" aria-labelledby="recent-heading">
            <div className="px-4 sm:px-6 lg:px-8">
              <h2 id="recent-heading" className="font-serif text-2xl text-ink sm:text-[1.7rem]">
                Recently added
              </h2>
              <p className="mt-0.5 text-xs text-muted">Newest series on the shelf</p>
            </div>
            {recent.isPending ? (
              <SkeletonShelf title={false} />
            ) : recent.data?.length ? (
              <HorizontalBookCarousel ariaLabel="Recently added series">
                {recent.data.map((s, i) => (
                  <CarouselItem key={s.id}>
                    <SeriesCard series={s} eager={i < 6} />
                  </CarouselItem>
                ))}
              </HorizontalBookCarousel>
            ) : null}
          </section>

          {/* Shelf organization control */}
          <div className="flex flex-col gap-3 border-t border-line px-4 pt-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <h2 className="font-serif text-3xl text-ink">Browse by genre</h2>
              <p className="mt-0.5 text-sm text-muted">Each shelf is organized by author, translator, publisher and illustrator.</p>
            </div>
            <div
              role="radiogroup"
              aria-label="Group shelves by"
              className="no-scrollbar inline-flex max-w-full self-start overflow-x-auto rounded-xl border border-line bg-surface p-1 lg:self-auto"
            >
              {GROUPINGS.map((g) => (
                <button
                  key={g.value}
                  role="radio"
                  aria-checked={groupBy === g.value}
                  onClick={() => changeGrouping(g.value)}
                  className={cn(
                    'relative rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    groupBy === g.value ? 'text-accent-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {groupBy === g.value && (
                    <motion.span layoutId="grouping-pill" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />
                  )}
                  <span className="relative">{g.label}</span>
                </button>
              ))}
            </div>
          </div>

          {shelves.isPending ? (
            <div className="space-y-10">
              <SkeletonShelf />
              <SkeletonShelf />
              <SkeletonShelf />
            </div>
          ) : shelves.isError ? (
            <div className="px-4 sm:px-6 lg:px-8">
              <EmptyState
                icon={AlertCircle}
                title="The shelves didn't load"
                description={errorMessage(shelves.error)}
                action={<Button onClick={() => shelves.refetch()}>Try again</Button>}
              />
            </div>
          ) : (
            <div className={cn('space-y-10 transition-opacity sm:space-y-12', shelves.isPlaceholderData && 'opacity-60')}>
              {shelves.data.map((shelf, i) => (
                <GenreSection key={shelf.genre_slug} shelf={shelf} groupBy={groupBy} index={i} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Hero() {
  const { user, profile, initializing } = useAuth()
  const stats = useCollectionStats()
  const name = profile?.display_name || profile?.username

  return (
    <section className="px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-8 shadow-card sm:px-10 sm:py-10">
        <SpineDecoration />
        <div className="relative max-w-xl">
          <p className="text-xs font-semibold tracking-[0.16em] text-accent uppercase">
            {user ? greeting() : 'Your personal digital library'}
          </p>
          <h1 className="mt-2 font-serif text-[2.1rem] leading-[1.1] text-ink text-balance sm:text-5xl">
            {initializing ? (
              <Skeleton className="h-11 w-72" />
            ) : user ? (
              <>Welcome back{name ? `, ${name}` : ''}.</>
            ) : (
              <>Every volume, every edition, one shelf.</>
            )}
          </h1>
          <p className="mt-3 text-sm text-muted sm:text-base">
            Discover light novels, manga, novels, artbooks and collectibles — then track what you own and what you want next.
          </p>

          {user && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              <StatPill icon={Library} label="Owned" value={stats.data?.owned_count} loading={stats.isPending} />
              <StatPill icon={Bookmark} label="Wishlist" value={stats.data?.want_count} loading={stats.isPending} />
              <StatPill icon={BookOpen} label="Series" value={stats.data?.series_collected} loading={stats.isPending} />
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link to="/search">
              <Button leftIcon={<Search className="size-4" />}>Search the catalog</Button>
            </Link>
            {user ? (
              <Link to="/collection">
                <Button variant="secondary" rightIcon={<ArrowRight className="size-4" />}>
                  My collection
                </Button>
              </Link>
            ) : (
              <Button variant="secondary" onClick={() => openLogin()}>
                Log in to start collecting
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function StatPill({ icon: Icon, label, value, loading }: { icon: typeof Library; label: string; value?: number; loading: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-line bg-paper px-3.5 py-2">
      <Icon className="size-4 text-accent" />
      <div className="leading-tight">
        {loading ? <Skeleton className="h-4 w-8" /> : <p className="text-sm font-semibold text-ink">{(value ?? 0).toLocaleString()}</p>}
        <p className="text-[11px] text-muted">{label}</p>
      </div>
    </div>
  )
}

/** Decorative row of book spines on the right of the hero (hidden on phones). */
function SpineDecoration() {
  const spines = [
    ['#2D6A4F', 150, 30], ['#5C4B8A', 172, 24], ['#8B5A3C', 140, 34], ['#D8EFE3', 160, 20], ['#9A6F05', 178, 28],
    ['#A33D5C', 146, 22], ['#1F6D8A', 166, 32], ['#E2DDD5', 152, 18], ['#2D6A4F', 170, 26],
  ] as const
  return (
    <div aria-hidden className="pointer-events-none absolute right-8 bottom-0 hidden items-end gap-1.5 lg:flex xl:right-12">
      {spines.map(([color, h, w], i) => (
        <motion.div
          key={i}
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.05 * i, type: 'spring', stiffness: 160, damping: 18 }}
          className="relative rounded-t-[3px] shadow-sm"
          style={{ backgroundColor: color, height: h, width: w, transform: i === 6 ? 'rotate(-7deg)' : undefined, transformOrigin: 'bottom left' }}
        >
          <span className="absolute inset-x-1 top-4 h-px bg-white/35" />
          <span className="absolute inset-x-1 top-6 h-px bg-white/25" />
          <span className="absolute inset-x-1 bottom-5 h-px bg-black/15" />
        </motion.div>
      ))}
      <div className="absolute -right-4 -bottom-0 -left-4 h-2 rounded-t bg-line" />
    </div>
  )
}

function PublisherShortcuts() {
  const { data, isPending } = usePublishers()
  if (!isPending && !data?.length) return null
  return (
    <section aria-label="Publisher shortcuts" className="space-y-2.5">
      <p className="px-4 text-xs font-semibold tracking-[0.14em] text-muted uppercase sm:px-6 lg:px-8">Publishers</p>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 sm:px-6 lg:px-8">
        {isPending
          ? Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />)
          : data!.map((p) => (
              <Link
                key={p.id}
                to={`/search?publishers=${p.id}`}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3.5 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:border-accent hover:text-accent"
              >
                {p.logo_url && <img src={p.logo_url} alt="" className="size-5 rounded-full object-cover" loading="lazy" />}
                {p.name}
              </Link>
            ))}
      </div>
    </section>
  )
}

function EmptyCatalog() {
  const { isAdmin } = useAuth()
  return (
    <EmptyState
      icon={BookOpen}
      title="The shelf is empty"
      description={
        isAdmin
          ? 'Add your first series from the admin dashboard, or run supabase/seed.sql to load demo data.'
          : 'No series have been added to the catalog yet. Check back soon.'
      }
      action={
        isAdmin ? (
          <Link to="/admin/series">
            <Button leftIcon={<ShieldCheck className="size-4" />}>Open admin dashboard</Button>
          </Link>
        ) : undefined
      }
    />
  )
}
