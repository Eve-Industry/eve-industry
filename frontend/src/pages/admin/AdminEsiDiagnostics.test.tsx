import { fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ApiError } from '../../api/client'
import { renderWithData } from '../../test/render'
import AdminEsiDiagnostics from './AdminEsiDiagnostics'

const hooks = vi.hoisted(() => ({
  summary: vi.fn(),
  trends: vi.fn(),
  endpoints: vi.fn(),
  batches: vi.fn(),
  health: vi.fn(),
  events: vi.fn(),
}))

vi.mock('../../api/admin', async (original) => ({
  ...(await original<typeof import('../../api/admin')>()),
  useEsiDiagnosticsSummary: hooks.summary,
  useEsiDiagnosticsTrends: hooks.trends,
  useEsiDiagnosticsEndpoints: hooks.endpoints,
  useEsiDiagnosticsBatches: hooks.batches,
  useEsiDiagnosticsHealth: hooks.health,
  useEsiDiagnosticsEvents: hooks.events,
}))

const ok = (data: unknown) => ({ isPending: false, isError: false, data: { data, meta: {} } })

const summary = {
  from: '2026-10-24T00:00:00Z', to: '2026-10-25T00:00:00Z', upstream_requests: 1000, errors: 50, error_percent: 5,
  status_401: 1, status_403: 4, status_404: 40, throttled_420: 2, throttled_429: 3, other_errors: 0, connection_failures: 0,
  local_deferrals: 700, cache_hits: 9000, cache_misses: 10, cache_revalidations: 5, protection_episodes: 2, observed_pause_seconds: 90,
  min_legacy_remaining: 18, releases: [{ release: 'abc123', first_seen: '2026-10-24T12:00:00Z' }],
}

const health = (over: Record<string, unknown> = {}) => ok({
  enabled: true, healthy: true, problems: [], last_flushed_at: '2026-10-25 00:00:00', seconds_since_flush: 12, backlog: 3,
  oldest_event_age_seconds: 4, dropped_events: 0, gap_count: 0, last_gap_at: null, last_gap_reason: null, expired_rows: 0, ...over,
})

function setup(over: { health?: unknown; summary?: unknown } = {}) {
  hooks.summary.mockReturnValue(over.summary ?? ok(summary))
  hooks.trends.mockReturnValue(ok({
    granularity: 'hour',
    buckets: [{ at: '2026-10-24T10:00:00Z', requests: 500, errors: 30, status_401: 1, status_403: 4, status_404: 20, throttled_420: 2, throttled_429: 3, local_deferrals: 5, cache_hits: 50 }],
    legacy_budget: [{ at: '2026-10-24T10:00:00Z', remaining_min: 18, protection_episodes: 2 }, { at: '2026-10-24T11:00:00Z', remaining_min: null, protection_episodes: 0 }],
    token_groups: [{ group: 'char-asset', points: [{ at: '2026-10-24T10:00:00Z', remaining_min: 120, used: 5 }] }],
  }))
  hooks.endpoints.mockReturnValue(ok({
    total_requests: 1000, total_errors: 50,
    operations: [{ operation: 'get /characters/{character_id}/assets', requests: 400, errors: 40, errors_per_1000: 100 }],
    reasons: [{ operation: 'get /characters/{character_id}/assets', http_status: 404, reason: 'not_found', dataset: 'assets', errors: 40, share_of_errors: 80, errors_per_1000_requests: 40 }],
  }))
  hooks.batches.mockReturnValue(ok([{ fingerprint: 'f'.repeat(64), operation: 'post /characters/{character_id}/assets/names', dataset: 'asset_names', reason: 'invalid_id_batch', occurrences: 12, characters: 2, batch_size: 300, first_seen: '2026-10-24T01:00:00Z', last_seen: '2026-10-24T20:00:00Z', character_id: 7 }]))
  hooks.health.mockReturnValue(over.health ?? health())
  hooks.events.mockReturnValue({
    isError: false, hasNextPage: true, isFetchingNextPage: false, fetchNextPage: vi.fn(),
    data: { pages: [{ data: [{ id: 9, occurred_at: '2026-10-24T20:00:00Z', kind: 'http_attempt', operation: 'get /x', http_status: 404, reason: 'not_found', dataset: 'assets', job_class: 'App\\Jobs\\RefreshAssetData', character_id: 7, character_name: 'Pilot Seven', user_id: 3, corporation_id: null, batch_fingerprint: null, batch_size: null, legacy_remaining: 90, release: 'abc123' }], meta: { next_cursor: 9 } }] },
  })
}

describe('AdminEsiDiagnostics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows counts, rates, tables and links failures to the admin user context', () => {
    setup()
    renderWithData(<AdminEsiDiagnostics />)
    expect(screen.getByRole('heading', { name: 'ESI diagnostics' })).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
    expect(screen.getByText('(5%)')).toBeInTheDocument()
    expect(screen.getByText('1 / 4 / 40')).toBeInTheDocument()
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'get /characters/{character_id}/assets' })).toBeInTheDocument()
    expect(screen.getAllByText('not_found').length).toBeGreaterThan(0)
    expect(screen.getByText(/recurring batch of IDs, not which item/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pilot Seven' })).toHaveAttribute('href', '/admin/users?search=Pilot%20Seven')
    expect(screen.getByRole('button', { name: 'Load older failures' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Errors per hour by status/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Legacy error budget.*lowest observed 18/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Token group char-asset/ })).toBeInTheDocument()
    expect(screen.getByText(/not proof the upstream count reached zero/)).toBeInTheDocument()
    expect(screen.queryByText(/Data may be incomplete/)).not.toBeInTheDocument()
  })

  it('marks a quiet chart as incomplete when the collector is unhealthy', () => {
    setup({ health: health({ healthy: false, problems: ['collector_stale'], last_flushed_at: null, seconds_since_flush: null }), summary: ok({ ...summary, upstream_requests: 0, errors: 0, error_percent: null }) })
    renderWithData(<AdminEsiDiagnostics />)
    expect(screen.getByRole('alert')).toHaveTextContent('Data may be incomplete')
    expect(screen.getByRole('alert')).toHaveTextContent('collector has not flushed')
  })

  it('says capture is off rather than implying zero failures', () => {
    setup({ health: health({ enabled: false, healthy: false, problems: ['collector_stale'] }) })
    renderWithData(<AdminEsiDiagnostics />)
    expect(screen.getByRole('heading', { name: /capture is off/ })).toBeInTheDocument()
  })

  it('applies a clicked operation as a filter on every report', () => {
    setup()
    renderWithData(<AdminEsiDiagnostics />)
    fireEvent.click(screen.getByRole('button', { name: 'get /characters/{character_id}/assets' }))
    expect(hooks.summary).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'get /characters/{character_id}/assets' }))
    expect(hooks.events).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'get /characters/{character_id}/assets' }))
  })

  it('shows the denial page for a 403', () => {
    setup({ summary: { isPending: false, isError: true, error: new ApiError(403, { message: 'nope' }), data: undefined } })
    renderWithData(<AdminEsiDiagnostics />)
    expect(screen.getByRole('alert')).toHaveTextContent('Admin access required')
  })
})
