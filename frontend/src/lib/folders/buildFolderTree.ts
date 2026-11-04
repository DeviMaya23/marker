import type { Folder } from '../api/folders'

export type FolderNode = {
  folder: Folder
  children: FolderNode[]
  /** The folder's `bookmark_count` plus those of all its descendants. */
  subtreeCount: number
}

export type FolderTree = {
  /** Top-level folders, and folders whose parent is not in the list, in the server's order. */
  roots: FolderNode[]
  get: (id: string) => FolderNode | undefined
  /** Ids of every folder below `id` (not `id` itself); empty for an unknown id. */
  descendantIds: (id: string) => Set<string>
}

/**
 * Nests the server's flat list. Siblings keep the order the server gave; nothing is sorted
 * here. A folder whose parent is missing from the list is shown at the top level.
 */
export function buildFolderTree(items: readonly Folder[]): FolderTree {
  const byId = new Map<string, FolderNode>()
  for (const folder of items) byId.set(folder.id, { folder, children: [], subtreeCount: 0 })

  const roots: FolderNode[] = []
  for (const folder of items) {
    const node = byId.get(folder.id)
    if (!node) continue
    const parent = folder.parent_id !== null && folder.parent_id !== folder.id ? byId.get(folder.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  // Counts bottom-up from the roots; `seen` keeps a parent loop in bad data from recursing forever.
  const seen = new Set<string>()
  function sum(node: FolderNode): number {
    if (seen.has(node.folder.id)) return 0
    seen.add(node.folder.id)
    node.subtreeCount = node.children.reduce((total, child) => total + sum(child), node.folder.bookmark_count)
    return node.subtreeCount
  }
  roots.forEach(sum)

  function descendantIds(id: string): Set<string> {
    const found = new Set<string>()
    const stack = [...(byId.get(id)?.children ?? [])]
    while (stack.length > 0) {
      const node = stack.pop()
      if (!node || found.has(node.folder.id)) continue
      found.add(node.folder.id)
      stack.push(...node.children)
    }
    return found
  }

  return { roots, get: (id) => byId.get(id), descendantIds }
}
