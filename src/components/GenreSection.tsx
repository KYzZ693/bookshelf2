import { Fragment, memo } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { SeriesCard } from '@/components/cards/SeriesCard'
import { CarouselItem, HorizontalBookCarousel } from '@/components/HorizontalBookCarousel'
import { pluralize } from '@/lib/utils'
import type { ShelfGrouping } from '@/api/catalog'
import type { GenreShelf } from '@/types/db'

const GROUP_LABEL: Record<ShelfGrouping, string> = {
  author: 'Author',
  translator: 'Translator',
  publisher: 'Publisher',
  illustrator: 'Illustrator',
}

/**
 * One Netflix-style genre row. Series arrive pre-sorted by the database
 * (chosen grouping first, then Author -> Translator -> Publisher -> Illustrator);
 * a slim divider marks where each secondary group begins.
 */
export const GenreSection = memo(function GenreSection({
  shelf,
  groupBy,
  index,
}: {
  shelf: GenreShelf
  groupBy: ShelfGrouping
  index: number
}) {
  const seeAll = shelf.genre_id ? `/search?genres=${shelf.genre_id}` : '/search'
  const hasMore = shelf.genre_total > shelf.series.length

  return (
    <section aria-labelledby={`genre-${shelf.genre_slug}`} className="space-y-3">
      <div className="flex items-end justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h2 id={`genre-${shelf.genre_slug}`} className="font-serif text-2xl leading-tight text-ink sm:text-[1.7rem]">
            {shelf.genre_name}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {pluralize(shelf.genre_total, 'series', 'series')} · grouped by {GROUP_LABEL[groupBy].toLowerCase()}
          </p>
        </div>
        <Link
          to={seeAll}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft"
        >
          {hasMore ? 'See all' : 'Browse'} <ChevronRight className="size-4" />
        </Link>
      </div>

      <HorizontalBookCarousel ariaLabel={`${shelf.genre_name} series`}>
        {shelf.series.map((s, i) => {
          const prev = shelf.series[i - 1]
          const key = s.group_key ?? null
          const newGroup = i === 0 || (prev?.group_key ?? null) !== key
          return (
            <Fragment key={s.id}>
              {newGroup && <GroupMarker label={key} kind={GROUP_LABEL[groupBy]} first={i === 0} />}
              <CarouselItem>
                <SeriesCard series={s} eager={index < 2 && i < 6} />
              </CarouselItem>
            </Fragment>
          )
        })}
      </HorizontalBookCarousel>
    </section>
  )
})

function GroupMarker({ label, kind, first }: { label: string | null; kind: string; first: boolean }) {
  return (
    <div
      role="presentation"
      className={`flex w-7 shrink-0 snap-start items-start justify-center pt-2 ${first ? '' : 'ml-2 border-l border-line'}`}
    >
      <span
        className="max-h-[200px] truncate text-[11px] font-semibold tracking-wide text-muted"
        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        title={label ? `${kind}: ${label}` : `${kind} unknown`}
      >
        {label ?? `Unknown ${kind.toLowerCase()}`}
      </span>
    </div>
  )
}
