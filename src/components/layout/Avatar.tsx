import { useState } from 'react'
import { cn, initials } from '@/lib/utils'
import type { AccentColor } from '@/types/db'

export const ACCENT_BG: Record<AccentColor, string> = {
  emerald: '#2D6A4F',
  violet: '#5C4B8A',
  amber: '#9A6F05',
  rose: '#A33D5C',
  sky: '#1F6D8A',
  slate: '#4A4E57',
}

export function Avatar({
  src,
  name,
  accent = 'emerald',
  className,
}: {
  src?: string | null
  name?: string | null
  accent?: AccentColor
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className={cn('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full text-white', className)}
      style={{ backgroundColor: ACCENT_BG[accent] }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[0.8em] font-semibold">{initials(name)}</span>
      )}
    </span>
  )
}
