import { fireEvent, screen } from '@testing-library/react'
import { me, renderWithData } from '../test/render'
import CanProduce, { filterSources } from './CanProduce'
import Dashboard from './Dashboard'
import IndustryJobs from './IndustryJobs'
import { BlueprintResearch, ReactionFormulaResearch } from './Research'
import StockManager, { parseQuantity } from './StockManager'

const freshness = { prices_as_of: '2026-10-23T12:00:00+00:00', costs_as_of: null, source: 'orders', stale: false }

const job = (attrs: object) => ({
  job_id: 1,
  type_id: 587,
  item_name: 'Rifter',
  item_image_url: null,
  character_name: 'Ana',
  location: 'Jita IV',
  runs: 2,
  expected_output: 10,
  estimated_value: 10_000_000,
  time_remaining: '1h 0m',
  seconds_remaining: 3600,
  end_date: '2026-10-23T13:00:00+00:00',
  progress_pct: 50,
  ready_for_delivery: false,
  ...attrs,
})

describe('Dashboard', () => {
  const data = {
    data: {
      industry: { in_progress: 4, ready_jobs: 2, available_slots: 7 },
      planetary: { total_planets: 3, expired_extractors: 1, full_storage: 0 },
      account: { joined_at: '2026-01-01T00:00:00+00:00', last_login_at: null },
      characters: [
        {
          character_id: 1,
          name: 'Ana',
          portrait_url: 'p',
          corporation_name: 'Corp',
          corporation_logo: null,
          alliance_name: null,
          alliance_logo: null,
          location: 'Jita',
          training: null,
          is_main: true,
          is_esi_active: false,
        },
      ],
      reaction_plans: [{ id: 1, name: 'Moon goo', t2_type_name: null, updated_at: null }],
      invention_plans: [],
    },
    meta: {},
  }

  it('shows the counts, PI alerts, plans and the expired-token warning', () => {
    renderWithData(<Dashboard />, [[['dashboard'], data]])
    expect(screen.getByText('In-progress jobs').previousSibling).toHaveTextContent('4')
    expect(screen.getByText('PI alerts').previousSibling).toHaveTextContent('1')
    expect(screen.getByText('1 expired extractor')).toBeInTheDocument()
    expect(screen.getByText('Moon goo')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('ESI token expired')
    expect(screen.getByRole('link', { name: 'Re-authenticate' })).toHaveAttribute('href', '/auth/eve')
  })
})

describe('IndustryJobs', () => {
  const overview = {
    data: {
      total_jobs: 2,
      groups: [
        { activity_name: 'Manufacturing', jobs: [job({}), job({ job_id: 2, estimated_value: null })] },
      ],
      summary: [
        {
          type_id: 587,
          item_name: 'Rifter',
          item_image_url: null,
          total_runs: 4,
          total_expected_output: 20,
          job_count: 2,
          estimated_value: 10_000_000,
        },
      ],
      estimated_total: 10_000_000,
    },
    meta: { region: { region_id: 10000002, region_name: 'The Forge' }, freshness },
  }

  it('values priced jobs and shows a dash, not 0, for unpriced ones', () => {
    renderWithData(<IndustryJobs />, [[['industry', 'jobs', { region_id: '10000002' }], overview]])
    expect(screen.getAllByText('10.00M ISK').length).toBeGreaterThan(0)
    const rows = screen.getAllByRole('row').filter((r) => r.textContent?.includes('Rifter') && r.textContent?.includes('Ana'))
    expect(rows[1]).toHaveTextContent('—')
    expect(rows[1]).not.toHaveTextContent('0.00')
    expect(screen.getByText('The Forge prices as of', { exact: false })).toBeInTheDocument()
  })

  it('says so when there are no jobs', () => {
    renderWithData(<IndustryJobs />, [
      [['industry', 'jobs', { region_id: '10000002' }], { ...overview, data: { total_jobs: 0, groups: [], summary: [], estimated_total: null } }],
    ])
    expect(screen.getByText('No active industry jobs found.')).toBeInTheDocument()
  })
})

describe('CanProduce', () => {
  const item = (name: string, id = 1) => ({
    blueprint_type_id: id,
    product_type_id: 2,
    product_name: name,
    product_qty_per_run: 1,
    me: 10,
    te: 0,
    max_runs: 5,
    buildable_runs: 3,
    total_output: 3,
    materials: [{ type_id: 34, name: 'Tritanium', required_per_run: 10, available: 35, runs_possible: 3 }],
  })
  const source = {
    type: 'character',
    character_id: 1,
    character_name: 'Ana',
    portrait_url: null,
    corporation_id: 5,
    corporation_name: 'Corp',
    corporation_logo: null,
    blueprint_count: 2,
    material_count: 1,
    buildable: [item('Rifter', 1), item('Slasher', 2)],
    available_materials: [{ type_id: 34, name: 'Tritanium', quantity: 35 }],
  }

  it('lists buildable items, marks copies and expands materials', () => {
    renderWithData(<CanProduce />, [[['industry', 'can-produce'], { data: [source], meta: {} }]])
    expect(screen.getByText('Rifter')).toBeInTheDocument()
    expect(screen.getAllByText('BPC')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: /3 types|1 types/ })[0]!)
    expect(screen.getByText(/per run/)).toBeInTheDocument()
  })

  it('filters by product name and drops sources with no match', () => {
    expect(filterSources([source], 'rift')[0]!.buildable.map((i) => i.product_name)).toEqual(['Rifter'])
    expect(filterSources([source], 'zzz')).toEqual([])
    expect(filterSources([source], ' ')).toEqual([source])
  })

  it('explains an empty result', () => {
    renderWithData(<CanProduce />, [[['industry', 'can-produce'], { data: [], meta: {} }]])
    expect(screen.getByText('No buildable items found')).toBeInTheDocument()
  })
})

