import { fireEvent, render, screen, within } from '@testing-library/react'
import type { components } from '../api/schema'
import { isRefreshPending } from '../pages/Assets'
import { AssetLocations } from './AssetLocations'

type Asset = components['schemas']['AssetResource']

function asset(attrs: Partial<Asset>): Asset {
  return {
    item_id: 1,
    type_id: 34,
    type_name: 'Tritanium',
    name: null,
    quantity: 1,
    location_id: 60003760,
    location_name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
    location_flag: 'Hangar',
    character_id: 9001,
    character_name: 'Main Pilot',
    owner_type: 'personal',
    is_singleton: false,
    corporation_name: null,
    parent_item_id: null,
    children: [],
    children_count: 0,
    has_children: false,
    ...attrs,
  }
}

const systems = [
  {
    solar_system_id: 30000142,
    solar_system_name: 'Jita',
    stations: [
      {
        location_id: 60003760,
        location_name: 'Jita IV - Moon 4 - Caldari Navy Assembly Plant',
        item_count: 2,
        items: [
          asset({
            item_id: 100,
            type_id: 587,
            type_name: 'Rifter',
            name: 'My Rifter',
            children: [asset({ item_id: 101, type_name: 'Pyerite', quantity: 500, location_flag: 'Cargo' })],
          }),
          asset({ item_id: 102, quantity: 1000 }),
        ],
      },
    ],
  },
]

describe('AssetLocations', () => {
  it('groups by system and station, with custom names over type names', () => {
    render(<AssetLocations solarSystems={systems} empty="none" />)
    expect(screen.getByText('Jita')).toBeInTheDocument()
    expect(screen.getByText('1 station')).toBeInTheDocument()
    expect(screen.getByText('My Rifter')).toBeInTheDocument()
    expect(screen.getByText('Rifter')).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
  })

  it('shows ship contents only when toggled', () => {
    render(<AssetLocations solarSystems={systems} empty="none" />)
    expect(screen.queryByText('Pyerite')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Show 1 items inside My Rifter' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const row = screen.getByText('Pyerite').closest('tr')!
    expect(within(row).getByText('Cargo')).toBeInTheDocument()
    expect(within(row).getByText('500')).toBeInTheDocument()
  })

  it('shows the empty message when there is nothing', () => {
    render(<AssetLocations solarSystems={[]} empty="No assets found." />)
    expect(screen.getByText('No assets found.')).toBeInTheDocument()
  })
})

describe('isRefreshPending', () => {
  const queuedAt = Date.parse('2026-10-23T12:00:00Z')

  it('is false when nothing was queued', () => {
    expect(isRefreshPending('2026-10-23T11:00:00+00:00', null, queuedAt)).toBe(false)
  })

  it('waits until last_updated moves past the queue time', () => {
    expect(isRefreshPending('2026-10-23T11:00:00+00:00', queuedAt, queuedAt + 30_000)).toBe(true)
    expect(isRefreshPending(null, queuedAt, queuedAt + 30_000)).toBe(true)
    expect(isRefreshPending('2026-10-23T12:00:20+00:00', queuedAt, queuedAt + 30_000)).toBe(false)
  })

  it('gives up after ten minutes', () => {
    expect(isRefreshPending('2026-10-23T11:00:00+00:00', queuedAt, queuedAt + 11 * 60_000)).toBe(false)
  })
})
