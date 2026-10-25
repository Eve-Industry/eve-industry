import { useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useEsiDiagnosticsBatches,
  useEsiDiagnosticsEndpoints,
  useEsiDiagnosticsEvents,
  useEsiDiagnosticsHealth,
  useEsiDiagnosticsSummary,
  useEsiDiagnosticsTrends,
  type DiagnosticsQuery,
} from '../../api/admin'
import { AdminError } from '../../components/AdminGuard'
import { BudgetChart, ErrorTrendChart, formatTime, PAUSE_THRESHOLD, type Zone } from '../../components/DiagnosticsCharts'
import { formatQty } from '../../components/format'

const RANGES: Array<{ id: string; label: string; hours: number }> = [
  { id: '1h', label: 'Last hour', hours: 1 },
  { id: '6h', label: 'Last 6 hours', hours: 6 },
  { id: '24h', label: 'Last 24 hours', hours: 24 },
  { id: '7d', label: 'Last 7 days', hours: 168 },
  { id: '14d', label: 'Last 14 days', hours: 336 },
  { id: '30d', label: 'Last 30 days', hours: 720 },
]

const DEFAULT_RANGE = { id: '24h', label: 'Last 24 hours', hours: 24 }

const REASONS = [
  'missing_scope', 'missing_role', 'corporation_mismatch', 'credential', 'forbidden', 'not_found', 'invalid_id_batch',
  'throttled_420', 'throttled_429', 'upstream_failure', 'client_error', 'connection', 'unknown',
] as const

const FILTERS = ['operation', 'dataset', 'status', 'reason', 'group', 'character_id', 'corporation_id'] as const
type FilterKey = (typeof FILTERS)[number]

const PROBLEMS: Record<string, string> = {
  collector_stale: 'The collector has not flushed recently.',
  buffer_unreachable: 'The Redis buffer cannot be reached.',
  buffer_near_cap: 'The buffer is close to its entry cap; new events may be evicted.',
  uncounted_loss: 'Events were lost while the buffer was unreachable and could not be counted.',
}

function Rate({ value }: { value: number | null }) {
  return value === null ? <span className="muted">—</span> : <>{value}</>
}

function HealthPanel() {
  const health = useEsiDiagnosticsHealth()
  if (health.isPending) return <p>Checking capture health…</p>
  if (health.isError) return <AdminError error={health.error} what="the capture health" />
  const h = health.data.data
  const incomplete = !h.enabled || !h.healthy || h.gap_count > 0
  return (
    <section className={`panel${incomplete ? ' warn' : ''}`} aria-label="Capture health">
      <h2>Capture health: {!h.enabled ? 'capture is off' : h.healthy ? 'healthy' : 'unhealthy'}</h2>
      {incomplete ? (
        <p role="alert">
          <strong>Data may be incomplete.</strong> A quiet chart does not mean ESI had no failures while capture was off, stalled or lossy.
          {h.problems.map((p) => ` ${PROBLEMS[p] ?? p}`).join('')}
        </p>
      ) : null}
      <dl className="stats">
        <div className="panel"><dt className="muted">Last ingestion</dt><dd className="small">{h.last_flushed_at ? `${h.seconds_since_flush ?? '?'} s ago` : 'never'}</dd></div>
        <div className="panel"><dt className="muted">Backlog</dt><dd>{h.backlog === null ? '?' : formatQty(h.backlog)}</dd></div>
        <div className="panel"><dt className="muted">Oldest event</dt><dd>{h.oldest_event_age_seconds === null ? '?' : `${h.oldest_event_age_seconds} s`}</dd></div>
        <div className="panel"><dt className="muted">Lost before SQL</dt><dd>{formatQty(h.dropped_events)}</dd></div>
        <div className="panel"><dt className="muted">Collection gaps</dt><dd>{h.gap_count}</dd></div>
        <div className="panel"><dt className="muted">Expired by retention</dt><dd>{formatQty(h.expired_rows)}</dd></div>
      </dl>
      {h.last_gap_at ? <p className="muted small">Last gap: {h.last_gap_reason ?? 'unknown'} at {h.last_gap_at}.</p> : null}
    </section>
  )
}

