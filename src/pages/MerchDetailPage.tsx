import { Link, useParams } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'
import { useMerch } from '@/api/catalog'
import { ItemDetailLayout, PublisherLinkButton, type InfoRow } from '@/components/detail/ItemDetailLayout'
import { CollectionButtons } from '@/components/detail/CollectionButtons'
import { CoverImage } from '@/components/CoverImage'
import { Badge } from '@/components/ui/Badge'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/layout/PageContainer'
import NotFoundPage from './NotFoundPage'
import { MERCH_LABEL } from '@/lib/labels'
import { errorMessage, formatDate, formatPrice } from '@/lib/utils'

export default function MerchDetailPage() {
  const { id } = useParams()
  const { data: item, isPending, isError, error, refetch } = useMerch(id)

  if (isPending) {
    return (
      <PageContainer>
        <SkeletonDetail />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title="This item didn't load"
          description={errorMessage(error)}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </PageContainer>
    )
  }
  if (!item) return <NotFoundPage title="Item not found" />

  const publisher = item.publisher ?? item.series?.publisher ?? null
  const href = item.product_url ?? publisher?.website_url ?? null
  const rows: InfoRow[] = [
    { label: 'Series', value: item.series ? <Link to={`/series/${item.series.id}`} className="hover:text-accent">{item.series.title}</Link> : null },
    { label: 'Item type', value: MERCH_LABEL[item.merch_type] },
    { label: 'Publisher', value: publisher ? <Link to={`/search?publishers=${publisher.id}`} className="hover:text-accent">{publisher.name}</Link> : null },
    { label: 'Price', value: formatPrice(item.price, item.currency) },
    { label: 'Released', value: formatDate(item.release_date, { dateStyle: 'long' }) },
  ]

  return (
    <ItemDetailLayout
      crumbs={[
        { label: 'Bookshelf', to: '/' },
        ...(item.series ? [{ label: item.series.title, to: `/series/${item.series.id}#merchandise` }] : []),
        { label: item.title },
      ]}
      cover={
        <CoverImage
          src={item.image_url}
          title={item.title}
          subtitle={MERCH_LABEL[item.merch_type]}
          category="merchandise"
          aspect="aspect-square"
          fit="contain"
          eager
          rounded="rounded-xl"
          sizes="(min-width: 1024px) 320px, 260px"
        />
      }
      eyebrow={
        item.series && (
          <Link to={`/series/${item.series.id}`} className="font-medium text-accent hover:underline">
            {item.series.title}
          </Link>
        )
      }
      title={item.title}
      badges={<Badge className="bg-merch-soft text-merch">{MERCH_LABEL[item.merch_type]}</Badge>}
      actions={
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <CollectionButtons kind="merchandise" id={item.id} title={item.title} />
          <PublisherLinkButton href={href} label={item.product_url ? 'View product page' : 'View publisher website'} />
        </div>
      }
      rows={rows}
      synopsis={item.description}
      synopsisLabel="Description"
    />
  )
}
