import { fireEvent, screen } from '@testing-library/react'
import { renderWithData } from '../test/render'
import { buyText } from '../components/FittingProgramView'
import CorporateFittings from './CorporateFittings'
import CorporateFittingProgram from './CorporateFittingProgram'
import Fittings from './Fittings'
import FittingProgram from './FittingProgram'

const fitting = (id: number, name: string, attrs: object = {}) => ({
  id,
  name,
  ship_type_id: 644,
  ship_type_name: 'Typhoon',
  items: [
    { type_id: 2, name: 'Damage Control II', quantity: 1, section: 'fitted' },
    { type_id: 3, name: 'Navy Mjolnir Missile', quantity: 100, section: 'cargo' },
  ],
  created_at: '2026-10-25T10:00:00+00:00',
  updated_at: '2026-10-25T10:00:00+00:00',
  ...attrs,
})

const byLocation = { data: { summary: {}, solar_systems: [] }, meta: {} }

const item = (type_id: number, name: string, attrs: object = {}) => ({
  type_id,
  name,
  kind: 'fitted',
  required: 2,
  on_hand: 2,
  missing: 0,
  buildable: false,
  blueprint_type_id: null,
  blueprint_owned: false,
  ...attrs,
})

const plan = {
  data: {
    fittings: [{ fitting_id: 1, name: 'BaitBus', ship_type_id: 644, ship_type_name: 'Typhoon', ships: 2, ships_fittable: 1 }],
    items: [
      item(644, 'Typhoon', { kind: 'hull', on_hand: 1, missing: 1 }),
      item(2, 'Damage Control II', { on_hand: 1, missing: 1, buildable: true, blueprint_type_id: 1000, blueprint_owned: true }),
      item(3, 'Navy Mjolnir Missile', { kind: 'cargo', required: 200, on_hand: 150, missing: 50 }),
    ],
    summary: { item_types: 3, missing_types: 3, complete: false },
  },
  meta: {},
}

describe('buyText', () => {
  it('lists only items with a shortfall in Multibuy format', () => {
    expect(buyText([{ name: 'Tritanium', missing: 400 }, { name: 'Pyerite', missing: 0 }])).toBe('Tritanium 400')
  })
})

describe('Fittings', () => {
  it('lists personal fittings with their hull', () => {
    renderWithData(<Fittings />, [[['fittings', 'personal'], { fittings: [fitting(1, 'BaitBus')], enabled: true, canView: true, canManage: true, corporationName: null }]])
    expect(screen.getByRole('heading', { name: 'My fittings' })).toBeInTheDocument()
    expect(screen.getByText('BaitBus')).toBeInTheDocument()
    expect(screen.getByText('Typhoon')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save fitting' })).toBeDisabled()
  })

  it('enables saving once EFT text is pasted', () => {
    renderWithData(<Fittings />, [[['fittings', 'personal'], { fittings: [], enabled: true, canView: true, canManage: true, corporationName: null }]])
    fireEvent.change(screen.getByLabelText('Fitting (EFT format)'), { target: { value: '[Typhoon, X]\nDamage Control II' } })
    expect(screen.getByRole('button', { name: 'Save fitting' })).toBeEnabled()
  })
})

describe('CorporateFittings', () => {
  it('explains when corporate build programs are not enabled', () => {
    renderWithData(<CorporateFittings />, [[['fittings', 'corporate'], { fittings: [], enabled: false, canView: false, canManage: false, corporationName: null }]])
    expect(screen.getByText(/not enabled for your corporation/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save fitting' })).not.toBeInTheDocument()
  })

  it('lets members view but hides the add form', () => {
    renderWithData(<CorporateFittings />, [
      [['fittings', 'corporate'], { fittings: [fitting(5, 'CorpBus')], enabled: true, canView: true, canManage: false, corporationName: 'Test Corp' }],
    ])
    expect(screen.getByText('CorpBus')).toBeInTheDocument()
    expect(screen.getByText('Test Corp')).toBeInTheDocument()
    expect(screen.getByText(/Only a Director, CEO or Factory Manager/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
})

describe('FittingProgram', () => {
  const list = { fittings: [fitting(1, 'BaitBus')], enabled: true, canView: true, canManage: true, corporationName: null }
  const planKey = (scope: string) => ['fitting-plan', scope, { selections: [{ fitting_id: 1, ships: 2 }], include_hull: true, location_ids: [] }]

  it('asks for a number of ships first', () => {
    renderWithData(<FittingProgram />, [[['fittings', 'personal'], list], [['assets', 'personal', 'by-location', ''], byLocation]])
    expect(screen.getByText('Enter a number of ships for at least one fitting.')).toBeInTheDocument()
  })

  it('shows the shortfall and how to cover it', () => {
    renderWithData(<FittingProgram />, [
      [['fittings', 'personal'], list],
      [['assets', 'personal', 'by-location', ''], byLocation],
      [planKey('personal'), { plan: plan.data, meta: {}, characterName: null }],
    ])
    fireEvent.change(screen.getByLabelText('Ships of BaitBus'), { target: { value: '2' } })

    expect(screen.getByText('3 of 3 item types are short')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    // Damage Control has a blueprint you own; the missiles can only be bought.
    expect(screen.getByText('blueprint owned')).toBeInTheDocument()
    expect(screen.getAllByText('Buy only')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Create build program (1 items)' })).toBeEnabled()
    // Unticking the build leaves it on the buy list.
    fireEvent.click(screen.getByRole('checkbox', { name: /Build/ }))
    expect(screen.getByRole('button', { name: 'Create build program (0 items)' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Copy buy list (3)' })).toBeInTheDocument()
  })

  it('says everything is in stock when nothing is missing', () => {
    const done = { ...plan.data, items: plan.data.items.map((i) => ({ ...i, missing: 0 })), summary: { item_types: 3, missing_types: 0, complete: true } }
    renderWithData(<FittingProgram />, [
      [['fittings', 'personal'], list],
      [['assets', 'personal', 'by-location', ''], byLocation],
      [planKey('personal'), { plan: done, meta: {}, characterName: null }],
    ])
    fireEvent.change(screen.getByLabelText('Ships of BaitBus'), { target: { value: '2' } })
    expect(screen.getByText('Everything is in stock')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create build program/ })).not.toBeInTheDocument()
  })
})

describe('CorporateFittingProgram', () => {
  it('names the director whose token read the corporation assets', () => {
    const list = { fittings: [fitting(1, 'CorpBus')], enabled: true, canView: true, canManage: true, corporationName: 'Test Corp' }
    renderWithData(<CorporateFittingProgram />, [
      [['fittings', 'corporate'], list],
      [['assets', 'corporate', 'by-location', ''], byLocation],
      [
        ['fitting-plan', 'corporate', { selections: [{ fitting_id: 1, ships: 2 }], include_hull: true, location_ids: [] }],
        { plan: plan.data, meta: {}, characterName: 'Director Dan' },
      ],
    ])
    fireEvent.change(screen.getByLabelText('Ships of CorpBus'), { target: { value: '2' } })
    expect(screen.getByRole('heading', { name: 'Corporate fitting program' })).toBeInTheDocument()
    expect(screen.getByText(/Director Dan/)).toBeInTheDocument()
  })
})
