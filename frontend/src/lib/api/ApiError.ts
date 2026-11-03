import type { components } from './schema'

type Schemas = components['schemas']

// The problem body, built from the generated types: the base problem plus the optional
// fields the duplicate (409) and validation (422) problems add.
export type ProblemBody = Schemas['Problem'] &
  Partial<Omit<Schemas['DuplicateBookmarkProblem'], keyof Schemas['Problem']>> &
  Partial<Omit<Schemas['ValidationProblem'], keyof Schemas['Problem']>>

export class ApiError extends Error {
  readonly status: number
  /** Present only when the response was `application/problem+json`. */
  readonly problem: ProblemBody | null
  /** Seconds from `Retry-After`, for a 429 with a whole-number header; otherwise null. */
  readonly retryAfter: number | null

  constructor(status: number, problem: ProblemBody | null, retryAfter: number | null) {
    super(problem?.code ? `${status} ${problem.code}` : `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
    this.retryAfter = retryAfter
  }
}
