import * as React from "react";
import { FiExternalLink, FiTrash2, FiMove, FiRotateCcw, FiClock, FiAlertCircle, FiArrowLeft } from "react-icons/fi";
import { AppShell } from "../components/AppShell";
import { MoveDialog } from "../components/MoveDialog";
import { FetchStatusBadge } from "../components/BookmarkRow";
import { ErrorState } from "../components/States";
import { useConfirm } from "../components/ConfirmDialog";
import { useToast } from "../lib/toast";
import { useQuery, useSyncVersion, useDebouncedValue } from "../lib/hooks";
import {
  listFolders,
  getBookmark,
  updateBookmark,
  deleteBookmark,
  restoreBookmark,
  logout,
} from "../lib/api/client";
import { Favicon } from "../components/Favicon";
import { Link, navigate } from "../lib/router";
import { hostOf } from "../lib/api/normalize";
import { formatDateTime } from "../lib/format";
import { FIELD_LIMITS } from "../lib/api/types";

export function BookmarkDetailPage({ id }: { id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const foldersQuery = useQuery(["folders"], listFolders);
  const detailQuery = useQuery(["bookmark", id], () => getBookmark(id));
  const bookmark = detailQuery.data;
  const folders = foldersQuery.data?.items ?? [];

  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [moving, setMoving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    if (bookmark) {
      setTitle(bookmark.title);
      setNote(bookmark.note ?? "");
      setDirty(false);
    }
  }, [bookmark?.id, bookmark?.title, bookmark?.note]);

  useSyncVersion(
    React.useCallback(() => {
      foldersQuery.refetch();
      if (!dirty) detailQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]),
  );

  const debouncedTitle = useDebouncedValue(title, 500);
  const debouncedNote = useDebouncedValue(note, 500);
  const savingRef = React.useRef(false);

  React.useEffect(() => {
    if (!bookmark || bookmark.deleted_at || !dirty) return;
    if (debouncedTitle === bookmark.title && (debouncedNote || null) === bookmark.note) return;
    (async () => {
      savingRef.current = true;
      try {
        await updateBookmark(bookmark.id, {
          title: debouncedTitle,
          note: debouncedNote.trim() === "" ? null : debouncedNote,
        });
        setDirty(false);
      } catch (e: any) {
        toast.show(e?.problem?.detail ?? "Couldn't save your changes.", { tone: "error" });
      } finally {
        savingRef.current = false;
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [debouncedTitle, debouncedNote]);

  function handleLogout() {
    confirm.confirm({
      title: "Log out?",
      confirmLabel: "Log out",
      onConfirm: async () => {
        await logout();
        navigate("/login");
      },
    });
  }

  function handleDelete() {
    if (!bookmark) return;
    confirm.confirm({
      title: "Delete this bookmark?",
      description: "It will move to the trash. You can restore it later.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteBookmark(bookmark.id);
        toast.show("Moved to trash.");
        navigate("/all");
      },
    });
  }

  const content = (() => {
    if (foldersQuery.isLoading && detailQuery.isLoading) return null;
    if (detailQuery.isError) return <ErrorState onRetry={detailQuery.refetch} />;
    if (!bookmark) return null;

    const folder = folders.find((f) => f.id === bookmark.folder_id);
    const isTrashed = !!bookmark.deleted_at;

    return (
      <div className="detail-page">
        <Link to="/all" className="detail-page__back">
          <FiArrowLeft size={14} /> Back
        </Link>

        {isTrashed && (
          <div className="banner banner--trashed" role="status">
            <strong>In trash.</strong> This bookmark is read-only. Restore it to edit or move it.
            <button className="btn btn--secondary btn--sm" style={{ marginLeft: "auto" }} onClick={async () => {
              await restoreBookmark(bookmark.id);
              toast.show("Restored to the top level.");
              detailQuery.refetch();
              foldersQuery.refetch();
            }}>
              <FiRotateCcw size={13} /> Restore
            </button>
          </div>
        )}

        <header className="detail-page__header">
          <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} size={28} />
          <div className="detail-page__title-block">
            {isTrashed ? (
              <h1 className="detail-page__title-readonly">{bookmark.title || hostOf(bookmark.url)}</h1>
            ) : (
              <input
                className="detail-page__title-input"
                value={title}
                maxLength={FIELD_LIMITS.title}
                placeholder={bookmark.fetch_status === "pending" ? "Fetching a title…" : "Untitled"}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setDirty(true);
                }}
                aria-label="Bookmark title"
              />
            )}
            <div className="detail-page__url-row">
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="detail-page__url">
                {bookmark.url}
              </a>
              <a href={bookmark.url} target="_blank" rel="noopener noreferrer" className="icon-btn icon-btn--sm" aria-label="Open original link">
                <FiExternalLink size={14} />
              </a>
            </div>
          </div>
        </header>

        <div className="detail-page__facts">
          <div className="detail-page__fact">
            <span className="detail-page__fact-label">Folder</span>
            <button className="link-button" disabled={isTrashed} onClick={() => setMoving(true)}>
              {folder ? folder.name : "Top level"}
            </button>
          </div>
          <div className="detail-page__fact">
            <span className="detail-page__fact-label">Saved</span>
            <span>{formatDateTime(bookmark.created_at)}</span>
          </div>
          <div className="detail-page__fact">
            <span className="detail-page__fact-label">Fetch status</span>
            {bookmark.fetch_status === "ok" ? (
              <span className="status-chip status-chip--ok">Complete</span>
            ) : (
              <FetchStatusBadge status={bookmark.fetch_status} />
            )}
          </div>
        </div>

        {!isTrashed && (
          <div className="detail-page__actions">
            <button className="btn btn--secondary" onClick={() => setMoving(true)}>
              <FiMove size={14} /> Move to…
            </button>
            <button className="btn btn--danger-outline" onClick={handleDelete}>
              <FiTrash2 size={14} /> Delete
            </button>
          </div>
        )}

        <div className="detail-page__note">
          <label className="field__label" htmlFor="detail-note">Note</label>
          <textarea
            id="detail-note"
            className="input textarea"
            rows={3}
            disabled={isTrashed}
            value={isTrashed ? bookmark.note ?? "" : note}
            maxLength={FIELD_LIMITS.note}
            placeholder={isTrashed ? "No note." : "Add a note…"}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
          />
          {!isTrashed && (
            <div className="field__meta">
              <span>{note.length}/{FIELD_LIMITS.note}</span>
            </div>
          )}
        </div>

        <div className="detail-page__content">
          <h2 className="detail-page__content-heading">Page text</h2>
          {bookmark.fetch_status === "pending" && (
            <p className="detail-page__content-placeholder">
              <FiClock size={14} /> Still fetching this page. The text will appear here once it's ready.
            </p>
          )}
          {bookmark.fetch_status === "failed" && (
            <p className="detail-page__content-placeholder">
              <FiAlertCircle size={14} /> We couldn't fetch this page's text. The link above still works.
            </p>
          )}
          {bookmark.fetch_status === "ok" && (
            <div className="detail-page__content-body">{bookmark.content}</div>
          )}
        </div>
      </div>
    );
  })();

  return (
    <AppShell
      folders={folders}
      route="/bookmark-detail"
      onCreateFolder={() => {}}
      onRenameFolder={() => {}}
      onMoveFolder={() => {}}
      onDeleteFolder={() => {}}
      onLogout={handleLogout}
      topBar={<div className="library-topbar"><h1 className="library-topbar__title">Bookmark</h1></div>}
    >
      {content}
      {bookmark && (
        <MoveDialog
          open={moving}
          onClose={() => setMoving(false)}
          folders={folders}
          currentFolderId={bookmark.folder_id}
          itemLabel="bookmark"
          onMove={async (folderId) => {
            await updateBookmark(bookmark.id, { folder_id: folderId });
            toast.show("Moved.");
            detailQuery.refetch();
            foldersQuery.refetch();
          }}
        />
      )}
    </AppShell>
  );
}
