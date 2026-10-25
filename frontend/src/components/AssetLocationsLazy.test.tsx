import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useAssetItems } from '../api/queries'
import { AssetLocations } from './AssetLocations'

vi.mock('../api/queries', () => ({ useAssetItems: vi.fn() }))

it('loads locations and container pages only when opened, retaining the inventory version', async () => {
  const fetchNextPage = vi.fn()
  vi.mocked(useAssetItems).mockReturnValue({
    isPending: false, isError: false, hasNextPage: true, isFetchingNextPage: false,
    fetchNextPage,
    data: { pages: [{ data: [{ item_id: 101, type_id: 587, type_name: 'Rifter', name: null,
      quantity: 1, character_id: 9001, character_name: 'Pilot', children: [],
      children_count: 2, has_children: true }] }] },
  } as unknown as ReturnType<typeof useAssetItems>)
  render(<AssetLocations scope="personal" revision="12,14" search="Rifter" empty="none" solarSystems={[{
    solar_system_id: 30000142, solar_system_name: 'Jita', stations: [{
      location_id: 60003760, location_name: 'Jita station', items: [], item_count: 1000,
    }],
  }]} />)
  expect(useAssetItems).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('Jita station'))
  await waitFor(() => expect(useAssetItems).toHaveBeenCalledWith('personal', {
    location_id: 60003760, parent_item_id: undefined, search: 'Rifter',
  }, '12,14'))
  fireEvent.click(screen.getByRole('button', { name: 'Show more items' }))
  expect(fetchNextPage).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: 'Show 2 items inside Rifter' }))
  expect(useAssetItems).toHaveBeenLastCalledWith('personal', {
    location_id: undefined, parent_item_id: 101, search: 'Rifter',
  }, '12,14')
})
