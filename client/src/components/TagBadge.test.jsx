import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import TagBadge from './TagBadge.jsx'

describe('TagBadge', () => {
  it('renders tag name uppercase', () => {
    render(<TagBadge tag="propose" />)
    expect(screen.getByText('PROPOSE')).toBeInTheDocument()
  })

  it('returns null when tag missing', () => {
    const { container } = render(<TagBadge tag={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('falls back to default color for unknown tag', () => {
    render(<TagBadge tag="UNKNOWN" />)
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
  })
})
