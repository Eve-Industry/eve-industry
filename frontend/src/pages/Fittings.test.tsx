import { fireEvent, screen } from '@testing-library/react'
import { renderWithData } from '../test/render'
import { buyText, groupShipContents } from '../components/FittingProgramView'
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
    fittings: [
      { fitting_id: 1, name: 'BaitBus', ship_type_id: 644, ship_type_name: 'Typhoon', ships: 2, ships_fitted: 0, ships_fittable: 1, existing_ships: [] as object[] },
    ],
    items: [
      item(644, 'Typhoon', { kind: 'hull', on_hand: 1, missing: 1 }),
      item(2, 'Damage Control II', { on_hand: 1, missing: 1, buildable: true, blueprint_type_id: 1000, blueprint_owned: true }),
      item(3, 'Navy Mjolnir Missile', { kind: 'cargo', required: 200, on_hand: 150, missing: 50 }),
    ],
    summary: { item_types: 3, missing_types: 3, complete: false },
  },
  meta: {},
}

describe('groupShipContents', () => {
  const item = (flag: string, name: string, quantity = 1) => ({ type_id: 1, name, quantity, flag })

  it('splits slots, cargo and other holds, each on its own', () => {
    const groups = groupShipContents([
      item('HiSlot0', 'Launcher'),
      item('HiSlot0', 'Scourge Fury Heavy Missile'),
      item('MedSlot2', 'Sensor Booster'),
      item('LoSlot0', 'Damage Control II'),
      item('RigSlot1', 'Trimark Pump'),
      item('Cargo', 'Nanite Repair Paste', 250),
      item('Cargo', 'Cap Booster'),
      item('DroneBay', 'Warrior II', 5),
      item('FighterBay', 'Templar'),
    ])

    expect(groups.slots.map((g) => g.title)).toEqual(['High slots', 'Mid slots', 'Low slots', 'Rig slots'])
    // A module and its loaded charge share a slot.
    expect(groups.slots[0]?.lines.map((l) => `${l.slot}: ${l.name}`)).toEqual(['Slot 1: Launcher', 'Slot 1: Scourge Fury Heavy Missile'])
    expect(groups.slots[1]?.lines[0]?.slot).toBe('Slot 3')
    expect(groups.cargo.map((l) => l.name)).toEqual(['Cap Booster', 'Nanite Repair Paste'])
    expect(groups.holds.map((g) => g.title)).toEqual(['Drone bay', 'Fighter bay'])
  })

  it('keeps unknown flags in the other holds instead of dropping them', () => {
    const groups = groupShipContents([item('HiddenModifiers', 'Thing'), item('', 'Loose')])

    expect(groups.slots).toEqual([])
    expect(groups.holds.map((g) => g.title).sort()).toEqual(['Hidden modifiers', 'Other'])
  })
})

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
  const planKey = (scope: string) => [
    'fitting-plan',
    scope,
    { selections: [{ fitting_id: 1, ships: 2 }], include_hull: true, count_fitted_ships: true, location_ids: [] },
  ]

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

  it('lists ships you already have, fitted and partly fitted', () => {
    const withShips = {
      ...plan.data,
      fittings: [
        {
          ...plan.data.fittings[0],
          ships_fitted: 1,
          existing_ships: [
            { item_id: 10, name: 'Home defense 01', location_id: 60003760, location_name: 'Jita IV - Moon 4', status: 'fitted', fitted_count: 17, total_count: 17, counted: true, missing: [],
              contents: [
                { type_id: 2, name: 'Rapid Heavy Missile Launcher II', quantity: 1, flag: 'HiSlot0' },
                { type_id: 3, name: 'Scourge Fury Heavy Missile', quantity: 1, flag: 'HiSlot0' },
                { type_id: 4, name: 'Damage Control II', quantity: 1, flag: 'LoSlot0' },
                { type_id: 5, name: 'Nanite Repair Paste', quantity: 250, flag: 'Cargo' },
                { type_id: 6, name: 'Warrior II', quantity: 5, flag: 'DroneBay' },
              ] },
            { item_id: 11, name: null, location_id: 60003760, location_name: 'Amarr VIII', status: 'partial', fitted_count: 12, total_count: 17, counted: false, missing: [{ type_id: 2, name: 'Damage Control II', quantity: 1 }], contents: [] },
          ],
        },
      ],
    }
    renderWithData(<FittingProgram />, [
      [['fittings', 'personal'], list],
      [['assets', 'personal', 'by-location', ''], byLocation],
      [planKey('personal'), { plan: withShips, meta: {}, characterName: null }],
    ])
    fireEvent.change(screen.getByLabelText('Ships of BaitBus'), { target: { value: '2' } })

    const panel = screen.getByRole('region', { name: 'Existing BaitBus ships' })
    expect(panel).toHaveTextContent('1 of 2 wanted already fitted')
    expect(panel).toHaveTextContent('Home defense 01')
    expect(panel).toHaveTextContent('Jita IV - Moon 4')
    expect(panel).toHaveTextContent('17/17')
    expect(panel).toHaveTextContent('Fitted · counted')
    // An unnamed ship falls back to its hull; a partly fitted one says what it lacks.
    expect(panel).toHaveTextContent('Typhoon')
    expect(panel).toHaveTextContent('12/17')
    expect(panel).toHaveTextContent('Partly fitted')
    expect(panel).toHaveTextContent('Needs 1 × Damage Control II')

    // Contents stay hidden until a ship is expanded.
    expect(panel).not.toHaveTextContent('Nanite Repair Paste')
    const toggle = screen.getByRole('button', { name: 'Show contents of Home defense 01' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Hide contents of Home defense 01' })).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toHaveTextContent('High slots')
    expect(panel).toHaveTextContent('Slot 1 · Rapid Heavy Missile Launcher II')
    expect(panel).toHaveTextContent('Slot 1 · Scourge Fury Heavy Missile')
    expect(panel).toHaveTextContent('Low slots')
    expect(panel).toHaveTextContent('Slot 1 · Damage Control II')
    // Cargo and the drone bay are listed apart from the fitted slots.
    expect(panel).toHaveTextContent('Cargo hold')
    expect(panel).toHaveTextContent('250 × Nanite Repair Paste')
    expect(panel).toHaveTextContent('Drone bay')
    expect(panel).toHaveTextContent('5 × Warrior II')

    // An empty ship says so, and collapsing hides the lists again.
    fireEvent.click(screen.getByRole('button', { name: 'Show contents of Typhoon' }))
    expect(panel).toHaveTextContent('Nothing inside this ship.')
    fireEvent.click(screen.getByRole('button', { name: 'Hide contents of Home defense 01' }))
    expect(panel).not.toHaveTextContent('Nanite Repair Paste')
  })

  it('shows no ship panel when you have none', () => {
    renderWithData(<FittingProgram />, [
      [['fittings', 'personal'], list],
      [['assets', 'personal', 'by-location', ''], byLocation],
      [planKey('personal'), { plan: plan.data, meta: {}, characterName: null }],
    ])
    fireEvent.change(screen.getByLabelText('Ships of BaitBus'), { target: { value: '2' } })
    expect(screen.queryByRole('region', { name: /Existing/ })).not.toBeInTheDocument()
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
        ['fitting-plan', 'corporate', { selections: [{ fitting_id: 1, ships: 2 }], include_hull: true, count_fitted_ships: true, location_ids: [] }],
        { plan: plan.data, meta: {}, characterName: 'Director Dan' },
      ],
    ])
    fireEvent.change(screen.getByLabelText('Ships of CorpBus'), { target: { value: '2' } })
    expect(screen.getByRole('heading', { name: 'Corporate fitting program' })).toBeInTheDocument()
    expect(screen.getByText(/Director Dan/)).toBeInTheDocument()
  })
})
