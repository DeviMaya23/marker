import { useEffect, useRef, useState } from 'react'
import { Bookmark, Check } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { Banner } from '../../../components/ui/Banner'
import { SignedOutMessage } from '../../../components/ui/SignedOutMessage'
import type { CreateBookmarkRequest } from '../../../lib/api/bookmarks'
import { TITLE_MAX_LENGTH } from '../../../lib/bookmarks/saveFailure'
import { useSaveBookmark } from '../../../lib/bookmarks/useSaveBookmark'
import { useFolders } from '../../../lib/folders/useFolders'
import { useWindowClose } from '../hooks/useWindowClose'
import { isHttpUrl } from '../lib/isHttpUrl'
import { FolderChoice, TOP_LEVEL } from './FolderChoice'

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

  const folders = useFolders()
  const [chosen, setChosen] = useState(TOP_LEVEL)
  // A chosen folder that is gone from the (refreshed) list falls back to "Top level".
  const folderId = folders.data?.some((f) => f.id === chosen) ? chosen : TOP_LEVEL
  const refetchFolders = folders.refetch
  // True while the folder select's list is open: Enter and Esc then belong to the list.
  const selectOpen = useRef(false)

  const editing = phase === 'form' || phase === 'saving'
  const alerting = phase === 'duplicate' || phase === 'error'

  // Save has focus on open, and again when an alert is dismissed.
  useEffect(() => {
    if (phase === 'form') saveButton.current?.focus()
  }, [phase])

  // After a failed save with a folder chosen, the folder may be the reason (deleted meanwhile):
  // refresh the list so the choice is current by the time the alert is dismissed.
  useEffect(() => {
    if (phase === 'error' && folderId !== TOP_LEVEL) void refetchFolders()
  }, [phase, folderId, refetchFolders])

  // "Saved" stays for a second, then the window closes itself.
  useEffect(() => {
    if (phase !== 'saved') return
    const timer = setTimeout(close, CLOSE_AFTER_SAVED_MS)
    return () => clearTimeout(timer)
  }, [phase, close])

  // Enter saves and Esc cancels; on an alert either one dismisses it. Enter and Esc that belong to
  // the folder select (its list is open, or Enter on its closed button, which opens it) do neither.
  // The select closes itself while the key is handled, so whether the list was open is noted in the
  // capture phase, before the select sees the key.
  const ownedBySelect = useRef(false)
  useEffect(() => {
    function noteOwner(event: KeyboardEvent) {
      const onSelectButton = event.target instanceof Element && event.target.closest('#save-folder') !== null
      ownedBySelect.current = selectOpen.current || (onSelectButton && event.key === 'Enter')
    }
    function onKeyDown(event: KeyboardEvent) {
      if ((event.key === 'Escape' || event.key === 'Enter') && ownedBySelect.current) return
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
          if (validUrl) void save(buildRequest(url, title, folderId))
        }
      }
    }
    document.addEventListener('keydown', noteOwner, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', noteOwner, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [phase, alerting, validUrl, url, title, folderId, save, dismiss, close])

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
            <FolderChoice
              value={folderId}
              onValueChange={setChosen}
              onOpenChange={(open) => {
                selectOpen.current = open
              }}
              folders={{ items: folders.data, pending: folders.isPending, retry: () => void folders.refetch() }}
            />
          </div>
          <div className="save-popup__footer">
            <button className="btn btn--ghost" onClick={close} disabled={phase === 'saving'}>
              Cancel
            </button>
            <button
              ref={saveButton}
              className="btn btn--primary"
              onClick={() => void save(buildRequest(url, title, folderId))}
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

/**
 * The title goes along only when it is not empty after trimming, and the folder only when one is
 * chosen: at "Top level" there is no `folder_id` key.
 */
function buildRequest(url: string, title: string, folderId: string): CreateBookmarkRequest {
  const trimmed = title.trim()
  return {
    url,
    ...(trimmed ? { title: trimmed } : {}),
    ...(folderId !== TOP_LEVEL ? { folder_id: folderId } : {}),
  }
}
