import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { useProgressWhileMounted } from '@/lib/progress'
import { PageContainer } from '@/components/layout/PageContainer'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { openLogin } from '@/components/auth/openLogin'
import { RETURN_TO_KEY } from '@/components/auth/AuthForms'

/**
 * OAuth / email-confirmation landing page. supabase-js exchanges the PKCE
 * `?code=` automatically (detectSessionInUrl); we wait for the session and
 * then return the user to where they started.
 */
export default function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  useProgressWhileMounted(!error)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const providerError = params.get('error_description') || hash.get('error_description')
    if (providerError) {
      setError(providerError.replace(/\+/g, ' '))
      return
    }

    let done = false
    const finish = () => {
      if (done) return
      done = true
      let to = '/'
      try {
        to = sessionStorage.getItem(RETURN_TO_KEY) || '/'
        sessionStorage.removeItem(RETURN_TO_KEY)
      } catch {
        /* ignore */
      }
      if (to.startsWith('/auth/') || to.startsWith('/reset-password')) to = '/'
      toast.success('You are signed in')
      navigate(to, { replace: true })
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) finish()
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setError(error.message)
      else if (data.session) finish()
    })
    const timeout = window.setTimeout(() => {
      if (!done) setError('The sign-in link is invalid or has expired.')
    }, 12000)

    return () => {
      sub.subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [navigate])

  return (
    <PageContainer>
      {error ? (
        <EmptyState
          icon={AlertCircle}
          title="We couldn't sign you in"
          description={error}
          action={
            <>
              <Button onClick={() => openLogin()}>Try again</Button>
              <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
                Back to the bookshelf
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Loader2 className="size-7 animate-spin text-accent" />
          <p className="mt-4 font-serif text-2xl text-ink">Opening your library…</p>
          <p className="mt-1 text-sm text-muted">Finishing sign-in securely.</p>
        </div>
      )}
    </PageContainer>
  )
}
