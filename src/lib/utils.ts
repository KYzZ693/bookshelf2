import type { PostgrestError } from '@supabase/supabase-js'

/** Join class names, skipping falsy values. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const priceFormatters = new Map<string, Intl.NumberFormat>()
export function formatPrice(value: number | null | undefined, currency = 'THB'): string | null {
  if (value === null || value === undefined) return null
  let f = priceFormatters.get(currency)
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 })
    } catch {
      f = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
    }
    priceFormatters.set(currency, f)
  }
  return f.format(value)
}

export function formatDate(value: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!value) return null
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(undefined, opts).format(d)
}

export function formatVolume(v: number | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return Number.isInteger(Number(v)) ? String(Number(v)) : String(Number(v).toFixed(1))
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}

/** Human-friendly message for Supabase / network errors. */
export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!err) return fallback
  const e = err as Partial<PostgrestError> & { message?: string; status?: number; name?: string }
  const msg = e.message ?? (typeof err === 'string' ? err : '')
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Network error — check your connection and try again.'
  if (e.code === '23505') return 'That value already exists.'
  if (e.code === '23503') return 'This item references something that no longer exists.'
  if (e.code === '23514') return 'Some values are invalid. Please check the form.'
  if (e.code === '42501' || /row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.'
  if (e.code === 'PGRST301' || /jwt expired/i.test(msg)) return 'Your session has expired. Please sign in again.'
  return msg || fallback
}

/** Throw Supabase errors so React Query can surface them. */
export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw res.error
  return res.data
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Stable hue from a string, for decorative variety on generated covers. */
export function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function splitParagraphs(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export function isValidHttpUrl(value: string) {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
