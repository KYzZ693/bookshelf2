import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_LABEL, CATEGORY_TONE, STATUS_LABEL, STATUS_TONE } from '@/lib/labels'
import type { CompletionStatus, ItemCategory } from '@/types/db'

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-semibold tracking-wide whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function CategoryBadge({ category, className }: { category: ItemCategory; className?: string }) {
  return <Badge className={cn(CATEGORY_TONE[category], className)}>{CATEGORY_LABEL[category]}</Badge>
}

const STATUS_DOT: Record<CompletionStatus, string> = {
  ongoing: 'bg-accent',
  completed: 'bg-violet',
  hiatus: 'bg-want',
  cancelled: 'bg-danger',
}

export function StatusBadge({ status, className }: { status: CompletionStatus; className?: string }) {
  return (
    <Badge className={cn(STATUS_TONE[status], className)}>
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} aria-hidden />
      {STATUS_LABEL[status]}
    </Badge>
  )
}
