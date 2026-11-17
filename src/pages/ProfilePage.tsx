import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, ArrowRight, Bookmark, Library } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { ProfileCard } from '@/components/profile/ProfileCard'
import { ProfileEditor } from '@/components/profile/ProfileEditor'
import { CollectionStats } from '@/components/profile/CollectionStats'
import { CollectionGrid } from '@/components/profile/CollectionGrid'
import { PageContainer } from '@/components/layout/PageContainer'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import type { ReactNode } from 'react'

export default function ProfilePage() {
  const { profile, profileLoading, user } = useAuth()
  const [editing, setEditing] = useState(false)

  if (profileLoading) {
    return (
      <PageContainer wide>
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <Skeleton className="h-32 rounded-none" />
          <div className="space-y-3 p-6">
            <Skeleton className="-mt-16 size-24 rounded-full" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (!profile) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title="Profile not found"
          description="Your account exists but its profile row is missing. Make sure all database migrations have been applied."
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer wide className="space-y-12">
      <ProfileCard profile={profile} email={user?.email} onEdit={() => setEditing(true)} />

      <Section title="Collection statistics" subtitle="Calculated live from your collection">
        <CollectionStats />
      </Section>

      <Section
        title="Owned Collection"
        icon={<Library className="size-5" />}
        action={<ViewAll to="/collection" />}
      >
        <CollectionGrid status="owned" compact />
      </Section>

      <Section
        title="Wishlist"
        icon={<Bookmark className="size-5" />}
        action={<ViewAll to="/collection?tab=want" />}
      >
        <CollectionGrid status="want" compact />
      </Section>

      <ProfileEditor open={editing} onClose={() => setEditing(false)} profile={profile} />
    </PageContainer>
  )
}

function Section({ title, subtitle, icon, action, children }: { title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>}
          <div>
            <h2 className="font-serif text-2xl text-ink">{title}</h2>
            {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft">
      Manage <ArrowRight className="size-4" />
    </Link>
  )
}
