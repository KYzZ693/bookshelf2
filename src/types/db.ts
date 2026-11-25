// Row shapes returned by the Supabase API. Kept in sync with supabase/migrations.

export type BookFormat = 'light_novel' | 'manga' | 'novel' | 'artbook' | 'other'
export type EditionType = 'regular' | 'special' | 'limited' | 'exclusive' | 'boxset' | 'other'
export type MerchType =
  | 'acrylic_stand'
  | 'poster'
  | 'keychain'
  | 'figure'
  | 'art_collection'
  | 'postcard'
  | 'bookmark'
  | 'tapestry'
  | 'art_print'
  | 'character_goods'
  | 'collectible'
  | 'other'
export type ReconstructionStatus = 'not_started' | 'researching' | 'modeling' | 'completed' | 'failed'
export type ModelFormat = 'glb' | 'gltf' | 'procedural'
export type CompletionStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled'
export type CollectionStatus = 'owned' | 'want'
/** Filterable item category: a book format, a special edition, or merchandise. */
export type ItemCategory = BookFormat | 'special_edition' | 'merchandise'
export type PersonRole = 'author' | 'illustrator' | 'translator'
export type ItemKind = 'book' | 'merchandise'

export interface Publisher {
  id: string
  name: string
  logo_url: string | null
  website_url: string | null
  created_at: string
  updated_at: string
}

export interface Person {
  id: string
  name: string
  created_at?: string
  updated_at?: string
}

export interface Genre {
  id: string
  name: string
  slug: string
  sort_order: number
}

export interface Series {
  id: string
  title: string
  original_title: string | null
  description: string | null
  cover_url: string | null
  publisher_id: string | null
  series_type: BookFormat
  completion_status: CompletionStatus
  created_at: string
  updated_at: string
}

export interface SeriesOverview extends Series {
  publisher_name: string | null
  publisher_website: string | null
  genre_ids: string[]
  genre_names: string[]
  genre_slugs: string[]
  regular_volume_count: number
  special_volume_count: number
  merchandise_count: number
  latest_publication_date: string | null
  author_names: string[]
  illustrator_names: string[]
  translator_names: string[]
  /** Present on rows returned by get_genre_shelves. */
  group_key?: string | null
}

export interface Book {
  id: string
  series_id: string
  title: string
  volume_number: number | null
  item_type: BookFormat
  edition_type: EditionType
  edition_notes: string | null
  cover_url: string | null
  synopsis: string | null
  price: number | null
  currency: string
  publisher_id: string | null
  publisher_product_url: string | null
  publication_date: string | null
  isbn: string | null
  page_count: number | null
  /** Special editions: the regular volume this edition packages. */
  regular_book_id: string | null
  bonus_items: string[]
  created_at: string
  updated_at: string
}

export interface BookCredits {
  book_authors: { position: number; author: Person | null }[]
  book_illustrators: { position: number; illustrator: Person | null }[]
  book_translators: { position: number; translator: Person | null }[]
}

export interface BookDetail extends Book, BookCredits {
  series: {
    id: string
    title: string
    cover_url: string | null
    completion_status: CompletionStatus
    series_type: BookFormat
    publisher: Pick<Publisher, 'id' | 'name' | 'website_url'> | null
    series_genres: { genre: Pick<Genre, 'id' | 'name' | 'slug'> | null }[]
  } | null
  publisher: Pick<Publisher, 'id' | 'name' | 'website_url' | 'logo_url'> | null
}

export type BookListItem = Book & BookCredits

export interface Merchandise {
  id: string
  series_id: string
  title: string
  merch_type: MerchType
  description: string | null
  image_url: string | null
  price: number | null
  currency: string
  publisher_id: string | null
  product_url: string | null
  release_date: string | null
  model_url: string | null
  model_format: ModelFormat | null
  model_source: string | null
  /** Inputs for the in-browser procedural reconstruction (see src/components/merch/three). */
  model_params: Record<string, unknown> | null
  reference_urls: string[]
  reconstruction_status: ReconstructionStatus
  reconstruction_notes: string | null
  preview_available: boolean
  created_at: string
  updated_at: string
}

export interface MerchandiseDetail extends Merchandise {
  series: {
    id: string
    title: string
    completion_status: CompletionStatus
    publisher: Pick<Publisher, 'id' | 'name' | 'website_url'> | null
  } | null
  publisher: Pick<Publisher, 'id' | 'name' | 'website_url' | 'logo_url'> | null
}

export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  accent_color: AccentColor
  banner_pattern: BannerPattern
  created_at: string
  updated_at: string
}
export type AccentColor = 'emerald' | 'violet' | 'amber' | 'rose' | 'sky' | 'slate'
export type BannerPattern = 'spines' | 'dots' | 'plain'

export interface CollectionEntry {
  id: string
  user_id: string
  status: CollectionStatus
  created_at: string
  updated_at: string
  item_kind: ItemKind
  item_id: string
  title: string
  series_id: string
  series_title: string
  category: ItemCategory
  book_format: BookFormat | null
  edition_type: EditionType | null
  merch_type: MerchType | null
  volume_number: number | null
  image_url: string | null
  price: number | null
  currency: string | null
  publisher_name: string | null
}

export interface CollectionStats {
  owned_count: number
  want_count: number
  series_collected: number
  series_completed: number
  finished_series_owned: number
  owned_value: number
  want_value: number
  owned_by_type: Partial<Record<ItemCategory, number>>
  want_by_type: Partial<Record<ItemCategory, number>>
}

export type SearchKind = 'series' | 'book' | 'merchandise' | 'author' | 'illustrator' | 'translator' | 'publisher'

export interface SearchRow {
  kind: SearchKind
  id: string
  title: string
  subtitle: string | null
  image_url: string | null
  series_id: string | null
  series_title: string | null
  item_type: string | null
  edition_type: EditionType | null
  volume_number: number | null
  publisher_name: string | null
  completion_status: CompletionStatus | null
  genre_names: string[] | null
  price: number | null
  my_status: CollectionStatus | null
  score: number
  kind_total: number
}

export interface GenreShelf {
  genre_id: string | null
  genre_name: string
  genre_slug: string
  genre_total: number
  series: SeriesOverview[]
}
