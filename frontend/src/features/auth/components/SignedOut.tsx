import { useLocation } from 'react-router'
import { loginUrl } from '../lib/loginUrl'

/**
 * Shown when a call returns 401. The link is a plain anchor (a full page load): login
 * happens outside the single-page app. It returns to the current path and query.
 */
export function SignedOut() {
  const { pathname, search } = useLocation()
  return (
    <div className="banner banner--info" role="alert">
      <span>You're logged out. Log in to continue.</span>
      <a href={loginUrl(`${pathname}${search}`, import.meta.env.DEV)}>Log in</a>
    </div>
  )
}
