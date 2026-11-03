import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Banner } from '../../../components/ui/Banner'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import { TITLE_MAX_LENGTH } from '../../../lib/bookmarks/saveFailure'
import { useSaveBookmark } from '../../../lib/bookmarks/useSaveBookmark'
import { useWindowClose } from '../hooks/useWindowClose'
import { isHttpUrl } from '../lib/isHttpUrl'

const CLOSE_AFTER_SAVED_MS = 1000
const NOT_HTTP = 'Only http and https links can be saved.'

/** The small window the bookmarklet opens (`/save?url=…&title=…`). Opening it creates nothing. */
export function SavePopup() {
  const [params] = useSearchParams()
  const url = (params.get('url') ?? '').trim()
  const validUrl = isHttpUrl(url)

  const [title, setTitle] = useState(() => (params.get('title') ?? '').slice(0, TITLE_MAX_LENGTH))
  const { phase, failure, save, dismiss } = useSaveBookmark()
  const { close, couldNotClose } = useWindowClose()
  const saveButton = useRef<HTMLButtonElement>(null)

  const editing = phase === 'form' || phase === 'saving'
  const alerting = phase === 'duplicate' || phase === 'error'

  // Save has focus on open, and again when an alert is dismissed.
  useEffect(() => {
    if (phase === 'form') saveButton.current?.focus()
  }, [phase])

  // "Saved" stays for a second, then the window closes itself.
  useEffect(() => {
    if (phase !== 'saved') return
    const timer = setTimeout(close, CLOSE_AFTER_SAVED_MS)
    return () => clearTimeout(timer)
  }, [phase, close])

  // Enter saves and Esc cancels; on an alert either one dismisses it.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (alerting) dismiss()
        else if (phase === 'form' || phase === 'needs-login') close()
        else return
        event.preventDefault()
      } else if (event.key === 'Enter') {
        if (alerting) {
          event.preventDefault()
          dismiss()
        } else if (phase === 'form') {
          // Enter on Cancel presses Cancel.
          const target = event.target
          if (target instanceof HTMLButtonElement && target !== saveButton.current) return
          event.preventDefault()
          if (validUrl) void save(buildRequest(url, title))
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [phase, alerting, validUrl, url, title, save, dismiss, close])

  return (
    <div className="save-popup">
      <div className="save-popup__header">
        <Bookmark size={16} aria-hidden="true" />
        <span>Save bookmark</span>
      </div>

      {editing && (
        <div className="save-popup__body">
          {!validUrl && (
            <p className="field__error" role="alert">
              {NOT_HTTP}
            </p>
          )}
          <div className="field">
            <span className="field__label" id="save-url-label">
              URL
            </span>
            <div className="save-popup__url" aria-labelledby="save-url-label" title={url}>
              {url}
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="save-title">
              Title
            </label>
            <input
              id="save-title"
              className="input"
              autoComplete="off"
              value={title}
              maxLength={TITLE_MAX_LENGTH}
              disabled={phase === 'saving'}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="save-folder">
              Folder
            </label>
            {/* Disabled until listFolders exists: only the top level can be chosen. */}
            <select id="save-folder" className="input" disabled value="">
              <option value="">Top level</option>
            </select>
          </div>
          <div className="save-popup__footer">
            <button className="btn btn--ghost" onClick={close} disabled={phase === 'saving'}>
              Cancel
            </button>
            <button
              ref={saveButton}
              className="btn btn--primary"
              onClick={() => void save(buildRequest(url, title))}
              disabled={phase === 'saving' || !validUrl}
            >
              {phase === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {phase === 'needs-login' && (
        <div className="save-popup__body">
          <SignedOutMessage />
          <div className="save-popup__footer">
            <button className="btn btn--ghost" onClick={close}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {phase === 'saved' && (
        <div className="save-popup__body save-popup__saved">
          <Check size={22} aria-hidden="true" />
          <span role="status">Saved</span>
        </div>
      )}

      {alerting && failure && failure.kind !== 'signed-out' && (
        <div className="save-popup__body">
          <Banner tone={failure.kind === 'duplicate' ? 'info' : 'error'} role="alert">
            {failure.message}
          </Banner>
          <div className="save-popup__footer">
            <button className="btn btn--primary" onClick={dismiss} autoFocus>
              OK
            </button>
          </div>
        </div>
      )}

      {couldNotClose && (
        <div className="save-popup__cant-close" role="status">
          You can close this tab now.
        </div>
      )}
    </div>
  )
}

/** The title goes along only when it is not empty after trimming. Never a folder. */
function buildRequest(url: string, title: string) {
  const trimmed = title.trim()
  return trimmed ? { url, title: trimmed } : { url }
}
