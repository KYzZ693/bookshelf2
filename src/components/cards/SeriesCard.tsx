import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Layers, PenLine, Sparkles } from 'lucide-react'
import { CoverImage } from '@/components/CoverImage'
import { CategoryBadge, StatusBadge } from '@/components/ui/Badge'
import { Highlight } from '@/components/search/Highlight'
import { cn, pluralize } from '@/lib/utils'
import type { BookFormat, CompletionStatus } from '@/types/db'

export interface SeriesCardData {
  id: string
  title: string
  cover_url: string | null
  series_type: BookFormat
  completion_status: CompletionStatus
  genre_names?: string[] | null
  regular_volume_count?: number
  special_volume_count?: number
  publisher_name?: string | null
  author_names?: string[] | null
  original_title?: string | null
}

/**
 * Series card: the cover is the hero; on hover (pointer devices) a panel
 * slides up with genres, author and volume counts.
 */
export const SeriesCard = memo(function SeriesCard({
  series: s,
  className,
  query,
  eager,
}: {
  series: SeriesCardData
  className?: string
  query?: string
  eager?: boolean
}) {
  const volumes = s.regular_volume_count ?? null
  const specials = s.special_volume_count ?? 0
  const author = s.author_names?.[0]

  return (
    <Link
      to={`/series/${s.id}`}
      className={cn('group block w-full rounded-lg focus-visible:outline-offset-4', className)}
      aria-label={`${s.title} — ${s.series_type.replace('_', ' ')} series`}
    >
      <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-1">
        <CoverImage
          src={s.cover_url}
          title={s.title}
          subtitle={author}
          category={s.series_type}
          eager={eager}
          className="transition-shadow duration-300 group-hover:shadow-lift"
        />
        {volumes !== null && volumes > 0 && (
          <span className="absolute top-2 right-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            {volumes} vol{volumes === 1 ? '' : 's'}
          </span>
        )}
        {/* Hover metadata */}
        <div className="pointer-events-none absolute inset-0 hidden flex-col justify-end rounded-lg bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2.5 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [@media(hover:hover)]:flex">
          {!!s.genre_names?.length && (
            <p className="mb-1.5 line-clamp-2 text-[10.5px] leading-snug font-medium text-white/90">
              {s.genre_names.slice(0, 4).join(' · ')}
            </p>
          )}
          <div className="space-y-0.5 text-[10.5px] text-white/75">
            {author && (
              <p className="flex items-center gap-1 truncate">
                <PenLine className="size-3 shrink-0" /> <span className="truncate">{author}</span>
              </p>
            )}
            {volumes !== null && (
              <p className="flex items-center gap-1">
                <Layers className="size-3 shrink-0" /> {pluralize(volumes, 'volume')}
              </p>
            )}
            {specials > 0 && (
              <p className="flex items-center gap-1">
                <Sparkles className="size-3 shrink-0" /> {pluralize(specials, 'special')}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2.5 space-y-1">
        <h3 className="line-clamp-2 text-[13px] leading-snug font-semibold text-ink group-hover:text-accent">
          {query ? <Highlight text={s.title} query={query} /> : s.title}
        </h3>
        {s.publisher_name && <p className="truncate text-[11.5px] text-muted">{s.publisher_name}</p>}
        <div className="flex flex-wrap gap-1 pt-0.5">
          <CategoryBadge category={s.series_type} />
          <StatusBadge status={s.completion_status} />
        </div>
      </div>
    </Link>
  )
})
