import type { SearchRow } from '@/types/db'

/** Where a search result leads. People and publishers open a filtered search. */
export function resultHref(row: Pick<SearchRow, 'kind' | 'id'>): string {
  switch (row.kind) {
    case 'series':
      return `/series/${row.id}`
    case 'book':
      return `/book/${row.id}`
    case 'merchandise':
      return `/merch/${row.id}`
    case 'author':
      return `/search?authors=${row.id}`
    case 'illustrator':
      return `/search?illustrators=${row.id}`
    case 'translator':
      return `/search?translators=${row.id}`
    case 'publisher':
      return `/search?publishers=${row.id}`
  }
}
