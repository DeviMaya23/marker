import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AppShell } from '../app-shell/AppShell'
import { AccountDeleted } from '../features/account/components/AccountDeleted'
import { BookmarkletSection } from '../features/account/components/BookmarkletSection'
import { DeleteAccountSection } from '../features/account/components/DeleteAccountSection'

export function AccountPage() {
  const [deleted, setDeleted] = useState(false)
  const queryClient = useQueryClient()

  // After the shell has unmounted: nothing of the deleted account may be shown from the cache.
  useEffect(() => {
    if (deleted) queryClient.clear()
  }, [deleted, queryClient])

  if (deleted) return <AccountDeleted />

  return (
    <AppShell>
      <h1 className="page__title">Account &amp; help</h1>
      <div className="account-page">
        <BookmarkletSection />
        <DeleteAccountSection onDeleted={() => setDeleted(true)} />
      </div>
    </AppShell>
  )
}
