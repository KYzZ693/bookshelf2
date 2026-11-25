import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'framer-motion'
import { queryClient } from '@/lib/queryClient'
import { isSupabaseConfigured } from '@/lib/supabase'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppLayout } from '@/components/layout/AppLayout'
import { RouteProgress } from '@/components/LoadingProgressBar'
import { RequireAuth, RequireAdmin } from '@/components/layout/Guards'
import SetupRequired from '@/pages/SetupRequired'
import HomePage from '@/pages/HomePage'

// Route-level code splitting: the progress bar runs while a chunk loads.
const SearchPage = lazy(() => import('@/pages/SearchPage'))
const SeriesDetailPage = lazy(() => import('@/pages/SeriesDetailPage'))
const BookDetailPage = lazy(() => import('@/pages/BookDetailPage'))
const MerchDetailPage = lazy(() => import('@/pages/MerchDetailPage'))
const MerchandisePage = lazy(() => import('@/pages/MerchandisePage'))
const CollectionPage = lazy(() => import('@/pages/CollectionPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const AdminPage = lazy(() => import('@/pages/AdminPage'))
const AuthCallbackPage = lazy(() => import('@/pages/AuthCallbackPage'))
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || undefined

export default function App() {
  if (!isSupabaseConfigured) return <SetupRequired />

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <AuthProvider>
          <BrowserRouter basename={basename}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route index element={<HomePage />} />
                <Route path="search" element={<Lazy><SearchPage /></Lazy>} />
                <Route path="series/:id" element={<Lazy><SeriesDetailPage /></Lazy>} />
                <Route path="book/:id" element={<Lazy><BookDetailPage /></Lazy>} />
                <Route path="merch/:id" element={<Lazy><MerchDetailPage /></Lazy>} />
                <Route path="merchandise" element={<Lazy><MerchandisePage /></Lazy>} />
                <Route
                  path="collection"
                  element={<RequireAuth reason="Sign in to see your collection."><Lazy><CollectionPage /></Lazy></RequireAuth>}
                />
                <Route
                  path="profile"
                  element={<RequireAuth reason="Sign in to view your profile."><Lazy><ProfilePage /></Lazy></RequireAuth>}
                />
                <Route path="admin/*" element={<RequireAdmin><Lazy><AdminPage /></Lazy></RequireAdmin>} />
                <Route path="auth/callback" element={<Lazy><AuthCallbackPage /></Lazy>} />
                <Route path="reset-password" element={<Lazy><ResetPasswordPage /></Lazy>} />
                <Route path="*" element={<Lazy><NotFoundPage /></Lazy>} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteProgress />}>{children}</Suspense>
}
