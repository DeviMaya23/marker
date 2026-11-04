import type { paths } from './schema'
import { apiRequest } from './request'

type LogoutResponse = paths['/auth/logout']['post']['responses']['200']['content']['application/json']

/** Ends the app session. The path is outside `/api/v1`. */
export function logout(): Promise<LogoutResponse> {
  return apiRequest<LogoutResponse>('POST', '/auth/logout', undefined, { base: '' })
}
