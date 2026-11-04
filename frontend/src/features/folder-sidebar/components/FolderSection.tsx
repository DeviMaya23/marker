import { useEffect, useMemo, useRef, useState } from 'react'
import { FolderPlus, TriangleAlert } from 'lucide-react'
import { matchPath, useLocation, useNavigate } from 'react-router'
import { MoveFolderDialog } from '../../../components/ui/MoveFolderDialog'
import { isUnauthorized } from '../../../lib/api/ApiError'
import type { Folder } from '../../../lib/api/folders'
import { buildFolderTree } from '../../../lib/folders/buildFolderTree'
import { useFolders } from '../../../lib/folders/useFolders'
import { CreateFolderDialog } from './CreateFolderDialog'
import { DeleteFolderDialog } from './DeleteFolderDialog'
import { FolderTree } from './FolderTree'
import { RenameFolderDialog } from './RenameFolderDialog'

type DialogRequest = DistributiveOmit<Dialog, 'key'>
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** The dialog that is open or was last open; `open` goes false first so focus can return. */
type Dialog = { key: number } & (
  | { kind: 'create'; parent: Folder | null }
  | { kind: 'rename'; folder: Folder }
  | { kind: 'move'; folder: Folder }
  | { kind: 'delete'; folder: Folder; subfolders: number; bookmarks: number; gone: ReadonlySet<string> }
)

function SkeletonRows() {
  return (
    <div data-testid="folder-skeleton" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="folder-row folder-row--skeleton">
          <span className="skeleton skeleton--line" style={{ width: `${70 - i * 12}%` }} />
        </div>
      ))}
    </div>
  )
}

/**
 * The sidebar's "Folders" section: heading with "New folder", the tree in its loading, empty,
 * failed state, and the create, rename, move and delete dialogs.
 */
export function FolderSection() {
  const folders = useFolders()
  const tree = useMemo(() => buildFolderTree(folders.data ?? []), [folders.data])
  const navigate = useNavigate()
  const { pathname } = useLocation()
  // The delete finishes later than the click; it checks the place the user is in by then.
  const pathnameRef = useRef(pathname)
  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [open, setOpen] = useState(false)
  // Each opening gets a new key, so the dialog starts from the current values.
  const openings = useRef(0)
  const show = (next: DialogRequest) => {
    setDialog({ ...next, key: ++openings.current })
    setOpen(true)
  }
  const close = () => setOpen(false)

  function askDelete(folder: Folder) {
    const node = tree.get(folder.id)
    const gone = new Set([folder.id, ...tree.descendantIds(folder.id)])
    show({ kind: 'delete', folder, subfolders: gone.size - 1, bookmarks: node?.subtreeCount ?? 0, gone })
  }

  /** Leaves the page of a folder that no longer exists: the deleted one or one below it. */
  function leaveIfGone(gone: ReadonlySet<string>) {
    const id = matchPath('/folder/:id', pathnameRef.current)?.params.id
    if (id !== undefined && gone.has(id)) void navigate('/', { replace: true })
  }

  let body
  if (folders.isPending || (isUnauthorized(folders.error) && !folders.data)) {
    body = <SkeletonRows />
  } else if (!folders.data) {
    body = (
      <div className="folder-error" role="alert">
        <TriangleAlert size={16} aria-hidden="true" />
        <span>Couldn't load your folders.</span>
        <button type="button" className="btn btn--sm" onClick={() => void folders.refetch()}>
          Try again
        </button>
      </div>
    )
  } else if (tree.roots.length === 0) {
    body = <p className="folder-empty">No folders yet.</p>
  } else {
    body = (
      <FolderTree
        nodes={tree.roots}
        onNewSubfolder={(folder) => show({ kind: 'create', parent: folder })}
        onRename={(folder) => show({ kind: 'rename', folder })}
        onMove={(folder) => show({ kind: 'move', folder })}
        onDelete={askDelete}
      />
    )
  }

  return (
    <section aria-labelledby="folders-heading" aria-busy={folders.isPending}>
      <div className="sidebar__section-header">
        <h2 id="folders-heading" className="sidebar__section-title">
          Folders
        </h2>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          aria-label="New folder"
          onClick={() => show({ kind: 'create', parent: null })}
        >
          <FolderPlus size={16} aria-hidden="true" />
        </button>
      </div>
      {body}
      {dialog?.kind === 'create' && (
        <CreateFolderDialog key={dialog.key} open={open} parent={dialog.parent} onClose={close} />
      )}
      {dialog?.kind === 'rename' && (
        <RenameFolderDialog key={dialog.key} open={open} folder={dialog.folder} onClose={close} />
      )}
      {dialog?.kind === 'move' && <MoveFolderDialog key={dialog.key} open={open} folder={dialog.folder} onClose={close} />}
      {dialog?.kind === 'delete' && (
        <DeleteFolderDialog
          key={dialog.key}
          open={open}
          folder={dialog.folder}
          subfolders={dialog.subfolders}
          bookmarks={dialog.bookmarks}
          onClose={close}
          onDeleted={() => leaveIfGone(dialog.gone)}
        />
      )}
    </section>
  )
}