describe('Research pages', () => {
  const pagination = { page: 1, per_page: 100, total: 2, last_page: 1 }
  const query = { search: undefined, market_group: undefined, sort: 'name', dir: 'asc', page: 1, per_page: 100 }

  it('blueprint research shows ownership, ME/TE with scope, and a CSV link with the filters', () => {
    renderWithData(<BlueprintResearch />, [
      [
        ['industry', 'blueprint-research', query],
        {
          data: [
            { type_id: 1, name: 'Rifter Blueprint', market_group_id: 5, market_group_name: 'Frigates', owned: true, me: 10, te: 20, owner_names: ['Ana', 'Bo'] },
            { type_id: 2, name: 'Atron Blueprint', market_group_id: 5, market_group_name: null, owned: false, me: null, te: null, owner_names: [] },
          ],
          meta: {
            has_blueprint_data: true,
            characters_without_scope: [{ character_id: 9, name: 'Cy' }],
            market_groups: [{ market_group_id: 5, name: 'Frigates' }],
            pagination,
          },
        },
      ],
    ])
    expect(screen.getByText('Ana, Bo')).toBeInTheDocument()
    expect(screen.getByText('Unknown')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Cy')
    expect(screen.getByText('Blueprints (2)')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/industry/blueprint-research/export?sort=name&dir=asc')
  })

  it('formula research hides the quantity column without blueprint data', () => {
    renderWithData(<ReactionFormulaResearch />, [
      [
        ['industry', 'reaction-formula-research', { search: undefined, category: undefined, sort: 'name', dir: 'asc' }],
        {
          data: [{ type_id: 1, name: 'Carbon Fiber Formula', group_id: 1888, category: 'Composite', owned: false, quantity: 0, owner_names: [] }],
          meta: { has_blueprint_data: false, characters_without_scope: [], categories: [{ group_id: 1888, name: 'Composite' }] },
        },
      ],
    ])
    expect(screen.getByText('Carbon Fiber Formula')).toBeInTheDocument()
    expect(screen.queryByText('Qty')).not.toBeInTheDocument()
  })
})

describe('StockManager', () => {
  it('parses quantities strictly', () => {
    expect(parseQuantity('12')).toBe(12)
    expect(parseQuantity('0')).toBe(0)
    expect(parseQuantity('')).toBeNull()
    expect(parseQuantity('-1')).toBeNull()
    expect(parseQuantity('1.5')).toBeNull()
  })

  it('shows on hand and shortfall, warns about corporation assets and only enables Save on a change', () => {
    renderWithData(<StockManager />, [
      [['me'], me(['esi-assets.read_corporation_assets.v1'])],
      [
        ['stock'],
        {
          data: [{ id: 1, type_id: 34, type_name: 'Tritanium', desired_quantity: 1000, on_hand: 400, shortfall: 600, icon_url: 'i' }],
          meta: { warning: 'No director character found' },
        },
      ],
    ])
    expect(screen.getByRole('alert')).toHaveTextContent('No director character found')
    expect(screen.getByText('600')).toHaveClass('text-loss')
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Desired quantity of Tritanium'), { target: { value: '1200' } })
    expect(save).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Desired quantity of Tritanium'), { target: { value: '-3' } })
    expect(save).toBeDisabled()
  })

  it('keeps Add disabled until an item is chosen', () => {
    renderWithData(<StockManager />, [[['stock'], { data: [], meta: { warning: null } }]])
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByText(/No items in your stock watchlist yet/)).toBeInTheDocument()
  })
})
