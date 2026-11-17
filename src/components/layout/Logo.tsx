import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('font-serif text-[1.6rem] leading-none tracking-tight text-ink', className)} aria-label="Book Shelf home">
      Book<span className="text-accent">Shelf</span>
    </Link>
  )
}
