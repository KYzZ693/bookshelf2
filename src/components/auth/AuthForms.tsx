import { useEffect, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { Check, Eye, EyeOff, Loader2, Lock, Mail, MailCheck, UserRound, X } from 'lucide-react'
import { supabase, appUrl } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { isUsernameAvailable, USERNAME_RE } from '@/api/profile'
import { useDebouncedValue } from '@/hooks/useDebounce'

export const RETURN_TO_KEY = 'bookshelf-return-to'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function authError(message: string | undefined): string {
  const m = message ?? ''
  if (/invalid login credentials/i.test(m)) return 'Incorrect email or password.'
  if (/email not confirmed/i.test(m)) return 'Please confirm your email first — check your inbox for the link.'
  if (/already registered|already exists/i.test(m)) return 'An account with this email already exists. Try logging in.'
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Please wait a moment and try again.'
  if (/password should be at least/i.test(m)) return 'Password is too short.'
  if (/failed to fetch|network/i.test(m)) return 'Network error — check your connection.'
  return m || 'Something went wrong. Please try again.'
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function GoogleButton({ label }: { label: string }) {
  const [loading, setLoading] = useState(false)
  const location = useLocation()
  async function go() {
    setLoading(true)
    try {
      sessionStorage.setItem(RETURN_TO_KEY, location.pathname + location.search)
    } catch {
      /* ignore */
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appUrl('auth/callback'), queryParams: { prompt: 'select_account' } },
    })
    if (error) {
      setLoading(false)
      toast.error('Google sign-in failed', authError(error.message))
    }
    // On success the browser navigates to Google.
  }
  return (
    <Button variant="secondary" className="w-full" onClick={go} loading={loading} leftIcon={<GoogleIcon />}>
      {label}
    </Button>
  )
}

