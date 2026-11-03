/** Where "Log in" sends the user. A development build uses the dev-login bypass. */
export function loginUrl(returnTo: string, dev: boolean): string {
  const encoded = encodeURIComponent(returnTo)
  return dev ? `/auth/dev-login?name=alice&return_to=${encoded}` : `/auth/login?return_to=${encoded}`
}
