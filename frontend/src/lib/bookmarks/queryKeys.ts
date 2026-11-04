/** Prefix of every list query: invalidating it refreshes the live list and the trash. */
export const BOOKMARK_LIST_KEY = ['bookmark-list'] as const

/**
 * The live list, the trash and each folder's list get separate keys, so they never share cache.
 * A search adds its term and notes flag to the key; a list with no term keeps the key it always had.
 * All of them sit under `BOOKMARK_LIST_KEY`, so invalidating the prefix refreshes every list.
 */
export function bookmarkListKey(trashed: boolean, folderId?: string, search?: { q: string; includeNotes: boolean }) {
  if (!search || search.q === '') return [...BOOKMARK_LIST_KEY, { trashed, folderId }] as const
  return [...BOOKMARK_LIST_KEY, { trashed, folderId, q: search.q, includeNotes: search.includeNotes }] as const
}

/** The bookmark page's query for one bookmark, or every one with no id. */
export function bookmarkKey(id?: string) {
  return id === undefined ? (['bookmark'] as const) : (['bookmark', id] as const)
}
