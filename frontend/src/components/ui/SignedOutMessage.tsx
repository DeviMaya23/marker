import { useLocation } from 'react-router'
import { Banner } from './Banner'

/**
 * Shown when a call returns 401. The login link is a plain anchor (a full page load) that
 * returns to the current path and query.
 */
export function SignedOutMessage() {
  const { pathname, search } = useLocation()
  const returnTo = encodeURIComponent(pathname + search)
  const href = import.meta.env.DEV
    ? `/auth/dev-login?name=alice&return_to=${returnTo}`
    : `/auth/login?return_to=${returnTo}`

  return (
    <Banner tone="info" role="alert">
      <p>You're logged out. Log in to continue.</p>
      <a href={href} className="btn btn--primary btn--sm" style={{ marginLeft: 'auto' }}>
        Log in
      </a>
    </Banner>
  )
}
