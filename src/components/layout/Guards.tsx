import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogIn, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { authModal } from '@/lib/authModal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { PageContainer } from './PageContainer'

export function RequireAuth({ children, reason }: { children: ReactNode; reason?: string }) {
  const { user, initializing } = useAuth()
  if (initializing) {
    return (
      <PageContainer>
        <SkeletonDetail />
      </PageContainer>
    )
  }
  if (!user) {
    return (
      <PageContainer>
        <EmptyState
          icon={LogIn}
          title="Your shelf is waiting"
          description={reason ?? 'Sign in to continue.'}
          action={
            <>
              <Button onClick={() => authModal.open('login', reason)}>Log in</Button>
              <Button variant="secondary" onClick={() => authModal.open('signup')}>
                Create account
              </Button>
            </>
          }
        />
      </PageContainer>
    )
  }
  return <>{children}</>
}

/**
 * UI guard only — the database independently rejects catalog writes from
 * non-admins through RLS, so hiding this page is not the security boundary.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, initializing, isAdmin, adminLoading } = useAuth()
  if (initializing || adminLoading) {
    return (
      <PageContainer>
        <SkeletonDetail />
      </PageContainer>
    )
  }
  if (!user) {
    return (
      <RequireAuth reason="Sign in with an administrator account to manage the catalog.">{children}</RequireAuth>
    )
  }
  if (!isAdmin) {
    return (
      <PageContainer>
        <EmptyState
          icon={ShieldAlert}
          title="Administrators only"
          description="Your account doesn't have permission to manage the shared catalog."
          action={
            <Link to="/">
              <Button variant="secondary">Back to the bookshelf</Button>
            </Link>
          }
        />
      </PageContainer>
    )
  }
  return <>{children}</>
}
