import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from '@/lib/toast'
import { errorMessage, unwrap } from '@/lib/utils'
import { withProgress } from '@/lib/progress'
import type {
  Book,
  BookFormat,
  CompletionStatus,
  EditionType,
  Genre,
  Merchandise,
  MerchType,
  Person,
  PersonRole,
  Publisher,
} from '@/types/db'

// All writes below are additionally protected by RLS (is_admin()) in the DB.

export interface SeriesInput {
  id?: string
  title: string
  original_title: string | null
  description: string | null
  cover_url: string | null
  publisher_id: string | null
  series_type: BookFormat
  completion_status: CompletionStatus
}

export interface BookInput {
  id?: string
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
}

export interface MerchInput {
  id?: string
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
}

const PEOPLE_TABLE: Record<PersonRole, 'authors' | 'illustrators' | 'translators'> = {
  author: 'authors',
  illustrator: 'illustrators',
  translator: 'translators',
}

export const adminApi = {
  async saveSeries(input: SeriesInput, genreIds: string[]): Promise<string> {
    return unwrap(await supabase.rpc('admin_save_series', { p_series: input, p_genre_ids: genreIds })) as string
  },
  async deleteSeries(id: string) {
    unwrap(await supabase.from('series').delete().eq('id', id))
  },

  async saveBook(input: BookInput, authorIds: string[], illustratorIds: string[], translatorIds: string[]): Promise<string> {
    return unwrap(
      await supabase.rpc('admin_save_book', {
        p_book: input,
        p_author_ids: authorIds,
        p_illustrator_ids: illustratorIds,
        p_translator_ids: translatorIds,
      }),
    ) as string
  },
  async deleteBook(id: string) {
    unwrap(await supabase.from('books').delete().eq('id', id))
  },

  async saveMerch(input: MerchInput): Promise<Merchandise> {
    const { id, ...rest } = input
    const res = id
      ? await supabase.from('merchandise').update(rest).eq('id', id).select('*').single()
      : await supabase.from('merchandise').insert(rest).select('*').single()
    return unwrap(res) as Merchandise
  },
  async deleteMerch(id: string) {
    unwrap(await supabase.from('merchandise').delete().eq('id', id))
  },

  async savePublisher(input: Partial<Publisher> & { name: string }): Promise<Publisher> {
    const { id, name, website_url = null, logo_url = null } = input
    const payload = { name, website_url, logo_url }
    const res = id
      ? await supabase.from('publishers').update(payload).eq('id', id).select('*').single()
      : await supabase.from('publishers').insert(payload).select('*').single()
    return unwrap(res) as Publisher
  },
  async deletePublisher(id: string) {
    unwrap(await supabase.from('publishers').delete().eq('id', id))
  },

  async saveGenre(input: Partial<Genre> & { name: string; slug: string }): Promise<Genre> {
    const { id, name, slug, sort_order = 100 } = input
    const payload = { name, slug, sort_order }
    const res = id
      ? await supabase.from('genres').update(payload).eq('id', id).select('*').single()
      : await supabase.from('genres').insert(payload).select('*').single()
    return unwrap(res) as Genre
  },
  async deleteGenre(id: string) {
    unwrap(await supabase.from('genres').delete().eq('id', id))
  },

  async savePerson(role: PersonRole, input: { id?: string; name: string }): Promise<Person> {
    const table = PEOPLE_TABLE[role]
    const res = input.id
      ? await supabase.from(table).update({ name: input.name }).eq('id', input.id).select('id, name').single()
      : await supabase.from(table).insert({ name: input.name }).select('id, name').single()
    return unwrap(res) as Person
  },
  async deletePerson(role: PersonRole, id: string) {
    unwrap(await supabase.from(PEOPLE_TABLE[role]).delete().eq('id', id))
  },
  /** Find-or-create by name (case-insensitive). */
  async ensurePerson(role: PersonRole, name: string): Promise<string> {
    return unwrap(await supabase.rpc('admin_ensure_person', { p_role: role, p_name: name })) as string
  },

  async getBookForEdit(id: string) {
    const row = unwrap(
      await supabase
        .from('books')
        .select(
          'id, series_id, title, volume_number, item_type, edition_type, edition_notes, cover_url, synopsis, price, currency, publisher_id, publisher_product_url, publication_date, isbn, page_count, created_at, updated_at, book_authors(position, author:authors(id, name)), book_illustrators(position, illustrator:illustrators(id, name)), book_translators(position, translator:translators(id, name))',
        )
        .eq('id', id)
        .single(),
    )
    return row as unknown as Book & {
      book_authors: { position: number; author: Person }[]
      book_illustrators: { position: number; illustrator: Person }[]
      book_translators: { position: number; translator: Person }[]
    }
  },
}

/**
 * Wraps an admin write: runs the progress bar, invalidates every catalog query
 * on success, and shows success / error toasts.
 */
export function useAdminMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  opts: { success?: string | ((r: TResult, v: TVars) => string); onSuccess?: (r: TResult, v: TVars) => void } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: TVars) => withProgress(fn(vars)),
    onSuccess: (r, v) => {
      qc.invalidateQueries({ queryKey: ['catalog'] })
      qc.invalidateQueries({ queryKey: ['admin'] })
      const msg = typeof opts.success === 'function' ? opts.success(r, v) : opts.success
      if (msg) toast.success(msg)
      opts.onSuccess?.(r, v)
    },
    onError: (err) => toast.error('Save failed', errorMessage(err)),
  })
}
