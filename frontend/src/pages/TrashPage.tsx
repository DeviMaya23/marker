import { AppShell } from '../app-shell/AppShell'
import { BookmarkList } from '../features/bookmark-list/components/BookmarkList'
import { EmptyTrash } from '../features/bookmark-list/components/EmptyTrash'

export function TrashPage() {
  return (
    <AppShell>
      <div className="page-head">
        <h1 className="page__title">Trash</h1>
        <EmptyTrash />
      </div>
      <BookmarkList trashed />
    </AppShell>
  )
}
