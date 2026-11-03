// Types mirroring openapi.yaml (source of truth). Field names and shapes match
// the schemas there (BookmarkSummary, BookmarkDetail, Folder, Problem, ...) so a
// future swap from the mock client to the real HTTP API changes lib/api/client.ts
// only, not any component.

export type FetchStatus = "pending" | "ok" | "failed";

export type ErrorCode =
  | "unauthenticated"
  | "csrf_failed"
  | "not_found"
  | "invalid_url"
  | "duplicate_bookmark"
  | "bookmark_limit_reached"
  | "folder_depth_exceeded"
  | "folder_cycle"
  | "folder_name_conflict"
  | "bookmark_in_trash"
  | "bookmark_not_in_trash"
  | "validation_error"
  | "payload_too_large"
  | "rate_limited";

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: ErrorCode;
  // duplicate_bookmark extras
  existing_bookmark_id?: string;
  in_trash?: boolean;
  // validation extras
  errors?: Array<{ field: string; code: string }>;
  // rate_limited extra
  retry_after?: number;
}

export class ApiError extends Error {
  problem: Problem;
  constructor(problem: Problem) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
  }
}

export interface BookmarkSummary {
  id: string;
  url: string;
  title: string;
  note: string | null;
  folder_id: string | null;
  favicon_url: string | null;
  fetch_status: FetchStatus;
  created_at: string;
  deleted_at: string | null;
}

export interface BookmarkDetail extends BookmarkSummary {
  content: string | null;
  updated_at: string;
}

export interface BookmarkPage {
  items: BookmarkSummary[];
  next_cursor: string | null;
}

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  depth: number;
  bookmark_count: number;
  created_at: string;
  updated_at: string;
}

export const FIELD_LIMITS = {
  url: 2048,
  title: 300,
  note: 500,
  folderName: 100,
  bookmarkCap: 1000,
  maxFolderDepth: 3,
} as const;
