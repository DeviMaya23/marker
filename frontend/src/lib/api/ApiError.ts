import type { ProblemBody } from './types'

/** A non-2xx API response. Network failures are not this class. */
export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemBody | null
  /** `Retry-After` in seconds, set for a 429 that carried the header. */
  readonly retryAfter: number | null

  constructor(status: number, problem: ProblemBody | null, retryAfter: number | null) {
    super(problem?.code ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
    this.retryAfter = retryAfter
  }
}
