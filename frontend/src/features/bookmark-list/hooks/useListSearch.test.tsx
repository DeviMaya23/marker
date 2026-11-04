import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { MemoryRouter, useLocation, useNavigate, useNavigationType } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useListSearch } from './useListSearch'

const nav: { go: ReturnType<typeof useNavigate> } = { go: () => {} }

function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    nav.go = navigate
  })
  return (
    <>
      <output data-testid="path">{location.pathname}</output>
      <output data-testid="search">{location.search}</output>
      <output data-testid="key">{location.key}</output>
      <output data-testid="nav">{useNavigationType()}</output>
    </>
  )
}

function Harness({ folderId }: { folderId?: string }) {
  const search = useListSearch({ folderId })
  return (
    <>
      <input aria-label="field" {...search.inputProps} />
      <button onClick={search.clear}>clear</button>
      <button onClick={() => search.setIncludeNotes(!search.applied.includeNotes)}>notes</button>
      <button onClick={() => search.chooseScope('all')}>scope-all</button>
      <button onClick={() => search.chooseScope('folder')}>scope-folder</button>
      <output data-testid="scope">{search.scope}</output>
    </>
  )
}

function setup(path = '/', folderId?: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
      <Harness folderId={folderId} />
    </MemoryRouter>,
  )
  return view
}

const field = () => screen.getByLabelText('field') as HTMLInputElement
const search = () => screen.getByTestId('search').textContent
const path = () => screen.getByTestId('path').textContent
const navType = () => screen.getByTestId('nav').textContent
const key = () => screen.getByTestId('key').textContent
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const click = (name: string) => fireEvent.click(screen.getByText(name))
const navigateTo = (to: string | number) => act(() => void nav.go(to as string))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useListSearch: typing', () => {
  it('changes the field at once and the URL not before 300 ms; the write replaces the entry', () => {
    setup()
    type(' foo ')
    expect(field().value).toBe(' foo ')
    expect(search()).toBe('')
    wait(299)
    expect(search()).toBe('')
    wait(1)
    expect(search()).toBe('?q=foo')
    expect(navType()).toBe('REPLACE')
  })

  it('makes one write, 300 ms after the second of two keystrokes 200 ms apart', () => {
    setup()
    type('a')
    wait(200)
    type('ab')
    wait(299)
    expect(search()).toBe('')
    wait(1)
    expect(search()).toBe('?q=ab')
  })

  it('keeps exactly what was typed after its own write, so "foo bar" can be typed', () => {
    setup()
    type('foo ')
    wait(300)
    expect(search()).toBe('?q=foo')
    expect(field().value).toBe('foo ')
    type('foo bar')
    expect(field().value).toBe('foo bar')
    wait(300)
    expect(new URLSearchParams(search() ?? '').get('q')).toBe('foo bar')
    expect(field().value).toBe('foo bar')
  })

  it('removes q for only spaces, and writes nothing for the text the URL already has', () => {
    setup('/?q=foo')
    type('foo  ')
    const before = key()
    wait(300)
    expect(key()).toBe(before)
    type('   ')
    wait(300)
    expect(search()).toBe('')
  })

  it('applies Enter at once and a later timer does not write again', () => {
    setup()
    type('foo')
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(search()).toBe('?q=foo')
    const after = key()
    wait(1000)
    expect(key()).toBe(after)
  })

  it('does nothing on Enter while composing, and the wait still applies it', () => {
    setup()
    type('fo')
    fireEvent.keyDown(field(), { key: 'Enter', isComposing: true })
    expect(search()).toBe('')
    wait(300)
    expect(search()).toBe('?q=fo')
  })

  it('Clear empties the field, removes q at once and keeps focus', () => {
    setup('/?q=foo')
    screen.getByText('clear').focus()
    click('clear')
    expect(field().value).toBe('')
    expect(search()).toBe('')
    expect(field()).toHaveFocus()
  })

  it('writes nothing after unmounting with a wait pending', () => {
    function Shell() {
      const [shown, setShown] = useState(true)
      return (
        <>
          <button onClick={() => setShown(false)}>leave</button>
          {shown && <Harness />}
        </>
      )
    }
    render(
      <MemoryRouter>
        <Probe />
        <Shell />
      </MemoryRouter>,
    )
    type('foo')
    const before = key()
    click('leave')
    wait(1000)
    expect(search()).toBe('')
    expect(key()).toBe(before)
  })
})

describe('useListSearch: following the URL', () => {
  it('shows the URL term on the first render, cut to 200 characters when pasted longer', () => {
    setup(`/?q=${'a'.repeat(201)}`)
    expect(field().value).toBe('a'.repeat(200))
  })

  it('follows a change by other means and drops a pending wait; back restores', () => {
    setup('/')
    type('typed')
    navigateTo('/?q=bar')
    expect(field().value).toBe('bar')
    wait(300)
    expect(search()).toBe('?q=bar')
    navigateTo(-1)
    expect(field().value).toBe('')
  })

  it('drops typed but unapplied text on a path change and shows the new URL term', () => {
    setup('/folder/f-1', 'f-1')
    type('typed')
    navigateTo('/folder/f-2')
    expect(field().value).toBe('')
    wait(300)
    expect(search()).toBe('')
    type('again')
    navigateTo('/?q=zed')
    expect(field().value).toBe('zed')
  })
})

describe('useListSearch: notes and scope', () => {
  it('toggles notes by replacing the entry, keeping q; a later write keeps notes=1', () => {
    setup('/?q=foo')
    click('notes')
    expect(search()).toBe('?q=foo&notes=1')
    expect(navType()).toBe('REPLACE')
    type('foobar')
    wait(300)
    expect(search()).toBe('?q=foobar&notes=1')
    click('notes')
    expect(search()).toBe('?q=foobar')
  })

  it('keeps a pending term when notes is toggled before the wait is over', () => {
    setup('/')
    type('foo')
    click('notes')
    wait(300)
    expect(search()).toBe('?notes=1&q=foo')
  })

  it('"All bookmarks" from a folder goes to / as a push with the pending text, notes and other params', () => {
    setup('/folder/f-1?notes=1&x=1', 'f-1')
    type('foo bar')
    click('scope-all')
    expect(path()).toBe('/')
    expect(navType()).toBe('PUSH')
    const params = new URLSearchParams(search() ?? '')
    expect(params.get('q')).toBe('foo bar')
    expect(params.get('notes')).toBe('1')
    expect(params.get('x')).toBe('1')
    wait(1000)
    expect(path()).toBe('/')
    expect(field().value).toBe('foo bar')
  })

  it('goes to / without q from an empty field', () => {
    setup('/folder/f-1?q=old', 'f-1')
    type('')
    click('scope-all')
    expect(path()).toBe('/')
    expect(search()).toBe('')
  })

  it('does nothing choosing "All bookmarks" on / or the folder option on a folder page', () => {
    setup('/?q=foo')
    const before = key()
    click('scope-all')
    click('scope-folder')
    expect(key()).toBe(before)
    expect(screen.getByTestId('scope')).toHaveTextContent('all')
  })

  it('does nothing choosing the folder option on a folder page', () => {
    setup('/folder/f-1?q=foo', 'f-1')
    const before = key()
    click('scope-folder')
    expect(key()).toBe(before)
    expect(path()).toBe('/folder/f-1')
    expect(screen.getByTestId('scope')).toHaveTextContent('folder')
  })
})
