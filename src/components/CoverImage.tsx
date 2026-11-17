import { memo, useState } from 'react'
import { cn, hashString } from '@/lib/utils'
import { COVER_PALETTE } from '@/lib/labels'
import type { ItemCategory } from '@/types/db'

/**
 * Book cover with lazy loading, fade-in and a typographic fallback cover
 * (generated from title + category) when no image exists or it fails to load.
 */
export const CoverImage = memo(function CoverImage({
  src,
  title,
  subtitle,
  category = 'light_novel',
  className,
  rounded = 'rounded-lg',
  eager,
  sizes = '(min-width: 1024px) 160px, (min-width: 640px) 148px, 122px',
  aspect = 'aspect-[2/3]',
}: {
  src: string | null | undefined
  title: string
  subtitle?: string | null
  category?: ItemCategory
  className?: string
  rounded?: string
  eager?: boolean
  sizes?: string
  aspect?: string
}) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const showImage = !!src && !failed

  return (
    <div className={cn('@container relative overflow-hidden bg-surface-2 shadow-card', aspect, rounded, className)}>
      {showImage ? (
        <img
          src={src!}
          alt={title}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          sizes={sizes}
          width={320}
          height={480}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : (
        <GeneratedCover title={title} subtitle={subtitle} category={category} />
      )}
      {showImage && !loaded && <div className="skeleton absolute inset-0" aria-hidden />}
      {/* subtle spine shading so every cover reads as a physical book */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/20 via-black/5 to-transparent"
      />
    </div>
  )
})

function GeneratedCover({ title, subtitle, category }: { title: string; subtitle?: string | null; category: ItemCategory }) {
  const [from, to] = COVER_PALETTE[category] ?? COVER_PALETTE.other
  const variant = hashString(title) % 3
  return (
    <div
      className="absolute inset-0 flex flex-col justify-between p-[9%] text-white"
      style={{ backgroundColor: from }}
      role="img"
      aria-label={title}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: `linear-gradient(160deg, ${from} 0%, ${to} 100%)` }}
      />
      <div className="cover-texture absolute inset-0" aria-hidden />
      {variant === 0 && <div className="absolute inset-[6%] rounded-sm border border-white/25" aria-hidden />}
      {variant === 1 && <div className="absolute top-[38%] right-0 left-0 h-px bg-white/30" aria-hidden />}
      {variant === 2 && <div className="absolute right-[9%] bottom-[9%] size-[22%] rounded-full border border-white/30" aria-hidden />}
      <span className="relative text-[clamp(7px,3.6cqw,10px)] font-semibold tracking-[0.18em] text-white/70 uppercase">
        Book Shelf
      </span>
      <div className="relative">
        <p className="line-clamp-4 font-serif text-[clamp(12px,11cqw,22px)] leading-[1.1] text-balance">{title}</p>
        {subtitle && <p className="mt-1.5 line-clamp-1 text-[clamp(8px,6cqw,12px)] text-white/75">{subtitle}</p>}
      </div>
    </div>
  )
}
