import { memo, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, Check, Loader2 } from 'lucide-react'
import { CoverImage } from '@/components/CoverImage'
import { CategoryBadge } from '@/components/ui/Badge'
import { Highlight } from '@/components/search/Highlight'
import { useCollectionToggle } from '@/api/collection'
import { cn, formatPrice, formatVolume } from '@/lib/utils'
import { CATEGORY_LABEL, MERCH_LABEL } from '@/lib/labels'
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
}

/**
 * Card for a single book, special edition or merchandise item, with an
 * Owned / Want ribbon and quick toggles on hover.
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
  const href = item.kind === 'book' ? `/book/${item.id}` : `/merch/${item.id}`
  const { current, toggle, pendingFor } = useCollectionToggle(item.kind, item.id, item.title)
  const vol = formatVolume(item.volume_number)
  const typeLabel = item.kind === 'merchandise' ? MERCH_LABEL[item.merch_type ?? 'other'] : CATEGORY_LABEL[item.category]
  const price = formatPrice(item.price, item.currency ?? 'THB')
  // Special sets and merchandise are product photos (usually square): show them whole.
  const showcase = item.kind === 'merchandise' || item.category === 'special_edition' || !!item.edition_label

  const act = (target: CollectionStatus) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggle(target)
  }

  return (
    <Link to={href} className={cn('group block w-full rounded-lg focus-visible:outline-offset-4', className)}>
      <div className="relative transition-transform duration-300 ease-out group-hover:-translate-y-1">
        <CoverImage
          src={item.image_url}
          title={item.title}
          subtitle={vol ? `Vol. ${vol}` : typeLabel}
          category={item.category}
          eager={eager}
          aspect={showcase ? 'aspect-square' : 'aspect-[2/3]'}
          fit={showcase ? 'contain' : 'cover'}
          className="transition-shadow duration-300 group-hover:shadow-lift"
        />
        {vol && item.kind === 'book' && (
          <span className="absolute top-2 left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {vol}
          </span>
        )}
        {current && (
          <span
            className={cn(
              'absolute top-2 right-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow-sm',
              current === 'owned' ? 'bg-accent text-accent-ink' : 'bg-want text-white',
            )}
          >
            {current === 'owned' ? <Check className="size-3" /> : <Bookmark className="size-3" />}
            {current === 'owned' ? 'Owned' : 'Want'}
          </span>
        )}
        {quickActions && (
          <div className="absolute inset-x-2 bottom-2 hidden gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:hover)]:flex">
            <QuickButton
              active={current === 'owned'}
              pending={pendingFor === 'owned' || (pendingFor === 'remove' && current === 'owned')}
              onClick={act('owned')}
              label="Owned"
              icon={<Check className="size-3.5" />}
              tone="owned"
            />
            <QuickButton
              active={current === 'want'}
              pending={pendingFor === 'want' || (pendingFor === 'remove' && current === 'want')}
              onClick={act('want')}
              label="Want"
              icon={<Bookmark className="size-3.5" />}
              tone="want"
            />
          </div>
        )}
      </div>
      <div className="mt-2.5 space-y-1">
        <h3 className="line-clamp-2 text-[13px] leading-snug font-semibold text-ink group-hover:text-accent">
          {query ? <Highlight text={item.title} query={query} /> : item.title}
        </h3>
        {showSeries && item.series_title && (
          <p className="truncate text-[11.5px] text-muted">
            {query ? <Highlight text={item.series_title} query={query} /> : item.series_title}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          {item.kind === 'merchandise' ? (
            <span className="rounded-md bg-merch-soft px-1.5 py-0.5 text-[11px] leading-4 font-semibold text-merch">{typeLabel}</span>
          ) : (
            <CategoryBadge category={item.category} />
          )}
          {price && <span className="text-[11.5px] font-medium text-muted">{price}</span>}
        </div>
      </div>
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
}: {
  active: boolean
  pending: boolean
  onClick: (e: MouseEvent) => void
  label: string
  icon: React.ReactNode
  tone: 'owned' | 'want'
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `Remove from ${label}` : `Mark as ${label}`}
      className={cn(
        'flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[11px] font-semibold shadow-sm backdrop-blur-sm transition-colors',
        active
          ? tone === 'owned'
            ? 'bg-accent text-accent-ink'
            : 'bg-want text-white'
          : 'bg-white/90 text-[#1a1814] hover:bg-white',
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  )
}
