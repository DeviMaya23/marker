import { useId, useRef, useState, type RefObject } from 'react'
import type { BookmarkChanges } from '../../lib/api/bookmarks'
import { NOTE_MAX, TITLE_MAX, type FailureDisplay } from '../../lib/bookmarks/describeFailure'
import { codePointLength, computeChanges, overLimits } from '../../lib/bookmarks/editChanges'
import { Dialog } from './Dialog'

type Props = {
  open: boolean
  /** The bookmark's stored values: the fields start from them each time the dialog opens. */
  title: string
  note: string | null
  /** Esc, Cancel, the backdrop and a successful save all end up here. */
  onClose: () => void
  /** Sends only what changed; resolves true when it was saved (the dialog then closes). */
  onSave: (changes: BookmarkChanges) => Promise<boolean>
  saving: boolean
  failure: FailureDisplay | null
}

/** Edit a bookmark's title and note. Works with a `BookmarkSummary` and a `BookmarkDetail`. */
export function EditBookmarkDialog({ open, onClose, saving, ...form }: Props) {
  const titleRef = useRef<HTMLInputElement>(null)
  return (
    <Dialog open={open} title="Edit bookmark" onClose={onClose} busy={saving} initialFocus={titleRef}>
      {/* The form is mounted only while open, so it always starts from the current values. */}
      <EditForm {...form} saving={saving} onClose={onClose} titleRef={titleRef} />
    </Dialog>
  )
}

function EditForm({
  title,
  note,
  onClose,
  onSave,
  saving,
  failure,
  titleRef,
}: Omit<Props, 'open'> & { titleRef: RefObject<HTMLInputElement | null> }) {
  const [typedTitle, setTypedTitle] = useState(title)
  const [typedNote, setTypedNote] = useState(note ?? '')
  const formId = useId()

  const typed = { title: typedTitle, note: typedNote }
  const over = overLimits(typed)
  const changes = computeChanges({ title, note }, typed)
  const canSave = Object.keys(changes).length > 0 && !over.title && !over.note && !saving

  const titleError = over.title ? `Title is too long (${TITLE_MAX} characters at most).` : failure?.fields.title
  const noteError = over.note ? `Note is too long (${NOTE_MAX} characters at most).` : failure?.fields.note

  // Two submits in one tick both see the same render, so the guard has to be a ref.
  const submitting = useRef(false)
  async function submit() {
    if (!canSave || submitting.current) return
    submitting.current = true
    try {
      if (await onSave(changes)) onClose()
    } finally {
      submitting.current = false
    }
  }

  return (
    <>
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {failure && failure.message && (
          <div className="banner banner--error" role="alert">
            {failure.message}
          </div>
        )}
        <div className="field">
          <label className="field__label" htmlFor={`${formId}-title`}>
            Title
          </label>
          <input
            id={`${formId}-title`}
            ref={titleRef}
            className="input"
            type="text"
            value={typedTitle}
            onChange={(e) => setTypedTitle(e.target.value)}
            disabled={saving}
          />
          <div className={`field__meta${over.title ? ' field__meta--over' : ''}`}>
            {codePointLength(typedTitle.trim())}/{TITLE_MAX}
          </div>
          {titleError && <div className="field__error">{titleError}</div>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${formId}-note`}>
            Note
          </label>
          <textarea
            id={`${formId}-note`}
            className="input textarea"
            rows={4}
            placeholder="Optional note…"
            value={typedNote}
            onChange={(e) => setTypedNote(e.target.value)}
            disabled={saving}
          />
          <div className={`field__meta${over.note ? ' field__meta--over' : ''}`}>
            {codePointLength(typedNote)}/{NOTE_MAX}
          </div>
          {noteError && <div className="field__error">{noteError}</div>}
        </div>
      </form>
      <div className="modal-footer">
        <button type="button" className="btn btn--secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" form={formId} className="btn btn--primary" disabled={!canSave}>
          Save
        </button>
      </div>
    </>
  )
}
