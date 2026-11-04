/** The longest term the list sends; the contract allows 200 characters. */
export const MAX_TERM_LENGTH = 200

export type ListSearch = { q: string; includeNotes: boolean }

/** Trims a term, cuts it to its first 200 characters (code points), and trims again. */
export function normalizeTerm(raw: string): string {
  const trimmed = raw.trim()
  const chars = Array.from(trimmed)
  return chars.length > MAX_TERM_LENGTH ? chars.slice(0, MAX_TERM_LENGTH).join('').trim() : trimmed
}

/** Reads the applied search from a URL's query: `q` (normalized) and `notes=1`. */
export function readListSearch(params: URLSearchParams): ListSearch {
  return { q: normalizeTerm(params.get('q') ?? ''), includeNotes: params.get('notes') === '1' }
}

/**
 * A copy of `params` with `q` and `notes` written: an empty term removes `q`, notes off removes
 * `notes`. Other parameters are left alone. The term is written as given; normalize it first.
 */
export function writeListSearch(params: URLSearchParams, { q, includeNotes }: ListSearch): URLSearchParams {
  const next = new URLSearchParams(params)
  if (q === '') next.delete('q')
  else next.set('q', q)
  if (includeNotes) next.set('notes', '1')
  else next.delete('notes')
  return next
}
