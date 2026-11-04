import { goTo } from '../goTo'
import { loginPageHref } from '../loginHref'

/** True once a redirect started (or was switched off); lasts until the page reloads. */
let used = false

/**
 * Sends the browser to the login screen, coming back to the current path and query.
 * At most once per page load. Does nothing on the login screen itself, and a call skipped
 * for that reason does not use up the once-per-page guard.
 */
export function redirectToLogin(): void {
  if (used) return
  const { pathname, search } = window.location
  if (/^\/login\/?$/i.test(pathname)) return
  used = true
  goTo(loginPageHref(pathname, search))
}

/** Switches the rule off until the page reloads (after a successful logout). */
export function suppressLoginRedirect(): void {
  used = true
}

/** Test only: makes the once-per-page guard fresh again. */
export function resetLoginRedirectForTests(): void {
  used = false
}
