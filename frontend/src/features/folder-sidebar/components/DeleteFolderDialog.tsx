import { Dialog } from '../../../components/ui/Dialog'
import type { Folder } from '../../../lib/api/folders'
import { useDeleteFolder } from '../../../lib/folders/useDeleteFolder'
import { deleteFolderText } from '../lib/deleteFolderText'

type Props = {
  open: boolean
  folder: Folder
  /** Counts from the folder list the page already has: subfolders at any depth, and the live
   *  bookmarks in the folder and all of them. */
  subfolders: number
  bookmarks: number
  onClose: () => void
  /** Called once, after the server confirmed the delete and before the dialog closes. */
  onDeleted: () => void
}

/** The plain confirmation for deleting a folder, with its delete call and failure. */
export function DeleteFolderDialog({ open, folder, subfolders, bookmarks, onClose, onDeleted }: Props) {
  const { remove, pending, failure, reset } = useDeleteFolder(folder.id)

  function close() {
    reset()
    onClose()
  }

  async function confirm() {
    if ((await remove()) === null) return
    onDeleted()
    close()
  }

  return (
    <Dialog
      open={open}
      title="Delete folder?"
      onClose={close}
      busy={pending}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={close} disabled={pending}>
            Cancel
          </button>
          <button type="button" className="btn btn--danger" onClick={() => void confirm()} disabled={pending}>
            Delete folder
          </button>
        </>
      }
    >
      {failure?.kind === 'dialog' && (
        <div className="banner banner--error" role="alert">
          {failure.message}
        </div>
      )}
      <p className="confirm-text">{deleteFolderText(folder.name, subfolders, bookmarks)}</p>
    </Dialog>
  )
}
