import * as React from "react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { FiExternalLink, FiMoreHorizontal, FiEdit2, FiMove, FiTrash2, FiClock, FiAlertCircle, FiMessageSquare } from "react-icons/fi";
import { Favicon } from "./Favicon";
import { Link } from "../lib/router";
import { formatDate } from "../lib/format";
import { hostOf } from "../lib/api/normalize";
import type { BookmarkSummary } from "../lib/api/types";

export function FetchStatusBadge({ status }: { status: BookmarkSummary["fetch_status"] }) {
  if (status === "ok") return null;
  if (status === "pending") {
    return (
      <span className="status-chip status-chip--pending" title="Still fetching the page">
        <FiClock size={11} /> Fetching…
      </span>
    );
  }
  return (
    <span className="status-chip status-chip--failed" title="Couldn't fetch this page; the link still works">
      <FiAlertCircle size={11} /> Fetch failed
    </span>
  );
}

export function BookmarkRow({
  bookmark,
  onEdit,
  onMove,
  onDelete,
}: {
  bookmark: BookmarkSummary;
  onEdit: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const displayTitle = bookmark.title || hostOf(bookmark.url) || bookmark.url;
  return (
    <div className="bookmark-row">
      <Favicon url={bookmark.url} faviconUrl={bookmark.favicon_url} />
      <Link to={`/bookmarks/${bookmark.id}`} className="bookmark-row__main">
        <div className="bookmark-row__title-line">
          <span className="bookmark-row__title">{displayTitle}</span>
          <FetchStatusBadge status={bookmark.fetch_status} />
        </div>
        <div className="bookmark-row__meta-line">
          <span className="bookmark-row__host">{hostOf(bookmark.url)}</span>
          <span className="bookmark-row__dot">·</span>
          <span className="bookmark-row__date">{formatDate(bookmark.created_at)}</span>
          {bookmark.note && (
            <>
              <span className="bookmark-row__dot">·</span>
              <span className="bookmark-row__note-preview">
                <FiMessageSquare size={11} /> {bookmark.note.slice(0, 60)}
              </span>
            </>
          )}
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
        <Menu as="div">
          <MenuButton className="icon-btn icon-btn--sm" aria-label="More actions">
            <FiMoreHorizontal size={15} />
          </MenuButton>
          <MenuItems anchor="bottom end" className="dropdown">
            <MenuItem>
              <button className="dropdown__item" onClick={onEdit}>
                <FiEdit2 size={14} /> Edit title &amp; note
              </button>
            </MenuItem>
            <MenuItem>
              <button className="dropdown__item" onClick={onMove}>
                <FiMove size={14} /> Move to…
              </button>
            </MenuItem>
            <MenuItem>
              <button className="dropdown__item dropdown__item--danger" onClick={onDelete}>
                <FiTrash2 size={14} /> Delete
              </button>
            </MenuItem>
          </MenuItems>
        </Menu>
      </div>
    </div>
  );
}
