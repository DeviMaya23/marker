import type { operations } from './schema'
import { apiRequest } from './request'

type SyncVersion = operations['getSyncVersion']['responses'][200]['content']['application/json']

/** The server's current change counter for the signed-in user; it differs after any change. */
export function getSyncVersion(): Promise<SyncVersion> {
  return apiRequest<SyncVersion>('GET', '/sync/version')
}
