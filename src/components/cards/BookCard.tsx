import { memo, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Check, Loader2, Sparkles } from 'lucide-react'
import { CoverImage } from '@/components/CoverImage'
import { CategoryBadge } from '@/components/ui/Badge'
import { Highlight } from '@/components/search/Highlight'
import { useCollectionToggle } from '@/api/collection'
import { cn, formatPrice, formatVolume } from '@/lib/utils'
import { CATEGORY_LABEL, MERCH_ASPECT, MERCH_LABEL } from '@/lib/labels'
import type { CollectionStatus, ItemCategory, ItemKind, MerchType } from '@/types/db'

export interface ItemCardData {
  id: string
  kind: ItemKind
  title: string
  image_url: string | null
  category: ItemCategory
  series_title?: string | null
  volume_number?: number | null
  price?: number | null
  currency?: string | null
  merch_type?: MerchType | null
  edition_label?: string | null
  /** Publisher / manufacturer, shown on framed cards. */
  publisher_name?: string | null
  /** Artist / author line for artbooks. */
  creator?: string | null
  /** Publication or release date (already formatted). */
  date_label?: string | null
  /** Regular volumes: number of special editions that package this volume. */
  special_count?: number
}

/**
 * One catalog item.
 * - Books: book-shaped cover, links to the book page.
 * - Special editions: square, uncropped product photo.
 * - Merchandise: framed product photo (no spine), links to the merchandise preview.
 * - Artbooks: gallery-framed artwork, links to the artbook's page (no opening-book preview).
 */
