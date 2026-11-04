import { useCallback } from 'react'
import { updateFolder, type Folder } from '../api/folders'
import { useFolderMutation } from './useFolderMutation'

/** What a finished move resolves with: the target as the user confirmed it (`null`: top level). */
export type MovedFolder = { target: Pick<Folder, 'name'> | null }

/** The toast for a finished move; the name is the target's at the moment the user confirmed. */
export function movedFolderMessage({ target }: MovedFolder): string {
  return target ? `Folder moved to “${target.name}”.` : 'Folder moved to the top level.'
}

/**
 * Moves one folder, with everything in it, under another folder or to the top level (`null`).
 * Only `parent_id` is sent. A 409 name conflict and a 422 do not refresh; a 404 does.
 */
export function useMoveFolder(id: string) {
  const call = useCallback(
    async (target: Pick<Folder, 'id' | 'name'> | null): Promise<MovedFolder> => {
      await updateFolder(id, { parentId: target ? target.id : null })
      return { target: target ? { name: target.name } : null }
    },
    [id],
  )
  const { run, pending, failure, reset } = useFolderMutation<[Pick<Folder, 'id' | 'name'> | null], MovedFolder>({
    action: 'move',
    call,
    successMessage: movedFolderMessage,
  })
  return { move: run, pending, failure, reset }
}
