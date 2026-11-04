import { createFolder, type Folder } from '../api/folders'
import { useFolderMutation } from './useFolderMutation'

const message = () => 'Folder created.'

/** Creates a folder at the top level, or inside `parentId`. */
export function useCreateFolder() {
  const { run, pending, failure, reset } = useFolderMutation<[{ name: string; parentId?: string }], Folder>({
    action: 'create',
    call: createFolder,
    successMessage: message,
  })
  return { create: run, pending, failure, reset }
}
