import * as React from "react";
import { Modal } from "./Modal";
import { FIELD_LIMITS, type BookmarkSummary } from "../lib/api/types";

export function EditBookmarkDialog({
  open,
  onClose,
  bookmark,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  bookmark: BookmarkSummary | null;
  onSubmit: (changes: { title: string; note: string | null }) => Promise<void>;
}) {
  const [title, setTitle] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open && bookmark) {
      setTitle(bookmark.title);
      setNote(bookmark.note ?? "");
      setError(null);
    }
  }, [open, bookmark]);

  if (!bookmark) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ title, note: note.trim() === "" ? null : note });
      onClose();
    } catch (e: any) {
      setError(e?.problem?.detail ?? "Couldn't save those changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit bookmark"
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" form="edit-bookmark-form" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <form id="edit-bookmark-form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label" htmlFor="edit-title">Title</label>
          <input
            id="edit-title"
            className="input"
            autoFocus
            value={title}
            maxLength={FIELD_LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <div className="field__meta"><span>{title.length}/{FIELD_LIMITS.title}</span></div>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="edit-note">Note</label>
          <textarea
            id="edit-note"
            className="input textarea"
            rows={4}
            value={note}
            maxLength={FIELD_LIMITS.note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note…"
          />
          <div className="field__meta"><span>{note.length}/{FIELD_LIMITS.note}</span></div>
        </div>
        {error && <p className="field__error" role="alert">{error}</p>}
      </form>
    </Modal>
  );
}
