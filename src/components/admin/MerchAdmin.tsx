import { useEffect, useId, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Package, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatPrice } from '@/lib/utils'
import { MERCH_LABEL } from '@/lib/labels'
import { adminApi, useAdminMutation, type MerchInput } from '@/api/admin'
import { usePublishers } from '@/api/catalog'
import { CoverImage } from '@/components/CoverImage'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SelectField, TextArea, TextField } from '@/components/ui/Field'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { Merchandise, MerchType } from '@/types/db'
import {
  AdminRow,
  FormGrid,
  hasErrors,
  ilikeTerm,
  ImageUploadField,
  ListCard,
  ListToolbar,
  Pagination,
  SearchableSelect,
  toNull,
  toNumber,
  useDebouncedSearch,
  useSeriesOptions,
  validate,
  type Errors,
} from './shared'

const PAGE_SIZE = 20
type MerchRow = Merchandise & { series: { id: string; title: string } | null }

export function MerchAdmin() {
  const { search, setSearch, debounced } = useDebouncedSearch()
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const [type, setType] = useState<MerchType | 'all'>('all')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<MerchRow | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MerchRow | null>(null)
  const seriesOptions = useSeriesOptions()

  useEffect(() => setPage(0), [debounced, seriesId, type])

  const list = useQuery({
    queryKey: ['admin', 'merch', debounced, seriesId, type, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from('merchandise')
        .select(
          'id, series_id, title, merch_type, description, image_url, price, currency, publisher_id, product_url, release_date, created_at, updated_at, series:series(id, title)',
          { count: 'exact' },
        )
      if (seriesId) q = q.eq('series_id', seriesId)
      if (type !== 'all') q = q.eq('merch_type', type)
      const term = ilikeTerm(debounced)
      if (term) q = q.ilike('title', `%${term}%`)
      const { data, error, count } = await q
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as unknown as MerchRow[], count: count ?? 0 }
    },
  })

  const del = useAdminMutation((id: string) => adminApi.deleteMerch(id), {
    success: 'Merchandise deleted',
    onSuccess: () => setDeleting(null),
  })

  const filtersActive = !!(debounced || seriesId || type !== 'all')

  return (
    <div>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search merchandise"
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add merchandise
          </Button>
        }
      >
        <div className="sm:w-64">
          <SearchableSelect
            value={seriesId}
            onChange={setSeriesId}
            loading={seriesOptions.isPending}
            options={(seriesOptions.data ?? []).map((s) => ({ value: s.id, label: s.title }))}
            placeholder="All series"
          />
        </div>
        <div className="sm:w-44">
          <SelectField value={type} onChange={(e) => setType(e.target.value as MerchType | 'all')} aria-label="Merchandise type">
            <option value="all">All types</option>
            {(Object.keys(MERCH_LABEL) as MerchType[]).map((t) => (
              <option key={t} value={t}>
                {MERCH_LABEL[t]}
              </option>
            ))}
          </SelectField>
        </div>
      </ListToolbar>

      {list.isPending ? (
        <SkeletonRows rows={6} />
      ) : list.isError ? (
        <EmptyState icon={Package} title="Could not load merchandise" action={<Button variant="secondary" onClick={() => list.refetch()}>Retry</Button>} />
      ) : list.data.rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title={filtersActive ? 'No merchandise matches' : 'No merchandise yet'}
          description={filtersActive ? 'Try clearing the filters.' : 'Acrylic stands, posters, figures and more appear on their series page.'}
        />
      ) : (
        <>
          <ListCard>
            {list.data.rows.map((m) => (
              <AdminRow
                key={m.id}
                thumb={<CoverImage src={m.image_url} title={m.title} category="merchandise" rounded="rounded" aspect="aspect-square" />}
                title={m.title}
                badges={<Badge className="bg-merch-soft text-merch">{MERCH_LABEL[m.merch_type]}</Badge>}
                meta={[m.series?.title, formatPrice(m.price, m.currency), formatDate(m.release_date)].filter(Boolean).join(' · ')}
                onEdit={() => setEditing(m)}
                onDelete={() => setDeleting(m)}
              />
            ))}
          </ListCard>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.count} onPage={setPage} />
        </>
      )}

      {editing && (
        <MerchForm initial={editing === 'new' ? null : editing} defaultSeriesId={seriesId} onClose={() => setEditing(null)} />
      )}

      <ConfirmationDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="Delete this merchandise?"
        description={
          <>
            <strong className="text-ink">{deleting?.title}</strong> will be removed from the catalog and from every reader's
            collection. This cannot be undone.
          </>
        }
        confirmLabel="Delete item"
      />
    </div>
  )
}

