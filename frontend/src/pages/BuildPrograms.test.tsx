import { fireEvent, screen } from '@testing-library/react'
import { renderWithData } from '../test/render'
import { multibuyText } from './BuildProgram'
import BuildPrograms, { progressTone } from './BuildPrograms'

const program = (id: number, name: string, attrs: object = {}) => ({
  id,
  name,
  program_type: 'manufacturing',
  t2_type_id: 11,
  t2_type_name: 'Thing',
  step_count: 3,
  location_ids: [] as number[],
  updated_at: '2026-10-23T11:00:00+00:00',
  ...attrs,
})

const progress = (pct: number) => ({ data: { overall_progress: pct, character_names: ['Ana'], steps: [], required_blueprints: [], base_materials: [], fuel_blocks: [], reactions_summary: [], sections: [] }, meta: {} })

describe('progressTone', () => {
  it('is done at 100, mid from 50 and low below', () => {
    expect([progressTone(100), progressTone(50), progressTone(49.9)]).toEqual(['done', 'mid', 'low'])
  })
})

describe('multibuyText', () => {
  const items = [
    { name: 'Tritanium', quantity: 500, available: 100 },
    { name: 'Pyerite', quantity: 200, available: 200 },
  ]
  it('lists everything for Buy all', () => {
    expect(multibuyText(items, false)).toBe('Tritanium 500\nPyerite 200')
  })
  it('lists only the shortfall for Buy missing', () => {
    expect(multibuyText(items, true)).toBe('Tritanium 400')
  })
})

describe('BuildPrograms', () => {
  const list = { data: [program(1, 'Rifters'), program(2, 'Moon goo', { program_type: 'reaction', location_ids: [60003760] })], meta: {} }

  it('lists programs with their progress and a filtered badge', () => {
    renderWithData(<BuildPrograms />, [
      [['build-programs'], list],
      [['build-programs', 1, 'progress', []], progress(100)],
      [['build-programs', 2, 'progress', [60003760]], progress(40)],
    ])
    expect(screen.getByRole('link', { name: 'Rifters' })).toHaveAttribute('href', '/build-programs/1')
    expect(screen.getByRole('progressbar', { name: 'Rifters progress' })).toHaveAttribute('aria-valuenow', '100')
    expect(screen.getByText('40% complete · filtered')).toBeInTheDocument()
    expect(screen.getByText('Filtered by location')).toBeInTheDocument()
  })

  it('needs two selected programs to merge', () => {
    renderWithData(<BuildPrograms />, [
      [['build-programs'], list],
      [['build-programs', 1, 'progress', []], progress(10)],
      [['build-programs', 2, 'progress', [60003760]], progress(10)],
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }))
    const merge = screen.getByRole('button', { name: 'Merge selected' })
    expect(merge).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Select Rifters to merge'))
    expect(merge).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Select Moon goo to merge'))
    expect(merge).toBeEnabled()
  })

  it('invites you to create a program when there are none', () => {
    renderWithData(<BuildPrograms />, [[['build-programs'], { data: [], meta: {} }]])
    expect(screen.getByText('No build programs yet')).toBeInTheDocument()
  })
})
