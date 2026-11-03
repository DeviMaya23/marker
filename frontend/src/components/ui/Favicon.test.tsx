import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Favicon } from './Favicon'

describe('Favicon', () => {
  it('shows an image from favicon_url', () => {
    const { container } = render(<Favicon url="https://example.com" faviconUrl="/api/v1/favicons/1" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/v1/favicons/1')
    expect(screen.queryByTestId('favicon-tile')).not.toBeInTheDocument()
  })

  it('falls back to a lettered tile when favicon_url is null', () => {
    const { container } = render(<Favicon url="https://example.com/a" faviconUrl={null} />)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('favicon-tile')).toHaveTextContent('E')
  })

  it('falls back to the tile when the image fails to load', () => {
    const { container } = render(<Favicon url="https://example.com/a" faviconUrl="/api/v1/favicons/1" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('favicon-tile')).toHaveTextContent('E')
  })

  it('tries a new image again after an earlier one failed', () => {
    const { container, rerender } = render(<Favicon url="https://example.com" faviconUrl="/old" />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    rerender(<Favicon url="https://example.com" faviconUrl="/new" />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/new')
  })

  it('uses "?" for a url with no usable host name', () => {
    render(<Favicon url="" faviconUrl={null} />)
    expect(screen.getByTestId('favicon-tile')).toHaveTextContent('?')
  })
})
