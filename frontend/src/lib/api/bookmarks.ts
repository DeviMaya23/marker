import type { components, operations } from './schema'
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

export type UpdateBookmarkRequest = Schemas['UpdateBookmarkRequest']

/** The fields the UI edits; an absent key is not sent, and `note: null` clears the note. */
export type BookmarkChanges = Pick<UpdateBookmarkRequest, 'title' | 'note'>

export function updateBookmark(id: string, changes: BookmarkChanges): Promise<BookmarkSummary> {
  const body: BookmarkChanges = {}
  if (changes.title !== undefined) body.title = changes.title
  if (changes.note !== undefined) body.note = changes.note
  return apiRequest<BookmarkSummary>('PATCH', `/bookmarks/${encodeURIComponent(id)}`, body)
}

/** Moves a bookmark to the trash (204, no body). */
export function deleteBookmark(id: string): Promise<void> {
  return apiRequest<void>('DELETE', `/bookmarks/${encodeURIComponent(id)}`)
}

export function restoreBookmark(id: string): Promise<BookmarkSummary> {
  return apiRequest<BookmarkSummary>('POST', `/bookmarks/${encodeURIComponent(id)}/restore`)
}

export type EmptyTrashResult = operations['emptyTrash']['responses'][200]['content']['application/json']

export function emptyTrash(): Promise<EmptyTrashResult> {
  return apiRequest<EmptyTrashResult>('DELETE', '/trash')
}
