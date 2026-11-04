import { useCallback } from 'react'
import { updateFolder, type Folder } from '../api/folders'
import { useFolderMutation } from './useFolderMutation'

const message = () => 'Folder renamed.'

/** Renames one folder; nothing but its name is sent. */
export function useRenameFolder(id: string) {
  const call = useCallback((name: string) => updateFolder(id, { name }), [id])
  const { run, pending, failure, reset } = useFolderMutation<[string], Folder>({
    action: 'rename',
    call,
    successMessage: message,
  })
  return { rename: run, pending, failure, reset }
}
