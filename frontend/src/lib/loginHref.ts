/**
 * The login link: a full page load that comes back to `pathname + search`.
 * A development build signs in through the dev route.
 */
export function loginHref(pathname: string, search: string): string {
  const returnTo = encodeURIComponent(pathname + search)
  return import.meta.env.DEV
    ? `/auth/dev-login?name=alice&return_to=${returnTo}`
    : `/auth/login?return_to=${returnTo}`
}

/** The login screen's address, which returns to `pathname + search` after login. */
export function loginPageHref(pathname: string, search: string): string {
  return `/login?return_to=${encodeURIComponent(pathname + search)}`
}
