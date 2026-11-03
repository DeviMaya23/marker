import * as React from "react";
import { RadioGroup, Radio } from "@headlessui/react";
import { FiFolder, FiCheck } from "react-icons/fi";
import { Modal } from "./Modal";
import { buildFolderTree, flattenFolderTree } from "./FolderTree";
import type { Folder } from "../lib/api/types";
import { FIELD_LIMITS } from "../lib/api/types";

interface MoveDialogProps {
  open: boolean;
  onClose: () => void;
  folders: Folder[];
  currentFolderId: string | null;
  /** When moving a folder (not a bookmark), its own id + subtree + depth budget are excluded. */
  movingFolder?: Folder;
  itemLabel: string;
  onMove: (folderId: string | null) => Promise<void>;
}

function subtreeIds(folders: Folder[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        changed = true;
      }
    }
  }
  return ids;
}

function heightOf(folders: Folder[], rootId: string): number {
  const children = (id: string) => folders.filter((f) => f.parent_id === id);
  const go = (id: string): number => {
    const kids = children(id);
    if (kids.length === 0) return 1;
    return 1 + Math.max(...kids.map((k) => go(k.id)));
  };
  return go(rootId);
}

export function MoveDialog({ open, onClose, folders, currentFolderId, movingFolder, itemLabel, onMove }: MoveDialogProps) {
  const [target, setTarget] = React.useState<string | null>(currentFolderId);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTarget(currentFolderId);
      setError(null);
    }
  }, [open, currentFolderId]);

  const excluded = movingFolder ? subtreeIds(folders, movingFolder.id) : new Set<string>();
  const movingHeight = movingFolder ? heightOf(folders, movingFolder.id) : 1;

  const tree = buildFolderTree(folders);
  const flat = flattenFolderTree(tree);

  function isDisabled(folder: Folder): boolean {
    if (movingFolder) {
      if (excluded.has(folder.id)) return true;
      if (folder.depth + movingHeight > FIELD_LIMITS.maxFolderDepth) return true;
    }
    return false;
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onMove(target);
      onClose();
    } catch (e: any) {
      setError(e?.problem?.detail ?? e?.message ?? "Couldn't move it there.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move ${itemLabel}`}
      description="Moves can't be undone."
      footer={
        <>
          <button className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={handleConfirm} disabled={busy || target === currentFolderId}>
            {busy ? "Moving…" : "Move"}
          </button>
        </>
      }
    >
      {error && <p className="field__error" role="alert">{error}</p>}
      <RadioGroup value={target} onChange={setTarget} className="move-picker">
        <Radio value={null} as="div" className="move-picker__option">
          {({ checked }) => (
            <span className={`move-picker__row${checked ? " move-picker__row--selected" : ""}`}>
              <FiFolder size={15} /> Top level
              {checked && <FiCheck size={14} className="move-picker__check" />}
            </span>
          )}
        </Radio>
        {flat.map(({ node, depth }) => {
          const disabled = isDisabled(node);
          return (
            <Radio key={node.id} value={node.id} as="div" disabled={disabled} className="move-picker__option">
              {({ checked }) => (
                <span
                  className={`move-picker__row${checked ? " move-picker__row--selected" : ""}${disabled ? " move-picker__row--disabled" : ""}`}
                  style={{ paddingLeft: 12 + depth * 18 }}
                  title={disabled ? "Can't move here (would nest folders too deep, or is inside the item being moved)" : undefined}
                >
                  <FiFolder size={15} /> {node.name}
                  {checked && <FiCheck size={14} className="move-picker__check" />}
                </span>
              )}
            </Radio>
          );
        })}
      </RadioGroup>
    </Modal>
  );
}
