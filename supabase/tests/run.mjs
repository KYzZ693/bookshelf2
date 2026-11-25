// Database test harness: runs supabase/migrations/*.sql + seed.sql on PGlite (real PostgreSQL
// compiled to WASM) with a minimal Supabase emulation, then exercises RLS, search and functions.
//   npm run test:db                                   strict grants
//   SUPABASE_DEFAULT_PRIVS=1 node supabase/tests/run.mjs   also emulate Supabase default privileges
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SUPABASE_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = path.join(ROOT, 'migrations');
const DEFAULT_PRIVS = process.env.SUPABASE_DEFAULT_PRIVS === '1';

const db = new PGlite({ extensions: { pg_trgm } });

let pass = 0, fail = 0;
const failures = [];
function check(name, ok, evidence) {
  if (ok) { pass++; console.log(`  PASS ${name}${evidence !== undefined ? ' :: ' + fmt(evidence) : ''}`); }
  else { fail++; failures.push(name); console.log(`  FAIL ${name}${evidence !== undefined ? ' :: ' + fmt(evidence) : ''}`); }
}
function fmt(v) { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > 400 ? s.slice(0, 400) + '...' : s; }

async function q(sql, params) { return (await db.query(sql, params)).rows; }
async function one(sql, params) { return (await q(sql, params))[0]; }
async function err(sql, params) {
  try { const r = await db.query(sql, params); return { ok: true, rows: r.rows, affected: r.affectedRows }; }
  catch (e) { return { ok: false, message: e.message, code: e.code }; }
}
async function errExec(sql) {
  try { await db.exec(sql); return { ok: true }; } catch (e) { return { ok: false, message: e.message }; }
}
async function asRole(role, uid) {
  await db.exec('reset role');
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${role}`);
}
async function reset() { await db.exec('reset role'); await q(`select set_config('request.jwt.claim.sub', '', false)`); }

// ---------------------------------------------------------------------------
// Supabase emulation
// ---------------------------------------------------------------------------
const bootstrap = `
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant anon, authenticated, service_role to current_user;
`;
const defaultPrivs = `
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

async function main() {
  console.log(`== Bootstrap (default privileges emulated: ${DEFAULT_PRIVS})`);
  await db.exec(bootstrap);
  if (DEFAULT_PRIVS) await db.exec(defaultPrivs);

  const files = fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
  for (const f of [...files.map(f => path.join(MIG, f)), path.join(ROOT, 'seed.sql')]) {
    const sql = fs.readFileSync(f, 'utf8');
    try { await db.exec(sql); console.log(`  ran ${path.basename(f)}`); }
    catch (e) { console.log(`  ERROR in ${path.basename(f)}: ${e.message}`); fail++; failures.push('migrate ' + path.basename(f)); throw e; }
  }
  const counts = await one(`select (select count(*) from public.series) s, (select count(*) from public.books) b,
    (select count(*) from public.merchandise) m, (select count(*) from public.genres) g, (select count(*) from public.publishers) p`);
  check('seed populated', counts.s == 8 && counts.b > 0 && counts.m > 0, counts);
  // re-run seed + reference data: must be idempotent
  const rerun = await errExec(fs.readFileSync(path.join(MIG, files.find(f => f.includes('reference_data'))), 'utf8') + fs.readFileSync(path.join(ROOT, 'seed.sql'), 'utf8'));
  check('reference data + seed re-runnable', rerun.ok, rerun.message);

  // -------------------------------------------------------------------------
  console.log('== 1. handle_new_user');
  const A = '11111111-1111-1111-1111-111111111111';
  const A2 = '22222222-2222-2222-2222-222222222222';
  const B = '33333333-3333-3333-3333-333333333333';
  const C = '44444444-4444-4444-4444-444444444444';
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'alice@x.com', '{"username":"alice"}')`, [A]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'alice2@x.com', '{"username":"alice"}')`, [A2]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'bob@x.com', '{"full_name":"Bob Smith","avatar_url":"https://x/y.png"}')`, [B]);
  await q(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'x@x.com', '{"name":"  ","picture":"javascript:alert(1)"}')`, [C]);
  const profs = await q(`select id, username, display_name, avatar_url from public.profiles order by username`);
  const pa = profs.find(p => p.id === A), pa2 = profs.find(p => p.id === A2), pb = profs.find(p => p.id === B), pc = profs.find(p => p.id === C);
  check('alice profile', pa?.username === 'alice', pa);
  check('second alice suffixed + unique', pa2 && pa2.username !== 'alice' && /^alice_[0-9a-f]{5}$/.test(pa2.username), pa2);
  check('bob from email + display/avatar', pb?.username === 'bob' && pb.display_name === 'Bob Smith' && pb.avatar_url === 'https://x/y.png', pb);
  check('short base -> reader*, blank name -> null, bad avatar dropped', pc?.username === 'readerx' && pc.display_name === null && pc.avatar_url === null, pc);

  // -------------------------------------------------------------------------
  console.log('== 2. RLS');
  await asRole('anon', null);
  let r = await err(`select count(*)::int n from public.series`); check('anon select series', r.ok && r.rows[0].n === 8, r.rows ?? r.message);
  r = await err(`select count(*)::int n from public.books`); check('anon select books', r.ok && r.rows[0].n > 0, r.rows ?? r.message);
  r = await err(`select count(*)::int n from public.series_overview`); check('anon select series_overview', r.ok && r.rows[0].n === 8, r.rows ?? r.message);
  r = await err(`select count(*)::int n from public.profiles`); check('anon select profiles', r.ok && r.rows[0].n === 4, r.rows ?? r.message);
  r = await err(`insert into public.series (title) values ('anon series')`); check('anon insert series rejected', !r.ok, r.message);
  r = await err(`select public.is_username_available('alice') a, public.is_username_available('free_name') b, public.is_username_available('x') c`);
  check('anon is_username_available', r.ok && r.rows[0].a === false && r.rows[0].b === true && r.rows[0].c === false, r.rows ?? r.message);

  await asRole('authenticated', A);
  r = await err(`insert into public.series (title) values ('nonadmin series')`); check('non-admin insert series rejected', !r.ok, r.message);
  r = await err(`update public.series set title = 'hacked'`); check('non-admin update series 0 rows', r.ok ? r.affected === 0 : true, r.ok ? { affected: r.affected } : r.message);
  r = await err(`delete from public.series`); check('non-admin delete series 0 rows', r.ok ? r.affected === 0 : true, r.ok ? { affected: r.affected } : r.message);
  r = await err(`insert into public.genres (name, slug) values ('X','x')`); check('non-admin insert genre rejected', !r.ok, r.message);
  r = await err(`update public.profiles set bio = 'pwned' where id = $1`, [B]); check('non-admin update other profile 0 rows', r.ok && r.affected === 0, r.ok ? { affected: r.affected } : r.message);
  r = await err(`update public.profiles set bio = '  my bio  ', display_name = '   ' where id = $1 returning bio, display_name`, [A]);
  check('owner updates own profile (normalized)', r.ok && r.rows[0]?.bio === 'my bio' && r.rows[0]?.display_name === null, r.rows ?? r.message);
  r = await err(`insert into public.user_roles values ($1, 'admin')`, [A]); check('user cannot self-grant admin', !r.ok, r.message);
  r = await err(`select public.is_admin() a`); check('is_admin false for non-admin', r.ok && r.rows[0].a === false, r.rows ?? r.message);
  await reset();
  await q(`insert into public.user_roles values ($1, 'admin')`, [A]);
  await asRole('authenticated', A);
  r = await err(`insert into public.series (title) values ('Admin Series') returning id`); check('admin can insert series', r.ok, r.message);
  const adminSeriesId = r.rows?.[0]?.id;
  r = await err(`update public.series set description = 'x' where id = $1`, [adminSeriesId]); check('admin can update series', r.ok && r.affected === 1, r.ok ? { affected: r.affected } : r.message);
  r = await err(`delete from public.series where id = $1`, [adminSeriesId]); check('admin can delete series', r.ok && r.affected === 1, r.ok ? { affected: r.affected } : r.message);
  r = await err(`select count(*)::int n from public.user_roles`); check('user_roles: owner sees own role', r.ok && r.rows[0].n === 1, r.rows ?? r.message);
  // collections isolation (B adds a row; A must not see it)
  await reset();
  const someBook = (await one(`select id from public.books order by title limit 1`)).id;
  await asRole('authenticated', B);
  r = await err(`select public.set_collection_status(p_book_id => $1, p_status => 'owned') s`, [someBook]); check('B adds book', r.ok, r.message);
  await asRole('authenticated', A);
  r = await err(`select count(*)::int n from public.user_collections`); check('A cannot see B collections', r.ok && r.rows[0].n === 0, r.rows ?? r.message);
  r = await err(`select count(*)::int n from public.my_collection`); check('A my_collection empty', r.ok && r.rows[0].n === 0, r.rows ?? r.message);
  r = await err(`insert into public.user_collections (user_id, book_id, status) values ($1, $2, 'want')`, [B, someBook]); check('A cannot insert into B collection', !r.ok, r.message);
  r = await err(`delete from public.user_collections where user_id = $1`, [B]); check('A cannot delete B collection rows', r.ok && r.affected === 0, r.ok ? { affected: r.affected } : r.message);
  await asRole('anon', null);
  r = await err(`select count(*)::int n from public.user_collections`); check('anon sees no collections', (r.ok && r.rows[0].n === 0) || !r.ok, r.rows ?? r.message);
  r = await err(`select count(*)::int n from public.user_roles`); check('anon cannot read user_roles', (r.ok && r.rows[0].n === 0) || !r.ok, r.rows ?? r.message);
  await reset();

  // -------------------------------------------------------------------------
  console.log('== 3. search_catalog');
  const romance = (await one(`select id from public.genres where slug = 'romance'`)).id;
  const summarize = rows => {
    const kinds = {};
    for (const x of rows) { (kinds[x.kind] ??= { total: Number(x.kind_total), top: [] }).top.length < 3 && kinds[x.kind].top.push(`${x.title} (${Number(x.score).toFixed(2)})`); }
    return kinds;
  };
  const searches = [
    ['lantern', `select * from public.search_catalog('lantern')`, rows => rows.some(x => x.kind === 'series' && /Lantern Keeper/.test(x.title)) && rows.some(x => x.kind === 'book') && rows.some(x => x.kind === 'merchandise')],
    ['typo lanturn keeper', `select * from public.search_catalog('lanturn keeper')`, rows => rows.some(x => x.kind === 'series' && /Lantern Keeper/.test(x.title))],
    ['author Mira', `select * from public.search_catalog('Mira')`, rows => rows.some(x => x.kind === 'author' && x.title === 'Mira Tsukishiro') && rows.some(x => x.kind === 'book') && rows.some(x => x.kind === 'series')],
    ['illustrator haru', `select * from public.search_catalog('haru')`, rows => rows.some(x => x.kind === 'illustrator')],
    ['translator ploy', `select * from public.search_catalog('ploy')`, rows => rows.some(x => x.kind === 'translator')],
    ['publisher phoenix', `select * from public.search_catalog('phoenix')`, rows => rows.some(x => x.kind === 'publisher' && x.title === 'Phoenix Next') && rows.some(x => x.kind === 'series')],
    ['empty + manga/romance/completed', `select * from public.search_catalog(p_query => '', p_item_types => array['manga'], p_genre_ids => array['${romance}']::uuid[], p_statuses => array['completed']::public.completion_status[])`, rows => rows.length === 0],
    ['empty + manga/romance', `select * from public.search_catalog(p_query => '', p_item_types => array['manga'], p_genre_ids => array['${romance}']::uuid[])`, rows => rows.length > 0 && rows.every(x => x.series_title === 'Paper Moons Over Kirishima')],
    ['empty + completed', `select * from public.search_catalog(p_statuses => array['completed']::public.completion_status[])`, rows => rows.length > 0 && rows.every(x => x.completion_status === 'completed')],
    ['special_edition', `select * from public.search_catalog(p_item_types => array['special_edition'])`, rows => rows.length > 0 && rows.every(x => x.kind === 'book' && x.edition_type !== 'regular')],
    ['merchandise', `select * from public.search_catalog(p_item_types => array['merchandise'])`, rows => rows.length > 0 && rows.every(x => x.kind === 'merchandise')],
    ['empty no filters', `select * from public.search_catalog()`, rows => rows.some(x => x.kind === 'series' && Number(x.kind_total) === 8)],
    ['wildcards %_\\', `select * from public.search_catalog('%_\\')`, rows => true],
    ['nonsense', `select * from public.search_catalog('zzzqqqxxx')`, rows => rows.length === 0],
  ];
  for (const role of ['anon', 'authenticated']) {
    await asRole(role, role === 'anon' ? null : B);
    for (const [name, sql, ok] of searches) {
      r = await err(sql);
      check(`[${role}] search ${name}`, r.ok && ok(r.rows) && r.rows.every(x => x.kind_total !== null), r.ok ? summarize(r.rows) : r.message);
    }
  }
  await asRole('authenticated', B);
  r = await err(`select * from public.search_catalog(p_collection => array['owned']::public.collection_status[])`);
  check('[B] search p_collection owned', r.ok && r.rows.some(x => x.kind === 'book' && x.my_status === 'owned'), r.ok ? r.rows.map(x => [x.kind, x.title, x.my_status]) : r.message);
  const mira = (await one(`select id from public.authors where name = 'Mira Tsukishiro'`)).id;
  r = await err(`select * from public.search_catalog(p_author_ids => array['${mira}']::uuid[])`);
  check('[B] search p_author_ids', r.ok && r.rows.length > 0 && !r.rows.some(x => x.kind === 'merchandise') && r.rows.every(x => /Lantern/.test(x.series_title)), r.ok ? summarize(r.rows) : r.message);
  await reset();

  // -------------------------------------------------------------------------
  console.log('== 4. get_genre_shelves');
  await asRole('anon', null);
  for (const g of ['author', 'publisher', 'translator', 'illustrator']) {
    r = await err(`select * from public.get_genre_shelves(24, '${g}')`);
    const genreCount = 16;
    const ok = r.ok && r.rows.length >= 1 && r.rows.every(x => Array.isArray(x.series)) &&
      r.rows.filter(x => x.series.length > 0).length > 0;
    const s0 = r.ok ? r.rows.find(x => x.series.length)?.series[0] : null;
    const fieldsOk = s0 && ['title', 'genre_names', 'regular_volume_count', 'author_names', 'group_key'].every(k => k in s0);
    check(`shelves by ${g}`, ok && fieldsOk, r.ok ? { rows: r.rows.length, genres: r.rows.map(x => `${x.genre_slug}:${x.genre_total}/${x.series.length}`).join(' '), sample: s0 && { title: s0.title, genre_names: s0.genre_names, regular_volume_count: s0.regular_volume_count, author_names: s0.author_names, group_key: s0.group_key } } : r.message);
  }
  r = await err(`select genre_slug, jsonb_array_length(series) n from public.get_genre_shelves(1, 'author')`);
  check('shelves per_genre limit=1', r.ok && r.rows.every(x => x.n <= 1), r.rows ?? r.message);
  await reset();

  // -------------------------------------------------------------------------
  console.log('== 5. collections');
  const [b1, b2] = (await q(`select id from public.books order by title limit 2`)).map(x => x.id);
  const m1 = (await one(`select id from public.merchandise order by title limit 1`)).id;
  await asRole('authenticated', A);
  r = await err(`select public.set_collection_status(p_book_id => $1, p_status => 'owned') s`, [b1]); check('set owned', r.ok && r.rows[0].s === 'owned', r.rows ?? r.message);
  r = await err(`select public.set_collection_status(p_book_id => $1, p_status => 'want') s`, [b1]); check('switch to want', r.ok && r.rows[0].s === 'want', r.rows ?? r.message);
  r = await err(`select count(*)::int n, max(status::text) st from public.user_collections where book_id = $1`, [b1]); check('still one row, want', r.ok && r.rows[0].n === 1 && r.rows[0].st === 'want', r.rows ?? r.message);
  r = await err(`select public.toggle_collection_status(p_book_id => $1, p_status => 'want') s`, [b1]); check('toggle want removes', r.ok && r.rows[0].s === null, r.rows ?? r.message);
  r = await err(`select count(*)::int n from public.user_collections where book_id = $1`, [b1]); check('row removed', r.ok && r.rows[0].n === 0, r.rows ?? r.message);
  r = await err(`select public.toggle_collection_status(p_book_id => $1) s`, [b1]); check('toggle default adds owned', r.ok && r.rows[0].s === 'owned', r.rows ?? r.message);
  r = await err(`select public.toggle_collection_status(p_book_id => $1, p_status => 'want') s`, [b1]); check('toggle other switches', r.ok && r.rows[0].s === 'want', r.rows ?? r.message);
  r = await err(`select public.set_collection_status(p_book_id => $1, p_status => 'owned') s`, [b2]); check('set owned b2', r.ok, r.message);
  r = await err(`select public.set_collection_status(p_merchandise_id => $1, p_status => 'owned') s`, [m1]); check('merch owned', r.ok && r.rows[0].s === 'owned', r.rows ?? r.message);
  r = await err(`select public.toggle_collection_status(p_merchandise_id => $1, p_status => 'want') s`, [m1]); check('merch toggle to want', r.ok && r.rows[0].s === 'want', r.rows ?? r.message);
  r = await err(`select public.set_collection_status(p_merchandise_id => $1, p_status => null) s`, [m1]); check('merch remove via null', r.ok && r.rows[0].s === null, r.rows ?? r.message);
  r = await err(`select public.set_collection_status(p_merchandise_id => $1, p_status => 'owned') s`, [m1]); check('merch re-add', r.ok, r.message);
  r = await err(`select public.get_collection_stats() s`); check('stats', r.ok && r.rows[0].s.owned_count === 2 && r.rows[0].s.want_count === 1, r.rows?.[0]?.s ?? r.message);
  r = await err(`select * from public.my_collection order by created_at`);
  check('my_collection only own rows', r.ok && r.rows.length === 3 && r.rows.every(x => x.user_id === A), r.ok ? r.rows.map(x => ({ kind: x.item_kind, cat: x.category, title: x.title, st: x.status, price: x.price, pub: x.publisher_name })) : r.message);
  r = await err(`select public.set_collection_status(p_book_id => $1, p_merchandise_id => $2, p_status => 'owned')`, [b1, m1]); check('both ids raises', !r.ok, r.message);
  r = await err(`select public.set_collection_status(p_status => 'owned')`); check('neither id raises', !r.ok, r.message);
  r = await err(`select public.toggle_collection_status(p_status => 'owned')`); check('toggle neither id raises', !r.ok, r.message);
  await asRole('anon', null);
  r = await err(`select public.set_collection_status(p_book_id => $1, p_status => 'owned')`, [b1]); check('anon set_collection_status raises', !r.ok, r.message);
  r = await err(`select public.get_collection_stats() s`); check('anon get_collection_stats: error or zeros', !r.ok || r.rows[0].s.owned_count === 0, r.rows?.[0]?.s ?? r.message);
  r = await err(`select count(*) from public.my_collection`); check('anon my_collection: error or empty', !r.ok || Number(r.rows[0].count) === 0, r.rows ?? r.message);
  await asRole('authenticated', A);
  r = await err(`select * from public.search_catalog('bladesong')`);
  check('search my_status reflects collection', r.ok && r.rows.some(x => x.my_status), r.ok ? r.rows.filter(x => x.my_status).map(x => [x.kind, x.title, x.my_status]) : r.message);
  await reset();

  // -------------------------------------------------------------------------
  console.log('== 6. admin functions');
  const fantasy = (await one(`select id from public.genres where slug = 'fantasy'`)).id;
  const phoenix = (await one(`select id from public.publishers where name = 'Phoenix Next'`)).id;
  await asRole('authenticated', A); // admin
  const p1 = await err(`select public.admin_ensure_person('author', '  New   Person ') id`);
  const p2 = await err(`select public.admin_ensure_person('author', 'new person') id`);
  check('ensure_person same id twice', p1.ok && p2.ok && p1.rows[0].id === p2.rows[0].id, [p1.rows ?? p1.message, p2.rows ?? p2.message]);
  r = await err(`select name from public.authors where id = $1`, [p1.rows?.[0]?.id]); check('ensure_person normalized name', r.ok && r.rows[0]?.name === 'New Person', r.rows ?? r.message);
  const ill = (await err(`select public.admin_ensure_person('illustrator', 'Ill One') id`)).rows?.[0]?.id;
  const tr1 = (await err(`select public.admin_ensure_person('translator', 'Tr One') id`)).rows?.[0]?.id;
  const tr2 = (await err(`select public.admin_ensure_person('translator', 'Tr Two') id`)).rows?.[0]?.id;
  check('ensure_person illustrator/translator', !!ill && !!tr1 && !!tr2, { ill, tr1, tr2 });
  r = await err(`select public.admin_ensure_person('editor', 'X')`); check('ensure_person bad role raises', !r.ok, r.message);
  r = await err(`select public.admin_ensure_person('author', '   ')`); check('ensure_person blank raises', !r.ok, r.message);

  r = await err(`select public.admin_save_series($1::jsonb, $2::uuid[]) id`, [JSON.stringify({ title: '  Admin Saga ', original_title: '', description: '', cover_url: '', publisher_id: phoenix, series_type: 'manga', completion_status: '' }), [fantasy, romance]]);
  check('admin_save_series insert', r.ok, r.rows ?? r.message);
  const sid = r.rows?.[0]?.id;
  r = await err(`select title, original_title, cover_url, series_type::text, completion_status::text, (select array_agg(g.slug order by g.slug) from public.series_genres sg join public.genres g on g.id = sg.genre_id where sg.series_id = s.id) genres from public.series s where id = $1`, [sid]);
  check('inserted series normalized + genres', r.ok && r.rows[0].title === 'Admin Saga' && r.rows[0].original_title === null && r.rows[0].cover_url === null && r.rows[0].completion_status === 'ongoing' && r.rows[0].genres.join() === 'fantasy,romance', r.rows ?? r.message);
  r = await err(`select public.admin_save_series($1::jsonb, $2::uuid[]) id`, [JSON.stringify({ id: sid, title: 'Admin Saga 2', cover_url: 'https://img.example.com/c.jpg', series_type: 'manga', completion_status: 'completed' }), [romance]]);
  check('admin_save_series update', r.ok && r.rows[0].id === sid, r.rows ?? r.message);
  r = await err(`select title, cover_url, completion_status::text, publisher_id, (select array_agg(g.slug) from public.series_genres sg join public.genres g on g.id = sg.genre_id where sg.series_id = s.id) genres from public.series s where id = $1`, [sid]);
  check('updated series + genres replaced', r.ok && r.rows[0].title === 'Admin Saga 2' && r.rows[0].completion_status === 'completed' && r.rows[0].genres.join() === 'romance', r.rows ?? r.message);
  r = await err(`select public.admin_save_series($1::jsonb) id`, [JSON.stringify({ id: '99999999-9999-9999-9999-999999999999', title: 'x' })]);
  check('admin_save_series unknown id raises', !r.ok, r.message);
  r = await err(`select public.admin_save_series($1::jsonb) id`, [JSON.stringify({ title: 'Bad', cover_url: 'ftp://nope' })]);
  check('admin_save_series bad url raises', !r.ok, r.message);

  const bookJson = { series_id: sid, title: 'Admin Saga Vol. 1', volume_number: '1', item_type: 'manga', edition_type: '', price: '120.50', currency: 'thb', publication_date: '2024-05-01', isbn: '978-616-000-000-1', page_count: '', synopsis: '  ', cover_url: '' };
  r = await err(`select public.admin_save_book($1::jsonb, $2::uuid[], $3::uuid[], $4::uuid[]) id`, [JSON.stringify(bookJson), [p1.rows[0].id], [ill], [tr1, tr2]]);
  check('admin_save_book insert', r.ok, r.rows ?? r.message);
  const bid = r.rows?.[0]?.id;
  r = await err(`select b.title, b.currency, b.synopsis, b.cover_url, b.price::text, b.edition_type::text,
     (select array_agg(t.name order by bt.position) from public.book_translators bt join public.translators t on t.id = bt.translator_id where bt.book_id = b.id) trs,
     (select count(*)::int from public.book_authors where book_id = b.id) na,
     (select count(*)::int from public.book_illustrators where book_id = b.id) ni
     from public.books b where b.id = $1`, [bid]);
  check('inserted book normalized + people', r.ok && r.rows[0].currency === 'THB' && r.rows[0].synopsis === null && r.rows[0].cover_url === null && r.rows[0].edition_type === 'regular' && r.rows[0].trs.join() === 'Tr One,Tr Two' && r.rows[0].na === 1 && r.rows[0].ni === 1, r.rows ?? r.message);
  r = await err(`select public.admin_save_book($1::jsonb, $2::uuid[], $3::uuid[], $4::uuid[]) id`, [JSON.stringify({ ...bookJson, id: bid, title: 'Admin Saga Vol. 1 (rev)', edition_type: 'special' }), [p1.rows[0].id], [], [tr2, tr1]]);
  check('admin_save_book update', r.ok && r.rows[0].id === bid, r.rows ?? r.message);
  r = await err(`select b.title, b.edition_type::text,
     (select array_agg(t.name order by bt.position) from public.book_translators bt join public.translators t on t.id = bt.translator_id where bt.book_id = b.id) trs,
     (select count(*)::int from public.book_illustrators where book_id = b.id) ni
     from public.books b where b.id = $1`, [bid]);
  check('updated book people replaced/reordered', r.ok && r.rows[0].title === 'Admin Saga Vol. 1 (rev)' && r.rows[0].edition_type === 'special' && r.rows[0].trs.join() === 'Tr Two,Tr One' && r.rows[0].ni === 0, r.rows ?? r.message);
  r = await err(`select public.admin_save_book($1::jsonb) id`, [JSON.stringify({ ...bookJson, price: '-1' })]);
  check('admin_save_book negative price raises', !r.ok, r.message);
  r = await err(`select * from public.series_overview where id = $1`, [sid]);
  check('series_overview for admin series', r.ok && r.rows[0].special_volume_count === 1 && r.rows[0].author_names.join() === 'New Person', r.rows?.[0] && { special: r.rows[0].special_volume_count, regular: r.rows[0].regular_volume_count, authors: r.rows[0].author_names, translators: r.rows[0].translator_names, genres: r.rows[0].genre_names });

  await asRole('authenticated', B); // non-admin
  r = await err(`select public.admin_ensure_person('author', 'Sneaky')`); check('non-admin ensure_person raises', !r.ok, r.message);
  r = await err(`select public.admin_save_series('{"title":"Sneaky"}'::jsonb)`); check('non-admin save_series raises', !r.ok, r.message);
  r = await err(`select public.admin_save_book($1::jsonb)`, [JSON.stringify(bookJson)]); check('non-admin save_book raises', !r.ok, r.message);
  await asRole('anon', null);
  r = await err(`select public.admin_save_series('{"title":"Sneaky"}'::jsonb)`); check('anon save_series raises', !r.ok, r.message);
  await reset();

  // -------------------------------------------------------------------------
  console.log('== 7. constraints / normalization (as superuser)');
  const s0 = (await one(`select id from public.series limit 1`)).id;
  r = await err(`insert into public.series (title, cover_url) values ('Bad', 'not a url')`); check('bad series.cover_url rejected', !r.ok, r.message);
  r = await err(`insert into public.series (title, cover_url) values ('Bad', 'javascript:alert(1)')`); check('javascript: url rejected', !r.ok, r.message);
  r = await err(`insert into public.books (series_id, title, price) values ($1, 'Bad', -5)`, [s0]); check('negative book price rejected', !r.ok, r.message);
  r = await err(`insert into public.merchandise (series_id, title, price) values ($1, 'Bad', -5)`, [s0]); check('negative merch price rejected', !r.ok, r.message);
  r = await err(`update public.profiles set username = 'bad name!' where id = $1`, [A]); check('invalid username rejected', !r.ok, r.message);
  r = await err(`update public.profiles set username = 'ab' where id = $1`, [A]); check('too-short username rejected', !r.ok, r.message);
  r = await err(`update public.profiles set username = 'ALICE_' || 'x' where id = $1`, [B]); check('valid username accepted', r.ok, r.message);
  r = await err(`update public.profiles set username = 'Alice' where id = $1`, [B]); check('case-insensitive username uniqueness', !r.ok, r.message);
  r = await err(`update public.profiles set accent_color = 'neon' where id = $1`, [A]); check('bad accent_color rejected', !r.ok, r.message);
  r = await err(`insert into public.series (title, original_title, description, cover_url) values ('  Blanky  ', '  ', '', '   ') returning title, original_title, description, cover_url`);
  check('blank strings -> NULL, title trimmed', r.ok && r.rows[0].title === 'Blanky' && r.rows[0].original_title === null && r.rows[0].description === null && r.rows[0].cover_url === null, r.rows ?? r.message);
  r = await err(`insert into public.series (title) values ('   ')`); check('blank title rejected', !r.ok, r.message);
  r = await err(`insert into public.books (series_id, title, isbn, currency, edition_notes) values ($1, 'B', '  ', ' usd ', '') returning isbn, currency, edition_notes`, [s0]);
  check('book blank isbn->NULL, currency upper', r.ok && r.rows[0].isbn === null && r.rows[0].currency === 'USD' && r.rows[0].edition_notes === null, r.rows ?? r.message);
  r = await err(`insert into public.books (series_id, title, isbn) values ($1, 'B', 'abc')`, [s0]); check('bad isbn rejected', !r.ok, r.message);
  r = await err(`insert into public.authors (name) values ('  Spaced    Out  ') returning name`); check('author name whitespace collapsed', r.ok && r.rows[0].name === 'Spaced Out', r.rows ?? r.message);
  r = await err(`insert into public.authors (name) values ('spaced out')`); check('author case-insensitive unique', !r.ok, r.message);
  r = await err(`insert into public.genres (name, slug) values ('Bad Slug', 'Bad Slug')`); check('bad genre slug rejected', !r.ok, r.message);
  r = await err(`insert into public.publishers (name, logo_url) values ('NewPub', '') returning logo_url`); check('publisher blank logo -> NULL', r.ok && r.rows[0].logo_url === null, r.rows ?? r.message);
  r = await err(`insert into public.user_collections (user_id, book_id, merchandise_id, status) values ($1, $2, $3, 'owned')`, [A, b1, m1]); check('collection exactly-one-item check', !r.ok, r.message);
  r = await err(`update public.series set title = title where id = $1 returning updated_at > created_at as bumped`, [s0]); check('updated_at trigger', r.ok && r.rows[0].bumped === true, r.rows ?? r.message);
  r = await err(`delete from auth.users where id = $1`, [C]); check('deleting auth user cascades', r.ok && Number((await one(`select count(*) from public.profiles where id = $1`, [C])).count) === 0, r.message);

  r = await err(`select genre_slug, genre_total, series->0->>'title' t from public.get_genre_shelves(24, 'author') where genre_id is null`);
  check('series without books stay off the shelves (no Uncategorized row yet)', r.ok && r.rows.length === 0, r.rows ?? r.message);
  {
    const gs = await one(`insert into public.series (title) values ('Genre-less With Book') returning id`);
    await q(`insert into public.books (series_id, title, volume_number) values ($1, 'GL vol 1', 1)`, [gs.id]);
    r = await err(`select genre_total, series->0->>'title' t from public.get_genre_shelves(24, 'author') where genre_id is null`);
    check('genre-less series with a book shows in Uncategorized', r.ok && r.rows.length === 1 && Number(r.rows[0].genre_total) === 1 && r.rows[0].t === 'Genre-less With Book', r.rows ?? r.message);
  }
  r = await err(`select count(*)::int n from public.get_genre_shelves() where genre_slug = 'historical'`);
  check('genres with no series produce no shelf row (by design: inner join)', r.ok && r.rows[0].n === 0, r.rows ?? r.message);

  // -------------------------------------------------------------------------
  console.log('== 8. storage policies (emulated storage.objects)');
  r = await err(`select id, public from storage.buckets order by id`); check('buckets created (covers, avatars, models)', r.ok && r.rows.length === 3, r.rows ?? r.message);
  await asRole('authenticated', B);
  r = await err(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${B}/me.png`]); check('user uploads own avatar folder', r.ok, r.message);
  r = await err(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${A}/me.png`]); check('user cannot upload to other folder', !r.ok, r.message);
  r = await err(`insert into storage.objects (bucket_id, name) values ('covers', 'x.png')`); check('non-admin cannot upload cover', !r.ok, r.message);
  await asRole('authenticated', A);
  r = await err(`insert into storage.objects (bucket_id, name) values ('covers', 'x.png')`); check('admin uploads cover', r.ok, r.message);
  r = await err(`delete from storage.objects where bucket_id = 'avatars'`); check('A cannot delete B avatar', r.ok && r.affected === 0, r.ok ? { affected: r.affected } : r.message);
  await asRole('anon', null);
  r = await err(`select count(*)::int n from storage.objects`); check('anon reads public objects', r.ok && r.rows[0].n === 2, r.rows ?? r.message);
  await reset();

  // -------------------------------------------------------------------------
  console.log('== 9. publisher import + automatic series covers');
  const payload = (over = {}) => JSON.stringify({
    publisher: 'Phoenix Next',
    series: [{
      ref: 'phoenixnext:series:test-hachinan', title: 'ผมเนี่ยนะ...ชายแปด!', original_title: 'Hachinan tte, Sore wa Nai deshou!',
      series_type: 'light_novel', genres: ['Fantasy', 'Isekai', 'Harem'],
      books: [
        { ref: 'phoenixnext:LN0048-01', title: 'ผมเนี่ยนะ...ชายแปด! เล่ม 2', volume_number: 2, item_type: 'light_novel', edition_type: 'regular',
          cover_url: 'https://img.example/v2.jpg', synopsis: 'เรื่องย่อเล่ม 2', price: 270.75, currency: 'THB', isbn: '9786164640054', product_url: 'https://www.phoenixnext.com/ln0048-01.html',
          page_count: 346, authors: over.authors ?? ['Y.A', 'Hiroyuki Takamura'], illustrators: ['fuzichoco'], translators: [] },
        { ref: 'phoenixnext:LN0049-01P', title: 'ผมเนี่ยนะ...ชายแปด! เล่ม 1 [แถมฟรี! Postcard]', volume_number: 1, item_type: 'light_novel', edition_type: 'special',
          edition_notes: 'แถมฟรี! Postcard', cover_url: 'https://img.example/v1-special.jpg', price: 280 },
        ...(over.books ?? []),
      ],
      merchandise: [{ ref: 'phoenixnext:MER1-01', title: 'Hachinan Acrylic Stand', merch_type: 'acrylic_stand', image_url: 'https://img.example/m.jpg', price: 390 }],
    }],
  });
  await asRole('authenticated', A);
  r = await err(`select public.import_catalog($1::jsonb)`, [payload()]); check('admin (authenticated) cannot call import_catalog', !r.ok, r.message);
  await asRole('anon', null);
  r = await err(`select public.import_catalog($1::jsonb)`, [payload()]); check('anon cannot call import_catalog', !r.ok, r.message);
  await asRole('service_role', null);
  r = await err(`select public.import_catalog($1::jsonb) s`, [payload()]);
  check('service_role imports a batch', r.ok && r.rows[0].s.series_created === 1 && r.rows[0].s.books_created === 2 && r.rows[0].s.merchandise_created === 1, r.rows?.[0]?.s ?? r.message);
  await reset();
  const imp = await one(`select id, cover_url, publisher_id, original_title from public.series where source_ref = 'phoenixnext:series:test-hachinan'`);
  check('only special edition has cover -> series uses it', imp.cover_url === 'https://img.example/v2.jpg', imp.cover_url);
  r = await err(`select g.name from public.series_genres sg join public.genres g on g.id = sg.genre_id where sg.series_id = $1 order by g.name`, [imp.id]);
  check('genres matched by name, missing ones created', r.ok && r.rows.map(x => x.name).join(',') === 'Fantasy,Harem,Isekai', r.rows ?? r.message);
  check('publisher matched by name', (await one(`select name from public.publishers where id = $1`, [imp.publisher_id])).name === 'Phoenix Next');
  r = await err(`select string_agg(a.name, ',' order by ba.position) names, (select page_count from public.books where source_ref = 'phoenixnext:LN0048-01') pages,
                        (select count(*)::int from public.book_illustrators bi join public.books b on b.id = bi.book_id where b.source_ref = 'phoenixnext:LN0048-01') ills
                   from public.book_authors ba join public.authors a on a.id = ba.author_id join public.books b on b.id = ba.book_id
                  where b.source_ref = 'phoenixnext:LN0048-01'`);
  check('credits + page count imported in order', r.ok && r.rows[0].names === 'Y.A,Hiroyuki Takamura' && r.rows[0].pages === 346 && r.rows[0].ills === 1, r.rows ?? r.message);

  // Volume 1 regular arrives later -> becomes the series cover.
  await asRole('service_role', null);
  r = await err(`select public.import_catalog($1::jsonb) s`, [payload({ authors: ['Someone Else'], books: [
    { ref: 'phoenixnext:LN0047-01', title: 'ผมเนี่ยนะ...ชายแปด! เล่ม 1', volume_number: 1, item_type: 'light_novel', edition_type: 'regular', cover_url: 'https://img.example/v1.jpg', price: 265 },
  ] })]);
  check('re-import is idempotent (updates, one new book)', r.ok && r.rows[0].s.series_updated === 1 && r.rows[0].s.books_created === 1 && r.rows[0].s.books_updated === 2, r.rows?.[0]?.s ?? r.message);
  await reset();
  check('series cover switches to volume 1', (await one(`select cover_url from public.series where id = $1`, [imp.id])).cover_url === 'https://img.example/v1.jpg');
  check('each book keeps its own cover', (await one(`select cover_url from public.books where source_ref = 'phoenixnext:LN0048-01'`)).cover_url === 'https://img.example/v2.jpg');
  check('existing credits are not replaced on re-import', Number((await one(`select count(*) from public.authors where name = 'Someone Else'`)).count) === 0);

  // Admin fixes a title; a normal re-import keeps it, --overwrite replaces it.
  await asRole('authenticated', A);
  await q(`update public.books set title = 'Hachinan Vol. 2 (fixed)' where source_ref = 'phoenixnext:LN0048-01'`);
  await asRole('service_role', null);
  await q(`select public.import_catalog($1::jsonb)`, [payload()]);
  check('re-import keeps admin title edits', (await one(`select title from public.books where source_ref = 'phoenixnext:LN0048-01'`)).title === 'Hachinan Vol. 2 (fixed)');
  await q(`select public.import_catalog($1::jsonb, true)`, [payload()]);
  check('overwrite mode replaces titles', (await one(`select title from public.books where source_ref = 'phoenixnext:LN0048-01'`)).title === 'ผมเนี่ยนะ...ชายแปด! เล่ม 2');
  await reset();

  // Changing / deleting volume 1 moves the automatic cover; a custom cover is never touched.
  await q(`update public.books set cover_url = 'https://img.example/v1-new.jpg' where source_ref = 'phoenixnext:LN0047-01'`);
  check('new volume-1 cover propagates', (await one(`select cover_url from public.series where id = $1`, [imp.id])).cover_url === 'https://img.example/v1-new.jpg');
  await q(`delete from public.books where source_ref = 'phoenixnext:LN0047-01'`);
  check('deleting volume 1 falls back to next volume', (await one(`select cover_url from public.series where id = $1`, [imp.id])).cover_url === 'https://img.example/v2.jpg');
  await q(`update public.series set cover_url = 'https://cdn.example/custom.jpg' where id = $1`, [imp.id]);
  await q(`update public.books set cover_url = 'https://img.example/v2b.jpg' where source_ref = 'phoenixnext:LN0048-01'`);
  check('custom series cover is kept', (await one(`select cover_url from public.series where id = $1`, [imp.id])).cover_url === 'https://cdn.example/custom.jpg');
  r = await err(`select count(*)::int n from public.series_overview where id = $1 and cover_url is not null`, [imp.id]);
  check('series_overview exposes the cover', r.ok && r.rows[0].n === 1, r.rows ?? r.message);
  r = await err(`select public.import_catalog('{"series": "nope"}'::jsonb)`); check('import rejects malformed payload', !r.ok, r.message);

  // Optional: import a real importer preview end-to-end
  //   IMPORT_PREVIEW=scripts/.cache/phoenixnext-preview.json npm run test:db
  if (process.env.IMPORT_PREVIEW) {
    const preview = JSON.parse(fs.readFileSync(path.resolve(process.env.IMPORT_PREVIEW), 'utf8'));
    await asRole('service_role', null);
    const totals = {}; let firstError = null;
    for (let i = 0; i < preview.series.length; i += 40) {
      const res = await err(`select public.import_catalog($1::jsonb) s`, [JSON.stringify({ publisher: 'Phoenix Next', series: preview.series.slice(i, i + 40) })]);
      if (!res.ok) { firstError = `batch ${i / 40 + 1}: ${res.message}`; break; }
      for (const [k, v] of Object.entries(res.rows[0].s)) totals[k] = (totals[k] ?? 0) + v;
    }
    check('full preview imports without errors', !firstError, firstError ?? totals);
    const again = await err(`select public.import_catalog($1::jsonb) s`, [JSON.stringify({ publisher: 'Phoenix Next', series: preview.series.slice(0, 40) })]);
    check('re-importing the preview creates nothing new', again.ok && again.rows[0].s.series_created === 0 && again.rows[0].s.books_created === 0, again.rows?.[0]?.s ?? again.message);
    await reset();
    r = await err(`select count(*) filter (where s.cover_url is not null)::int with_cover, count(*)::int total,
                          count(*) filter (where s.cover_url = (select b.cover_url from public.books b where b.series_id = s.id and b.edition_type = 'regular' and b.volume_number = 1 limit 1))::int vol1
                     from public.series s where s.source_ref like 'phoenixnext:%'`);
    check('imported series get covers (vol. 1 where it exists)', r.ok && r.rows[0].with_cover > 0, r.rows ?? r.message);
    r = await err(`select count(*)::int n from public.get_genre_shelves(24, 'author')`); check('shelves build over the imported catalog', r.ok && r.rows[0].n > 5, r.rows ?? r.message);
    r = await err(`select kind, title from public.search_catalog('wind breaker') limit 3`); check('search finds imported series', r.ok && r.rows.length > 0, r.rows ?? r.message);
  }

  // -------------------------------------------------------------------------
  console.log('== 10. special editions linked to volumes, merchandise preview');
  await reset();
  {
    const sid = (await one(`insert into public.series (title) values ('Link Test') returning id`)).id;
    const sp1 = (await one(`insert into public.books (series_id, title, volume_number, edition_type, bonus_items)
                             values ($1, 'LT Special Set 1', 1, 'special', array['  Acrylic stand ', '', 'Postcard']) returning id, regular_book_id, bonus_items`, [sid]));
    check('special without a regular volume waits (null link), bonus items cleaned', sp1.regular_book_id === null && sp1.bonus_items.join('|') === 'Acrylic stand|Postcard', sp1);
    const v1 = (await one(`insert into public.books (series_id, title, volume_number) values ($1, 'LT 1', 1) returning id`, [sid])).id;
    check('regular volume adopts its waiting special edition', (await one(`select regular_book_id from public.books where id = $1`, [sp1.id])).regular_book_id === v1);
    const sp2 = await one(`insert into public.books (series_id, title, volume_number, edition_type) values ($1, 'LT Box 1', 1, 'boxset') returning regular_book_id`, [sid]);
    check('new special edition links to existing volume', sp2.regular_book_id === v1);
    r = await err(`update public.books set regular_book_id = id where id = $1`, [v1]);
    check('regular volume cannot have a parent', r.ok && (await one(`select regular_book_id from public.books where id = $1`, [v1])).regular_book_id === null, r.message);
    const other = (await one(`insert into public.series (title) values ('Other') returning id`)).id;
    const ov = (await one(`insert into public.books (series_id, title, volume_number) values ($1, 'O 1', 1) returning id`, [other])).id;
    r = await err(`update public.books set regular_book_id = $1 where id = $2`, [ov, sp1.id]); check('cannot link to another series volume', !r.ok, r.message);
    await q(`delete from public.books where id = $1`, [v1]);
    check('deleting the volume keeps the special edition (link cleared)', (await one(`select regular_book_id from public.books where id = $1`, [sp1.id])).regular_book_id === null);
    await asRole('anon', null);
    r = await err(`select count(*)::int n from public.books where regular_book_id is not null or cardinality(bonus_items) > 0`); check('anon can read the new columns', r.ok, r.message);
    r = await err(`select public.import_book_extras('[]'::jsonb)`); check('anon cannot call import_book_extras', !r.ok, r.message);
    await reset();
    await q(`update public.books set source_ref = 'test:sp1' where id = $1`, [sp1.id]);
    await asRole('service_role', null);
    r = await err(`select public.import_book_extras('[{"ref":"test:sp1","bonus_items":["Booklet","Shikishi"]}]'::jsonb) n`);
    check('service_role sets bonus items by ref', r.ok && r.rows[0].n === 1, r.rows ?? r.message);
    await reset();
    check('bonus items stored', (await one(`select bonus_items from public.books where id = $1`, [sp1.id])).bonus_items.join('|') === 'Booklet|Shikishi');
    await asRole('service_role', null);
    r = await err(`select public.import_book_extras('[{"ref":"test:sp1","publication_date":"2026-11-25"}]'::jsonb) n`);
    check('extras fill an empty release date (bonus items untouched)', r.ok && r.rows[0].n === 1, r.rows ?? r.message);
    await q(`select public.import_book_extras('[{"ref":"test:sp1","publication_date":"2020-01-01"}]'::jsonb)`);
    await reset();
    const ex = await one(`select publication_date::text d, bonus_items from public.books where id = $1`, [sp1.id]);
    check('existing release date is kept', ex.d === '2026-11-25' && ex.bonus_items.join('|') === 'Booklet|Shikishi', ex);

    // merchandise preview metadata
    const ms = (await one(`insert into public.merchandise (series_id, title, merch_type, product_url) values ($1, 'LT Can Badge', 'character_goods', 'https://shop.example/badge') returning id, reconstruction_status, preview_available, reference_urls`, [sid]));
    check('merch preview defaults (not started, no preview)', ms.reconstruction_status === 'not_started' && ms.preview_available === false, ms);
    r = await err(`update public.merchandise set preview_available = true where id = $1`, [ms.id]); check('preview_available needs a model or params', !r.ok, r.message);
    r = await err(`update public.merchandise set preview_available = true, model_format = 'procedural', model_params = '{"method":"badge"}', reconstruction_status = 'completed', reference_urls = array['https://a.example/x.jpg', 'not a url', ''] where id = $1 returning reference_urls`, [ms.id]);
    check('procedural preview saved, bad reference urls dropped', r.ok && r.rows[0].reference_urls.length === 1, r.rows ?? r.message);
    r = await err(`update public.merchandise set reconstruction_status = 'done' where id = $1`, [ms.id]); check('invalid reconstruction status rejected', !r.ok, r.message);
    r = await err(`update public.merchandise set model_url = 'ftp://x' where id = $1`, [ms.id]); check('non-http model url rejected', !r.ok, r.message);
    await asRole('authenticated', B);
    r = await err(`update public.merchandise set reconstruction_notes = 'hack' where id = $1`, [ms.id]); check('non-admin cannot edit preview metadata', r.ok && r.affected === 0, r.ok ? { affected: r.affected } : r.message);
    r = await err(`insert into storage.objects (bucket_id, name) values ('models', 'x.glb')`); check('non-admin cannot upload models', !r.ok, r.message);
    await asRole('authenticated', A);
    r = await err(`insert into storage.objects (bucket_id, name) values ('models', 'x.glb')`); check('admin uploads models', r.ok, r.message);
    await reset();
    r = await err(`insert into public.merchandise (series_id, title) values ($1, 'Nendoroid Test Figure'), ($1, 'Test Shikishi Set'), ($1, 'Random Can Badge') returning merch_type`, [sid]);
    check('enum has the new merchandise types', (await err(`select 'art_print'::public.merch_type, 'character_goods'::public.merch_type, 'collectible'::public.merch_type`)).ok);
  }

  console.log(`\n== ${pass} passed, ${fail} failed`);
  if (fail) console.log('Failures:\n  ' + failures.join('\n  '));
  process.exitCode = fail ? 1 : 0;
}

main().catch(e => { console.error('FATAL', e.message, e.position ? `(position ${e.position})` : ''); process.exitCode = 2; });
