import { fireEvent, screen, within } from '@testing-library/react'
import { renderWithData } from '../test/render'
import ManufacturingBrowser from './ManufacturingBrowser'
import ReactionBrowser from './ReactionBrowser'

const freshness = { prices_as_of: '2026-10-23T12:00:00+00:00', costs_as_of: null, source: 'market_orders', stale: false }
const sellScore = { score: 7, avg_daily_volume: 50, avg_order_count: 10, active_days: 28, total_days: 30 }

const row = (attrs: object) => ({
  blueprint_type_id: 1,
  blueprint_name: 'X Blueprint',
  product_type_id: 1,
  product_name: 'X',
  product_icon_url: '',
  portion_size: 1,
  total_output: 1,
  total_input_cost: 1000,
  total_output_value: 2000,
  job_fee: 0,
  facility_tax: 0,
  total_job_cost: 0,
  scc_fee: 80,
  profit: 920,
  profit_positive: true,
  profit_per_unit: 920,
  profit_margin: 92,
  base: null,
  sell_score: sellScore,
  ...attrs,
})

function names() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]?.textContent)
}

describe('ManufacturingBrowser', () => {
  const tree = {
    data: [{ market_group_id: 100, name: 'Bombs', has_types: true, children: [] }],
    meta: {},
  }
  const key = [
    'calculators',
    'manufacturing-browser',
    { market_group_id: 100, me_level: 0, price_region_id: 10000002, runs: 1, rig_tier: 'none', security_space: 'highsec', facility_tax: 0, system_cost_index: 0, page: 1, per_page: 100 },
  ] as const
  const browse = {
    data: [row({ product_type_id: 1, product_name: 'Electron Bomb', profit: 500 }), row({ product_type_id: 2, product_name: 'Void Bomb', blueprint_name: 'Void Bomb Blueprint', profit: -100 })],
    meta: { effective_structure_me_bonus: 0, freshness, pagination: { page: 1, per_page: 100, total: 2, last_page: 1 } },
  }

  it('asks for a group first, then lists its items best profit first', () => {
    renderWithData(<ManufacturingBrowser />, [[['reference', 'market-groups', 'tree'], tree], [key, browse]])

    expect(screen.getByText(/Select a market group/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bombs' }))

    expect(screen.getByRole('heading', { name: 'Manufacturing profitability: Bombs' })).toBeInTheDocument()
    expect(names()).toEqual(['Electron Bomb', 'Void Bomb'])
  })

  it('filters by item or blueprint name and re-sorts by a clicked column', () => {
    renderWithData(<ManufacturingBrowser />, [[['reference', 'market-groups', 'tree'], tree], [key, browse]])
    fireEvent.click(screen.getByRole('button', { name: 'Bombs' }))

    fireEvent.change(screen.getByPlaceholderText('Filter by name…'), { target: { value: 'void bomb blueprint' } })
    expect(names()).toEqual(['Void Bomb'])

    fireEvent.change(screen.getByPlaceholderText('Filter by name…'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Item/ }))
    expect(names()).toEqual(['Electron Bomb', 'Void Bomb'])
    fireEvent.click(screen.getByRole('button', { name: /Item/ }))
    expect(names()).toEqual(['Void Bomb', 'Electron Bomb'])
  })
})

describe('ReactionBrowser', () => {
  const structures = { data: [], meta: { pagination: { page: 1, per_page: 200, total: 0, last_page: 1 } } }
  const key = [
    'calculators',
    'reaction-browser',
    { runs: 1, rig_tier: 'none', security_space: 'lowsec', facility_tax: 0, system_cost_index: 0, price_region_id: 10000002, per_page: 200 },
  ] as const
  const reactions = {
    data: [
      row({ product_type_id: 1, product_name: 'Plasmoid', formula_name: 'Plasmoid Formula', reaction_category: 'composite', reaction_complexity: 'intermediate', profit: 10 }),
      row({ product_type_id: 2, product_name: 'Booster', formula_name: 'Booster Formula', reaction_category: 'biochemical', reaction_complexity: 'complex', profit: 20 }),
    ],
    meta: { effective_rig_bonus: 0, freshness, pagination: { page: 1, per_page: 200, total: 2, last_page: 1 } },
  }

  it('calculates on submit and filters by reaction type', () => {
    renderWithData(<ReactionBrowser />, [[['structures', 'reaction'], structures], [key, reactions]])

    expect(screen.getByText(/calculate to see profitability/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Calculate all reactions' }))
    expect(names()).toEqual(['Booster', 'Plasmoid'])

    fireEvent.change(screen.getByLabelText('Reaction type'), { target: { value: 'composite' } })
    expect(names()).toEqual(['Plasmoid'])
  })
})
