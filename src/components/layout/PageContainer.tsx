import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function PageContainer({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn('mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8', wide ? 'max-w-[1600px]' : 'max-w-6xl', className)}>
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-accent uppercase">{eyebrow}</p>}
        <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-muted sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
