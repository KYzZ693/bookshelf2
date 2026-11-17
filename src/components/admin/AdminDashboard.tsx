import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Building2, Library, Package, ShieldCheck, Tags, Users, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { PageContainer, PageHeader } from '@/components/layout/PageContainer'
import { Skeleton } from '@/components/ui/Skeleton'
import { SeriesAdmin } from './SeriesAdmin'
import { BooksAdmin } from './BooksAdmin'
import { MerchAdmin } from './MerchAdmin'
import { PublishersAdmin } from './PublishersAdmin'
import { GenresAdmin } from './GenresAdmin'
import { PeopleAdmin } from './PeopleAdmin'

const TABS: { path: string; label: string; icon: LucideIcon }[] = [
  { path: 'series', label: 'Series', icon: Library },
  { path: 'books', label: 'Books', icon: BookOpen },
  { path: 'merchandise', label: 'Merchandise', icon: Package },
  { path: 'publishers', label: 'Publishers', icon: Building2 },
  { path: 'genres', label: 'Genres', icon: Tags },
  { path: 'people', label: 'People', icon: Users },
]

type CountTable = 'series' | 'books' | 'merchandise' | 'publishers'

function useCatalogCounts() {
  return useQuery({
    queryKey: ['admin', 'counts'],
    staleTime: 60_000,
    queryFn: async () => {
      const tables: CountTable[] = ['series', 'books', 'merchandise', 'publishers']
      const results = await Promise.all(
        tables.map((t) => supabase.from(t).select('id', { count: 'exact', head: true })),
      )
      const out = {} as Record<CountTable, number>
      results.forEach((r, i) => {
        if (r.error) throw r.error
        out[tables[i]] = r.count ?? 0
      })
      return out
    },
  })
}

export function AdminDashboard() {
  const counts = useCatalogCounts()
  const stats: { key: CountTable; label: string }[] = [
    { key: 'series', label: 'Series' },
    { key: 'books', label: 'Books' },
    { key: 'merchandise', label: 'Merchandise' },
    { key: 'publishers', label: 'Publishers' },
  ]

  return (
    <PageContainer wide className="max-w-7xl">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" /> Administrator
          </span>
        }
        title="Catalog management"
        description="Changes here update the shared catalog for every reader. All writes are verified by the database."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">{s.label}</p>
            {counts.isPending ? (
              <Skeleton className="mt-1.5 h-7 w-12" />
            ) : (
              <p className="mt-0.5 font-serif text-2xl text-ink tabular-nums">
                {counts.data ? counts.data[s.key].toLocaleString() : '—'}
              </p>
            )}
          </div>
        ))}
      </div>

      <nav
        aria-label="Admin sections"
        className="no-scrollbar -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              cn(
                '-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-ink',
              )
            }
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index element={<Navigate to="series" replace />} />
        <Route path="series" element={<SeriesAdmin />} />
        <Route path="books" element={<BooksAdmin />} />
        <Route path="merchandise" element={<MerchAdmin />} />
        <Route path="publishers" element={<PublishersAdmin />} />
        <Route path="genres" element={<GenresAdmin />} />
        <Route path="people" element={<PeopleAdmin />} />
        <Route path="*" element={<Navigate to="series" replace />} />
      </Routes>
    </PageContainer>
  )
}
