import type {
  BookFormat,
  CompletionStatus,
  EditionType,
  ItemCategory,
  MerchType,
  PersonRole,
} from '@/types/db'

export const FORMAT_LABEL: Record<BookFormat, string> = {
  light_novel: 'Light Novel',
  manga: 'Manga',
  novel: 'Novel',
  artbook: 'Artbook',
  other: 'Other',
}

export const CATEGORY_LABEL: Record<ItemCategory, string> = {
  ...FORMAT_LABEL,
  special_edition: 'Special Edition',
  merchandise: 'Merchandise',
}

/** Order used by filter chips and statistics. */
export const CATEGORY_ORDER: ItemCategory[] = [
  'light_novel',
  'manga',
  'novel',
  'artbook',
  'special_edition',
  'merchandise',
  'other',
]

export const EDITION_LABEL: Record<EditionType, string> = {
  regular: 'Regular',
  special: 'Special Edition',
  limited: 'Limited Edition',
  exclusive: 'Exclusive Edition',
  boxset: 'Box Set',
  other: 'Other Edition',
}

export const MERCH_LABEL: Record<MerchType, string> = {
  figure: 'Figure',
  acrylic_stand: 'Acrylic Stand',
  keychain: 'Keychain',
  poster: 'Poster',
  tapestry: 'Wall Scroll',
  art_print: 'Art Print',
  art_collection: 'Art Collection',
  postcard: 'Postcard',
  bookmark: 'Bookmark',
  character_goods: 'Character Goods',
  collectible: 'Collectible',
  other: 'Other Merchandise',
}

/** Display order for merchandise filters. */
export const MERCH_ORDER = Object.keys(MERCH_LABEL) as MerchType[]

/** Frame shape per merchandise type (product photos are shown whole inside it). */
export const MERCH_ASPECT: Record<MerchType, string> = {
  figure: 'aspect-[4/5]',
  acrylic_stand: 'aspect-[4/5]',
  keychain: 'aspect-square',
  poster: 'aspect-[3/4]',
  tapestry: 'aspect-[3/4]',
  art_print: 'aspect-[4/5]',
  art_collection: 'aspect-[4/5]',
  postcard: 'aspect-[4/3]',
  bookmark: 'aspect-[3/4]',
  character_goods: 'aspect-square',
  collectible: 'aspect-square',
  other: 'aspect-square',
}

export const STATUS_LABEL: Record<CompletionStatus, string> = {
  ongoing: 'Ongoing',
  completed: 'Completed',
  hiatus: 'Hiatus',
  cancelled: 'Cancelled',
}

export const STATUS_ORDER: CompletionStatus[] = ['ongoing', 'completed', 'hiatus', 'cancelled']

export const ROLE_LABEL: Record<PersonRole, string> = {
  author: 'Author',
  illustrator: 'Illustrator',
  translator: 'Translator',
}

/** Tailwind classes per category: [text, background]. */
export const CATEGORY_TONE: Record<ItemCategory, string> = {
  light_novel: 'text-ln bg-ln-soft',
  manga: 'text-manga bg-manga-soft',
  novel: 'text-novel bg-novel-soft',
  artbook: 'text-artbook bg-artbook-soft',
  other: 'text-muted bg-surface-2',
  special_edition: 'text-special bg-special-soft',
  merchandise: 'text-merch bg-merch-soft',
}

export const STATUS_TONE: Record<CompletionStatus, string> = {
  ongoing: 'text-accent bg-accent-soft',
  completed: 'text-violet bg-violet-soft',
  hiatus: 'text-want bg-want-soft',
  cancelled: 'text-danger bg-danger-soft',
}

/** Solid colors used for generated covers when no image exists. */
export const COVER_PALETTE: Record<ItemCategory, [string, string]> = {
  light_novel: ['#2D6A4F', '#1B4332'],
  manga: ['#5C4B8A', '#3F3266'],
  novel: ['#8B5A3C', '#5E3B26'],
  artbook: ['#9A6F05', '#6B4D04'],
  other: ['#5B5750', '#3D3A35'],
  special_edition: ['#A33D5C', '#6E2840'],
  merchandise: ['#1F6D8A', '#154B5F'],
}

export function bookCategory(item: { item_type: BookFormat; edition_type: EditionType }): ItemCategory {
  return item.edition_type !== 'regular' ? 'special_edition' : item.item_type
}
