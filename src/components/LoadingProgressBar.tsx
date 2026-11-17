import { useEffect, useRef, useState } from 'react'
import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useStore } from '@/lib/store'
import { progressStore } from '@/lib/progress'

/**
 * NProgress-style bar fixed to the top of the viewport.
 * Active while: a lazy route chunk loads (Suspense), a page's first data fetch
 * is in flight (queries flagged meta.progress), or a mutation is saving.
 * Background refetches of cached data do not trigger it.
 */
export function LoadingProgressBar() {
  const manual = useStore(progressStore)
  const fetching = useIsFetching({
    predicate: (q) => q.meta?.progress === true && q.state.data === undefined,
  })
  const mutating = useIsMutating()
  const active = manual > 0 || fetching > 0 || mutating > 0

  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(false)
  const trickle = useRef<number | null>(null)
  const hide = useRef<number | null>(null)
  const showDelay = useRef<number | null>(null)

  useEffect(() => {
    const clear = () => {
      if (trickle.current) window.clearInterval(trickle.current)
      if (hide.current) window.clearTimeout(hide.current)
      if (showDelay.current) window.clearTimeout(showDelay.current)
      trickle.current = hide.current = showDelay.current = null
    }

    if (active) {
      clear()
      // Avoid flashing the bar for operations that finish almost instantly.
      showDelay.current = window.setTimeout(() => {
        setVisible(true)
        setProgress((p) => (p > 0 && p < 0.9 ? p : 0.08))
        trickle.current = window.setInterval(() => {
          setProgress((p) => {
            if (p >= 0.94) return p
            const step = p < 0.3 ? 0.07 : p < 0.6 ? 0.035 : p < 0.85 ? 0.015 : 0.004
            return Math.min(0.94, p + step * (0.6 + Math.random() * 0.8))
          })
        }, 220)
      }, 90)
    } else {
      clear()
      setVisible((wasVisible) => {
        if (wasVisible) {
          setProgress(1)
          hide.current = window.setTimeout(() => {
            setVisible(false)
            setProgress(0)
          }, 320)
        }
        return wasVisible
      })
    }
    return clear
  }, [active])

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]"
      role="progressbar"
      aria-hidden={!visible}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-label="Page loading"
    >
      <div
        className="h-full origin-left bg-accent shadow-[0_0_8px_var(--accent)]"
        style={{
          transform: `scaleX(${progress})`,
          opacity: visible ? 1 : 0,
          transition: `transform ${progress === 1 ? 180 : 260}ms ease-out, opacity ${visible && progress < 1 ? 120 : 300}ms ease ${progress === 1 ? '120ms' : '0ms'}`,
        }}
      />
    </div>
  )
}

/** Suspense fallback: keeps the bar running while a lazy page chunk downloads. */
export function RouteProgress() {
  useEffect(() => {
    progressStore.set((n) => n + 1)
    return () => progressStore.set((n) => Math.max(0, n - 1))
  }, [])
  return <div className="min-h-[60vh]" aria-hidden />
}
