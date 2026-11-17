import { supabase, publicStorageUrl } from '@/lib/supabase'
import { resizeImage } from '@/lib/image'
import { withProgress } from '@/lib/progress'

function extFor(blob: Blob, fallback: string) {
  const map: Record<string, string> = {
    'image/webp': 'webp',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/avif': 'avif',
    'image/gif': 'gif',
  }
  return map[blob.type] ?? fallback
}

function randomId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12)
}

/**
 * Upload a catalog image (admins only — enforced by storage policies).
 * folder: 'series' | 'books' | 'merchandise' | 'publishers'
 */
export async function uploadCatalogImage(file: File, folder: string): Promise<string> {
  const blob = await resizeImage(file, folder === 'publishers' ? 400 : 900)
  const path = `${folder}/${new Date().getFullYear()}/${randomId()}.${extFor(blob, 'jpg')}`
  const { error } = await withProgress(
    supabase.storage.from('covers').upload(path, blob, {
      cacheControl: '31536000',
      contentType: blob.type || file.type,
      upsert: false,
    }),
  )
  if (error) throw error
  return publicStorageUrl('covers', path)
}

/** Upload the signed-in user's avatar into avatars/<uid>/... */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const blob = await resizeImage(file, 320, 0.9)
  const path = `${userId}/avatar-${randomId()}.${extFor(blob, 'jpg')}`
  const { error } = await withProgress(
    supabase.storage.from('avatars').upload(path, blob, {
      cacheControl: '31536000',
      contentType: blob.type || file.type,
      upsert: false,
    }),
  )
  if (error) throw error
  return publicStorageUrl('avatars', path)
}

/** Best-effort removal of a previous avatar stored in our bucket. */
export async function removeOldAvatar(url: string | null | undefined, userId: string) {
  if (!url) return
  const marker = '/storage/v1/object/public/avatars/'
  const idx = url.indexOf(marker)
  if (idx === -1) return
  const path = decodeURIComponent(url.slice(idx + marker.length))
  if (!path.startsWith(`${userId}/`)) return
  await supabase.storage.from('avatars').remove([path])
}
