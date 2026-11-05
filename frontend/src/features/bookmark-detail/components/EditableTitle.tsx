import { useEffect, useState, type RefObject } from 'react'
import { hostOf } from '../../../lib/hostOf'
import { useInlineField } from '../hooks/useInlineField'
import { TITLE_MAX } from '../../../lib/bookmarks/describeFailure'

type Props = {
  id: string
  url: string
  title: string
  isFetching: boolean
  /** Set to a function that drops the typed text unless it is being saved. */
  dropRef: RefObject<(() => void) | null>
}

/** The page's `<h1>` for a live bookmark: the title, edited in place. */
export function EditableTitle({ id, url, title, isFetching, dropRef }: Props) {
  const stored = title.trim() === '' ? '' : title
  const field = useInlineField({ id, field: 'title', stored, isFetching })
  const [focused, setFocused] = useState(false)
  const { dropDraft } = field
  useEffect(() => {
    const ref = dropRef
    ref.current = dropDraft
    return () => {
      ref.current = null
    }
  }, [dropRef, dropDraft])

  return (
    <>
      <h1 className="detail-page__title-readonly">
        <input
          type="text"
          className="detail-page__title-input"
          aria-label="Title"
          placeholder={hostOf(url)}
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            void field.commit()
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') {
              e.preventDefault()
              void field.commit()
            } else if (e.key === 'Escape') {
              field.revert()
            }
          }}
        />
      </h1>
      <div className="detail-page__field-meta">
        {(focused || field.over) && (
          <span className={`field__meta${field.over ? ' field__meta--over' : ''}`}>
            {field.count}/{TITLE_MAX}
          </span>
        )}
        <span className="detail-page__status" role="status">
          {field.status}
        </span>
      </div>
      {field.error && (
        <div className="field__error" role="alert">
          {field.error}
        </div>
      )}
    </>
  )
}
