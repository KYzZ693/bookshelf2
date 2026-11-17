import { useEffect } from 'react'
import { createStore } from './store'

/** Number of in-flight "major" operations driving the top progress bar. */
export const progressStore = createStore(0)

/** Start a tracked operation. Call the returned function once when it finishes. */
export function startProgress(): () => void {
  let done = false
  progressStore.set((n) => n + 1)
  return () => {
    if (done) return
    done = true
    progressStore.set((n) => Math.max(0, n - 1))
  }
}

/** Wrap a promise so the progress bar runs while it is pending. */
export async function withProgress<T>(promise: Promise<T>): Promise<T> {
  const done = startProgress()
  try {
    return await promise
  } finally {
    done()
  }
}

/** Keeps the progress bar running for as long as the calling component is mounted. */
export function useProgressWhileMounted(active = true) {
  useEffect(() => {
    if (!active) return
    return startProgress()
  }, [active])
}