export default function AdminEsiDiagnostics() {
  const [params, setParams] = useSearchParams()
  const [tick, setTick] = useState(0)
  const range = RANGES.find((r) => r.id === params.get('range')) ?? DEFAULT_RANGE
  const zone: Zone = params.get('tz') === 'local' ? 'local' : 'utc'
  const active = Object.fromEntries(FILTERS.flatMap((k) => (params.get(k) ? [[k, params.get(k) as string]] : []))) as Partial<Record<FilterKey, string>>
  const [draft, setDraft] = useState<Partial<Record<FilterKey, string>>>(active)

  const query = useMemo<DiagnosticsQuery>(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    const q: DiagnosticsQuery = { from: new Date(now.getTime() - range.hours * 3_600_000).toISOString(), to: now.toISOString() }
    if (active.operation) q.operation = active.operation
    if (active.dataset) q.dataset = active.dataset
    if (active.status) q.status = Number(active.status)
    if (active.reason) q.reason = active.reason as (typeof REASONS)[number]
    if (active.group) q.group = active.group
    if (active.character_id) q.character_id = Number(active.character_id)
    if (active.corporation_id) q.corporation_id = Number(active.corporation_id)
    return q
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.hours, params.toString(), tick])

  const summary = useEsiDiagnosticsSummary(query)
  const trends = useEsiDiagnosticsTrends(query)
  const endpoints = useEsiDiagnosticsEndpoints(query)
  const batches = useEsiDiagnosticsBatches(query)
  const events = useEsiDiagnosticsEvents(query)

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) (v ? next.set(k, v) : next.delete(k))
    setParams(next)
  }
  const applyFilters = (e: FormEvent) => {
    e.preventDefault()
    update(Object.fromEntries(FILTERS.map((k) => [k, draft[k]?.trim() || null])))
  }
  const filterBy = (key: FilterKey, value: string | number) => {
    setDraft((d) => ({ ...d, [key]: String(value) }))
    update({ [key]: String(value) })
  }

  const denied = [summary, trends, endpoints, batches].find((q) => q.isError)
  if (denied?.isError) return <AdminError error={denied.error} what="the ESI diagnostics" />

  const s = summary.data?.data
  const tr = trends.data?.data
  const ep = endpoints.data?.data
  const rangeStart = s?.from ?? query.from!
  const rangeEnd = s?.to ?? query.to!
  const eventRows = events.data?.pages.flatMap((p) => p.data) ?? []

  return (
    <>
      <div className="page-head">
        <h1>ESI diagnostics</h1>
        <div className="page-actions">
          <button type="button" className="button" onClick={() => setTick((t) => t + 1)}>Refresh</button>
        </div>
      </div>
      <p className="muted">
        Passive observations of the application's own ESI traffic. Rates use real upstream requests; cache hits and local deferrals are counted separately.
        Times are shown in {zone === 'utc' ? 'UTC' : 'your local time'}.
      </p>

      <HealthPanel />

      <form className="diag-filters" onSubmit={applyFilters} aria-label="Filters">
        <label>
          <span className="small">Time range</span>
          <select value={range.id} onChange={(e) => update({ range: e.target.value })}>
            {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </label>
        <label>
          <span className="small">Display time zone</span>
          <select value={zone} onChange={(e) => update({ tz: e.target.value === 'local' ? 'local' : null })}>
            <option value="utc">UTC</option>
            <option value="local">Local</option>
          </select>
        </label>
        <label><span className="small">Operation</span><input value={draft.operation ?? ''} onChange={(e) => setDraft({ ...draft, operation: e.target.value })} placeholder="get /characters/{character_id}/assets" /></label>
        <label><span className="small">Dataset</span><input value={draft.dataset ?? ''} onChange={(e) => setDraft({ ...draft, dataset: e.target.value })} /></label>
        <label><span className="small">HTTP status</span><input inputMode="numeric" value={draft.status ?? ''} onChange={(e) => setDraft({ ...draft, status: e.target.value })} size={5} /></label>
        <label>
          <span className="small">Reason</span>
          <select value={draft.reason ?? ''} onChange={(e) => setDraft({ ...draft, reason: e.target.value })}>
            <option value="">Any</option>
            {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label><span className="small">Rate-limit group</span><input value={draft.group ?? ''} onChange={(e) => setDraft({ ...draft, group: e.target.value })} size={12} /></label>
        <label><span className="small">Character ID</span><input inputMode="numeric" value={draft.character_id ?? ''} onChange={(e) => setDraft({ ...draft, character_id: e.target.value })} size={10} /></label>
        <label><span className="small">Corporation ID</span><input inputMode="numeric" value={draft.corporation_id ?? ''} onChange={(e) => setDraft({ ...draft, corporation_id: e.target.value })} size={10} /></label>
        <button type="submit" className="button">Apply</button>
        <button type="button" className="button" onClick={() => { setDraft({}); update(Object.fromEntries(FILTERS.map((k) => [k, null]))) }}>Clear</button>
      </form>

      {!s || !tr || !ep ? <p>Loading ESI diagnostics…</p> : (
        <>
          <dl className="stats" aria-label="Summary">
            <div className="panel"><dt className="muted">Upstream requests</dt><dd>{formatQty(s.upstream_requests)}</dd></div>
            <div className="panel"><dt className="muted">Errors</dt><dd>{formatQty(s.errors)}{s.error_percent !== null ? <span className="small muted"> ({s.error_percent}%)</span> : null}</dd></div>
            <div className="panel"><dt className="muted">401 / 403 / 404</dt><dd>{s.status_401} / {s.status_403} / {s.status_404}</dd></div>
            <div className="panel"><dt className="muted">Upstream 420 / 429</dt><dd>{s.throttled_420} / {s.throttled_429}</dd></div>
            <div className="panel"><dt className="muted">Other / no response</dt><dd>{s.other_errors + s.connection_failures}</dd></div>
            <div className="panel"><dt className="muted">Protection pauses</dt><dd>{s.protection_episodes}</dd></div>
            <div className="panel"><dt className="muted">Local deferrals</dt><dd>{formatQty(s.local_deferrals)}</dd></div>
            <div className="panel"><dt className="muted">Cache hits</dt><dd>{formatQty(s.cache_hits)}</dd></div>
            <div className="panel"><dt className="muted">Lowest legacy remaining</dt><dd>{s.min_legacy_remaining ?? '—'}</dd></div>
          </dl>
          <p className="muted small">
            A protection pause is the application's own stop at {PAUSE_THRESHOLD} remaining errors; it is not proof the upstream count reached zero.
            Observed pause time: {s.observed_pause_seconds} s (ends are inferred when the pause expires).
          </p>

          <div className="charts">
            <ErrorTrendChart buckets={tr.buckets} from={rangeStart} to={rangeEnd} releases={s.releases} zone={zone} />
            <BudgetChart title="Legacy error budget (lowest remaining)" points={tr.legacy_budget} from={rangeStart} to={rangeEnd} zone={zone} threshold={PAUSE_THRESHOLD} />
            {tr.token_groups.map((g) => (
              <BudgetChart key={g.group} title={`Token group ${g.group} (lowest remaining)`} points={g.points} from={rangeStart} to={rangeEnd} zone={zone} />
            ))}
          </div>
          {s.releases.length > 0 ? (
            <p className="muted small">Releases first seen on a failure: {s.releases.map((r) => `${r.release} (${formatTime(r.first_seen, zone)})`).join(', ')}.</p>
          ) : null}

          <div className="page-head"><h2>Top endpoints</h2></div>
          <div className="table-wrap panel">
            <table>
              <thead><tr><th>Operation</th><th className="num">Requests</th><th className="num">Errors</th><th className="num">Errors / 1,000</th></tr></thead>
              <tbody>
                {ep.operations.length === 0 ? <tr><td colSpan={4} className="muted">No upstream requests recorded in this range.</td></tr> : null}
                {ep.operations.map((o) => (
                  <tr key={o.operation}>
                    <td><button type="button" className="link-button mono" onClick={() => filterBy('operation', o.operation)}>{o.operation}</button></td>
                    <td className="num">{formatQty(o.requests)}</td>
                    <td className="num">{formatQty(o.errors)}</td>
                    <td className="num"><Rate value={o.errors_per_1000} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="page-head"><h2>Top error reasons</h2></div>
          <div className="table-wrap panel">
            <table>
              <thead><tr><th>Operation</th><th>Status</th><th>Reason</th><th>Dataset</th><th className="num">Errors</th><th className="num">Share</th><th className="num">Per 1,000 requests</th></tr></thead>
              <tbody>
                {ep.reasons.length === 0 ? <tr><td colSpan={7} className="muted">No errors recorded in this range.</td></tr> : null}
                {ep.reasons.map((r) => (
                  <tr key={`${r.operation}|${r.http_status}|${r.reason}|${r.dataset}`}>
                    <td className="mono">{r.operation}</td>
                    <td>{r.http_status ?? 'no response'}</td>
                    <td><button type="button" className="link-button" onClick={() => filterBy('reason', r.reason)}>{r.reason}</button></td>
                    <td>{r.dataset ?? <span className="muted">—</span>}</td>
                    <td className="num">{formatQty(r.errors)}</td>
                    <td className="num">{r.share_of_errors === null ? '—' : `${r.share_of_errors}%`}</td>
                    <td className="num"><Rate value={r.errors_per_1000_requests} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="page-head"><h2>Repeated batches</h2></div>
      <p className="muted small">A repeated fingerprint identifies a recurring batch of IDs, not which item in it is invalid.</p>
      <div className="table-wrap panel">
        <table>
          <thead><tr><th>Operation</th><th>Reason</th><th className="num">Times</th><th className="num">Characters</th><th className="num">Batch size</th><th>First seen</th><th>Last seen</th><th>Fingerprint</th></tr></thead>
          <tbody>
            {batches.data && batches.data.data.length === 0 ? <tr><td colSpan={8} className="muted">No repeated batches in this range.</td></tr> : null}
            {batches.data?.data.map((b) => (
              <tr key={`${b.fingerprint}|${b.operation}|${b.reason}`}>
                <td className="mono">{b.operation}</td>
                <td>{b.reason}</td>
                <td className="num">{b.occurrences}</td>
                <td className="num">{b.characters}</td>
                <td className="num">{b.batch_size ?? '—'}</td>
                <td>{formatTime(b.first_seen, zone)}</td>
                <td>{formatTime(b.last_seen, zone)}</td>
                <td className="mono">{b.fingerprint.slice(0, 12)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="page-head"><h2>Recent failures</h2></div>
      {events.isError ? <AdminError error={events.error} what="the failure detail" /> : null}
      <div className="table-wrap panel">
        <table>
          <thead><tr><th>Time</th><th>Result</th><th>Operation</th><th>Dataset / job</th><th>Subject</th><th>Batch</th><th>Legacy left</th><th>Release</th></tr></thead>
          <tbody>
            {events.data && eventRows.length === 0 ? <tr><td colSpan={8} className="muted">No stored failures match these filters.</td></tr> : null}
            {eventRows.map((e) => (
              <tr key={e.id}>
                <td>{formatTime(e.occurred_at, zone)}</td>
                <td>{e.kind === 'circuit_opened' ? 'protection pause opened' : e.kind === 'circuit_closed' ? 'pause ended (inferred)' : <>{e.http_status ?? 'no response'} {e.reason}</>}</td>
                <td className="mono">{e.operation ?? '—'}</td>
                <td>{e.dataset ?? '—'}{e.job_class ? <span className="muted small"> {e.job_class.split('\\').pop()}</span> : null}</td>
                <td>
                  {e.character_id ? (
                    e.character_name ? <Link to={`/admin/users?search=${encodeURIComponent(e.character_name)}`}>{e.character_name}</Link> : <span title="Character no longer exists">#{e.character_id}</span>
                  ) : '—'}
                  {e.corporation_id ? <span className="muted small"> corp {e.corporation_id}</span> : null}
                </td>
                <td className="mono">{e.batch_fingerprint ? `${e.batch_fingerprint.slice(0, 8)}${e.batch_size ? ` ×${e.batch_size}` : ''}` : '—'}</td>
                <td className="num">{e.legacy_remaining ?? '—'}</td>
                <td className="mono">{e.release ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {events.hasNextPage ? (
        <p><button type="button" className="button" disabled={events.isFetchingNextPage} onClick={() => events.fetchNextPage()}>{events.isFetchingNextPage ? 'Loading…' : 'Load older failures'}</button></p>
      ) : null}
    </>
  )
}
