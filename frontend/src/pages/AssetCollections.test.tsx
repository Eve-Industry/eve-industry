import { screen } from '@testing-library/react'
import { renderWithData } from '../test/render'
import AssetAbyssal, { scoreTier } from './AssetAbyssal'
import AssetMaterials from './AssetMaterials'
import AssetShips from './AssetShips'

const meta = { last_updated: '2026-10-23T12:00:00+00:00' }

describe('AssetMaterials', () => {
  it('shows groups with prices and flags unpriced stacks', () => {
    renderWithData(<AssetMaterials />, [
      [
        ['assets', 'materials'],
        {
          data: {
            grand_total: 7500,
            groups: [
              {
                name: 'Minerals',
                total: 7500,
                items: [
                  { type_id: 34, type_name: 'Tritanium', quantity: 1500, unit_price: 5, total_value: 7500 },
                  { type_id: 35, type_name: 'Pyerite', quantity: 7, unit_price: 0, total_value: 0 },
                ],
              },
            ],
          },
          meta: { ...meta, corporation_assets_warning: 'No main character is set.' },
        },
      ],
    ])

    expect(screen.getByRole('heading', { name: /Minerals/ })).toBeInTheDocument()
    expect(screen.getByText('1,500')).toBeInTheDocument()
    expect(screen.getByText('no price')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Corporation assets unavailable: No main character is set.')
  })

  it('explains an empty list', () => {
    renderWithData(<AssetMaterials />, [
      [['assets', 'materials'], { data: { grand_total: 0, groups: [] }, meta: { last_updated: null, corporation_assets_warning: null } }],
    ])

    expect(screen.getByText(/No materials found/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Never updated')
  })
})

describe('AssetShips', () => {
  it('lists ship groups with their ships', () => {
    renderWithData(<AssetShips />, [
      [
        ['assets', 'ships'],
        {
          data: {
            total_ships: 2,
            type_count: 1,
            ship_groups: [
              {
                group_name: 'Frigate',
                count: 2,
                ships: [
                  { item_id: 1, type_id: 587, type_name: 'Rifter', name: 'My Rifter', location_name: 'Jita IV', character_id: 1, character_name: 'Ana' },
                  { item_id: 2, type_id: 587, type_name: 'Rifter', name: null, location_name: 'Amarr VIII', character_id: 1, character_name: 'Ana' },
                ],
              },
            ],
          },
          meta,
        },
      ],
    ])

    expect(screen.getByText('Frigate')).toBeInTheDocument()
    expect(screen.getByText('My Rifter')).toBeInTheDocument()
    expect(screen.getAllByText('Rifter')).toHaveLength(2)
  })
})

describe('AssetAbyssal', () => {
  it('ranks items and colours changes', () => {
    renderWithData(<AssetAbyssal />, [
      [
        ['assets', 'abyssal'],
        {
          data: [
            {
              source_type_id: 3841,
              source_type_name: 'Small Shield Booster II',
              items: [
                {
                  item_id: 11,
                  type_id: 47000,
                  type_name: 'Unstable Small Shield Booster',
                  character_id: 1,
                  character_name: 'Ana',
                  location_name: 'Jita IV',
                  container_name: 'Fits',
                  mutator_type_id: 47700,
                  score: 12.3,
                  attributes: [{ name: 'Activation time', value: '3.50s', change: '-0.50s', pct_change: -12.5, is_good: true }],
                },
                {
                  item_id: 12,
                  type_id: 47000,
                  type_name: 'Unstable Small Shield Booster',
                  character_id: 1,
                  character_name: 'Ana',
                  location_name: 'Jita IV',
                  container_name: null,
                  mutator_type_id: null,
                  score: -4,
                  attributes: [],
                },
              ],
            },
          ],
          meta,
        },
      ],
    ])

    expect(screen.getByText('Small Shield Booster II Mutaplasmid')).toBeInTheDocument()
    expect(screen.getByText('-0.50s')).toHaveClass('text-profit')
    expect(screen.getByText('+12.3')).toHaveClass('score-best')
    expect(screen.getByText('-4')).toHaveClass('score-bad')
    expect(screen.getByText('Jita IV · Fits')).toBeInTheDocument()
    expect(screen.getByText('No attribute changes detected.')).toBeInTheDocument()
  })

  it('tiers scores', () => {
    expect([scoreTier(10.1), scoreTier(10), scoreTier(0), scoreTier(-0.1)]).toEqual(['best', 'good', 'good', 'bad'])
  })
})
