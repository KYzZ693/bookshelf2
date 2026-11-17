import { Home, Library, Search, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
  auth?: boolean
  admin?: boolean
  end?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Bookshelf', short: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', short: 'Search', icon: Search },
  { to: '/collection', label: 'My Collection', short: 'Collection', icon: Library, auth: true },
  { to: '/profile', label: 'My Profile', short: 'Profile', icon: UserRound, auth: true },
  { to: '/admin', label: 'Admin', short: 'Admin', icon: ShieldCheck, admin: true },
]
