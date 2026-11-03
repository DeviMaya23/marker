import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Favicon } from './Favicon'

describe('Favicon', () => {
  it('shows a lettered tile when there is no favicon url', () => {
    render(<Favicon url="https://example.com/a" faviconUrl={null} />)
    expect(screen.getByTestId('favicon-tile')).toHaveTextContent('E')
  })

  it('shows the image when there is a favicon url', () => {
    const { container } = render(<Favicon url="https://example.com/a" faviconUrl="/api/v1/favicons/1" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/v1/favicons/1')
    expect(screen.queryByTestId('favicon-tile')).not.toBeInTheDocument()
  })

  it('falls back to the tile when the image fails to load', () => {
    const { container } = render(<Favicon url="https://example.com/a" faviconUrl="/api/v1/favicons/1" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByTestId('favicon-tile')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
