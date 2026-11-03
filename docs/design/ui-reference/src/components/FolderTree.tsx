import * as React from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { FiFolder, FiMoreHorizontal, FiPlus, FiEdit2, FiMove, FiTrash2, FiChevronRight } from "react-icons/fi";
import type { Folder } from "../lib/api/types";
import { FIELD_LIMITS } from "../lib/api/types";
import { Link } from "../lib/router";

export interface FolderNode extends Folder {
  children: FolderNode[];
}

export function buildFolderTree(folders: Folder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>();
  folders.forEach((f) => byId.set(f.id, { ...f, children: [] }));
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = byId.get(f.id)!;
    if (f.parent_id && byId.has(f.parent_id)) {
      byId.get(f.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function flattenFolderTree(nodes: FolderNode[], depth = 0): Array<{ node: FolderNode; depth: number }> {
  const out: Array<{ node: FolderNode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    out.push(...flattenFolderTree(n.children, depth + 1));
  }
  return out;
}

export function FolderTree({
  tree,
  activeFolderId,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onNavigate,
}: {
  tree: FolderNode[];
  activeFolderId?: string;
  onCreate: (parentId: string | null) => void;
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onNavigate?: () => void;
}) {
  return (
    <ul className="folder-tree" role="tree">
      {tree.map((node) => (
        <FolderTreeRow
          key={node.id}
          node={node}
          depth={0}
          activeFolderId={activeFolderId}
          onCreate={onCreate}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

function FolderTreeRow({
  node,
  depth,
  activeFolderId,
  onCreate,
  onRename,
  onMove,
  onDelete,
  onNavigate,
}: {
  node: FolderNode;
  depth: number;
  activeFolderId?: string;
  onCreate: (parentId: string | null) => void;
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const hasChildren = node.children.length > 0;
  const atMaxDepth = node.depth >= FIELD_LIMITS.maxFolderDepth;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className={`folder-row${activeFolderId === node.id ? " folder-row--active" : ""}`} style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            className="folder-row__chevron"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <FiChevronRight size={14} style={{ transform: expanded ? "rotate(90deg)" : "none" }} />
          </button>
        ) : (
          <span className="folder-row__chevron folder-row__chevron--spacer" />
        )}
        <Link to={`/folder/${node.id}`} className="folder-row__link" onClick={onNavigate}>
          <FiFolder size={15} className="folder-row__icon" />
          <span className="folder-row__name">{node.name}</span>
          <span className="folder-row__count">{node.bookmark_count}</span>
        </Link>
        <Menu as="div" className="folder-row__menu">
          <MenuButton className="icon-btn icon-btn--sm" aria-label={`Actions for ${node.name}`}>
            <FiMoreHorizontal size={15} />
          </MenuButton>
          <MenuItems anchor="bottom end" className="dropdown">
            <MenuItem>
              <button
                className="dropdown__item"
                disabled={atMaxDepth}
                onClick={() => onCreate(node.id)}
                title={atMaxDepth ? "Folders can only nest 3 levels deep" : undefined}
              >
                <FiPlus size={14} /> New subfolder
              </button>
            </MenuItem>
            <MenuItem>
              <button className="dropdown__item" onClick={() => onRename(node)}>
                <FiEdit2 size={14} /> Rename
              </button>
            </MenuItem>
            <MenuItem>
              <button className="dropdown__item" onClick={() => onMove(node)}>
                <FiMove size={14} /> Move to…
              </button>
            </MenuItem>
            <MenuItem>
              <button className="dropdown__item dropdown__item--danger" onClick={() => onDelete(node)}>
                <FiTrash2 size={14} /> Delete
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
      {hasChildren && expanded && (
        <ul role="group">
          {node.children.map((child) => (
            <FolderTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onCreate={onCreate}
              onRename={onRename}
              onMove={onMove}
              onDelete={onDelete}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
