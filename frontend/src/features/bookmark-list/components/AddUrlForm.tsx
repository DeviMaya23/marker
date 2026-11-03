import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Banner } from '../../../components/ui/Banner'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import { useSaveBookmark } from '../../../lib/bookmarks/useSaveBookmark'

/** The paste-a-URL field. A stand-in for the add field in the top bar until the list screen exists. */
export function AddUrlForm() {
  const navigate = useNavigate()
  const { phase, failure, save, dismiss } = useSaveBookmark()
  const [url, setUrl] = useState('')

  const trimmed = url.trim()
  const saving = phase === 'saving'

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || saving) return
    const bookmark = await save({ url: trimmed })
    if (bookmark) void navigate(`/bookmarks/${bookmark.id}`)
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate>
      <div className="field">
        <label className="field__label" htmlFor="add-url">
          Link to save
        </label>
        <div className="home__row">
          <input
            id="add-url"
            className="input"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://…"
            value={url}
            readOnly={saving}
            aria-invalid={failure?.kind === 'invalid-input'}
            aria-describedby={failure?.kind === 'invalid-input' ? 'add-url-error' : undefined}
            onChange={(event) => {
              setUrl(event.target.value)
              dismiss()
            }}
          />
          <button type="submit" className="btn btn--primary" disabled={!trimmed || saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {failure?.kind === 'invalid-input' && (
          <p className="field__error" id="add-url-error" role="alert">
            {failure.message}
          </p>
        )}
      </div>

      {failure?.kind === 'signed-out' && <SignedOutMessage />}

      {failure?.kind === 'duplicate' && (
        <Banner tone="info" role="alert">
          <span>{failure.message}</span>
          {failure.existingBookmarkId && (
            <Link to={`/bookmarks/${failure.existingBookmarkId}`}>Open it</Link>
          )}
        </Banner>
      )}

      {failure?.kind === 'error' && (
        <Banner tone="error" role="alert">
          {failure.message}
        </Banner>
      )}
    </form>
  )
}
