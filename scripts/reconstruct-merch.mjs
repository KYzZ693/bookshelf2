#!/usr/bin/env node
// Prepares simulated 3D previews for merchandise.
//
// Workflow per item:  research (product page + photo) -> reference analysis -> reconstruction
// parameters -> saved on the merchandise row -> the browser builds the model from them.
// It runs once per item and the result is reused; re-run with --force after changing the rules.
//
// What it can reconstruct from a single product photo (approximations, never official models):
//   acrylic stands, acrylic keychains / charms, can badges, posters / postcards / shikishi /
//   bromides / clear files / cards, wall scrolls.
// Figures, plush, apparel and bags need a real sculpted model: upload a GLB in Admin.
//
//   node scripts/reconstruct-merch.mjs --dry-run     analyse and print, change nothing
//   node scripts/reconstruct-merch.mjs               save results (needs SUPABASE_SECRET_KEY in .env.local)
//   node scripts/reconstruct-merch.mjs --force       redo items that already have a result
//   node scripts/reconstruct-merch.mjs --only=<id>   one item
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jpeg from 'jpeg-js'
import { createClient } from '@supabase/supabase-js'
import { analyzeRGBA } from '../src/lib/reconstruct/analyze.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const DRY = !!args['dry-run']
const FORCE = !!args.force
const ONLY = typeof args.only === 'string' ? args.only : null
const CONCURRENCY = 4

function fail(msg) {
  console.error(`\n✖ ${msg}\n`)
  process.exit(1)
}

