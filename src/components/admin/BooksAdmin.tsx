import { useEffect, useId, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BookOpen, Plus, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatPrice, formatVolume } from '@/lib/utils'
import { EDITION_LABEL, FORMAT_LABEL, bookCategory } from '@/lib/labels'
import { adminApi, useAdminMutation, type BookInput } from '@/api/admin'
import { usePublishers } from '@/api/catalog'
import { CoverImage } from '@/components/CoverImage'
import { Button } from '@/components/ui/Button'
import { Badge, CategoryBadge } from '@/components/ui/Badge'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { SelectField, TextArea, TextField } from '@/components/ui/Field'
import { SkeletonDetail, SkeletonRows } from '@/components/ui/Skeleton'
import type { BookFormat, EditionType, PersonRole } from '@/types/db'
import {
  AdminRow,
  FormGrid,
  FormSection,
  hasErrors,
  ilikeTerm,
  ImageUploadField,
  ListCard,
  ListToolbar,
  Pagination,
  PeoplePicker,
  SearchableSelect,
  toNull,
  toNumber,
  toPersonPicks,
  useDebouncedSearch,
  useSeriesOptions,
  validate,
  type Errors,
  type PersonPick,
} from './shared'

const PAGE_SIZE = 20

interface BookRow {
  id: string
  title: string
  volume_number: number | null
  item_type: BookFormat
  edition_type: EditionType
  cover_url: string | null
  price: number | null
  currency: string
  publication_date: string | null
  series: { id: string; title: string } | null
}

type EditionFilter = 'all' | 'regular' | 'special'
type EditTarget = { id: string } | { preset: 'regular' | 'special'; seriesId: string | null }

export function BooksAdmin() {
  const { search, setSearch, debounced } = useDebouncedSearch()
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const [edition, setEdition] = useState<EditionFilter>('all')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [deleting, setDeleting] = useState<BookRow | null>(null)
  const seriesOptions = useSeriesOptions()

  useEffect(() => setPage(0), [debounced, seriesId, edition])

  const list = useQuery({
    queryKey: ['admin', 'books', debounced, seriesId, edition, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from('books')
        .select('id, title, volume_number, item_type, edition_type, cover_url, price, currency, publication_date, series:series(id, title)', {
          count: 'exact',
        })
      if (seriesId) q = q.eq('series_id', seriesId)
      const term = ilikeTerm(debounced)
      if (term) q = q.ilike('title', `%${term}%`)
      if (edition === 'regular') q = q.eq('edition_type', 'regular')
      if (edition === 'special') q = q.neq('edition_type', 'regular')
      q = seriesId
        ? q.order('edition_type').order('volume_number', { ascending: true, nullsFirst: false }).order('title')
        : q.order('created_at', { ascending: false })
      const { data, error, count } = await q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as unknown as BookRow[], count: count ?? 0 }
    },
  })

  const del = useAdminMutation((id: string) => adminApi.deleteBook(id), {
    success: 'Book deleted',
    onSuccess: () => setDeleting(null),
  })

  const filtersActive = !!(debounced || seriesId || edition !== 'all')

  return (
    <div>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search book titles"
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Sparkles className="size-4" />}
              onClick={() => setEditing({ preset: 'special', seriesId })}
            >
              Add special edition
            </Button>
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing({ preset: 'regular', seriesId })}>
              Add book
            </Button>
          </>
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
        <div className="sm:w-40">
          <SelectField value={edition} onChange={(e) => setEdition(e.target.value as EditionFilter)} aria-label="Edition">
            <option value="all">All editions</option>
            <option value="regular">Regular volumes</option>
            <option value="special">Special editions</option>
          </SelectField>
        </div>
      </ListToolbar>

      {list.isPending ? (
        <SkeletonRows rows={8} />
      ) : list.isError ? (
        <EmptyState icon={BookOpen} title="Could not load books" action={<Button variant="secondary" onClick={() => list.refetch()}>Retry</Button>} />
      ) : list.data.rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtersActive ? 'No books match these filters' : 'No books yet'}
          description={filtersActive ? 'Try clearing the search or series filter.' : 'Create a series first, then add its volumes here.'}
        />
      ) : (
        <>
          <ListCard>
            {list.data.rows.map((b) => (
              <AdminRow
                key={b.id}
                thumb={<CoverImage src={b.cover_url} title={b.title} category={bookCategory(b)} rounded="rounded" />}
                title={b.title}
                badges={
                  <>
                    <CategoryBadge category={b.item_type} />
                    {b.edition_type !== 'regular' && (
                      <Badge className="bg-special-soft text-special">{EDITION_LABEL[b.edition_type]}</Badge>
                    )}
                  </>
                }
                meta={[
                  b.series?.title,
                  b.volume_number !== null ? `Vol. ${formatVolume(b.volume_number)}` : null,
                  formatPrice(b.price, b.currency),
                  formatDate(b.publication_date),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onEdit={() => setEditing({ id: b.id })}
                onDelete={() => setDeleting(b)}
              />
            ))}
          </ListCard>
          <Pagination page={page} pageSize={PAGE_SIZE} total={list.data.count} onPage={setPage} />
        </>
      )}

      {editing && <BookFormLoader target={editing} onClose={() => setEditing(null)} />}

      <ConfirmationDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="Delete this book?"
        description={
          <>
            <strong className="text-ink">{deleting?.title}</strong> will be removed from the catalog and from every reader's
            Owned and Wishlist collections. This cannot be undone.
          </>
        }
        confirmLabel="Delete book"
      />
    </div>
  )
}

