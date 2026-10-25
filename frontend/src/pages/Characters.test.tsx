import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import Characters from './Characters'
import { renderWithData } from '../test/render'

const mutations = vi.hoisted(() => ({ main: vi.fn(), remove: vi.fn(), deleteAccount: vi.fn() }))
vi.mock('../api/account', () => ({
  useCharacterActions: () => Object.fromEntries(Object.entries(mutations).map(([key, mutate]) => [key, { mutate, error: null, isPending: false }])),
}))

const pilot = (id: number, is_main = false) => ({ character_id: id, name: `Pilot ${id}`, is_main, is_esi_active: true, corporation_name: 'Corp', cached_location: 'Jita', cached_training: 'Industry V' })

beforeEach(() => vi.clearAllMocks())

it('shows management actions, training and location, and switches the selected main', () => {
  renderWithData(<Characters />, [[['me'], { data: { characters: [pilot(1, true), pilot(2)] } }]])
  expect(screen.getAllByText('Location: Jita')).toHaveLength(2)
  expect(screen.getAllByText('Training: Industry V')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Set Pilot 2 as main' }))
  expect(mutations.main).toHaveBeenCalledWith(2)
  expect(screen.getByRole('link', { name: 'Add character' })).toHaveAttribute('href', '/auth/eve/scopes')
})

it('keeps the only character and requires confirmation before account deletion', () => {
  renderWithData(<Characters />, [[['me'], { data: { characters: [pilot(1, true)] } }]])
  expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
  expect(mutations.deleteAccount).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
  expect(mutations.deleteAccount).toHaveBeenCalledOnce()
  confirm.mockRestore()
})
