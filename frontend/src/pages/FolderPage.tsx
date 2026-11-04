import { FolderX, Inbox } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { AppShell } from '../app-shell/AppShell'
import { StatePanel } from '../components/ui/StatePanel'
import { AddUrlForm } from '../features/bookmark-list/components/AddUrlForm'
import { SearchBar } from '../features/bookmark-list/components/SearchBar'
import { BookmarkList } from '../features/bookmark-list/components/BookmarkList'
import { useFolders } from '../lib/folders/useFolders'

function FolderMissing() {
  return (
    <StatePanel
      icon={<FolderX size={28} aria-hidden="true" />}
      title="This folder doesn't exist."
      action={
        <Link to="/" className="btn">
          Back to all bookmarks
        </Link>
      }
    />
  )
}

/** One folder: its name, the add field that saves into it, and its bookmarks and its subfolders'. */
export function FolderPage() {
  const { id = '' } = useParams()
  const folders = useFolders()
  const name = folders.data?.find((f) => f.id === id)?.name
  const missing = folders.data !== undefined && name === undefined

  return (
    <AppShell>
      <h1 className="page__title" aria-busy={folders.isPending}>
        {name}
      </h1>
      {missing ? (
        <FolderMissing />
      ) : (
        <>
          <SearchBar folder={{ id, name }} />
          <AddUrlForm key={id} folderId={id} />
          <BookmarkList
            folderId={id}
            notFound={<FolderMissing />}
            empty={
              <StatePanel
                icon={<Inbox size={28} aria-hidden="true" />}
                title="This folder is empty."
                description="Save a bookmark here with the field above."
              />
            }
          />
        </>
      )}
    </AppShell>
  )
}
