import { ApiError } from '../../../lib/api/ApiError'
import { rateLimitMessage } from '../../../lib/bookmarks/describeFailure'

export const DELETE_ACCOUNT_FAILED = "Couldn't delete your account."

/** What the confirmation dialog shows for a failed delete. `signedOut` only for a 401. */
export function describeDeleteAccountFailure(error: unknown): { signedOut: boolean; message: string } {
  if (error instanceof ApiError) {
    if (error.status === 401) return { signedOut: true, message: '' }
    if (error.status === 429) return { signedOut: false, message: rateLimitMessage(error.retryAfter) }
  }
  return { signedOut: false, message: DELETE_ACCOUNT_FAILED }
}
