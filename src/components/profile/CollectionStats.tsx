import { motion } from 'framer-motion'
import { AlertCircle, Bookmark, BookCheck, Library, Trophy, Wallet } from 'lucide-react'
import { useCollectionStats } from '@/api/collection'
import { Skeleton } from '@/components/ui/Skeleton'
import { CATEGORY_LABEL, CATEGORY_ORDER, COVER_PALETTE } from '@/lib/labels'
import { errorMessage, formatPrice } from '@/lib/utils'

/** Statistics computed by get_collection_stats() from real collection rows. */
export function CollectionStats() {
  const { data, isPending, isError, error } = useCollectionStats()

  if (isError) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
        <AlertCircle className="size-4" /> {errorMessage(error)}
      </p>
    )
  }

  const tiles = [
    { icon: Library, label: 'Owned items', value: data?.owned_count },
    { icon: Bookmark, label: 'Wishlist items', value: data?.want_count },
    { icon: BookCheck, label: 'Series collected', value: data?.series_collected },
    { icon: Trophy, label: 'Series completed', value: data?.series_completed, hint: 'You own every regular volume' },
  ]

  const breakdown = CATEGORY_ORDER.map((c) => ({ c, n: Number(data?.owned_by_type?.[c] ?? 0) })).filter((x) => x.n > 0)
  const max = Math.max(1, ...breakdown.map((b) => b.n))
  const ownedTotal = breakdown.reduce((s, b) => s + b.n, 0)

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="rounded-2xl border border-line bg-surface p-4 shadow-card" title={hint}>
            <Icon className="size-5 text-accent" />
            {isPending ? (
              <Skeleton className="mt-3 h-7 w-12" />
            ) : (
              <p className="mt-2 font-serif text-3xl leading-none text-ink">{(value ?? 0).toLocaleString()}</p>
            )}
            <p className="mt-1.5 text-xs text-muted">{label}</p>
          </div>
        ))}
        <div className="col-span-2 flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
          <Wallet className="size-5 shrink-0 text-violet" />
          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <span className="text-muted">
              Collection value{' '}
              {isPending ? <Skeleton className="inline-block h-4 w-16 align-middle" /> : <span className="font-semibold text-ink">{formatPrice(data?.owned_value ?? 0)}</span>}
            </span>
            <span className="text-muted">
              Wishlist{' '}
              {isPending ? <Skeleton className="inline-block h-4 w-16 align-middle" /> : <span className="font-semibold text-ink">{formatPrice(data?.want_value ?? 0)}</span>}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <h3 className="text-sm font-semibold text-ink">Owned by type</h3>
        <p className="text-xs text-muted">How your shelf is made up</p>
        <div className="mt-4 space-y-3">
          {isPending ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
          ) : breakdown.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">Mark items as Owned to see your breakdown.</p>
          ) : (
            breakdown.map(({ c, n }, i) => (
              <div key={c}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-ink">{CATEGORY_LABEL[c]}</span>
                  <span className="text-muted">
                    {n.toLocaleString()} · {Math.round((n / ownedTotal) * 100)}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: COVER_PALETTE[c][0] }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / max) * 100}%` }}
                    transition={{ duration: 0.7, delay: i * 0.06, ease: 'easeOut' }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
