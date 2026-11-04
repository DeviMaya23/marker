import type { components, operations } from './schema'
import { apiRequest } from './request'

type Schemas = components['schemas']

export type Folder = Schemas['Folder']

export type DeleteFolderResult = operations['deleteFolder']['responses'][200]['content']['application/json']

/** Every folder of the signed-in user, as a flat list in the server's order. */
export function listFolders(): Promise<{ items: Folder[] }> {
  return apiRequest<{ items: Folder[] }>('GET', '/folders')
}

/** Creates a folder; `parentId` is left out of the body at the top level. */
export function createFolder({ name, parentId }: { name: string; parentId?: string }): Promise<Folder> {
  const body: Schemas['CreateFolderRequest'] = { name }
  if (parentId !== undefined) body.parent_id = parentId
  return apiRequest<Folder>('POST', '/folders', body)
}

/**
 * Renames a folder, moves it, or both. An absent key is not sent: a rename sends only `name`,
 * a move only `parent_id`. `parentId: null` moves the folder to the top level.
 */
export function updateFolder(id: string, changes: { name?: string; parentId?: string | null }): Promise<Folder> {
  const body: Schemas['UpdateFolderRequest'] = {}
  if (changes.name !== undefined) body.name = changes.name
  if (changes.parentId !== undefined) body.parent_id = changes.parentId
  return apiRequest<Folder>('PATCH', `/folders/${encodeURIComponent(id)}`, body)
}

/** Deletes a folder, its subfolders; their live bookmarks go to the trash. */
export function deleteFolder(id: string): Promise<DeleteFolderResult> {
  return apiRequest<DeleteFolderResult>('DELETE', `/folders/${encodeURIComponent(id)}`)
}
