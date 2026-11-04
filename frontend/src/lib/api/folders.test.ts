import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFolder, deleteFolder, listFolders, updateFolder } from './folders'
import { apiRequest } from './request'

vi.mock('./request', () => ({ apiRequest: vi.fn() }))

describe('folder wrappers', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.mocked(apiRequest).mockResolvedValue(undefined)
  })

  it('listFolders is a plain GET', async () => {
    await listFolders()
    expect(apiRequest).toHaveBeenCalledWith('GET', '/folders')
  })

  it('createFolder omits parent_id at the top level and sends it for a subfolder', async () => {
    await createFolder({ name: 'Recipes' })
    expect(apiRequest).toHaveBeenLastCalledWith('POST', '/folders', { name: 'Recipes' })
    expect(vi.mocked(apiRequest).mock.calls[0][2]).not.toHaveProperty('parent_id')
    await createFolder({ name: 'Soups', parentId: 'p-1' })
    expect(apiRequest).toHaveBeenLastCalledWith('POST', '/folders', { name: 'Soups', parent_id: 'p-1' })
  })

  it('updateFolder sends only the name for a rename, to the encoded path', async () => {
    await updateFolder('f 1', { name: 'New' })
    expect(apiRequest).toHaveBeenCalledWith('PATCH', '/folders/f%201', { name: 'New' })
    expect(vi.mocked(apiRequest).mock.calls[0][2]).not.toHaveProperty('parent_id')
  })

  it('updateFolder sends parent_id as a string, as an explicit null, and not at all', async () => {
    await updateFolder('f1', { parentId: 'p-1' })
    expect(JSON.stringify(vi.mocked(apiRequest).mock.calls.at(-1)?.[2])).toBe('{"parent_id":"p-1"}')

    await updateFolder('f1', { parentId: null })
    expect(JSON.stringify(vi.mocked(apiRequest).mock.calls.at(-1)?.[2])).toBe('{"parent_id":null}')

    await updateFolder('f1', { parentId: undefined })
    expect(JSON.stringify(vi.mocked(apiRequest).mock.calls.at(-1)?.[2])).toBe('{}')
  })

  it('deleteFolder returns both counts', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ deleted_folders: 2, trashed_bookmarks: 5 })
    await expect(deleteFolder('f1')).resolves.toEqual({ deleted_folders: 2, trashed_bookmarks: 5 })
    expect(apiRequest).toHaveBeenCalledWith('DELETE', '/folders/f1')
  })
})
