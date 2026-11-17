import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

/** True when both env vars are present and the URL looks real. */
export const isSupabaseConfigured = Boolean(url && /^https?:\/\/[^\s]+$/i.test(url) && publishableKey)

/**
 * Single shared Supabase client. Only the publishable (client-safe) key is used
 * here; the service_role key must never reach the browser.
 *
 * PKCE flow: OAuth / magic links / password resets come back as `?code=...`,
 * which works with path-based routing on static hosts (GitHub Pages included).
 */
export const supabase = createClient(
  isSupabaseConfigured ? url! : 'http://localhost.invalid',
  publishableKey || 'missing-key',
  {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'bookshelf-auth',
    },
  },
)

/** Path the SPA is served from, always with leading and trailing slash. */
export const BASE_PATH = import.meta.env.BASE_URL

/** Absolute URL to a route inside the app, e.g. appUrl('auth/callback'). */
export function appUrl(path = ''): string {
  return `${window.location.origin}${BASE_PATH}${path.replace(/^\//, '')}`
}

/** Public URL for an object in a public storage bucket. */
export function publicStorageUrl(bucket: 'covers' | 'avatars', path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
