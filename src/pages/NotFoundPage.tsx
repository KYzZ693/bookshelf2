import { Link } from 'react-router-dom'
import { BookX } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/layout/PageContainer'

export default function NotFoundPage({ title = 'This page is missing from the shelf', description }: { title?: string; description?: string }) {
  return (
    <PageContainer>
      <EmptyState
        icon={BookX}
        title={title}
        description={description ?? 'The link may be broken, or the item was removed from the catalog.'}
        action={
          <>
            <Link to="/">
              <Button>Back to the bookshelf</Button>
            </Link>
            <Link to="/search">
              <Button variant="secondary">Search the catalog</Button>
            </Link>
          </>
        }
      />
    </PageContainer>
  )
}
