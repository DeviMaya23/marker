import { AppShell } from '../app-shell/AppShell'
import { BookmarkList } from '../features/bookmark-list/components/BookmarkList'

export function TrashPage() {
  return (
    <AppShell>
      <h1 className="page__title">Trash</h1>
      <BookmarkList trashed />
    </AppShell>
  )
}
