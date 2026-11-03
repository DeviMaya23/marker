import * as React from "react";
import { FiExternalLink, FiRotateCcw } from "react-icons/fi";
import { Favicon } from "./Favicon";
import { Link } from "../lib/router";
import { formatDate } from "../lib/format";
import { hostOf } from "../lib/api/normalize";
import type { BookmarkSummary } from "../lib/api/types";

export function TrashRow({ bookmark, onRestore }: { bookmark: BookmarkSummary; onRestore: () => void }) {
  const displayTitle = bookmark.title || hostOf(bookmark.url) || bookmark.url;
  return (
    <div className="bookmark-row bookmark-row--trashed">
      <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} />
      <Link to={`/bookmarks/${bookmark.id}`} className="bookmark-row__main">
        <div className="bookmark-row__title-line">
          <span className="bookmark-row__title">{displayTitle}</span>
        </div>
        <div className="bookmark-row__meta-line">
          <span className="bookmark-row__host">{hostOf(bookmark.url)}</span>
          <span className="bookmark-row__dot">·</span>
          <span className="bookmark-row__date">trashed {formatDate(bookmark.deleted_at!)}</span>
        </div>
      </Link>
      <div className="bookmark-row__actions">
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="icon-btn icon-btn--sm"
          aria-label="Open original link"
          title="Open original link"
        >
          <FiExternalLink size={15} />
        </a>
        <button className="btn btn--secondary btn--sm" onClick={onRestore}>
          <FiRotateCcw size={13} /> Restore
        </button>
      </div>
    </div>
  );
}
