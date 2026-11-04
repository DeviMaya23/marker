import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { listenerCount, setViewport } from '../test/viewport'
import { useMediaQuery } from './useMediaQuery'

function Probe() {
  return <p>{useMediaQuery('(max-width: 767px)') ? 'narrow' : 'wide'}</p>
}

describe('useMediaQuery', () => {
  it.each([
    [500, 'narrow'],
    [767, 'narrow'],
    [768, 'wide'],
  ])('returns the match on the first render at %ipx', (width, label) => {
    setViewport(width)
    render(<Probe />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('follows a change event', () => {
    render(<Probe />)
    expect(screen.getByText('wide')).toBeInTheDocument()
    setViewport(400)
    expect(screen.getByText('narrow')).toBeInTheDocument()
    setViewport(900)
    expect(screen.getByText('wide')).toBeInTheDocument()
  })

  it('stops listening on unmount', () => {
    const { unmount } = render(<Probe />)
    expect(listenerCount()).toBeGreaterThan(0)
    unmount()
    expect(listenerCount()).toBe(0)
  })
})
