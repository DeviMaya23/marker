/** Prefix of every list query: invalidating it refreshes the live list and the trash. */
export const BOOKMARK_LIST_KEY = ['bookmark-list'] as const

/**
 * The live list, the trash and each folder's list get separate keys, so they never share cache.
 * All of them sit under `BOOKMARK_LIST_KEY`, so invalidating the prefix refreshes every list.
 */
export function bookmarkListKey(trashed: boolean, folderId?: string) {
  return [...BOOKMARK_LIST_KEY, { trashed, folderId }] as const
}

/** The bookmark page's query for one bookmark, or every one with no id. */
export function bookmarkKey(id?: string) {
  return id === undefined ? (['bookmark'] as const) : (['bookmark', id] as const)
}
