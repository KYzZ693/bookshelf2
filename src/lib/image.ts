/**
 * Downscale an image in the browser before uploading so Storage holds
 * reasonably sized files (covers ~ 900px wide, avatars 320px).
 * GIF/AVIF and already-small images are uploaded unchanged.
 */
export async function resizeImage(file: File, maxWidth: number, quality = 0.86): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  if (bitmap.width <= maxWidth && file.size < 600_000) {
    bitmap.close()
    return file
  }
  const scale = Math.min(1, maxWidth / bitmap.width)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
  return blob ?? file
}

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif,image/gif'

export function validateImageFile(file: File, maxBytes = MAX_UPLOAD_BYTES): string | null {
  if (!file.type.startsWith('image/')) return 'Please choose an image file.'
  if (file.size > maxBytes * 2) return `Image is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB).`
  return null
}
