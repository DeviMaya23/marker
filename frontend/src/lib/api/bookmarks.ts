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
