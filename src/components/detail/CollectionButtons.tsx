import { Bookmark, BookmarkCheck, Check, Loader2, Plus } from 'lucide-react'
import { useCollectionToggle } from '@/api/collection'
import { cn } from '@/lib/utils'
import type { ItemKind } from '@/types/db'

/**
 * [Owned] [Want] — mutually exclusive. Clicking the active one removes it.
 * Updates optimistically and syncs to Supabase (set_collection_status).
 */
export function CollectionButtons({ kind, id, title, className }: { kind: ItemKind; id: string; title: string; className?: string }) {
  const { current, toggle, pendingFor, isPending } = useCollectionToggle(kind, id, title)
  const busyOwned = isPending && (pendingFor === 'owned' || (pendingFor === 'remove' && current === 'owned'))
  const busyWant = isPending && (pendingFor === 'want' || (pendingFor === 'remove' && current === 'want'))

  return (
    <div className={cn('grid grid-cols-2 gap-2.5 sm:flex', className)} role="group" aria-label="Collection status">
      <button
        onClick={() => toggle('owned')}
        aria-pressed={current === 'owned'}
        disabled={isPending}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-wait',
          current === 'owned'
            ? 'border-accent bg-accent text-accent-ink shadow-sm'
            : 'border-line bg-surface text-ink hover:border-accent hover:text-accent',
        )}
      >
        {busyOwned ? <Loader2 className="size-4 animate-spin" /> : current === 'owned' ? <Check className="size-4" /> : <Plus className="size-4" />}
        Owned
      </button>
      <button
        onClick={() => toggle('want')}
        aria-pressed={current === 'want'}
        disabled={isPending}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-wait',
          current === 'want'
            ? 'border-want bg-want text-white shadow-sm'
            : 'border-line bg-surface text-ink hover:border-want hover:text-want',
        )}
      >
        {busyWant ? (
          <Loader2 className="size-4 animate-spin" />
        ) : current === 'want' ? (
          <BookmarkCheck className="size-4" />
        ) : (
          <Bookmark className="size-4" />
        )}
        Want
      </button>
      {current && (
        <p className="col-span-2 self-center text-xs text-muted sm:ml-1">
          {current === 'owned' ? 'In your Owned collection.' : 'On your wishlist.'} Click again to remove.
        </p>
      )}
    </div>
  )
}
