import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { MobileNav } from './MobileNav'
import { Footer } from './Footer'
import { LoadingProgressBar } from '@/components/LoadingProgressBar'
import { Toaster } from '@/components/ui/Toaster'
import { LoginBookAnimation } from '@/components/auth/LoginBookAnimation'

export function AppLayout() {
  const { pathname } = useLocation()

  // New page -> start at the top (search param changes keep the scroll position).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <LoadingProgressBar />
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1 pb-24 md:pb-0">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <LoginBookAnimation />
      <Toaster />
    </div>
  )
}
