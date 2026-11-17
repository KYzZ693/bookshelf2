import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Library, LogOut, ShieldCheck, UserRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { Avatar } from './Avatar'

export function UserMenu() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const name = profile?.display_name || profile?.username || user?.email
  const item =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors hover:bg-surface-2'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full ring-offset-2 ring-offset-paper transition-shadow hover:ring-2 hover:ring-line"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar src={profile?.avatar_url} name={name} accent={profile?.accent_color} className="size-9 text-sm" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
            className="absolute right-0 mt-2 w-60 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-lift"
          >
            <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
              <p className="truncate text-sm font-semibold text-ink">{name}</p>
              {profile?.username && <p className="truncate text-xs text-muted">@{profile.username}</p>}
            </div>
            <div className="py-1">
              <Link to="/profile" className={item} onClick={() => setOpen(false)} role="menuitem">
                <UserRound className="size-4 text-muted" /> My Profile
              </Link>
              <Link to="/collection" className={item} onClick={() => setOpen(false)} role="menuitem">
                <Library className="size-4 text-muted" /> My Collection
              </Link>
              {isAdmin && (
                <Link to="/admin" className={item} onClick={() => setOpen(false)} role="menuitem">
                  <ShieldCheck className="size-4 text-muted" /> Admin dashboard
                </Link>
              )}
            </div>
            <div className="border-t border-line pt-1">
              <button
                className={item}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  signOut()
                }}
              >
                <LogOut className="size-4 text-muted" /> Sign out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
