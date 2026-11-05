export type LoginError = 'login_failed' | 'access_denied'

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  login_failed: "Login didn't complete. Please try again.",
  access_denied: 'Login was cancelled.',
}

/** The `error` code the login callback put in the address, or null for anything else (exact match). */
export function loginErrorFrom(raw: string | null): LoginError | null {
  if (raw === 'login_failed' || raw === 'access_denied') return raw
  return null
}