function loadEnv() {
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

// ---------------------------------------------------------------------------
// Which model, at what size (cm). Sizes come from the title when stated, otherwise the
// usual size of that kind of product.
// ---------------------------------------------------------------------------
const cm = (t) => {
  const m = t.match(/(\d+(?:\.\d+)?)\s*cm\b/i)
  return m ? Number(m[1]) : null
}
const PAPER = { a1: 84.1, b2: 72.8, a2: 59.4, b3: 51.5, a3: 42, b4: 36.4, a4: 29.7, b5: 25.7, a5: 21 }
const paperSize = (t) => {
  const m = t.toLowerCase().match(/\b([ab][1-5])\b/)
  return m ? PAPER[m[1]] ?? null : null
}

export function plan(m) {
  const t = m.title.toLowerCase()
  const type = m.merch_type
  const unsupported = (why) => ({ unsupported: why })

  if ((type === 'figure' || /nendoroid|figma|figure|q posket|luminasta|model kit|good ?smile/.test(t)) && !/acrylic/.test(t))
    return unsupported('Figures are sculpted 3D objects; a photo is not enough to rebuild one. Upload an official or licensed GLB model to enable a preview.')
  if (type === 'collectible' || /plush|\bnui\b|doll|mascot/.test(t))
    return unsupported('Plush and blind-box collectibles cannot be rebuilt from a single photo. Upload a GLB model to enable a preview.')
  if (/postcard book|sticker book|t-?shirt|\btee\b|\bbag\b|pouch|pillow|towel|eye mask|mouse ?pad|multi case|\bcase\b|mug|sticky note|note ?book|\bclip\b|id holder|badge holder/.test(t))
    return unsupported('Soft or multi-part goods (apparel, bags, cases, pads) are not reconstructed automatically. Upload a GLB model to enable a preview.')
  if (type === 'art_collection') return unsupported('Art collections are books; see the product photos.')

  if (/badge|button/.test(t)) {
    const size = /large|big|76\s?mm/.test(t) ? 7.6 : /mini|32\s?mm/.test(t) ? 3.2 : 5.7
    return { method: 'badge', size_cm: size, label: `${size * 10} mm can badge` }
  }
  // Keychains first: "Acrylic Stand Key Chain" is a keychain.
  if (/key ?chain|key ?holder|pendant|charm|strap|acrylic magnet/.test(t) || (type === 'keychain' && !/stand/.test(t))) {
    const size = cm(t) ?? (/\bbig\b|large/.test(t) ? 9 : 6)
    return { method: 'acrylic_charm', size_cm: size, thickness_mm: 3, label: `${size} cm acrylic keychain` }
  }
  if (type === 'acrylic_stand' || /acrylic (character |petit |big )?(stand|figure)|sns plate|diorama|standee|acrylic (plate|panel)/.test(t)) {
    const size = cm(t) ?? (/life size/.test(t) ? 30 : /\bbig\b|large/.test(t) ? 22 : /mini|petit|chibi|petanko/.test(t) ? 9 : /diorama/.test(t) ? 12 : 15)
    return { method: 'acrylic_stand', size_cm: size, thickness_mm: 3, label: `${size} cm acrylic stand` }
  }
  if (type === 'tapestry' || /tapestry|wall scroll/.test(t)) {
    const size = cm(t) ?? paperSize(t) ?? 60
    return { method: 'wall_scroll', size_cm: size, label: `${size} cm wall scroll` }
  }
  if (type === 'poster' || /poster/.test(t)) {
    const size = paperSize(t) ?? cm(t) ?? 51.5
    return { method: 'flat_print', finish: 'paper', size_cm: size, label: `${size} cm poster` }
  }
  if (/shikishi/.test(t)) return { method: 'flat_print', finish: 'gold_board', size_cm: 27.3, label: 'shikishi board (27.3 × 24.2 cm)' }
  if (/clear (file|folder)/.test(t)) return { method: 'flat_print', finish: 'clear', size_cm: 31, label: 'A4 clear file' }
  if (/bromide/.test(t)) return { method: 'flat_print', finish: 'card', size_cm: 12.7, label: 'bromide photo card' }
  if (type === 'postcard' || /post ?card/.test(t)) return { method: 'flat_print', finish: 'card', size_cm: 14.8, label: 'postcard' }
  if (/sticker/.test(t)) return { method: 'flat_print', finish: 'card', size_cm: paperSize(t) ?? 14.8, label: 'sticker sheet' }
  if (/ticket|card/.test(t)) return { method: 'flat_print', finish: 'card', size_cm: 9, label: 'card' }
  if (type === 'art_print') return { method: 'flat_print', finish: 'board', size_cm: paperSize(t) ?? cm(t) ?? 30, label: 'art print' }
  if (type === 'bookmark') return { method: 'flat_print', finish: 'card', size_cm: 15, label: 'bookmark' }
  return unsupported('This kind of item is not reconstructed automatically. Upload a GLB model to enable a preview.')
}

// ---------------------------------------------------------------------------
// Reference analysis
// ---------------------------------------------------------------------------
async function downloadRGBA(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'BookShelf-merch-preview/1.0' } })
  if (!res.ok) throw new Error(`photo download failed (HTTP ${res.status})`)
  // The browser builds the model from the photo, which needs the image host to allow it (CORS).
  if (!res.headers.get('access-control-allow-origin')) throw new Error('the image host does not allow its photos to be used as 3D textures in the browser')
  const buf = Buffer.from(await res.arrayBuffer())
  if (!(buf[0] === 0xff && buf[1] === 0xd8)) throw new Error('only JPEG product photos can be analysed')
  const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 })
  // Downscale (nearest) to ~400 px for analysis; crops are stored normalised.
  const s = Math.min(1, 400 / Math.max(img.width, img.height))
  const w = Math.max(2, Math.round(img.width * s))
  const h = Math.max(2, Math.round(img.height * s))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / s))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / s))
      const si = (sy * img.width + sx) * 4
      const di = (y * w + x) * 4
      out[di] = img.data[si]
      out[di + 1] = img.data[si + 1]
      out[di + 2] = img.data[si + 2]
      out[di + 3] = 255
    }
  }
  return { data: out, w, h }
}

