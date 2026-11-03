import { request } from './request'
import type { BookmarkDetail, BookmarkSummary, CreateBookmarkRequest } from './types'

export function createBookmark(body: CreateBookmarkRequest): Promise<BookmarkSummary> {
  return request<BookmarkSummary>('POST', '/bookmarks', body)
}

export function getBookmark(id: string): Promise<BookmarkDetail> {
  return request<BookmarkDetail>('GET', `/bookmarks/${encodeURIComponent(id)}`)
}
