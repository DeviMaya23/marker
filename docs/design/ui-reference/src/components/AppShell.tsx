import * as React from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import { FiMenu, FiX } from "react-icons/fi";
import { SidebarContent } from "./Sidebar";
import type { Folder } from "../lib/api/types";

export function AppShell({
  folders,
  route,
  activeFolderId,
  onCreateFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onLogout,
  topBar,
  children,
}: {
  folders: Folder[];
  route: string;
  activeFolderId?: string;
  onCreateFolder: (parentId: string | null) => void;
  onRenameFolder: (folder: Folder) => void;
  onMoveFolder: (folder: Folder) => void;
  onDeleteFolder: (folder: Folder) => void;
  onLogout: () => void;
  topBar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const sidebarProps = {
    folders,
    route,
    activeFolderId,
    onCreateFolder,
    onRenameFolder,
    onMoveFolder,
    onDeleteFolder,
    onLogout,
  };

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar app-shell__sidebar--desktop">
        <SidebarContent {...sidebarProps} />
      </aside>

      <Dialog open={drawerOpen} onClose={() => setDrawerOpen(false)} className="drawer-root">
        <div className="modal-overlay" aria-hidden="true" />
        <DialogPanel className="drawer-panel">
          <button className="icon-btn drawer-panel__close" aria-label="Close menu" onClick={() => setDrawerOpen(false)}>
            <FiX size={18} />
          </button>
          <SidebarContent {...sidebarProps} onNavigate={() => setDrawerOpen(false)} />
        </DialogPanel>
      </Dialog>

      <div className="app-shell__main">
        <div className="app-shell__topbar">
          <button
            className="icon-btn app-shell__menu-btn"
            aria-label="Open menu"
            onClick={() => setDrawerOpen(true)}
          >
            <FiMenu size={20} />
          </button>
          <div className="app-shell__topbar-content">{topBar}</div>
        </div>
        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
