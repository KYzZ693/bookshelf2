# Book Shelf

**English** · [ภาษาไทย](README.th.md)

A personal digital library for **light novels, manga, novels, artbooks, special editions and merchandise**.
Browse Netflix-style genre shelves, search the whole catalog (typos welcome), and track what you **own** and what you **want**.

Rebuilt from the original [Book Shelf](https://kyzz693.github.io/Bookshelf/). It keeps the original look: warm paper
background, forest-green accent, and the DM Serif Display wordmark.

| Layer | Tech |
| --- | --- |
| UI | React 19 + TypeScript, Tailwind CSS 4, Framer Motion, Lucide icons |
| Routing / data | React Router 7, TanStack Query 5 |
| Backend | Supabase: Postgres, Auth (email + Google), Storage, RLS |
| Build | Vite 8 (static SPA, deployable to GitHub Pages / Netlify / Vercel / Cloudflare Pages) |

---

## 1. Quick start

```bash
npm install
cp .env.example .env        # then fill in your Supabase URL + publishable key
npm run dev                 # http://localhost:5173
```

If the env vars are missing, the app shows a "Connect your Supabase project" screen instead of failing.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build into `dist/` (also writes `dist/404.html` for SPA routing) |
| `npm run typecheck` | TypeScript only |
| `npm run test:db` | Runs all migrations + seed on PGlite (real PostgreSQL in WASM) and checks RLS, search, collections, admin functions, the importer and constraints (177 checks) |
| `npm run reconstruct:merch` | Builds simulated 3D previews for merchandise (see [3D merchandise previews](#3d-merchandise-previews)) |
| `npm run import` | Imports every publisher (`import:phoenixnext`, `import:luckpim` for one). See [Importing publisher catalogs](#importing-publisher-catalogs) |

### Environment variables

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` (Dashboard → Project Settings → API) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The **publishable** key (`sb_publishable_…`). Client-safe. |
| `VITE_BASE_PATH` | `/` normally. Use `/<repo>/` for `https://<user>.github.io/<repo>/`. |

> **Never** put the `service_role` / secret key in any `VITE_` variable. Vite inlines `VITE_` variables into the public
> bundle. The app only ever needs the publishable key, and Row Level Security protects all data.

---

## 2. Database setup

All structure lives in `supabase/migrations/`. Apply the files in filename order:

| File | Contents |
| --- | --- |
| `…0100_catalog_schema.sql` | `pg_trgm`, enums, publishers, authors, illustrators, translators, genres, series, books, people junctions, merchandise, indexes (B-tree, trigram GIN, full-text GIN), normalisation + `updated_at` triggers |
| `…0200_profiles_roles_collections.sql` | `profiles` (auto-created on sign-up), `user_roles`, `is_admin()`, `is_username_available()`, `user_collections` |
| `…0300_rls_policies.sql` | RLS on every table, plus grants |
| `…0400_views_and_functions.sql` | `series_overview`, `my_collection`, `search_catalog()`, `get_genre_shelves()`, `set_collection_status()`, `toggle_collection_status()`, `get_collection_stats()`, `admin_save_series()`, `admin_save_book()`, `admin_ensure_person()` |
| `…0500_storage.sql` | `covers` and `avatars` buckets with their policies |
| `…0600_reference_data.sql` | Initial publishers (Phoenix Next, Luckpim, Animag, …) and genres |
| `20261125000100_merch_types.sql`, `…000200_special_editions_and_merch_preview.sql`, `…000300_import_extras_dates.sql` | New merchandise types; release dates and bonus items from importers; `regular_book_id` / `bonus_items` on books; 3D preview fields on merchandise; `models` bucket; merchandise-only series kept off the shelves |
| `…0700_import_and_series_covers.sql` | `source_ref` import keys, automatic series covers (first regular volume), `import_catalog()` (service_role only) |
| `supabase/seed.sql` | *Optional* demo catalog: 8 **fictional** series with volumes, special editions and merchandise |

**Option A: Supabase CLI (recommended)**

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --remote
```

To load the demo data as well, run `supabase/seed.sql` in the SQL editor. `supabase db reset` runs it automatically on a local stack.

**Option B: SQL editor.** Paste and run each migration file in order, then optionally run `seed.sql`.

To remove the demo data later:

```sql
delete from public.series where description like '[demo]%';
```

### Make yourself an administrator

Admin rights are stored in `public.user_roles`. Users can never write to that table, so nobody can grant themselves admin.
Sign up in the app first, then run this in the SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'you@example.com';
```

Reload the app and the **Admin** tab appears. The database enforces this on its own: every catalog
`insert/update/delete` policy checks `is_admin()`, so hiding the tab in React is not what protects the catalog.

---

### Importing publisher catalogs

`scripts/import.mjs` runs one **adapter** per publisher (`scripts/import/<publisher>.mjs`). All adapters share `scripts/import/core.mjs`, which handles the database connection, batching, previews and bonus items / release dates. Every adapter produces the same series → volumes / special editions / merchandise payload for `import_catalog()`.

| Publisher | Source | Speed |
| --- | --- | --- |
| Phoenix Next | Public Magento GraphQL API | ~45 requests for the whole catalog |
| Luckpim | Product sitemap + product pages (no public API) | 1 page per second. The first run reads ~2,500 pages (≈45 min); weekly runs read only new products plus a rotating 1/12 of the known ones |

To add a publisher, create `scripts/import/<name>.mjs` exporting `key`, `publisher` and `collect(options)`, register it in `scripts/import.mjs`, then dry-run it and review `scripts/.cache/<name>-preview.json`.

#### Phoenix Next

The Phoenix Next adapter reads Phoenix Next's public GraphQL API (the shop runs Magento). It does not scrape HTML: about 45 requests return the whole catalog, roughly 4,500 products.

For each product it collects:

- the series, volume number and edition (regular, special set, box set, "แถมฟรี! Postcard" bonus editions);
- the cover image, price, ISBN and a link to the product page;
- the **back-cover synopsis** (with shop notices and links removed);
- genres, and author / illustrator / translator / page count when the description lists them.

1. Apply the migrations (`npx supabase db push --remote`). Migration `0700` adds the import function.
2. Create a **secret key**: Dashboard → Project Settings → API Keys → Secret keys. Put it in `.env.local`, which git ignores:
   ```
   SUPABASE_SECRET_KEY=sb_secret_...
   ```
   Never prefix it with `VITE_`. The script refuses to run if it finds a secret key in a `VITE_` variable.
3. Preview first. This downloads the catalog and writes `scripts/.cache/phoenixnext-preview.json` without touching the database:
   ```bash
   npm run import:phoenixnext -- --dry-run
   ```
4. Import:
   ```bash
   npm run import:phoenixnext -- --offline
   ```
   `--offline` reuses the download from step 3, so Phoenix Next is not asked again. Other options:
   - `--limit=20`: try a few series first.
   - `--types=light_novel,manga`: import only those kinds.
   - `--overwrite`: also replace titles and volume numbers.

Re-running is safe. Rows are matched by SKU, so nothing is duplicated. New volumes are added, and price, cover and synopsis are refreshed. Titles, editions, genres and credits that an admin corrected are kept unless you pass `--overwrite`.

**Covers:** each book shows its own volume's cover. A series automatically shows the cover of its first regular volume (volume 1, or the lowest volume available). A database trigger keeps this up to date. If an admin uploads a custom cover for the series, that cover is kept.

> Covers are linked from Phoenix Next's image server, not copied. Titles, prices and ISBNs are facts. Cover art and synopses
> belong to the publisher, so keep the site personal or ask Phoenix Next for permission before publishing it widely. Run the import
> occasionally (e.g. weekly), not continuously.

**Weekly refresh.** `.github/workflows/weekly-import.yml` runs the import every Monday at 03:00 Thailand time, then builds 3D previews for new merchandise. Add the `SUPABASE_SECRET_KEY` repository **secret**; the `VITE_SUPABASE_URL` variable is shared with the deploy workflow. To run it now, go to Actions → *Weekly catalog import* → **Run workflow**. Each run keeps its review files as a downloadable artifact for 14 days. GitHub pauses scheduled workflows in repositories with no activity for 60 days; re-enable it in the Actions tab if that happens.

### Merchandise, artbooks and special editions

- **Merchandise** has its own gallery at `/merchandise` (main navigation). Products are shown as framed photos, and you can filter them by type (Figure, Acrylic Stand, Keychain, Poster, Wall Scroll, Art Print, Character Goods, Collectible, …) and by series. Series pages link to their merchandise instead of listing it.
- **Artbooks** stay publications (`books.item_type = 'artbook'`). They are shown in a gallery frame. Clicking one opens its normal detail page (Information and Description tabs), without the opening-book animation that regular volumes use.
- **Special editions** are linked to their regular volume through `books.regular_book_id`. A trigger sets the link automatically by series and volume number. The series page lists regular volumes only. Each volume page has a prominent "Also available as a special edition" panel, and each special edition page links back to its volume and lists the bonus items (`books.bonus_items`).

### 3D merchandise previews

Opening a merchandise item shows an interactive 3D viewer when a preview exists. You can rotate, zoom, reset the view and go full screen. three.js is loaded only on that page. When there is no preview, the page shows the photo gallery (with zoom) and explains why.

Previews come from one of two sources:

1. **A model file:** an official or properly licensed GLB / glTF. Upload it in **Admin → Merchandise → 3D preview** (stored in the `models` bucket).
2. **A simulated reconstruction** made by `npm run reconstruct:merch`. The script reads each product photo, decides whether the item can be rebuilt from it, and saves the parameters on the row (`model_params`, `reconstruction_status`, `reconstruction_notes`, `reference_urls`). The browser then builds the model:
   - **acrylic stands and keychains:** the artwork is cut out of the photo and placed on a clear acrylic plate with the traced outline, plus a base or a metal ring;
   - **can badges:** a domed print with a metal back and pin;
   - **posters, postcards, shikishi, bromides, clear files and cards:** a printed sheet or board;
   - **wall scrolls:** fabric with rods.

   These are approximations. Thickness, size and hardware are typical values, not measurements, and the page labels them as simulated.

Figures, plush, apparel, bags and items whose only photo is a promotional image are **not** rebuilt. They show the photo gallery until a GLB is uploaded.

```bash
npm run reconstruct:merch -- --dry-run   # analyse only; writes scripts/.cache/merch-reconstruction-review.json
npm run reconstruct:merch                # save results (needs SUPABASE_SECRET_KEY in .env.local)
```

The script processes only items without a result. Use `--force` to redo everything, or `--only=<id>` for a single item. It never replaces an uploaded model file.

## 3. Authentication

### Email + password

This works out of the box. In **Authentication → Providers → Email** you can choose whether to require email confirmation.
The sign-up form handles both cases: it signs you in straight away, or it shows "check your inbox".

### URL configuration (required for OAuth, email links and password reset)

Go to **Authentication → URL Configuration**:

- **Site URL**: your production URL, e.g. `https://<user>.github.io/<repo>/`
- **Redirect URLs**: add every origin you use:
  ```
  http://localhost:5173/**
  https://<user>.github.io/<repo>/**
  ```

The app redirects to `<base>/auth/callback` (OAuth and email confirmation) and `<base>/reset-password` (password reset).
It uses the **PKCE** flow, so the callbacks arrive as `?code=…` and work with path-based routing on static hosts.

### Google OAuth

1. In the [Google Cloud Console](https://console.cloud.google.com/), go to **APIs & Services**:
   - Configure the **OAuth consent screen** (External; scopes `email`, `profile`, `openid`).
   - Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   - Under **Authorized JavaScript origins**, add `http://localhost:5173` and your production origin.
   - Under **Authorized redirect URIs**, add `https://<project-ref>.supabase.co/auth/v1/callback`.
2. In Supabase, go to **Authentication → Providers → Google**. Enable it and paste the **Client ID** and **Client Secret**.
3. Make sure the redirect URLs from the previous section are saved.

On a user's first Google sign-in, the `on_auth_user_created` trigger creates their profile. It takes the username from
their Google name or email, adds a unique suffix if that name is taken, and copies their Google display name and avatar.

### Sessions

- The Supabase client persists the session in localStorage and refreshes tokens automatically, so users stay signed in.
- If a token can no longer be refreshed (or the API answers `JWT expired`), the app signs out locally and shows
  "Your session has expired".

---

## 4. Storage

Migration `0500` creates both buckets, so there is nothing to click. To check them, open **Storage** in the dashboard:

| Bucket | Public read | Who can write | Limit |
| --- | --- | --- | --- |
| `covers` | yes | admins only (`is_admin()`) | 5 MB, jpeg/png/webp/avif/gif |
| `avatars` | yes | each user, only inside `avatars/<their user id>/` | 2 MB, jpeg/png/webp |

Images are resized in the browser before upload (covers ≤ 900 px wide, avatars 320 px, WebP), so Storage stays small and
pages load fast.

---

## 5. Deployment

The build output is a static SPA. `npm run build` copies `index.html` to `404.html`, and `public/_redirects` handles Netlify,
so deep links like `/series/123` work on any host.

### GitHub Pages

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.

1. Go to **Settings → Pages → Source** and choose **GitHub Actions**.
2. Go to **Settings → Secrets and variables → Actions → Variables** and add `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. The workflow sets `VITE_BASE_PATH=/<repo>/` automatically.
4. Add `https://<user>.github.io/<repo>/**` to the Supabase redirect URLs, and set the Site URL.

### Netlify / Vercel / Cloudflare Pages

- Build command: `npm run build`
- Output directory: `dist`
- Set the environment variables, with `VITE_BASE_PATH=/`.
- Vercel needs a `vercel.json` rewrite: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`.

---

## 6. How it works

### Data model

```
publishers ─┐
            ├─< series >─< series_genres >─ genres
            │      │
            │      ├─< books >─< book_authors >─ authors
            │      │      ├──< book_illustrators >─ illustrators
            │      │      └──< book_translators >─ translators
            │      └─< merchandise
            │
auth.users ─┬─ profiles (1:1, auto-created)
            ├─< user_roles
            └─< user_collections ──> books | merchandise
```

`user_collections` uses an **exclusive arc** instead of a polymorphic `item_id`. It has two real foreign keys
(`book_id`, `merchandise_id`) and a `CHECK (num_nonnulls(book_id, merchandise_id) = 1)`. This means:

- every entry points to an item that exists;
- deleting an item removes it from every user's collection;
- `UNIQUE (user_id, book_id)` and `UNIQUE (user_id, merchandise_id)` allow one row per item, so an item can never be
  both **Owned** and **Want**.

Special editions are `books` rows whose `edition_type` is not `regular` (special, limited, exclusive, box set).

### Search (`search_catalog`)

- Groups: series, books, merchandise, authors, illustrators, translators, publishers. Each result row includes
  `kind_total`, so the UI can show counts and "Show more".
- Ranking: exact match (1.0) > prefix (0.9) > substring (0.8) > full-text match (0.75) > trigram similarity.
  Typos like `lanturn keeper` still find *The Lantern Keeper*.
- Books also match on their series title, author, illustrator, translator, publisher and ISBN.
- Candidates are pre-filtered with indexed predicates: trigram GIN `LIKE` / `<%`, and full-text GIN `@@`.
- Filters are AND-ed between groups and OR-ed within a group: publisher, item type (including Special Edition and
  Merchandise), genre, completion status, Owned/Want, author, illustrator and translator.
- The client debounces input (300 ms) and keeps all search state in the URL, so results are shareable and survive a refresh.

### Home shelves (`get_genre_shelves`)

There is one horizontal row per genre, plus "Uncategorized" for series with no genre. A series in several genres appears
in each of those rows, but never twice in the same row. Within a row, series are ordered by the grouping you choose
(Author, Translator, Publisher or Illustrator), then by Author → Translator → Publisher → Illustrator → Title, with missing
values last. Group dividers mark where each group starts.

### Loading UX

- **Skeletons** match the size of each real component: covers, cards, shelves, detail pages, profile and lists.
- **Top progress bar** (NProgress-style) runs during lazy route loads, a page's first data fetch, and any save or upload.
  It does not run for background refetches of cached data.

---

## 7. Project structure

```
src/
  api/            data access + React Query hooks (catalog, search, collection, profile, admin, storage)
  components/
    auth/         LoginBookAnimation (floating LOGIN / SIGN UP books), AuthForms
    cards/        SeriesCard, BookCard
    detail/       ItemDetailLayout, OpenableBook (book that opens to its back-cover synopsis), SynopsisPanel, CollectionButtons
    layout/       AppLayout, Navbar, MobileNav, QuickSearch, UserMenu, Guards
    profile/      ProfileCard, ProfileEditor, CollectionGrid, CollectionStats
    search/       SearchBar, FilterPanel, Highlight
    admin/        AdminDashboard + tabs (series, books, merchandise, publishers, genres, people)
    ui/           Button, Badge, Field, Modal, ConfirmationDialog, Skeleton, EmptyState, Toaster
    GenreSection, HorizontalBookCarousel, CoverImage, LoadingProgressBar
  contexts/       AuthContext (session, profile, admin flag)
  lib/            supabase client, query client, stores (toast, progress, auth modal), labels, utils
  pages/          route components (lazy-loaded)
supabase/
  migrations/     schema, RLS, functions, storage, reference data
  seed.sql        optional demo catalog
  tests/run.mjs   database test harness (npm run test:db)
scripts/
  import.mjs               publisher importer (npm run import)
  import/core.mjs          shared import code
  import/phoenixnext.mjs   Phoenix Next adapter
  import/luckpim.mjs       Luckpim adapter
```
