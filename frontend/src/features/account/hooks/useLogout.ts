import { useCallback, useRef, useState } from 'react'
import { logout as requestLogout } from '../../../lib/api/auth'
import { isUnauthorized } from '../../../lib/api/ApiError'
import { suppressLoginRedirect } from '../../../lib/api/loginRedirect'
import { goTo } from '../../../lib/goTo'
import { useToast } from '../../../components/ui/useToast'
import { describeLogoutFailure, logoutTarget } from '../lib/logout'

/**
 * Logs out: ends the app session, then sends the browser to the identity provider's logout
 * address (or `/` when the server's address is not a plain http(s) URL). One logout at a time;
 * `disabled` stays true after a success until the page unloads. A failure shows a toast.
 */
export function useLogout() {
  const [disabled, setDisabled] = useState(false)
  const inFlight = useRef(false)
  const toast = useToast()

  const logout = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setDisabled(true)
    let url: unknown
    try {
      url = (await requestLogout()).logout_url
    } catch (error) {
      inFlight.current = false
      setDisabled(false)
      if (isUnauthorized(error)) return
      toast.show(describeLogoutFailure(error).message, { tone: 'error' })
      return
    }
    suppressLoginRedirect()
    goTo(logoutTarget(url))
  }, [toast])

  return { logout, disabled }
}
