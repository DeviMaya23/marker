import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigationType } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SearchBar } from './SearchBar'

function Probe() {
  const location = useLocation()
  return (
    <output data-testid="url">
      {useNavigationType()} {location.pathname}
      {location.search}
    </output>
  )
}

function setup(path: string, folder?: { id: string; name?: string }) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <SearchBar folder={folder} />
      <Probe />
    </MemoryRouter>,
  )
}

const url = () => screen.getByTestId('url').textContent
const notes = () => screen.getByRole('switch', { name: 'Include notes' })
const folderOption = () => screen.getByRole('radio', { name: /subfolders/ })

describe('SearchBar', () => {
  it('on / selects "All bookmarks", disables the folder option, and has the notes switch off and disabled', () => {
    setup('/')
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'Search scope' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'All bookmarks' })).toBeChecked()
    expect(folderOption()).toHaveAttribute('aria-disabled', 'true')
    expect(folderOption()).toHaveAttribute('title', 'Open a folder to search inside it')
    expect(notes()).toHaveAttribute('aria-checked', 'false')
    expect(notes()).toHaveAttribute('aria-disabled', 'true')
  })

  it('enables the switch with a q, and toggling changes notes in the URL', async () => {
    setup('/?q=foo')
    expect(notes()).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(notes())
    expect(url()).toBe('REPLACE /?q=foo&notes=1')
    await userEvent.click(notes())
    expect(url()).toBe('REPLACE /?q=foo')
  })

  it('keeps notes in the URL when q is removed, shown on but disabled', async () => {
    setup('/?q=foo&notes=1')
    expect(notes()).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(url()).toBe('REPLACE /?notes=1')
    expect(notes()).toHaveAttribute('aria-checked', 'true')
    expect(notes()).toHaveAttribute('aria-disabled', 'true')
  })

  it('on a folder page checks the folder option and names the folder', () => {
    setup('/folder/f-1', { id: 'f-1', name: 'Recipes' })
    expect(screen.getByRole('radio', { name: '“Recipes” & subfolders' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All bookmarks' })).not.toBeChecked()
    expect(folderOption()).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('uses the generic label when the folder has no name yet', () => {
    setup('/folder/f-1', { id: 'f-1' })
    expect(screen.getByRole('radio', { name: 'This folder & subfolders' })).toBeChecked()
  })

  it('"All bookmarks" on a folder page goes to / as a push and keeps the search', async () => {
    setup('/folder/f-1?q=soup&notes=1', { id: 'f-1', name: 'Recipes' })
    await userEvent.click(screen.getByRole('radio', { name: 'All bookmarks' }))
    expect(url()).toBe('PUSH /?q=soup&notes=1')
  })

  it('has a field named "Search bookmarks" with maxLength 200', () => {
    setup('/')
    const field = screen.getByRole('searchbox', { name: 'Search bookmarks' })
    expect(field).toHaveAttribute('maxlength', '200')
    expect(field).toHaveAttribute('placeholder', 'Search title, URL and page content…')
  })

  it('shows Clear only while the field has text, and Clear empties it', () => {
    setup('/')
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByRole('searchbox')).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
  })

  it('is a div, not a form', () => {
    setup('/')
    expect(screen.getByRole('search').tagName).toBe('DIV')
  })
})
