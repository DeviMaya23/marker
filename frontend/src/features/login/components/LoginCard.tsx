import { Bookmark } from 'lucide-react'
import { loginHref } from '../../../lib/loginHref'

/** The login card: a plain link (a full page load) that starts the identity-provider login. */
export function LoginCard({ returnTo }: { returnTo: string }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <Bookmark size={28} aria-hidden="true" />
        </div>
        <h1 className="login-card__title">marker</h1>
        <p className="login-card__desc">A place to dump links and find them again.</p>
        <a className="btn btn--primary btn--block" href={loginHref(returnTo, '')}>
          Log in
        </a>
        <p className="login-card__fineprint">
          You'll continue to your identity provider to sign in with email and password, or SSO.
        </p>
      </div>
    </div>
  )
}