function Divider() {
  return (
    <div className="my-4 flex items-center gap-3 text-[11px] tracking-[0.14em] text-faint uppercase">
      <span className="h-px flex-1 bg-line" />
      or
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid size-7 place-items-center rounded-md text-faint hover:text-ink"
      aria-label={shown ? 'Hide password' : 'Show password'}
    >
      {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  )
}

// ---------------------------------------------------------------------------
export function LoginForm({
  onSuccess,
  onSwitch,
  onForgot,
}: {
  onSuccess: () => void
  onSwitch: () => void
  onForgot: () => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErr, setFieldErr] = useState<{ email?: string; password?: string }>({})

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: typeof fieldErr = {}
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (!password) errs.password = 'Enter your password.'
    setFieldErr(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) return setError(authError(error.message))
    toast.success('Welcome back')
    onSuccess()
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3.5">
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftIcon={<Mail className="size-4" />}
        error={fieldErr.email}
        placeholder="you@example.com"
        data-autofocus
      />
      <TextField
        label="Password"
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        leftIcon={<Lock className="size-4" />}
        rightSlot={<PasswordToggle shown={show} onToggle={() => setShow((s) => !s)} />}
        error={fieldErr.password}
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-faint">You'll stay signed in on this device.</span>
        <button type="button" onClick={onForgot} className="font-medium text-accent hover:underline">
          Forgot password?
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={loading}>
        Log in
      </Button>
      <Divider />
      <GoogleButton label="Continue with Google" />
      <p className="pt-2 text-center text-sm text-muted">
        New to Book Shelf?{' '}
        <button type="button" onClick={onSwitch} className="font-semibold text-accent hover:underline">
          Create an account
        </button>
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export function SignUpForm({ onSuccess, onSwitch }: { onSuccess: () => void; onSwitch: () => void }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({})
  const [uState, setUState] = useState<UsernameState>('idle')
  const debouncedName = useDebouncedValue(username.trim(), 400)

  useEffect(() => {
    let cancelled = false
    if (!debouncedName) return setUState('idle')
    if (!USERNAME_RE.test(debouncedName)) return setUState('invalid')
    setUState('checking')
    isUsernameAvailable(debouncedName)
      .then((ok) => !cancelled && setUState(ok ? 'available' : 'taken'))
      .catch(() => !cancelled && setUState('idle'))
    return () => {
      cancelled = true
    }
  }, [debouncedName])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const name = username.trim()
    if (!USERNAME_RE.test(name)) errs.username = '3–24 characters: letters, numbers and underscores.'
    else if (uState === 'taken') errs.username = 'That username is taken.'
    if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.'
    if (password.length < 8) errs.password = 'Use at least 8 characters.'
    if (confirm !== password) errs.confirm = 'Passwords do not match.'
    setFieldErr(errs)
    if (Object.keys(errs).length) return

    setLoading(true)
    setError(null)
    try {
      if (!(await isUsernameAvailable(name))) {
        setFieldErr({ username: 'That username is taken.' })
        setUState('taken')
        return
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: name, display_name: name },
          emailRedirectTo: appUrl('auth/callback'),
        },
      })
      if (error) return setError(authError(error.message))
      // Supabase returns a user with no identities when the email is already registered.
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        return setError('An account with this email already exists. Try logging in.')
      }
      if (data.session) {
        toast.success('Welcome to Book Shelf', 'Your account is ready.')
        onSuccess()
      } else {
        setSentTo(email.trim())
      }
    } catch (err) {
      setError(authError((err as Error).message))
    } finally {
      setLoading(false)
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MailCheck className="size-7" />
        </div>
        <h3 className="font-serif text-2xl text-ink">Check your inbox</h3>
        <p className="mt-2 text-sm text-muted">
          We sent a confirmation link to <span className="font-medium text-ink">{sentTo}</span>. Open it to finish creating your
          account.
        </p>
        <Button variant="secondary" className="mt-6" onClick={onSwitch}>
          Back to log in
        </Button>
      </div>
    )
  }

  const uHint =
    uState === 'checking' ? (
      <span className="inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" /> Checking availability…
      </span>
    ) : uState === 'available' ? (
      <span className="inline-flex items-center gap-1 text-accent">
        <Check className="size-3" /> Available
      </span>
    ) : uState === 'taken' ? (
      <span className="inline-flex items-center gap-1 text-danger">
        <X className="size-3" /> Already taken
      </span>
    ) : (
      'Letters, numbers and underscores.'
    )

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <TextField
        label="Username"
        autoComplete="username"
        value={username}
        maxLength={24}
        onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
        leftIcon={<UserRound className="size-4" />}
        error={fieldErr.username}
        hint={uHint}
        placeholder="your_name"
        data-autofocus
      />
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftIcon={<Mail className="size-4" />}
        error={fieldErr.email}
        placeholder="you@example.com"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Password"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          rightSlot={<PasswordToggle shown={show} onToggle={() => setShow((s) => !s)} />}
          error={fieldErr.password}
          hint="8+ characters"
        />
        <TextField
          label="Confirm"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErr.confirm}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" loading={loading}>
        Create account
      </Button>
      <Divider />
      <GoogleButton label="Sign up with Google" />
      <p className="pt-2 text-center text-sm text-muted">
        Already have an account?{' '}
        <button type="button" onClick={onSwitch} className="font-semibold text-accent hover:underline">
          Log in
        </button>
      </p>
    </form>
  )
}

// ---------------------------------------------------------------------------
export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.')
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl('reset-password') })
    setLoading(false)
    if (error) return setError(authError(error.message))
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MailCheck className="size-7" />
        </div>
        <h3 className="font-serif text-2xl text-ink">Reset link sent</h3>
        <p className="mt-2 text-sm text-muted">
          If an account exists for <span className="font-medium text-ink">{email.trim()}</span>, you'll receive a link to choose a
          new password.
        </p>
        <Button variant="secondary" className="mt-6" onClick={onBack}>
          Back to log in
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-muted">Enter the email you signed up with and we'll send you a link to reset your password.</p>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        leftIcon={<Mail className="size-4" />}
        error={error}
        data-autofocus
      />
      <Button type="submit" className="w-full" loading={loading}>
        Send reset link
      </Button>
      <button type="button" onClick={onBack} className="w-full text-center text-sm font-medium text-accent hover:underline">
        Back to log in
      </button>
    </form>
  )
}
