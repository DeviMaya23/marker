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

export type ListBookmarksParams = { trashed?: boolean; cursor?: string; folderId?: string }

/**
 * One page of the live list, or of the trash with `trashed: true`. With `folderId`, the live
 * bookmarks of that folder and its subfolders. Sends only what is given.
 */
export function listBookmarks({ trashed, cursor, folderId }: ListBookmarksParams = {}): Promise<BookmarkPage> {
  const query = new URLSearchParams()
  if (trashed) query.set('trashed', 'true')
  if (folderId !== undefined) query.set('folder_id', folderId)
  if (cursor !== undefined) query.set('cursor', cursor)
  const qs = query.toString()
  return apiRequest<BookmarkPage>('GET', qs ? `/bookmarks?${qs}` : '/bookmarks')
}

export type UpdateBookmarkRequest = Schemas['UpdateBookmarkRequest']

/**
 * The fields the UI changes; an absent key is not sent. `note: null` clears the note and
 * `folder_id: null` moves the bookmark to the top level.
 */
export type BookmarkChanges = Pick<UpdateBookmarkRequest, 'title' | 'note' | 'folder_id'>

export function updateBookmark(id: string, changes: BookmarkChanges): Promise<BookmarkSummary> {
  const body: BookmarkChanges = {}
  if (changes.title !== undefined) body.title = changes.title
  if (changes.note !== undefined) body.note = changes.note
  if (changes.folder_id !== undefined) body.folder_id = changes.folder_id
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
