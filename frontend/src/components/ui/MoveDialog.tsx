import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Folder as FolderIcon, House } from 'lucide-react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { isUnauthorized } from '../../lib/api/ApiError'
import type { Folder } from '../../lib/api/folders'
import { buildFolderTree } from '../../lib/folders/buildFolderTree'
import { moveTargets } from '../../lib/folders/moveTargets'
import { Banner } from './Banner'
import { Dialog } from './Dialog'

export const DISABLED_ROW_TITLE =
  "Can't move here: it is inside this folder, or folders would be nested more than 3 levels deep."

/** A failure of the move call, as the dialog shows it. */
export type MoveFailure = { message: string }

type Props = {
  open: boolean
  /** The folder being moved; absent when a bookmark is being moved. */
  folder?: Folder
  /** What the user is moving: the bookmark's title (or host), or the folder's name. */
  itemName: string
  /** The folder it is in now, or `null` at the top level. */
  currentLocation: string | null
  /** The folder list as `useFolders()` gives it. */
  folders: { items: readonly Folder[] | undefined; pending: boolean; error: unknown; retry: () => void }
  /** A move is in flight. */
  working: boolean
  failure: MoveFailure | null
  /** Moves to `target` (`null`: the top level); resolves true when it was moved (the dialog then closes). */
  onConfirm: (target: Folder | null) => Promise<boolean>
  /** Esc, Cancel, the backdrop and a successful move all end up here. */
  onClose: () => void
}

/** The radio group's value for "Top level" (a folder id is never empty). */
const TOP = ''

/**
 * Choose where a bookmark or a folder goes. Presentational: it is told what is moving, where it
 * is now, the folder list and the state of the call. The selection starts from the current
 * location every time the dialog opens.
 */
export function MoveDialog({
  open,
  folder,
  itemName,
  currentLocation,
  folders,
  working,
  failure,
  onConfirm,
  onClose,
}: Props) {
  const [selected, setSelected] = useState<string | null>(currentLocation)
  // Each opening starts from the current location, not from an earlier selection.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSelected(currentLocation)
  }

  const items = folders.items
  const tree = useMemo(() => buildFolderTree(items ?? []), [items])
  const rows = useMemo(() => moveTargets(tree, folder), [tree, folder])
  const ready = items !== undefined

  // A folder that is gone from the list (the moved one, the current location or the chosen
  // target) cannot be the selection: it falls back to "Top level".
  const movedIsGone = ready && folder !== undefined && !tree.get(folder.id)
  const selectable = selected === null || rows.some((row) => row.folder.id === selected && !row.disabled)
  const target = ready && (movedIsGone || !selectable) ? null : selected

  const canMove = ready && !working && target !== currentLocation
  const submitting = useRef(false)
  async function confirm() {
    if (!canMove || submitting.current) return
    submitting.current = true
    try {
      const chosen = target === null ? null : (rows.find((row) => row.folder.id === target)?.folder ?? null)
      if (await onConfirm(chosen)) onClose()
    } finally {
      submitting.current = false
    }
  }

  let list
  // A 401 reads as still loading: the login redirect is on its way.
  if (folders.pending || (isUnauthorized(folders.error) && !ready)) {
    list = <p className="move-dialog__state">Loading folders…</p>
  } else if (!ready) {
    list = (
      <div className="move-dialog__state" role="alert">
        <span>Couldn't load your folders.</span>
        <button type="button" className="btn btn--sm" onClick={folders.retry}>
          Try again
        </button>
      </div>
    )
  } else {
    list = (
      <RadioGroup
        className="move-picker"
        aria-label="Move to"
        value={target ?? TOP}
        disabled={working}
        onValueChange={(value) => setSelected(value === TOP ? null : value)}
      >
        <MoveOption value={TOP} label="Top level" icon={<House size={14} aria-hidden="true" />} level={0} />
        {rows.map((row) => (
          <MoveOption
            key={row.folder.id}
            value={row.folder.id}
            label={row.folder.name}
            icon={<FolderIcon size={14} aria-hidden="true" />}
            level={row.level}
            disabled={row.disabled}
          />
        ))}
      </RadioGroup>
    )
  }

  return (
    <Dialog
      open={open}
      title={folder ? 'Move folder' : 'Move bookmark'}
      onClose={onClose}
      busy={working}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose} disabled={working}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void confirm()} disabled={!canMove}>
            {working ? 'Moving…' : 'Move'}
          </button>
        </>
      }
    >
      <p className="move-dialog__item" title={itemName}>
        {itemName}
      </p>
      <p className="move-dialog__note">Moves can't be undone.</p>
      {failure && (
        <Banner tone="error" role="alert">
          {failure.message}
        </Banner>
      )}
      {list}
    </Dialog>
  )
}

function MoveOption({
  value,
  label,
  icon,
  level,
  disabled = false,
}: {
  value: string
  label: string
  icon: ReactNode
  level: number
  disabled?: boolean
}) {
  return (
    <Radio.Root
      value={value}
      disabled={disabled}
      title={disabled ? DISABLED_ROW_TITLE : undefined}
      className="move-picker__option"
      render={(props, state) => (
        <div {...props}>
          <span
            className={`move-picker__row${state.checked ? ' move-picker__row--selected' : ''}${disabled ? ' move-picker__row--disabled' : ''}`}
            style={{ paddingLeft: `calc(12px + var(--space-3) * ${level})` }}
          >
            {icon}
            <span className="move-picker__name" title={label}>
              {label}
            </span>
            <Radio.Indicator className="move-picker__check" keepMounted={false}>
              <Check size={14} aria-hidden="true" />
            </Radio.Indicator>
          </span>
        </div>
      )}
    />
  )
}
