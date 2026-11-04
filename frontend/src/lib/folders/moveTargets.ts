import type { Folder } from '../api/folders'
import type { FolderNode, FolderTree } from './buildFolderTree'

/** Folders nest this deep at most (a top-level folder is depth 1). */
export const MAX_FOLDER_DEPTH = 3

export type MoveTarget = {
  folder: Folder
  /** How many folders above this one in the tree as drawn: the indentation step. */
  level: number
  /** True when the moved folder cannot go here (folder moves only). */
  disabled: boolean
}

/** Levels in the subtree of `node`, the node itself counted as 1. */
function height(node: FolderNode, seen: Set<string>): number {
  if (seen.has(node.folder.id)) return 0
  seen.add(node.folder.id)
  return 1 + Math.max(0, ...node.children.map((child) => height(child, seen)))
}

/**
 * The rows of the move picker, depth-first with siblings in the server's order. With `moving`
 * (a folder move), a row is disabled when it is that folder or one of its descendants, or when
 * putting the moved subtree under it would go past 3 levels: its depth plus the subtree's
 * height (the moved folder counts as 1) is more than 3. The folder's current parent stays
 * valid. "Top level" is not a row here; the dialog always offers it. Pure.
 */
export function moveTargets(tree: FolderTree, moving?: Folder): MoveTarget[] {
  const rows: MoveTarget[] = []
  const movingNode = moving ? tree.get(moving.id) : undefined
  const blocked = moving ? new Set([moving.id, ...tree.descendantIds(moving.id)]) : new Set<string>()
  const movedHeight = movingNode ? height(movingNode, new Set()) : 1

  const seen = new Set<string>()
  function visit(node: FolderNode, level: number) {
    if (seen.has(node.folder.id)) return
    seen.add(node.folder.id)
    const disabled =
      moving !== undefined && (blocked.has(node.folder.id) || node.folder.depth + movedHeight > MAX_FOLDER_DEPTH)
    rows.push({ folder: node.folder, level, disabled })
    node.children.forEach((child) => visit(child, level + 1))
  }
  tree.roots.forEach((root) => visit(root, 0))
  return rows
}
