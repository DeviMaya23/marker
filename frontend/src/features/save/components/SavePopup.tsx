import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useSearchParams } from 'react-router'
import { SignedOut } from '../../auth/components/SignedOut'
import { useCloseWindow } from '../hooks/useCloseWindow'
import { useSaveBookmark } from '../hooks/useSaveBookmark'
import { TITLE_MAX_LENGTH } from '../lib/saveFailure'

const SAVED_SHOWN_MS = 1000
const INVALID_URL_MESSAGE = 'Only http and https links can be saved.'

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

/** The window the bookmarklet opens (brief screen 5). Opening it creates nothing (FR-3a). */
export function SavePopup() {
  const [params] = useSearchParams()
  const url = params.get('url') ?? ''
  const [title, setTitle] = useState(params.get('title') ?? '')
  const { phase, failure, save, dismiss } = useSaveBookmark()
  const { close, cannotClose } = useCloseWindow()
  const saveButton = useRef<HTMLButtonElement>(null)
  const urlValid = isHttpUrl(url)

  // Save has focus whenever the form is showing (on open, and after an alert is dismissed).
  useEffect(() => {
    if (phase === 'form') saveButton.current?.focus()
  }, [phase])

  useEffect(() => {
    if (phase !== 'saved') return
    const timer = setTimeout(close, SAVED_SHOWN_MS)
    return () => clearTimeout(timer)
  }, [phase, close])

  // Keys are handled on the document so they work wherever focus is, including after the
  // focused input is disabled while saving.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const alertShown = phase === 'duplicate' || phase === 'error'
      if (e.key === 'Escape') {
        if (alertShown) dismiss()
        else if (phase === 'form') close()
        else return
        e.preventDefault()
      } else if (e.key === 'Enter') {
        const onCancel = e.target instanceof Element && e.target.closest('[data-action="cancel"]') !== null
        if (alertShown) dismiss()
        else if (phase === 'form' && urlValid && !onCancel) void save(url, title)
        else return
        e.preventDefault()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [phase, urlValid, url, title, save, dismiss, close])

  const busy = phase === 'saving'

  return (
    <div className="save-popup">
      <div className="save-popup__header">
        <span>Save bookmark</span>
      </div>

      {phase === 'needs-login' && (
        <div className="save-popup__body">
          <SignedOut />
        </div>
      )}

      {(phase === 'form' || phase === 'saving') && (
        <div className="save-popup__body">
          {!urlValid && (
            <p className="field__error" role="alert">
              {INVALID_URL_MESSAGE}
            </p>
          )}
          <div className="field">
            <span className="field__label">URL</span>
            <div className="save-popup__url" title={url}>
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
              disabled={busy}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="save-folder">
              Folder
            </label>
            <select id="save-folder" className="input" disabled>
              <option>Top level</option>
            </select>
          </div>
          <div className="save-popup__footer">
            <button type="button" className="btn btn--ghost" data-action="cancel" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              ref={saveButton}
              className="btn btn--primary"
              onClick={() => void save(url, title)}
              disabled={busy || !urlValid}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {phase === 'saved' && (
        <div className="save-popup__body save-popup__saved">
          <span>Saved</span>
        </div>
      )}

      {(phase === 'duplicate' || phase === 'error') && failure && (
        <div className="save-popup__body">
          <div className={`banner ${phase === 'duplicate' ? 'banner--info' : 'banner--error'}`} role="alert">
            {failure.message}
          </div>
          <div className="save-popup__footer">
            <button type="button" className="btn btn--primary" onClick={dismiss} autoFocus>
              OK
            </button>
          </div>
        </div>
      )}

      {cannotClose && (
        <div className="save-popup__cant-close" role="status">
          You can close this tab now.
        </div>
      )}
    </div>
  )
}
