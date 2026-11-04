import { useState } from 'react'
import { ChevronDown, ChevronRight, Folder as FolderIcon, MoreHorizontal } from 'lucide-react'
import { NavLink } from 'react-router'
import { Menu } from '../../../components/ui/Menu'
import type { Folder } from '../../../lib/api/folders'
import type { FolderNode } from '../../../lib/folders/buildFolderTree'

/** Folders nest this deep at most (a top-level folder is depth 1). */
const MAX_DEPTH = 3
export const DEPTH_TITLE = 'Folders can only be nested 3 levels deep.'

export type FolderActions = {
  onNewSubfolder: (folder: Folder) => void
  onRename: (folder: Folder) => void
  onMove: (folder: Folder) => void
  onDelete: (folder: Folder) => void
}

type TreeProps = FolderActions & { nodes: FolderNode[] }

/** The nested folder list. Which folders are collapsed is plain local state: all start expanded. */
export function FolderTree({ nodes, ...actions }: TreeProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  return (
    <ul className="folder-tree" aria-label="Folders">
      {nodes.map((node) => (
        <FolderRow key={node.folder.id} node={node} level={0} collapsed={collapsed} onToggle={toggle} {...actions} />
      ))}
    </ul>
  )
}

type RowProps = FolderActions & {
  node: FolderNode
  /** How many folders above this one in the tree as drawn (not the server's `depth`). */
  level: number
  collapsed: ReadonlySet<string>
  onToggle: (id: string) => void
}

function FolderRow({ node, level, collapsed, onToggle, onNewSubfolder, onRename, onMove, onDelete }: RowProps) {
  const { folder, children, subtreeCount } = node
  const hasChildren = children.length > 0
  const expanded = !collapsed.has(folder.id)
  const tooDeep = folder.depth >= MAX_DEPTH

  return (
    <li>
      <div className="folder-row" style={{ paddingLeft: `calc(var(--space-3) * ${level})` }}>
        {hasChildren ? (
          <button
            type="button"
            className="folder-row__chevron"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${folder.name}`}
            onClick={() => onToggle(folder.id)}
          >
            {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
          </button>
        ) : (
          <span className="folder-row__chevron folder-row__chevron--spacer" aria-hidden="true" />
        )}
        <NavLink to={`/folder/${folder.id}`} className="folder-row__link" title={folder.name}>
          <FolderIcon size={16} className="folder-row__icon" aria-hidden="true" />
          <span className="folder-row__name">{folder.name}</span>
        </NavLink>
        {subtreeCount > 0 && <span className="folder-row__count">{subtreeCount}</span>}
        <Menu
          label={`Actions for folder ${folder.name}`}
          className="icon-btn icon-btn--sm"
          items={[
            {
              key: 'subfolder',
              label: 'New subfolder',
              onSelect: () => onNewSubfolder(folder),
              disabled: tooDeep,
              title: tooDeep ? DEPTH_TITLE : undefined,
            },
            { key: 'rename', label: 'Rename', onSelect: () => onRename(folder) },
            { key: 'move', label: 'Move to…', onSelect: () => onMove(folder) },
            { key: 'delete', label: 'Delete', onSelect: () => onDelete(folder), danger: true },
          ]}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </Menu>
      </div>
      {hasChildren && expanded && (
        <ul>
          {children.map((child) => (
            <FolderRow
              key={child.folder.id}
              node={child}
              level={level + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onNewSubfolder={onNewSubfolder}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
