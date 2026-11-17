import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} />
}

/** Matches BookCard / SeriesCard dimensions so content swaps in without layout shift. */
export function SkeletonCard({ className, withMeta = true }: { className?: string; withMeta?: boolean }) {
  return (
    <div className={cn('w-full', className)} aria-hidden>
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      {withMeta && (
        <div className="mt-2.5 space-y-1.5">
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-1 pt-0.5">
            <Skeleton className="h-4 w-14 rounded" />
            <Skeleton className="h-4 w-12 rounded" />
          </div>
        </div>
      )}
    </div>
  )
}

export function SkeletonShelf({ count = 8, title = true }: { count?: number; title?: boolean }) {
  return (
    <section className="space-y-3" aria-busy="true" aria-label="Loading shelf">
      {title && (
        <div className="flex items-end justify-between px-4 sm:px-6 lg:px-8">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      )}
      <div className="flex gap-3 overflow-hidden px-4 sm:gap-4 sm:px-6 lg:px-8">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="w-[122px] shrink-0 sm:w-[148px] lg:w-[160px]">
            <SkeletonCard />
          </div>
        ))}
      </div>
    </section>
  )
}

export function SkeletonGrid({ count = 12, className }: { count?: number; className?: string }) {
  return (
    <div
      aria-busy="true"
      className={cn('grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6', className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]" aria-busy="true">
      <Skeleton className="mx-auto aspect-[2/3] w-56 rounded-xl md:w-full" />
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-4/5" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="flex gap-2 pt-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </div>
        <div className="grid gap-3 pt-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3">
          <Skeleton className="h-14 w-10 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  )
}
