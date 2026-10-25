import { act, fireEvent, render, screen } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { markUpdateReady, resetUpdateState } from '../pwa/updateState'
import { PwaStatus } from './PwaStatus'

afterEach(() => {
  act(() => { onlineManager.setOnline(true); resetUpdateState() })
})

it('renders nothing while online with no update', () => {
  const { container } = render(<PwaStatus />)
  expect(container).toBeEmptyDOMElement()
})

it('shows an offline notice and clears it when the connection returns', () => {
  render(<PwaStatus />)
  act(() => onlineManager.setOnline(false))
  expect(screen.getByRole('status')).toHaveTextContent(/offline/i)
  act(() => onlineManager.setOnline(true))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('offers a reload when a new service worker is waiting', () => {
  const apply = vi.fn().mockResolvedValue(undefined)
  render(<PwaStatus />)
  act(() => markUpdateReady(apply))
  fireEvent.click(screen.getByRole('button', { name: 'Reload to update' }))
  expect(apply).toHaveBeenCalledTimes(1)
})
