import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useToast } from '../../../components/ui/useToast'
import { changeForField, codePointLength, overLimits } from '../../../lib/bookmarks/editChanges'
import { bookmarkKey } from '../../../lib/bookmarks/queryKeys'
import { useEditBookmark } from '../../../lib/bookmarks/useEditBookmark'
import { NOTE_TOO_LONG, SAVED_MS, SAVED_TEXT, SAVING_TEXT, TITLE_TOO_LONG } from '../lib/inlineEdit'

export type InlineField = 'title' | 'note'

/**
 * One field edited in place on the bookmark page: the typed text, when it is saved, what the
 * field shows meanwhile and what it says about it. Each field has its own save.
 *
 * A field is "touched" from the first change until its text is saved, reverted or dropped; a
 * touched field shows the typed text, an untouched one the baseline, which is the stored value
 * except while a just-saved text waits for the page's refetch (so the old value never shows).
 */
export function useInlineField({
  id,
  field,
  stored,
  isFetching,
}: {
  id: string
  field: InlineField
  /** The stored text as the field shows it ('' for a null note or an empty title). */
  stored: string
  /** The page query's own flag; its change re-checks whether the saved text can be released. */
  isFetching: boolean
}) {
  const client = useQueryClient()
  const toast = useToast()
  const edit = useEditBookmark(id, { toastOnSave: false })
  const [typed, setTyped] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [flash, setFlash] = useState(false)

  const typedRef = useRef<string | null>(null)
  const inFlight = useRef(false)
  const baseline = saved ?? stored
  const value = typed ?? baseline

  const setTypedText = useCallback((text: string | null) => {
    typedRef.current = text
    setTyped(text)
  }, [])

  // "Saved" lasts 2 seconds; the timer is cleared on unmount and when it is turned off sooner.
  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(false), SAVED_MS)
    return () => clearTimeout(timer)
  }, [flash])

  // Release the saved text once the refetch the save started has finished (or none started).
  useEffect(() => {
    if (saved === null) return
    if (client.getQueryState(bookmarkKey(id))?.fetchStatus !== 'fetching') setSaved(null)
  }, [saved, isFetching, client, id])

  const over = overLimits({ title: field === 'title' ? value : '', note: field === 'note' ? value : '' })[field]
  const overMessage = field === 'title' ? TITLE_TOO_LONG : NOTE_TOO_LONG
  const failureText = edit.failure ? (edit.failure.fields[field] ?? (edit.failure.message || null)) : null
  const error = attempted && over && typed !== null ? overMessage : failureText

  const onChange = useCallback(
    (text: string) => {
      setTypedText(text)
      setFlash(false)
      edit.reset()
    },
    [edit, setTypedText],
  )

  const revert = useCallback(() => {
    setTypedText(null)
    setAttempted(false)
    edit.reset()
  }, [edit, setTypedText])

  const commit = useCallback(async () => {
    const text = typedRef.current
    if (text === null) return
    edit.reset()
    const change = changeForField(field, baseline, text)
    if (change[field] === undefined) {
      setTypedText(null)
      setAttempted(false)
      return
    }
    if (overLimits({ title: field === 'title' ? text : '', note: field === 'note' ? text : '' })[field]) {
      setAttempted(true)
      return
    }
    setAttempted(false)
    setFlash(false)
    const alreadySaving = inFlight.current
    inFlight.current = true
    const result = await edit.saveChanges(change)
    if (!alreadySaving) inFlight.current = false
    if (result.outcome === 'saved') {
      const sent = change[field]
      setSaved(sent ?? '')
      setFlash(true)
      if (typedRef.current === text) setTypedText(null)
    } else if (result.outcome === 'failed' && (result.status === 404 || result.status === 409)) {
      // The refresh removes the field and its message, so tell the user here too.
      toast.show(result.failure.message, { tone: 'error' })
    }
  }, [baseline, edit, field, setTypedText, toast])

  /** Drops typed text that is not being saved (the Edit dialog starts from the stored values). */
  const dropDraft = useCallback(() => {
    if (inFlight.current) return
    revert()
  }, [revert])

  const status = edit.pending ? SAVING_TEXT : flash ? SAVED_TEXT : ''
  const count = codePointLength(field === 'title' ? value.trim() : value)

  return { value, onChange, commit, revert, dropDraft, over, count, status, error }
}
