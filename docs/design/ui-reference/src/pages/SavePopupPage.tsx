import * as React from "react";
import { FiBookmark, FiCheck } from "react-icons/fi";
import { createBookmark, isLoggedIn, login } from "../lib/api/client";
import { listFolders } from "../lib/api/client";
import { useQuery } from "../lib/hooks";
import { flattenFolderTree, buildFolderTree } from "../components/FolderTree";
import { ApiError, FIELD_LIMITS } from "../lib/api/types";
import { navigate } from "../lib/router";

type Phase = "checking-auth" | "needs-login" | "form" | "saving" | "saved" | "duplicate" | "error";

export function SavePopupPage({ url, title: initialTitle }: { url: string; title?: string }) {
  const foldersQuery = useQuery(["folders"], listFolders);
  const [phase, setPhase] = React.useState<Phase>("checking-auth");
  const [title, setTitle] = React.useState(initialTitle ?? "");
  const [folderId, setFolderId] = React.useState<string>("");
  const [message, setMessage] = React.useState<string>("");
  const [canCloseFallback, setCanCloseFallback] = React.useState(false);
  const saveBtnRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    isLoggedIn().then((ok) => setPhase(ok ? "form" : "needs-login"));
  }, []);

  React.useEffect(() => {
    if (phase === "form") {
      saveBtnRef.current?.focus();
    }
  }, [phase]);

  const validUrl = (() => {
    try {
      const u = new URL(url);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  })();

  function attemptClose() {
    window.close();
    setTimeout(() => setCanCloseFallback(true), 350);
  }

  async function handleSave() {
    setPhase("saving");
    try {
      await createBookmark({ url, title: title.trim() || undefined, folder_id: folderId || undefined });
      setPhase("saved");
      setTimeout(attemptClose, 900);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.problem.code === "duplicate_bookmark") {
          setMessage(e.problem.in_trash ? "This link is in your trash." : "This link is already saved.");
          setPhase("duplicate");
          return;
        }
        if (e.problem.code === "invalid_url") {
          setMessage("Only http and https links can be saved.");
        } else if (e.problem.code === "bookmark_limit_reached") {
          setMessage("You're at the 1,000 bookmark limit. Empty the trash or delete some bookmarks first.");
        } else if (e.problem.code === "rate_limited") {
          setMessage(`Too many saves — try again in about ${e.problem.retry_after ?? 30}s.`);
        } else {
          setMessage(e.problem.detail ?? "Couldn't save that link.");
        }
      } else {
        setMessage("Couldn't save that link.");
      }
      setPhase("error");
    }
  }

  function handleCancel() {
    attemptClose();
  }

  function handleDismissError() {
    setPhase("form");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (phase === "error" || phase === "duplicate") handleDismissError();
      else handleCancel();
    } else if (e.key === "Enter") {
      if (phase === "form") {
        e.preventDefault();
        handleSave();
      } else if (phase === "error" || phase === "duplicate") {
        e.preventDefault();
        handleDismissError();
      }
    }
  }

  const folders = foldersQuery.data?.items ?? [];
  const flatFolders = flattenFolderTree(buildFolderTree(folders));

  return (
    <div className="save-popup" onKeyDown={handleKeyDown}>
      <div className="save-popup__header">
        <FiBookmark size={16} />
        <span>Save bookmark</span>
      </div>

      {phase === "checking-auth" && <div className="save-popup__body save-popup__loading">Checking your session…</div>}

      {phase === "needs-login" && (
        <div className="save-popup__body">
          <p>You're logged out. Log in to continue saving this page.</p>
          <div className="save-popup__footer">
            <button
              className="btn btn--primary"
              onClick={async () => {
                await login();
                setPhase("form");
              }}
            >
              Log in
            </button>
          </div>
        </div>
      )}

      {(phase === "form" || phase === "saving") && (
        <div className="save-popup__body">
          {!validUrl && (
            <p className="field__error" role="alert">Only http and https links can be saved.</p>
          )}
          <div className="field">
            <label className="field__label">URL</label>
            <div className="save-popup__url" title={url}>{url}</div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="save-title">Title</label>
            <input
              id="save-title"
              className="input"
              autoComplete="off"
              value={title}
              maxLength={FIELD_LIMITS.title}
              disabled={phase === "saving"}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="save-folder">Folder</label>
            <select
              id="save-folder"
              className="input"
              value={folderId}
              disabled={phase === "saving"}
              onChange={(e) => setFolderId(e.target.value)}
            >
              <option value="">Top level</option>
              {flatFolders.map(({ node, depth }) => (
                <option key={node.id} value={node.id}>
                  {"  ".repeat(depth)}{node.name}
                </option>
              ))}
            </select>
          </div>
          <div className="save-popup__footer">
            <button className="btn btn--ghost" onClick={handleCancel} disabled={phase === "saving"}>
              Cancel
            </button>
            <button
              ref={saveBtnRef}
              className="btn btn--primary"
              onClick={handleSave}
              disabled={phase === "saving" || !validUrl}
            >
              {phase === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {phase === "saved" && (
        <div className="save-popup__body save-popup__saved">
          <FiCheck size={22} />
          <span>Saved</span>
        </div>
      )}

      {(phase === "duplicate" || phase === "error") && (
        <div className="save-popup__body">
          <div className={`banner ${phase === "duplicate" ? "banner--info" : "banner--error"}`} role="alert">
            {message}
          </div>
          <div className="save-popup__footer">
            <button className="btn btn--primary" onClick={handleDismissError} autoFocus>
              OK
            </button>
          </div>
        </div>
      )}

      {canCloseFallback && (
        <div className="save-popup__cant-close" role="status">
          You can close this tab now.
        </div>
      )}
    </div>
  );
}
