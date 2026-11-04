import { useQuery } from '@tanstack/react-query'
import { getSyncVersion } from '../../../lib/api/sync'

export type LoginProbe = 'checking' | 'signed-in' | 'signed-out'

/**
 * Asks once whether the user is already signed in: the sync version answers 200 when they are.
 * Any failure counts as signed out, so the login card is always usable.
 */
export function useLoginProbe(): LoginProbe {
  const { status } = useQuery({
    queryKey: ['login-probe'],
    queryFn: () => getSyncVersion(),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  })
  if (status === 'pending') return 'checking'
  return status === 'success' ? 'signed-in' : 'signed-out'
}
