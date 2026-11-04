import type { components } from './schema'
import { apiRequest } from './request'

type Schemas = components['schemas']

export type BookmarkSummary = Schemas['BookmarkSummary']
export type BookmarkDetail = Schemas['BookmarkDetail']
export type CreateBookmarkRequest = Schemas['CreateBookmarkRequest']

export function createBookmark(body: CreateBookmarkRequest): Promise<BookmarkSummary> {
  return apiRequest<BookmarkSummary>('POST', '/bookmarks', body)
}

export function getBookmark(id: string): Promise<BookmarkDetail> {
  return apiRequest<BookmarkDetail>('GET', `/bookmarks/${encodeURIComponent(id)}`)
}

export type BookmarkPage = Schemas['BookmarkPage']

export type ListBookmarksParams = { trashed?: boolean; cursor?: string }

/** One page of the live list, or of the trash with `trashed: true`. Sends only what is given. */
export function listBookmarks({ trashed, cursor }: ListBookmarksParams = {}): Promise<BookmarkPage> {
  const query = new URLSearchParams()
  if (trashed) query.set('trashed', 'true')
  if (cursor !== undefined) query.set('cursor', cursor)
  const qs = query.toString()
  return apiRequest<BookmarkPage>('GET', qs ? `/bookmarks?${qs}` : '/bookmarks')
}