export const BookCard = memo(function BookCard({
  item,
  className,
  query,
  showSeries = true,
  quickActions = true,
  eager,
}: {
  item: ItemCardData
  className?: string
  query?: string
  showSeries?: boolean
  quickActions?: boolean
  eager?: boolean
}) {
  const { current, toggle, pendingFor } = useCollectionToggle(item.kind, item.id, item.title)
  const vol = formatVolume(item.volume_number)
  const isMerch = item.kind === 'merchandise'
  const isArtbook = item.kind === 'book' && item.category === 'artbook'
  const isSpecial = !isMerch && (item.category === 'special_edition' || !!item.edition_label)
  const typeLabel = isMerch ? MERCH_LABEL[item.merch_type ?? 'other'] : CATEGORY_LABEL[item.category]
  const price = formatPrice(item.price, item.currency ?? 'THB')

  const act = (target: CollectionStatus) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggle(target)
  }
  const buttons = (always: boolean) =>
    quickActions && (
      <div
        className={cn(
          'gap-1.5',
          always
            ? 'mt-2 flex'
            : 'absolute inset-x-2 bottom-2 hidden opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:flex',
        )}
      >
        <QuickButton
          active={current === 'owned'}
          pending={pendingFor === 'owned' || (pendingFor === 'remove' && current === 'owned')}
          onClick={act('owned')}
          label="Owned"
          icon={<Check className="size-3.5" />}
          tone="owned"
          outline={always}
        />
        <QuickButton
          active={current === 'want'}
          pending={pendingFor === 'want' || (pendingFor === 'remove' && current === 'want')}
          onClick={act('want')}
          label="Want"
          icon={<Bookmark className="size-3.5" />}
          tone="want"
          outline={always}
        />
      </div>
    )

  const ribbon = current && (
    <span
      className={cn(
        'absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow-sm',
        current === 'owned' ? 'bg-accent text-accent-ink' : 'bg-want text-white',
      )}
    >
      {current === 'owned' ? <Check className="size-3" /> : <Bookmark className="size-3" />}
      {current === 'owned' ? 'Owned' : 'Want'}
    </span>
  )

  // --- Picture --------------------------------------------------------------
  let picture: ReactNode
  if (isMerch) {
    picture = (
      <div className="rounded-xl border border-line bg-surface p-2 shadow-card transition-[box-shadow,border-color] duration-300 group-hover:border-merch/40 group-hover:shadow-lift">
        <div className="overflow-hidden rounded-lg bg-[#f6f4f0] ring-1 ring-black/5 ring-inset dark:bg-[#26241f]">
          <CoverImage
            src={item.image_url}
            title={item.title}
            subtitle={typeLabel}
            category="merchandise"
            eager={eager}
            plain
            fit="contain"
            rounded="rounded-lg"
            aspect={MERCH_ASPECT[item.merch_type ?? 'other']}
            className="transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </div>
      </div>
    )
  } else if (isArtbook) {
    picture = (
      // Gallery frame: dark moulding + cream mat, so artbooks read as artwork, not products.
      <div className="rounded-[6px] bg-gradient-to-br from-[#3a332b] to-[#1f1b16] p-[7px] shadow-card">
        <div className="bg-[#f4efe4] p-[9%] shadow-[inset_0_1px_3px_rgb(0_0_0/0.25)] dark:bg-[#e9e2d3]">
          <CoverImage
            src={item.image_url}
            title={item.title}
            subtitle={typeLabel}
            category="artbook"
            eager={eager}
            plain
            fit="contain"
            rounded="rounded-[2px]"
            aspect="aspect-[4/5]"
          />
        </div>
      </div>
    )
  } else {
    picture = (
      <CoverImage
        src={item.image_url}
        title={item.title}
        subtitle={vol ? `Vol. ${vol}` : typeLabel}
        category={item.category}
        eager={eager}
        aspect={isSpecial ? 'aspect-square' : 'aspect-[2/3]'}
        fit={isSpecial ? 'contain' : 'cover'}
        className="transition-shadow duration-300 group-hover:shadow-lift"
      />
    )
  }

  const meta = (
    <div className={cn('space-y-1', isMerch || isArtbook ? 'mt-3' : 'mt-2.5')}>
      <h3 className="line-clamp-2 text-[13px] leading-snug font-semibold text-ink group-hover:text-accent">
        {query ? <Highlight text={item.title} query={query} /> : item.title}
      </h3>
      {showSeries && item.series_title && (
        <p className="truncate text-[11.5px] text-muted">
          {query ? <Highlight text={item.series_title} query={query} /> : item.series_title}
        </p>
      )}
      {(isMerch || isArtbook) && (item.creator || item.publisher_name || item.date_label) && (
        <p className="truncate text-[11.5px] text-faint">
          {[item.creator, item.publisher_name, item.date_label].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1 pt-0.5">
        {isMerch ? (
          <span className="rounded-md bg-merch-soft px-1.5 py-0.5 text-[11px] leading-4 font-semibold text-merch">{typeLabel}</span>
        ) : (
          <CategoryBadge category={item.category} />
        )}
        {price && <span className="text-[11.5px] font-medium text-muted">{price}</span>}
      </div>
    </div>
  )

  const href = item.kind === 'book' ? `/book/${item.id}` : `/merch/${item.id}`
  return (
    <Link to={href} className={cn('group block w-full rounded-lg focus-visible:outline-offset-4', className)}>
      <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-1">
        {picture}
        {vol && item.kind === 'book' && (
          <span className="absolute top-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {vol}
          </span>
        )}
        {!!item.special_count && (
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-md bg-special px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm [@media(hover:hover)]:group-hover:opacity-0">
            <Sparkles className="size-3" /> {item.special_count > 1 ? `${item.special_count} special` : 'Special'}
          </span>
        )}
        {ribbon}
        {buttons(false)}
      </div>
      {meta}
    </Link>
  )
})

function QuickButton({
  active,
  pending,
  onClick,
  label,
  icon,
  tone,
  outline,
}: {
  active: boolean
  pending: boolean
  onClick: (e: MouseEvent) => void
  label: string
  icon: React.ReactNode
  tone: 'owned' | 'want'
  outline?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `Remove from ${label}` : `Mark as ${label}`}
      className={cn(
        'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-semibold transition-colors',
        active
          ? tone === 'owned'
            ? 'bg-accent text-accent-ink'
            : 'bg-want text-white'
          : outline
            ? 'border border-line bg-surface text-ink hover:border-accent hover:text-accent'
            : 'bg-white/90 text-[#1a1814] shadow-sm backdrop-blur-sm hover:bg-white',
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  )
}