type MerchField = 'series_id' | 'title' | 'description' | 'image_url' | 'price' | 'currency' | 'product_url'

function MerchForm({
  initial,
  defaultSeriesId,
  onClose,
}: {
  initial: MerchRow | null
  defaultSeriesId: string | null
  onClose: () => void
}) {
  const formId = useId()
  const seriesOptions = useSeriesOptions()
  const publishers = usePublishers()
  const [seriesId, setSeriesId] = useState<string | null>(initial?.series_id ?? defaultSeriesId)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [merchType, setMerchType] = useState<MerchType>(initial?.merch_type ?? 'acrylic_stand')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [image, setImage] = useState(initial?.image_url ?? '')
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : '')
  const [currency, setCurrency] = useState(initial?.currency ?? 'THB')
  const [publisherId, setPublisherId] = useState<string | null>(initial?.publisher_id ?? null)
  const [productUrl, setProductUrl] = useState(initial?.product_url ?? '')
  const [releaseDate, setReleaseDate] = useState(initial?.release_date ?? '')
  const [errors, setErrors] = useState<Errors<MerchField>>({})
  const [uploading, setUploading] = useState(false)

  const save = useAdminMutation((input: MerchInput) => adminApi.saveMerch(input), {
    success: initial ? 'Merchandise updated' : 'Merchandise created',
    onSuccess: onClose,
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Errors<MerchField> = {
      series_id: seriesId ? undefined : 'Choose the series this item belongs to.',
      title: validate.title(title),
      description: validate.maxLen(description, 10000, 'Description'),
      image_url: validate.url(image),
      price: validate.nonNegative(price, 'Price'),
      currency: validate.currency(currency),
      product_url: validate.url(productUrl),
    }
    setErrors(errs)
    if (hasErrors(errs)) return
    save.mutate({
      id: initial?.id,
      series_id: seriesId!,
      title: title.trim(),
      merch_type: merchType,
      description: description.trim() ? description.replace(/\r\n/g, '\n').trim() : null,
      image_url: toNull(image),
      price: toNumber(price),
      currency: currency.trim().toUpperCase(),
      publisher_id: publisherId,
      product_url: toNull(productUrl),
      release_date: toNull(releaseDate),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!save.isPending}
      title={initial ? 'Edit merchandise' : 'Add merchandise'}
      description={initial?.title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending} disabled={uploading}>
            {initial ? 'Save changes' : 'Create item'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <ImageUploadField
          label="Product image"
          value={image}
          onChange={setImage}
          folder="merchandise"
          title={title}
          category="merchandise"
          aspect="aspect-square"
          error={errors.image_url}
          onUploadingChange={setUploading}
        />
        <SearchableSelect
          label="Series"
          required
          allowClear={false}
          value={seriesId}
          onChange={setSeriesId}
          loading={seriesOptions.isPending}
          error={errors.series_id}
          options={(seriesOptions.data ?? []).map((s) => ({ value: s.id, label: s.title }))}
          placeholder="Choose a series"
        />
        <FormGrid>
          <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={300} />
          <SelectField label="Type" value={merchType} onChange={(e) => setMerchType(e.target.value as MerchType)}>
            {(Object.keys(MERCH_LABEL) as MerchType[]).map((t) => (
              <option key={t} value={t}>
                {MERCH_LABEL[t]}
              </option>
            ))}
          </SelectField>
        </FormGrid>
        <TextArea label="Description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
        <FormGrid>
          <SearchableSelect
            label="Publisher"
            value={publisherId}
            onChange={setPublisherId}
            loading={publishers.isPending}
            options={(publishers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Inherit from series"
          />
          <TextField label="Release date" type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <TextField
              label="Price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={errors.price}
            />
            <TextField label="Currency" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} error={errors.currency} />
          </div>
          <TextField
            label="Product URL"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            error={errors.product_url}
          />
        </FormGrid>
      </form>
    </Modal>
  )
}
