import { CalendarDays, Pencil } from 'lucide-react'
import { Avatar, ACCENT_BG } from '@/components/layout/Avatar'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'
import type { BannerPattern, Profile } from '@/types/db'

export function bannerStyle(pattern: BannerPattern, color: string): React.CSSProperties {
  switch (pattern) {
    case 'dots':
      return {
        backgroundColor: color,
        backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.18) 1.5px, transparent 1.6px)',
        backgroundSize: '16px 16px',
      }
    case 'plain':
      return { backgroundColor: color }
    default:
      // book spines
      return {
        backgroundColor: color,
        backgroundImage:
          'repeating-linear-gradient(90deg, rgb(255 255 255 / 0.10) 0 14px, rgb(0 0 0 / 0.10) 14px 16px, rgb(255 255 255 / 0.04) 16px 34px, rgb(0 0 0 / 0.12) 34px 36px, transparent 36px 52px, rgb(0 0 0 / 0.08) 52px 54px)',
      }
  }
}

export function ProfileCard({ profile, email, onEdit }: { profile: Profile; email?: string | null; onEdit: () => void }) {
  const color = ACCENT_BG[profile.accent_color]
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface shadow-card">
      <div className="h-28 sm:h-36" style={bannerStyle(profile.banner_pattern, color)} aria-hidden />
      <div className="px-5 pb-6 sm:px-8">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
          <Avatar
            src={profile.avatar_url}
            name={profile.display_name || profile.username}
            accent={profile.accent_color}
            className="size-24 border-4 border-surface text-3xl shadow-card sm:size-28"
          />
          <Button variant="secondary" onClick={onEdit} leftIcon={<Pencil className="size-4" />} className="self-start sm:self-auto">
            Edit profile
          </Button>
        </div>
        <div className="mt-4">
          <h1 className="font-serif text-3xl leading-tight text-ink">{profile.display_name || profile.username}</h1>
          <p className="text-sm text-muted">
            @{profile.username}
            {email && <span className="text-faint"> · {email}</span>}
          </p>
          {profile.bio ? (
            <p className="mt-3 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-ink/90">{profile.bio}</p>
          ) : (
            <button onClick={onEdit} className="mt-3 text-sm text-faint italic hover:text-accent">
              Add a short bio about your reading taste…
            </button>
          )}
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
            <CalendarDays className="size-3.5" /> Collecting since {formatDate(profile.created_at, { month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>
    </section>
  )
}
