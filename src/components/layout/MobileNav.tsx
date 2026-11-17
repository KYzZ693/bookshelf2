import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { openLogin } from '@/components/auth/openLogin'
import { NAV_ITEMS } from './nav'

/** Thumb-reachable bottom tab bar for phones. */
export function MobileNav() {
  const { user, isAdmin } = useAuth()
  const items = NAV_ITEMS.filter((i) => !i.admin || isAdmin)
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/90 backdrop-blur-md md:hidden"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {items.map(({ to, short, icon: Icon, end, auth, label }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              onClick={(e) => {
                if (auth && !user) {
                  e.preventDefault()
                  openLogin(`Sign in to open ${label}.`)
                }
              }}
              className={({ isActive }) =>
                cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted active:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'grid h-7 w-12 place-items-center rounded-full transition-colors',
                      isActive && 'bg-accent-soft',
                    )}
                  >
                    <Icon className="size-[19px]" strokeWidth={isActive ? 2.2 : 1.8} />
                  </span>
                  {short}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
