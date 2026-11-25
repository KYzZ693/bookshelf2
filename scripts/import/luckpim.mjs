// Luckpim adapter (https://www.luckpim.com).
//
// Luckpim's shop is a custom site without a public catalog API, so this adapter reads the
// product sitemap and then each product page (server-rendered HTML with a tidy "ข้อมูลหนังสือ"
// block: title, author, artist, ISBN, release date, price, synopsis, sub-categories).
//
// Politeness: one page per second. The first run reads every page (~2,500, about 45 minutes);
// later runs read only products that are not in the catalog yet, plus a rotating twelfth of
// the known ones (every product is refreshed about once every 12 weeks).
// Parsed pages are cached in scripts/.cache/luckpim-pages.json.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { ALL_TYPES, CACHE_DIR, cleanIsbn, decode, fail, merchType, norm, shortHash, sleep, splitNames, squash } from './core.mjs'

export const key = 'luckpim'
export const publisher = 'Luckpim'

const SITE = 'https://www.luckpim.com'
const SITEMAP = `${SITE}/sitemap/products.xml.gz`
const PAGES_FILE = path.join(CACHE_DIR, 'luckpim-pages.json')
const UA = 'BookShelf-catalog-import/1.0 (personal catalog; weekly)'
const ROTATION = 12

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------
async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xml' } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } catch (e) {
    if (attempt >= 4) throw e
    await sleep(2000 * 2 ** attempt)
    return get(url, attempt + 1)
  }
}

