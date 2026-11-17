import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { errorMessage, unwrap } from '@/lib/utils'
import type { Profile } from '@/types/db'
import { qk } from '@/api/keys'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  profileLoading: boolean
  isAdmin: boolean
  adminLoading: boolean
  /** True until the persisted session has been restored on first load. */
  initializing: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)
  const userInitiatedSignOut = useRef(false)
  const hadSession = useRef(false)

  useEffect(() => {
    let mounted = true
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!mounted) return
        if (error) toast.error('Could not restore your session', errorMessage(error))
        setSession(data.session)
        hadSession.current = !!data.session
      })
      .finally(() => mounted && setInitializing(false))

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'SIGNED_OUT') {
        if (hadSession.current && !userInitiatedSignOut.current) {
          toast.info('Your session has expired', 'Please sign in again to keep managing your collection.')
        }
        userInitiatedSignOut.current = false
        // Drop every user-scoped cache entry.
        qc.removeQueries({ queryKey: ['me'] })
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        qc.invalidateQueries({ queryKey: ['me'] })
      }
      hadSession.current = !!next
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [qc])

  const user = session?.user ?? null
  const uid = user?.id

  const profileQuery = useQuery({
    queryKey: qk.profile(uid),
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const row = unwrap(await supabase.from('profiles').select('*').eq('id', uid!).maybeSingle())
      return row as Profile | null
    },
  })

  const adminQuery = useQuery({
    queryKey: qk.isAdmin(uid),
    enabled: !!uid,
    staleTime: 10 * 60_000,
    queryFn: async () => Boolean(unwrap(await supabase.rpc('is_admin'))),
  })

  const signOut = useCallback(async () => {
    userInitiatedSignOut.current = true
    const { error } = await supabase.auth.signOut()
    if (error) {
      // Local sign-out still happens when the server call fails (e.g. offline).
      await supabase.auth.signOut({ scope: 'local' })
    }
    toast.success('Signed out')
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile: profileQuery.data ?? null,
      profileLoading: !!uid && profileQuery.isPending,
      isAdmin: !!adminQuery.data,
      adminLoading: !!uid && adminQuery.isPending,
      initializing,
      signOut,
    }),
    [session, user, uid, profileQuery.data, profileQuery.isPending, adminQuery.data, adminQuery.isPending, initializing, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
