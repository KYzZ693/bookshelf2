import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { openLogin } from '@/components/auth/openLogin'
import { Logo } from './Logo'
import { NAV_ITEMS } from './nav'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { QuickSearch } from './QuickSearch'

export function Navbar() {
  const { user, isAdmin, initializing } = useAuth()
  const { pathname } = useLocation()
  const onSearchPage = pathname.startsWith('/search')

  const items = NAV_ITEMS.filter((i) => !i.admin || isAdmin)

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-md supports-[backdrop-filter]:bg-paper/70">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-0.5 md:flex" aria-label="Main">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={(e) => {
                if (item.auth && !user) {
                  e.preventDefault()
                  openLogin(`Sign in to open ${item.label}.`)
                }
              }}
              className={({ isActive }) =>
                cn(
                  'relative rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'text-ink' : 'text-muted hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span className="hidden lg:inline">{item.label}</span>
                  <span className="lg:hidden">{item.short}</span>
                  {isActive && <span className="absolute inset-x-3 -bottom-[13px] h-0.5 rounded-full bg-accent" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {!onSearchPage && <QuickSearch className="hidden lg:block lg:w-60 xl:w-80" />}
          <ThemeToggle />
          {initializing ? (
            <div className="skeleton size-9 rounded-full" aria-hidden />
          ) : user ? (
            <UserMenu />
          ) : (
            <Button size="sm" onClick={() => openLogin()} className="h-9 px-4">
              Log in
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
