import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { useLocation, useNavigate, useSearchParams, type Location } from 'react-router'
import { normalizeTerm, readListSearch, writeListSearch, type ListSearch } from '../lib/listSearch'

/** How long the field waits after the last keystroke before the term goes into the URL. */
const APPLY_DELAY_MS = 300

export type SearchScope = 'all' | 'folder'

/** The search applied in the URL (read-only): the list uses this, never the field's text. */
export function useAppliedSearch(): ListSearch {
  const [params] = useSearchParams()
  const search = params.toString()
  // The string is the dependency: `params` is a new object on every render.
  return useMemo(() => readListSearch(new URLSearchParams(search)), [search])
}

/**
 * The search bar's state. The text is local so typing is instant; the term it holds is applied to
 * the URL 300 ms after the last keystroke (or at once on Enter, Clear or a scope change). The URL
 * is the only copy of what is searched. Pass the page's folder id on a folder page, none on `/`.
 */
export function useListSearch({ folderId }: { folderId?: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const applied = useAppliedSearch()

  const [text, setText] = useState(applied.q)

  // The latest location and navigate, so a timer or handler writes from the URL as it is then,
  // not as it was at the last render.
  const live = useRef<Pick<Location, 'pathname' | 'search'>>(location)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    live.current = location
    navigateRef.current = navigate
  })

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  useEffect(() => clearTimer, [clearTimer])

  // The last term this hook applied. The field follows the URL only when the URL's term differs.
  const lastApplied = useRef(applied.q)
  const lastPath = useRef(location.pathname)
  useEffect(() => {
    const pathChanged = lastPath.current !== location.pathname
    lastPath.current = location.pathname
    if (!pathChanged && applied.q === lastApplied.current) return
    clearTimer()
    lastApplied.current = applied.q
    setText(applied.q)
  }, [location.pathname, applied.q, clearTimer])

  const inputRef = useRef<HTMLInputElement>(null)

  const liveParams = () => new URLSearchParams(live.current.search)

  /** Writes `search` onto the current path, replacing the history entry, and remembers it. */
  const writeSearch = useCallback((next: URLSearchParams) => {
    const search = next.toString()
    const target = { pathname: live.current.pathname, search: search === '' ? '' : `?${search}` }
    live.current = { ...live.current, ...target }
    navigateRef.current(target, { replace: true })
  }, [])

  const apply = useCallback(
    (raw: string) => {
      clearTimer()
      const term = normalizeTerm(raw)
      const current = readListSearch(liveParams())
      lastApplied.current = term
      if (term === current.q) return
      writeSearch(writeListSearch(liveParams(), { q: term, includeNotes: current.includeNotes }))
    },
    [clearTimer, writeSearch],
  )

  const inputProps = {
    ref: inputRef,
    value: text,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value
      setText(next)
      clearTimer()
      timer.current = setTimeout(() => apply(next), APPLY_DELAY_MS)
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
      apply(event.currentTarget.value)
    },
  }

  const clear = () => {
    setText('')
    apply('')
    inputRef.current?.focus()
  }

  const setIncludeNotes = (includeNotes: boolean) => {
    const current = readListSearch(liveParams())
    writeSearch(writeListSearch(liveParams(), { q: current.q, includeNotes }))
  }

  const scope: SearchScope = folderId === undefined ? 'all' : 'folder'

  /** "All bookmarks" from a folder page goes to `/` and keeps the search; any other choice is a no-op. */
  const chooseScope = (next: SearchScope) => {
    if (next === scope || next !== 'all') return
    apply(inputRef.current?.value ?? text)
    const term = readListSearch(liveParams()).q
    navigateRef.current({ pathname: '/', search: live.current.search }, { replace: false })
    lastApplied.current = term
  }

  return { inputProps, text, applied, scope, clear, setIncludeNotes, chooseScope }
}
