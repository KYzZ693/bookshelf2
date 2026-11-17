import { useId, useMemo, useState } from 'react'
import { Plus, Tags } from 'lucide-react'
import { adminApi, useAdminMutation } from '@/api/admin'
import { useGenres } from '@/api/catalog'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/Field'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { Genre } from '@/types/db'
import { AdminRow, FormGrid, hasErrors, ListCard, ListToolbar, slugify, validate, type Errors } from './shared'

export function GenresAdmin() {
  const genres = useGenres()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Genre | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Genre | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (genres.data ?? []).filter((g) => !q || g.name.toLowerCase().includes(q) || g.slug.includes(q))
  }, [genres.data, search])

  const del = useAdminMutation((id: string) => adminApi.deleteGenre(id), {
    success: 'Genre deleted',
    onSuccess: () => setDeleting(null),
  })

  return (
    <div>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search genres"
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add genre
          </Button>
        }
      />
      {genres.isPending ? (
        <SkeletonRows rows={8} />
      ) : genres.isError ? (
        <EmptyState icon={Tags} title="Could not load genres" action={<Button variant="secondary" onClick={() => genres.refetch()}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Tags} title={search ? 'No genres match' : 'No genres yet'} />
      ) : (
        <ListCard>
          {rows.map((g) => (
            <AdminRow
              key={g.id}
              title={g.name}
              meta={`/${g.slug} · shelf order ${g.sort_order}`}
              onEdit={() => setEditing(g)}
              onDelete={() => setDeleting(g)}
            />
          ))}
        </ListCard>
      )}

      {editing && (
        <GenreForm
          initial={editing === 'new' ? null : editing}
          nextOrder={Math.max(0, ...(genres.data ?? []).map((g) => g.sort_order)) + 10}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmationDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="Delete this genre?"
        description={
          <>
            <strong className="text-ink">{deleting?.name}</strong> will be removed from every series that uses it, and its
            shelf will disappear from the home page. The series themselves are kept.
          </>
        }
        confirmLabel="Delete genre"
      />
    </div>
  )
}

function GenreForm({ initial, nextOrder, onClose }: { initial: Genre | null; nextOrder: number; onClose: () => void }) {
  const formId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(!!initial)
  const [order, setOrder] = useState(String(initial?.sort_order ?? nextOrder))
  const [errors, setErrors] = useState<Errors<'name' | 'slug' | 'order'>>({})

  const save = useAdminMutation(
    () => adminApi.saveGenre({ id: initial?.id, name: name.trim(), slug: slug.trim(), sort_order: Number(order) }),
    { success: initial ? 'Genre updated' : 'Genre created', onSuccess: onClose },
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs = {
      name: validate.title(name, 'Name', 60),
      slug: validate.slug(slug),
      order: /^-?\d+$/.test(order.trim()) ? undefined : 'Order must be a whole number.',
    }
    setErrors(errs)
    if (!hasErrors(errs)) save.mutate(undefined)
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      dismissible={!save.isPending}
      title={initial ? 'Edit genre' : 'Add genre'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {initial ? 'Save changes' : 'Create genre'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="Name"
          required
          value={name}
          maxLength={60}
          error={errors.name}
          onChange={(e) => {
            setName(e.target.value)
            if (!slugEdited) setSlug(slugify(e.target.value))
          }}
        />
        <FormGrid>
          <TextField
            label="Slug"
            required
            value={slug}
            maxLength={60}
            error={errors.slug}
            hint="Used in links and filters."
            onChange={(e) => {
              setSlugEdited(true)
              setSlug(e.target.value.toLowerCase())
            }}
          />
          <TextField
            label="Shelf order"
            type="number"
            value={order}
            error={errors.order}
            hint="Lower numbers appear first."
            onChange={(e) => setOrder(e.target.value)}
          />
        </FormGrid>
      </form>
    </Modal>
  )
}
