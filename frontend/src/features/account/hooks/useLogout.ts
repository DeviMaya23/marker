import { useCallback, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { logout as requestLogout } from '../../../lib/api/auth'
import { LOGGED_OUT_TOAST } from '../../../lib/bookmarks/describeFailure'
import { goTo } from '../../../lib/goTo'
import { loginHref } from '../../../lib/loginHref'
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
  const { pathname, search } = useLocation()

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
      const failure = describeLogoutFailure(error)
      if (failure.signedOut) {
        toast.show(LOGGED_OUT_TOAST, {
          tone: 'error',
          action: { label: 'Log in', onClick: () => goTo(loginHref(pathname, search)) },
        })
      } else {
        toast.show(failure.message, { tone: 'error' })
      }
      return
    }
    goTo(logoutTarget(url))
  }, [toast, pathname, search])

  return { logout, disabled }
}
