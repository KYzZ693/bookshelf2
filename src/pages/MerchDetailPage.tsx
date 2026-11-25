import { Link, useParams } from 'react-router-dom'
import { AlertCircle, Box, ExternalLink } from 'lucide-react'
import { useMerch } from '@/api/catalog'
import { ItemDetailLayout, PublisherLinkButton, type InfoRow } from '@/components/detail/ItemDetailLayout'
import { CollectionButtons } from '@/components/detail/CollectionButtons'
import { MerchPreview } from '@/components/merch/MerchPreview'
import { Badge } from '@/components/ui/Badge'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/layout/PageContainer'
import NotFoundPage from './NotFoundPage'
import { MERCH_LABEL } from '@/lib/labels'
import { errorMessage, formatDate, formatPrice } from '@/lib/utils'
import type { MerchandiseDetail } from '@/types/db'

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
    {
      label: 'More from this series',
      value: item.series ? <Link to={`/merchandise?series=${item.series.id}`} className="hover:text-accent">All {item.series.title} merchandise</Link> : null,
    },
  ]

  return (
    <ItemDetailLayout
      crumbs={[
        { label: 'Merchandise', to: '/merchandise' },
        ...(item.series ? [{ label: item.series.title, to: `/merchandise?series=${item.series.id}` }] : []),
        { label: item.title },
      ]}
      wideCover
      cover={<MerchPreview item={item} />}
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
      footer={<PreviewNotes item={item} />}
    />
  )
}

const STATUS_TEXT: Record<MerchandiseDetail['reconstruction_status'], string> = {
  not_started: 'Not started',
  researching: 'Researching',
  modeling: 'Modeling',
  completed: 'Completed',
  failed: 'Failed',
}

/** Where the 3D preview comes from, so a simulated model is never mistaken for an official one. */
function PreviewNotes({ item }: { item: MerchandiseDetail }) {
  const official = item.model_format === 'glb' || item.model_format === 'gltf'
  if (!item.preview_available && !item.reconstruction_notes && item.reconstruction_status === 'not_started') return null
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 text-sm" aria-label="About the 3D preview">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <Box className="size-4 text-merch" /> About the 3D preview
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Model</dt>
          <dd className="text-ink">
            {!item.preview_available ? 'Not available' : official ? 'Model file' : 'Simulated reconstruction (approximation, not an official model)'}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Status</dt>
          <dd className="text-ink">{STATUS_TEXT[item.reconstruction_status]}</dd>
        </div>
        {item.model_source && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Source</dt>
            <dd className="text-ink">{item.model_source}</dd>
          </div>
        )}
        {item.reconstruction_notes && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">Notes</dt>
            <dd className="text-muted">{item.reconstruction_notes}</dd>
          </div>
        )}
        {item.reference_urls.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold tracking-[0.12em] text-muted uppercase">References</dt>
            <dd className="mt-1 space-y-1">
              {item.reference_urls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 truncate text-accent hover:underline">
                  <ExternalLink className="size-3.5 shrink-0" /> <span className="truncate">{u.replace(/^https?:\/\//, '')}</span>
                </a>
              ))}
            </dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-faint">Product photos and artwork © their respective rights holders.</p>
    </section>
  )
}
