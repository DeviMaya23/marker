import * as React from "react";
import { FiTrash2 } from "react-icons/fi";
import { AppShell } from "../components/AppShell";
import { TrashRow } from "../components/TrashRow";
import { EmptyState, ErrorState, ListSkeleton } from "../components/States";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../lib/toast";
import { useQuery, useSyncVersion } from "../lib/hooks";
import { listFolders, listBookmarks, restoreBookmark, emptyTrash, logout } from "../lib/api/client";
import { navigate } from "../lib/router";

export function TrashPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const foldersQuery = useQuery(["folders"], listFolders);
  const trashQuery = useQuery(["trash"], () => listBookmarks({ trashed: true }));
  const items = trashQuery.data?.items ?? [];

  useSyncVersion(React.useCallback(() => {
    foldersQuery.refetch();
    trashQuery.refetch();
  }, [foldersQuery.refetch, trashQuery.refetch]));

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

  function handleEmptyTrash() {
    confirm.confirm({
      title: "Empty trash?",
      tone: "danger",
      confirmLabel: "Empty trash",
      requireTypedPhrase: "empty trash",
      description: (
        <p>
          This permanently deletes {items.length} bookmark{items.length === 1 ? "" : "s"} in the trash. This
          can't be undone.
        </p>
      ),
      onConfirm: async () => {
        const { deleted } = await emptyTrash();
        toast.show(`Permanently deleted ${deleted} bookmark${deleted === 1 ? "" : "s"}.`);
        trashQuery.refetch();
      },
    });
  }

  return (
    <AppShell
      folders={foldersQuery.data?.items ?? []}
      route="/trash"
      onCreateFolder={() => {}}
      onRenameFolder={() => {}}
      onMoveFolder={() => {}}
      onDeleteFolder={() => {}}
      onLogout={handleLogout}
      topBar={
        <div className="library-topbar">
          <div className="library-topbar__row trash-topbar__row">
            <h1 className="library-topbar__title">Trash</h1>
            <button className="btn btn--danger-outline" onClick={handleEmptyTrash} disabled={items.length === 0}>
              <FiTrash2 size={14} /> Empty trash
            </button>
          </div>
        </div>
      }
    >
      {trashQuery.isLoading ? (
        <ListSkeleton />
      ) : trashQuery.isError ? (
        <ErrorState onRetry={trashQuery.refetch} />
      ) : items.length === 0 ? (
        <EmptyState icon={<FiTrash2 size={28} />} title="Trash is empty" description="Deleted bookmarks show up here until you empty the trash." />
      ) : (
        <div className="bookmark-list" role="list">
          {items.map((b) => (
            <TrashRow
              key={b.id}
              bookmark={b}
              onRestore={async () => {
                await restoreBookmark(b.id);
                toast.show("Restored to the top level.");
                trashQuery.refetch();
                foldersQuery.refetch();
              }}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}
