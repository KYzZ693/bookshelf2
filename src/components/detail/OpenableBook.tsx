import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BookOpen, BookOpenText, X } from 'lucide-react'
import { CoverImage } from '@/components/CoverImage'
import { cn, splitParagraphs } from '@/lib/utils'
import { COVER_PALETTE } from '@/lib/labels'
import type { ItemCategory } from '@/types/db'

type Phase = 'closed' | 'enter' | 'open' | 'closing' | 'leave'

const OPEN_EASE = [0.645, 0.045, 0.355, 1] as const

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [vp, setVp] = useState(read)
  useEffect(() => {
    const on = () => setVp(read())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return vp
}

/**
 * A book cover that can be opened. Clicking it lifts the book off the page into the
 * centre of the screen, swings the cover open on its spine and shows the back-cover
 * synopsis on the first page. Closing reverses the animation back into place.
 */
export function OpenableBook({
  coverUrl,
  title,
  subtitle,
  category,
  synopsis,
  meta,
}: {
  coverUrl: string | null | undefined
  title: string
  /** e.g. "Vol. 3" — also shown on the generated cover when there is no image. */
  subtitle?: string | null
  category: ItemCategory
  synopsis: string | null | undefined
  /** Small line under the heading inside the book, e.g. "Vol. 3 · Phoenix Next". */
  meta?: string | null
}) {
  const [phase, setPhase] = useState<Phase>('closed')
  const [from, setFrom] = useState<Rect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const timers = useRef<number[]>([])
  const reduce = useReducedMotion()

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }
  useEffect(() => clearTimers, [])

  const measure = (): Rect | null => {
    const r = triggerRef.current?.getBoundingClientRect()
    return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null
  }

  function openBook() {
    clearTimers()
    setFrom(measure())
    setPhase('enter')
    later(() => setPhase('open'), reduce ? 50 : 560)
  }

  const closeBook = useCallback(() => {
    clearTimers()
    setPhase((p) => (p === 'closed' || p === 'leave' ? p : 'closing'))
    later(() => {
      setFrom(measure())
      setPhase('leave')
    }, reduce ? 50 : 640)
  }, [reduce])

  const finish = useCallback(() => {
    setPhase('closed')
    setFrom(null)
    // Give focus back to the book on the page.
    window.requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }))
  }, [])

  const isOpen = phase !== 'closed'

  return (
    <div>
      <motion.button
        ref={triggerRef}
        type="button"
        onClick={openBook}
        aria-haspopup="dialog"
        aria-label={`Open “${title}” to read the back-cover synopsis`}
        className={cn(
          'group relative block w-full rounded-xl text-left outline-none focus-visible:ring-4 focus-visible:ring-accent/40',
          isOpen && 'invisible',
        )}
        style={{ perspective: 1600 }}
        whileTap={{ scale: 0.985 }}
      >
        <motion.div
          className="preserve-3d relative"
          style={{ transformOrigin: 'left center' }}
          whileHover={reduce ? undefined : { rotateY: -16, x: 6 }}
          transition={{ type: 'spring', stiffness: 220, damping: 22 }}
        >
          <PageEdges />
          <CoverImage
            src={coverUrl}
            title={title}
            subtitle={subtitle}
            category={category}
            eager
            rounded="rounded-xl rounded-l-md"
            className="shadow-book"
            sizes="(min-width: 1024px) 320px, 260px"
          />
          <span className="pointer-events-none absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-lg bg-black/55 px-3 py-2 text-xs font-medium text-white opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <BookOpen className="size-3.5" /> Open the book
          </span>
        </motion.div>
      </motion.button>

      <button
        type="button"
        onClick={openBook}
        className="mx-auto mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-accent"
      >
        <BookOpenText className="size-3.5" />
        {synopsis ? 'Tap the book to read the synopsis' : 'Tap the book to look inside'}
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && from && (
              <ReaderOverlay
                key="reader"
                phase={phase}
                from={from}
                coverUrl={coverUrl}
                title={title}
                subtitle={subtitle}
                category={category}
                synopsis={synopsis}
                meta={meta}
                reduce={!!reduce}
                onClose={closeBook}
                onLeft={finish}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function ReaderOverlay({
  phase,
  from,
  coverUrl,
  title,
  subtitle,
  category,
  synopsis,
  meta,
  reduce,
  onClose,
  onLeft,
}: {
  phase: Phase
  from: Rect
  coverUrl: string | null | undefined
  title: string
  subtitle?: string | null
  category: ItemCategory
  synopsis: string | null | undefined
  meta?: string | null
  reduce: boolean
  onClose: () => void
  onLeft: () => void
}) {
  const { w, h } = useViewport()
  const mobile = w < 768
  const closeRef = useRef<HTMLButtonElement>(null)
  const opened = phase === 'open'
  const paragraphs = splitParagraphs(synopsis)

  // Size of one page (the closed book). Desktop: a two-page spread must fit the screen.
  const pageH = mobile ? Math.min(h - 72, (Math.min(w - 24, 440)) * 1.5) : Math.min(h - 112, 660, ((w - 96) / 2) * 1.5)
  const pageW = mobile ? Math.min(w - 24, 440) : pageH / 1.5
  const left = (w - pageW) / 2
  const top = (h - pageH) / 2

  // FLIP: start exactly where the cover sits on the page.
  const start = {
    x: from.left - left,
    y: from.top - top,
    scaleX: from.width / pageW,
    scaleY: from.height / pageH,
  }
  const leaving = phase === 'leave'
  const target = leaving ? start : { x: opened && !mobile ? pageW / 2 : 0, y: 0, scaleX: 1, scaleY: 1 }

  // Scroll lock, Escape, focus.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  useEffect(() => {
    if (!opened) return
    const t = window.setTimeout(() => closeRef.current?.focus({ preventScroll: true }), reduce ? 0 : 700)
    return () => window.clearTimeout(t)
  }, [opened, reduce])

  const coverAngle = opened ? (mobile ? -112 : -180) : 0
  const [, endpaper] = COVER_PALETTE[category] ?? COVER_PALETTE.other

  return (
    <motion.div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={`Synopsis of ${title}`}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-paper/85 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      />

      <motion.button
        ref={closeRef}
        onClick={onClose}
        className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-surface/85 text-muted shadow-card hover:text-ink sm:top-5 sm:right-5"
        aria-label="Close the book"
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
      >
        <X className="size-5" />
      </motion.button>

      <motion.div
        className="absolute"
        style={{ left, top, width: pageW, height: pageH, transformOrigin: '0 0' }}
        initial={reduce ? { ...target, opacity: 0 } : start}
        animate={{ ...target, opacity: reduce && leaving ? 0 : 1 }}
        transition={
          reduce
            ? { duration: 0.2 }
            : phase === 'enter' || leaving
              ? { duration: leaving ? 0.45 : 0.55, ease: OPEN_EASE }
              : { duration: 0.95, ease: OPEN_EASE }
        }
        onAnimationComplete={() => leaving && onLeft()}
      >
        <div className="preserve-3d relative h-full w-full" style={{ perspective: 2400 }}>
          {/* First page: the back-cover synopsis */}
          <div className="absolute inset-0 overflow-hidden rounded-md rounded-l-sm bg-[#fbf8f1] shadow-book dark:bg-[#1f1d19]">
            {!mobile && (
              <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/12 to-transparent" />
            )}
            <motion.div
              className="relative flex h-full flex-col overflow-y-auto overscroll-contain px-6 pt-7 pb-5 sm:px-9 sm:pt-9"
              initial={false}
              animate={{ opacity: opened ? 1 : 0 }}
              transition={{ delay: opened && !reduce ? 0.45 : 0, duration: 0.3 }}
              style={{ pointerEvents: opened ? 'auto' : 'none' }}
              aria-hidden={!opened}
            >
              <p className="text-[11px] font-semibold tracking-[0.2em] text-accent uppercase">From the back cover</p>
              <h2 className="mt-1.5 font-serif text-2xl leading-tight text-ink sm:text-[1.7rem]">{title}</h2>
              {meta && <p className="mt-1 text-xs text-muted">{meta}</p>}
              <div className="my-5 h-px w-16 bg-line" />

              {paragraphs.length ? (
                <div className="prose-reading space-y-4 text-[15px] leading-[1.85] text-ink">
                  {paragraphs.map((p, i) => (
                    <p key={i} className={cn('whitespace-pre-line', i === 0 && 'first-letter:font-serif first-letter:text-[1.6em]')}>
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
                  <BookOpenText className="size-8 text-faint" />
                  <p className="mt-3 font-serif text-lg text-ink">No synopsis yet</p>
                  <p className="mt-1 max-w-[28ch] text-sm text-muted">The back-cover text for this book hasn't been added to the catalog.</p>
                </div>
              )}

              <div className="mt-auto flex items-center justify-between border-t border-dashed border-line pt-3 text-xs">
                <button onClick={onClose} className="font-medium text-muted hover:text-ink">
                  Close the book
                </button>
                <span className="font-serif text-faint italic">p. 1</span>
              </div>
            </motion.div>
          </div>

          {/* Page edges visible while the book is closed */}
          <motion.div
            className="absolute inset-0"
            animate={{ opacity: opened || phase === 'closing' ? 0 : 1 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          >
            <PageEdges />
          </motion.div>

          {/* The cover, hinged on the spine */}
          <motion.div
            className={cn('preserve-3d absolute inset-0', opened && 'pointer-events-none')}
            style={{ transformOrigin: 'left center' }}
            initial={false}
            animate={{ rotateY: reduce ? (opened ? -180 : 0) : coverAngle, opacity: (mobile || reduce) && opened ? 0 : 1 }}
            transition={{
              rotateY: reduce ? { duration: 0 } : { duration: phase === 'closing' ? 0.6 : 1.05, ease: OPEN_EASE },
              opacity: { delay: mobile && opened && !reduce ? 0.55 : 0, duration: 0.3 },
            }}
          >
            <div className="backface-hidden absolute inset-0">
              <CoverImage
                src={coverUrl}
                title={title}
                subtitle={subtitle}
                category={category}
                eager
                rounded="rounded-md rounded-l-sm"
                className="h-full shadow-book"
                aspect=""
                sizes="440px"
              />
            </div>
            <div className="backface-hidden absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
              <InsideCover color={endpaper} title={title} meta={meta} />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function PageEdges() {
  return (
    <div
      aria-hidden
      className="absolute top-[1.5%] -right-[3.5%] bottom-[1.5%] w-[7%] rounded-r-sm"
      style={{
        background: 'repeating-linear-gradient(90deg, #f3eee2 0 1px, #e3dccb 1px 2px)',
        boxShadow: 'inset -2px 0 3px rgb(0 0 0 / 0.12)',
      }}
    />
  )
}

function InsideCover({ color, title, meta }: { color: string; title: string; meta?: string | null }) {
  return (
    <div className="@container absolute inset-0 overflow-hidden rounded-md rounded-r-sm" style={{ backgroundColor: color }}>
      <div
        aria-hidden
        className="absolute inset-[4%] rounded-sm"
        style={{
          backgroundColor: '#f4efe4',
          backgroundImage: `radial-gradient(${color}26 1.2px, transparent 1.3px)`,
          backgroundSize: '14px 14px',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-[14%]">
        <div className="w-full rounded-sm border px-[8%] py-[12%] text-center" style={{ borderColor: `${color}55`, backgroundColor: '#fffdf8' }}>
          <p className="font-serif text-[7cqw] italic" style={{ color }}>
            Ex Libris
          </p>
          <p className="mt-[6%] line-clamp-4 font-serif text-[8.5cqw] leading-tight text-[#1a1814]">{title}</p>
          <div className="mx-auto my-[8%] h-px w-1/3" style={{ backgroundColor: `${color}55` }} />
          <p className="text-[4.6cqw] leading-relaxed text-[#7a7368]">{meta ?? 'Book Shelf'}</p>
        </div>
      </div>
      <div className="absolute inset-y-0 right-0 w-[8%] bg-gradient-to-l from-black/30 to-transparent" aria-hidden />
    </div>
  )
}
