import { render, screen } from '@testing-library/react'
import { FreshnessBadge, formatAge } from './FreshnessBadge'

const now = new Date('2026-10-23T12:00:00Z')

describe('formatAge', () => {
  it.each([
    ['2026-10-23T11:59:50Z', 'just now'],
    ['2026-10-23T11:48:00Z', '12 min ago'],
    ['2026-10-23T09:00:00Z', '3 h ago'],
    ['2026-10-18T12:00:00Z', '5 d ago'],
  ])('%s -> %s', (iso, expected) => {
    expect(formatAge(iso, now)).toBe(expected)
  })
})

describe('FreshnessBadge', () => {
  it('shows age for fresh data', () => {
    render(<FreshnessBadge asOf="2026-10-23T11:48:00Z" now={now} />)
    expect(screen.getByRole('status')).toHaveTextContent('Prices as of 12 min ago')
    expect(screen.getByRole('status')).toHaveClass('badge-fresh')
  })

  it('marks stale data', () => {
    render(<FreshnessBadge asOf="2026-10-23T08:00:00Z" stale now={now} />)
    expect(screen.getByRole('status')).toHaveTextContent('(stale)')
    expect(screen.getByRole('status')).toHaveClass('badge-stale')
  })

  it('says no data instead of implying a price', () => {
    render(<FreshnessBadge asOf={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('no data yet')
  })
})
