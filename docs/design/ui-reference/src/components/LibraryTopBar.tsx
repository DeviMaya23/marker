import * as React from "react";
import { FiSearch, FiPlus, FiX } from "react-icons/fi";
import { createBookmark } from "../lib/api/client";
import { ApiError, FIELD_LIMITS } from "../lib/api/types";
import { useToast } from "../lib/toast";
import { navigate } from "../lib/router";

export type SearchScope = "all" | "folder";

export function LibraryTopBar({
  title,
  query,
  onQueryChange,
  includeNotes,
  onIncludeNotesChange,
  scope,
  onScopeChange,
  scopeFolderName,
  activeFolderId,
  onSaved,
}: {
  title: string;
  query: string;
  onQueryChange: (q: string) => void;
  includeNotes: boolean;
  onIncludeNotesChange: (v: boolean) => void;
  scope: SearchScope;
  onScopeChange: (s: SearchScope) => void;
  scopeFolderName?: string;
  activeFolderId?: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [addUrl, setAddUrl] = React.useState("");
  const [addError, setAddError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addUrl.trim()) return;
    setSaving(true);
    setAddError(null);
    try {
      await createBookmark({ url: addUrl.trim(), folder_id: activeFolderId });
      setAddUrl("");
      toast.show("Saved.", { tone: "success" });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.problem.code === "duplicate_bookmark") {
          if (err.problem.in_trash) {
            setAddError("This link is already in your trash.");
          } else {
            setAddError("This URL is already saved.");
            toast.show("Already saved — opening it.", {
              action: { label: "View", onClick: () => navigate(`/bookmarks/${err.problem.existing_bookmark_id}`) },
            });
          }
        } else if (err.problem.code === "bookmark_limit_reached") {
          setAddError("You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.");
        } else if (err.problem.code === "invalid_url") {
          setAddError("Only http and https links can be saved.");
        } else if (err.problem.code === "rate_limited") {
          setAddError(`Too many saves — try again in about ${err.problem.retry_after ?? 30}s.`);
        } else if (err.problem.code === "validation_error") {
          setAddError(err.problem.detail ?? "That URL is too long.");
        } else {
          setAddError(err.problem.detail ?? "Couldn't save that link.");
        }
      } else {
        setAddError("Couldn't save that link.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="library-topbar">
      <div className="library-topbar__row">
        <h1 className="library-topbar__title">{title}</h1>
      </div>
      <div className="library-topbar__row library-topbar__controls">
        <div className="search-field">
          <FiSearch size={15} className="search-field__icon" />
          <input
            type="search"
            placeholder="Search title, URL and page content…"
            value={query}
            maxLength={FIELD_LIMITS.title}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search bookmarks"
          />
        </div>

        <div className="segmented" role="radiogroup" aria-label="Search scope">
          <button
            type="button"
            role="radio"
            aria-checked={scope === "all"}
            className={`segmented__btn${scope === "all" ? " segmented__btn--active" : ""}`}
            onClick={() => onScopeChange("all")}
          >
            All bookmarks
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === "folder"}
            disabled={!scopeFolderName}
            className={`segmented__btn${scope === "folder" ? " segmented__btn--active" : ""}`}
            title={scopeFolderName ? `“${scopeFolderName}” and its subfolders` : "Open a folder to scope search to it"}
            onClick={() => onScopeChange("folder")}
          >
            {scopeFolderName ? `“${scopeFolderName}” & subfolders` : "This folder & subfolders"}
          </button>
        </div>

        <label className="switch-field">
          <input
            type="checkbox"
            checked={includeNotes}
            onChange={(e) => onIncludeNotesChange(e.target.checked)}
          />
          <span className="switch" aria-hidden="true" />
          Include notes
        </label>
      </div>

      <form className="library-topbar__row add-url-form" onSubmit={handleAdd}>
        <div className="add-url-form__field">
          <FiPlus size={15} className="add-url-form__icon" />
          <input
            type="url"
            inputMode="url"
            placeholder="Paste a URL to save it…"
            value={addUrl}
            maxLength={FIELD_LIMITS.url}
            onChange={(e) => {
              setAddUrl(e.target.value);
              if (addError) setAddError(null);
            }}
            aria-label="URL to save"
            aria-invalid={!!addError}
          />
          {addUrl && (
            <button
              type="button"
              className="add-url-form__clear"
              aria-label="Clear"
              onClick={() => {
                setAddUrl("");
                setAddError(null);
              }}
            >
              <FiX size={14} />
            </button>
          )}
        </div>
        <button className="btn btn--primary" type="submit" disabled={saving || !addUrl.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </form>
      {addError && <p className="field__error add-url-form__error" role="alert">{addError}</p>}
    </div>
  );
}
