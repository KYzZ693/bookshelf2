// Shared parts of the publisher importers: environment, database client, text helpers and
// the import itself (one import_catalog() call per batch of series).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
export const CACHE_DIR = path.join(ROOT, 'scripts', '.cache')
export const ALL_TYPES = ['light_novel', 'manga', 'novel', 'artbook', 'merchandise']
const BATCH_SERIES = 40

export function fail(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function parseArgs(argv) {
  return Object.fromEntries(
    argv.map((a) => {
      const [k, ...v] = a.replace(/^--/, '').split('=')
      return [k, v.length ? v.join('=') : true]
    }),
  )
}

/** .env then .env.local; real environment variables win. */
export function loadEnv() {
  const env = {}
  for (const file of ['.env', '.env.local']) {
    const p = path.join(ROOT, file)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return { ...env, ...process.env }
}

/** Service-role client for writes; null when only reading public data is possible. */
export function createDb(env, { write }) {
  for (const [k, v] of Object.entries(env)) {
    if (k.startsWith('VITE_') && /^(sb_secret_|eyJ)/.test(String(v)) && !/PUBLISHABLE|ANON/.test(k)) {
      fail(`${k} looks like a secret key. VITE_ variables are published in the website bundle — remove it now and rotate the key in Supabase.`)
    }
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !/^https?:\/\//.test(url)) {
    if (write) fail('VITE_SUPABASE_URL is missing in .env')
    return null
  }
  if (/\/rest\/v1\/?$/.test(url)) fail('VITE_SUPABASE_URL must not end with /rest/v1/ — use https://<project-ref>.supabase.co')
  if (write) {
    if (!secret) fail('SUPABASE_SECRET_KEY is missing. Add it to .env.local (Dashboard → Project Settings → API Keys → Secret keys), or run with --dry-run.')
    if (secret.startsWith('sb_publishable_')) fail('SUPABASE_SECRET_KEY holds the publishable key. The importer needs a secret key (sb_secret_...).')
  }
  const key = secret || env.VITE_SUPABASE_PUBLISHABLE_KEY
  return key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

/** source_refs already in the catalog for a prefix (public read; works in dry runs too). */
export async function existingRefs(db, prefix) {
  const refs = new Set()
  if (!db) return refs
  for (const table of ['books', 'merchandise']) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(table).select('source_ref').like('source_ref', `${prefix}:%`).range(from, from + 999)
      if (error) return refs
      for (const r of data) refs.add(r.source_ref)
      if (data.length < 1000) break
    }
  }
  return refs
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
export function decode(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+|#39);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}
export const squash = (s) => s.replace(/[ \t ]+/g, ' ').trim()

/** HTML -> plain paragraphs. */
export function htmlToText(html) {
  if (!html) return ''
  const text = decode(
    html
      .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
  return text.split('\n').map(squash).join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const splitNames = (s) =>
  s.split(/\s*[,/、，]\s*|\s+และ\s+|\s*&\s*/).map((n) => squash(n).replace(/[()（）]/g, '').trim()).filter((n) => n.length >= 2 && n.length <= 80)

export const norm = (s) => s.toLowerCase().normalize('NFKC').replace(/[\s\-–—:~!?.,'"“”‘’()[\]【】]+/g, '')
export const shortHash = (s) => {
  let h = 2166136261
  for (const ch of s) h = Math.imul(h ^ ch.codePointAt(0), 16777619)
  return (h >>> 0).toString(36)
}

/** Valid 13-digit ISBN (dashes allowed), else null. */
export function cleanIsbn(v) {
  const d = String(v ?? '').replace(/[^0-9Xx]/g, '')
  return /^97[89]\d{10}$/.test(d) ? d : null
}

// Order matters: the first match wins ("Acrylic Stand Key Chain" is a keychain).
const MERCH_RULES = [
  [/key ?chain|key ?holder|pendant|charm|strap|พวงกุญแจ/i, 'keychain'],
  [/acrylic (character |petit |big )?(stand|figure)|สแตนดี้|standee|diorama|sns plate/i, 'acrylic_stand'],
  [/nendoroid|figma|figure|q posket|luminasta|good ?smile|model kit|ฟิกเกอร์/i, 'figure'],
  [/tapestry|wall scroll|ผ้าแขวน/i, 'tapestry'],
  [/shikishi|bromide|art print|art board|canvas/i, 'art_print'],
  [/poster|โปสเตอร์/i, 'poster'],
  [/post ?card|โปสการ์ด/i, 'postcard'],
  [/bookmark|ที่คั่น/i, 'bookmark'],
  [/plush|\bnui\b|doll|mascot|blind box|ตุ๊กตา/i, 'collectible'],
  [/art collection|art ?book|illustration/i, 'art_collection'],
  [/badge|button|clear (file|folder)|sticker|t-shirt|\btee\b|bag|pouch|case|mouse ?pad|pillow|towel|magnet|card|ticket|clip|mask|note|mug|coaster|plate|panel|เข็มกลัด|แฟ้ม|สติ๊กเกอร์|กระเป๋า|เสื้อ/i, 'character_goods'],
]
export const merchType = (title) => MERCH_RULES.find(([re]) => re.test(title))?.[1] ?? 'other'

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------
export function summarize(series, warnings, skipped) {
  const count = (fn) => series.reduce((n, s) => n + fn(s), 0)
  return {
    series: series.length,
    books: count((s) => s.books.length),
    special_editions: count((s) => s.books.filter((b) => b.edition_type !== 'regular').length),
    merchandise: count((s) => s.merchandise.length),
    with_synopsis: count((s) => s.books.filter((b) => b.synopsis).length),
    with_isbn: count((s) => s.books.filter((b) => b.isbn).length),
    skipped,
    warnings: warnings.length,
  }
}

export async function importSeries(db, publisher, series, { overwrite }) {
  const totals = {}
  for (let i = 0; i < series.length; i += BATCH_SERIES) {
    const batch = series.slice(i, i + BATCH_SERIES)
    const { data, error } = await db.rpc('import_catalog', { p_payload: { publisher, series: batch }, p_overwrite: overwrite })
    if (error) {
      if (/import_catalog/.test(error.message) && /(find|exist)/i.test(error.message)) {
        fail('The database has no import_catalog() function yet. Run: npx supabase db push --remote')
      }
      fail(`Batch ${i / BATCH_SERIES + 1} failed: ${error.message}${error.details ? ` (${error.details})` : ''}`)
    }
    for (const [k, v] of Object.entries(data ?? {})) totals[k] = (totals[k] ?? 0) + v
    process.stdout.write(`\r  imported ${Math.min(i + BATCH_SERIES, series.length)}/${series.length} series`)
  }
  process.stdout.write('\n')

  // Bonus items of special editions and release dates.
  const extras = series.flatMap((s) =>
    s.books
      .filter((b) => b.bonus_items?.length || b.publication_date)
      .map((b) => ({
        ref: b.ref,
        ...(b.bonus_items?.length ? { bonus_items: b.bonus_items } : {}),
        ...(b.publication_date ? { publication_date: b.publication_date } : {}),
      })),
  )
  let saved = 0
  for (let i = 0; i < extras.length; i += 500) {
    const { data, error } = await db.rpc('import_book_extras', { p_items: extras.slice(i, i + 500) })
    if (error) {
      console.warn(`  bonus items skipped: ${error.message} (run: npx supabase db push --remote)`)
      break
    }
    saved += data ?? 0
  }
  return { ...totals, bonus_items_updated: saved }
}
