// Phoenix Next adapter (https://www.phoenixnext.com).
// Phoenix Next runs Magento, which exposes a public GraphQL API: about 45 requests return all
// ~4,500 products with series, ISBN, price, cover image and the back-cover synopsis.
import fs from 'node:fs'
import path from 'node:path'
import { ALL_TYPES, CACHE_DIR, ROOT, decode, fail, htmlToText, merchType, norm, shortHash, sleep, splitNames, squash } from './core.mjs'

export const key = 'phoenixnext'
export const publisher = 'Phoenix Next'

const PRODUCTS_FILE = path.join(CACHE_DIR, 'phoenixnext-products.json')
const SITE = 'https://www.phoenixnext.com'
const GRAPHQL = `${SITE}/graphql`
const REF = 'phoenixnext'
const PAGE_SIZE = 100
let DELAY = 1500
let TYPES = new Set(ALL_TYPES)
// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
const PRODUCT_QUERY = `
query Products($page: Int!, $size: Int!) {
  products(search: "", pageSize: $size, currentPage: $page, sort: { name: ASC }) {
    total_count
    page_info { total_pages }
    items {
      __typename sku name url_key
      categories { name url_path }
      description { html }
      image { url }
      price_range { minimum_price { final_price { value currency } } }
      custom_attributesV2(filters: { is_visible_on_front: true }) {
        items { code ... on AttributeValue { value } }
      }
    }
  }
}`


async function gql(variables, attempt = 1) {
  try {
    const res = await fetch(GRAPHQL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'BookShelf-catalog-import/1.0' },
      body: JSON.stringify({ query: PRODUCT_QUERY, variables }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
    return json.data.products
  } catch (e) {
    if (attempt >= 4) throw e
    const wait = 2000 * 2 ** attempt
    console.warn(`  page ${variables.page} failed (${e.message}); retrying in ${wait / 1000}s`)
    await sleep(wait)
    return gql(variables, attempt + 1)
  }
}

async function downloadProducts() {
  const items = []
  let total = 1
  for (let page = 1; page <= total; page++) {
    const data = await gql({ page, size: PAGE_SIZE })
    total = data.page_info.total_pages
    items.push(...data.items)
    process.stdout.write(`\r  downloaded page ${page}/${total} (${items.length}/${data.total_count} products)`)
    if (page < total) await sleep(DELAY)
  }
  process.stdout.write('\n')
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ fetched_at: new Date().toISOString(), items }))
  return items
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

// Lines that belong to the shop, not the book.
const NOTICE = /pre-?order|พรีออเดอร์|‼️|จัดส่ง|ชำระเงิน|เจ้าหน้าที่|promotion|สั่งซื้อล่วงหน้า|^ราคา(เซ็ต|ชุด)?/i
// Everything from the first of these lines onwards is links / terms, not synopsis.
const TAIL = /https?:\/\/|www\.|bit\.ly|รับชมสินค้า|รายละเอียดเพิ่มเติม|ดูรายละเอียด|ติดตามข่าวสาร|ขอสงวนสิทธิ์|^หมายเหตุ/i
// Decorative lines (no letters or digits at all) and category headers like "หนังสือ - การ์ตูน มังงะ".
const FILLER = /^[^A-Za-z0-9ก-๛]*$|^หนังสือ\s*[-–]?\s*(นิยาย|การ์ตูน)/
const MARKER = /^[\s.…]*(เรื่องย่อ|เรื่อง\s*[:：])[\s.…:：]*$/
const CREDIT = /^(ชื่อเร่?ื่อง(?:ภาษาไทย)?|ชื่อหนังสือ|เรื่องและภาพ|เรื่องต้นฉบับ|เรื่อง|ผู้แต่ง|ผู้เขียน|ภาพประกอบ|ภาพ|ออกแบบตัวละคร|ออกแบบจักรกล|คาแร็กเตอร์ต้นแบบ|ลำดับเรื่อง|แปล|ผู้แปล|เรียบเรียง|จำนวนหน้า)\s*[:：]\s*(.+)$/


