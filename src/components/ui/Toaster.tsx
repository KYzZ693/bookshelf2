import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useStore } from '@/lib/store'
import { dismissToast, toastStore } from '@/lib/toast'
import { cn } from '@/lib/utils'

const ICON = { success: CheckCircle2, error: XCircle, info: Info }
const TONE = { success: 'text-accent', error: 'text-danger', info: 'text-violet' }

export function Toaster() {
  const toasts = useStore(toastStore)
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      aria-live="polite"
      role="status"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = ICON[t.kind]
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.15 } }}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lift"
            >
              <Icon className={cn('mt-0.5 size-4.5 shrink-0', TONE[t.kind])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">{t.message}</p>
                {t.description && <p className="mt-0.5 text-xs text-muted">{t.description}</p>}
              </div>
              <button
                onClick={() => dismissToast(t.id)}
                className="-mr-1 grid size-6 place-items-center rounded-md text-faint hover:bg-surface-2 hover:text-ink"
                aria-label="Dismiss notification"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
