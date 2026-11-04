import { AppShell } from '../app-shell/AppShell'
import { AddUrlForm } from '../features/bookmark-list/components/AddUrlForm'
import { SearchBar } from '../features/bookmark-list/components/SearchBar'
import { BookmarkList } from '../features/bookmark-list/components/BookmarkList'

export function BookmarksPage() {
  return (
    <AppShell>
      <h1 className="page__title">All bookmarks</h1>
      <SearchBar />
      <AddUrlForm />
      <BookmarkList />
    </AppShell>
  )
}