async function reconstruct(m) {
  const p = plan(m)
  const refs = [m.product_url, m.image_url].filter(Boolean)
  if (p.unsupported) {
    return { reconstruction_status: 'not_started', preview_available: false, model_format: null, model_params: null, model_source: null, reconstruction_notes: p.unsupported, reference_urls: refs }
  }
  if (!m.image_url) {
    return { reconstruction_status: 'failed', preview_available: false, model_format: null, model_params: null, model_source: null, reconstruction_notes: 'No product photo to reconstruct from.', reference_urls: refs }
  }
  const failed = (why) => ({ reconstruction_status: 'failed', preview_available: false, model_format: null, model_params: null, model_source: null, reconstruction_notes: why, reference_urls: refs })

  let img
  try {
    img = await downloadRGBA(m.image_url)
  } catch (e) {
    return failed(`The product photo could not be analysed: ${e.message}.`)
  }
  const tol = 26
  const a = analyzeRGBA(img.data, img.w, img.h, tol)
  // A "plain" studio photo: light, neutral, uniform border; the piece does not touch the edge;
  // not shattered into many fragments (gradients / bokeh produce lots of small pieces).
  const [br, bgc, bb] = a.bg
  const neutralLight = Math.min(br, bgc, bb) >= 170 && Math.max(br, bgc, bb) - Math.min(br, bgc, bb) <= 30
  const main = a.components[0]
  const inside = !!main && main.x0 > 0 && main.y0 > 0 && main.x1 < a.width - 1 && main.y1 < a.height - 1
  const plain =
    neutralLight && a.borderUniformity >= 0.9 && a.backgroundShare >= 0.06 && a.backgroundShare <= 0.97 &&
    a.components.length > 0 && a.components.length <= 40 && inside
  const pieces = plain ? a.components.filter((c) => c.area >= main.area * 0.2).length : 0
  const crop = plain ? [main.x0 / a.width, main.y0 / a.height, (main.x1 + 1) / a.width, (main.y1 + 1) / a.height].map((v) => Math.round(v * 10000) / 10000) : null
  const cutout = p.method === 'acrylic_stand' || p.method === 'acrylic_charm' || p.method === 'badge'

  // A set / random-design product shown on a promotional image: there is no single print to show.
  if (!cutout && !plain && /\bset\b|pcs|random|trading|collection|สุ่ม/i.test(m.title)) {
    return failed('The product photo is a promotional image of a set, so no single print can be isolated. Upload a GLB model or a photo of one piece to enable a preview.')
  }
  if (cutout && !plain) {
    return failed('The product photo is a promotional image without a plain background, so the piece cannot be cut out reliably. Upload a GLB model or a plain-background photo to enable a preview.')
  }
  if (p.method === 'badge') {
    const ratio = (main.x1 - main.x0 + 1) / (main.y1 - main.y0 + 1)
    const fill = main.area / ((main.x1 - main.x0 + 1) * (main.y1 - main.y0 + 1))
    if (ratio < 0.8 || ratio > 1.25 || fill < 0.65 || fill > 0.9) return failed('No round badge could be isolated in the product photo.')
  }

  const params = {
    method: p.method,
    // Prints: a set photo -> the largest single piece; a photo that is the print itself -> whole photo.
    crop: p.method === 'flat_print' || p.method === 'wall_scroll' ? (plain && (pieces > 1 || main.area / (a.width * a.height) > 0.15) ? crop : null) : crop,
    bg: cutout ? a.bg : null,
    tol,
    size_cm: p.size_cm,
    ...(p.finish ? { finish: p.finish } : {}),
    ...(p.thickness_mm ? { thickness_mm: p.thickness_mm } : {}),
  }
  const notes = [
    `Simulated ${p.label} built from the product photo.`,
    cutout ? 'The artwork outline was traced from the photo;' : 'The photo is used as the printed surface;',
    'thickness, size, base and hardware are typical values for this kind of product, not measured from the item.',
    pieces > 1 ? `The photo shows ${pieces} pieces (set or random design); the largest one is shown.` : '',
    !cutout && !params.crop ? 'The whole product photo is used, so any background in it appears on the print.' : '',
  ].filter(Boolean).join(' ')

  return {
    reconstruction_status: 'completed',
    preview_available: true,
    model_format: 'procedural',
    model_url: null,
    model_params: params,
    model_source: 'Procedural reconstruction from the publisher product photo (Book Shelf)',
    reconstruction_notes: notes.slice(0, 2000),
    reference_urls: refs,
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const env = loadEnv()
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = DRY ? env.SUPABASE_SECRET_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY : env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) fail('VITE_SUPABASE_URL is missing in .env')
  if (!key) fail('SUPABASE_SECRET_KEY is missing in .env.local (or run with --dry-run).')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  const rows = []
  // A dry run also works before the 3D-preview migration is applied (status columns missing).
  let columns = 'id, title, merch_type, image_url, product_url, model_format, reconstruction_status'
  for (let from = 0; ; from += 1000) {
    let q = db.from('merchandise').select(columns).order('title').range(from, from + 999)
    if (ONLY) q = q.eq('id', ONLY)
    const { data, error } = await q
    if (error && DRY && /column/.test(error.message) && columns.includes('model_format')) {
      columns = 'id, title, merch_type, image_url, product_url'
      from -= 1000
      continue
    }
    if (error) fail(`Could not read merchandise: ${error.message}${/column/.test(error.message) ? ' — run: npx supabase db push --remote' : ''}`)
    rows.push(...data.map((r) => ({ reconstruction_status: 'not_started', model_format: null, ...r })))
    if (data.length < 1000) break
  }
  const todo = rows.filter((m) => {
    if (m.model_format === 'glb' || m.model_format === 'gltf') return FORCE && false // never replace a real model file
    return FORCE || ONLY || m.reconstruction_status === 'not_started' || m.reconstruction_status === 'failed'
  })
  console.log(`\nMerchandise 3D previews${DRY ? ' (dry run)' : ''}: ${todo.length} of ${rows.length} items to process`)

  const tally = { completed: 0, failed: 0, not_started: 0 }
  const review = []
  const byMethod = {}
  let i = 0
  async function worker() {
    while (i < todo.length) {
      const m = todo[i++]
      if (!DRY) await db.from('merchandise').update({ reconstruction_status: 'modeling' }).eq('id', m.id)
      const r = await reconstruct(m)
      review.push({ id: m.id, title: m.title, merch_type: m.merch_type, image_url: m.image_url, product_url: m.product_url, ...r })
      tally[r.reconstruction_status]++
      if (r.model_params) byMethod[r.model_params.method] = (byMethod[r.model_params.method] ?? 0) + 1
      if (DRY || ONLY) console.log(`  ${r.reconstruction_status.padEnd(11)} ${m.title.slice(0, 70)}${r.model_params ? `  [${r.model_params.method}]` : ''}\n              ${r.reconstruction_notes}`)
      if (!DRY) {
        const { error } = await db.from('merchandise').update(r).eq('id', m.id)
        if (error) console.warn(`  ! ${m.title}: ${error.message}`)
      }
      process.stdout.write(DRY || ONLY ? '' : `\r  processed ${Math.min(i, todo.length)}/${todo.length}`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  // Review file: every decision with its notes, for checking before / after saving.
  const out = path.join(ROOT, 'scripts', '.cache', 'merch-reconstruction-review.json')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, JSON.stringify(review.sort((a, b) => a.title.localeCompare(b.title)), null, 2))
  console.log(`\n  review file: ${path.relative(ROOT, out)}`)
  console.log('\n  previews built:', tally.completed, byMethod)
  console.log('  could not build from the photo:', tally.failed)
  console.log('  type needs a real model (GLB):', tally.not_started)
  console.log(DRY ? '\nDry run: nothing was saved.\n' : '\nSaved. Open an item under /merchandise to see its preview.\n')
}

main().catch((e) => fail(e.stack || e.message))
