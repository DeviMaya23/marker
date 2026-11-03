import { AppShell } from '../app-shell/AppShell'
import { AddUrlForm } from '../features/bookmark-list/components/AddUrlForm'
import { BookmarkList } from '../features/bookmark-list/components/BookmarkList'

export function BookmarksPage() {
  return (
    <AppShell>
      <h1 className="page__title">All bookmarks</h1>
      <AddUrlForm />
      <BookmarkList />
    </AppShell>
  )
}
