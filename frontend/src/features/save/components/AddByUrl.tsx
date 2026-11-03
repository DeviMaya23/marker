import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { SignedOut } from '../../auth/components/SignedOut'
import { useSaveBookmark } from '../hooks/useSaveBookmark'

/** The paste-a-URL field of the temporary home page. */
export function AddByUrl() {
  const [url, setUrl] = useState('')
  const { phase, failure, save } = useSaveBookmark()
  const navigate = useNavigate()
  const busy = phase === 'saving' || phase === 'saved'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy || url.trim() === '') return
    const bookmark = await save(url.trim(), '')
    if (bookmark) void navigate(`/bookmarks/${bookmark.id}`)
  }

  return (
    <form className="add-by-url" onSubmit={(e) => void onSubmit(e)}>
      <div className="field">
        <label className="field__label" htmlFor="add-url">
          URL
        </label>
        <div className="add-by-url__row">
          <input
            id="add-url"
            className="input"
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/article"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button type="submit" className="btn btn--primary" disabled={busy || url.trim() === ''}>
            Save
          </button>
        </div>
        {failure && (
          <p className="field__error" role="alert">
            {failure.message}{' '}
            {failure.kind === 'duplicate' && failure.existingBookmarkId && (
              <Link to={`/bookmarks/${failure.existingBookmarkId}`}>Open it</Link>
            )}
          </p>
        )}
      </div>
      {phase === 'needs-login' && <SignedOut />}
    </form>
  )
}
