import { useCallback } from 'react'
import { deleteFolder, type DeleteFolderResult } from '../api/folders'
import { useFolderMutation } from './useFolderMutation'

/** The toast for a finished delete, from the server's own numbers. */
export function deletedMessage({ trashed_bookmarks }: DeleteFolderResult): string {
  if (trashed_bookmarks === 0) return 'Folder deleted.'
  return `Folder deleted. ${trashed_bookmarks} ${trashed_bookmarks === 1 ? 'bookmark' : 'bookmarks'} moved to the trash.`
}

/** Deletes one folder and its subfolders; their bookmarks go to the trash. */
export function useDeleteFolder(id: string) {
  const call = useCallback(() => deleteFolder(id), [id])
  const { run, pending, failure, reset } = useFolderMutation<[], DeleteFolderResult>({
    action: 'delete',
    call,
    successMessage: deletedMessage,
    refreshBookmarkPages: true,
  })
  return { remove: run, pending, failure, reset }
}
