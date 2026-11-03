import * as React from "react";
import { FiInbox, FiAlertTriangle, FiFolder, FiSearch } from "react-icons/fi";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="state-panel" data-testid="empty-state">
      <div className="state-panel__icon">{icon ?? <FiInbox size={28} />}</div>
      <h3 className="state-panel__title">{title}</h3>
      {description && <p className="state-panel__desc">{description}</p>}
      {action && <div className="state-panel__action">{action}</div>}
    </div>
  );
}

export function EmptyLibrary() {
  return (
    <EmptyState
      icon={<FiInbox size={28} />}
      title="No bookmarks yet"
      description="Paste a URL above, or install the save-popup bookmarklet from Account & help to start saving links."
    />
  );
}

export function EmptyFolder({ folderName }: { folderName: string }) {
  return (
    <EmptyState
      icon={<FiFolder size={28} />}
      title={`“${folderName}” is empty`}
      description="Move bookmarks here, or paste a URL above while this folder is selected."
    />
  );
}

export function NoSearchResults({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<FiSearch size={28} />}
      title="No matches"
      description={`Nothing matched “${query}”. Try a different term, or turn on “include notes”.`}
    />
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<FiAlertTriangle size={28} />}
      title="Something went wrong"
      description={message ?? "That didn't work. Please try again."}
      action={
        onRetry && (
          <button className="btn btn--secondary" onClick={onRetry}>
            Try again
          </button>
        )
      }
    />
  );
}

export function LimitReachedBanner() {
  return (
    <div className="banner banner--warning" role="status">
      <strong>You've reached the 1,000 bookmark limit.</strong>{" "}
      Empty the trash or delete some bookmarks to free up room.
    </div>
  );
}

export function RowSkeleton() {
  return (
    <div className="bookmark-row bookmark-row--skeleton" aria-hidden="true">
      <div className="skeleton skeleton--square" style={{ width: 18, height: 18 }} />
      <div className="bookmark-row__main">
        <div className="skeleton skeleton--line" style={{ width: "55%" }} />
        <div className="skeleton skeleton--line" style={{ width: "30%", marginTop: 6 }} />
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div data-testid="loading-skeleton">
      {Array.from({ length: rows }).map((_, i) => (
        <RowSkeleton key={i} />
      ))}
    </div>
  );
}
