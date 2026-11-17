import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { toast } from './toast'

let expiredNotified = false

/** Expired / invalid JWT: drop the local session so the UI returns to signed-out. */
function handleAuthError(error: unknown) {
  const e = error as { code?: string; message?: string; status?: number }
  const expired = e?.code === 'PGRST301' || e?.code === 'PGRST303' || /jwt expired|invalid jwt/i.test(e?.message ?? '')
  if (!expired || expiredNotified) return
  expiredNotified = true
  toast.info('Your session has expired', 'Please sign in again.')
  supabase.auth.signOut({ scope: 'local' }).finally(() => {
    window.setTimeout(() => (expiredNotified = false), 5000)
  })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleAuthError }),
  mutationCache: new MutationCache({ onError: handleAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        const code = (error as { code?: string })?.code
        // Don't retry permission / validation errors, only transient ones.
        if (code && /^(PGRST|42|22|23|28)/.test(code)) return false
        return count < 2
      },
    },
    mutations: { retry: false },
  },
})
