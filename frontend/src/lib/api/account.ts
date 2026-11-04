import { apiRequest } from './request'

/** Permanently erases the signed-in user's account and all of its data. */
export function deleteAccount(): Promise<void> {
  return apiRequest<void>('DELETE', '/account')
}