function BookFormLoader({ target, onClose }: { target: EditTarget; onClose: () => void }) {
  const id = 'id' in target ? target.id : null
  const existing = useQuery({
    queryKey: ['admin', 'book', id],
    enabled: !!id,
    staleTime: 0,
    queryFn: () => adminApi.getBookForEdit(id!),
  })

  if (id && existing.isPending) {
    return (
      <Modal open onClose={onClose} size="lg" title="Edit book">
        <SkeletonDetail />
      </Modal>
    )
  }
  if (id && existing.isError) {
    return (
      <Modal open onClose={onClose} size="sm" title="Could not load book">
        <p className="text-sm text-muted">This book may have been deleted. Close this dialog and refresh the list.</p>
      </Modal>
    )
  }
  return <BookForm existing={id ? existing.data! : null} target={target} onClose={onClose} />
}

type BookField =
  | 'series_id'
  | 'title'
  | 'volume_number'
  | 'edition_notes'
  | 'cover_url'
  | 'synopsis'
  | 'price'
  | 'currency'
  | 'publisher_product_url'
  | 'isbn'
  | 'page_count'

type ExistingBook = Awaited<ReturnType<typeof adminApi.getBookForEdit>>

function BookForm({ existing, target, onClose }: { existing: ExistingBook | null; target: EditTarget; onClose: () => void }) {
  const formId = useId()
  const seriesOptions = useSeriesOptions()
  const publishers = usePublishers()
  const preset = 'preset' in target ? target : null

  const [seriesId, setSeriesId] = useState<string | null>(existing?.series_id ?? preset?.seriesId ?? null)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [volume, setVolume] = useState(existing?.volume_number != null ? String(existing.volume_number) : '')
  const [itemType, setItemType] = useState<BookFormat>(existing?.item_type ?? 'light_novel')
  const [editionType, setEditionType] = useState<EditionType>(
    existing?.edition_type ?? (preset?.preset === 'special' ? 'special' : 'regular'),
  )
  const [editionNotes, setEditionNotes] = useState(existing?.edition_notes ?? '')
  const [cover, setCover] = useState(existing?.cover_url ?? '')
  const [synopsis, setSynopsis] = useState(existing?.synopsis ?? '')
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : '')
  const [currency, setCurrency] = useState(existing?.currency ?? 'THB')
  const [publisherId, setPublisherId] = useState<string | null>(existing?.publisher_id ?? null)
  const [productUrl, setProductUrl] = useState(existing?.publisher_product_url ?? '')
  const [pubDate, setPubDate] = useState(existing?.publication_date ?? '')
  const [isbn, setIsbn] = useState(existing?.isbn ?? '')
  const [pages, setPages] = useState(existing?.page_count != null ? String(existing.page_count) : '')
  const [authors, setAuthors] = useState<PersonPick[]>(
    existing ? toPersonPicks(existing.book_authors.map((x) => ({ position: x.position, person: x.author }))) : [],
  )
  const [illustrators, setIllustrators] = useState<PersonPick[]>(
    existing ? toPersonPicks(existing.book_illustrators.map((x) => ({ position: x.position, person: x.illustrator }))) : [],
  )
  const [translators, setTranslators] = useState<PersonPick[]>(
    existing ? toPersonPicks(existing.book_translators.map((x) => ({ position: x.position, person: x.translator }))) : [],
  )
  const [errors, setErrors] = useState<Errors<BookField>>({})
  const [uploading, setUploading] = useState(false)
  const [touchedDefaults, setTouchedDefaults] = useState(!!existing)

  // For new books, inherit format and publisher from the chosen series.
  useEffect(() => {
    if (touchedDefaults || !seriesId || !seriesOptions.data) return
    const s = seriesOptions.data.find((x) => x.id === seriesId)
    if (!s) return
    setItemType(s.series_type as BookFormat)
    if (!publisherId) setPublisherId(s.publisher_id)
    setTouchedDefaults(true)
  }, [seriesId, seriesOptions.data, touchedDefaults, publisherId])

  const save = useAdminMutation(
    async (v: { input: BookInput; people: Record<PersonRole, PersonPick[]> }) => {
      const resolve = async (role: PersonRole, picks: PersonPick[]) => {
        const ids: string[] = []
        for (const p of picks) ids.push(p.id ?? (await adminApi.ensurePerson(role, p.name)))
        return ids
      }
      const [a, i, t] = await Promise.all([
        resolve('author', v.people.author),
        resolve('illustrator', v.people.illustrator),
        resolve('translator', v.people.translator),
      ])
      return adminApi.saveBook(v.input, a, i, t)
    },
    { success: existing ? 'Book updated' : 'Book created', onSuccess: onClose },
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs: Errors<BookField> = {
      series_id: seriesId ? undefined : 'Choose the series this book belongs to.',
      title: validate.title(title),
      volume_number: validate.nonNegative(volume, 'Volume') ?? (volume.trim() && Number(volume) > 99999 ? 'Volume is too large.' : undefined),
      edition_notes: validate.maxLen(editionNotes, 1000, 'Edition notes'),
      cover_url: validate.url(cover),
      synopsis: validate.maxLen(synopsis, 20000, 'Synopsis'),
      price: validate.nonNegative(price, 'Price'),
      currency: validate.currency(currency),
      publisher_product_url: validate.url(productUrl),
      isbn: validate.isbn(isbn),
      page_count: validate.positiveInt(pages, 'Page count'),
    }
    setErrors(errs)
    if (hasErrors(errs)) return
    save.mutate({
      input: {
        id: existing?.id,
        series_id: seriesId!,
        title: title.trim(),
        volume_number: toNumber(volume),
        item_type: itemType,
        edition_type: editionType,
        edition_notes: editionType === 'regular' && !editionNotes.trim() ? null : toNull(editionNotes),
        cover_url: toNull(cover),
        synopsis: synopsis.trim() ? synopsis.replace(/\r\n/g, '\n').trim() : null,
        price: toNumber(price),
        currency: currency.trim().toUpperCase(),
        publisher_id: publisherId,
        publisher_product_url: toNull(productUrl),
        publication_date: toNull(pubDate),
        isbn: toNull(isbn),
        page_count: pages.trim() ? Number(pages) : null,
      },
      people: { author: authors, illustrator: illustrators, translator: translators },
    })
  }

  const isSpecial = editionType !== 'regular'

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      dismissible={!save.isPending}
      title={existing ? 'Edit book' : isSpecial ? 'Add special edition' : 'Add book'}
      description={existing ? existing.title : 'Volumes, special editions and their publication details.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending} disabled={uploading}>
            {existing ? 'Save changes' : 'Create book'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-7" noValidate>
        <FormSection title="Book">
          <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
            <ImageUploadField
              value={cover}
              onChange={setCover}
              folder="books"
              title={title}
              category={isSpecial ? 'special_edition' : itemType}
              error={errors.cover_url}
              onUploadingChange={setUploading}
            />
            <div className="space-y-4">
              <SearchableSelect
                label="Series"
                required
                value={seriesId}
                onChange={setSeriesId}
                allowClear={false}
                loading={seriesOptions.isPending}
                error={errors.series_id}
                options={(seriesOptions.data ?? []).map((s) => ({ value: s.id, label: s.title }))}
                placeholder="Choose a series"
              />
              <TextField label="Title" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={300} />
            </div>
          </div>
          <FormGrid className="lg:grid-cols-3">
            <TextField
              label="Volume number"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
              error={errors.volume_number}
              hint="Use 5.5 for in-between volumes."
            />
            <SelectField label="Item type" value={itemType} onChange={(e) => { setItemType(e.target.value as BookFormat); setTouchedDefaults(true) }}>
              {(Object.keys(FORMAT_LABEL) as BookFormat[]).map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </SelectField>
            <SelectField label="Edition" value={editionType} onChange={(e) => setEditionType(e.target.value as EditionType)}>
              {(Object.keys(EDITION_LABEL) as EditionType[]).map((t) => (
                <option key={t} value={t}>
                  {EDITION_LABEL[t]}
                </option>
              ))}
            </SelectField>
          </FormGrid>
          {isSpecial && (
            <TextArea
              label="Edition notes"
              rows={2}
              value={editionNotes}
              onChange={(e) => setEditionNotes(e.target.value)}
              error={errors.edition_notes}
              hint="What makes this edition special — slipcase, extras, store exclusives…"
            />
          )}
        </FormSection>

        <FormSection title="Credits">
          <FormGrid className="lg:grid-cols-3">
            <PeoplePicker role="author" label="Authors" value={authors} onChange={setAuthors} />
            <PeoplePicker role="illustrator" label="Illustrators" value={illustrators} onChange={setIllustrators} />
            <PeoplePicker role="translator" label="Translators" value={translators} onChange={setTranslators} />
          </FormGrid>
        </FormSection>

        <FormSection title="Synopsis">
          <TextArea
            label="Volume synopsis"
            rows={8}
            value={synopsis}
            onChange={(e) => setSynopsis(e.target.value)}
            error={errors.synopsis}
            hint="Specific to this volume. Leave a blank line between paragraphs."
          />
        </FormSection>

        <FormSection title="Publication">
          <FormGrid>
            <SearchableSelect
              label="Publisher"
              value={publisherId}
              onChange={setPublisherId}
              loading={publishers.isPending}
              options={(publishers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Inherit from series"
            />
            <TextField label="Publication date" type="date" value={pubDate} onChange={(e) => setPubDate(e.target.value)} />
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
              <TextField
                label="Currency"
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                error={errors.currency}
              />
            </div>
            <TextField
              label="Publisher product URL"
              type="url"
              inputMode="url"
              placeholder="https://"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
              error={errors.publisher_product_url}
            />
            <TextField label="ISBN" value={isbn} onChange={(e) => setIsbn(e.target.value)} error={errors.isbn} maxLength={17} />
            <TextField
              label="Page count"
              type="number"
              inputMode="numeric"
              min={1}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
              error={errors.page_count}
            />
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  )
}
