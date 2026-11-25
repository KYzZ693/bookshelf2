import { Link, useParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Gift, Sparkles } from 'lucide-react'
import { creditNames, useBook, useRegularVolume, useSeriesVolumeNav, useSpecialEditions, type EditionBrief } from '@/api/catalog'
import { CoverImage } from '@/components/CoverImage'
import { ItemDetailLayout, PublisherLinkButton, type InfoRow } from '@/components/detail/ItemDetailLayout'
import { CollectionButtons } from '@/components/detail/CollectionButtons'
import { OpenableBook } from '@/components/detail/OpenableBook'
import { Badge, CategoryBadge, StatusBadge } from '@/components/ui/Badge'
import { SkeletonDetail } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { PageContainer } from '@/components/layout/PageContainer'
import NotFoundPage from './NotFoundPage'
import { bookCategory, EDITION_LABEL, FORMAT_LABEL } from '@/lib/labels'
import { errorMessage, formatDate, formatPrice, formatVolume } from '@/lib/utils'
import type { Person } from '@/types/db'

function PeopleLinks({ people, param }: { people: Person[]; param: 'authors' | 'illustrators' | 'translators' }) {
  if (!people.length) return null
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <Link to={`/search?${param}=${p.id}`} className="text-ink underline decoration-line underline-offset-4 hover:text-accent hover:decoration-accent">
            {p.name}
          </Link>
        </span>
      ))}
    </>
  )
}

