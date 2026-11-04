import type { Folder } from '../../lib/api/folders'
import { useFolders } from '../../lib/folders/useFolders'
import { useMoveFolder } from '../../lib/folders/useMoveFolder'
import { MoveDialog } from './MoveDialog'

type Props = { open: boolean; folder: Folder; onClose: () => void }

/** The move dialog for one folder (with everything in it), with the folder list and call wired in. */
export function MoveFolderDialog({ open, folder, onClose }: Props) {
  const folders = useFolders()
  const move = useMoveFolder(folder.id)

  return (
    <MoveDialog
      open={open}
      folder={folder}
      itemName={folder.name}
      currentLocation={folder.parent_id}
      folders={{
        items: folders.data,
        pending: folders.isPending,
        error: folders.error,
        retry: () => void folders.refetch(),
      }}
      working={move.pending}
      failure={move.failure && { signedOut: move.failure.kind === 'signed-out', message: move.failure.message }}
      onConfirm={async (target) => (await move.move(target)) !== null}
      onClose={() => {
        move.reset()
        onClose()
      }}
    />
  )
}
