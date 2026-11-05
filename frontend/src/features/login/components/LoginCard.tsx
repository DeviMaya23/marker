import { Bookmark } from 'lucide-react'
import { Banner } from '../../../components/ui/Banner'
import { loginHref } from '../../../lib/loginHref'
import { LOGIN_ERROR_MESSAGES, type LoginError } from '../lib/loginError'

/** The login card: a plain link (a full page load) that starts the identity-provider login. */
export function LoginCard({ returnTo, error }: { returnTo: string; error?: LoginError }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <Bookmark size={28} aria-hidden="true" />
        </div>
        <h1 className="login-card__title">marker</h1>
        <p className="login-card__desc">A place to dump links and find them again.</p>
        {error && (
          <Banner tone="error" role="alert">
            {LOGIN_ERROR_MESSAGES[error]}
          </Banner>
        )}
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
