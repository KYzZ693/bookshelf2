import { useId, useMemo, useState } from 'react'
import { Plus, Users } from 'lucide-react'
import { adminApi, useAdminMutation } from '@/api/admin'
import { usePeople } from '@/api/catalog'
import { ROLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { TextField } from '@/components/ui/Field'
import { SkeletonRows } from '@/components/ui/Skeleton'
import type { Person, PersonRole } from '@/types/db'
import { AdminRow, ListCard, ListToolbar, validate } from './shared'

const ROLES: PersonRole[] = ['author', 'illustrator', 'translator']
const PAGE = 100

export function PeopleAdmin() {
  const [role, setRole] = useState<PersonRole>('author')
  const people = usePeople(role)
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<Person | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Person | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (people.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q))
  }, [people.data, search])

  const del = useAdminMutation((id: string) => adminApi.deletePerson(role, id), {
    success: `${ROLE_LABEL[role]} deleted`,
    onSuccess: () => setDeleting(null),
  })

  const label = ROLE_LABEL[role].toLowerCase()

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label="Role">
        {ROLES.map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={role === r}
            onClick={() => {
              setRole(r)
              setLimit(PAGE)
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              role === r ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink',
            )}
          >
            {ROLE_LABEL[r]}s
          </button>
        ))}
      </div>

      <ListToolbar
        search={search}
        onSearch={(v) => {
          setSearch(v)
          setLimit(PAGE)
        }}
        placeholder={`Search ${label}s`}
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
            Add {label}
          </Button>
        }
      />

      {people.isPending ? (
        <SkeletonRows rows={8} />
      ) : people.isError ? (
        <EmptyState icon={Users} title={`Could not load ${label}s`} action={<Button variant="secondary" onClick={() => people.refetch()}>Retry</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={search ? `No ${label}s match` : `No ${label}s yet`}
          description="People are also created automatically when you credit a new name on a book."
        />
      ) : (
        <>
          <ListCard>
            {filtered.slice(0, limit).map((p) => (
              <AdminRow key={p.id} title={p.name} onEdit={() => setEditing(p)} onDelete={() => setDeleting(p)} />
            ))}
          </ListCard>
          <div className="mt-4 flex items-center justify-between text-sm text-muted">
            <span>
              Showing {Math.min(limit, filtered.length).toLocaleString()} of {filtered.length.toLocaleString()}
            </span>
            {limit < filtered.length && (
              <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
                Show more
              </Button>
            )}
          </div>
        </>
      )}

      {editing && (
        <PersonForm role={role} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}

      <ConfirmationDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title={`Delete this ${label}?`}
        description={
          <>
            <strong className="text-ink">{deleting?.name}</strong> will be removed and uncredited from every book. The
            books themselves are kept.
          </>
        }
        confirmLabel={`Delete ${label}`}
      />
    </div>
  )
}

function PersonForm({ role, initial, onClose }: { role: PersonRole; initial: Person | null; onClose: () => void }) {
  const formId = useId()
  const [name, setName] = useState(initial?.name ?? '')
  const [error, setError] = useState<string | undefined>()
  const label = ROLE_LABEL[role]

  const save = useAdminMutation(() => adminApi.savePerson(role, { id: initial?.id, name: name.trim().replace(/\s+/g, ' ') }), {
    success: initial ? `${label} renamed` : `${label} added`,
    onSuccess: onClose,
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const err = validate.title(name, 'Name', 160)
    setError(err)
    if (!err) save.mutate(undefined)
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      dismissible={!save.isPending}
      title={initial ? `Rename ${label.toLowerCase()}` : `Add ${label.toLowerCase()}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate>
        <TextField label="Name" required value={name} maxLength={160} error={error} onChange={(e) => setName(e.target.value)} />
      </form>
    </Modal>
  )
}
