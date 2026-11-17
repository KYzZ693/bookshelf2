import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Horizontally scrollable row with snap points, edge fades, and arrow buttons
 * on pointer devices. Touch devices simply swipe.
 */
export function HorizontalBookCarousel({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode
  className?: string
  ariaLabel?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [update, children])

  const scroll = (dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <div className={cn('group/carousel relative', className)}>
      <div
        ref={ref}
        onScroll={update}
        role="list"
        aria-label={ariaLabel}
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pt-1 pb-3 sm:scroll-px-6 sm:gap-4 sm:px-6 lg:scroll-px-8 lg:px-8"
      >
        {children}
        <div className="w-px shrink-0" aria-hidden />
      </div>

      {/* edge fades */}
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-paper to-transparent transition-opacity',
          canLeft ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-paper to-transparent transition-opacity',
          canRight ? 'opacity-100' : 'opacity-0',
        )}
      />

      <ArrowButton side="left" visible={canLeft} onClick={() => scroll(-1)} />
      <ArrowButton side="right" visible={canRight} onClick={() => scroll(1)} />
    </div>
  )
}

function ArrowButton({ side, visible, onClick }: { side: 'left' | 'right'; visible: boolean; onClick: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight
  return (
    <button
      onClick={onClick}
      tabIndex={visible ? 0 : -1}
      aria-label={side === 'left' ? 'Scroll left' : 'Scroll right'}
      className={cn(
        'absolute top-[38%] z-10 hidden size-10 -translate-y-1/2 place-items-center rounded-full border border-line bg-surface text-ink shadow-lift transition-all duration-200 hover:scale-105 hover:text-accent [@media(hover:hover)]:grid',
        side === 'left' ? 'left-2 lg:left-4' : 'right-2 lg:right-4',
        visible ? 'opacity-0 group-hover/carousel:opacity-100 focus-visible:opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <Icon className="size-5" />
    </button>
  )
}

/** Fixed-width slot for a card inside the carousel. */
export function CarouselItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div role="listitem" className={cn('w-[122px] shrink-0 snap-start sm:w-[148px] lg:w-[160px]', className)}>
      {children}
    </div>
  )
}
