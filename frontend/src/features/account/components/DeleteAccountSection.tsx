import { useRef, useState, type RefObject } from 'react'
import { Trash2 } from 'lucide-react'
import { Dialog } from '../../../components/ui/Dialog'
import { useDeleteAccount } from '../hooks/useDeleteAccount'

export const CONFIRM_PHRASE = 'delete my account'

/** The "Delete account" button and its confirmation dialog. `onDeleted` runs once, after the dialog closed. */
export function DeleteAccountSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  const del = useDeleteAccount()
  const fieldRef = useRef<HTMLInputElement>(null)

  function close() {
    setOpen(false)
    del.reset()
  }

  return (
    <section className="account-section account-section--danger">
      <h2 className="account-section__title">Delete account</h2>
      <p className="account-section__desc">
        Permanently erases all of your bookmarks, notes, folders and trash. There are no backups. Your login at the
        identity provider is not deleted.
      </p>
      <button type="button" className="btn btn--danger-outline" onClick={() => setOpen(true)}>
        <Trash2 size={14} aria-hidden="true" /> Delete account
      </button>
      <Dialog open={open} title="Delete your account?" onClose={close} busy={del.pending} size="sm" initialFocus={fieldRef}>
        <ConfirmForm
          fieldRef={fieldRef}
          pending={del.pending}
          failure={del.failure}
          onCancel={close}
          onConfirm={async () => {
            if (await del.run()) {
              close()
              onDeleted()
            }
          }}
        />
      </Dialog>
    </section>
  )
}

function ConfirmForm({
  fieldRef,
  pending,
  failure,
  onCancel,
  onConfirm,
}: {
  fieldRef: RefObject<HTMLInputElement | null>
  pending: boolean
  failure: ReturnType<typeof useDeleteAccount>['failure']
  onCancel: () => void
  onConfirm: () => Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const canConfirm = typed.trim().toLowerCase() === CONFIRM_PHRASE && !pending

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canConfirm) void onConfirm()
      }}
    >
      {failure && (
        <div className="banner banner--error" role="alert">
          {failure.message}
        </div>
      )}
      <p className="confirm-text">
        This permanently erases every bookmark, note, folder and everything in the trash. There are no backups and this
        can't be undone. Your login at the identity provider is not deleted.
      </p>
      <div className="field">
        <label className="field__label" htmlFor="delete-account-confirm">
          Type <strong>{CONFIRM_PHRASE}</strong> to confirm
        </label>
        <input
          id="delete-account-confirm"
          ref={fieldRef}
          className="input"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={pending}
          autoComplete="off"
        />
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className="btn btn--danger" disabled={!canConfirm}>
          Delete my account
        </button>
      </div>
    </form>
  )
}
