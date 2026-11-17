import { useId, useMemo, useState } from 'react'
import { Building2, ExternalLink, Plus } from 'lucide-react'
import { adminApi, useAdminMutation } from '@/api/admin'
import { usePublishers } from '@/api/catalog'
import { CoverImage } from '@/components/CoverImage'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/Field'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { Publisher } from '@/types/db'
import { AdminRow, hasErrors, ImageUploadField, ListCard, ListToolbar, toNull, validate, type Errors } from './shared'

export function PublishersAdmin() {
  const publishers = usePublishers()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Publisher | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Publisher | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (publishers.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [publishers.data, search])

  const del = useAdminMutation((id: string) => adminApi.deletePublisher(id), {
    success: 'Publisher deleted',
    onSuccess: () => setDeleting(null),
  })

  return (
    <div>
      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search publishers"
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add publisher
          </Button>
        }
      />
      {publishers.isPending ? (
        <SkeletonRows rows={6} />
      ) : publishers.isError ? (
        <EmptyState icon={Building2} title="Could not load publishers" action={<Button variant="secondary" onClick={() => publishers.refetch()}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Building2} title={search ? 'No publishers match' : 'No publishers yet'} />
      ) : (
        <ListCard>
          {rows.map((p) => (
            <AdminRow
              key={p.id}
              thumb={
                <CoverImage src={p.logo_url} title={p.name} category="other" rounded="rounded-lg" aspect="aspect-square" />
              }
              title={p.name}
              meta={
                p.website_url ? (
                  <a
                    href={p.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-accent"
                  >
                    {p.website_url.replace(/^https?:\/\//, '')}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  'No website'
                )
              }
              onEdit={() => setEditing(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </ListCard>
      )}

      {editing && <PublisherForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}

      <ConfirmationDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title="Delete this publisher?"
        description={
          <>
            <strong className="text-ink">{deleting?.name}</strong> will be removed. Series, books and merchandise from this
            publisher are kept but will no longer show a publisher.
          </>
        }
        confirmLabel="Delete publisher"
      />
    </div>
  )
}

function PublisherForm({ initial, onClose }: { initial: Publisher | null; onClose: () => void }) {
  const formId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [website, setWebsite] = useState(initial?.website_url ?? '')
  const [logo, setLogo] = useState(initial?.logo_url ?? '')
  const [errors, setErrors] = useState<Errors<'name' | 'website' | 'logo'>>({})
  const [uploading, setUploading] = useState(false)

  const save = useAdminMutation(
    () => adminApi.savePublisher({ id: initial?.id, name: name.trim(), website_url: toNull(website), logo_url: toNull(logo) }),
    { success: initial ? 'Publisher updated' : 'Publisher created', onSuccess: onClose },
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const errs = { name: validate.title(name, 'Name', 120), website: validate.url(website), logo: validate.url(logo) }
    setErrors(errs)
    if (!hasErrors(errs)) save.mutate(undefined)
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!save.isPending}
      title={initial ? 'Edit publisher' : 'Add publisher'}
      description="Publishers become quick-filter shortcuts in search."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending} disabled={uploading}>
            {initial ? 'Save changes' : 'Create publisher'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} />
        <TextField
          label="Website"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          error={errors.website}
        />
        <ImageUploadField
          label="Logo"
          value={logo}
          onChange={setLogo}
          folder="publishers"
          title={name}
          category="other"
          aspect="aspect-square"
          error={errors.logo}
          onUploadingChange={setUploading}
        />
      </form>
    </Modal>
  )
}
