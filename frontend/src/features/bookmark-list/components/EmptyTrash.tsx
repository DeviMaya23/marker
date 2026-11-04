import { useRef, useState, type RefObject } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '../../../components/ui/Dialog'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import { useEmptyTrash } from '../../../lib/bookmarks/useEmptyTrash'
import { useBookmarkList } from '../hooks/useBookmarkList'

export const CONFIRM_PHRASE = 'empty trash'
const FORM_ID = 'empty-trash-form'

/** "1 bookmark", "3 bookmarks". */
function countText(n: number): string {
  return `${n} ${n === 1 ? 'bookmark' : 'bookmarks'}`
}

/** The "Empty trash" button and its confirmation dialog. Enabled only when the trash has loaded and has bookmarks. */
export function EmptyTrash() {
  // The same query as the list below it, so both see one trash.
  const { phase, rows, hasNextPage } = useBookmarkList({ trashed: true })
  const [open, setOpen] = useState(false)
  const empty = useEmptyTrash()
  const fieldRef = useRef<HTMLInputElement>(null)
  const [typed, setTyped] = useState('')
  const canConfirm = typed.trim().toLowerCase() === CONFIRM_PHRASE && !empty.pending

  function close() {
    setOpen(false)
    setTyped('')
    empty.reset()
  }

  async function confirmEmpty() {
    if (await empty.run()) close()
  }

  // With more pages the count is unknown, so the text does not give one.
  const text = hasNextPage
    ? "This permanently deletes every bookmark in the trash. This can't be undone."
    : `This permanently deletes ${countText(rows.length)} in the trash. This can't be undone.`

  return (
    <>
      <button
        type="button"
        className="btn btn--danger-outline"
        disabled={phase !== 'ready'}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} aria-hidden="true" /> Empty trash
      </button>
      <Dialog
        open={open}
        title="Empty trash?"
        onClose={close}
        busy={empty.pending}
        size="sm"
        initialFocus={fieldRef}
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={close} disabled={empty.pending}>
              Cancel
            </button>
            <button type="submit" form={FORM_ID} className="btn btn--danger" disabled={!canConfirm}>
              Empty trash
            </button>
          </>
        }
      >
        <ConfirmForm
          text={text}
          fieldRef={fieldRef}
          typed={typed}
          onTyped={setTyped}
          pending={empty.pending}
          failure={empty.failure}
          onSubmit={() => {
            if (canConfirm) void confirmEmpty()
          }}
        />
      </Dialog>
    </>
  )
}

function ConfirmForm({
  text,
  fieldRef,
  typed,
  onTyped,
  pending,
  failure,
  onSubmit,
}: {
  text: string
  fieldRef: RefObject<HTMLInputElement | null>
  typed: string
  onTyped: (value: string) => void
  pending: boolean
  failure: ReturnType<typeof useEmptyTrash>['failure']
  onSubmit: () => void
}) {
  return (
    <form
      id={FORM_ID}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {failure?.signedOut && <SignedOutMessage />}
      {failure && !failure.signedOut && (
        <div className="banner banner--error" role="alert">
          {failure.message}
        </div>
      )}
      <p className="confirm-text">{text}</p>
      <div className="field">
        <label className="field__label" htmlFor="empty-trash-confirm">
          Type <strong>{CONFIRM_PHRASE}</strong> to confirm
        </label>
        <input
          id="empty-trash-confirm"
          ref={fieldRef}
          className="input"
          type="text"
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          disabled={pending}
          autoComplete="off"
        />
      </div>
    </form>
  )
}