/**
 * Phoenix Next descriptions look like:
 *   [pre-order notice ...]
 *   รายละเอียดไลท์โนเวล “<Thai title>” (<Original title> Vol.7)
 *   [set contents ...]
 *   ...เรื่องย่อ...
 *   <back-cover synopsis>
 *   [links to the series page]
 * Some (mostly novels) list credits instead: "เรื่อง : ...", "ภาพ : ...", "แปล : ...".
 */
function parseDescription(html) {
  const text = htmlToText(html)
  const empty = { synopsis: null, originalTitle: null, credits: { authors: [], illustrators: [], translators: [] }, pages: null }
  if (!text) return empty
  let lines = text.split('\n')

  // Original title: "(Shuu ni Ichido Classmate wo Kau Hanashi Vol.7)" near the top.
  let originalTitle = null
  for (const l of lines.slice(0, 25)) {
    const m = l.match(/\(([^()]*[A-Za-z]{3}[^()]*)\)\s*(\*\*.*)?$/)
    if (m && (/^รายละเอียด/.test(l) || /^\(/.test(l))) {
      originalTitle = m[1].replace(/\s*(vol(ume)?\.?|เล่ม)\s*[\d.]+.*$/i, '').replace(/[\s:~\-–]+$/, '').trim() || null
      if (originalTitle) break
    }
  }

  // Credits
  const credits = { authors: [], illustrators: [], translators: [] }
  let pages = null
  let originalAuthors = []
  lines = lines.filter((l) => {
    const m = l.match(CREDIT)
    if (!m) return true
    const [, key, value] = m
    if (key === 'จำนวนหน้า') pages = Number(value.match(/\d+/)?.[0]) || null
    else if (key === 'เรื่องและภาพ') { credits.authors.push(...splitNames(value)); credits.illustrators.push(...splitNames(value)) }
    else if (key === 'เรื่องต้นฉบับ') originalAuthors = splitNames(value)
    else if (/^(เรื่อง|ผู้แต่ง|ผู้เขียน)$/.test(key)) credits.authors.push(...splitNames(value))
    else if (/^(ภาพ|ภาพประกอบ)$/.test(key)) credits.illustrators.push(...splitNames(value))
    else if (/^(แปล|ผู้แปล|เรียบเรียง)$/.test(key)) credits.translators.push(...splitNames(value))
    return false
  })
  if (!credits.authors.length) credits.authors = originalAuthors
  for (const k of Object.keys(credits)) credits[k] = [...new Set(credits[k])].slice(0, 6)

  // Synopsis: after the "...เรื่องย่อ..." marker when there is one.
  const markerAt = lines.findIndex((l) => MARKER.test(l))
  let body = markerAt >= 0 ? lines.slice(markerAt + 1) : lines.filter((l) => !/^รายละเอียด\S*\s*[“"]/.test(l))
  const tailAt = body.findIndex((l, i) => i > 0 && TAIL.test(l))
  if (tailAt >= 0) body = body.slice(0, tailAt)
  body = body.filter((l) => !FILLER.test(l) && !NOTICE.test(l) && !TAIL.test(l) && !/^\([^()]*\)$/.test(l))

  const synopsis = body.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  // Set contents ("1) ไลท์โนเวล ... 2) Acrylic Standee ...") listed before the synopsis.
  const before = markerAt >= 0 ? lines.slice(0, markerAt) : lines
  const bonusItems = [...new Set(before.map((l) => l.match(/^\s*\d{1,2}\s*[).]\s*(.{2,300})$/)?.[1]?.trim()).filter(Boolean))].slice(0, 30)
  return { synopsis: synopsis ? synopsis.slice(0, 20000) : null, originalTitle, credits, pages: pages && pages <= 20000 ? pages : null, bonusItems }
}

const PREFIX_TYPE = {
  LN: 'light_novel',
  'มังงะ': 'manga',
  N: 'novel',
  AB: 'artbook',
  Japanese: 'artbook',
  MD: 'merchandise',
}

/** "(Pre-Sale)(MD) Foo" -> { prefix: "MD", rest: "Foo", preSale: true } */
function splitPrefix(name) {
  let rest = squash(decode(name))
  const tags = []
  let m
  while ((m = rest.match(/^\(([^)]{1,30})\)\s*/))) {
    tags.push(m[1].trim())
    rest = rest.slice(m[0].length)
  }
  const prefix = tags.find((t) => PREFIX_TYPE[t]) ?? null
  return { prefix, rest: rest.trim(), tags }
}

const GENRE_MAP = {
  romantic: 'Romance',
  'slice of life': 'Slice of Life',
  'sci-fi': 'Science Fiction',
  'otome / shojo': 'Shojo',
  'online game': 'Game',
  yaoi: "Boys' Love",
  yuri: 'Yuri',
}
const GENRE_PARENTS = new Set(['light-novel', 'manga'])

function genresOf(product) {
  const out = new Set()
  for (const c of product.categories ?? []) {
    const parts = c.url_path.split('/')
    if (parts.length === 2 && GENRE_PARENTS.has(parts[0])) {
      const name = squash(decode(c.name))
      out.add(GENRE_MAP[name.toLowerCase()] ?? name)
    }
    if (parts.length === 1 && parts[0] === 'gl') out.add('Yuri')
    if (parts.length === 1 && parts[0] === 'bl') out.add("Boys' Love")
  }
  return [...out]
}

/** Series category: "book-series/<slug>" first, then a Yuri/BL series page, then artbook/merch franchise. */
function seriesCategory(product) {
  const cats = product.categories ?? []
  const pick = (parent) =>
    cats.find((c) => {
      const parts = c.url_path.split('/')
      return parts.length === 2 && parts[0] === parent
    })
  for (const parent of ['book-series', 'gl', 'bl', 'artbook', 'catemerchandise']) {
    const c = pick(parent)
    if (c) return { slug: c.url_path.split('/')[1], title: squash(decode(c.name)), parent }
  }
  return null
}


/** Strip the volume part: "Foo เล่ม 3 ตอน ..." -> "Foo" */
function baseTitle(title) {
  return title
    .replace(/\s*\((ฉบับปรับปรุงใหม่|[^)]*ver\.?)\)\s*/gi, ' ')
    .replace(/^complete set\s+/i, '')
    .replace(/\s+(เล่ม|vol\.?|volume)\s*\d.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseVolume(title) {
  if (/เล่มเดียวจบ/.test(title)) return { volume: 1, range: null }
  const range = title.match(/(?:เล่ม|vol\.?|volume)\s*(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)/i)
  if (range) return { volume: null, range: `${range[1]}-${range[2]}` }
  const m = title.match(/(?:เล่ม|vol\.?|volume)\s*(\d+(?:\.\d+)?)/i)
  return { volume: m ? Number(m[1]) : null, range: null }
}

function editionOf(sku, title, bonus) {
  const notes = []
  if (bonus) notes.push(bonus)
  if (/ฉบับปรับปรุงใหม่/.test(title)) notes.push('ฉบับปรับปรุงใหม่')
  if (/^BX/i.test(sku) || /complete set|box ?set|boxset/i.test(title)) return { edition: 'boxset', notes }
  if (/limited/i.test(title)) return { edition: 'limited', notes }
  if (/exclusive/i.test(title)) return { edition: 'exclusive', notes }
  if (bonus || /(special|short story|ultimate|premium|postcard) (set|edition)|ฉบับพิเศษ|premium|collector/i.test(title)) return { edition: 'special', notes }
  // A revised printing ("ฉบับปรับปรุงใหม่") is still the regular volume; the note tells them apart.
  return { edition: 'regular', notes }
}


const MERCH_WORDS =
  /\b(trading|random|acrylic|can badge|badge|button|clear (file|folder)|a4|a5|t-shirt|tee|sticker|post ?card|key ?chain|key ?holder|strap|charm|figure|nendoroid|q posket|luminasta|tapestry|poster|bromide|card|magnet|pillow|plate|coaster|diorama|stand|bag|case|ticket|clip|panel|shikishi|petanko|chibi|insta|mini|multi|led|cool|shaped|large|set of)\b/i
const FRANCHISE_NOISE = /^(tv anime(tion)?|aforce x dragon horse|hello! ?good ?smile|bushiroad the box:?|ribose|(\(pre-sale\)\s*)+)\s*/i

/** Best-effort franchise name for merchandise, e.g. 'TV Anime "The Apothecary Diaries" PM Figure' -> 'The Apothecary Diaries'. */
function franchiseOf(title) {
  const quoted = title.match(/["“【]([^"”】]{3,80})["”】]/)
  if (quoted) return squash(quoted[1])
  let t = title.replace(FRANCHISE_NOISE, '')
  const cut = t.search(MERCH_WORDS)
  if (cut > 2) t = t.slice(0, cut)
  t = t.split(/\s+[-–]\s+/)[0]
  return squash(t.replace(/[\s:~\-–(]+$/, '')) || title
}

function coverOf(product) {
  const url = product.image?.url
  return url && !/placeholder/i.test(url) ? url : null
}
function priceOf(product) {
  const p = product.price_range?.minimum_price?.final_price
  return p && typeof p.value === 'number' ? { price: Math.round(p.value * 100) / 100, currency: p.currency || 'THB' } : { price: null, currency: 'THB' }
}
function isbnOf(product) {
  const v = product.custom_attributesV2?.items?.find((a) => a.code === 'barcode')?.value
  return v && /^97[89]\d{10}$/.test(v) ? v : null
}

// ---------------------------------------------------------------------------
// Build series payload
// ---------------------------------------------------------------------------
function buildCatalog(products) {
  const warnings = []
  const skipped = {}
  const skip = (why) => (skipped[why] = (skipped[why] ?? 0) + 1)

  // Pass 1: parse every product.
  const parsed = []
  const seen = new Set()
  for (const p of products) {
    // Paging by name can return the same product twice when the catalog changes mid-download.
    if (seen.has(p.sku)) continue
    seen.add(p.sku)
    const { prefix, rest, tags } = splitPrefix(p.name ?? '')
    const kind = prefix ? PREFIX_TYPE[prefix] : null
    if (!kind) { skip(tags.length ? `prefix (${tags.join(')(')})` : 'no prefix (tests, bags, codes)'); continue }
    if (!TYPES.has(kind)) { skip(`type ${kind} not selected`); continue }

    const bonusMatch = rest.match(/\s*\[(แถมฟรี[^\]]*)\]\s*/)
    const title = squash(rest.replace(/\s*\[(แถมฟรี[^\]]*)\]\s*/g, ' '))
    if (!title) { skip('empty title'); continue }
    parsed.push({ p, kind, title, bonus: bonusMatch ? squash(bonusMatch[1]) : null, cat: seriesCategory(p), base: baseTitle(title) })
  }

  // Base title -> series category, learned from products that do have one.
  const byBase = new Map()
  const byCatTitle = new Map()
  for (const x of parsed) {
    if (x.cat && (x.cat.parent === 'book-series' || x.cat.parent === 'gl' || x.cat.parent === 'bl')) {
      if (!byBase.has(norm(x.base))) byBase.set(norm(x.base), x.cat)
      if (!byCatTitle.has(norm(x.cat.title))) byCatTitle.set(norm(x.cat.title), x.cat)
    }
  }

  const series = new Map()
  const getSeries = (ref, title, type) => {
    let s = series.get(ref)
    if (!s) {
      s = { ref, title: title.slice(0, 300), original_title: null, series_type: type, genres: new Set(), books: [], merchandise: [] }
      series.set(ref, s)
    }
    return s
  }

  const pendingMerch = []
  const place = (x, ref, seriesTitle) => {
    const { p, kind, title } = x
    const seriesType = kind === 'merchandise' ? 'other' : kind
    const s = getSeries(ref, seriesTitle, seriesType)
    // A series that has real books takes the book format over "other"/"artbook".
    if (kind !== 'merchandise' && (s.series_type === 'other' || (s.series_type === 'artbook' && kind !== 'artbook'))) s.series_type = kind
    for (const g of genresOf(p)) s.genres.add(g)

    const { synopsis, originalTitle, credits, pages, bonusItems } = parseDescription(p.description?.html)
    if (originalTitle && !s.original_title && kind !== 'merchandise') s.original_title = originalTitle.slice(0, 300)
    const { price, currency } = priceOf(p)
    const productUrl = p.url_key ? `${SITE}/${p.url_key}.html` : null

    if (kind === 'merchandise') {
      s.merchandise.push({
        ref: `${REF}:${p.sku}`, title: title.slice(0, 300), merch_type: merchType(title),
        description: synopsis?.slice(0, 10000) ?? null, image_url: coverOf(p), price, currency, product_url: productUrl,
      })
      return
    }

    const { volume, range } = parseVolume(title)
    const { edition, notes } = editionOf(p.sku, title, x.bonus)
    if (range) notes.unshift(`เล่ม ${range}`)
    if (volume === null && !range && kind !== 'artbook' && edition === 'regular') warnings.push(`no volume number: ${p.sku} ${title}`)
    s.books.push({
      ...credits,
      page_count: pages,
      ref: `${REF}:${p.sku}`,
      title: title.slice(0, 300),
      volume_number: volume,
      item_type: kind,
      edition_type: edition,
      edition_notes: notes.length ? notes.join(' · ').slice(0, 1000) : null,
      cover_url: coverOf(p),
      synopsis,
      price,
      currency,
      isbn: isbnOf(p),
      bonus_items: edition !== 'regular' ? bonusItems : [],
      product_url: productUrl,
    })
  }

  for (const x of parsed) {
    let cat = x.cat
    // Artbooks/merch filed under a franchise that also has a book series -> join that series.
    if (cat && (cat.parent === 'artbook' || cat.parent === 'catemerchandise')) cat = byCatTitle.get(norm(cat.title)) ?? cat
    if (!cat || cat.parent === 'artbook' || cat.parent === 'catemerchandise') cat = byBase.get(norm(x.base)) ?? cat

    if (cat) place(x, `${REF}:series:${cat.slug}`, cat.title)
    else if (x.kind === 'merchandise') pendingMerch.push(x)
    else place(x, `${REF}:title:${shortHash(norm(x.base || x.title))}`, x.base || x.title)
  }

  // Merchandise without a category: find the series whose (original) title appears in the
  // product name, e.g. "WIND BREAKER Acrylic Stand ..." -> series "Wind Breaker".
  const candidates = []
  for (const s of series.values()) {
    for (const t of [s.title, s.original_title]) if (t && norm(t).length >= 4) candidates.push([norm(t), s])
  }
  candidates.sort((a, b) => b[0].length - a[0].length)
  for (const x of pendingMerch) {
    const n = norm(x.title)
    const hit = candidates.find(([t]) => n.includes(t))
    if (hit) { place(x, hit[1].ref, hit[1].title); continue }
    const franchise = franchiseOf(x.title)
    place(x, `${REF}:title:${shortHash(norm(franchise))}`, franchise)
    warnings.push(`merchandise grouped by name as "${franchise}": ${x.p.sku} ${x.title}`)
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

/** Download (or reuse the cached download) and turn products into series payloads. */
export async function collect({ offline = false, delay = 1500, types = ALL_TYPES } = {}) {
  DELAY = delay
  TYPES = new Set(types)
  let products
  if (offline) {
    if (!fs.existsSync(PRODUCTS_FILE)) fail(`No cached download at ${path.relative(ROOT, PRODUCTS_FILE)}. Run once without --offline.`)
    const cached = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'))
    products = cached.items
    console.log(`  using cached download from ${cached.fetched_at} (${products.length} products)`)
  } else {
    console.log(`  downloading from ${GRAPHQL} (${DELAY} ms between pages)`)
    products = await downloadProducts()
  }
  return buildCatalog(products)
}
