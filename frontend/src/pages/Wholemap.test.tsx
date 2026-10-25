import { fireEvent, screen, within } from '@testing-library/react'
import { me, renderWithData } from '../test/render'
import Wholemap from './Wholemap'

const connection = {
  id: 5,
  signature_id: 1,
  from_system_id: 31000005,
  from_system_name: 'J123456',
  to_system_id: 30000142,
  to_system_name: 'Jita',
  wormhole_type: 'K162',
  size: 'large',
  life: 'critical',
  mass: 'stable',
  created_at: '2026-10-23T10:00:00+00:00',
  updated_at: '2026-10-23T10:00:00+00:00',
}

const sig = (attrs: object) => ({
  id: 1,
  signature_id: 'ABC-123',
  system_id: 31000005,
  system_name: 'J123456',
  type: 'wormhole',
  name: null,
  bookmark: null,
  description: null,
  locked: false,
  created_by: 'Pilot',
  updated_by: 'Pilot',
  created_at: '2026-10-23T10:00:00+00:00',
  updated_at: '2026-10-23T10:00:00+00:00',
  connection: null,
  ...attrs,
})

function map(signatures: object[], connections: object[] = []) {
  return {
    data: {
      signatures,
      connections,
      notes: [{ id: 9, system_id: 30000142, system_name: 'Jita', status: 'hostile', comment: 'camper', created_at: null, updated_at: null }],
      systems: [{ system_id: 31000005, system_name: 'J123456' }],
    },
    meta: {},
  }
}

describe('Wholemap', () => {
  it('shows stats, the chain, signatures and notes', () => {
    renderWithData(<Wholemap />, [
      [['wholemap', 'map', null], map([sig({}), sig({ id: 2, signature_id: 'DEF-456', type: 'gas', system_name: 'Jita' })], [connection])],
      [['me'], me([])],
    ])
    const stats = screen.getByText('Signatures', { selector: 'dt' }).previousSibling
    expect(stats).toHaveTextContent('2')
    expect(screen.getByText('Wormholes', { selector: 'dt' }).previousSibling).toHaveTextContent('1')
    const chain = screen.getByRole('region', { name: 'Wormhole chain' })
    expect(within(chain).getByText('J123456')).toBeInTheDocument()
    expect(within(chain).getByText('Critical')).toBeInTheDocument()
    expect(screen.getByText('camper')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument()
  })

  it('filters signatures by type', () => {
    renderWithData(<Wholemap />, [
      [['wholemap', 'map', null], map([sig({}), sig({ id: 2, signature_id: 'DEF-456', type: 'gas' })])],
      [['me'], me([])],
    ])
    expect(screen.getByText('ABC-123')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Gas' }))
    expect(screen.queryByText('ABC-123')).not.toBeInTheDocument()
    expect(screen.getByText('DEF-456')).toBeInTheDocument()
  })

  it('does not offer Edit on a locked signature', () => {
    renderWithData(<Wholemap />, [
      [['wholemap', 'map', null], map([sig({ locked: true })])],
      [['me'], me([])],
    ])
    expect(within(screen.getByRole('table')).getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeInTheDocument()
  })

  it('says so when nothing is mapped', () => {
    renderWithData(<Wholemap />, [[['wholemap', 'map', null], { data: { signatures: [], connections: [], notes: [], systems: [] }, meta: {} }], [['me'], me([])]])
    expect(screen.getByText(/No wormhole connections mapped yet/)).toBeInTheDocument()
    expect(screen.getByText('No signatures recorded.')).toBeInTheDocument()
  })
})
