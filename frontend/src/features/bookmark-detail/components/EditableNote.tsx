import { useEffect, useId, type RefObject } from 'react'
import { NOTE_MAX } from '../../../lib/bookmarks/describeFailure'
import { useInlineField } from '../hooks/useInlineField'

type Props = {
  id: string
  note: string | null
  isFetching: boolean
  /** Set to a function that drops the typed text unless it is being saved. */
  dropRef: RefObject<(() => void) | null>
}

/** The note of a live bookmark, edited in place. Always shown, so a note can be added. */
export function EditableNote({ id, note, isFetching, dropRef }: Props) {
  const field = useInlineField({ id, field: 'note', stored: note ?? '', isFetching })
  const inputId = useId()
  const { dropDraft } = field
  useEffect(() => {
    const ref = dropRef
    ref.current = dropDraft
    return () => {
      ref.current = null
    }
  }, [dropRef, dropDraft])

  return (
    <div className="detail-page__note">
      <label className="field__label" htmlFor={inputId}>
        Note
      </label>
      <textarea
        id={inputId}
        className="input textarea"
        rows={3}
        placeholder="Add a note…"
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={() => void field.commit()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') field.revert()
        }}
      />
      <div className="detail-page__field-meta">
        <span className={`field__meta${field.over ? ' field__meta--over' : ''}`}>
          {field.count}/{NOTE_MAX}
        </span>
        <span className="detail-page__status" role="status">
          {field.status}
        </span>
      </div>
      {field.error && (
        <div className="field__error" role="alert">
          {field.error}
        </div>
      )}
    </div>
  )
}
