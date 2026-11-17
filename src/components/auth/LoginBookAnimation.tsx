import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { ArrowLeft, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { authModal, authModalStore, type AuthView } from '@/lib/authModal'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { ForgotPasswordForm, LoginForm, SignUpForm } from './AuthForms'

type Phase = 'choose' | 'focus' | 'open' | 'closing'
type View = AuthView | 'forgot'

const BOOKS: Record<AuthView, { title: string; tagline: string; from: string; to: string; endpaper: string }> = {
  login: { title: 'LOGIN', tagline: 'Return to your shelf', from: '#2D6A4F', to: '#173D2C', endpaper: '#D8EFE3' },
  signup: { title: 'SIGN UP', tagline: 'Begin a new collection', from: '#5C4B8A', to: '#33285A', endpaper: '#EAE5F5' },
}

const PAGE_HEADINGS: Record<View, { eyebrow: string; title: string }> = {
  login: { eyebrow: 'Chapter I', title: 'Welcome back' },
  signup: { eyebrow: 'Chapter I', title: 'Start your library' },
  forgot: { eyebrow: 'Appendix', title: 'Reset your password' },
}

const OPEN_EASE = [0.645, 0.045, 0.355, 1] as const

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
 * Login / Sign-up experience: two floating books; the chosen one comes to the
 * foreground and its cover swings open (hinged on the spine) to reveal the form.
 * On phones the cover swings away and the page fills the screen.
 */
export function LoginBookAnimation() {
  const { open, initial, reason } = useStore(authModalStore)
  const { user } = useAuth()
  const [book, setBook] = useState<AuthView | null>(null)
  const [view, setView] = useState<View>('login')
  const [phase, setPhase] = useState<Phase>('choose')
  const { w, h } = useViewport()
  const mobile = w < 768
  const timers = useRef<number[]>([])

  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const clearTimers = () => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
  }

  const close = useCallback(() => authModal.close(), [])

  const select = useCallback((k: AuthView) => {
    clearTimers()
    setBook(k)
    setView(k)
    setPhase('focus')
    later(() => setPhase('open'), 560)
  }, [])

  // Opening the overlay
  useEffect(() => {
    if (!open) return
    clearTimers()
    if (initial) {
      // Straight to the requested book (e.g. "Create account" buttons).
      setBook(null)
      setPhase('choose')
      later(() => select(initial), 380)
    } else {
      setBook(null)
      setPhase('choose')
    }
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
      clearTimers()
    }
  }, [open, initial, select, close])

  // Signed in elsewhere (e.g. another tab) -> dismiss.
  useEffect(() => {
    if (user && open) close()
  }, [user, open, close])

  function backToChoose() {
    clearTimers()
    setPhase('closing')
    later(() => {
      setBook(null)
      setPhase('choose')
    }, 620)
  }

  function switchTo(next: View) {
    setView(next)
    if (next === 'login' || next === 'signup') setBook(next)
  }

  // Sizes
  // Books keep a 2:3 ratio and shrink on short screens so the heading stays visible.
  const bookH = Math.max(150, Math.min(mobile ? 192 : 276, h - 300))
  const small = { width: Math.round(bookH / 1.5), height: bookH }
  const pageW = mobile ? Math.min(w - 24, 440) : Math.min(392, (w - 96) / 2)
  const pageH = Math.min(mobile ? 680 : 600, h - (mobile ? 72 : 96))

  return (
    <AnimatePresence
      onExitComplete={() => {
        setBook(null)
        setPhase('choose')
      }}
    >
      {open && (
        <motion.div
          key="auth-overlay"
          className="fixed inset-0 z-[80] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
          role="dialog"
          aria-modal="true"
          aria-label={book ? (book === 'login' ? 'Log in' : 'Sign up') : 'Log in or sign up'}
        >
          <div className="absolute inset-0 bg-paper/88 backdrop-blur-md" onClick={close} aria-hidden />
          {/* faint shelf grain */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-line to-transparent opacity-60"
          />
          <button
            onClick={close}
            className="absolute top-3 right-3 z-10 grid size-10 place-items-center rounded-full bg-surface/80 text-muted shadow-card hover:text-ink sm:top-5 sm:right-5"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>

          <LayoutGroup>
            {phase === 'choose' || !book ? (
              <div className="pointer-events-none relative flex h-full flex-col items-center justify-center gap-6 overflow-y-auto px-4 py-12 sm:gap-10">
                <motion.div
                  className="text-center"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.05 }}
                >
                  <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Welcome to</p>
                  <h2 className="mt-1 font-serif text-4xl text-ink sm:text-5xl">
                    Book<span className="text-accent">Shelf</span>
                  </h2>
                  <p className="mt-3 text-sm text-muted">{reason ?? 'Choose a book to begin.'}</p>
                </motion.div>

                <div className="pointer-events-auto flex items-end gap-7 sm:gap-14" style={{ perspective: 1400 }}>
                  {(['login', 'signup'] as const).map((k, i) => (
                    <FloatingBook key={k} kind={k} index={i} size={small} onSelect={() => select(k)} />
                  ))}
                </div>

                <motion.p
                  className="text-xs text-faint"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  {mobile ? 'Tap' : 'Click'} a book to open it
                </motion.p>
              </div>
            ) : (
              <div className="relative flex h-full items-center justify-center p-3 sm:p-6">
                <OpenBook
                  kind={book}
                  view={view}
                  phase={phase}
                  mobile={mobile}
                  width={pageW}
                  height={pageH}
                  onSwitch={switchTo}
                  onBack={backToChoose}
                  onSuccess={close}
                />
              </div>
            )}
          </LayoutGroup>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
function FloatingBook({
  kind,
  index,
  size,
  onSelect,
}: {
  kind: AuthView
  index: number
  size: { width: number; height: number }
  onSelect: () => void
}) {
  const duration = 4.2 + index * 0.7
  return (
    <div className="relative flex flex-col items-center">
      <motion.button
        layoutId={`auth-book-${kind}`}
        onClick={onSelect}
        className="group relative rounded-md outline-none focus-visible:ring-4 focus-visible:ring-accent/40"
        style={{ width: size.width, height: size.height }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 160, damping: 20, delay: index * 0.08 }}
        whileHover={{ scale: 1.05, rotateY: index === 0 ? 10 : -10 }}
        whileTap={{ scale: 0.97 }}
        aria-label={kind === 'login' ? 'Open the LOGIN book' : 'Open the SIGN UP book'}
      >
        <motion.div
          className="preserve-3d absolute inset-0"
          animate={{ y: [0, -12, 0], rotate: index === 0 ? [-2, 0.5, -2] : [2, -0.5, 2] }}
          transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
        >
          <PageEdges />
          <div className="absolute inset-0 shadow-book rounded-md">
            <BookCover kind={kind} />
          </div>
        </motion.div>
      </motion.button>
      {/* floor shadow breathing with the float */}
      <motion.div
        aria-hidden
        className="mt-5 h-3 rounded-[50%] bg-black/25 blur-md dark:bg-black/60"
        style={{ width: size.width * 0.8 }}
        animate={{ scaleX: [1, 0.82, 1], opacity: [0.55, 0.3, 0.55] }}
        transition={{ duration, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function PageEdges() {
  return (
    <div
      aria-hidden
      className="absolute top-[1.5%] -right-[4%] bottom-[1.5%] w-[8%] rounded-r-sm"
      style={{
        background: 'repeating-linear-gradient(90deg, #f3eee2 0 1px, #e3dccb 1px 2px)',
        boxShadow: 'inset -2px 0 3px rgb(0 0 0 / 0.12)',
      }}
    />
  )
}

function BookCover({ kind }: { kind: AuthView }) {
  const b = BOOKS[kind]
  return (
    <div
      className="@container absolute inset-0 overflow-hidden rounded-md rounded-l-sm text-white"
      style={{ background: `linear-gradient(155deg, ${b.from} 0%, ${b.to} 100%)` }}
    >
      <div className="cover-texture absolute inset-0" aria-hidden />
      <div className="absolute inset-[7%] rounded-sm border border-white/25" aria-hidden />
      <div className="absolute inset-[9.5%] rounded-sm border border-white/10" aria-hidden />
      <div className="relative flex h-full flex-col items-center justify-between px-[12%] py-[17%] text-center">
        <span className="text-[5.2cqw] font-semibold tracking-[0.32em] text-white/70 uppercase">Book Shelf</span>
        <div className="w-full">
          <div className="mx-auto mb-[9%] h-px w-[34%] bg-white/45" />
          <p className="font-serif text-[17cqw] leading-none tracking-wide whitespace-nowrap">{b.title}</p>
          <div className="mx-auto mt-[9%] h-px w-[34%] bg-white/45" />
        </div>
        <span className="font-serif text-[6.6cqw] text-white/85 italic">{b.tagline}</span>
      </div>
      <div className="absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/40 to-black/0" aria-hidden />
      <div className="absolute inset-y-0 left-[7%] w-px bg-white/15" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-br from-white/15 via-transparent to-black/15" aria-hidden />
    </div>
  )
}

function InsideCover({ kind }: { kind: AuthView }) {
  const b = BOOKS[kind]
  return (
    <div className="@container absolute inset-0 overflow-hidden rounded-md rounded-r-sm" style={{ backgroundColor: b.from }}>
      <div
        aria-hidden
        className="absolute inset-[4%] rounded-sm"
        style={{
          backgroundColor: b.endpaper,
          backgroundImage: `radial-gradient(${b.from}22 1.2px, transparent 1.3px)`,
          backgroundSize: '14px 14px',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center p-[14%]">
        <div className="w-full rounded-sm border px-[8%] py-[12%] text-center" style={{ borderColor: `${b.from}55`, backgroundColor: '#fffdf8' }}>
          <p className="font-serif text-[7cqw] italic" style={{ color: b.from }}>
            Ex Libris
          </p>
          <p className="mt-[6%] font-serif text-[11cqw] leading-none text-[#1a1814]">
            Book<span style={{ color: b.from }}>Shelf</span>
          </p>
          <div className="mx-auto my-[8%] h-px w-1/3" style={{ backgroundColor: `${b.from}55` }} />
          <p className="text-[4.6cqw] leading-relaxed text-[#7a7368]">Every collection begins with a single volume.</p>
        </div>
      </div>
      <div className="absolute inset-y-0 right-0 w-[8%] bg-gradient-to-l from-black/30 to-transparent" aria-hidden />
    </div>
  )
}

// ---------------------------------------------------------------------------
function OpenBook({
  kind,
  view,
  phase,
  mobile,
  width,
  height,
  onSwitch,
  onBack,
  onSuccess,
}: {
  kind: AuthView
  view: View
  phase: Phase
  mobile: boolean
  width: number
  height: number
  onSwitch: (v: View) => void
  onBack: () => void
  onSuccess: () => void
}) {
  const opened = phase === 'open'
  const coverAngle = opened ? (mobile ? -112 : -180) : 0
  const pageRef = useRef<HTMLDivElement>(null)
  const heading = PAGE_HEADINGS[view]

  // Move focus into the form once the cover has swung open.
  useEffect(() => {
    if (!opened) return
    const t = window.setTimeout(() => pageRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(), 760)
    return () => window.clearTimeout(t)
  }, [opened, view])

  return (
    <motion.div
      animate={{ x: opened && !mobile ? width / 2 : 0 }}
      transition={{ duration: 0.95, ease: OPEN_EASE }}
      style={{ perspective: 2400 }}
    >
      <motion.div
        layoutId={`auth-book-${kind}`}
        className="preserve-3d relative"
        style={{ width, height }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      >
        {/* The page holding the form */}
        <div className="absolute inset-0 overflow-hidden rounded-md rounded-l-sm bg-[#fbf8f1] shadow-book dark:bg-[#1f1d19]">
          {!mobile && (
            <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-black/12 to-transparent" />
          )}
          <motion.div
            ref={pageRef}
            className="relative h-full overflow-y-auto overscroll-contain px-6 pt-7 pb-6 sm:px-9 sm:pt-9"
            initial={false}
            animate={{ opacity: opened ? 1 : 0 }}
            transition={{ delay: opened ? 0.5 : 0, duration: 0.35 }}
            style={{ pointerEvents: opened ? 'auto' : 'none' }}
            aria-hidden={!opened}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.2em] text-accent uppercase">{heading.eyebrow}</p>
                <h2 className="mt-1 font-serif text-[1.9rem] leading-tight text-ink">{heading.title}</h2>
              </div>
              <span className="mt-1 font-serif text-sm text-faint italic">p. {view === 'signup' ? 2 : 1}</span>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={{ opacity: 0, x: 24, rotateY: -18 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, x: -24, rotateY: 12 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                style={{ transformOrigin: 'left center' }}
              >
                {view === 'login' && (
                  <LoginForm onSuccess={onSuccess} onSwitch={() => onSwitch('signup')} onForgot={() => onSwitch('forgot')} />
                )}
                {view === 'signup' && <SignUpForm onSuccess={onSuccess} onSwitch={() => onSwitch('login')} />}
                {view === 'forgot' && <ForgotPasswordForm onBack={() => onSwitch('login')} />}
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 border-t border-dashed border-line pt-3">
              <button
                onClick={onBack}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink"
              >
                <ArrowLeft className="size-3.5" /> Choose another book
              </button>
            </div>
          </motion.div>
        </div>

        {/* The cover, hinged on the spine */}
        <motion.div
          className={cn('preserve-3d absolute inset-0', opened && 'pointer-events-none')}
          style={{ transformOrigin: 'left center' }}
          initial={false}
          animate={{ rotateY: coverAngle, opacity: mobile && opened ? 0 : 1 }}
          transition={{
            rotateY: { duration: phase === 'closing' ? 0.6 : 1.05, ease: OPEN_EASE },
            opacity: { delay: mobile && opened ? 0.55 : 0, duration: 0.3 },
          }}
        >
          <div className="backface-hidden absolute inset-0 shadow-book rounded-md">
            <BookCover kind={kind} />
          </div>
          <div className="backface-hidden absolute inset-0" style={{ transform: 'rotateY(180deg)' }}>
            <InsideCover kind={kind} />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
