import { Navigate, useSearchParams } from 'react-router'
import { LoginCard } from '../features/login/components/LoginCard'
import { useLoginProbe } from '../features/login/hooks/useLoginProbe'
import { loginErrorFrom } from '../features/login/lib/loginError'
import { safeReturnTo } from '../features/login/lib/safeReturnTo'

export function LoginPage() {
  const [params] = useSearchParams()
  const returnTo = safeReturnTo(params.get('return_to'))
  const error = loginErrorFrom(params.get('error'))
  const probe = useLoginProbe()

  if (probe === 'checking') {
    return (
      <div className="full-page-loading">
        <p role="status">Checking your session…</p>
      </div>
    )
  }
  if (probe === 'signed-in') return <Navigate to={returnTo} replace />
  return <LoginCard returnTo={returnTo} error={error ?? undefined} />
}
