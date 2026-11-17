import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Camera, Check, Loader2, X } from 'lucide-react'
import { isUsernameAvailable, useAvatarUpload, useUpdateProfile, USERNAME_RE } from '@/api/profile'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { TextArea, TextField } from '@/components/ui/Field'
import { Avatar, ACCENT_BG } from '@/components/layout/Avatar'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { toast } from '@/lib/toast'
import { cn, errorMessage } from '@/lib/utils'
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from '@/lib/image'
import type { AccentColor, BannerPattern, Profile } from '@/types/db'
import { bannerStyle } from './ProfileCard'

const ACCENTS = Object.keys(ACCENT_BG) as AccentColor[]
const PATTERNS: { value: BannerPattern; label: string }[] = [
  { value: 'spines', label: 'Book spines' },
  { value: 'dots', label: 'Dotted' },
  { value: 'plain', label: 'Plain' },
]

export function ProfileEditor({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: Profile }) {
  const update = useUpdateProfile()
  const avatar = useAvatarUpload()
  const fileRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(profile.username)
  const [displayName, setDisplayName] = useState(profile.display_name ?? '')
  const [bio, setBio] = useState(profile.bio ?? '')
  const [accent, setAccent] = useState<AccentColor>(profile.accent_color)
  const [pattern, setPattern] = useState<BannerPattern>(profile.banner_pattern)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [uState, setUState] = useState<'idle' | 'checking' | 'ok' | 'taken'>('idle')
  const debouncedName = useDebouncedValue(username.trim(), 400)

  // Reset the form each time it opens
  useEffect(() => {
    if (!open) return
    setUsername(profile.username)
    setDisplayName(profile.display_name ?? '')
    setBio(profile.bio ?? '')
    setAccent(profile.accent_color)
    setPattern(profile.banner_pattern)
    setErrors({})
    setUState('idle')
  }, [open, profile])

  useEffect(() => {
    let cancelled = false
    if (!open || debouncedName.toLowerCase() === profile.username.toLowerCase() || !USERNAME_RE.test(debouncedName)) {
      setUState('idle')
      return
    }
    setUState('checking')
    isUsernameAvailable(debouncedName)
      .then((ok) => !cancelled && setUState(ok ? 'ok' : 'taken'))
      .catch(() => !cancelled && setUState('idle'))
    return () => {
      cancelled = true
    }
  }, [debouncedName, open, profile.username])

  async function onAvatar(file: File | undefined) {
    if (!file) return
    const err = validateImageFile(file, 2 * 1024 * 1024)
    if (err) return toast.error(err)
    avatar.mutate(file, {
      onSuccess: () => toast.success('Profile picture updated'),
      onError: (e) => toast.error('Upload failed', errorMessage(e)),
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const errs: Record<string, string> = {}
    const name = username.trim()
    if (!USERNAME_RE.test(name)) errs.username = '3–24 characters: letters, numbers and underscores.'
    else if (uState === 'taken') errs.username = 'That username is taken.'
    if (displayName.trim().length > 50) errs.displayName = 'Keep it under 50 characters.'
    if (bio.length > 500) errs.bio = 'Bio can be at most 500 characters.'
    setErrors(errs)
    if (Object.keys(errs).length) return

    update.mutate(
      {
        username: name,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        accent_color: accent,
        banner_pattern: pattern,
      },
      {
        onSuccess: () => {
          toast.success('Profile saved')
          onClose()
        },
        onError: (err) => {
          const code = (err as { code?: string }).code
          if (code === '23505') setErrors({ username: 'That username is taken.' })
          else toast.error('Could not save profile', errorMessage(err))
        },
      },
    )
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit profile"
      description="Personalize how your library looks."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="profile-form" loading={update.isPending}>
            Save changes
          </Button>
        </>
      }
    >
      <form id="profile-form" onSubmit={submit} noValidate className="space-y-5">
        {/* Live preview */}
        <div className="overflow-hidden rounded-2xl border border-line">
          <div className="h-20" style={bannerStyle(pattern, ACCENT_BG[accent])} />
          <div className="flex items-end gap-4 px-4 pb-4">
            <div className="relative -mt-9">
              <Avatar src={profile.avatar_url} name={displayName || username} accent={accent} className="size-18 border-4 border-surface text-xl" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatar.isPending}
                className="absolute -right-1 -bottom-1 grid size-8 place-items-center rounded-full border-2 border-surface bg-accent text-accent-ink shadow"
                aria-label="Change profile picture"
              >
                {avatar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              </button>
              <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_TYPES} className="hidden" onChange={(e) => onAvatar(e.target.files?.[0])} />
            </div>
            <div className="min-w-0 pb-1">
              <p className="truncate font-serif text-xl text-ink">{displayName || username}</p>
              <p className="truncate text-xs text-muted">@{username}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Username"
            value={username}
            maxLength={24}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
            error={errors.username}
            hint={
              uState === 'checking' ? (
                <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Checking…</span>
              ) : uState === 'ok' ? (
                <span className="inline-flex items-center gap-1 text-accent"><Check className="size-3" /> Available</span>
              ) : uState === 'taken' ? (
                <span className="inline-flex items-center gap-1 text-danger"><X className="size-3" /> Already taken</span>
              ) : (
                'Letters, numbers and underscores.'
              )
            }
            required
          />
          <TextField label="Display name" value={displayName} maxLength={50} onChange={(e) => setDisplayName(e.target.value)} error={errors.displayName} placeholder="How your name appears" />
        </div>
        <TextArea
          label="Biography"
          value={bio}
          maxLength={500}
          onChange={(e) => setBio(e.target.value)}
          error={errors.bio}
          hint={`${bio.length}/500`}
          placeholder="Favourite genres, what you're collecting, current reads…"
          rows={3}
        />

        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Accent color</legend>
          <div className="flex flex-wrap gap-2.5">
            {ACCENTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAccent(a)}
                aria-pressed={accent === a}
                aria-label={a}
                className={cn('grid size-9 place-items-center rounded-full ring-offset-2 ring-offset-surface transition', accent === a && 'ring-2 ring-ink')}
                style={{ backgroundColor: ACCENT_BG[a] }}
              >
                {accent === a && <Check className="size-4 text-white" />}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Banner</legend>
          <div className="grid grid-cols-3 gap-2.5">
            {PATTERNS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPattern(p.value)}
                aria-pressed={pattern === p.value}
                className={cn('overflow-hidden rounded-xl border text-left transition', pattern === p.value ? 'border-accent ring-2 ring-accent/25' : 'border-line hover:border-faint')}
              >
                <div className="h-10" style={bannerStyle(p.value, ACCENT_BG[accent])} />
                <p className="px-2.5 py-1.5 text-xs font-medium text-ink">{p.label}</p>
              </button>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  )
}
