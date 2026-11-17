import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { errorMessage } from '@/lib/utils'
import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { EmptyState } from '@/components/ui/EmptyState'
import { openLogin } from '@/components/auth/openLogin'

/** Landing page for the password-reset email link. */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [ready, setReady] = useState<'checking' | 'ok' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady('ok')
    })
    supabase.auth.getSession().then(({ data }) => data.session && setReady('ok'))
    const t = window.setTimeout(() => setReady((r) => (r === 'checking' ? 'invalid' : r)), 8000)
    return () => {
      sub.subscription.unsubscribe()
      window.clearTimeout(t)
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof errors = {}
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (confirm !== password) errs.confirm = 'Passwords do not match.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (error) return toast.error('Could not update password', errorMessage(error))
    toast.success('Password updated', 'You are now signed in with your new password.')
    navigate('/', { replace: true })
  }

  return (
    <PageContainer className="max-w-md">
      {ready === 'checking' && (
        <div className="flex flex-col items-center py-24 text-center">
          <Loader2 className="size-7 animate-spin text-accent" />
          <p className="mt-4 text-sm text-muted">Verifying your reset link…</p>
        </div>
      )}
      {ready === 'invalid' && (
        <EmptyState
          icon={KeyRound}
          title="This reset link has expired"
          description="Request a new link from the login book and use it within an hour."
          action={<Button onClick={() => openLogin()}>Open login</Button>}
        />
      )}
      {ready === 'ok' && (
        <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <div className="mb-5 grid size-12 place-items-center rounded-2xl bg-accent-soft text-accent">
            <KeyRound className="size-6" />
          </div>
          <h1 className="font-serif text-3xl text-ink">Choose a new password</h1>
          <p className="mt-1 mb-6 text-sm text-muted">Pick something you haven't used for other sites.</p>
          <div className="space-y-4">
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="size-4" />}
              error={errors.password}
              data-autofocus
            />
            <TextField
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              leftIcon={<Lock className="size-4" />}
              error={errors.confirm}
            />
            <Button type="submit" className="w-full" loading={saving}>
              Update password
            </Button>
          </div>
        </form>
      )}
    </PageContainer>
  )
}
