import type { components } from './schema'

type Schemas = components['schemas']

export type BookmarkSummary = Schemas['BookmarkSummary']
export type BookmarkDetail = Schemas['BookmarkDetail']
export type CreateBookmarkRequest = Schemas['CreateBookmarkRequest']
export type ErrorCode = Schemas['ErrorCode']

/** Every field a problem+json body may carry, assembled from the generated problem schemas. */
export type ProblemBody = Schemas['ValidationProblem'] &
  Partial<Pick<Schemas['DuplicateBookmarkProblem'], 'existing_bookmark_id' | 'in_trash'>>
