/** Prefix of every list query: invalidating it refreshes the live list and the trash. */
export const BOOKMARK_LIST_KEY = ['bookmark-list'] as const

/** The live list and the trash get separate keys, so they never share cache. */
export function bookmarkListKey(trashed: boolean) {
  return [...BOOKMARK_LIST_KEY, { trashed }] as const
}
