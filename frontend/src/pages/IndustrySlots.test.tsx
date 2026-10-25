import { fireEvent, screen } from '@testing-library/react'
import { me, renderWithData } from '../test/render'
import IndustrySlots, { readyLabel } from './IndustrySlots'

const job = {
  job_id: 7,
  activity_id: 1,
  activity_name: 'Manufacturing',
  blueprint_type_id: 688,
  product_type_id: 587,
  item_name: 'Rifter',
  item_image_url: null,
  runs: 10,
  licensed_runs: 10,
  start_date: '2026-10-21T10:00:00+00:00',
  end_date: '2026-10-21T14:00:00+00:00',
  progress_pct: 50,
  time_remaining: '2h 0m',
  seconds_remaining: 7200,
  ready_for_delivery: false,
  status: 'active',
  probability_pct: null,
  probability_label: null,
}
const group = (total: number, active: number, jobs = [] as (typeof job)[]) => ({ total, active, available: total - active, jobs })
const skills = {
  mass_production: 4,
  adv_mass_production: 1,
  laboratory_operation: 0,
  adv_laboratory_operation: 0,
  mass_reactions: 0,
  adv_mass_reactions: 0,
}

const availability = {
  data: {
    characters: [
      {
        character_id: 1,
        character_name: 'Ana',
        portrait_url: null,
        corporation_name: 'Test Corp',
        manufacturing: group(6, 1, [job]),
        research: group(1, 0),
        reactions: group(1, 0),
        completing_soon: [],
        skills,
      },
    ],
    totals: {
      manufacturing: { total: 6, active: 1, available: 5 },
      research: { total: 1, active: 0, available: 1 },
      reactions: { total: 1, active: 0, available: 1 },
    },
    ready_for_collection: [
      {
        job_id: 9,
        character_id: 1,
        character_name: 'Ana',
        activity_id: 8,
        activity_name: 'Invention',
        item_name: 'Hound',
        item_image_url: null,
        end_date: '2026-10-21T11:59:00+00:00',
        location: 'Jita IV - Moon 4',
        runs: 1,
        probability_pct: 41.5,
        probability_label: '41% Chance',
      },
    ],
  },
  meta: { cached_until: '2026-10-21T12:20:00+00:00' },
}

const ALL_SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-industry.read_character_jobs.v1',
  'esi-industry.read_corporation_jobs.v1',
]

describe('IndustrySlots', () => {
  it('shows totals, per-character meters and ready jobs', () => {
    renderWithData(<IndustrySlots />, [
      [['industry', 'availability'], availability],
      [['me'], me(ALL_SCOPES)],
    ])
    expect(screen.getByText('5 / 6', { selector: 'dd' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Manufacturing slots in use' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('Ready for collection')).toBeInTheDocument()
    expect(screen.getByText('Hound')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lists running jobs and skills under the character', () => {
    renderWithData(<IndustrySlots />, [[['industry', 'availability'], availability]])
    fireEvent.click(screen.getByText('Skills and jobs'))
    expect(screen.getByText('Rifter')).toBeInTheDocument()
    expect(screen.getByText('2h 0m left')).toBeInTheDocument()
    expect(screen.getByText(/Mass Production 4 \/ Advanced 1/)).toBeInTheDocument()
  })

  it('warns when no character has a needed scope', () => {
    renderWithData(<IndustrySlots />, [
      [['industry', 'availability'], availability],
      [['me'], me(['esi-skills.read_skills.v1'])],
    ])
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('esi-industry.read_character_jobs.v1')
    expect(alert).not.toHaveTextContent('esi-skills.read_skills.v1')
  })
})

describe('readyLabel', () => {
  const now = new Date('2026-10-21T12:00:00Z')
  it('says how long a job has been ready', () => {
    expect(readyLabel('2026-10-21T11:45:00+00:00', now)).toBe('Ready 15 min ago')
  })
  it('says under a minute for jobs about to finish', () => {
    expect(readyLabel('2026-10-21T12:00:40+00:00', now)).toBe('In under a minute')
  })
})
