import type { Folder } from '../../../lib/api/folders'
import { useCreateFolder } from '../../../lib/folders/useCreateFolder'
import { FolderFormDialog } from './FolderFormDialog'

type Props = {
  open: boolean
  /** The folder to create inside; null creates at the top level. */
  parent: Folder | null
  onClose: () => void
}

/** "New folder" or "New subfolder", with its create call and failure. */
export function CreateFolderDialog({ open, parent, onClose }: Props) {
  const { create, pending, failure, reset } = useCreateFolder()
  return (
    <FolderFormDialog
      open={open}
      mode="create"
      parentName={parent?.name}
      initialName=""
      saving={pending}
      failure={failure}
      onSubmit={async (name) => (await create({ name, parentId: parent?.id })) !== null}
      onEdit={reset}
      onClose={() => {
        reset()
        onClose()
      }}
    />
  )
}
