import { useEffect } from 'react'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

/** Route: /admin/* — already wrapped in <RequireAdmin> by the router. */
export default function AdminPage() {
  useEffect(() => {
    document.title = 'Admin · Book Shelf'
  }, [])
  return <AdminDashboard />
}
