import type { Folder } from '../../../lib/api/folders'
import { useRenameFolder } from '../../../lib/folders/useRenameFolder'
import { FolderFormDialog } from './FolderFormDialog'

type Props = { open: boolean; folder: Folder; onClose: () => void }

/** "Rename folder", with its update call and failure. It keeps its own copy of the folder. */
export function RenameFolderDialog({ open, folder, onClose }: Props) {
  const { rename, pending, failure, reset } = useRenameFolder(folder.id)
  return (
    <FolderFormDialog
      open={open}
      mode="rename"
      initialName={folder.name}
      saving={pending}
      failure={failure}
      onSubmit={async (name) => (await rename(name)) !== null}
      onEdit={reset}
      onClose={() => {
        reset()
        onClose()
      }}
    />
  )
}