export default function BookDetailPage() {
  const { id } = useParams()
  const { data: book, isPending, isError, error, refetch } = useBook(id)
  const nav = useSeriesVolumeNav(book?.series_id)
  const isRegular = book?.edition_type === 'regular'
  const specials = useSpecialEditions(book?.id, !!book && isRegular)
  const parent = useRegularVolume(book && !isRegular ? book.regular_book_id : null)

  if (isPending) {
    return (
      <PageContainer>
        <SkeletonDetail />
      </PageContainer>
    )
  }
  if (isError) {
    return (
      <PageContainer>
        <EmptyState
          icon={AlertCircle}
          title="This book didn't load"
          description={errorMessage(error)}
          action={<Button onClick={() => refetch()}>Try again</Button>}
        />
      </PageContainer>
    )
  }
  if (!book) return <NotFoundPage title="Book not found" />

  const { authors, illustrators, translators } = creditNames(book)
  const category = bookCategory(book)
  const vol = formatVolume(book.volume_number)
  const publisher = book.publisher ?? book.series?.publisher ?? null
  const publisherHref = book.publisher_product_url ?? publisher?.website_url ?? null
  const genres = (book.series?.series_genres ?? []).map((g) => g.genre).filter(Boolean)

  const rows: InfoRow[] = [
    { label: 'Series', value: book.series ? <Link to={`/series/${book.series.id}`} className="hover:text-accent">{book.series.title}</Link> : null },
    { label: 'Volume', value: vol },
    { label: 'Item type', value: FORMAT_LABEL[book.item_type] },
    { label: 'Edition', value: book.edition_type !== 'regular' ? EDITION_LABEL[book.edition_type] : null },
    { label: 'Edition details', value: book.edition_notes, wide: true },
    {
      label: 'Special edition of',
      value: parent.data ? (
        <Link to={`/book/${parent.data.id}`} className="hover:text-accent">{parent.data.title}</Link>
      ) : null,
    },
    {
      label: 'Included in this edition',
      wide: true,
      value: book.bonus_items?.length ? (
        <ul className="mt-1 space-y-1">
          {book.bonus_items.map((b, i) => (
            <li key={i} className="flex gap-2">
              <Gift className="mt-0.5 size-3.5 shrink-0 text-special" /> {b}
            </li>
          ))}
        </ul>
      ) : null,
    },
    { label: authors.length > 1 ? 'Authors' : 'Author', value: authors.length ? <PeopleLinks people={authors} param="authors" /> : null },
    { label: illustrators.length > 1 ? 'Illustrators' : 'Illustrator', value: illustrators.length ? <PeopleLinks people={illustrators} param="illustrators" /> : null },
    { label: translators.length > 1 ? 'Translators' : 'Translator', value: translators.length ? <PeopleLinks people={translators} param="translators" /> : null },
    { label: 'Publisher', value: publisher ? <Link to={`/search?publishers=${publisher.id}`} className="hover:text-accent">{publisher.name}</Link> : null },
    { label: 'Price', value: formatPrice(book.price, book.currency) },
    { label: 'Genre', value: genres.length ? genres.map((g) => g!.name).join(', ') : null },
    { label: 'Published', value: formatDate(book.publication_date, { dateStyle: 'long' }) },
    { label: 'ISBN', value: book.isbn },
    { label: 'Pages', value: book.page_count ? book.page_count.toLocaleString() : null },
  ]

  // Prev / next regular volume
  const list = nav.data ?? []
  const idx = list.findIndex((b) => b.id === book.id)
  const prev = idx > 0 ? list[idx - 1] : null
  const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null

  return (
    <ItemDetailLayout
      crumbs={[
        { label: 'Bookshelf', to: '/' },
        ...(book.series ? [{ label: book.series.title, to: `/series/${book.series.id}` }] : []),
        { label: vol ? `Vol. ${vol}` : book.title },
      ]}
      cover={
        book.item_type === 'artbook' ? (
          // Artbooks: the artwork in a gallery frame; the synopsis is a normal tab, not an opening book.
          <div className="rounded-[8px] bg-gradient-to-br from-[#3a332b] to-[#1f1b16] p-[9px] shadow-book">
            <div className="bg-[#f4efe4] p-[8%] shadow-[inset_0_1px_3px_rgb(0_0_0/0.25)]">
              <CoverImage src={book.cover_url} title={book.title} category="artbook" plain fit="contain" eager aspect="aspect-[4/5]" rounded="rounded-[2px]" sizes="(min-width: 1024px) 320px, 260px" />
            </div>
          </div>
        ) : (
        <OpenableBook
          coverUrl={book.cover_url}
          title={book.title}
          subtitle={vol ? `Vol. ${vol}` : null}
          category={category}
          synopsis={book.synopsis}
          showcase={book.edition_type !== 'regular'}
          meta={[book.series?.title !== book.title ? book.series?.title : null, vol ? `Vol. ${vol}` : null, publisher?.name].filter(Boolean).join(' · ') || null}
        />
        )
      }
      eyebrow={
        book.series && (
          <Link to={`/series/${book.series.id}`} className="font-medium text-accent hover:underline">
            {book.series.title}
          </Link>
        )
      }
      title={book.title}
      subtitle={authors.length ? `by ${authors.map((a) => a.name).join(', ')}` : null}
      badges={
        <>
          <CategoryBadge category={category} />
          {vol && <Badge className="bg-surface-2 text-ink">Vol. {vol}</Badge>}
          {book.series && <StatusBadge status={book.series.completion_status} />}
        </>
      }
      actions={
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <CollectionButtons kind="book" id={book.id} title={book.title} />
          <PublisherLinkButton href={publisherHref} />
          {!isRegular && parent.data && (
            <Link
              to={`/book/${parent.data.id}`}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              <ArrowLeft className="size-4" /> Regular volume
            </Link>
          )}
          {isRegular && !!specials.data?.length && <SpecialEditionsPanel editions={specials.data} />}
        </div>
      }
      rows={rows}
      synopsis={book.item_type === 'artbook' ? book.synopsis : undefined}
      synopsisLabel="Description"
      footer={
        (prev || next) && (
          <div className="grid grid-cols-2 gap-3">
            {prev ? (
              <Link to={`/book/${prev.id}`} className="group rounded-xl border border-line bg-surface p-3.5 transition-colors hover:border-accent">
                <span className="flex items-center gap-1 text-xs text-muted"><ChevronLeft className="size-3.5" /> Previous volume</span>
                <span className="mt-1 line-clamp-1 text-sm font-medium text-ink group-hover:text-accent">{prev.title}</span>
              </Link>
            ) : <span />}
            {next ? (
              <Link to={`/book/${next.id}`} className="group rounded-xl border border-line bg-surface p-3.5 text-right transition-colors hover:border-accent">
                <span className="flex items-center justify-end gap-1 text-xs text-muted">Next volume <ChevronRight className="size-3.5" /></span>
                <span className="mt-1 line-clamp-1 text-sm font-medium text-ink group-hover:text-accent">{next.title}</span>
              </Link>
            ) : <span />}
          </div>
        )
      }
    />
  )
}

/** Prominent link from a regular volume to the special editions that package it. */
function SpecialEditionsPanel({ editions }: { editions: EditionBrief[] }) {
  return (
    <section
      aria-label="Special editions of this volume"
      className="mt-2 w-full overflow-hidden rounded-2xl border border-special/35 bg-gradient-to-br from-special-soft via-surface to-surface p-4 sm:basis-full"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-special">
        <Sparkles className="size-4" />
        {editions.length > 1 ? `Also available as ${editions.length} special editions` : 'Also available as a special edition'}
      </p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {editions.map((e) => (
          <Link
            key={e.id}
            to={`/book/${e.id}`}
            className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 pr-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-special hover:shadow-lift"
          >
            <CoverImage src={e.cover_url} title={e.title} category="special_edition" aspect="aspect-square" fit="contain" rounded="rounded-lg" className="w-16 shrink-0" sizes="64px" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold tracking-wide text-special uppercase">{EDITION_LABEL[e.edition_type]}</span>
              <span className="line-clamp-2 text-sm leading-snug font-semibold text-ink group-hover:text-special">{e.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {[e.edition_notes, formatPrice(e.price, e.currency)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-special px-3 text-xs font-semibold text-white">
              View <ChevronRight className="size-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}
