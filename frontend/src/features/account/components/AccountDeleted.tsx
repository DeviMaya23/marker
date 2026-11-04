import { CircleCheck } from 'lucide-react'
import { StatePanel } from '../../../components/ui/StatePanel'
import { loginHref } from '../../../lib/loginHref'

/** The plain page shown once the account is gone: no app shell, no session. */
export function AccountDeleted() {
  return (
    <main className="page">
      <StatePanel
        icon={<CircleCheck size={32} aria-hidden="true" />}
        title="Your account was deleted."
        description="All of your bookmarks, notes, folders and trash were permanently erased. Logging in again starts a new, empty account."
        action={
          <a href={loginHref('/', '')} className="btn btn--primary">
            Log in
          </a>
        }
      />
    </main>
  )
}
