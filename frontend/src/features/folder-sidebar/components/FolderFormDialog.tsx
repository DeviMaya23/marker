import { useId, useRef, useState, type RefObject } from 'react'
import { Dialog } from '../../../components/ui/Dialog'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import { codePointLength } from '../../../lib/bookmarks/editChanges'
import {
  FOLDER_NAME_MAX,
  NAME_REQUIRED,
  NAME_TOO_LONG,
  type FolderFailure,
} from '../../../lib/folders/folderFailureMessage'

type Props = {
  open: boolean
  /** `create` with a `parentName` is a new subfolder. */
  mode: 'create' | 'rename'
  parentName?: string
  /** The name the field starts with each time the dialog opens ('' for a new folder). */
  initialName: string
  saving: boolean
  failure: FolderFailure | null
  /** Called with the trimmed name; resolves true when it was saved (the dialog then closes). */
  onSubmit: (name: string) => Promise<boolean>
  /** The user typed in the field: a message shown under it no longer applies. */
  onEdit: () => void
  /** Esc, Cancel, the backdrop and a successful save all end up here. */
  onClose: () => void
}

/** One dialog for "New folder", "New subfolder" and "Rename folder". */
export function FolderFormDialog({ open, onClose, saving, ...form }: Props) {
  const nameRef = useRef<HTMLInputElement>(null)
  const title = form.mode === 'rename' ? 'Rename folder' : form.parentName !== undefined ? 'New subfolder' : 'New folder'
  return (
    <Dialog open={open} title={title} onClose={onClose} busy={saving} initialFocus={nameRef}>
      {/* The form is mounted only while open, so it always starts from the current values. */}
      <NameForm {...form} saving={saving} onClose={onClose} nameRef={nameRef} />
    </Dialog>
  )
}

function NameForm({
  mode,
  parentName,
  initialName,
  saving,
  failure,
  onSubmit,
  onEdit,
  onClose,
  nameRef,
}: Omit<Props, 'open'> & { nameRef: RefObject<HTMLInputElement | null> }) {
  const [name, setName] = useState(initialName)
  // An untouched dialog is not an error: "required" waits until the user has typed.
  const [touched, setTouched] = useState(false)
  const formId = useId()

  const trimmed = name.trim()
  const length = codePointLength(trimmed)
  const empty = trimmed === ''
  const tooLong = length > FOLDER_NAME_MAX
  const unchanged = mode === 'rename' && trimmed === initialName
  const canSave = !empty && !tooLong && !unchanged && !saving

  let nameError: string | undefined
  if (tooLong) nameError = NAME_TOO_LONG
  else if (empty && touched) nameError = NAME_REQUIRED
  else if (failure?.kind === 'field') nameError = failure.message

  // Two submits in one tick both see the same render, so the guard has to be a ref.
  const submitting = useRef(false)
  async function submit() {
    if (!canSave || submitting.current) return
    submitting.current = true
    try {
      if (await onSubmit(trimmed)) onClose()
    } finally {
      submitting.current = false
    }
  }

  return (
    <>
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {mode === 'create' && parentName !== undefined && <p className="confirm-text">In {parentName}</p>}
        {failure?.kind === 'signed-out' && <SignedOutMessage />}
        {failure?.kind === 'dialog' && (
          <div className="banner banner--error" role="alert">
            {failure.message}
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor={`${formId}-name`}>
            Name
          </label>
          <input
            id={`${formId}-name`}
            ref={nameRef}
            className="input"
            type="text"
            placeholder="Folder name"
            autoComplete="off"
            value={name}
            disabled={saving}
            aria-invalid={nameError !== undefined}
            aria-describedby={nameError !== undefined ? `${formId}-error` : undefined}
            onChange={(event) => {
              setName(event.target.value)
              setTouched(true)
              if (failure?.kind === 'field') onEdit()
            }}
          />
          <div className={`field__meta${tooLong ? ' field__meta--over' : ''}`}>
            {length}/{FOLDER_NAME_MAX}
          </div>
          {nameError && (
            <div className="field__error" id={`${formId}-error`}>
              {nameError}
            </div>
          )}
        </div>
      </form>
      <div className="modal-footer">
        <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" form={formId} className="btn btn--primary" disabled={!canSave}>
          {mode === 'rename' ? 'Save' : 'Create'}
        </button>
      </div>
    </>
  )
}
