import { useCallback, useRef, useState } from 'react'
import { deleteAccount } from '../../../lib/api/account'
import { describeDeleteAccountFailure } from '../lib/deleteAccountFailure'

type Failure = ReturnType<typeof describeDeleteAccountFailure>

/** Deletes the account. A failure is kept for the confirmation dialog to show. */
export function useDeleteAccount() {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const inFlight = useRef(false)

  /** Resolves true when the account was deleted. */
  const run = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false
    inFlight.current = true
    setPending(true)
    setFailure(null)
    try {
      await deleteAccount()
      return true
    } catch (error) {
      setFailure(describeDeleteAccountFailure(error))
      return false
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }, [])

  const reset = useCallback(() => setFailure(null), [])

  return { run, pending, failure, reset }
}
