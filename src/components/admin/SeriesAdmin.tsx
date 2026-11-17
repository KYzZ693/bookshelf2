import { useEffect, useId, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Library, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { pluralize } from '@/lib/utils'
import { FORMAT_LABEL, STATUS_LABEL, STATUS_ORDER } from '@/lib/labels'
import { adminApi, useAdminMutation, type SeriesInput } from '@/api/admin'
import { useGenres, usePublishers } from '@/api/catalog'
import { CoverImage } from '@/components/CoverImage'
import { Button } from '@/components/ui/Button'
import { CategoryBadge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SelectField, TextArea, TextField } from '@/components/ui/Field'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { BookFormat, CompletionStatus, SeriesOverview } from '@/types/db'
import {
  AdminRow,
  ChipMultiSelect,
  FormGrid,
  hasErrors,
  ilikeTerm,
  ImageUploadField,
  ListCard,
  ListToolbar,
  Pagination,
  SearchableSelect,
  toNull,
  useDebouncedSearch,
  validate,
  type Errors,
} from './shared'

const PAGE_SIZE = 20

export function SeriesAdmin() {
  const { search, setSearch, debounced } = useDebouncedSearch()
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<SeriesOverview | 'new' | null>(null)
  const [deleting, setDeleting] = useState<SeriesOverview | null>(null)

  useEffect(() => setPage(0), [debounced])

  const list = useQuery({
    queryKey: ['admin', 'series', debounced, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase.from('series_overview').select('*', { count: 'exact' })
      const term = ilikeTerm(debounced)
      if (term) q = q.or(`title.ilike.%${term}%,original_title.ilike.%${term}%`)
      const { data, error, count } = await q.order('title').range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as SeriesOverview[], count: count ?? 0 }
    },
  })

  const del = useAdminMutation((id: string) => adminApi.deleteSeries(id), {
    success: 'Series deleted',
    onSuccess: () => setDeleting(null),
  })

  return (
    <div>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search series"
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add series
          </Button>
        }
      />

      {list.isPending ? (
        <SkeletonRows rows={8} />
      ) : list.isError ? (
        <EmptyState icon={Library} title="Could not load series" description="Check your connection and try again." action={<Button variant="secondary" onClick={() => list.refetch()}>Retry</Button>} />
      ) : list.data.rows.length === 0 ? (
        <EmptyState
          icon={Library}
          title={debounced ? 'No series match your search' : 'No series yet'}
          description={debounced ? 'Try a different title.' : 'Add the first series to start building the catalog.'}
          action={!debounced && <Button onClick={() => setEditing('new')}>Add series</Button>}
        />
      ) : (
        <>
          <ListCard>
            {list.data.rows.map((s) => (
              <AdminRow
                key={s.id}
                thumb={<CoverImage src={s.cover_url} title={s.title} category={s.series_type} rounded="rounded" />}
                title={s.title}
                badges={
                  <>
                    <CategoryBadge category={s.series_type} />
                    <StatusBadge status={s.completion_status} />
                  </>
                }
                meta={[
                  s.publisher_name,
                  pluralize(s.regular_volume_count, 'volume'),
                  s.special_volume_count ? pluralize(s.special_volume_count, 'special') : null,
                  s.merchandise_count ? `${s.merchandise_count} merch` : null,
                  s.genre_names.join(', ') || null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onEdit={() => setEditing(s)}
                onDelete={() => setDeleting(s)}
              />
            ))}
          </ListCard>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.count} onPage={setPage} />
        </>
      )}

      {editing && <SeriesForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmationDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="Delete this series?"
        description={
          <>
            <strong className="text-ink">{deleting?.title}</strong> will be removed together with its{' '}
            {deleting ? pluralize(deleting.regular_volume_count + deleting.special_volume_count, 'book') : ''} and{' '}
            {deleting ? pluralize(deleting.merchandise_count, 'merchandise item') : ''}. Every reader's Owned and Wishlist
            entries for those items are removed too. This cannot be undone.
          </>
        }
        confirmLabel="Delete series"
      />
    </div>
  )
}

type SeriesField = 'title' | 'original_title' | 'description' | 'cover_url'

function SeriesForm({ initial, onClose }: { initial: SeriesOverview | null; onClose: () => void }) {
  const formId = useId()
  const genres = useGenres()
  const publishers = usePublishers()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [originalTitle, setOriginalTitle] = useState(initial?.original_title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [cover, setCover] = useState(initial?.cover_url ?? '')
  const [publisherId, setPublisherId] = useState<string | null>(initial?.publisher_id ?? null)
  const [seriesType, setSeriesType] = useState<BookFormat>(initial?.series_type ?? 'light_novel')
  const [status, setStatus] = useState<CompletionStatus>(initial?.completion_status ?? 'ongoing')
  const [genreIds, setGenreIds] = useState<string[]>(initial?.genre_ids ?? [])
  const [errors, setErrors] = useState<Errors<SeriesField>>({})
  const [uploading, setUploading] = useState(false)

  const save = useAdminMutation(
    (v: { input: SeriesInput; genres: string[] }) => adminApi.saveSeries(v.input, v.genres),
    { success: initial ? 'Series updated' : 'Series created', onSuccess: onClose },
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Errors<SeriesField> = {
      title: validate.title(title),
      original_title: validate.maxLen(originalTitle, 300, 'Original title'),
      description: validate.maxLen(description, 10000, 'Description'),
      cover_url: validate.url(cover),
    }
    setErrors(errs)
    if (hasErrors(errs)) return
    save.mutate({
      input: {
        id: initial?.id,
        title: title.trim(),
        original_title: toNull(originalTitle),
        description: toNull(description),
        cover_url: toNull(cover),
        publisher_id: publisherId,
        series_type: seriesType,
        completion_status: status,
      },
      genres: genreIds,
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!save.isPending}
      title={initial ? 'Edit series' : 'Add series'}
      description={initial ? initial.title : 'Series group regular volumes, special editions and merchandise.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending} disabled={uploading}>
            {initial ? 'Save changes' : 'Create series'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-5" noValidate>
        <ImageUploadField
          value={cover}
          onChange={setCover}
          folder="series"
          title={title}
          category={seriesType}
          error={errors.cover_url}
          onUploadingChange={setUploading}
        />
        <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={300} data-autofocus />
        <TextField
          label="Original / alternative title"
          value={originalTitle}
          onChange={(e) => setOriginalTitle(e.target.value)}
          error={errors.original_title}
          maxLength={300}
        />
        <FormGrid>
          <SelectField label="Series type" value={seriesType} onChange={(e) => setSeriesType(e.target.value as BookFormat)}>
            {(Object.keys(FORMAT_LABEL) as BookFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </SelectField>
          <SelectField label="Completion status" value={status} onChange={(e) => setStatus(e.target.value as CompletionStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </SelectField>
        </FormGrid>
        <SearchableSelect
          label="Publisher"
          value={publisherId}
          onChange={setPublisherId}
          loading={publishers.isPending}
          options={(publishers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
          placeholder="Choose a publisher"
        />
        <ChipMultiSelect
          label="Genres"
          hint="A series can appear in several genre shelves."
          value={genreIds}
          onChange={setGenreIds}
          options={(genres.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
        />
        <TextArea
          label="Description"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={errors.description}
          hint="Series-level description. Each volume has its own synopsis."
        />
      </form>
    </Modal>
  )
}
