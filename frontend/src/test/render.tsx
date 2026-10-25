import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Render with a router and a query cache pre-filled with `data` (query key →
 * response), so pages render without any request. Queries never retry.
 * `entries` are the router history (default: the root path).
 */
export function renderWithData(ui: ReactNode, data: Array<[readonly unknown[], unknown]> = [], entries: string[] = ['/']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  for (const [key, value] of data) client.setQueryData(key, value)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/** A /me response with one character holding `scopes`. */
export function me(scopes: string[]) {
  return {
    data: {
      id: 1,
      display_name: 'Pilot',
      characters: [{ character_id: 1, name: 'Pilot', scopes, is_main: true, is_esi_active: true }],
    },
    meta: {},
  }
}
