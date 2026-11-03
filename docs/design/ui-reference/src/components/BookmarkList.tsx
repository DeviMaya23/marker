import * as React from "react";
import { listBookmarks, deleteBookmark, restoreBookmark, updateBookmark, __debugBookmarkCount } from "../lib/api/client";
import { useSyncVersion } from "../lib/hooks";
import { useToast } from "../lib/toast";
import { BookmarkRow } from "./BookmarkRow";
import { EmptyLibrary, EmptyFolder, NoSearchResults, ErrorState, ListSkeleton } from "./States";
import { EditBookmarkDialog } from "./EditBookmarkDialog";
import { MoveDialog } from "./MoveDialog";
import type { BookmarkSummary, Folder } from "../lib/api/types";
import { FIELD_LIMITS } from "../lib/api/types";

export interface BookmarkListFilter {
  q?: string;
  includeNotes?: boolean;
  folderId?: string;
}

export function BookmarkList({
  filter,
  folders,
  folderName,
  onCountKnown,
}: {
  filter: BookmarkListFilter;
  folders: Folder[];
  folderName?: string;
  onCountKnown?: (atCap: boolean) => void;
}) {
  const toast = useToast();
  const [items, setItems] = React.useState<BookmarkSummary[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isFetchingMore, setIsFetchingMore] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  const [editing, setEditing] = React.useState<BookmarkSummary | null>(null);
  const [moving, setMoving] = React.useState<BookmarkSummary | null>(null);

  const filterKey = JSON.stringify(filter);
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const page = await listBookmarks({
        q: filter.q,
        include_notes: filter.includeNotes,
        folder_id: filter.folderId,
      });
      setItems(page.items);
      setNextCursor(page.next_cursor);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [filterKey]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  React.useEffect(() => {
    __debugBookmarkCount().then((n) => onCountKnown?.(n >= FIELD_LIMITS.bookmarkCap));
  }, [items.length, onCountKnown]);

  const loadMore = React.useCallback(async () => {
    if (!nextCursor || isFetchingMore) return;
    setIsFetchingMore(true);
    try {
      const page = await listBookmarks({
        q: filter.q,
        include_notes: filter.includeNotes,
        folder_id: filter.folderId,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.next_cursor);
    } finally {
      setIsFetchingMore(false);
    }
  }, [nextCursor, isFetchingMore, filterKey]);

  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [loadMore]);

  // Gentle background refresh on sync changes: re-fetch a snapshot covering the
  // rows already on screen, in place, so scroll position doesn't jump (per
  // brief, "Behaviour that affects layout").
  useSyncVersion(
    React.useCallback(async () => {
      const count = Math.max(items.length, 50);
      try {
        const page = await listBookmarks({
          q: filter.q,
          include_notes: filter.includeNotes,
          folder_id: filter.folderId,
          limit: count,
        });
        setItems(page.items);
        setNextCursor(page.next_cursor);
      } catch {
        // ignore background refresh errors
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterKey, items.length]),
  );

  async function handleDelete(b: BookmarkSummary) {
    setItems((prev) => prev.filter((x) => x.id !== b.id));
    try {
      await deleteBookmark(b.id);
      toast.show("Moved to trash.", {
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await restoreBookmark(b.id);
              load();
            } catch {
              toast.show("Couldn't undo — it may have been trashed elsewhere.", { tone: "error" });
            }
          },
        },
      });
    } catch (e: any) {
      toast.show(e?.problem?.detail ?? "Couldn't delete that.", { tone: "error" });
      load();
    }
  }

  if (isLoading) return <ListSkeleton />;
  if (error) return <ErrorState onRetry={load} />;
  if (items.length === 0) {
    if (filter.q) return <NoSearchResults query={filter.q} />;
    if (filter.folderId) return <EmptyFolder folderName={folderName ?? "This folder"} />;
    return <EmptyLibrary />;
  }

  return (
    <>
      <div className="bookmark-list" role="list">
        {items.map((b) => (
          <BookmarkRow
            key={b.id}
            bookmark={b}
            onEdit={() => setEditing(b)}
            onMove={() => setMoving(b)}
            onDelete={() => handleDelete(b)}
          />
        ))}
      </div>
      <div ref={sentinelRef} className="list-sentinel" aria-hidden="true" />
      {isFetchingMore && <ListSkeleton rows={2} />}

      <EditBookmarkDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        bookmark={editing}
        onSubmit={async (changes) => {
          if (!editing) return;
          const updated = await updateBookmark(editing.id, changes);
          setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        }}
      />
      <MoveDialog
        open={!!moving}
        onClose={() => setMoving(null)}
        folders={folders}
        currentFolderId={moving?.folder_id ?? null}
        itemLabel="bookmark"
        onMove={async (folderId) => {
          if (!moving) return;
          await updateBookmark(moving.id, { folder_id: folderId });
          setItems((prev) => prev.filter((x) => x.id !== moving.id || !filter.folderId));
          toast.show("Moved.");
        }}
      />
    </>
  );
}
