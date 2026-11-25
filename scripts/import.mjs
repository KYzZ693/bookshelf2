#!/usr/bin/env node
// Imports publisher catalogs into Book Shelf.
//
//   node scripts/import.mjs --publisher=phoenixnext --dry-run   fetch + parse, write a preview, change nothing
//   node scripts/import.mjs --publisher=luckpim                  fetch + import into Supabase
//   node scripts/import.mjs                                      every publisher (same as --publisher=all)
//
// Options:
//   --publisher=a,b    phoenixnext, luckpim or all (default: all)
//   --dry-run          Do not touch the database. Writes scripts/.cache/<publisher>-preview.json
//   --offline          Reuse the last download / cached pages (no requests to the publisher)
//   --overwrite        Also overwrite titles, volume numbers, editions and series details that
//                      already exist (by default those are kept, so admin corrections survive)
//   --types=a,b        light_novel, manga, novel, artbook, merchandise (default: all)
//   --limit=N          Import only the first N series
//   --delay=MS         Pause between requests (default: 1500 Phoenix Next pages, 1000 Luckpim pages)
//   --full             Luckpim: re-read every product page, not only new + this week's rotation
//   --max-pages=N      Luckpim: read at most N pages this run (handy for a first test)
//
// Database writes need the server-side secret key in .env.local (git-ignored):
//   SUPABASE_SECRET_KEY=sb_secret_...
// Never prefix it with VITE_ — Vite would publish it inside the website bundle.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ALL_TYPES, CACHE_DIR, ROOT, createDb, existingRefs, fail, loadEnv, parseArgs, summarize, importSeries } from './import/core.mjs'
import * as phoenixnext from './import/phoenixnext.mjs'
import * as luckpim from './import/luckpim.mjs'

const ADAPTERS = { phoenixnext, luckpim }

const args = parseArgs(process.argv.slice(2))
if (args.help || args.h) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 23).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(0)
}
const DRY_RUN = !!args['dry-run']
const OFFLINE = !!args.offline
const OVERWRITE = !!args.overwrite
const LIMIT = args.limit ? Math.max(1, Number(args.limit) || 0) : Infinity
const TYPES = typeof args.types === 'string' ? args.types.split(',').map((s) => s.trim()) : ALL_TYPES
for (const t of TYPES) if (!ALL_TYPES.includes(t)) fail(`Unknown type "${t}". Use: ${ALL_TYPES.join(', ')}`)
const wanted = !args.publisher || args.publisher === true || args.publisher === 'all' ? Object.keys(ADAPTERS) : String(args.publisher).split(',')
for (const p of wanted) if (!ADAPTERS[p]) fail(`Unknown publisher "${p}". Use: ${Object.keys(ADAPTERS).join(', ')} or all`)

async function main() {
  const env = loadEnv()
  const db = createDb(env, { write: !DRY_RUN })

  for (const name of wanted) {
    const adapter = ADAPTERS[name]
    console.log(`\nBook Shelf · ${adapter.publisher} import${DRY_RUN ? ' (dry run)' : ''}`)
    const known = await existingRefs(db, adapter.key)
    const { series: all, warnings, skipped } = await adapter.collect({
      offline: OFFLINE,
      types: TYPES,
      known,
      full: !!args.full,
      max: args['max-pages'] ? Number(args['max-pages']) : Infinity,
      ...(args.delay ? { delay: Math.max(0, Number(args.delay) || 0) } : {}),
    })
    const series = all.slice(0, LIMIT)
    const summary = summarize(series, warnings, skipped)
    console.log('  parsed:', summary)
    const preview = path.join(CACHE_DIR, `${adapter.key}-preview.json`)
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(preview, JSON.stringify({ summary, warnings, series }, null, 2))
    console.log(`  preview written to ${path.relative(ROOT, preview)}`)

    if (DRY_RUN) {
      console.log('  dry run: nothing was written to the database.')
      continue
    }
    if (!series.length) {
      console.log('  nothing new to import.')
      continue
    }
    const result = await importSeries(db, adapter.publisher, series, { overwrite: OVERWRITE })
    console.log('  result:', result)
  }
  console.log('\nDone. Series covers follow each series\' first regular volume automatically.\n')
}

main().catch((e) => fail(e.stack || e.message))
