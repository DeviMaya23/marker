import { ApiError } from '../../../lib/api/ApiError'
import { rateLimitMessage } from '../../../lib/bookmarks/describeFailure'

export const DELETE_ACCOUNT_FAILED = "Couldn't delete your account."

/** What the confirmation dialog shows for a failed delete. */
export function describeDeleteAccountFailure(error: unknown): { message: string } {
  if (error instanceof ApiError) {
    if (error.status === 429) return { message: rateLimitMessage(error.retryAfter) }
  }
  return { message: DELETE_ACCOUNT_FAILED }
}
