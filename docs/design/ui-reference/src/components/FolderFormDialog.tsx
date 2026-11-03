import * as React from "react";
import { Modal } from "./Modal";
import { FIELD_LIMITS } from "../lib/api/types";

export function FolderFormDialog({
  open,
  onClose,
  mode,
  initialName,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "rename";
  initialName?: string;
  onSubmit: (name: string) => Promise<void>;
}) {
  const [name, setName] = React.useState(initialName ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialName ?? "");
      setError(null);
    }
  }, [open, initialName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the folder a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      onClose();
    } catch (e: any) {
      const code = e?.problem?.code;
      if (code === "folder_name_conflict") setError("A folder with this name already exists here.");
      else if (code === "folder_depth_exceeded") setError("Folders can only be nested 3 levels deep.");
      else setError(e?.problem?.detail ?? "Couldn't save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New folder" : "Rename folder"}
      footer={
        <>
          <button className="btn btn--ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" type="submit" form="folder-form" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Create" : "Rename"}
          </button>
        </>
      }
    >
      <form id="folder-form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field__label" htmlFor="folder-name">
            Folder name
          </label>
          <input
            id="folder-name"
            className="input"
            autoFocus
            value={name}
            maxLength={FIELD_LIMITS.folderName}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={!!error}
          />
          <div className="field__meta">
            <span>{name.length}/{FIELD_LIMITS.folderName}</span>
          </div>
          {error && <p className="field__error" role="alert">{error}</p>}
        </div>
      </form>
    </Modal>
  );
}