async function productIds() {
  const res = await get(SITEMAP)
  if (!res) fail('Luckpim product sitemap not found.')
  const buf = Buffer.from(await res.arrayBuffer())
  const xml = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8')
  return [...new Set([...xml.matchAll(/\/product\/detail\/(\d+)/g)].map((m) => Number(m[1])))].sort((a, b) => b - a)
}

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(PAGES_FILE, 'utf8'))
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Page parsing
// ---------------------------------------------------------------------------
const strip = (s) => squash(decode(String(s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')))

const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
/** "25 พฤศจิกายน 2569" (Buddhist era) -> "2026-11-25" */
export function thaiDate(s) {
  const m = String(s ?? '').match(/(\d{1,2})\s+(\S+)\s+(\d{4})/)
  if (!m) return null
  const month = THAI_MONTHS.indexOf(m[2]) + 1
  if (!month) return null
  let year = Number(m[3])
  if (year > 2400) year -= 543
  return `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

export function parsePage(html) {
  const g = (re) => html.match(re)?.[1]
  const info = {}
  for (const m of html.matchAll(/<div class=title>([^<]+)<\/div>\s*<div class="?detail[^>]*>([\s\S]*?)<\/div>/g)) info[strip(m[1])] = strip(m[2])
  const subs = [...(html.match(/section-sub-category[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '').matchAll(/class="button trans item"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => strip(m[1]))
  const intro = strip(g(/<div class=intro>([\s\S]*?)<\/div>/) ?? '')
  const img = g(/property=og:image content=([^ >]+)/) ?? g(/og:image" content="([^"]+)/) ?? g(/og:image content=([^ >]+)/)
  return {
    category: strip(g(/caytegory_name>([\s\S]*?)<\/div>/) ?? ''),
    title: strip(g(/<h1 class="title[^"]*">([\s\S]*?)<\/h1>/) ?? ''),
    by: strip(g(/<div class=by>([\s\S]*?)<\/div>/) ?? '').replace(/^โดย\s*/, ''),
    price: Number((g(/class="(?:red|green) f_bold">([\d,.]+)/) ?? '').replace(/,/g, '')) || null,
    regular_price: Number((g(/line-through f_med">([\d,.]+)/) ?? '').replace(/,/g, '')) || null,
    synopsis: intro && !/^[-–—\s]*$/.test(intro) ? intro : null,
    info,
    genres: subs,
    image: img ? img.replace(/\/d\d+x\d+\//, '/d568x800/') : null,
  }
}

// ---------------------------------------------------------------------------
// Product -> catalog item
// ---------------------------------------------------------------------------
const GENRE_MAP = { romantic: 'Romance', 'slice of life': 'Slice of Life', 'sci-fi': 'Science Fiction', yaoi: "Boys' Love", 'boy love': "Boys' Love", 'girl love': 'Yuri' }

function formatOf(category, title) {
  const c = category.toLowerCase()
  if (/อาร์ตบุ๊ก|artbook|art book/.test(c) || /\bart ?book\b|artworks?\b/i.test(title)) return 'artbook'
  if (/มังงะ|การ์ตูน|manga|comic/.test(c)) return 'manga'
  if (/นิยาย|ไลท์โนเวล|novel|วรรณกรรม/.test(c)) return 'light_novel'
  if (/สินค้า|ของที่ระลึก|merch|goods|อื่น/.test(c) || merchType(title) !== 'other') return 'merchandise'
  return null
}

// Bonus / edition text in brackets: "(ปกพิเศษ + Postcard)", "[ปกพิเศษ+เซตโปสการ์ด 6 ใบ]"
const BONUS = /ปกพิเศษ|โปสการ์ด|postcard|แถม|เซต|set|limited|สติ๊กเกอร์|sticker|ที่คั่น|bookmark|การ์ด|card|ของแถม|พวงกุญแจ|acrylic|อะคริลิค|box|กล่อง|premium|พรีเมียม|ลายเซ็น/i
// Leading tags, bracketed ("[เซตพิเศษ]", "(พร้อมส่ง)", "[SLEEVE BOX]") or bare ("เซตพิเศษ …", "BOX SET …").
const PREFIX =
  /^\s*(?:[[(（【]\s*(เซตพิเศษ|เซ็ตพิเศษ|แพ็คชุด|แพคชุด|นิยาย|มังงะ|พร้อมส่ง|limited[^)\]）】]*|pre-?order|พรีออเดอร์|boxset|box set|sleeve box|สินค้าราคาพิเศษ[^)\]）】]*)\s*[\])）】]|(เซตพิเศษ|เซ็ตพิเศษ|แพ็คชุด|แพคชุด|นิยาย|box ?set)(?=\s))\s*/i

function cleanTitle(raw) {
  let rest = squash(raw)
  const tags = []
  let m
  while ((m = rest.match(PREFIX))) {
    tags.push((m[1] ?? m[2]).toLowerCase())
    rest = rest.slice(m[0].length)
  }
  const bonuses = []
  rest = rest.replace(/\s*[[(（]([^\])）]{2,80})[\])）]/g, (all, inner) => {
    if (/แพ็คชุด|แพคชุด|box ?set/i.test(inner)) {
      tags.push('แพ็คชุด')
      return ' '
    }
    // Shop notes, not part of the title
    if (/เล่มธรรมดา|ไม่รับเปลี่ยน|ไม่รับเคลม|ไม่รับคืน/.test(inner)) return ' '
    if (BONUS.test(inner)) {
      bonuses.push(squash(inner))
      return ' '
    }
    return all
  })
  // Store exclusives ("Only Naiin", "(Only @Naiin)") and purchase limits.
  rest = rest.replace(/\s*\(?\s*only\s*@?\s*naiin\s*\)?/gi, () => {
    bonuses.push('Only Naiin')
    return ' '
  })
  rest = rest.replace(/\s*\([^)]*จำกัดการซื้อ[^)]*\)/g, ' ')
  // "… 01 + ปกพิเศษ + ป้ายแขวนประตู", "… 3 + Short Story"
  const plus = rest.match(/\s+\+\s+(.*)$/)
  if (plus) {
    bonuses.push(...plus[1].split(/\s+\+\s+/).map(squash).filter(Boolean))
    rest = rest.slice(0, plus.index)
  }
  // "… แถมฟรี โปสการ์ด", "… แถม Mini Shikishi", "… พร้อม โอบิ และ การ์ดลายเซ็นต์"
  const free = rest.match(/\s+((?:แถม(?:ฟรี)?|พร้อม)\s+.*|และ\s+(?:\S+\s+)?(?:clear card|card|postcard|โปสการ์ด|การ์ด|shikishi).*)$/i)
  if (free) {
    bonuses.push(squash(free[1]))
    rest = rest.slice(0, free.index)
  }
  const specialSet = rest.match(/\s+special set\s*$/i)
  if (specialSet) {
    tags.push('เซตพิเศษ')
    rest = rest.slice(0, specialSet.index)
  }
  return { tags, bonuses: [...new Set(bonuses)], title: squash(rest) }
}

function volumeOf(t) {
  if (/เล่มเดียวจบ|จบในเล่ม/.test(t)) return { volume: 1, range: null, base: t.replace(/\(?(?:เล่มเดียวจบ|จบในเล่ม)\)?/g, '') }
  const core = t.replace(/\s*[([](?:จบ|ฉบับจบ|เล่มจบ|จบภาค|นิยาย|มังงะ)[)\]]\s*/g, ' ').trim()
  // Two-part works: "… ภาคต้น" = 1, "… ภาคปลาย" = 2
  const part = core.match(/^(.*?)\s*\(?(ภาคต้น|ภาคปลาย)\)?\s*$/)
  if (part && part[1].trim()) return { volume: part[2] === 'ภาคต้น' ? 1 : 2, range: null, base: part[1] }
  // "คลังสยอง รวมผลงาน… - 03 - คำสาป…": the number sits between dashes, a subtitle follows.
  const mid = core.match(/^(.*?)\s+-\s*(\d{1,3})\s*-\s+(.+)$/)
  if (mid && mid[1].trim()) return { volume: Number(mid[2]), range: null, base: mid[1] }
  const range = core.match(/^(.*?)\s*(?:เล่มที่|เล่ม|vol\.?)?\s*(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)\s*$/i)
  if (range && range[1].trim()) return { volume: null, range: `${range[2]}-${range[3]}`, base: range[1] }
  const one = core.match(/^(.*?)\s*(?:เล่มที่|เล่ม|vol\.?)\s*(\d+(?:\.\d+)?)\b(.*)$/i) ?? core.match(/^(.*\S)\s+(\d{1,3}(?:\.\d)?)\s*$/)
  if (one && one[1].trim()) return { volume: Number(one[2]), range: null, base: one[1] }
  return { volume: null, range: null, base: core }
}

function editionOf(tags, bonuses, range) {
  const notes = [...bonuses]
  if (range) notes.unshift(`เล่ม ${range}`)
  if (tags.some((t) => /แพ็คชุด|แพคชุด|box/.test(t)) || range) return { edition: 'boxset', notes }
  if (tags.some((t) => /limited/.test(t)) || bonuses.some((b) => /limited/i.test(b))) return { edition: 'limited', notes }
  if (tags.some((t) => /เซตพิเศษ|เซ็ตพิเศษ/.test(t)) || bonuses.length) return { edition: 'special', notes }
  return { edition: 'regular', notes }
}

export function toItem(id, p) {
  const format = formatOf(p.category, p.title)
  if (!format || !p.title) return { skip: p.category ? `category "${p.category}"` : 'no title' }
  const { tags, bonuses, title } = cleanTitle(p.title)
  const { volume, range, base } = volumeOf(title)
  const { edition, notes } = editionOf(tags, bonuses, range)
  const by = splitNames(p.by)
  const art = splitNames(p.info['ภาพ'] ?? '')
  const story = splitNames(p.info['เรื่องโดย'] ?? p.info['ผู้แต่ง'] ?? '')
  const translators = splitNames(p.info['แปล'] ?? p.info['ผู้แปล'] ?? '')
  const authors = story.length ? story : by
  // The artist field often repeats the author (manga, and some novels): keep it only when it differs.
  const illustrators = art.filter((a) => !authors.some((x) => norm(x) === norm(a)))
  const pubDate = thaiDate(p.info['วันที่จำหน่าย'])
  return {
    format,
    base: squash(base.replace(/[\s\-–:~]+$/, '')),
    genres: p.genres.map((g) => GENRE_MAP[g.toLowerCase()] ?? g).filter((g) => g && g.length <= 60),
    book: {
      ref: `luckpim:${id}`,
      title: squash(p.title).slice(0, 300),
      volume_number: volume,
      item_type: format,
      edition_type: edition,
      edition_notes: notes.length ? notes.join(' · ').slice(0, 1000) : null,
      cover_url: p.image,
      synopsis: p.synopsis?.slice(0, 20000) ?? null,
      price: p.regular_price ?? p.price,
      currency: 'THB',
      isbn: cleanIsbn(p.info.ISBN),
      product_url: `${SITE}/product/detail/${id}`,
      publication_date: pubDate,
      authors,
      illustrators,
      translators,
      bonus_items: edition !== 'regular' ? bonuses : [],
    },
  }
}

// ---------------------------------------------------------------------------
export async function collect({ offline = false, delay = 1000, types = ALL_TYPES, known = new Set(), full = false, max = Infinity } = {}) {
  const cache = loadCache()
  let toFetch = []
  if (!offline) {
    const ids = await productIds()
    const week = Math.floor(Date.now() / (7 * 86400000))
    toFetch = ids.filter((id) => full || !known.has(`luckpim:${id}`) || id % ROTATION === week % ROTATION)
    if (Number.isFinite(max)) toFetch = toFetch.slice(0, max)
    const fresh = toFetch.filter((id) => !known.has(`luckpim:${id}`)).length
    console.log(`  ${ids.length} products in the sitemap; reading ${toFetch.length} pages (${fresh} new, ${toFetch.length - fresh} refresh) at ${delay} ms per page`)
  } else {
    console.log(`  using ${Object.keys(cache).length} cached pages`)
  }

  let done = 0
  for (const id of toFetch) {
    const res = await get(`${SITE}/product/detail/${id}`)
    if (res) {
      const parsed = parsePage(await res.text())
      cache[id] = { fetched_at: new Date().toISOString(), ...parsed }
    }
    done++
    if (done % 25 === 0 || done === toFetch.length) {
      process.stdout.write(`\r  read ${done}/${toFetch.length} pages`)
      fs.mkdirSync(CACHE_DIR, { recursive: true })
      fs.writeFileSync(PAGES_FILE, JSON.stringify(cache))
    }
    await sleep(delay)
  }
  if (toFetch.length) process.stdout.write('\n')

  // Online: only what was read now. Offline: everything cached.
  const ids = offline ? Object.keys(cache).map(Number) : toFetch.filter((id) => cache[id])
  return build(ids.map((id) => [id, cache[id]]), new Set(types))
}

function build(pages, types) {
  const warnings = []
  const skipped = {}
  const items = []
  for (const [id, p] of pages) {
    const it = toItem(id, p)
    if (it.skip) {
      skipped[it.skip] = (skipped[it.skip] ?? 0) + 1
      continue
    }
    if (!types.has(it.format)) {
      skipped[`type ${it.format} not selected`] = (skipped[`type ${it.format} not selected`] ?? 0) + 1
      continue
    }
    items.push(it)
  }
  // Manga and novel editions of the same story are different series; label the novel one.
  const formatsByBase = new Map()
  for (const it of items) {
    const k = norm(it.base)
    formatsByBase.set(k, new Set([...(formatsByBase.get(k) ?? []), it.format]))
  }

  const series = new Map()
  for (const it of items) {
    const k = norm(it.base)
    const both = formatsByBase.get(k).size > 1
    const seriesFormat = it.format === 'merchandise' ? 'other' : it.format
    const ref = `luckpim:series:${shortHash(`${k}|${seriesFormat}`)}`
    let s = series.get(ref)
    if (!s) {
      const title = both && it.format === 'light_novel' && !/นิยาย/.test(it.base) ? `${it.base} (นิยาย)` : it.base
      s = { ref, title: title.slice(0, 300), original_title: null, series_type: seriesFormat, genres: new Set(), books: [], merchandise: [] }
      series.set(ref, s)
    }
    it.genres.forEach((g) => s.genres.add(g))
    if (it.format === 'merchandise') {
      const b = it.book
      s.merchandise.push({ ref: b.ref, title: b.title, merch_type: merchType(b.title), description: b.synopsis, image_url: b.cover_url, price: b.price, currency: 'THB', product_url: b.product_url })
    } else {
      if (it.book.volume_number === null && it.book.edition_type === 'regular' && it.format !== 'artbook') warnings.push(`no volume number: ${it.book.ref} ${it.book.title}`)
      s.books.push(it.book)
    }
  }
  const list = [...series.values()]
    .map((s) => ({
      ...s,
      genres: [...s.genres],
      books: s.books.sort((a, b) => (a.edition_type === 'regular' ? 0 : 1) - (b.edition_type === 'regular' ? 0 : 1) || (a.volume_number ?? 1e9) - (b.volume_number ?? 1e9)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'th'))
  return { series: list, warnings, skipped }
}
