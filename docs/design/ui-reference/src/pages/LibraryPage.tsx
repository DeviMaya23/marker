import * as React from "react";
import { AppShell } from "../components/AppShell";
import { LibraryTopBar, type SearchScope } from "../components/LibraryTopBar";
import { BookmarkList } from "../components/BookmarkList";
import { LimitReachedBanner } from "../components/States";
import { FolderFormDialog } from "../components/FolderFormDialog";
import { MoveDialog } from "../components/MoveDialog";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../lib/toast";
import { useQuery, useDebouncedValue, useSyncVersion } from "../lib/hooks";
import { createFolder, updateFolder, deleteFolder, listFolders, logout, previewFolderDeleteImpact } from "../lib/api/client";
import { navigate } from "../lib/router";
import type { Folder } from "../lib/api/types";

export function LibraryPage({ route, folderId }: { route: string; folderId?: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const foldersQuery = useQuery(["folders"], listFolders);
  const folders = foldersQuery.data?.items ?? [];

  const [query, setQuery] = React.useState("");
  const [includeNotes, setIncludeNotes] = React.useState(false);
  const [scope, setScope] = React.useState<SearchScope>(folderId ? "folder" : "all");
  const [atCap, setAtCap] = React.useState(false);
  const [refreshNonce, setRefreshNonce] = React.useState(0);

  const [folderDialog, setFolderDialog] = React.useState<{ mode: "create" | "rename"; parentId: string | null; folder?: Folder } | null>(null);
  const [movingFolder, setMovingFolder] = React.useState<Folder | null>(null);

  const debouncedQuery = useDebouncedValue(query, 300);

  React.useEffect(() => {
    setScope(folderId ? "folder" : "all");
    setQuery("");
  }, [folderId]);

  useSyncVersion(React.useCallback(() => foldersQuery.refetch(), [foldersQuery.refetch]));

  const activeFolder = folders.find((f) => f.id === folderId);
  const activeFolderName = activeFolder?.name;

  async function handleCreateFolder(parentId: string | null) {
    setFolderDialog({ mode: "create", parentId });
  }
  async function handleRenameFolder(folder: Folder) {
    setFolderDialog({ mode: "rename", parentId: folder.parent_id, folder });
  }
  async function handleMoveFolder(folder: Folder) {
    setMovingFolder(folder);
  }
  async function handleDeleteFolder(folder: Folder) {
    const countsByFolder = new Map(folders.map((f) => [f.id, f.bookmark_count]));
    const impact = previewFolderDeleteImpact(folders, countsByFolder, folder.id);
    confirm.confirm({
      title: `Delete “${folder.name}”?`,
      tone: "danger",
      confirmLabel: "Delete folder",
      description: (
        <p>
          This permanently deletes <strong>{folder.name}</strong>
          {impact.subfolders > 0 ? ` and ${impact.subfolders} subfolder${impact.subfolders === 1 ? "" : "s"}` : ""}.{" "}
          {impact.bookmarks > 0
            ? `${impact.bookmarks} bookmark${impact.bookmarks === 1 ? "" : "s"} inside will move to the trash.`
            : "There are no bookmarks inside to move to the trash."}
        </p>
      ),
      onConfirm: async () => {
        await deleteFolder(folder.id);
        toast.show("Folder deleted.");
        if (folderId && (folderId === folder.id)) navigate("/all");
        foldersQuery.refetch();
      },
    });
  }

  function handleLogout() {
    confirm.confirm({
      title: "Log out?",
      description: "This ends your session here and signs you out of the identity provider too.",
      confirmLabel: "Log out",
      onConfirm: async () => {
        await logout();
        navigate("/login");
      },
    });
  }

  const title = folderId ? activeFolderName ?? "Folder" : "All bookmarks";
  const effectiveFolderScope = scope === "folder" ? folderId : undefined;

  return (
    <AppShell
      folders={folders}
      route={route}
      activeFolderId={folderId}
      onCreateFolder={handleCreateFolder}
      onRenameFolder={handleRenameFolder}
      onMoveFolder={handleMoveFolder}
      onDeleteFolder={handleDeleteFolder}
      onLogout={handleLogout}
      topBar={
        <LibraryTopBar
          title={title}
          query={query}
          onQueryChange={setQuery}
          includeNotes={includeNotes}
          onIncludeNotesChange={setIncludeNotes}
          scope={scope}
          onScopeChange={setScope}
          scopeFolderName={folderId ? activeFolderName : undefined}
          activeFolderId={folderId}
          onSaved={() => {
            setRefreshNonce((n) => n + 1);
            foldersQuery.refetch();
          }}
        />
      }
    >
      {atCap && !debouncedQuery && <LimitReachedBanner />}
      <BookmarkList
        key={`${folderId ?? "all"}:${debouncedQuery}:${includeNotes}:${effectiveFolderScope}:${refreshNonce}`}
        filter={{ q: debouncedQuery || undefined, includeNotes, folderId: effectiveFolderScope }}
        folders={folders}
        folderName={activeFolderName}
        onCountKnown={setAtCap}
      />

      <FolderFormDialog
        open={!!folderDialog}
        onClose={() => setFolderDialog(null)}
        mode={folderDialog?.mode ?? "create"}
        initialName={folderDialog?.folder?.name}
        onSubmit={async (name) => {
          if (folderDialog?.mode === "create") {
            const created = await createFolder({ name, parent_id: folderDialog.parentId });
            foldersQuery.refetch();
            toast.show("Folder created.");
            navigate(`/folder/${created.id}`);
          } else if (folderDialog?.folder) {
            await updateFolder(folderDialog.folder.id, { name });
            foldersQuery.refetch();
            toast.show("Folder renamed.");
          }
        }}
      />
      <MoveDialog
        open={!!movingFolder}
        onClose={() => setMovingFolder(null)}
        folders={folders}
        currentFolderId={movingFolder?.parent_id ?? null}
        movingFolder={movingFolder ?? undefined}
        itemLabel="folder"
        onMove={async (parentId) => {
          if (!movingFolder) return;
          await updateFolder(movingFolder.id, { parent_id: parentId });
          foldersQuery.refetch();
          toast.show("Folder moved.");
        }}
      />
    </AppShell>
  );
}
