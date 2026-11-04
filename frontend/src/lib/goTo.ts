/** A full page load to `href` (the login link, the identity provider's logout address, `/`). Its own function so tests can replace it. */
export function goTo(href: string): void {
  window.location.assign(href)
}
