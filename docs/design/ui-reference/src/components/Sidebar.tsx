import * as React from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { FiBookmark, FiTrash2, FiPlus, FiUser, FiLogOut, FiHelpCircle } from "react-icons/fi";
import { FolderTree, buildFolderTree, type FolderNode } from "./FolderTree";
import { Link } from "../lib/router";
import type { Folder } from "../lib/api/types";

export function SidebarContent({
  folders,
  route,
  activeFolderId,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onNavigate,
  onLogout,
}: {
  folders: Folder[];
  route: string;
  activeFolderId?: string;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: Folder) => void;
  onMoveFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const tree: FolderNode[] = React.useMemo(() => buildFolderTree(folders), [folders]);

  return (
    <div className="sidebar">
      <div className="sidebar__brand">
        <FiBookmark size={20} />
        <span>Bookmarks</span>
      </div>

      <nav className="sidebar__scroll">
        <ul className="sidebar__top-links">
          <li>
            <Link
              to="/all"
              onClick={onNavigate}
              className={`sidebar__top-link${route === "/all" ? " sidebar__top-link--active" : ""}`}
            >
              <FiBookmark size={16} /> All bookmarks
            </Link>
          </li>
        </ul>

        <div className="sidebar__section-header">
          <span>Folders</span>
          <button className="icon-btn icon-btn--sm" aria-label="New folder at top level" onClick={() => onCreateFolder(null)}>
            <FiPlus size={15} />
          </button>
        </div>
        <FolderTree
          tree={tree}
          activeFolderId={activeFolderId}
          onCreate={onCreateFolder}
          onRename={onRenameFolder}
          onMove={onMoveFolder}
          onDelete={onDeleteFolder}
          onNavigate={onNavigate}
        />

        <ul className="sidebar__top-links sidebar__top-links--bottom">
          <li>
            <Link
              to="/trash"
              onClick={onNavigate}
              className={`sidebar__top-link${route === "/trash" ? " sidebar__top-link--active" : ""}`}
            >
              <FiTrash2 size={16} /> Trash
            </Link>
          </li>
        </ul>
      </nav>

      <div className="sidebar__account">
        <Menu as="div" className="sidebar__account-menu">
          <MenuButton className="sidebar__account-button">
            <span className="avatar" aria-hidden="true">
              <FiUser size={14} />
            </span>
            <span>Account &amp; help</span>
          </MenuButton>
          <MenuItems anchor="top start" className="dropdown">
            <MenuItem>
              <Link to="/account" className="dropdown__item" onClick={onNavigate}>
                <FiHelpCircle size={14} /> Account &amp; help
              </Link>
            </MenuItem>
            <MenuItem>
              <button className="dropdown__item" onClick={onLogout}>
                <FiLogOut size={14} /> Log out
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
    </div>
  );
}
