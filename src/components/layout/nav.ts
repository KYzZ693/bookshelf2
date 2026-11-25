import { Gem, Home, Library, Search, ShieldCheck, type LucideIcon } from 'lucide-react'

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
  { to: '/merchandise', label: 'Merchandise', short: 'Merch', icon: Gem },
  { to: '/collection', label: 'My Collection', short: 'Collection', icon: Library, auth: true },
  // The profile page stays at /profile; it is reached from the avatar / account menu.
  { to: '/admin', label: 'Admin', short: 'Admin', icon: ShieldCheck, admin: true },
]
