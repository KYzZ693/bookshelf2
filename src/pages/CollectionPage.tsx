import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bookmark, Library } from 'lucide-react'
import { useCollectionStats } from '@/api/collection'
import { CollectionGrid } from '@/components/profile/CollectionGrid'
import { PageContainer, PageHeader } from '@/components/layout/PageContainer'
import { cn } from '@/lib/utils'
import type { CollectionStatus } from '@/types/db'

export default function CollectionPage() {
  const [params, setParams] = useSearchParams()
  const tab: CollectionStatus = params.get('tab') === 'want' ? 'want' : 'owned'
  const stats = useCollectionStats()

  const tabs: { value: CollectionStatus; label: string; icon: typeof Library; n?: number }[] = [
    { value: 'owned', label: 'Owned', icon: Library, n: stats.data?.owned_count },
    { value: 'want', label: 'Wishlist', icon: Bookmark, n: stats.data?.want_count },
  ]

  return (
    <PageContainer wide>
      <PageHeader eyebrow="My Collection" title="Your shelf" description="Everything you own and everything you're hunting for, in one place." />

      <div role="tablist" aria-label="Collection" className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1">
        {tabs.map(({ value, label, icon: Icon, n }) => (
          <button
            key={value}
            role="tab"
            aria-selected={tab === value}
            onClick={() => setParams(value === 'want' ? { tab: 'want' } : {}, { replace: true })}
            className={cn('relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors', tab === value ? 'text-accent-ink' : 'text-muted hover:text-ink')}
          >
            {tab === value && <motion.span layoutId="collection-tab" className="absolute inset-0 rounded-lg bg-accent" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <Icon className="relative size-4" />
            <span className="relative">{label}</span>
            {n !== undefined && (
              <span className={cn('relative rounded-full px-1.5 text-[11px]', tab === value ? 'bg-white/20' : 'bg-surface-2')}>{n.toLocaleString()}</span>
            )}
          </button>
        ))}
      </div>

      <CollectionGrid key={tab} status={tab} />
    </PageContainer>
  )
}
